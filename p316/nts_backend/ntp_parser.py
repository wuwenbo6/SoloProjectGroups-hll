import struct
import time
from dataclasses import dataclass, field
from typing import List, Optional
from enum import IntEnum


class NTPLeapIndicator(IntEnum):
    NO_WARNING = 0
    LAST_61_SEC = 1
    LAST_59_SEC = 2
    ALARM = 3


class NTPMode(IntEnum):
    RESERVED = 0
    SYMMETRIC_ACTIVE = 1
    SYMMETRIC_PASSIVE = 2
    CLIENT = 3
    SERVER = 4
    BROADCAST = 5
    CONTROL = 6
    PRIVATE = 7


NTP_HEADER_SIZE = 48
NTP_EPOCH_OFFSET = 2208988800


@dataclass
class NTPShort:
    seconds: int
    fraction: int

    def to_float(self) -> float:
        return self.seconds + self.fraction / (2**16)


@dataclass
class NTPTimestamp:
    seconds: int
    fraction: int

    def to_datetime_float(self) -> float:
        unix_secs = self.seconds - NTP_EPOCH_OFFSET
        frac = self.fraction / (2**32)
        return unix_secs + frac

    def to_datetime_str(self) -> str:
        dt = self.to_datetime_float()
        return time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(int(dt))) + f".{int((dt % 1) * 1e6):06d}"


@dataclass
class NTPHeader:
    leap_indicator: int
    version: int
    mode: int
    stratum: int
    poll: int
    precision: int
    root_delay: NTPShort
    root_dispersion: NTPShort
    reference_id: int
    reference_timestamp: NTPTimestamp
    originate_timestamp: NTPTimestamp
    receive_timestamp: NTPTimestamp
    transmit_timestamp: NTPTimestamp

    @property
    def leap_indicator_desc(self) -> str:
        try:
            return NTPLeapIndicator(self.leap_indicator).name
        except ValueError:
            return f"UNKNOWN({self.leap_indicator})"

    @property
    def mode_desc(self) -> str:
        try:
            return NTPMode(self.mode).name
        except ValueError:
            return f"UNKNOWN({self.mode})"

    def reference_id_str(self) -> str:
        if self.stratum == 1:
            return struct.pack("!I", self.reference_id).decode("ascii", errors="replace").strip("\x00")
        elif self.stratum > 1:
            return ".".join(str(b) for b in struct.pack("!I", self.reference_id))
        return "0.0.0.0"


@dataclass
class ExtensionField:
    field_type: int
    length: int
    value: bytes
    raw: bytes

    @property
    def field_type_hex(self) -> str:
        return f"0x{self.field_type:04X}"

    @property
    def is_nts(self) -> bool:
        return self.field_type in (0x0104, 0x0204, 0x0304, 0x0404)

    @property
    def nts_type_name(self) -> str:
        mapping = {
            0x0104: "Unique Identifier",
            0x0204: "NTS Cookie",
            0x0304: "NTS Cookie Placeholder",
            0x0404: "NTS Authenticator",
        }
        return mapping.get(self.field_type, "Unknown")


@dataclass
class NTPPacket:
    header: NTPHeader
    extension_fields: List[ExtensionField] = field(default_factory=list)
    mac: bytes = b""
    raw: bytes = b""

    @property
    def has_extensions(self) -> bool:
        return len(self.extension_fields) > 0

    @property
    def nts_extensions(self) -> List[ExtensionField]:
        return [ef for ef in self.extension_fields if ef.is_nts]


def _parse_ntp_short(data: bytes) -> NTPShort:
    secs, frac = struct.unpack("!HH", data[:4])
    return NTPShort(seconds=secs, fraction=frac)


def _parse_ntp_timestamp(data: bytes) -> NTPTimestamp:
    secs, frac = struct.unpack("!II", data[:8])
    return NTPTimestamp(seconds=secs, fraction=frac)


def parse_ntp_header(data: bytes) -> NTPHeader:
    if len(data) < NTP_HEADER_SIZE:
        raise ValueError(f"NTP header requires {NTP_HEADER_SIZE} bytes, got {len(data)}")

    first_byte = data[0]
    li = (first_byte >> 6) & 0x03
    vn = (first_byte >> 3) & 0x07
    mode = first_byte & 0x07

    stratum = data[1]
    poll = data[2]
    precision = data[3]

    root_delay = _parse_ntp_short(data[4:8])
    root_dispersion = _parse_ntp_short(data[8:12])
    reference_id = struct.unpack("!I", data[12:16])[0]

    ref_ts = _parse_ntp_timestamp(data[16:24])
    org_ts = _parse_ntp_timestamp(data[24:32])
    rx_ts = _parse_ntp_timestamp(data[32:40])
    tx_ts = _parse_ntp_timestamp(data[40:48])

    return NTPHeader(
        leap_indicator=li,
        version=vn,
        mode=mode,
        stratum=stratum,
        poll=poll,
        precision=precision,
        root_delay=root_delay,
        root_dispersion=root_dispersion,
        reference_id=reference_id,
        reference_timestamp=ref_ts,
        originate_timestamp=org_ts,
        receive_timestamp=rx_ts,
        transmit_timestamp=tx_ts,
    )


def parse_extension_fields(data: bytes) -> List[ExtensionField]:
    fields = []
    offset = 0

    while offset + 4 <= len(data):
        field_type, length = struct.unpack("!HH", data[offset:offset + 4])

        if length < 4:
            break

        if offset + length > len(data):
            remaining = data[offset:]
            fields.append(ExtensionField(
                field_type=field_type,
                length=len(remaining),
                value=remaining[4:],
                raw=remaining,
            ))
            break

        raw = data[offset:offset + length]
        value = data[offset + 4:offset + length]

        padding_len = (4 - (length % 4)) % 4
        actual_value_len = length - 4 - padding_len
        if actual_value_len < 0:
            actual_value_len = 0
        value = value[:actual_value_len]

        fields.append(ExtensionField(
            field_type=field_type,
            length=length,
            value=value,
            raw=raw,
        ))

        padded_length = length + padding_len
        offset += padded_length

    return fields


def parse_ntp_packet(data: bytes) -> NTPPacket:
    if len(data) < NTP_HEADER_SIZE:
        raise ValueError(f"NTP packet too short: {len(data)} bytes")

    header = parse_ntp_header(data[:NTP_HEADER_SIZE])

    ext_fields = []
    mac = b""

    remaining = data[NTP_HEADER_SIZE:]

    if len(remaining) > 0:
        if len(remaining) >= 4:
            first_type = struct.unpack("!H", remaining[:2])[0]
            if first_type != 0 and len(remaining) > 28:
                ext_data = remaining[:-28]
                mac = remaining[-28:]
                ext_fields = parse_extension_fields(ext_data)
            elif first_type != 0:
                ext_fields = parse_extension_fields(remaining)
            else:
                if len(remaining) >= 20:
                    mac = remaining[-20:]
                else:
                    mac = remaining
        else:
            mac = remaining

    return NTPPacket(
        header=header,
        extension_fields=ext_fields,
        mac=mac,
        raw=data,
    )


def build_ntp_packet(
    mode: int = 3,
    version: int = 4,
    stratum: int = 0,
    poll: int = 6,
    precision: int = -20,
    reference_id: int = 0,
    originate_ts: Optional[NTPTimestamp] = None,
    receive_ts: Optional[NTPTimestamp] = None,
    transmit_ts: Optional[NTPTimestamp] = None,
    extension_fields: Optional[List[ExtensionField]] = None,
) -> bytes:
    first_byte = (0 << 6) | (version << 3) | mode

    header = struct.pack("!BBbb", first_byte, stratum, poll, precision)
    header += struct.pack("!HH", 0, 0)
    header += struct.pack("!HH", 0, 0)
    header += struct.pack("!I", reference_id)

    for ts in (None, originate_ts, receive_ts, transmit_ts):
        if ts is None:
            header += struct.pack("!II", 0, 0)
        else:
            header += struct.pack("!II", ts.seconds, ts.fraction)

    ext_bytes = b""
    if extension_fields:
        for ef in extension_fields:
            padded_len = ef.length + (4 - ef.length % 4) % 4
            ext_bytes += struct.pack("!HH", ef.field_type, ef.length)
            ext_bytes += ef.value
            padding = padded_len - ef.length
            if padding > 0:
                ext_bytes += b"\x00" * padding

    mac_placeholder = b"\x00" * 28

    return header + ext_bytes + mac_placeholder


def build_nts_extension_field(field_type: int, value: bytes) -> ExtensionField:
    length = 4 + len(value)
    return ExtensionField(
        field_type=field_type,
        length=length,
        value=value,
        raw=struct.pack("!HH", field_type, length) + value,
    )
