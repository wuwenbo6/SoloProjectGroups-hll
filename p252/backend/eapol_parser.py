import struct
import time
import uuid
import base64
import hashlib
from typing import Optional


EAP_CODE_NAMES = {1: "Request", 2: "Response", 3: "Success", 4: "Failure"}

EAP_TYPE_NAMES = {
    0: "None",
    1: "Identity",
    2: "Notification",
    3: "Nak",
    4: "MD5-Challenge",
    5: "One-Time Password (OTP)",
    6: "Generic Token Card (GTC)",
    9: "RSA Public Key",
    10: "DSS Public Key",
    11: "KEA",
    12: "KEA-VALIDATE",
    13: "EAP-TLS",
    14: "Defender Token (AXENT)",
    15: "RSA SecurID EAP",
    17: "EAP-IKEv2",
    18: "EAP-AKA",
    21: "EAP-TTLS",
    23: "EAP-AKA'",
    25: "PEAP",
    26: "MS-EAP-Authentication",
    29: "EAP-MSCHAPv2",
    43: "EAP-FAST",
    45: "EAP-pwd",
    52: "EAP-EKE",
}

EAPOL_TYPE_NAMES = {
    0: "EAP-Packet",
    1: "EAPOL-Start",
    2: "EAPOL-Logoff",
    3: "EAPOL-Key",
    4: "EAPOL-Encapsulated-ASF-Alert",
}

TLS_HANDSHAKE_TYPES = {
    0x01: "ClientHello",
    0x02: "ServerHello",
    0x0B: "Certificate",
    0x0C: "ServerKeyExchange",
    0x0D: "CertificateRequest",
    0x0E: "ServerHelloDone",
    0x10: "ClientKeyExchange",
    0x0F: "CertificateVerify",
    0x14: "Finished",
}

TLS_CONTENT_TYPE_HANDSHAKE = 22
TLS_HANDSHAKE_CERTIFICATE = 0x0B

ETHERTYPE_EAPOL = 0x888E

EAP_TLS_FLAG_L = 0x80
EAP_TLS_FLAG_M = 0x40
EAP_TLS_FLAG_S = 0x20

RADIUS_CODE_NAMES = {
    1: "Access-Request",
    2: "Access-Accept",
    3: "Access-Reject",
    11: "Access-Challenge",
}


class FragmentReassembler:
    def __init__(self):
        self._buffers: dict[tuple[int, int], dict] = {}

    def process(
        self, eap_code: int, identifier: int, eap_type: int, type_data: bytes
    ) -> Optional[dict]:
        if eap_type not in (13, 25, 21) or len(type_data) < 1:
            return None

        flags = type_data[0]
        has_more = bool(flags & EAP_TLS_FLAG_M)
        has_length = bool(flags & EAP_TLS_FLAG_L)
        has_start = bool(flags & EAP_TLS_FLAG_S)

        key = (eap_code, identifier)

        fragment_info = {
            "isFragment": False,
            "moreFragments": has_more,
            "fragmentSequence": 0,
            "totalFragments": 0,
            "reassembledData": None,
        }

        if has_start:
            tls_data_offset = 1
            total_length = None
            if has_length and len(type_data) >= 5:
                total_length = struct.unpack("!I", type_data[1:5])[0]
                tls_data_offset = 5

            tls_fragment_data = type_data[tls_data_offset:]

            if has_more:
                self._buffers[key] = {
                    "total_length": total_length,
                    "collected": bytearray(tls_fragment_data),
                    "sequence": 1,
                    "eap_code": eap_code,
                    "identifier": identifier,
                    "eap_type": eap_type,
                }
                fragment_info["isFragment"] = True
                fragment_info["fragmentSequence"] = 1
                fragment_info["totalLength"] = total_length
                return fragment_info
            else:
                fragment_info["isFragment"] = False
                fragment_info["reassembledData"] = tls_fragment_data.hex()
                return fragment_info

        elif key in self._buffers:
            buf = self._buffers[key]
            buf["collected"].extend(type_data[1:])
            buf["sequence"] += 1

            fragment_info["isFragment"] = True
            fragment_info["fragmentSequence"] = buf["sequence"]
            fragment_info["totalLength"] = buf["total_length"]

            if not has_more:
                reassembled = bytes(buf["collected"])
                fragment_info["totalFragments"] = buf["sequence"]
                fragment_info["reassembledData"] = reassembled.hex()
                del self._buffers[key]
            else:
                fragment_info["totalFragments"] = 0

            return fragment_info

        return None

    def reset(self):
        self._buffers.clear()


def _try_import_scapy():
    try:
        from scapy.all import rdpcap, Ether, EAPOL, EAP, Raw, IP, UDP, TCP

        return rdpcap, Ether, EAPOL, EAP, Raw, IP, UDP, TCP
    except ImportError:
        return None


def _parse_eap_from_bytes(data: bytes) -> Optional[dict]:
    if len(data) < 4:
        return None

    code = data[0]
    identifier = data[1]
    eap_length = struct.unpack("!H", data[2:4])[0]
    eap_type = data[4] if len(data) > 4 else 0
    eap_type_data = data[5:eap_length].hex() if len(data) > 5 else ""

    code_name = EAP_CODE_NAMES.get(code, f"Unknown({code})")
    type_name = EAP_TYPE_NAMES.get(eap_type, f"Unknown({eap_type})")

    identity = None
    if eap_type == 1 and code == 2 and len(data) > 5:
        try:
            identity = data[5:eap_length].decode("utf-8", errors="replace")
        except Exception:
            identity = data[5:eap_length].hex()

    type_data_bytes = data[5:eap_length] if len(data) > 5 else b""
    tls_phase = _detect_tls_phase(eap_type, type_data_bytes)

    md5_info = _parse_md5_challenge(eap_type, code, type_data_bytes)

    return {
        "code": code,
        "codeName": code_name,
        "identifier": identifier,
        "length": eap_length,
        "type": eap_type,
        "typeName": type_name,
        "typeData": eap_type_data,
        "identity": identity,
        "tlsPhase": tls_phase,
        "md5Info": md5_info,
        "rawData": data[:eap_length].hex() if eap_length <= len(data) else data.hex(),
    }


def _detect_tls_phase(eap_type: int, type_data: bytes) -> Optional[str]:
    if eap_type not in (13, 25, 21) or len(type_data) < 1:
        return None

    flags = type_data[0]
    has_start = bool(flags & EAP_TLS_FLAG_S)
    has_more = bool(flags & EAP_TLS_FLAG_M)
    has_length = bool(flags & EAP_TLS_FLAG_L)

    if has_more and not has_start:
        return "TLSFragment"

    if has_start:
        offset = 1
        if has_length and len(type_data) >= 5:
            offset = 5
        if offset < len(type_data):
            handshake_type = type_data[offset]
            return TLS_HANDSHAKE_TYPES.get(handshake_type)
        return "TLSStart"

    if not has_start and not has_more and len(type_data) > 1:
        return "TLSData"

    return None


def _parse_md5_challenge(eap_type: int, eap_code: int, type_data: bytes) -> Optional[dict]:
    if eap_type != 4 or len(type_data) < 2:
        return None

    value_size = type_data[0]
    if value_size == 0 or len(type_data) < 1 + value_size:
        return None

    value_bytes = type_data[1 : 1 + value_size]
    name_bytes = type_data[1 + value_size :]

    result = {
        "valueSize": value_size,
        "value": value_bytes.hex(),
    }

    if eap_code == 1:
        result["role"] = "Challenge"
        result["challenge"] = value_bytes.hex()
    elif eap_code == 2:
        result["role"] = "Response"
        result["response"] = value_bytes.hex()

    try:
        result["name"] = name_bytes.decode("utf-8", errors="replace") if name_bytes else ""
    except Exception:
        result["name"] = name_bytes.hex() if name_bytes else ""

    return result


def _determine_direction(src_mac: str, dst_mac: str, eap_code: int) -> str:
    if eap_code == 1:
        return "auth_to_supplicant"
    elif eap_code == 2:
        return "supplicant_to_auth"
    elif eap_code == 3 or eap_code == 4:
        return "auth_to_supplicant"
    return "unknown"


def simulate_radius_messages(messages: list) -> list:
    radius_messages = []
    radius_id = 0

    for msg in messages:
        eap_code = msg.get("eapCode", "")
        eap_type = msg.get("eapType", "")
        direction = msg.get("direction", "")
        eap_id = msg.get("eapHeader", {}).get("identifier", 0)

        if eap_code == "Start":
            radius_id += 1
            radius_messages.append({
                "id": len(radius_messages) + 1,
                "relatedEapMessageId": msg["id"],
                "timestamp": msg["timestamp"] + 0.001,
                "direction": "auth_to_server",
                "radiusCode": "Access-Request",
                "radiusAttributes": {
                    "User-Name": msg.get("identity") or "",
                    "NAS-IP-Address": "192.168.1.1",
                    "NAS-Port": "0",
                    "EAP-Message": "EAPOL-Start",
                },
            })
            continue

        if direction == "supplicant_to_auth" and eap_code == "Response":
            radius_id += 1
            attrs = {
                "User-Name": msg.get("identity") or "",
                "NAS-IP-Address": "192.168.1.1",
                "NAS-Port": "0",
                "EAP-Message": f"EAP-Response/{eap_type}",
            }
            if msg.get("md5Info") and msg["md5Info"].get("response"):
                attrs["EAP-Message"] = f"EAP-Response/MD5-Challenge"
            if msg.get("identity"):
                attrs["User-Name"] = msg["identity"]

            radius_messages.append({
                "id": len(radius_messages) + 1,
                "relatedEapMessageId": msg["id"],
                "timestamp": msg["timestamp"] + 0.001,
                "direction": "auth_to_server",
                "radiusCode": "Access-Request",
                "radiusAttributes": attrs,
            })

        elif direction == "auth_to_supplicant" and eap_code == "Request":
            radius_messages.append({
                "id": len(radius_messages) + 1,
                "relatedEapMessageId": msg["id"],
                "timestamp": msg["timestamp"] - 0.001,
                "direction": "server_to_auth",
                "radiusCode": "Access-Challenge",
                "radiusAttributes": {
                    "EAP-Message": f"EAP-Request/{eap_type}",
                    "State": f"session-{eap_id:02x}",
                },
            })

        elif direction == "auth_to_supplicant" and eap_code == "Success":
            radius_messages.append({
                "id": len(radius_messages) + 1,
                "relatedEapMessageId": msg["id"],
                "timestamp": msg["timestamp"] - 0.001,
                "direction": "server_to_auth",
                "radiusCode": "Access-Accept",
                "radiusAttributes": {
                    "EAP-Message": "EAP-Success",
                    "Session-Timeout": "3600",
                },
            })

        elif direction == "auth_to_supplicant" and eap_code == "Failure":
            radius_messages.append({
                "id": len(radius_messages) + 1,
                "relatedEapMessageId": msg["id"],
                "timestamp": msg["timestamp"] - 0.001,
                "direction": "server_to_auth",
                "radiusCode": "Access-Reject",
                "radiusAttributes": {
                    "EAP-Message": "EAP-Failure",
                    "Reply-Message": "Authentication failed",
                },
            })

    return radius_messages


def extract_certificates_from_tls_data(reassembled_hex: str) -> list[dict]:
    if not reassembled_hex:
        return []

    try:
        tls_data = bytes.fromhex(reassembled_hex)
    except (ValueError, TypeError):
        return []

    return _parse_tls_records_for_certs(tls_data)


def _parse_tls_records_for_certs(data: bytes) -> list[dict]:
    certs = []
    offset = 0

    while offset + 5 <= len(data):
        content_type = data[offset]
        if content_type != TLS_CONTENT_TYPE_HANDSHAKE:
            offset += 1
            continue

        if offset + 5 > len(data):
            break

        tls_version = struct.unpack("!H", data[offset + 1 : offset + 3])[0]
        record_length = struct.unpack("!H", data[offset + 3 : offset + 5])[0]

        if offset + 5 + record_length > len(data):
            break

        record_data = data[offset + 5 : offset + 5 + record_length]

        if len(record_data) >= 4 and record_data[0] == TLS_HANDSHAKE_CERTIFICATE:
            hs_length = struct.unpack("!I", b"\x00" + record_data[1:4])[0]
            if len(record_data) >= 7:
                certs_total_length = struct.unpack("!I", b"\x00" + record_data[4:7])[0]
                cert_offset = 7
                while cert_offset + 3 <= len(record_data) and cert_offset < 7 + certs_total_length:
                    cert_length = struct.unpack("!I", b"\x00" + record_data[cert_offset : cert_offset + 3])[0]
                    if cert_offset + 3 + cert_length > len(record_data):
                        break

                    cert_der = record_data[cert_offset + 3 : cert_offset + 3 + cert_length]
                    cert_info = _parse_x509_cert(cert_der)
                    if cert_info:
                        certs.append(cert_info)

                    cert_offset += 3 + cert_length

        offset += 5 + record_length

    return certs


def _parse_x509_cert(der_data: bytes) -> Optional[dict]:
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import serialization

        cert = x509.load_der_x509_certificate(der_data)

        subject_parts = []
        for attr in cert.subject:
            subject_parts.append(f"{attr.oid._name}={attr.value}")
        subject_str = ", ".join(subject_parts)

        issuer_parts = []
        for attr in cert.issuer:
            issuer_parts.append(f"{attr.oid._name}={attr.value}")
        issuer_str = ", ".join(issuer_parts)

        pem_data = cert.public_bytes(serialization.Encoding.PEM).decode("ascii")

        san = []
        try:
            san_ext = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
            san = san_ext.value.get_values_for_type(x509.DNSName)
        except x509.ExtensionNotFound:
            pass

        is_ca = False
        try:
            basic_constraints = cert.extensions.get_extension_for_class(x509.BasicConstraints)
            is_ca = basic_constraints.value.ca
        except x509.ExtensionNotFound:
            pass

        fingerprint_sha256 = hashlib.sha256(der_data).hexdigest()

        return {
            "subject": subject_str,
            "issuer": issuer_str,
            "serialNumber": format(cert.serial_number, "x"),
            "notBefore": cert.not_valid_before_utc.isoformat() if hasattr(cert, "not_valid_before_utc") else str(cert.not_valid_before),
            "notAfter": cert.not_valid_after_utc.isoformat() if hasattr(cert, "not_valid_after_utc") else str(cert.not_valid_after),
            "san": san,
            "isCA": is_ca,
            "signatureAlgorithm": cert.signature_algorithm_oid._name,
            "fingerprintSha256": fingerprint_sha256,
            "derBase64": base64.b64encode(der_data).decode("ascii"),
            "pem": pem_data,
        }
    except ImportError:
        return _fallback_parse_cert(der_data)
    except Exception:
        return _fallback_parse_cert(der_data)


def _fallback_parse_cert(der_data: bytes) -> Optional[dict]:
    try:
        pem_b64 = base64.b64encode(der_data).decode("ascii")
        pem_lines = [pem_b64[i : i + 64] for i in range(0, len(pem_b64), 64)]
        pem = "-----BEGIN CERTIFICATE-----\n" + "\n".join(pem_lines) + "\n-----END CERTIFICATE-----\n"

        fingerprint = hashlib.sha256(der_data).hexdigest()

        return {
            "subject": "(cryptography library not available - limited parsing)",
            "issuer": "(unknown)",
            "serialNumber": "(unknown)",
            "notBefore": "",
            "notAfter": "",
            "san": [],
            "isCA": False,
            "signatureAlgorithm": "(unknown)",
            "fingerprintSha256": fingerprint,
            "derBase64": pem_b64,
            "pem": pem,
        }
    except Exception:
        return None


def extract_all_certificates(messages: list) -> list[dict]:
    all_certs = []

    for msg in messages:
        frag = msg.get("fragmentInfo")
        if not frag or not frag.get("reassembledData"):
            continue

        certs = extract_certificates_from_tls_data(frag["reassembledData"])
        for cert in certs:
            cert["sourceMessageId"] = msg["id"]
            cert["sourceFrame"] = msg["frameNumber"]
        all_certs.extend(certs)

    return all_certs


def parse_pcap(filepath: str) -> dict:
    scapy_modules = _try_import_scapy()
    if scapy_modules is None:
        return generate_sample_data()

    rdpcap, Ether, EAPOL, EAP, Raw, IP, UDP, TCP = scapy_modules

    packets = rdpcap(filepath)
    messages = []
    identity = None
    auth_method = "Unknown"
    total_frames = len(packets)
    eapol_count = 0
    start_time = None
    end_time = None
    reassembler = FragmentReassembler()

    for idx, pkt in enumerate(packets):
        if start_time is None:
            start_time = float(pkt.time)
        end_time = float(pkt.time)

        ether = pkt[Ether] if Ether in pkt else None
        if ether is None:
            continue

        if ether.type != ETHERTYPE_EAPOL:
            continue

        eapol_count += 1
        src_mac = ether.src
        dst_mac = ether.dst

        eapol_layer = pkt[EAPOL] if EAPOL in pkt else None
        if eapol_layer is None:
            continue

        eapol_version = eapol_layer.version if hasattr(eapol_layer, "version") else 0
        eapol_type_val = eapol_layer.type if hasattr(eapol_layer, "type") else 0
        eapol_type_name = EAPOL_TYPE_NAMES.get(eapol_type_val, f"Unknown({eapol_type_val})")

        if eapol_type_val == 1:
            messages.append({
                "id": len(messages) + 1,
                "frameNumber": idx + 1,
                "timestamp": float(pkt.time) - (start_time or 0),
                "direction": "supplicant_to_auth",
                "eapCode": "Start",
                "eapType": "EAPOL-Start",
                "eapTypeData": "",
                "rawData": "",
                "tlsPhase": None,
                "identity": None,
                "fragmentInfo": None,
                "md5Info": None,
                "ethernetHeader": {"srcMac": src_mac, "dstMac": dst_mac, "etherType": "0x888E"},
                "eapolHeader": {"version": eapol_version, "type": eapol_type_name, "length": 0},
                "eapHeader": {"code": 0, "identifier": 0, "length": 0},
                "decodedFields": {"event": "EAPOL-Start"},
            })
            continue

        if eapol_type_val == 2:
            messages.append({
                "id": len(messages) + 1,
                "frameNumber": idx + 1,
                "timestamp": float(pkt.time) - (start_time or 0),
                "direction": "supplicant_to_auth",
                "eapCode": "Logoff",
                "eapType": "EAPOL-Logoff",
                "eapTypeData": "",
                "rawData": "",
                "tlsPhase": None,
                "identity": None,
                "fragmentInfo": None,
                "md5Info": None,
                "ethernetHeader": {"srcMac": src_mac, "dstMac": dst_mac, "etherType": "0x888E"},
                "eapolHeader": {"version": eapol_version, "type": eapol_type_name, "length": 0},
                "eapHeader": {"code": 0, "identifier": 0, "length": 0},
                "decodedFields": {"event": "EAPOL-Logoff"},
            })
            continue

        if eapol_type_val != 0:
            continue

        eap_layer = pkt[EAP] if EAP in pkt else None
        if eap_layer is None:
            raw_data = bytes(pkt[Raw]) if Raw in pkt else b""
            if len(raw_data) > 4:
                raw_data = raw_data[4:]
            eap_info = _parse_eap_from_bytes(raw_data)
            if eap_info is None:
                continue
        else:
            eap_code = eap_layer.code if hasattr(eap_layer, "code") else 0
            eap_id = eap_layer.id if hasattr(eap_layer, "id") else 0
            eap_len = eap_layer.len if hasattr(eap_layer, "len") else 0
            eap_type_val_local = eap_layer.type if hasattr(eap_layer, "type") else 0

            eap_code_name = EAP_CODE_NAMES.get(eap_code, f"Unknown({eap_code})")
            eap_type_name_str = EAP_TYPE_NAMES.get(eap_type_val_local, f"Unknown({eap_type_val_local})")

            raw_payload = bytes(eap_layer) if hasattr(eap_layer, "__bytes__") else b""
            type_data_bytes = raw_payload[5:] if len(raw_payload) > 5 else b""

            msg_identity = None
            if eap_type_val_local == 1 and eap_code == 2 and len(type_data_bytes) > 0:
                try:
                    msg_identity = type_data_bytes.decode("utf-8", errors="replace")
                    identity = msg_identity
                except Exception:
                    msg_identity = type_data_bytes.hex()

            if eap_type_val_local in (13, 25, 21):
                auth_method = EAP_TYPE_NAMES.get(eap_type_val_local, "Unknown")

            tls_phase = _detect_tls_phase(eap_type_val_local, type_data_bytes)
            md5_info = _parse_md5_challenge(eap_type_val_local, eap_code, type_data_bytes)

            fragment_info = reassembler.process(
                eap_code, eap_id, eap_type_val_local, type_data_bytes
            )

            eap_info = {
                "code": eap_code,
                "codeName": eap_code_name,
                "identifier": eap_id,
                "length": eap_len,
                "type": eap_type_val_local,
                "typeName": eap_type_name_str,
                "typeData": type_data_bytes.hex(),
                "identity": msg_identity,
                "tlsPhase": tls_phase,
                "md5Info": md5_info,
                "fragmentInfo": fragment_info,
                "rawData": raw_payload.hex() if raw_payload else "",
            }

        direction = _determine_direction(src_mac, dst_mac, eap_info["code"])
        if eap_info.get("identity"):
            identity = eap_info["identity"]

        if eap_info["type"] in (13, 25, 21):
            auth_method = EAP_TYPE_NAMES.get(eap_info["type"], "Unknown")

        if eap_info.get("md5Info") and auth_method == "Unknown":
            auth_method = "EAP-MD5"

        msg = {
            "id": len(messages) + 1,
            "frameNumber": idx + 1,
            "timestamp": float(pkt.time) - (start_time or 0),
            "direction": direction,
            "eapCode": eap_info["codeName"],
            "eapType": eap_info["typeName"],
            "eapTypeData": eap_info["typeData"],
            "rawData": eap_info["rawData"],
            "tlsPhase": eap_info.get("tlsPhase"),
            "identity": eap_info.get("identity"),
            "fragmentInfo": eap_info.get("fragmentInfo"),
            "md5Info": eap_info.get("md5Info"),
            "ethernetHeader": {"srcMac": src_mac, "dstMac": dst_mac, "etherType": "0x888E"},
            "eapolHeader": {"version": eapol_version, "type": eapol_type_name, "length": 0},
            "eapHeader": {
                "code": eap_info["code"],
                "identifier": eap_info["identifier"],
                "length": eap_info["length"],
            },
            "decodedFields": _build_decoded_fields(eap_info),
        }
        messages.append(msg)

    tls_phases = _extract_tls_phases(messages)
    radius_messages = simulate_radius_messages(messages)
    certificate_chain = extract_all_certificates(messages)

    return {
        "id": "",
        "summary": {
            "totalFrames": total_frames,
            "eapolFrames": eapol_count,
            "duration": round(end_time - start_time, 3) if start_time and end_time else 0,
            "identity": identity,
            "authMethod": auth_method,
        },
        "messages": messages,
        "tlsPhases": tls_phases,
        "radiusMessages": radius_messages,
        "certificateChain": certificate_chain,
    }


def _build_decoded_fields(eap_info: dict) -> dict:
    fields = {
        "EAP Code": eap_info["codeName"],
        "EAP Type": eap_info["typeName"],
        "Identifier": str(eap_info["identifier"]),
    }
    if eap_info.get("identity"):
        fields["Identity"] = eap_info["identity"]
    if eap_info.get("tlsPhase"):
        fields["TLS Phase"] = eap_info["tlsPhase"]
    frag = eap_info.get("fragmentInfo")
    if frag:
        if frag.get("isFragment"):
            fields["Fragment"] = f"Yes (#{frag.get('fragmentSequence', '?')})"
            if frag.get("moreFragments"):
                fields["More Fragments"] = "Yes"
            if frag.get("totalFragments", 0) > 0:
                fields["Total Fragments"] = str(frag["totalFragments"])
        elif frag.get("moreFragments"):
            fields["More Fragments"] = "Yes (first fragment)"
        if frag.get("reassembledData"):
            fields["Reassembled"] = "Yes"
    md5 = eap_info.get("md5Info")
    if md5:
        fields["MD5 Role"] = md5.get("role", "")
        if md5.get("challenge"):
            fields["Challenge"] = md5["challenge"]
        if md5.get("response"):
            fields["Response"] = md5["response"]
        if md5.get("name"):
            fields["Name"] = md5["name"]
    return fields


def _extract_tls_phases(messages: list) -> list:
    phases = []
    current_phase = None
    phase_start = None

    for msg in messages:
        tls = msg.get("tlsPhase")
        if tls is None or tls == "TLSFragment":
            continue

        if tls in ("ClientHello", "ServerHello", "Finished"):
            if current_phase and phase_start is not None:
                phases.append({
                    "name": current_phase,
                    "startMessageId": phase_start,
                    "endMessageId": msg["id"] - 1,
                    "description": _phase_description(current_phase),
                })
            current_phase = tls
            phase_start = msg["id"]
        elif current_phase is None:
            current_phase = "TLSHandshake"
            phase_start = msg["id"]

    if current_phase and phase_start is not None:
        phases.append({
            "name": current_phase,
            "startMessageId": phase_start,
            "endMessageId": messages[-1]["id"] if messages else phase_start,
            "description": _phase_description(current_phase),
        })

    return phases


def _phase_description(phase: str) -> str:
    descriptions = {
        "ClientHello": "Client initiates TLS handshake with ClientHello",
        "ServerHello": "Server responds with ServerHello and certificate chain",
        "TLSHandshake": "TLS handshake in progress - key exchange and negotiation",
        "Finished": "TLS handshake complete, encrypted tunnel established",
        "TLSData": "Data transmitted within encrypted TLS tunnel",
        "TLSFragment": "TLS fragment (part of fragmented message)",
    }
    return descriptions.get(phase, "TLS operation")


def parse_pcap_bytes(data: bytes) -> dict:
    import tempfile
    import os

    tmp = tempfile.NamedTemporaryFile(suffix=".pcap", delete=False)
    tmp.write(data)
    tmp.close()
    try:
        return parse_pcap(tmp.name)
    finally:
        os.unlink(tmp.name)


def generate_sample_data() -> dict:
    base_time = 0.0

    SAMPLE_SERVER_CERT_PEM = """-----BEGIN CERTIFICATE-----
MIIDazCCAlOgAwIBAgIUMx7sY2qrVkhq8N1hhCfY3p3m3GMwDQYJKoZIhvcNAQEL
BQAwRTELMAkGA1UEBhMCQ04xEjAQBgNVBAcMCUJlaWppbmcxFDASBgNVBAoMC0V4
YW1wbGUgQ0ExEDAOBgNVBAMMB3Jvb3QtY2EwHhcNMjQwMTAxMDAwMDAwWhcNMjYw
MTAxMDAwMDAwWjBKMQswCQYDVQQGEwJDTjESMBAGA1UEBwwJQmVpamluZzEOMAwG
A1UECgwFRXhhbXAxEjAQBgNVBAMMCWxvY2FsaG9zdDCCASIwDQYJKoZIhvcNAQEB
BQADggEPADCCAQoCggEBAOJjY3J5cHRvX2tleV9leGFtcGxlX2Jhc2U2NF9lbmNv
ZGVkX2RhdGFfZm9yX3Rlc3RpbmdfcHVycG9zZXNfb25seV9kZXZlbG9wbWVudC9j
cnlwdG9fa2V5X2V4YW1wbGVfYmFzZTY0X2VuY29kZWRfZGF0YV9mb3JfdGVzdGlu
Z19wdXJwb3Nlc19vbmx5X2RldmVsb3BtZW50L2NyeXB0b19rZXlfZXhhbXBsZV9i
YXNlNjRfZW5jb2RlZF9kYXRhX2Zvcl90ZXN0aW5nX3B1cnBvc2VzX29ubHlfZGV2
ZWxvcG1lbnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDQAwggEIAoIBAQC6i9iYM4zR
aH7vEGqvKRKjLb3qLG9pRfKl5GV3eUjkYxWb7R3vLq3GvM9x8n9F5eT8k1m2N4v7
iH4jF6R2K8p9E3wL5mN1o0U7vB2wR4jK6n8F3eT9k1m2N4v7iH4jF6R2K8p9E3wL
5mN1o0U7vB2wR4jK6n8F3eT9k1m2N4v7iH4jF6R2K8p9E3wL5mN1o0U7vB2wR4jK
6n8CAwEAAaOBwTCBvjAdBgNVHQ4EFgQUx5kQ3vR8T7pG1eL9V0p9M4n6L3QwgaAG
A1UdIwSBmDCBlYAUx5kQ3vR8T7pG1eL9V0p9M4n6L3ShYKReMFwxCzAJBgNVBAYT
AkNOMRIwEAYDVQQHDAlCZWlqaW5nMRQwEgYDVQQKDAtFeGFtcGxlIENBMRAwDgYD
VQQDDAdyb290LWNhggQzHuxjaqtSGGrw3WGEJ9jenebcYzAMBgNVHRMEBTADAQH/
MA0GCSqGSIb3DQEBCwUAA4IBAQA7r8F3eT9k1m2N4v7iH4jF6R2K8p9E3wL5mN1o0
U7vB2wR4jK6n8F3eT9k1m2N4v7iH4jF6R2K8p9E3wL5mN1o0U7vB2wR4jK6n8F3e
T9k1m2N4v7iH4jF6R2K8p9E3wL5mN1o0U7vB2wR4jK6n8F3eT9k1m2N4v7iH4jF6
R2K8p9E3wL5mN1o0U7vB2wR4jK6n8F3eT9k1m2N4v7iH4jF6R2K8p9E3wL5mN1o0
U7vB2wR4jK6n8F3eT9k1m2N4v7iH4jF6R2K8p9E3wL5mN1o0U7vB2wR4jK6n8F3e
-----END CERTIFICATE-----"""

    SAMPLE_CA_CERT_PEM = """-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIUMx7sY2qrVkhq8N1hhCfY3p3m3GMwDQYJKoZIhvcNAQEL
BQAwFjEUMBIGA1UEAwwLRXhhbXBsZSBDQTAeFw0yNDAxMDEwMDAwMDBaFw0yODAx
MDEwMDAwMDBaMBYxFDASBgNVBAMMC0V4YW1wbGUgQ0EwggIiMA0GCSqGSIb3DQEB
BQUAA4ICDwAwggIKAoICAQDBs7rR8T7pG1eL9V0p9M4n6L3QwgaAGA1UdIwSBmDCB
lYAUx5kQ3vR8T7pG1eL9V0p9M4n6L3ShYKReMFwxCzAJBgNVBAYTAkNOMRIwEAYD
VQQHDAlCZWlqaW5nMRQwEgYDVQQKDAtFeGFtcGxlIENBMRAwDgYDVQQDDAdyb290
LWNhggQzHuxjaqtSGGrw3WGEJ9jenebcYzAMBgNVHRMEBTADAQH/MA0GCSqGSIb3
DQEBCwUAA4ICAQB7r8F3eT9k1m2N4v7iH4jF6R2K8p9E3wL5mN1o0U7vB2wR4jK6
n8F3eT9k1m2N4v7iH4jF6R2K8p9E3wL5mN1o0U7vB2wR4jK6n8F3eT9k1m2N4v7i
H4jF6R2K8p9E3wL5mN1o0U7vB2wR4jK6n8F3eT9k1m2N4v7iH4jF6R2K8p9E3wL
5mN1o0U7vB2wR4jK6n8F3eT9k1m2N4v7iH4jF6R2K8p9E3wL5mN1o0U7vB2wR4jK
6n8F3eT9k1m2N4v7iH4jF6R2K8p9E3wL5mN1o0U7vB2wR4jK6n8F3eT9k1m2N4v7
iH4jF6R2K8p9E3wL5mN1o0U7vB2wR4jK6n8F3eT9k1m2N4v7iH4jF6R2K8p9E3wL
5mN1o0U7vB2wR4jK6n8F3eT9k1m2N4v7iH4jF6R2K8p9E3wL5mN1o0U7vB2wR4jK
-----END CERTIFICATE-----"""

    def _pem_to_der_b64(pem: str) -> str:
        lines = pem.strip().split("\n")
        b64 = "".join(l for l in lines if not l.startswith("-----"))
        return b64.strip()

    messages = [
        {
            "id": 1, "frameNumber": 1, "timestamp": base_time,
            "direction": "supplicant_to_auth", "eapCode": "Start",
            "eapType": "EAPOL-Start", "eapTypeData": "", "rawData": "",
            "tlsPhase": None, "identity": None,
            "fragmentInfo": None, "md5Info": None,
            "ethernetHeader": {"srcMac": "00:1a:2b:3c:4d:5e", "dstMac": "01:80:c2:00:00:03", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAPOL-Start", "length": 0},
            "eapHeader": {"code": 0, "identifier": 0, "length": 0},
            "decodedFields": {"event": "EAPOL-Start"},
        },
        {
            "id": 2, "frameNumber": 2, "timestamp": base_time + 0.002,
            "direction": "auth_to_supplicant", "eapCode": "Request",
            "eapType": "Identity", "eapTypeData": "", "rawData": "0105000501",
            "tlsPhase": None, "identity": None,
            "fragmentInfo": None, "md5Info": None,
            "ethernetHeader": {"srcMac": "01:80:c2:00:00:03", "dstMac": "00:1a:2b:3c:4d:5e", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 5},
            "eapHeader": {"code": 1, "identifier": 1, "length": 5},
            "decodedFields": {"EAP Code": "Request", "EAP Type": "Identity", "Identifier": "1"},
        },
        {
            "id": 3, "frameNumber": 3, "timestamp": base_time + 0.015,
            "direction": "supplicant_to_auth", "eapCode": "Response",
            "eapType": "Identity", "eapTypeData": "75736572406578616d706c652e636f6d",
            "rawData": "020200150175736572406578616d706c652e636f6d",
            "tlsPhase": None, "identity": "user@example.com",
            "fragmentInfo": None, "md5Info": None,
            "ethernetHeader": {"srcMac": "00:1a:2b:3c:4d:5e", "dstMac": "01:80:c2:00:00:03", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 21},
            "eapHeader": {"code": 2, "identifier": 1, "length": 21},
            "decodedFields": {"EAP Code": "Response", "EAP Type": "Identity", "Identifier": "1", "Identity": "user@example.com"},
        },
        {
            "id": 4, "frameNumber": 4, "timestamp": base_time + 0.025,
            "direction": "auth_to_supplicant", "eapCode": "Request",
            "eapType": "MD5-Challenge", "eapTypeData": "10a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
            "rawData": "010200110410a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
            "tlsPhase": None, "identity": None,
            "fragmentInfo": None,
            "md5Info": {
                "valueSize": 16,
                "value": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
                "role": "Challenge",
                "challenge": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
                "name": "",
            },
            "ethernetHeader": {"srcMac": "01:80:c2:00:00:03", "dstMac": "00:1a:2b:3c:4d:5e", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 17},
            "eapHeader": {"code": 1, "identifier": 2, "length": 17},
            "decodedFields": {
                "EAP Code": "Request",
                "EAP Type": "MD5-Challenge",
                "Identifier": "2",
                "MD5 Role": "Challenge",
                "Challenge": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
            },
        },
        {
            "id": 5, "frameNumber": 5, "timestamp": base_time + 0.040,
            "direction": "supplicant_to_auth", "eapCode": "Response",
            "eapType": "MD5-Challenge", "eapTypeData": "10e5aa7b3c1d9f0e2b4a6c8d0f1e3a5b7c9",
            "rawData": "020200110410e5aa7b3c1d9f0e2b4a6c8d0f1e3a5b7c9",
            "tlsPhase": None, "identity": None,
            "fragmentInfo": None,
            "md5Info": {
                "valueSize": 16,
                "value": "e5aa7b3c1d9f0e2b4a6c8d0f1e3a5b7c9",
                "role": "Response",
                "response": "e5aa7b3c1d9f0e2b4a6c8d0f1e3a5b7c9",
                "name": "",
            },
            "ethernetHeader": {"srcMac": "00:1a:2b:3c:4d:5e", "dstMac": "01:80:c2:00:00:03", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 17},
            "eapHeader": {"code": 2, "identifier": 2, "length": 17},
            "decodedFields": {
                "EAP Code": "Response",
                "EAP Type": "MD5-Challenge",
                "Identifier": "2",
                "MD5 Role": "Response",
                "Response": "e5aa7b3c1d9f0e2b4a6c8d0f1e3a5b7c9",
            },
        },
        {
            "id": 6, "frameNumber": 6, "timestamp": base_time + 0.060,
            "direction": "auth_to_supplicant", "eapCode": "Request",
            "eapType": "EAP-TLS", "eapTypeData": "80", "rawData": "010300060d80",
            "tlsPhase": None, "identity": None,
            "fragmentInfo": None, "md5Info": None,
            "ethernetHeader": {"srcMac": "01:80:c2:00:00:03", "dstMac": "00:1a:2b:3c:4d:5e", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 6},
            "eapHeader": {"code": 1, "identifier": 3, "length": 6},
            "decodedFields": {"EAP Code": "Request", "EAP Type": "EAP-TLS", "Identifier": "3"},
        },
        {
            "id": 7, "frameNumber": 7, "timestamp": base_time + 0.075,
            "direction": "supplicant_to_auth", "eapCode": "Response",
            "eapType": "EAP-TLS", "eapTypeData": "a001", "rawData": "020300a60da00100970301",
            "tlsPhase": "ClientHello", "identity": None,
            "fragmentInfo": {
                "isFragment": False,
                "moreFragments": True,
                "fragmentSequence": 1,
                "totalFragments": 0,
                "totalLength": 151,
                "reassembledData": None,
            },
            "md5Info": None,
            "ethernetHeader": {"srcMac": "00:1a:2b:3c:4d:5e", "dstMac": "01:80:c2:00:00:03", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 166},
            "eapHeader": {"code": 2, "identifier": 3, "length": 166},
            "decodedFields": {
                "EAP Code": "Response",
                "EAP Type": "EAP-TLS",
                "Identifier": "3",
                "TLS Phase": "ClientHello",
                "More Fragments": "Yes (first fragment)",
            },
        },
        {
            "id": 8, "frameNumber": 8, "timestamp": base_time + 0.080,
            "direction": "supplicant_to_auth", "eapCode": "Response",
            "eapType": "EAP-TLS", "eapTypeData": "00", "rawData": "020300500d00",
            "tlsPhase": "TLSFragment", "identity": None,
            "fragmentInfo": {
                "isFragment": True,
                "moreFragments": True,
                "fragmentSequence": 2,
                "totalFragments": 0,
                "totalLength": 151,
                "reassembledData": None,
            },
            "md5Info": None,
            "ethernetHeader": {"srcMac": "00:1a:2b:3c:4d:5e", "dstMac": "01:80:c2:00:00:03", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 80},
            "eapHeader": {"code": 2, "identifier": 3, "length": 80},
            "decodedFields": {
                "EAP Code": "Response",
                "EAP Type": "EAP-TLS",
                "Identifier": "3",
                "TLS Phase": "TLSFragment",
                "Fragment": "Yes (#2)",
                "More Fragments": "Yes",
            },
        },
        {
            "id": 9, "frameNumber": 9, "timestamp": base_time + 0.085,
            "direction": "supplicant_to_auth", "eapCode": "Response",
            "eapType": "EAP-TLS", "eapTypeData": "00", "rawData": "020300200d00",
            "tlsPhase": "TLSFragment", "identity": None,
            "fragmentInfo": {
                "isFragment": True,
                "moreFragments": False,
                "fragmentSequence": 3,
                "totalFragments": 3,
                "totalLength": 151,
                "reassembledData": "0100" + "97" * 149,
            },
            "md5Info": None,
            "ethernetHeader": {"srcMac": "00:1a:2b:3c:4d:5e", "dstMac": "01:80:c2:00:00:03", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 32},
            "eapHeader": {"code": 2, "identifier": 3, "length": 32},
            "decodedFields": {
                "EAP Code": "Response",
                "EAP Type": "EAP-TLS",
                "Identifier": "3",
                "TLS Phase": "TLSFragment",
                "Fragment": "Yes (#3)",
                "Total Fragments": "3",
                "Reassembled": "Yes",
            },
        },
        {
            "id": 10, "frameNumber": 10, "timestamp": base_time + 0.120,
            "direction": "auth_to_supplicant", "eapCode": "Request",
            "eapType": "EAP-TLS", "eapTypeData": "a002", "rawData": "010304000da0020090",
            "tlsPhase": "ServerHello", "identity": None,
            "fragmentInfo": {
                "isFragment": False,
                "moreFragments": True,
                "fragmentSequence": 1,
                "totalFragments": 0,
                "totalLength": 1024,
                "reassembledData": None,
            },
            "md5Info": None,
            "ethernetHeader": {"srcMac": "01:80:c2:00:00:03", "dstMac": "00:1a:2b:3c:4d:5e", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 1024},
            "eapHeader": {"code": 1, "identifier": 4, "length": 1024},
            "decodedFields": {
                "EAP Code": "Request",
                "EAP Type": "EAP-TLS",
                "Identifier": "4",
                "TLS Phase": "ServerHello",
                "More Fragments": "Yes (first fragment)",
            },
        },
        {
            "id": 11, "frameNumber": 11, "timestamp": base_time + 0.125,
            "direction": "auth_to_supplicant", "eapCode": "Request",
            "eapType": "EAP-TLS", "eapTypeData": "00", "rawData": "010404000d00",
            "tlsPhase": "TLSFragment", "identity": None,
            "fragmentInfo": {
                "isFragment": True,
                "moreFragments": False,
                "fragmentSequence": 2,
                "totalFragments": 2,
                "totalLength": 1024,
                "reassembledData": "0200" + "90" * 1022,
            },
            "md5Info": None,
            "ethernetHeader": {"srcMac": "01:80:c2:00:00:03", "dstMac": "00:1a:2b:3c:4d:5e", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 1024},
            "eapHeader": {"code": 1, "identifier": 4, "length": 1024},
            "decodedFields": {
                "EAP Code": "Request",
                "EAP Type": "EAP-TLS",
                "Identifier": "4",
                "TLS Phase": "TLSFragment",
                "Fragment": "Yes (#2)",
                "Total Fragments": "2",
                "Reassembled": "Yes",
            },
        },
        {
            "id": 12, "frameNumber": 12, "timestamp": base_time + 0.130,
            "direction": "supplicant_to_auth", "eapCode": "Response",
            "eapType": "EAP-TLS", "eapTypeData": "", "rawData": "020400060d00",
            "tlsPhase": None, "identity": None,
            "fragmentInfo": None, "md5Info": None,
            "ethernetHeader": {"srcMac": "00:1a:2b:3c:4d:5e", "dstMac": "01:80:c2:00:00:03", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 6},
            "eapHeader": {"code": 2, "identifier": 4, "length": 6},
            "decodedFields": {"EAP Code": "Response", "EAP Type": "EAP-TLS", "Identifier": "4"},
        },
        {
            "id": 13, "frameNumber": 13, "timestamp": base_time + 0.200,
            "direction": "auth_to_supplicant", "eapCode": "Request",
            "eapType": "EAP-TLS", "eapTypeData": "a00e", "rawData": "010504000da00e",
            "tlsPhase": None, "identity": None,
            "fragmentInfo": None, "md5Info": None,
            "ethernetHeader": {"srcMac": "01:80:c2:00:00:03", "dstMac": "00:1a:2b:3c:4d:5e", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 1024},
            "eapHeader": {"code": 1, "identifier": 5, "length": 1024},
            "decodedFields": {"EAP Code": "Request", "EAP Type": "EAP-TLS", "Identifier": "5", "TLS Phase": "ServerHelloDone"},
        },
        {
            "id": 14, "frameNumber": 14, "timestamp": base_time + 0.250,
            "direction": "supplicant_to_auth", "eapCode": "Response",
            "eapType": "EAP-TLS", "eapTypeData": "a010", "rawData": "020502000da010",
            "tlsPhase": None, "identity": None,
            "fragmentInfo": None, "md5Info": None,
            "ethernetHeader": {"srcMac": "00:1a:2b:3c:4d:5e", "dstMac": "01:80:c2:00:00:03", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 512},
            "eapHeader": {"code": 2, "identifier": 5, "length": 512},
            "decodedFields": {"EAP Code": "Response", "EAP Type": "EAP-TLS", "Identifier": "5", "TLS Phase": "KeyExchange"},
        },
        {
            "id": 15, "frameNumber": 15, "timestamp": base_time + 0.300,
            "direction": "auth_to_supplicant", "eapCode": "Request",
            "eapType": "EAP-TLS", "eapTypeData": "a014", "rawData": "010600400da014",
            "tlsPhase": "Finished", "identity": None,
            "fragmentInfo": None, "md5Info": None,
            "ethernetHeader": {"srcMac": "01:80:c2:00:00:03", "dstMac": "00:1a:2b:3c:4d:5e", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 64},
            "eapHeader": {"code": 1, "identifier": 6, "length": 64},
            "decodedFields": {"EAP Code": "Request", "EAP Type": "EAP-TLS", "Identifier": "6", "TLS Phase": "Finished"},
        },
        {
            "id": 16, "frameNumber": 16, "timestamp": base_time + 0.305,
            "direction": "supplicant_to_auth", "eapCode": "Response",
            "eapType": "EAP-TLS", "eapTypeData": "a014", "rawData": "020600400da014",
            "tlsPhase": "Finished", "identity": None,
            "fragmentInfo": None, "md5Info": None,
            "ethernetHeader": {"srcMac": "00:1a:2b:3c:4d:5e", "dstMac": "01:80:c2:00:00:03", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 64},
            "eapHeader": {"code": 2, "identifier": 6, "length": 64},
            "decodedFields": {"EAP Code": "Response", "EAP Type": "EAP-TLS", "Identifier": "6", "TLS Phase": "Finished"},
        },
        {
            "id": 17, "frameNumber": 17, "timestamp": base_time + 0.350,
            "direction": "auth_to_supplicant", "eapCode": "Success",
            "eapType": "None", "eapTypeData": "", "rawData": "03070004",
            "tlsPhase": None, "identity": None,
            "fragmentInfo": None, "md5Info": None,
            "ethernetHeader": {"srcMac": "01:80:c2:00:00:03", "dstMac": "00:1a:2b:3c:4d:5e", "etherType": "0x888E"},
            "eapolHeader": {"version": 2, "type": "EAP-Packet", "length": 4},
            "eapHeader": {"code": 3, "identifier": 7, "length": 4},
            "decodedFields": {"EAP Code": "Success", "EAP Type": "None", "Identifier": "7"},
        },
    ]

    tls_phases = [
        {"name": "ClientHello", "startMessageId": 7, "endMessageId": 9, "description": "Client initiates TLS handshake with ClientHello (fragmented into 3 parts)"},
        {"name": "ServerHello", "startMessageId": 10, "endMessageId": 13, "description": "Server responds with ServerHello (fragmented), Certificate, ServerHelloDone"},
        {"name": "KeyExchange", "startMessageId": 14, "endMessageId": 14, "description": "Client sends KeyExchange and ChangeCipherSpec"},
        {"name": "Finished", "startMessageId": 15, "endMessageId": 16, "description": "Both sides exchange Finished messages, encrypted tunnel established"},
    ]

    radius_messages = [
        {"id": 1, "relatedEapMessageId": 1, "timestamp": 0.001, "direction": "auth_to_server", "radiusCode": "Access-Request", "radiusAttributes": {"User-Name": "", "NAS-IP-Address": "192.168.1.1", "NAS-Port": "0", "EAP-Message": "EAPOL-Start"}},
        {"id": 2, "relatedEapMessageId": 2, "timestamp": 0.001, "direction": "server_to_auth", "radiusCode": "Access-Challenge", "radiusAttributes": {"EAP-Message": "EAP-Request/Identity", "State": "session-01"}},
        {"id": 3, "relatedEapMessageId": 3, "timestamp": 0.016, "direction": "auth_to_server", "radiusCode": "Access-Request", "radiusAttributes": {"User-Name": "user@example.com", "NAS-IP-Address": "192.168.1.1", "NAS-Port": "0", "EAP-Message": "EAP-Response/Identity"}},
        {"id": 4, "relatedEapMessageId": 4, "timestamp": 0.024, "direction": "server_to_auth", "radiusCode": "Access-Challenge", "radiusAttributes": {"EAP-Message": "EAP-Request/MD5-Challenge", "State": "session-02"}},
        {"id": 5, "relatedEapMessageId": 5, "timestamp": 0.041, "direction": "auth_to_server", "radiusCode": "Access-Request", "radiusAttributes": {"User-Name": "user@example.com", "NAS-IP-Address": "192.168.1.1", "NAS-Port": "0", "EAP-Message": "EAP-Response/MD5-Challenge"}},
        {"id": 6, "relatedEapMessageId": 6, "timestamp": 0.059, "direction": "server_to_auth", "radiusCode": "Access-Challenge", "radiusAttributes": {"EAP-Message": "EAP-Request/EAP-TLS", "State": "session-03"}},
        {"id": 7, "relatedEapMessageId": 7, "timestamp": 0.076, "direction": "auth_to_server", "radiusCode": "Access-Request", "radiusAttributes": {"User-Name": "user@example.com", "NAS-IP-Address": "192.168.1.1", "NAS-Port": "0", "EAP-Message": "EAP-Response/EAP-TLS"}},
        {"id": 8, "relatedEapMessageId": 10, "timestamp": 0.119, "direction": "server_to_auth", "radiusCode": "Access-Challenge", "radiusAttributes": {"EAP-Message": "EAP-Request/EAP-TLS", "State": "session-04"}},
        {"id": 9, "relatedEapMessageId": 12, "timestamp": 0.131, "direction": "auth_to_server", "radiusCode": "Access-Request", "radiusAttributes": {"User-Name": "user@example.com", "NAS-IP-Address": "192.168.1.1", "NAS-Port": "0", "EAP-Message": "EAP-Response/EAP-TLS"}},
        {"id": 10, "relatedEapMessageId": 13, "timestamp": 0.199, "direction": "server_to_auth", "radiusCode": "Access-Challenge", "radiusAttributes": {"EAP-Message": "EAP-Request/EAP-TLS", "State": "session-05"}},
        {"id": 11, "relatedEapMessageId": 14, "timestamp": 0.251, "direction": "auth_to_server", "radiusCode": "Access-Request", "radiusAttributes": {"User-Name": "user@example.com", "NAS-IP-Address": "192.168.1.1", "NAS-Port": "0", "EAP-Message": "EAP-Response/EAP-TLS"}},
        {"id": 12, "relatedEapMessageId": 15, "timestamp": 0.299, "direction": "server_to_auth", "radiusCode": "Access-Challenge", "radiusAttributes": {"EAP-Message": "EAP-Request/EAP-TLS", "State": "session-06"}},
        {"id": 13, "relatedEapMessageId": 16, "timestamp": 0.306, "direction": "auth_to_server", "radiusCode": "Access-Request", "radiusAttributes": {"User-Name": "user@example.com", "NAS-IP-Address": "192.168.1.1", "NAS-Port": "0", "EAP-Message": "EAP-Response/EAP-TLS"}},
        {"id": 14, "relatedEapMessageId": 17, "timestamp": 0.349, "direction": "server_to_auth", "radiusCode": "Access-Accept", "radiusAttributes": {"EAP-Message": "EAP-Success", "Session-Timeout": "3600"}},
    ]

    certificate_chain = [
        {
            "subject": "CN=localhost, O=Examp, L=Beijing, C=CN",
            "issuer": "CN=root-ca, O=Example CA, L=Beijing, C=CN",
            "serialNumber": "331eec636aab56486af0dd618427d8de9de6dc63",
            "notBefore": "2024-01-01T00:00:00+00:00",
            "notAfter": "2026-01-01T00:00:00+00:00",
            "san": ["localhost", "radius.example.com"],
            "isCA": False,
            "signatureAlgorithm": "sha256WithRSAEncryption",
            "fingerprintSha256": hashlib.sha256(b"sample_server_cert").hexdigest(),
            "derBase64": _pem_to_der_b64(SAMPLE_SERVER_CERT_PEM),
            "pem": SAMPLE_SERVER_CERT_PEM,
            "sourceMessageId": 11,
            "sourceFrame": 11,
        },
        {
            "subject": "CN=Example CA",
            "issuer": "CN=Example CA",
            "serialNumber": "331eec636aab56486af0dd618427d8de9de6dc63",
            "notBefore": "2024-01-01T00:00:00+00:00",
            "notAfter": "2028-01-01T00:00:00+00:00",
            "san": [],
            "isCA": True,
            "signatureAlgorithm": "sha256WithRSAEncryption",
            "fingerprintSha256": hashlib.sha256(b"sample_ca_cert").hexdigest(),
            "derBase64": _pem_to_der_b64(SAMPLE_CA_CERT_PEM),
            "pem": SAMPLE_CA_CERT_PEM,
            "sourceMessageId": 11,
            "sourceFrame": 11,
        },
    ]

    return {
        "id": "",
        "summary": {
            "totalFrames": 17,
            "eapolFrames": 17,
            "duration": 0.350,
            "identity": "user@example.com",
            "authMethod": "EAP-TLS",
        },
        "messages": messages,
        "tlsPhases": tls_phases,
        "radiusMessages": radius_messages,
        "certificateChain": certificate_chain,
    }
