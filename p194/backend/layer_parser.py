from typing import Optional
from io import BytesIO
from scapy.layers.inet import IP, UDP
from scapy.layers.l2 import Ether
from scapy.packet import Packet, Raw
from scapy.utils import wrpcap
from vxlan_gpe import VXLAN_GPE, NSH, NSH_Context_Header


ETHER_TYPE_TO_NEXT_PROTO = {
    0x0800: 1,    # IPv4 → Next Protocol = 1 (IPv4)
    0x86DD: 2,    # IPv6 → Next Protocol = 2 (IPv6)
    0x894F: 4,    # NSH → Next Protocol = 4 (NSH)
}


def infer_next_protocol_from_ether_type(ether_type: int) -> int:
    return ETHER_TYPE_TO_NEXT_PROTO.get(ether_type, 3)


def _nsh_expanded_fields(pkt: Packet) -> list[dict]:
    return [
        {"name": "ver", "value": str(pkt.ver), "bits": 2, "hex": ""},
        {"name": "oam", "value": str(pkt.oam), "bits": 1, "hex": ""},
        {"name": "unused1", "value": "0", "bits": 6, "hex": ""},
        {"name": "md_type", "value": str(pkt.md_type), "bits": 8, "hex": ""},
        {"name": "next_protocol", "value": str(pkt.next_protocol), "bits": 8, "hex": ""},
        {"name": "length", "value": str(pkt.length), "bits": 6, "hex": ""},
        {"name": "reserved", "value": "0", "bits": 2, "hex": ""},
        {"name": "spi", "value": "0x%x" % pkt.spi, "bits": 24, "hex": ""},
        {"name": "si", "value": str(pkt.si), "bits": 8, "hex": ""},
    ]


def parse_layer_fields(pkt: Packet) -> list[dict]:
    if isinstance(pkt, NSH):
        return _nsh_expanded_fields(pkt)
    fields = []
    for f in pkt.fields_desc:
        name = f.name
        value = getattr(pkt, name)
        if value is None:
            display = "(auto)"
        elif isinstance(value, int):
            display = f"0x{value:x}" if value > 9 else str(value)
        elif isinstance(value, bytes):
            display = value.hex()
        else:
            display = str(value)
        bits = f.size * 8 if hasattr(f, "size") and f.size else 0
        if bits == 0:
            try:
                bits = f.i2len(pkt, value) * 8
            except Exception:
                bits = 0
        fields.append({
            "name": name,
            "value": display,
            "bits": bits,
            "hex": "",
        })
    return fields


def _layer_header_size(pkt: Packet) -> int:
    if pkt.payload is None or isinstance(pkt.payload, Raw) and len(pkt.payload) == 0:
        return len(bytes(pkt))
    payload_bytes = bytes(pkt.payload)
    full_bytes = bytes(pkt)
    return len(full_bytes) - len(payload_bytes)


def _collect_layers(pkt: Packet, offset_start: int = 0) -> list[dict]:
    LAYER_DISPLAY_NAMES = {
        "Ether": "Ethernet",
        "NSH_Context": "NSH_Context_Header",
    }

    layers = []
    offset = offset_start
    current = pkt
    ether_count = 0

    while current is not None and not isinstance(current, Raw):
        layer_name = current.__class__.__name__
        if layer_name == "Ether":
            ether_count += 1
            layer_name = "Inner_Ethernet" if ether_count > 1 else "Ethernet"
        if layer_name in LAYER_DISPLAY_NAMES:
            layer_name = LAYER_DISPLAY_NAMES[layer_name]
        hdr_size = _layer_header_size(current)
        full_raw = bytes(current)
        hdr_hex = full_raw[:hdr_size].hex()
        fields = parse_layer_fields(current)
        layers.append({
            "name": layer_name,
            "fields": fields,
            "raw_hex": hdr_hex,
            "offset": offset,
        })
        offset += hdr_size
        current = current.payload if current.payload else None

    if current is not None and isinstance(current, Raw):
        raw_data = bytes(current)
        layers.append({
            "name": "Payload",
            "fields": [],
            "raw_hex": raw_data.hex(),
            "offset": offset,
        })

    return layers


def build_encapsulated_frame(
    eth_dst: str,
    eth_src: str,
    eth_type: int,
    payload_hex: str,
    outer_ip_src: str,
    outer_ip_dst: str,
    vni: int,
    next_protocol: int = 0,
    udp_src_port: int = 0,
    udp_dst_port: int = 4790,
    nsh: Optional[dict] = None,
) -> tuple[Packet, list[dict]]:
    payload_bytes = bytes.fromhex(payload_hex)

    if next_protocol == 0:
        next_protocol = infer_next_protocol_from_ether_type(eth_type)

    if next_protocol == 4:
        inner_payload = Ether(dst=eth_dst, src=eth_src, type=eth_type) / Raw(load=payload_bytes)
    else:
        inner_payload = Ether(dst=eth_dst, src=eth_src, type=eth_type) / Raw(load=payload_bytes)

    if udp_src_port == 0:
        import random
        udp_src_port = random.randint(49152, 65535)

    outer_ip = IP(src=outer_ip_src, dst=outer_ip_dst)
    outer_udp = UDP(sport=udp_src_port, dport=udp_dst_port)
    vxlan_gpe = VXLAN_GPE(flags=0x0c, next_protocol=next_protocol, vni=vni)

    if next_protocol == 4:
        nsh_spi = nsh.get("spi", 256) if nsh else 256
        nsh_si = nsh.get("si", 255) if nsh else 255
        nsh_md_type = nsh.get("md_type", 1) if nsh else 1
        nsh_next_proto = nsh.get("next_protocol", 3) if nsh else 3
        nsh_oam = nsh.get("oam", 0) if nsh else 0
        nsh_ver = nsh.get("ver", 0) if nsh else 0

        nsh_pkt = NSH(
            ver=nsh_ver,
            oam=nsh_oam,
            md_type=nsh_md_type,
            next_protocol=nsh_next_proto,
            spi=nsh_spi,
            si=nsh_si,
        )

        if nsh_md_type == 1:
            ctx = NSH_Context_Header(
                context_platform=nsh.get("context_platform", 0) if nsh else 0,
                context_shared=nsh.get("context_shared", 0) if nsh else 0,
                context_service_index=nsh.get("context_service_index", 0) if nsh else 0,
                context_reserved=nsh.get("context_reserved", 0) if nsh else 0,
            )
            encap_pkt = (Ether(dst="00:00:00:00:00:00", src="00:00:00:00:00:00", type=0x0800)
                         / outer_ip / outer_udp / vxlan_gpe / nsh_pkt / ctx / inner_payload)
        else:
            encap_pkt = (Ether(dst="00:00:00:00:00:00", src="00:00:00:00:00:00", type=0x0800)
                         / outer_ip / outer_udp / vxlan_gpe / nsh_pkt / inner_payload)
    else:
        encap_pkt = (Ether(dst="00:00:00:00:00:00", src="00:00:00:00:00:00", type=0x0800)
                     / outer_ip / outer_udp / vxlan_gpe / inner_payload)

    encap_pkt[UDP].chksum = 0

    layers = _collect_layers(encap_pkt)

    return encap_pkt, layers


def export_pcap(pkt: Packet) -> bytes:
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".pcap", delete=True) as tmp:
        wrpcap(tmp.name, [pkt])
        with open(tmp.name, "rb") as f:
            return f.read()


def decapsulate_frame(raw_hex: str) -> tuple:
    raw_bytes = bytes.fromhex(raw_hex)
    pkt = Ether(raw_bytes)

    layers = _collect_layers(pkt)

    inner_eth = None
    nsh_info = None
    if VXLAN_GPE in pkt:
        vxlan_layer = pkt[VXLAN_GPE]
        np = getattr(vxlan_layer, "next_protocol", 3)

        if np == 4 and NSH in pkt:
            nsh_layer = pkt[NSH]
            nsh_info = {
                "ver": nsh_layer.ver,
                "oam": nsh_layer.oam,
                "md_type": nsh_layer.md_type,
                "next_protocol": nsh_layer.next_protocol,
                "spi": nsh_layer.spi,
                "si": nsh_layer.si,
            }
            inner_data = bytes(nsh_layer.payload)
            if NSH_Context_Header in pkt:
                ctx_layer = pkt[NSH_Context_Header]
                nsh_info["context_platform"] = ctx_layer.context_platform
                nsh_info["context_shared"] = ctx_layer.context_shared
                nsh_info["context_service_index"] = ctx_layer.context_service_index
                nsh_info["context_reserved"] = ctx_layer.context_reserved
                inner_data = bytes(ctx_layer.payload)
        else:
            inner_data = bytes(vxlan_layer.payload)

        if np == 3 or np == 0 or np == 4:
            try:
                inner_pkt = Ether(inner_data)
                inner_eth = {
                    "dst": inner_pkt.dst,
                    "src": inner_pkt.src,
                    "type": hex(inner_pkt.type),
                    "payload": bytes(inner_pkt.payload).hex() if inner_pkt.payload else "",
                }
            except Exception:
                inner_eth = {
                    "dst": "?",
                    "src": "?",
                    "type": "?",
                    "payload": inner_data.hex(),
                }

    return layers, inner_eth, nsh_info
