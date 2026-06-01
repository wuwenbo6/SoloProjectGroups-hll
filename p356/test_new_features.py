import socket
import struct
import time
import sys
sys.path.insert(0, '/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p356')

from ipfix_parser import (
    IPFIXParser, IPFIX_VERSION, SET_TEMPLATE, SET_OPTIONS_TEMPLATE,
    VARIABLE_LENGTH, DEFAULT_TEMPLATE_LIFETIME, TEMPLATE_WITHDRAWAL_ALL
)
from ipfix_collector import IPFIXCollector


def build_test_packet_with_variable_length():
    domain_id = 12345
    template_id = 258

    ies = [
        (8, 4),
        (12, 4),
        (7, 2),
        (11, 2),
        (4, 1),
        (185, VARIABLE_LENGTH),
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

    src_ip = socket.inet_aton("10.0.0.1")
    dst_ip = socket.inet_aton("10.0.0.2")
    src_port = struct.pack("!H", 12345)
    dst_port = struct.pack("!H", 80)
    protocol = struct.pack("!B", 6)

    iface_name = b"eth0"
    iface_len_prefix = bytes([len(iface_name)])

    octets = struct.pack("!Q", 5000000)
    packets = struct.pack("!Q", 5000)

    data_record = (src_ip + dst_ip + src_port + dst_port + protocol +
                   iface_len_prefix + iface_name + octets + packets)

    data_set_length = 4 + len(data_record)
    data_set_header = struct.pack("!HH", template_id, data_set_length)

    data_total_length = 16 + data_set_length
    data_header = struct.pack("!HHIII", IPFIX_VERSION, data_total_length, export_time, 2, domain_id)

    data_packet = data_header + data_set_header + data_record

    return template_packet, data_packet


def build_test_packet_with_long_variable_length():
    domain_id = 12345
    template_id = 259

    ies = [
        (8, 4),
        (12, 4),
        (185, VARIABLE_LENGTH),
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

    src_ip = socket.inet_aton("192.168.1.1")
    dst_ip = socket.inet_aton("192.168.1.254")

    long_name = b"VeryLongInterfaceNameThatExceeds255Characters_" + (b"X" * 230)
    iface_len_prefix = bytes([255]) + struct.pack("!H", len(long_name))

    data_record = src_ip + dst_ip + iface_len_prefix + long_name

    data_set_length = 4 + len(data_record)
    data_set_header = struct.pack("!HH", template_id, data_set_length)

    data_total_length = 16 + data_set_length
    data_header = struct.pack("!HHIII", IPFIX_VERSION, data_total_length, export_time, 2, domain_id)

    data_packet = data_header + data_set_header + data_record

    return template_packet, data_packet


def test_template_lifetime():
    print("=" * 70)
    print("TEST 1: Template Lifetime Management")
    print("=" * 70)

    parser = IPFIXParser(default_template_lifetime=2)

    expired_count = [0]
    missing_count = [0]

    def on_expired(template):
        expired_count[0] += 1
        print(f"   [CALLBACK] Template expired: {template}")

    def on_missing(domain_id, template_id):
        missing_count[0] += 1
        print(f"   [CALLBACK] Missing template: domain={domain_id}, id={template_id}")

    parser.on_template_expired(on_expired)
    parser.on_missing_template(on_missing)

    domain_id = 12345
    template_id = 256

    ies = [(8, 4), (12, 4)]
    template_record = struct.pack("!HH", template_id, len(ies))
    for ie_id, length in ies:
        template_record += struct.pack("!HH", ie_id, length)

    set_length = 4 + len(template_record)
    set_header = struct.pack("!HH", SET_TEMPLATE, set_length)
    export_time = int(time.time())
    total_length = 16 + set_length
    header = struct.pack("!HHIII", IPFIX_VERSION, total_length, export_time, 1, domain_id)
    template_packet = header + set_header + template_record

    result = parser.parse_packet(template_packet)
    assert len(result["templates"]) == 1, "Template not parsed"
    template = result["templates"][0]

    print(f"\n1.1 Template created: {template}")
    print(f"    Lifetime: {template.lifetime}s")
    print(f"    Expires at: {template.expires_at}")
    print(f"    Remaining: {template.remaining_lifetime:.1f}s")
    print(f"    Is expired: {template.is_expired}")
    assert template.lifetime == 2, f"Wrong lifetime: {template.lifetime}"
    assert not template.is_expired, "Template should not be expired yet"

    stored = parser.get_template(domain_id, template_id)
    assert stored is not None, "Template not stored"
    assert stored.template_id == template_id
    print("   ✓ Template storage works")

    print("\n1.2 Waiting for template to expire...")
    time.sleep(3)

    print(f"\n1.3 Checking expiration:")
    print(f"    Is expired: {template.is_expired}")
    print(f"    Remaining: {template.remaining_lifetime:.1f}s")
    assert template.is_expired, "Template should be expired now"

    stored = parser.get_template(domain_id, template_id)
    assert stored is None, "Template should be removed after expiration"
    print("   ✓ Template removed after expiration")
    assert expired_count[0] >= 1, "Expired callback not called"
    assert missing_count[0] >= 1, "Missing template callback not called"
    print(f"   ✓ Expired callback called: {expired_count[0]} times")
    print(f"   ✓ Missing template callback called: {missing_count[0]} times")

    print("\n1.4 Testing manual cleanup:")
    result = parser.parse_packet(template_packet)
    assert len(result["templates"]) == 1
    time.sleep(3)
    cleaned = parser.cleanup_expired_templates()
    print(f"    Cleaned {cleaned} expired templates")
    assert cleaned >= 1, "No templates cleaned"
    print("   ✓ Manual cleanup works")

    print("\n1.5 Testing template refresh:")
    result = parser.parse_packet(template_packet)
    template = result["templates"][0]
    print(f"    Created: {template.created_at}")
    time.sleep(1)
    result = parser.parse_packet(template_packet)
    template = parser.get_template(domain_id, template_id)
    print(f"    After refresh, remaining: {template.remaining_lifetime:.1f}s")
    assert template.remaining_lifetime > 1, "Template should be refreshed"
    print("   ✓ Template refresh works")

    print("\n" + "=" * 70)
    print("TEST 1 PASSED! ✓")
    print("=" * 70)
    return True


def test_variable_length_fields():
    print("\n" + "=" * 70)
    print("TEST 2: Variable Length Fields")
    print("=" * 70)

    parser = IPFIXParser()

    print("\n2.1 Testing short variable length field (< 255 bytes):")
    template_packet, data_packet = build_test_packet_with_variable_length()

    result = parser.parse_packet(template_packet)
    assert len(result["templates"]) == 1
    template = result["templates"][0]
    print(f"    Template: {template}")
    print(f"    Has variable length: {template.has_variable_length}")
    print(f"    Total length: {template.total_length} (should be -1)")
    assert template.has_variable_length == True, "Should have variable length"
    assert template.total_length == -1, "Total length should be -1 for variable length"
    print("   ✓ Template with variable length fields recognized")

    variable_ie = template.ies[5]
    print(f"    Variable IE: {variable_ie}")
    assert variable_ie.is_variable_length == True
    print("   ✓ InformationElement.is_variable_length works")

    result = parser.parse_packet(data_packet)
    assert len(result["records"]) == 1, f"Expected 1 record, got {len(result['records'])}"
    record = result["records"][0]
    print(f"\n    Record: {record}")
    print(f"    Source IP: {record.source_ip}")
    print(f"    Destination IP: {record.destination_ip}")
    print(f"    Protocol: {record.protocol}")
    print(f"    Interface name: {record.get('interfaceName')}")
    print(f"    Octets: {record.get('octetDeltaCount')}")
    print(f"    Packets: {record.get('packetDeltaCount')}")

    assert record.source_ip == "10.0.0.1"
    assert record.destination_ip == "10.0.0.2"
    assert record.get("interfaceName") == "eth0"
    assert record.get("octetDeltaCount") == 5000000
    assert record.get("packetDeltaCount") == 5000
    print("   ✓ Short variable length field decoded correctly")

    print("\n2.2 Testing long variable length field (> 255 bytes):")
    template_packet2, data_packet2 = build_test_packet_with_long_variable_length()

    result = parser.parse_packet(template_packet2)
    assert len(result["templates"]) == 1

    result = parser.parse_packet(data_packet2)
    assert len(result["records"]) == 1, f"Expected 1 record, got {len(result['records'])}"
    record = result["records"][0]
    iface_name = record.get("interfaceName")
    print(f"    Interface name length: {len(iface_name)} characters")
    print(f"    Starts with: {iface_name[:50]}...")
    assert len(iface_name) > 255, f"Name too short: {len(iface_name)}"
    assert iface_name.startswith("VeryLongInterfaceName"), "Wrong content"
    print("   ✓ Long variable length field decoded correctly")

    print("\n2.3 Testing variable length reading:")
    test_data = bytes([10]) + (b"X" * 10)
    length, offset = parser._read_variable_length(test_data, 0)
    print(f"    Short length: {length}, offset: {offset}")
    assert length == 10
    assert offset == 1

    long_test = bytes([255, 1, 0]) + (b"Y" * 256)
    length, offset = parser._read_variable_length(long_test, 0)
    print(f"    Long length: {length}, offset: {offset}")
    assert length == 256
    assert offset == 3
    print("   ✓ Variable length prefix parsing works")

    print("\n" + "=" * 70)
    print("TEST 2 PASSED! ✓")
    print("=" * 70)
    return True


def test_template_withdrawal():
    print("\n" + "=" * 70)
    print("TEST 3: Template Withdrawal")
    print("=" * 70)

    parser = IPFIXParser()
    domain_id = 12345

    for tid in [256, 257, 258]:
        ies = [(8, 4)]
        template_record = struct.pack("!HH", tid, len(ies))
        for ie_id, length in ies:
            template_record += struct.pack("!HH", ie_id, length)

        set_length = 4 + len(template_record)
        set_header = struct.pack("!HH", SET_TEMPLATE, set_length)
        export_time = int(time.time())
        total_length = 16 + set_length
        header = struct.pack("!HHIII", IPFIX_VERSION, total_length, export_time, 1, domain_id)
        packet = header + set_header + template_record
        parser.parse_packet(packet)

    print(f"\n3.1 Created 3 templates, count: {parser.get_template_count()}")
    assert parser.get_template_count() == 3

    print("\n3.2 Withdrawing single template (257):")
    withdraw_record = struct.pack("!HH", 257, 0)
    set_length = 4 + len(withdraw_record)
    set_header = struct.pack("!HH", SET_TEMPLATE, set_length)
    export_time = int(time.time())
    total_length = 16 + set_length
    header = struct.pack("!HHIII", IPFIX_VERSION, total_length, export_time, 1, domain_id)
    packet = header + set_header + withdraw_record
    result = parser.parse_packet(packet)

    print(f"    Withdrawn: {result['withdrawn']}")
    assert 257 in result["withdrawn"], "Template 257 not withdrawn"

    template = parser.get_template(domain_id, 257)
    assert template is None, "Template should be withdrawn"
    print(f"    Remaining templates: {parser.get_template_count()}")
    assert parser.get_template_count() == 2
    print("   ✓ Single template withdrawal works")

    print("\n3.3 Withdrawing all templates:")
    withdraw_record = struct.pack("!HH", TEMPLATE_WITHDRAWAL_ALL, 0)
    set_length = 4 + len(withdraw_record)
    set_header = struct.pack("!HH", SET_TEMPLATE, set_length)
    total_length = 16 + set_length
    header = struct.pack("!HHIII", IPFIX_VERSION, total_length, export_time, 1, domain_id)
    packet = header + set_header + withdraw_record
    result = parser.parse_packet(packet)

    print(f"    Withdrawn: {result['withdrawn']}")
    assert "all_templates" in result["withdrawn"]
    assert parser.get_template_count() == 0
    print("   ✓ All templates withdrawal works")

    print("\n" + "=" * 70)
    print("TEST 3 PASSED! ✓")
    print("=" * 70)
    return True


def test_collector_integration():
    print("\n" + "=" * 70)
    print("TEST 4: Collector Integration with New Features")
    print("=" * 70)

    collector = IPFIXCollector(port=4741, template_lifetime=5)

    print("\n4.1 Collector initialized:")
    print(f"    Template lifetime: {collector.template_lifetime}s")
    assert collector.template_lifetime == 5

    print("\n4.2 Processing template with variable length:")
    template_packet, data_packet = build_test_packet_with_variable_length()
    collector._process_packet(template_packet, ("127.0.0.1", 4739))
    collector._process_packet(data_packet, ("127.0.0.1", 4739))

    stats = collector.get_stats()
    print(f"    Templates received: {stats['templates_received']}")
    print(f"    Records received: {stats['records_received']}")
    print(f"    Active templates: {stats['active_templates']}")
    assert stats["templates_received"] == 1
    assert stats["records_received"] == 1
    assert stats["active_templates"] == 1

    records = collector.get_records()
    assert len(records) == 1
    record = records[0]
    print(f"    Record with variable field: {record.get('interfaceName')}")
    assert record.get("interfaceName") == "eth0"
    print("   ✓ Collector handles variable length fields")

    print("\n4.3 Getting detailed template info:")
    templates = collector.get_templates_as_dict()
    assert len(templates) == 1
    t = templates[0]
    print(f"    Template ID: {t['template_id']}")
    print(f"    Has variable length: {t['has_variable_length']}")
    print(f"    Lifetime: {t['lifetime']}s")
    print(f"    Remaining: {t['remaining_lifetime']:.1f}s")
    print(f"    Created at: {t['created_at']}")
    assert t["has_variable_length"] == True
    assert t["lifetime"] == 5
    assert "remaining_lifetime" in t
    assert "expires_at" in t
    print("   ✓ Template detail info includes lifetime")

    print("\n4.4 Testing stats with new fields:")
    stats = collector.get_stats()
    print(f"    Templates expired: {stats['templates_expired']}")
    print(f"    Templates withdrawn: {stats['templates_withdrawn']}")
    print(f"    Template refresh requests: {stats['template_refresh_requests']}")
    assert "templates_expired" in stats
    assert "templates_withdrawn" in stats
    assert "template_refresh_requests" in stats
    print("   ✓ Stats include new template management fields")

    print("\n4.5 Testing clear_all:")
    collector.clear_all()
    stats = collector.get_stats()
    print(f"    After clear_all: records={stats['current_records']}, "
          f"templates={stats['active_templates']}")
    assert stats["current_records"] == 0
    assert stats["active_templates"] == 0
    assert stats["templates_received"] == 0
    print("   ✓ clear_all works")

    print("\n" + "=" * 70)
    print("TEST 4 PASSED! ✓")
    print("=" * 70)
    return True


def test_variable_length_edge_cases():
    print("\n" + "=" * 70)
    print("TEST 5: Variable Length Edge Cases")
    print("=" * 70)

    parser = IPFIXParser()
    domain_id = 12345
    template_id = 260

    print("\n5.1 Testing multiple variable length fields:")
    ies = [
        (8, 4),
        (185, VARIABLE_LENGTH),
        (186, VARIABLE_LENGTH),
        (1, 8),
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

    parser.parse_packet(template_packet)

    src_ip = socket.inet_aton("172.16.0.1")
    name1 = b"GigabitEthernet0/1"
    name2 = b"Uplink to core router"
    len1 = bytes([len(name1)])
    len2 = bytes([len(name2)])
    octets = struct.pack("!Q", 999999999)

    data_record = src_ip + len1 + name1 + len2 + name2 + octets

    data_set_length = 4 + len(data_record)
    data_set_header = struct.pack("!HH", template_id, data_set_length)
    data_total_length = 16 + data_set_length
    data_header = struct.pack("!HHIII", IPFIX_VERSION, data_total_length, export_time, 2, domain_id)
    data_packet = data_header + data_set_header + data_record

    result = parser.parse_packet(data_packet)
    assert len(result["records"]) == 1
    record = result["records"][0]
    print(f"    Interface name: {record.get('interfaceName')}")
    print(f"    Interface desc: {record.get('interfaceDescription')}")
    assert record.get("interfaceName") == "GigabitEthernet0/1"
    assert record.get("interfaceDescription") == "Uplink to core router"
    assert record.get("octetDeltaCount") == 999999999
    print("   ✓ Multiple variable length fields work")

    print("\n5.2 Testing empty variable length field (length 0):")
    src_ip = socket.inet_aton("172.16.0.2")
    empty_len = bytes([0])
    name2 = b"Test description"
    len2 = bytes([len(name2)])
    octets = struct.pack("!Q", 0)

    data_record = src_ip + empty_len + b"" + len2 + name2 + octets

    data_set_length = 4 + len(data_record)
    data_set_header = struct.pack("!HH", template_id, data_set_length)
    data_total_length = 16 + data_set_length
    data_header = struct.pack("!HHIII", IPFIX_VERSION, data_total_length, export_time, 3, domain_id)
    data_packet = data_header + data_set_header + data_record

    result = parser.parse_packet(data_packet)
    assert len(result["records"]) == 1
    record = result["records"][0]
    print(f"    Empty interface name: '{record.get('interfaceName')}'")
    assert record.get("interfaceName") == ""
    print("   ✓ Empty variable length field works")

    print("\n" + "=" * 70)
    print("TEST 5 PASSED! ✓")
    print("=" * 70)
    return True


if __name__ == "__main__":
    all_passed = True
    tests = [
        test_template_lifetime,
        test_variable_length_fields,
        test_template_withdrawal,
        test_collector_integration,
        test_variable_length_edge_cases,
    ]

    for test in tests:
        try:
            if not test():
                all_passed = False
        except Exception as e:
            print(f"\n❌ Test {test.__name__} failed with exception: {e}")
            import traceback
            traceback.print_exc()
            all_passed = False
            break

    print("\n" + "=" * 70)
    if all_passed:
        print("🎉 ALL NEW FEATURE TESTS PASSED! 🎉")
    else:
        print("❌ Some tests failed")
        sys.exit(1)
    print("=" * 70)
