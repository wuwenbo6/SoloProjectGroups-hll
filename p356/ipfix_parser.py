import hashlib
import struct
import socket
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional, Callable, List, Tuple, Any


IP_ANONYMIZATION_FIELDS = {
    8, 12, 15, 18, 47,
    27, 28, 48,
    130, 131, 132, 133,
}


class IPAnonymizer:
    IPV4_PREFIX_FIELDS = {
        "sourceIPv4Address", "destinationIPv4Address",
        "ipNextHopIPv4Address", "bgpNextHopIPv4Address",
        "mplsTopLabelIPv4Address",
        "sourceIPv4AddressPrefix", "destinationIPv4AddressPrefix",
    }
    IPV6_PREFIX_FIELDS = {
        "sourceIPv6Address", "destinationIPv6Address",
        "mplsTopLabelIPv6Address",
        "sourceIPv6AddressPrefix", "destinationIPv6AddressPrefix",
    }

    def __init__(self, secret_key: str = "ipfix-anonymizer-default-key", prefix_len: int = 24):
        self.secret_key = secret_key.encode("utf-8")
        self.prefix_len = prefix_len
        self._cache: dict = {}

    def _hash_bytes(self, data: bytes) -> bytes:
        return hashlib.sha256(self.secret_key + data).digest()

    def anonymize_ipv4(self, ip_str: str) -> str:
        if ip_str == "N/A":
            return ip_str
        try:
            parts = ip_str.split(".")
            if len(parts) != 4:
                return self._hash_full(ip_str)
            prefix_octets = self.prefix_len // 8
            if prefix_octets >= 4:
                h = self._hash_bytes(ip_str.encode("utf-8"))
                anon_parts = []
                for i in range(4):
                    val = int(parts[i])
                    anon_val = val ^ (h[i] % 256)
                    anon_parts.append(str(anon_val))
                return ".".join(anon_parts)
            prefix_parts = parts[:prefix_octets]
            suffix_parts = parts[prefix_octets:]
            suffix_str = ".".join(suffix_parts)
            h = self._hash_bytes(suffix_str.encode("utf-8"))
            anon_suffix = []
            for i in range(len(suffix_parts)):
                val = int(suffix_parts[i])
                anon_val = val ^ (h[i] % 256)
                anon_suffix.append(str(anon_val))
            return ".".join(prefix_parts + anon_suffix)
        except Exception:
            return self._hash_full(ip_str)

    def anonymize_ipv6(self, ip_str: str) -> str:
        if ip_str == "N/A":
            return ip_str
        try:
            addr = socket.inet_pton(socket.AF_INET6, ip_str)
            prefix_bytes = min(self.prefix_len // 8, 16)
            if prefix_bytes >= 16:
                h = self._hash_bytes(addr)
                anon_addr = bytes(a ^ b for a, b in zip(addr, h[:16]))
                return socket.inet_ntop(socket.AF_INET6, anon_addr)
            prefix = addr[:prefix_bytes]
            suffix = addr[prefix_bytes:]
            h = self._hash_bytes(suffix)
            anon_suffix = bytes(a ^ b for a, b in zip(suffix, h[:len(suffix)]))
            anon_addr = prefix + anon_suffix
            return socket.inet_ntop(socket.AF_INET6, anon_addr)
        except Exception:
            return self._hash_full(ip_str)

    def _hash_full(self, ip_str: str) -> str:
        if ip_str in self._cache:
            return self._cache[ip_str]
        h = hashlib.sha256(self.secret_key + ip_str.encode("utf-8")).hexdigest()
        result = f"anon-{h[:12]}"
        self._cache[ip_str] = result
        return result

    def anonymize_field(self, ie_id: int, ie_name: str, value: Any) -> Any:
        if ie_id not in IP_ANONYMIZATION_FIELDS:
            if ie_name in self.IPV4_PREFIX_FIELDS or ie_name in self.IPV6_PREFIX_FIELDS:
                pass
            else:
                return value
        if not isinstance(value, str):
            return value
        if ":" in value and not value.replace(":", "").replace(".", "").replace(" ", "").isdigit():
            return self.anonymize_ipv6(value)
        if "." in value and value.replace(".", "").isdigit():
            return self.anonymize_ipv4(value)
        return self._hash_full(value)

    def clear_cache(self):
        self._cache.clear()

IPFIX_VERSION = 10

SET_TEMPLATE = 2
SET_OPTIONS_TEMPLATE = 3
SET_DATA_MIN = 256

VARIABLE_LENGTH = 65535

DEFAULT_TEMPLATE_LIFETIME = 1800

TEMPLATE_WITHDRAWAL_ALL = 0
TEMPLATE_WITHDRAWAL_ALL_OPTIONS = 1

IE_NAME_MAP = {
    1: "octetDeltaCount",
    2: "packetDeltaCount",
    3: "deltaFlowCount",
    4: "protocolIdentifier",
    5: "ipClassOfService",
    6: "tcpControlBits",
    7: "sourceTransportPort",
    8: "sourceIPv4Address",
    9: "sourceIPv4PrefixLength",
    10: "ingressInterface",
    11: "destinationTransportPort",
    12: "destinationIPv4Address",
    13: "destinationIPv4PrefixLength",
    14: "egressInterface",
    15: "ipNextHopIPv4Address",
    16: "bgpSourceAsNumber",
    17: "bgpDestinationAsNumber",
    18: "bgpNextHopIPv4Address",
    19: "postMCastPacketDeltaCount",
    20: "postMCastOctetDeltaCount",
    21: "flowEndSysUpTime",
    22: "flowStartSysUpTime",
    23: "postOctetDeltaCount",
    24: "postPacketDeltaCount",
    27: "sourceIPv6Address",
    28: "destinationIPv6Address",
    29: "sourceIPv6PrefixLength",
    30: "destinationIPv6PrefixLength",
    31: "flowLabelIPv6",
    32: "icmpTypeCodeIPv4",
    33: "igmpType",
    34: "samplingInterval",
    35: "samplingAlgorithm",
    36: "flowActiveTimeout",
    37: "flowIdleTimeout",
    38: "engineType",
    39: "engineId",
    40: "exportedOctetTotalCount",
    41: "exportedMessageTotalCount",
    42: "exportedFlowRecordTotalCount",
    43: "ipv4RouterSc",
    44: "sourceIPv4Prefix",
    45: "destinationIPv4Prefix",
    46: "mplsTopLabelType",
    47: "mplsTopLabelIPv4Address",
    48: "mplsTopLabelIPv6Address",
    56: "packetTotalCount",
    57: "octetTotalCount",
    58: "flowStartSeconds",
    59: "flowEndSeconds",
    60: "flowStartMilliseconds",
    61: "flowEndMilliseconds",
    128: "bgpNextHopAdjacentPrefix",
    129: "postIpClassOfService",
    130: "sourceIPv4AddressPrefix",
    131: "destinationIPv4AddressPrefix",
    132: "sourceIPv6AddressPrefix",
    133: "destinationIPv6AddressPrefix",
    134: "postOctetTotalCount",
    135: "postPacketTotalCount",
    136: "flowDirection",
    137: "flowEndReason",
    138: "commonPropertiesId",
    139: "observationPointId",
    140: "observationDomainId",
    141: "exportingProcessId",
    142: "lineCardId",
    143: "portId",
    144: "meteringProcessId",
    145: "templateId",
    146: "wlanChannelId",
    147: "wlanSsid",
    148: "dot11StatusCategory",
    149: "dot11StatusCode",
    150: "dot11QosControl",
    151: "dot11ManagementFrame",
    152: "dot11DataFrameType",
    153: "dot11StaMacAddress",
    154: "dot11ClientMacAddress",
    155: "dot11Bssid",
    163: "dot1qVlanId",
    164: "dot1qPriority",
    165: "dot1qCustomerVlanId",
    166: "dot1qCustomerPriority",
    167: "ipVersion",
    168: "flowId",
    169: "sourceId",
    170: "postIpDiffServCodePoint",
    171: "dot1qCustomerDEI",
    172: "nlpId",
    173: "dot1qDEI",
    174: "virtualSegmentId",
    175: "postIpPrecedence",
    176: "postFragmentFlags",
    177: "postIpTotalLength",
    178: "postIpProtocol",
    179: "postIpTtl",
    180: "ipPayloadLength",
    181: "ipPrecedence",
    182: "ipTotalLength",
    183: "fragmentFlags",
    184: "fragmentOffset",
    185: "interfaceName",
    186: "interfaceDescription",
    187: "interfaceType",
    188: "icmpTypeCodeIPv6",
    189: "mibInterfaceIfIndex",
    190: "mplsPayloadLength",
    191: "mplsLabelStackLength",
    192: "mplsTopLabelStackSection",
    193: "mplsLabelStackSection2",
    194: "mplsLabelStackSection3",
    195: "mplsLabelStackSection4",
    196: "mplsLabelStackSection5",
    197: "mplsLabelStackSection6",
    198: "mplsLabelStackSection7",
    199: "mplsLabelStackSection8",
    200: "mplsLabelStackSection9",
    201: "mplsLabelStackSection10",
    210: "paddingOctets",
    211: "droppedOctetDeltaCount",
    212: "droppedPacketDeltaCount",
    213: "flowEndReason",
    214: "fragmentFlags",
    215: "fragmentOffset",
    216: "postMplsTopLabelExp",
    217: "tcpWindowSize",
    218: "tcpSynTotalCount",
    219: "tcpFinTotalCount",
    220: "tcpRstTotalCount",
    221: "tcpPshTotalCount",
    222: "tcpAckTotalCount",
    223: "tcpUrgTotalCount",
    224: "postIpTotalLength",
    225: "ipPrecedence",
    226: "postIpPrecedence",
    227: "dot1qCustomerVlanId",
    228: "postIpDiffServCodePoint",
    229: "ipDiffServCodePoint",
    230: "ipClassOfService",
    231: "postIpClassOfService",
    232: "mplsTopLabelExp",
    233: "ipPayloadLength",
    234: "postIpPayloadLength",
}


class InformationElement:
    def __init__(self, ie_id: int, length: int, enterprise: bool = False, enterprise_number: int = 0):
        self.ie_id = ie_id
        self.length = length
        self.enterprise = enterprise
        self.enterprise_number = enterprise_number

    @property
    def name(self) -> str:
        return IE_NAME_MAP.get(self.ie_id, f"unknown_{self.ie_id}")

    @property
    def is_variable_length(self) -> bool:
        return self.length == VARIABLE_LENGTH

    def __repr__(self) -> str:
        len_str = "variable" if self.is_variable_length else str(self.length)
        return f"IE({self.name}, len={len_str})"


class Template:
    def __init__(self, template_id: int, domain_id: int, lifetime: int = DEFAULT_TEMPLATE_LIFETIME):
        self.template_id = template_id
        self.domain_id = domain_id
        self.ies: List[InformationElement] = []
        self.scope_ies: List[InformationElement] = []
        self.is_options = False
        self.lifetime = lifetime
        self.created_at = datetime.now()
        self.last_used = datetime.now()
        self.is_withdrawn = False

    @property
    def expires_at(self) -> datetime:
        return self.created_at + timedelta(seconds=self.lifetime)

    @property
    def remaining_lifetime(self) -> float:
        remaining = (self.expires_at - datetime.now()).total_seconds()
        return max(0.0, remaining)

    @property
    def is_expired(self) -> bool:
        if self.is_withdrawn:
            return True
        return datetime.now() > self.expires_at

    @property
    def has_variable_length(self) -> bool:
        for ie in self.ies:
            if ie.is_variable_length:
                return True
        for ie in self.scope_ies:
            if ie.is_variable_length:
                return True
        return False

    @property
    def total_length(self) -> int:
        if self.has_variable_length:
            return -1
        total = 0
        for ie in self.ies:
            total += ie.length
        for ie in self.scope_ies:
            total += ie.length
        return total

    def add_ie(self, ie: InformationElement):
        self.ies.append(ie)

    def add_scope_ie(self, ie: InformationElement):
        self.scope_ies.append(ie)

    def refresh(self, lifetime: Optional[int] = None):
        self.created_at = datetime.now()
        self.is_withdrawn = False
        if lifetime is not None:
            self.lifetime = lifetime

    def touch(self):
        self.last_used = datetime.now()

    def withdraw(self):
        self.is_withdrawn = True

    def __repr__(self) -> str:
        status = "withdrawn" if self.is_withdrawn else ("expired" if self.is_expired else "active")
        return (f"Template(id={self.template_id}, domain={self.domain_id}, "
                f"ies={len(self.ies)}, status={status}, "
                f"remaining={self.remaining_lifetime:.0f}s)")


class DataRecord:
    def __init__(self, template_id: int, domain_id: int):
        self.template_id = template_id
        self.domain_id = domain_id
        self.fields: dict = {}
        self.timestamp = datetime.now()

    def add_field(self, ie_name: str, value: Any):
        self.fields[ie_name] = value

    def get(self, key: str, default: Any = None) -> Any:
        return self.fields.get(key, default)

    @property
    def source_ip(self) -> str:
        return self.fields.get("sourceIPv4Address", self.fields.get("sourceIPv6Address", "N/A"))

    @property
    def destination_ip(self) -> str:
        return self.fields.get("destinationIPv4Address", self.fields.get("destinationIPv6Address", "N/A"))

    @property
    def source_port(self):
        return self.fields.get("sourceTransportPort", "N/A")

    @property
    def destination_port(self):
        return self.fields.get("destinationTransportPort", "N/A")

    @property
    def protocol(self) -> str:
        proto = self.fields.get("protocolIdentifier", 0)
        proto_map = {1: "ICMP", 6: "TCP", 17: "UDP", 41: "IPv6", 50: "ESP", 51: "AH", 89: "OSPF", 132: "SCTP"}
        return proto_map.get(proto, str(proto))

    def to_dict(self, anonymizer: Optional['IPAnonymizer'] = None) -> dict:
        src_ip = self.source_ip
        dst_ip = self.destination_ip
        fields = dict(self.fields)

        if anonymizer:
            src_ip = anonymizer.anonymize_ipv4(src_ip) if "." in src_ip and src_ip.replace(".", "").isdigit() else anonymizer.anonymize_ipv6(src_ip) if src_ip != "N/A" else src_ip
            dst_ip = anonymizer.anonymize_ipv4(dst_ip) if "." in dst_ip and dst_ip.replace(".", "").isdigit() else anonymizer.anonymize_ipv6(dst_ip) if dst_ip != "N/A" else dst_ip
            anon_fields = {}
            for k, v in self.fields.items():
                ie_id = None
                for _id, _name in IE_NAME_MAP.items():
                    if _name == k:
                        ie_id = _id
                        break
                if ie_id is not None:
                    anon_fields[k] = anonymizer.anonymize_field(ie_id, k, v)
                else:
                    anon_fields[k] = v
            fields = anon_fields

        return {
            "template_id": self.template_id,
            "domain_id": self.domain_id,
            "timestamp": self.timestamp.isoformat(),
            "source_ip": src_ip,
            "destination_ip": dst_ip,
            "source_port": self.source_port,
            "destination_port": self.destination_port,
            "protocol": self.protocol,
            "octets": self.fields.get("octetDeltaCount", self.fields.get("octetTotalCount", 0)),
            "packets": self.fields.get("packetDeltaCount", self.fields.get("packetTotalCount", 0)),
            "fields": fields
        }

    def __repr__(self) -> str:
        return (f"Record({self.source_ip}:{self.source_port} -> "
                f"{self.destination_ip}:{self.destination_port} "
                f"{self.protocol})")


class IPFIXParser:
    def __init__(self, default_template_lifetime: int = DEFAULT_TEMPLATE_LIFETIME):
        self.templates: dict = {}
        self.lock = threading.Lock()
        self.default_template_lifetime = default_template_lifetime
        self.template_expired_callbacks: List[Callable[[Template], None]] = []
        self.cleanup_thread = None
        self._cleanup_running = False
        self.missing_template_callbacks: List[Callable[[int, int], None]] = []

    def start_cleanup_thread(self):
        if self.cleanup_thread is None:
            self._cleanup_running = True
            self.cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
            self.cleanup_thread.start()

    def stop_cleanup_thread(self):
        self._cleanup_running = False
        if self.cleanup_thread:
            self.cleanup_thread.join(timeout=2)
            self.cleanup_thread = None

    def _cleanup_loop(self):
        while self._cleanup_running:
            self.cleanup_expired_templates()
            time.sleep(60)

    def on_template_expired(self, callback: Callable[[Template], None]):
        self.template_expired_callbacks.append(callback)

    def on_missing_template(self, callback: Callable[[int, int], None]):
        self.missing_template_callbacks.append(callback)

    def _get_template_key(self, domain_id: int, template_id: int) -> Tuple[int, int]:
        return (domain_id, template_id)

    def add_template(self, template: Template) -> bool:
        key = self._get_template_key(template.domain_id, template.template_id)
        is_new = True
        with self.lock:
            if key in self.templates:
                old = self.templates[key]
                template.lifetime = old.lifetime
                is_new = False
            self.templates[key] = template
        return is_new

    def get_template(self, domain_id: int, template_id: int) -> Optional[Template]:
        key = self._get_template_key(domain_id, template_id)
        with self.lock:
            template = self.templates.get(key)

        if template is None:
            for cb in self.missing_template_callbacks:
                try:
                    cb(domain_id, template_id)
                except Exception:
                    pass
            return None

        if template.is_expired:
            for cb in self.template_expired_callbacks:
                try:
                    cb(template)
                except Exception:
                    pass
            with self.lock:
                if key in self.templates and self.templates[key].is_expired:
                    del self.templates[key]
            for cb in self.missing_template_callbacks:
                try:
                    cb(domain_id, template_id)
                except Exception:
                    pass
            return None

        template.touch()
        return template

    def cleanup_expired_templates(self) -> int:
        expired_count = 0
        expired_templates = []

        with self.lock:
            for key, template in list(self.templates.items()):
                if template.is_expired:
                    expired_templates.append(template)
                    del self.templates[key]
                    expired_count += 1

        for template in expired_templates:
            for cb in self.template_expired_callbacks:
                try:
                    cb(template)
                except Exception:
                    pass

        return expired_count

    def get_template_count(self) -> int:
        with self.lock:
            count = 0
            for template in self.templates.values():
                if not template.is_expired:
                    count += 1
            return count

    def withdraw_template(self, domain_id: int, template_id: int) -> bool:
        key = self._get_template_key(domain_id, template_id)
        with self.lock:
            if key in self.templates:
                self.templates[key].withdraw()
                return True
        return False

    def withdraw_all_templates(self, domain_id: int, options_only: bool = False) -> int:
        count = 0
        with self.lock:
            for key, template in list(self.templates.items()):
                if key[0] == domain_id:
                    if options_only and not template.is_options:
                        continue
                    template.withdraw()
                    count += 1
        return count

    def parse_header(self, data: bytes) -> dict:
        if len(data) < 16:
            raise ValueError("Packet too short for IPFIX header")

        version, length, export_time, seq_num, domain_id = struct.unpack("!HHIII", data[:16])

        if version != IPFIX_VERSION:
            raise ValueError(f"Invalid IPFIX version: {version}")

        if length > len(data):
            raise ValueError(f"IPFIX packet length ({length}) exceeds actual buffer size ({len(data)})")

        return {
            "version": version,
            "length": length,
            "export_time": datetime.fromtimestamp(export_time),
            "sequence_number": seq_num,
            "observation_domain_id": domain_id
        }

    def _parse_ie(self, data: bytes, offset: int) -> Tuple[InformationElement, int]:
        raw = struct.unpack("!HH", data[offset:offset + 4])
        ie_id = raw[0]
        length = raw[1]
        enterprise = False
        enterprise_number = 0

        if ie_id & 0x8000:
            enterprise = True
            ie_id = ie_id & 0x7FFF
            enterprise_number = struct.unpack("!I", data[offset + 4:offset + 8])[0]
            return InformationElement(ie_id, length, enterprise, enterprise_number), offset + 8

        return InformationElement(ie_id, length), offset + 4

    def _parse_template_withdrawal(self, data: bytes, offset: int, set_length: int, domain_id: int) -> Tuple[List[int], int]:
        end_offset = offset + set_length - 4
        withdrawn = []

        while offset < end_offset:
            if offset + 4 > end_offset:
                break

            template_id, field_count = struct.unpack("!HH", data[offset:offset + 4])
            offset += 4

            if field_count == 0:
                if template_id == TEMPLATE_WITHDRAWAL_ALL:
                    self.withdraw_all_templates(domain_id, options_only=False)
                    withdrawn.append("all_templates")
                elif template_id == TEMPLATE_WITHDRAWAL_ALL_OPTIONS:
                    self.withdraw_all_templates(domain_id, options_only=True)
                    withdrawn.append("all_options_templates")
                else:
                    self.withdraw_template(domain_id, template_id)
                    withdrawn.append(template_id)

        return withdrawn, offset

    def _parse_template_set(self, data: bytes, offset: int, set_length: int, domain_id: int) -> Tuple[List[Template], List[int], int]:
        templates: List[Template] = []
        withdrawn: List[int] = []
        end_offset = offset + set_length - 4

        while offset < end_offset:
            if offset + 4 > end_offset:
                break

            template_id, field_count = struct.unpack("!HH", data[offset:offset + 4])
            offset += 4

            if field_count == 0:
                if template_id == TEMPLATE_WITHDRAWAL_ALL:
                    self.withdraw_all_templates(domain_id, options_only=False)
                    withdrawn.append("all_templates")
                elif template_id == TEMPLATE_WITHDRAWAL_ALL_OPTIONS:
                    self.withdraw_all_templates(domain_id, options_only=True)
                    withdrawn.append("all_options_templates")
                else:
                    self.withdraw_template(domain_id, template_id)
                    withdrawn.append(template_id)
                continue

            template = Template(template_id, domain_id, self.default_template_lifetime)

            for _ in range(field_count):
                ie, offset = self._parse_ie(data, offset)
                template.add_ie(ie)

            templates.append(template)
            self.add_template(template)

        return templates, withdrawn, offset

    def _parse_options_template_set(self, data: bytes, offset: int, set_length: int, domain_id: int) -> Tuple[List[Template], List[int], int]:
        templates: List[Template] = []
        withdrawn: List[int] = []
        end_offset = offset + set_length - 4

        while offset < end_offset:
            if offset + 6 > end_offset:
                break

            template_id, field_count, scope_field_count = struct.unpack("!HHH", data[offset:offset + 6])
            offset += 6

            if field_count == 0:
                if template_id == TEMPLATE_WITHDRAWAL_ALL:
                    self.withdraw_all_templates(domain_id, options_only=False)
                    withdrawn.append("all_templates")
                elif template_id == TEMPLATE_WITHDRAWAL_ALL_OPTIONS:
                    self.withdraw_all_templates(domain_id, options_only=True)
                    withdrawn.append("all_options_templates")
                else:
                    self.withdraw_template(domain_id, template_id)
                    withdrawn.append(template_id)
                continue

            template = Template(template_id, domain_id, self.default_template_lifetime)
            template.is_options = True

            for _ in range(scope_field_count):
                ie, offset = self._parse_ie(data, offset)
                template.add_scope_ie(ie)

            for _ in range(field_count - scope_field_count):
                ie, offset = self._parse_ie(data, offset)
                template.add_ie(ie)

            templates.append(template)
            self.add_template(template)

        return templates, withdrawn, offset

    def _read_variable_length(self, data: bytes, offset: int) -> Tuple[int, int]:
        if offset >= len(data):
            return 0, offset

        first_byte = data[offset]
        offset += 1

        if first_byte < 255:
            return first_byte, offset
        else:
            if offset + 1 >= len(data):
                return 0, offset
            length = struct.unpack("!H", data[offset:offset + 2])[0]
            offset += 2
            return length, offset

    def _decode_field(self, ie: InformationElement, data: bytes, offset: int) -> Tuple[Optional[Any], int]:
        ie_id = ie.ie_id
        length = ie.length

        if ie.is_variable_length:
            actual_length, offset = self._read_variable_length(data, offset)
            length = actual_length

        if offset + length > len(data):
            return None, offset

        if ie_id == 8 or ie_id == 12 or ie_id == 15 or ie_id == 18 or ie_id == 47:
            if length == 4:
                value = socket.inet_ntoa(data[offset:offset + 4])
            elif length == 16:
                value = socket.inet_ntop(socket.AF_INET6, data[offset:offset + 16])
            else:
                value = data[offset:offset + length].hex()

        elif ie_id == 27 or ie_id == 28 or ie_id == 48:
            if length == 16:
                value = socket.inet_ntop(socket.AF_INET6, data[offset:offset + 16])
            else:
                value = data[offset:offset + length].hex()

        elif ie_id in [185, 186, 147]:
            try:
                value = data[offset:offset + length].rstrip(b'\x00').decode('utf-8')
            except UnicodeDecodeError:
                value = data[offset:offset + length].hex()

        elif length == 1:
            value = struct.unpack("!B", data[offset:offset + 1])[0]

        elif length == 2:
            value = struct.unpack("!H", data[offset:offset + 2])[0]

        elif length == 3:
            value = struct.unpack("!I", b'\x00' + data[offset:offset + 3])[0]

        elif length == 4:
            value = struct.unpack("!I", data[offset:offset + 4])[0]

        elif length == 5:
            value = struct.unpack("!Q", b'\x00' * 3 + data[offset:offset + 5])[0]

        elif length == 6:
            value = struct.unpack("!Q", b'\x00' * 2 + data[offset:offset + 6])[0]

        elif length == 7:
            value = struct.unpack("!Q", b'\x00' + data[offset:offset + 7])[0]

        elif length == 8:
            value = struct.unpack("!Q", data[offset:offset + 8])[0]

        elif length == 16:
            high, low = struct.unpack("!QQ", data[offset:offset + 16])
            value = (high << 64) | low

        else:
            try:
                value = data[offset:offset + length].rstrip(b'\x00').decode('utf-8')
            except UnicodeDecodeError:
                value = data[offset:offset + length].hex()

        return value, offset + length

    def _parse_data_set(self, data: bytes, offset: int, set_length: int, domain_id: int, template_id: int) -> Tuple[List[DataRecord], int]:
        records: List[DataRecord] = []
        template = self.get_template(domain_id, template_id)

        if not template:
            return records, offset + set_length - 4

        end_offset = offset + set_length - 4

        while offset < end_offset:
            start_offset = offset
            record = DataRecord(template_id, domain_id)

            decode_error = False
            for ie in template.scope_ies:
                value, offset = self._decode_field(ie, data, offset)
                if value is None:
                    decode_error = True
                    break
                record.add_field(ie.name, value)

            if not decode_error:
                for ie in template.ies:
                    value, offset = self._decode_field(ie, data, offset)
                    if value is None:
                        decode_error = True
                        break
                    record.add_field(ie.name, value)

            if decode_error:
                offset = start_offset
                break

            if offset > end_offset:
                break

            records.append(record)

            if not template.has_variable_length:
                if offset + template.total_length > end_offset:
                    break

        return records, offset

    def parse_packet(self, data: bytes) -> dict:
        header = self.parse_header(data)
        offset = 16
        all_templates: List[Template] = []
        all_withdrawn: List[int] = []
        all_records: List[DataRecord] = []
        domain_id = header["observation_domain_id"]

        while offset < header["length"]:
            if offset + 4 > len(data):
                break

            set_id, set_length = struct.unpack("!HH", data[offset:offset + 4])
            offset += 4

            if set_length < 4:
                break

            if set_id == SET_TEMPLATE:
                templates, withdrawn, offset = self._parse_template_set(data, offset, set_length, domain_id)
                all_templates.extend(templates)
                all_withdrawn.extend(withdrawn)

            elif set_id == SET_OPTIONS_TEMPLATE:
                templates, withdrawn, offset = self._parse_options_template_set(data, offset, set_length, domain_id)
                all_templates.extend(templates)
                all_withdrawn.extend(withdrawn)

            elif set_id >= SET_DATA_MIN:
                records, offset = self._parse_data_set(data, offset, set_length, domain_id, set_id)
                all_records.extend(records)

            else:
                offset += set_length - 4

        return {
            "header": header,
            "templates": all_templates,
            "withdrawn": all_withdrawn,
            "records": all_records
        }
