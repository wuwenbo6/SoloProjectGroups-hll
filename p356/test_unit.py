import socket
import struct
import time
import sys
sys.path.insert(0, '/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p356')

from ipfix_parser import IPFIXParser, IPFIX_VERSION, SET_TEMPLATE, SET_OPTIONS_TEMPLATE


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
    set_header = struct.pack("!HH", SET_TEMPLATE, set_length)

    export_time = int(time.time())
    total_length = 16 + set_length
    header = struct.pack("!HHIII", IPFIX_VERSION, total_length, export_time, 1, domain_id)

    template_packet = header + set_header + template_record

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

    data_total_length = 16 + data_set_length
    data_header = struct.pack("!HHIII", IPFIX_VERSION, data_total_length, export_time, 2, domain_id)

    data_packet = data_header + data_set_header + data_record

    return template_packet, data_packet


def build_options_template_packet():
    domain_id = 12345
    template_id = 257

    scope_ies = [(140, 4)]
    ies = [(139, 4), (144, 4)]

    scope_field_count = len(scope_ies)
    field_count = scope_field_count + len(ies)

    template_record = struct.pack("!HHH", template_id, field_count, scope_field_count)
    for ie_id, length in scope_ies:
        template_record += struct.pack("!HH", ie_id, length)
    for ie_id, length in ies:
        template_record += struct.pack("!HH", ie_id, length)

    set_length = 4 + len(template_record)
    set_header = struct.pack("!HH", SET_OPTIONS_TEMPLATE, set_length)

    export_time = int(time.time())
    total_length = 16 + set_length
    header = struct.pack("!HHIII", IPFIX_VERSION, total_length, export_time, 3, domain_id)

    return header + set_header + template_record


def test_parser():
    print("=" * 60)
    print("IPFIX Parser Unit Test")
    print("=" * 60)

    parser = IPFIXParser()

    print("\n1. Testing Header Parsing...")
    template_packet, data_packet = build_test_packet()
    header = parser.parse_header(template_packet)
    assert header["version"] == 10, f"Version mismatch: {header['version']}"
    assert header["observation_domain_id"] == 12345, f"Domain ID mismatch"
    print("   ✓ Header parsing correct")

    print("\n2. Testing Template Set Parsing...")
    result = parser.parse_packet(template_packet)
    assert len(result["templates"]) == 1, f"Template count mismatch: {len(result['templates'])}"
    template = result["templates"][0]
    assert template.template_id == 256, f"Template ID mismatch: {template.template_id}"
    assert len(template.ies) == 7, f"IE count mismatch: {len(template.ies)}"
    assert template.ies[0].name == "sourceIPv4Address", f"First IE name mismatch"
    assert template.ies[1].name == "destinationIPv4Address", f"Second IE name mismatch"
    print(f"   ✓ Template parsed: {template}")
    print(f"   ✓ IEs: {[ie.name for ie in template.ies]}")

    print("\n3. Testing Options Template Set Parsing...")
    options_packet = build_options_template_packet()
    result = parser.parse_packet(options_packet)
    assert len(result["templates"]) == 1, f"Options template count mismatch"
    opt_template = result["templates"][0]
    assert opt_template.is_options == True, "Should be options template"
    assert len(opt_template.scope_ies) == 1, f"Scope IE count mismatch"
    assert len(opt_template.ies) == 2, f"IE count mismatch"
    print(f"   ✓ Options template parsed: {opt_template}")
    print(f"   ✓ Scope IEs: {[ie.name for ie in opt_template.scope_ies]}")
    print(f"   ✓ IEs: {[ie.name for ie in opt_template.ies]}")

    print("\n4. Testing Data Set Parsing (without template first)...")
    parser2 = IPFIXParser()
    result = parser2.parse_packet(data_packet)
    assert len(result["records"]) == 0, "Should have no records without template"
    print("   ✓ No records parsed without template (expected)")

    print("\n5. Testing Data Set Parsing (with template)...")
    result = parser.parse_packet(data_packet)
    assert len(result["records"]) == 1, f"Record count mismatch: {len(result['records'])}"
    record = result["records"][0]

    assert record.source_ip == "192.168.1.100", f"Source IP mismatch: {record.source_ip}"
    assert record.destination_ip == "8.8.8.8", f"Dest IP mismatch: {record.destination_ip}"
    assert record.source_port == 54321, f"Source port mismatch: {record.source_port}"
    assert record.destination_port == 443, f"Dest port mismatch: {record.destination_port}"
    assert record.protocol == "TCP", f"Protocol mismatch: {record.protocol}"
    assert record.get("octetDeltaCount") == 1234567, f"Octets mismatch"
    assert record.get("packetDeltaCount") == 1000, f"Packets mismatch"

    print(f"   ✓ Record parsed: {record}")
    print(f"   ✓ Source IP: {record.source_ip}")
    print(f"   ✓ Destination IP: {record.destination_ip}")
    print(f"   ✓ Protocol: {record.protocol}")
    print(f"   ✓ Octets: {record.get('octetDeltaCount')}")
    print(f"   ✓ Packets: {record.get('packetDeltaCount')}")

    print("\n6. Testing to_dict() method...")
    record_dict = record.to_dict()
    assert isinstance(record_dict, dict)
    assert record_dict["source_ip"] == "192.168.1.100"
    assert record_dict["destination_ip"] == "8.8.8.8"
    assert "fields" in record_dict
    print("   ✓ to_dict() works correctly")

    print("\n7. Testing template storage and retrieval...")
    stored = parser.get_template(12345, 256)
    assert stored is not None, "Template not stored"
    assert stored.template_id == 256
    print("   ✓ Template storage works")

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED! ✓")
    print("=" * 60)

    return True


def test_collector():
    print("\n" + "=" * 60)
    print("IPFIX Collector Unit Test")
    print("=" * 60)

    from ipfix_collector import IPFIXCollector

    collector = IPFIXCollector(port=4740, max_records=100)

    print("\n1. Testing collector stats...")
    stats = collector.get_stats()
    assert stats["packets_received"] == 0
    assert stats["current_records"] == 0
    print("   ✓ Initial stats correct")

    print("\n2. Testing packet processing...")
    template_packet, data_packet = build_test_packet()
    collector._process_packet(template_packet, ("127.0.0.1", 4739))
    collector._process_packet(data_packet, ("127.0.0.1", 4739))

    stats = collector.get_stats()
    assert stats["packets_received"] == 2
    assert stats["records_received"] == 1
    assert stats["templates_received"] == 1
    assert stats["current_records"] == 1
    print(f"   ✓ Packets received: {stats['packets_received']}")
    print(f"   ✓ Records received: {stats['records_received']}")

    print("\n3. Testing record retrieval...")
    records = collector.get_records()
    assert len(records) == 1
    assert records[0].source_ip == "192.168.1.100"
    print("   ✓ Record retrieval works")

    print("\n4. Testing search...")
    results = collector.search_records(source_ip="192.168.1.100")
    assert len(results) == 1
    results = collector.search_records(protocol="TCP")
    assert len(results) == 1
    results = collector.search_records(source_ip="10.0.0.1")
    assert len(results) == 0
    print("   ✓ Search works")

    print("\n5. Testing top talkers...")
    top_sources = collector.get_top_talkers(by_source=True, limit=5)
    assert len(top_sources) == 1
    assert top_sources[0]["ip"] == "192.168.1.100"
    top_dests = collector.get_top_talkers(by_source=False, limit=5)
    assert len(top_dests) == 1
    assert top_dests[0]["ip"] == "8.8.8.8"
    print("   ✓ Top talkers work")

    print("\n6. Testing clear records...")
    collector.clear_records()
    stats = collector.get_stats()
    assert stats["current_records"] == 0
    print("   ✓ Clear records works")

    print("\n" + "=" * 60)
    print("COLLECTOR TESTS PASSED! ✓")
    print("=" * 60)

    return True


if __name__ == "__main__":
    try:
        test_parser()
        test_collector()
        print("\n🎉 All unit tests passed successfully!")
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
