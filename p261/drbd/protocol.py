import struct
import json

MSG_HEARTBEAT = "heartbeat"
MSG_WRITE = "write"
MSG_WRITE_ACK = "write_ack"
MSG_BITMAP_EXCHANGE = "bitmap_exchange"
MSG_SPLIT_BRAIN_DETECT = "split_brain_detect"
MSG_SYNC_REQUEST = "sync_request"
MSG_SYNC_DATA = "sync_data"
MSG_SYNC_COMPLETE = "sync_complete"
MSG_STATE_UPDATE = "state_update"


def encode(msg):
    raw = json.dumps(msg, separators=(",", ":")).encode("utf-8")
    return struct.pack("!I", len(raw)) + raw


def decode(data):
    if len(data) < 4:
        return None, data
    length = struct.unpack("!I", data[:4])[0]
    if len(data) < 4 + length:
        return None, data
    payload = data[4 : 4 + length]
    msg = json.loads(payload.decode("utf-8"))
    return msg, data[4 + length :]


def make_message(msg_type, **kwargs):
    m = {"type": msg_type, "ts": __import__("time").time()}
    m.update(kwargs)
    return m
