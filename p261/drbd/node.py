import socket
import threading
import time
import uuid

from .bitmap import Bitmap
from .protocol import (
    encode,
    decode,
    make_message,
    MSG_HEARTBEAT,
    MSG_WRITE,
    MSG_WRITE_ACK,
    MSG_BITMAP_EXCHANGE,
    MSG_SYNC_DATA,
    MSG_SYNC_COMPLETE,
)

STATE_INIT = "INIT"
STATE_CONNECTED = "CONNECTED"
STATE_PRIMARY = "PRIMARY"
STATE_SPLIT_BRAIN = "SPLIT_BRAIN"
STATE_SYNCING = "SYNCING"
STATE_RECOVERED = "RECOVERED"
STATE_STANDALONE = "STANDALONE"


class DRBDNode:
    def __init__(self, node_id, port, priority=1, bitmap_size=256):
        self.node_id = node_id
        self.port = port
        self.priority = priority
        self.state = STATE_INIT
        self.role = "PRIMARY"
        self.bitmap = Bitmap(bitmap_size)
        self.disk = {}
        self.last_write_ts = 0.0
        self.generation = 0
        self.peer = None
        self.connected = False
        self.io_suspended = False
        self.write_cache = []

        self._server_sock = None
        self._peer_sock = None
        self._lock = threading.Lock()
        self._running = False
        self._heartbeat_thread = None
        self._recv_thread = None
        self._event_callback = None
        self._buffer = b""

    def set_event_callback(self, cb):
        self._event_callback = cb

    def _emit(self, event_type, **kwargs):
        if self._event_callback:
            self._event_callback(self.node_id, event_type, **kwargs)

    def start_server(self):
        self._running = True
        self._server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server_sock.bind(("127.0.0.1", self.port))
        self._server_sock.listen(1)
        self._server_sock.settimeout(1.0)
        self.state = STATE_STANDALONE
        self._emit("state_change", state=self.state)
        t = threading.Thread(target=self._accept_loop, daemon=True)
        t.start()

    def _accept_loop(self):
        while self._running:
            try:
                conn, addr = self._server_sock.accept()
                with self._lock:
                    if self._peer_sock:
                        self._peer_sock.close()
                    self._peer_sock = conn
                    self.connected = True
                    self.state = STATE_CONNECTED
                    self._emit("state_change", state=self.state)
                self._start_recv()
            except socket.timeout:
                continue
            except OSError:
                break

    def connect_to_peer(self, peer_port):
        with self._lock:
            if self._peer_sock:
                self._peer_sock.close()
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.connect(("127.0.0.1", peer_port))
                self._peer_sock = sock
                self.connected = True
                self.state = STATE_CONNECTED
                self._emit("state_change", state=self.state)
                self._start_recv()
                self._start_heartbeat()
                return True
            except Exception as e:
                self._emit("error", message=str(e))
                return False

    def _start_recv(self):
        if self._recv_thread and self._recv_thread.is_alive():
            return
        self._recv_thread = threading.Thread(target=self._recv_loop, daemon=True)
        self._recv_thread.start()

    def _start_heartbeat(self):
        if self._heartbeat_thread and self._heartbeat_thread.is_alive():
            return
        self._heartbeat_thread = threading.Thread(
            target=self._heartbeat_loop, daemon=True
        )
        self._heartbeat_thread.start()

    def _heartbeat_loop(self):
        while self._running and self.connected:
            self._send_msg(make_message(MSG_HEARTBEAT, node_id=self.node_id))
            time.sleep(2)

    def _recv_loop(self):
        while self._running and self.connected:
            try:
                if not self._peer_sock:
                    break
                data = self._peer_sock.recv(4096)
                if not data:
                    self._handle_disconnect()
                    break
                self._buffer += data
                while self._buffer:
                    msg, self._buffer = decode(self._buffer)
                    if msg is None:
                        break
                    self._handle_message(msg)
            except (ConnectionResetError, OSError):
                self._handle_disconnect()
                break

    def _handle_disconnect(self):
        with self._lock:
            if self._peer_sock:
                try:
                    self._peer_sock.close()
                except Exception:
                    pass
                self._peer_sock = None
            self.connected = False
            if self.state not in (STATE_SPLIT_BRAIN, STATE_SYNCING):
                self.state = STATE_STANDALONE
                self._emit("state_change", state=self.state)

    def _handle_message(self, msg):
        msg_type = msg.get("type")
        if msg_type == MSG_HEARTBEAT:
            pass
        elif msg_type == MSG_WRITE:
            block_id = msg["block_id"]
            data = msg.get("data", "")
            if self.io_suspended:
                with self._lock:
                    self.write_cache.append({
                        "block_id": block_id,
                        "data": data,
                        "from_peer": True,
                        "ts": time.time(),
                    })
                self._emit("write_cached", block_id=block_id, from_peer=True)
            else:
                with self._lock:
                    self.disk[block_id] = data
                    self.bitmap.set_bit(block_id)
                self._emit("replicated_write", block_id=block_id)
            self._send_msg(
                make_message(MSG_WRITE_ACK, node_id=self.node_id, block_id=block_id)
            )
        elif msg_type == MSG_WRITE_ACK:
            self._emit("write_acked", block_id=msg.get("block_id"))
        elif msg_type == MSG_BITMAP_EXCHANGE:
            self._emit(
                "bitmap_received",
                peer_id=msg.get("node_id"),
                bitmap=msg.get("bitmap", []),
                generation=msg.get("generation", 0),
            )
        elif msg_type == MSG_SYNC_DATA:
            blocks = msg.get("blocks", {})
            with self._lock:
                for bid, bdata in blocks.items():
                    self.disk[int(bid)] = bdata
                    self.bitmap.set_bit(int(bid))
            self._emit("sync_received", block_count=len(blocks))
        elif msg_type == MSG_SYNC_COMPLETE:
            self.state = STATE_RECOVERED
            self._emit("state_change", state=self.state)

    def _send_msg(self, msg):
        with self._lock:
            if not self._peer_sock or not self.connected:
                return False
            try:
                self._peer_sock.sendall(encode(msg))
                return True
            except (BrokenPipeError, OSError):
                self.connected = False
                return False

    def _do_apply_write(self, block_id, data, from_peer=False):
        with self._lock:
            self.disk[block_id] = data
            self.bitmap.set_bit(block_id)
            self.last_write_ts = time.time()
            self.generation += 1
        self._emit("replicated_write" if from_peer else "write", block_id=block_id, data=data)
        if not from_peer:
            self._send_msg(
                make_message(
                    MSG_WRITE,
                    node_id=self.node_id,
                    block_id=block_id,
                    data=data,
                    generation=self.generation,
                )
            )

    def write_block(self, block_id, data=None):
        if data is None:
            data = f"data_{self.node_id}_{block_id}_{uuid.uuid4().hex[:8]}"
        if self.io_suspended:
            with self._lock:
                self.write_cache.append({
                    "block_id": block_id,
                    "data": data,
                    "from_peer": False,
                    "ts": time.time(),
                })
            self._emit("write_cached", block_id=block_id, from_peer=False)
            return True
        self._do_apply_write(block_id, data, from_peer=False)
        return True

    def suspend_io(self):
        with self._lock:
            self.io_suspended = True
        self._emit("io_suspended")

    def resume_io(self):
        with self._lock:
            self.io_suspended = False
        self._emit("io_resumed")

    def replay_cache(self):
        with self._lock:
            cache_copy = list(self.write_cache)
            self.write_cache.clear()

        count = len(cache_copy)
        for entry in cache_copy:
            self._do_apply_write(entry["block_id"], entry["data"], from_peer=entry["from_peer"])

        if count > 0:
            self._emit("cache_replayed", count=count)
        return count

    def disconnect_peer(self):
        with self._lock:
            if self._peer_sock:
                try:
                    self._peer_sock.close()
                except Exception:
                    pass
                self._peer_sock = None
            self.connected = False
            self.state = STATE_STANDALONE
            self._emit("state_change", state=self.state)
            self._emit("disconnected")

    def send_bitmap(self):
        return self._send_msg(
            make_message(
                MSG_BITMAP_EXCHANGE,
                node_id=self.node_id,
                bitmap=self.bitmap.get_dirty_blocks(),
                generation=self.generation,
                last_write_ts=self.last_write_ts,
                priority=self.priority,
            )
        )

    def send_sync_data(self, block_ids):
        blocks = {}
        with self._lock:
            for bid in block_ids:
                if bid in self.disk:
                    blocks[str(bid)] = self.disk[bid]
        return self._send_msg(
            make_message(
                MSG_SYNC_DATA,
                node_id=self.node_id,
                blocks=blocks,
            )
        )

    def send_sync_complete(self):
        return self._send_msg(make_message(MSG_SYNC_COMPLETE, node_id=self.node_id))

    def get_status(self):
        with self._lock:
            return {
                "node_id": self.node_id,
                "port": self.port,
                "priority": self.priority,
                "state": self.state,
                "role": self.role,
                "connected": self.connected,
                "generation": self.generation,
                "last_write_ts": self.last_write_ts,
                "bitmap": self.bitmap.to_dict(),
                "disk_blocks": list(self.disk.keys()),
                "io_suspended": self.io_suspended,
                "write_cache_size": len(self.write_cache),
                "write_cache_blocks": [e["block_id"] for e in self.write_cache],
            }

    def stop(self):
        self._running = False
        with self._lock:
            if self._peer_sock:
                try:
                    self._peer_sock.close()
                except Exception:
                    pass
                self._peer_sock = None
            if self._server_sock:
                try:
                    self._server_sock.close()
                except Exception:
                    pass
                self._server_sock = None
        self.connected = False
