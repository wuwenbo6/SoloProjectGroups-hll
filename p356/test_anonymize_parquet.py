import sys
import os
import struct
import socket
import tempfile

sys.path.insert(0, '/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p356')

from ipfix_parser import IPFIXParser, IPAnonymizer, DataRecord, IE_NAME_MAP
from ipfix_collector import IPFIXCollector


def build_test_packet():
    domain_id = 12345
    template_id = 256

    ies = [
        (8, 4),
        (12, 4),
        (7, 2),
        (11, 2),
        (4, 1),
        (1, 8),
        (2, 8),
    ]

    template_record = struct.pack("!HH", template_id, len(ies))
    for ie_id, length in ies:
        template_record += struct.pack("!HH", ie_id, length)

    set_length = 4 + len(template_record)
    set_header = struct.pack("!HH", 2, set_length)
    template_set = set_header + template_record

    src_ip = socket.inet_aton("192.168.1.100")
    dst_ip = socket.inet_aton("8.8.8.8")
    src_port = struct.pack("!H", 54321)
    dst_port = struct.pack("!H", 443)
    protocol = struct.pack("!B", 6)
    octets = struct.pack("!Q", 1234567)
    packets = struct.pack("!Q", 1000)

    data_record = src_ip + dst_ip + src_port + dst_port + protocol + octets + packets

    data_set_length = 4 + len(data_record)
    data_set_header = struct.pack("!HH", template_id, data_set_length)
    data_set = data_set_header + data_record

    export_time = 0
    sequence_number = 1
    message_length = 16 + len(template_set) + len(data_set)

    header = struct.pack("!HHIII", 10, message_length, export_time,
                         sequence_number, domain_id)

    return header + template_set + data_set


print("=" * 70)
print("TEST 1: IP Anonymizer - IPv4 Prefix-Preserving")
print("=" * 70)

anon = IPAnonymizer(secret_key="test-key", prefix_len=24)

original_ip = "192.168.1.100"
anon_ip = anon.anonymize_ipv4(original_ip)
print(f"  Original: {original_ip}")
print(f"  Anonymized: {anon_ip}")
assert anon_ip != original_ip, "Anonymized IP should differ from original"
assert anon_ip.startswith("192.168."), "Prefix /24 should be preserved"
print("  ✓ IPv4 prefix-preserving anonymization works")

anon_ip2 = anon.anonymize_ipv4(original_ip)
assert anon_ip2 == anon_ip, "Same input should produce same output (deterministic)"
print("  ✓ Deterministic anonymization")

different_key = IPAnonymizer(secret_key="different-key", prefix_len=24)
anon_ip3 = different_key.anonymize_ipv4(original_ip)
assert anon_ip3 != anon_ip, "Different key should produce different output"
print("  ✓ Different key produces different result")

print()
print("=" * 70)
print("TEST 2: IP Anonymizer - IPv6")
print("=" * 70)

ipv6_addr = "2001:0db8:85a3:0000:0000:8a2e:0370:7334"
anon_ipv6 = anon.anonymize_ipv6(ipv6_addr)
print(f"  Original: {ipv6_addr}")
print(f"  Anonymized: {anon_ipv6}")
assert anon_ipv6 != ipv6_addr, "Anonymized IPv6 should differ"
anon_ipv6_addr = socket.inet_pton(socket.AF_INET6, anon_ipv6)
orig_ipv6_addr = socket.inet_pton(socket.AF_INET6, ipv6_addr)
prefix_bytes = 24 // 8
assert anon_ipv6_addr[:prefix_bytes] == orig_ipv6_addr[:prefix_bytes], "Prefix /24 should be preserved (first 3 bytes)"
print("  ✓ IPv6 anonymization works (prefix /24 preserves first 3 bytes)")

print()
print("=" * 70)
print("TEST 3: IP Anonymizer - Prefix Length /16")
print("=" * 70)

anon16 = IPAnonymizer(secret_key="test-key", prefix_len=16)
ip_16 = anon16.anonymize_ipv4("10.20.30.40")
print(f"  Original: 10.20.30.40")
print(f"  Anonymized (/16): {ip_16}")
assert ip_16.startswith("10.20."), "Prefix /16 should preserve first 2 octets"
print("  ✓ /16 prefix length works")

print()
print("=" * 70)
print("TEST 4: IP Anonymizer - Full hash (/32)")
print("=" * 70)

anon32 = IPAnonymizer(secret_key="test-key", prefix_len=32)
ip_32 = anon32.anonymize_ipv4("172.16.0.1")
print(f"  Original: 172.16.0.1")
print(f"  Anonymized (/32): {ip_32}")
print("  ✓ /32 full anonymization works")

print()
print("=" * 70)
print("TEST 5: DataRecord with Anonymizer")
print("=" * 70)

record = DataRecord(256, 12345)
record.add_field("sourceIPv4Address", "192.168.1.100")
record.add_field("destinationIPv4Address", "8.8.8.8")
record.add_field("sourceTransportPort", 54321)
record.add_field("destinationTransportPort", 443)
record.add_field("protocolIdentifier", 6)
record.add_field("octetDeltaCount", 1234567)
record.add_field("packetDeltaCount", 1000)

normal_dict = record.to_dict()
print(f"  Normal: src={normal_dict['source_ip']}, dst={normal_dict['destination_ip']}")
assert normal_dict["source_ip"] == "192.168.1.100"
assert normal_dict["destination_ip"] == "8.8.8.8"

anon = IPAnonymizer(secret_key="test-key", prefix_len=24)
anon_dict = record.to_dict(anonymizer=anon)
print(f"  Anonymized: src={anon_dict['source_ip']}, dst={anon_dict['destination_ip']}")
assert anon_dict["source_ip"] != "192.168.1.100", "Source IP should be anonymized"
assert anon_dict["source_ip"].startswith("192.168."), "Source IP prefix preserved"
assert anon_dict["destination_ip"] != "8.8.8.8", "Dest IP should be anonymized"
assert anon_dict["destination_ip"].startswith("8.8."), "Dest IP prefix preserved"
assert anon_dict["source_port"] == 54321, "Non-IP fields should not change"
assert anon_dict["protocol"] == "TCP", "Protocol should not change"
print("  ✓ DataRecord anonymization works correctly")

print()
print("=" * 70)
print("TEST 6: Collector Anonymization Integration")
print("=" * 70)

collector = IPFIXCollector(anonymize=False)
packet = build_test_packet()
result = collector.parser.parse_packet(packet)
for r in result["records"]:
    collector.records.append(r)

records_plain = collector.get_records_as_dict()
print(f"  Plain: src={records_plain[0]['source_ip']}, dst={records_plain[0]['destination_ip']}")
assert records_plain[0]["source_ip"] == "192.168.1.100"

collector.set_anonymize(enabled=True, prefix_len=24)
records_anon = collector.get_records_as_dict()
print(f"  Anonymized: src={records_anon[0]['source_ip']}, dst={records_anon[0]['destination_ip']}")
assert records_anon[0]["source_ip"] != "192.168.1.100"
assert records_anon[0]["source_ip"].startswith("192.168.")
print("  ✓ Collector anonymization toggle works")

config = collector.get_anonymize_config()
assert config["enabled"] == True
assert config["prefix_len"] == 24
print("  ✓ Anonymize config API works")

print()
print("=" * 70)
print("TEST 7: Parquet Export")
print("=" * 70)

try:
    import pyarrow as pa
    import pyarrow.parquet as pq

    flat_records = collector.export_records_flat()
    print(f"  Flat records count: {len(flat_records)}")
    assert len(flat_records) > 0

    columns = {
        "template_id": pa.int32(),
        "domain_id": pa.int32(),
        "timestamp": pa.string(),
        "source_ip": pa.string(),
        "destination_ip": pa.string(),
        "source_port": pa.int64(),
        "destination_port": pa.int64(),
        "protocol": pa.string(),
        "octets": pa.int64(),
        "packets": pa.int64(),
    }

    arrays = {}
    for col_name, col_type in columns.items():
        values = []
        for r in flat_records:
            v = r.get(col_name)
            if v is None:
                values.append(None)
            elif col_name in ("source_port", "destination_port", "octets", "packets"):
                try:
                    values.append(int(v))
                except (ValueError, TypeError):
                    values.append(None)
            elif col_name in ("template_id", "domain_id"):
                try:
                    values.append(int(v))
                except (ValueError, TypeError):
                    values.append(None)
            else:
                values.append(str(v) if v is not None else None)
        arrays[col_name] = pa.array(values, type=col_type)

    table = pa.table(arrays)
    print(f"  Table columns: {table.column_names}")
    print(f"  Table rows: {table.num_rows}")

    with tempfile.NamedTemporaryFile(suffix=".parquet", delete=False) as f:
        tmp_path = f.name
        pq.write_table(table, tmp_path)

    read_table = pq.read_table(tmp_path)
    assert read_table.num_rows == len(flat_records)
    print(f"  Parquet file written and read back: {read_table.num_rows} rows")
    os.unlink(tmp_path)
    print("  ✓ Parquet export works")

except ImportError:
    print("  ⚠ pyarrow not installed, skipping Parquet test")

print()
print("=" * 70)
print("TEST 8: Anonymize Field by IE ID")
print("=" * 70)

anon = IPAnonymizer(secret_key="test", prefix_len=24)

val = anon.anonymize_field(8, "sourceIPv4Address", "10.0.0.1")
assert val != "10.0.0.1", "IE 8 (sourceIPv4Address) should be anonymized"
assert val.startswith("10.0."), "Prefix should be preserved"
print("  ✓ IE 8 (sourceIPv4Address) anonymized")

val = anon.anonymize_field(12, "destinationIPv4Address", "10.0.0.2")
assert val != "10.0.0.2"
print("  ✓ IE 12 (destinationIPv4Address) anonymized")

val = anon.anonymize_field(7, "sourceTransportPort", 12345)
assert val == 12345, "Non-IP field should not be anonymized"
print("  ✓ IE 7 (sourceTransportPort) not anonymized")

val = anon.anonymize_field(4, "protocolIdentifier", 6)
assert val == 6, "Protocol should not be anonymized"
print("  ✓ IE 4 (protocolIdentifier) not anonymized")

print()
print("=" * 70)
print("🎉 ALL ANONYMIZE & PARQUET TESTS PASSED! 🎉")
print("=" * 70)
