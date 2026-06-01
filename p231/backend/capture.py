import threading
from collections import deque
from datetime import datetime, timezone

try:
    from scapy.all import sniff, Ether, get_if_list
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False

from ddp_parser import (
    parse_ddp_header,
    build_packet_entry,
    parse_rtmp_tuples,
    parse_aarp_packet,
    parse_nbp_packet,
    ETHERTYPE_APPLETALK,
    ETHERTYPE_AARP,
)


class CaptureService:
    def __init__(self):
        self._lock = threading.Lock()
        self._running = False
        self._thread = None
        self._interface = None
        self._sniff_stop_event = threading.Event()

        self.networks = {}
        self.routes = []
        self.packets = deque(maxlen=100)
        self.aarp_table = {}
        self.aarp_packets = deque(maxlen=50)
        self.nbp_table = {}
        self.nbp_packets = deque(maxlen=50)
        self.stats = {
            "total_packets": 0,
            "ddp_packets": 0,
            "rip_packets": 0,
            "aarp_packets": 0,
            "nbp_packets": 0,
        }

    @property
    def running(self):
        return self._running

    def start(self, interface):
        if self._running:
            return {"error": "Capture already running"}

        if not SCAPY_AVAILABLE:
            return {"error": "scapy is not installed"}

        available = get_if_list()
        if interface not in available:
            return {"error": f"Interface '{interface}' not found. Available: {available}"}

        with self._lock:
            self._running = True
            self._interface = interface
            self._sniff_stop_event.clear()

        self._thread = threading.Thread(target=self._capture_loop, args=(interface,), daemon=True)
        self._thread.start()
        return {"status": "started", "interface": interface}

    def stop(self):
        if not self._running:
            return {"error": "Capture not running"}

        self._sniff_stop_event.set()
        with self._lock:
            self._running = False
            iface = self._interface
            self._interface = None

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)

        return {"status": "stopped", "interface": iface}

    def get_status(self):
        with self._lock:
            return {
                "running": self._running,
                "interface": self._interface,
                "stats": dict(self.stats),
                "networks_count": len(self.networks),
                "routes_count": len(self.routes),
                "packets_count": len(self.packets),
                "aarp_count": len(self.aarp_table),
                "nbp_count": len(self.nbp_table),
            }

    def get_networks(self):
        with self._lock:
            return dict(self.networks)

    def get_routes(self):
        with self._lock:
            return list(self.routes)

    def get_packets(self):
        with self._lock:
            return list(self.packets)

    def get_aarp(self):
        with self._lock:
            return {
                "mappings": list(self.aarp_table.values()),
                "recent_packets": list(self.aarp_packets),
            }

    def get_nbp(self):
        with self._lock:
            return {
                "devices": list(self.nbp_table.values()),
                "recent_packets": list(self.nbp_packets),
            }

    def _capture_loop(self, interface):
        try:
            sniff(
                iface=interface,
                filter="ether proto 0x809b or ether proto 0x80f3",
                prn=self._process_packet,
                stop_filter=lambda _: self._sniff_stop_event.is_set(),
                store=0,
            )
        except Exception:
            pass
        finally:
            with self._lock:
                self._running = False

    def _process_packet(self, pkt):
        with self._lock:
            self.stats["total_packets"] += 1

        if not pkt.haslayer(Ether):
            return

        ether = pkt[Ether]

        if ether.type == ETHERTYPE_AARP:
            self._process_aarp(ether)
            return

        if ether.type != ETHERTYPE_APPLETALK:
            return

        raw_bytes = bytes(ether.payload)
        ddp_info = parse_ddp_header(raw_bytes)
        if ddp_info is None:
            return

        payload_offset = ddp_info["payload_offset"]
        raw_payload = raw_bytes[payload_offset:] if len(raw_bytes) > payload_offset else b""

        with self._lock:
            self.stats["ddp_packets"] += 1

            if ddp_info["protocol_type"] == 1:
                self.stats["rip_packets"] += 1
                self._process_rtmp(ddp_info, raw_payload)

            if ddp_info["protocol_type"] == 2:
                self.stats["nbp_packets"] += 1
                self._process_nbp(ddp_info, raw_payload)

            self._update_networks(ddp_info)

            packet_entry = build_packet_entry(ddp_info, raw_payload, len(raw_bytes))
            if packet_entry:
                self.packets.append(packet_entry)

    def _process_aarp(self, ether):
        raw_bytes = bytes(ether.payload)
        aarp_info = parse_aarp_packet(raw_bytes)
        if aarp_info is None:
            return

        src_mac = aarp_info.get("src_mac")
        src_atalk_addr = aarp_info.get("src_atalk_addr")
        now = datetime.now(timezone.utc).isoformat()

        with self._lock:
            self.stats["aarp_packets"] += 1

            self.aarp_packets.append({
                "timestamp": now,
                "opcode": aarp_info["opcode"],
                "opcode_name": aarp_info["opcode_name"],
                "src_mac": src_mac or "",
                "src_atalk_addr": src_atalk_addr or "",
                "dst_mac": aarp_info.get("dst_mac", ""),
                "dst_atalk_addr": aarp_info.get("dst_atalk_addr", ""),
            })

            if src_mac and src_atalk_addr:
                key = src_mac
                if key in self.aarp_table:
                    self.aarp_table[key]["atalk_addr"] = src_atalk_addr
                    self.aarp_table[key]["atalk_net"] = aarp_info.get("src_atalk_net", 0)
                    self.aarp_table[key]["atalk_node"] = aarp_info.get("src_atalk_node", 0)
                    self.aarp_table[key]["last_seen"] = now
                    self.aarp_table[key]["opcode"] = aarp_info["opcode_name"]
                else:
                    self.aarp_table[key] = {
                        "mac": src_mac,
                        "atalk_addr": src_atalk_addr,
                        "atalk_net": aarp_info.get("src_atalk_net", 0),
                        "atalk_node": aarp_info.get("src_atalk_node", 0),
                        "opcode": aarp_info["opcode_name"],
                        "first_seen": now,
                        "last_seen": now,
                    }

    def _process_nbp(self, ddp_info, raw_payload):
        nbp_info = parse_nbp_packet(raw_payload)
        if nbp_info is None:
            return

        now = datetime.now(timezone.utc).isoformat()

        self.nbp_packets.append({
            "timestamp": now,
            "function_name": nbp_info["function_name"],
            "nbp_id": nbp_info["nbp_id"],
            "src_atalk_addr": f"{ddp_info['src_net']}.{ddp_info['src_node']}",
            "entries_count": len(nbp_info["entries"]),
        })

        for entry in nbp_info["entries"]:
            atalk_addr = entry["atalk_addr"]
            if atalk_addr == "0.0":
                atalk_addr = f"{ddp_info['src_net']}.{ddp_info['src_node']}"
                entry["atalk_addr"] = atalk_addr
                entry["atalk_net"] = ddp_info["src_net"]
                entry["atalk_node"] = ddp_info["src_node"]

            key = atalk_addr
            if key in self.nbp_table:
                self.nbp_table[key]["object_name"] = entry["object_name"]
                self.nbp_table[key]["type_name"] = entry["type_name"]
                self.nbp_table[key]["zone_name"] = entry["zone_name"]
                self.nbp_table[key]["full_name"] = entry["full_name"]
                self.nbp_table[key]["device_type_cn"] = entry["device_type_cn"]
                self.nbp_table[key]["last_seen"] = now
                self.nbp_table[key]["function"] = nbp_info["function_name"]
                if entry["atalk_socket"] not in self.nbp_table[key]["sockets"]:
                    self.nbp_table[key]["sockets"].append(entry["atalk_socket"])
            else:
                self.nbp_table[key] = {
                    "atalk_addr": atalk_addr,
                    "atalk_net": entry["atalk_net"],
                    "atalk_node": entry["atalk_node"],
                    "object_name": entry["object_name"],
                    "type_name": entry["type_name"],
                    "zone_name": entry["zone_name"],
                    "full_name": entry["full_name"],
                    "device_type_cn": entry["device_type_cn"],
                    "function": nbp_info["function_name"],
                    "sockets": [entry["atalk_socket"]],
                    "first_seen": now,
                    "last_seen": now,
                }

    def _update_networks(self, ddp_info):
        src_net = ddp_info["src_net"]
        src_node = ddp_info["src_node"]
        src_socket = ddp_info["src_socket"]

        if src_net == 0:
            return

        if src_net not in self.networks:
            self.networks[src_net] = {
                "network_number": src_net,
                "nodes": {},
                "first_seen": datetime.now(timezone.utc).isoformat(),
                "last_seen": datetime.now(timezone.utc).isoformat(),
            }
        else:
            self.networks[src_net]["last_seen"] = datetime.now(timezone.utc).isoformat()

        node_key = str(src_node)
        net_nodes = self.networks[src_net]["nodes"]
        atalk_addr = f"{src_net}.{src_node}"
        device_info = self.nbp_table.get(atalk_addr)

        if node_key not in net_nodes:
            net_nodes[node_key] = {
                "node_id": src_node,
                "sockets": [],
                "first_seen": datetime.now(timezone.utc).isoformat(),
                "last_seen": datetime.now(timezone.utc).isoformat(),
            }
        else:
            net_nodes[node_key]["last_seen"] = datetime.now(timezone.utc).isoformat()

        if src_socket not in net_nodes[node_key]["sockets"]:
            net_nodes[node_key]["sockets"].append(src_socket)

        if device_info:
            net_nodes[node_key]["device_name"] = device_info["object_name"]
            net_nodes[node_key]["device_type"] = device_info["type_name"]
            net_nodes[node_key]["device_type_cn"] = device_info["device_type_cn"]
            net_nodes[node_key]["device_full_name"] = device_info["full_name"]

    def _process_rtmp(self, ddp_info, raw_payload):
        rtmp_routes = parse_rtmp_tuples(raw_payload)
        if not rtmp_routes:
            return

        now = datetime.now(timezone.utc).isoformat()
        src_net = ddp_info["src_net"]
        src_node = ddp_info["src_node"]

        for route in rtmp_routes:
            dest_net = route["network"]
            hop_count = route["hop_count"]

            existing = None
            for r in self.routes:
                if r["destination"] == dest_net:
                    existing = r
                    break

            if existing:
                existing["hop_count"] = hop_count
                existing["next_hop"] = f"{src_net}.{src_node}"
                existing["status"] = "good" if hop_count < 16 else "bad"
                existing["last_updated"] = now
            else:
                self.routes.append({
                    "destination": dest_net,
                    "next_hop": f"{src_net}.{src_node}",
                    "hop_count": hop_count,
                    "status": "good" if hop_count < 16 else "bad",
                    "last_updated": now,
                })

        self.routes.sort(key=lambda r: r["destination"])


capture_service = CaptureService()
