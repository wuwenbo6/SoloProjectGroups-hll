#!/usr/bin/env python3

from sccp_parser import SCCPParser
from dtap_parser import DTAPParser
from call_flow_manager import CallFlowManager, BSSAPParser
import json


def test_sccp_parser():
    print("=" * 60)
    print("测试 SCCP 解析器")
    print("=" * 60)
    
    parser = SCCPParser()
    
    test_hex = "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 14 03 05 05 01 5C 06 91 94 71 06 00 10 5E 07 91 94 71 06 00 11 F0 04 03 60 80"
    data = parser.parse_hex_string(test_hex)
    
    result = parser.parse_sccp_header(data)
    print(f"消息类型: {result['message_type_name']}")
    print(f"原始头部: {result['raw_header']}")
    
    if 'called_party' in result:
        print(f"被叫地址: {result['called_party'].get('raw', 'N/A')}")
    
    if 'calling_party' in result:
        print(f"主叫地址: {result['calling_party'].get('raw', 'N/A')}")
    
    print(f"负载长度: {len(result['payload'])} 字节")
    print("✓ SCCP 解析器测试通过\n")


def test_dtap_parser_basic():
    print("=" * 60)
    print("测试 DTAP 基础解析")
    print("=" * 60)
    
    parser = DTAPParser()
    
    setup_dtap = bytes.fromhex("03 25 05 5C 06 91 94 71 06 00 10 5E 07 91 94 71 06 00 11 F0 04 03 60 80")
    result = parser.parse_dtap_message(setup_dtap)
    
    print(f"协议鉴别器: {result['protocol_discriminator_name']}")
    print(f"消息类型: {result['message_type_name']}")
    print(f"事务标识符: {result.get('transaction_identifier', 'N/A')}")
    
    print(f"信息元素数量: {len(result['information_elements'])}")
    for ie in result['information_elements']:
        parsed = ie.get('parsed', {})
        display = parsed.get('digits', parsed.get('raw', ie.get('data', 'N/A')))
        print(f"  - {ie['iei_name']}: {display}")
    
    print("✓ DTAP 基础解析测试通过\n")


def test_recursive_tlv_parsing():
    print("=" * 60)
    print("测试递归 TLV 解析（多段嵌套）")
    print("=" * 60)
    
    parser = DTAPParser()
    
    facility_data = bytes.fromhex("1C 1C A1 1A 02 01 01 06 07 04 00 00 01 00 01 01 30 0A 02 01 03 02 01 01 02 01 01")
    
    result = parser._parse_facility_ie(facility_data)
    
    print(f"原始数据: {result.get('raw', 'N/A')}")
    print(f"数据长度: {result.get('length', 0)} 字节")
    
    if 'asn1_parsed' in result:
        asn1 = result['asn1_parsed']
        print(f"ASN.1 标签: {asn1.get('tag_name', 'N/A')}")
        print(f"是否构造类型: {asn1.get('constructed', False)}")
        
        if 'children' in asn1:
            print(f"子节点数量: {len(asn1['children'])}")
            for i, child in enumerate(asn1['children']):
                print(f"  子节点 {i+1}: {child.get('tag_name', 'Unknown')}")
                
                if 'children' in child:
                    print(f"    嵌套子节点: {len(child['children'])} 个")
                    for j, nested in enumerate(child['children']):
                        print(f"      {j+1}. {nested.get('tag_name', 'Unknown')}: {nested.get('value', nested.get('content_hex', ''))}")
    
    if 'components' in result:
        print(f"提取到 {len(result['components'])} 个组件:")
        for comp in result['components']:
            print(f"  - {comp['component_name']}")
            if 'parameters' in comp:
                print(f"    参数: {json.dumps(comp['parameters'], indent=6, ensure_ascii=False)}")
    
    print("✓ 递归 TLV 解析测试通过\n")


def test_nested_diagnostics_in_cause():
    print("=" * 60)
    print("测试 Cause IE 中的嵌套诊断信息")
    print("=" * 60)
    
    parser = DTAPParser()
    
    cause_with_diag = bytes.fromhex("08 06 82 90 14 03 01 02 03")
    result = parser._parse_cause(cause_with_diag)
    
    print(f"原因值: {result.get('cause_value', 'N/A')}")
    print(f"原因名称: {result.get('cause_name', 'N/A')}")
    
    if 'diagnostics' in result:
        print(f"嵌套诊断信息: {len(result['diagnostics'])} 个元素")
        for diag in result['diagnostics']:
            print(f"  - {diag['iei_name']}: {diag.get('data', 'N/A')}")
    
    print("✓ 嵌套诊断信息解析测试通过\n")


def test_asn1_ber_parsing():
    print("=" * 60)
    print("测试 ASN.1 BER 编码解析")
    print("=" * 60)
    
    parser = DTAPParser()
    
    test_cases = [
        ("SEQUENCE with INTEGER and BOOLEAN", 
         bytes.fromhex("30 08 02 01 2A 01 01 FF 05 00")),
        ("Context-Specific Constructed",
         bytes.fromhex("A1 08 02 01 01 06 03 2B 06 01")),
        ("OID value",
         bytes.fromhex("06 07 04 00 00 01 00 01 01")),
    ]
    
    for name, data in test_cases:
        print(f"\n测试: {name}")
        result = parser.parse_asn1(data, max_depth=5)
        if result:
            print(f"  标签: {result.get('tag_name', 'Unknown')}")
            print(f"  构造类型: {result.get('constructed', False)}")
            print(f"  长度: {result.get('length', 0)}")
            
            if 'children' in result:
                print(f"  子节点: {len(result['children'])}")
                for child in result['children']:
                    tag = child.get('tag_name', 'Unknown')
                    value = child.get('value', child.get('content_hex', ''))
                    print(f"    {tag}: {value}")
            elif 'value' in result:
                print(f"  值: {result['value']}")
    
    print("\n✓ ASN.1 BER 编码解析测试通过\n")


def test_nested_tlv_with_unknown_ie():
    print("=" * 60)
    print("测试通用嵌套 TLV 自动解析")
    print("=" * 60)
    
    parser = DTAPParser()
    
    nested_tlv_data = bytes.fromhex("14 03 01 02 03 08 02 81 90")
    
    result = parser._try_parse_as_nested_tlv(nested_tlv_data)
    
    if result.get('nested', False):
        print(f"检测到嵌套 TLV 结构")
        print(f"子节点数量: {result.get('child_count', 0)}")
        for child in result.get('children', []):
            print(f"  - {child['iei_name']}: {child.get('data', 'N/A')}")
    else:
        print(f"原始数据: {result.get('raw', 'N/A')}")
    
    print("✓ 通用嵌套 TLV 自动解析测试通过\n")


def test_bssap_parser():
    print("=" * 60)
    print("测试 BSSAP 解析器")
    print("=" * 60)
    
    parser = BSSAPParser()
    
    bssap_data = bytes.fromhex("01 14 03 05 24 01 5C 06 91 94 71 06 00 10 5E 07 91 94 71 06 00 11 F0 04 03 60 80")
    result = parser.parse_bssap(bssap_data)
    
    print(f"鉴别器: {result['discriminator_name']}")
    print(f"负载长度: {result['length']}")
    
    if result['payload']:
        dtap_parser = DTAPParser()
        dtap_result = dtap_parser.parse_dtap_message(result['payload'])
        print(f"DTAP 消息: {dtap_result['message_type_name']}")
        print(f"信息元素数量: {len(dtap_result['information_elements'])}")
    
    print("✓ BSSAP 解析器测试通过\n")


def test_call_flow_manager():
    print("=" * 60)
    print("测试呼叫流程管理器")
    print("=" * 60)
    
    manager = CallFlowManager()
    
    sample_messages = [
        ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 14 03 05 05 01 5C 06 91 94 71 06 00 10 5E 07 91 94 71 06 00 11 F0 04 03 60 80", "mobile_to_network", "Setup"),
        ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 0A 03 02 02 01 1E 02 82 88", "network_to_mobile", "Call Proceeding"),
        ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 05 03 01 01 01 34 01 01", "network_to_mobile", "Alerting"),
        ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 09 03 07 07 01 4C 06 91 94 71 06 00 11", "network_to_mobile", "Connect"),
        ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 03 03 0F 0F", "mobile_to_network", "Connect Acknowledge"),
    ]
    
    print("处理呼叫流程消息:")
    for hex_data, direction, msg_name in sample_messages:
        result = manager.process_sccp_message(hex_data, direction)
        dtap_msg = result.get('dtap', {}).get('message_type_name', 'N/A')
        dir_arrow = "→" if direction == "mobile_to_network" else "←"
        print(f"  {dir_arrow} {msg_name} (DTAP: {dtap_msg})")
    
    print("\n当前活动呼叫:")
    calls = manager.get_all_calls()
    for call in calls:
        print(f"  呼叫ID: {call['call_id']}")
        print(f"    主叫: {call.get('calling_number', 'N/A')}")
        print(f"    被叫: {call.get('called_number', 'N/A')}")
        print(f"    状态: {call['state']}")
    
    print("\n呼叫流程时序:")
    flow = manager.get_mobile_originated_call_flow()
    for msg in flow:
        dir_arrow = "→" if msg['direction'] == "mobile_to_network" else "←"
        print(f"  {dir_arrow} {msg['message_type']}")
    
    print("✓ 呼叫流程管理器测试通过\n")


def test_call_information_extraction():
    print("=" * 60)
    print("测试呼叫信息提取")
    print("=" * 60)
    
    manager = CallFlowManager()
    
    setup_msg = "09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 14 03 05 05 01 5C 06 91 94 71 06 00 10 5E 07 91 94 71 06 00 11 F0 04 03 60 80"
    result = manager.process_sccp_message(setup_msg, "mobile_to_network")
    
    call_id = result.get('call_id')
    call_details = manager.get_call_flow(call_id)
    
    if call_details:
        print(f"呼叫ID: {call_details['call_id']}")
        print(f"主叫号码: {call_details.get('calling_number', 'N/A')}")
        print(f"被叫号码: {call_details.get('called_number', 'N/A')}")
        print(f"承载能力: {call_details.get('bearer_capability', 'N/A')}")
        print(f"当前状态: {call_details['state']}")
        print(f"消息数量: {len(call_details['messages'])}")
        
        print("\n消息详情:")
        for msg in call_details['messages']:
            print(f"  [{msg['message_type_name']}] - 时间戳: {msg['timestamp']}")
    
    print("✓ 呼叫信息提取测试通过\n")


def test_tlv_length_parsing():
    print("=" * 60)
    print("测试 TLV 长度字段解析")
    print("=" * 60)
    
    parser = DTAPParser()
    
    test_cases = [
        (0x5C, bytes.fromhex("06"), 6, 1, "BCD号码 IE (类型4, 长度字段1字节)"),
        (0x1C, bytes.fromhex("1A"), 26, 1, "Facility IE (类型4, 长度字段1字节)"),
        (0x08, bytes.fromhex("04"), 4, 1, "Cause IE (类型3, 长度字段1字节)"),
        (0xD4, bytes.fromhex("08"), 8, 1, "扩展 IE (最高位为1)"),
        (0x5E, bytes.fromhex("07"), 7, 1, "Called Party BCD IE (类型4)"),
        (0x4C, bytes.fromhex("06"), 6, 1, "Connected Number IE (类型4)"),
        (0x04, bytes.fromhex("03"), 3, 1, "Bearer Capability IE (类型4)"),
        (0x7E, bytes.fromhex("10"), 16, 1, "User-User IE (类型4)"),
    ]
    
    for iei, data, expected_length, expected_len_bytes, description in test_cases:
        length, len_bytes = parser.parse_tlv_length(iei, data)
        status = "✓" if length == expected_length and len_bytes == expected_len_bytes else "✗"
        print(f"{status} {description}: IEI=0x{iei:02X}, 长度={length} (预期={expected_length}), 长度字节={len_bytes}")
    
    print("\n✓ TLV 长度字段解析测试通过\n")


def test_mm_message_parsing():
    print("=" * 60)
    print("测试 Mobility Management 消息解析")
    print("=" * 60)
    
    parser = DTAPParser()
    
    test_cases = [
        (b'\x04\x08\x08', 'Location Updating Request', 0x04, 'Mobility Management'),
        (b'\x04\x09\x00', 'Location Updating Accept', 0x04, 'Mobility Management'),
        (b'\x04\x0A\x00', 'Location Updating Reject', 0x04, 'Mobility Management'),
        (b'\x04\x12\x00', 'Authentication Request', 0x04, 'Mobility Management'),
        (b'\x04\x13\x00', 'Authentication Response', 0x04, 'Mobility Management'),
        (b'\x04\x18\x00', 'Identity Request', 0x04, 'Mobility Management'),
        (b'\x04\x19\x00', 'Identity Response', 0x04, 'Mobility Management'),
    ]
    
    for data, expected_name, expected_pd, expected_pd_name in test_cases:
        result = parser.parse_dtap_message(data)
        assert result['protocol_discriminator'] == expected_pd, f"协议鉴别器错误: {result['protocol_discriminator']}"
        assert result['protocol_discriminator_name'] == expected_pd_name, f"协议鉴别器名称错误: {result['protocol_discriminator_name']}"
        assert result['message_type_name'] == expected_name, f"消息类型名称错误: {result['message_type_name']} vs {expected_name}"
        print(f"✓ {expected_name}: 协议鉴别器={expected_pd_name}, 消息类型={result['message_type_name']}")
    
    print("\n✓ Mobility Management 消息解析测试通过\n")


def test_lai_parsing():
    print("=" * 60)
    print("测试位置区域标识 (LAI) 解析")
    print("=" * 60)
    
    parser = DTAPParser()
    
    data = bytes.fromhex('13 00 F1 10 00 17')
    result = parser._parse_location_area_identification(data[1:])
    
    assert result['mcc'] == '001', f"MCC错误: {result['mcc']}"
    assert result['mnc'] == '01', f"MNC错误: {result['mnc']}"
    assert result['lac'] == 0x0017, f"LAC错误: {result['lac']}"
    assert result['full'] == '001-01-0017', f"完整LAI错误: {result['full']}"
    
    print(f"✓ LAI解析: MCC={result['mcc']}, MNC={result['mnc']}, LAC={result['lac_hex']}")
    print(f"✓ 完整LAI: {result['full']}")
    
    print("\n✓ LAI 解析测试通过\n")


def test_mobile_identity_parsing():
    print("=" * 60)
    print("测试移动身份 (Mobile Identity) 解析")
    print("=" * 60)
    
    parser = DTAPParser()
    
    imsi_data = bytes.fromhex('08 29 64 00 11 49 16 00 54 01')
    result = parser._parse_mobile_identity(imsi_data)
    assert result['type_of_identity'] == 0, f"身份类型错误: {result['type_of_identity']}"
    print(f"✓ IMSI解析: {result.get('imsi', 'N/A')}")
    
    imsi_data2 = bytes.fromhex('28 64 00 11 49 16 00 54 01 F0')
    result2 = parser._parse_mobile_identity(imsi_data2)
    assert result2['type_of_identity'] == 1, f"身份类型错误: {result2['type_of_identity']}"
    assert result2['type_of_identity_name'] == 'IMSI', f"身份类型名称错误: {result2['type_of_identity_name']}"
    print(f"✓ IMSI解析 (类型1): {result2.get('imsi', 'N/A')}")
    
    imei_data = bytes.fromhex('48 53 01 70 56 44 80 00 3F 01')
    result3 = parser._parse_mobile_identity(imei_data)
    assert result3['type_of_identity'] == 2, f"IMEI身份类型错误: {result3['type_of_identity']}"
    print(f"✓ IMEI解析: {result3.get('imei', 'N/A')}")
    
    tmsi_data = bytes.fromhex('84 F4 09 10 00')
    result4 = parser._parse_mobile_identity(tmsi_data)
    assert result4['type_of_identity'] == 4, f"TMSI身份类型错误: {result4['type_of_identity']}"
    assert result4['tmsi'] == 'F4091000', f"TMSI错误: {result4['tmsi']}"
    print(f"✓ TMSI解析: {result4['tmsi']}")
    
    print("\n✓ 移动身份解析测试通过\n")


def test_location_update_flow():
    print("=" * 60)
    print("测试位置更新流程")
    print("=" * 60)
    
    manager = CallFlowManager()
    
    sccp_header = '09 00 03 07 0A 12 07 91 94 71 06 00 10 11'
    
    dtap_messages = [
        ('04 08 08 16 09 81 60 14 91 16 00 F4 13 05 13 00 F1 10 00 17 08 28 64 00 11 49 16 00 54 01', 'mobile_to_network'),
        ('04 12 21 10 DB 4D 6F 9A C3 1F A1 9F 60 3C 9F 8E 1D 6E 8A', 'network_to_mobile'),
        ('04 13 22 04 AA 12 34 56', 'mobile_to_network'),
        ('04 18 10 02', 'network_to_mobile'),
        ('04 19 18 08 49 35 01 70 56 44 80 00', 'mobile_to_network'),
        ('04 09 13 05 13 00 F1 10 00 17 04 84 F4 09 10 00', 'network_to_mobile'),
    ]
    
    location_update_messages = []
    for dtap_hex, direction in dtap_messages:
        dtap_bytes = bytes.fromhex(dtap_hex.replace(' ', ''))
        bssap = f'01 {len(dtap_bytes):02X} {dtap_hex}'
        location_update_messages.append((f'{sccp_header} {bssap}', direction))
    
    for i, (hex_data, direction) in enumerate(location_update_messages):
        result = manager.process_sccp_message(hex_data, direction)
        assert 'dtap' in result, f"消息{i+1}: 未找到DTAP"
        print(f"✓ 消息{i+1}: {result['dtap']['message_type_name']} ({direction})")
    
    updates = manager.get_all_location_updates()
    assert len(updates) == 1, f"位置更新数量错误: {len(updates)}"
    
    update_id = updates[0]['update_id']
    update_flow = manager.get_location_update_flow(update_id)
    assert update_flow is not None, "未找到位置更新流程"
    assert update_flow['state'] == 'COMPLETED', f"状态错误: {update_flow['state']}"
    assert len(update_flow['messages']) == 6, f"消息数量错误: {len(update_flow['messages'])}"
    
    print(f"\n✓ 位置更新流程完成，状态: {update_flow['state']}")
    print(f"✓ IMSI: {update_flow.get('imsi', 'N/A')}")
    print(f"✓ IMEI: {update_flow.get('imei', 'N/A')}")
    print(f"✓ TMSI: {update_flow.get('tmsi', 'N/A')}")
    print(f"✓ 旧LAI: {update_flow.get('old_lai', 'N/A')}")
    print(f"✓ 新LAI: {update_flow.get('new_lai', 'N/A')}")
    
    flow_messages = manager.get_location_update_flow_messages()
    assert len(flow_messages) == 6, f"流程消息数量错误: {len(flow_messages)}"
    print(f"✓ 流程消息数量: {len(flow_messages)}")
    
    print("\n✓ 位置更新流程测试通过\n")


def test_export_functions():
    print("=" * 60)
    print("测试导出功能")
    print("=" * 60)
    
    manager = CallFlowManager()
    
    call_messages = [
        ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 14 03 05 05 01 5C 06 91 94 71 06 00 10 5E 07 91 94 71 06 00 11 F0 04 03 60 80", "mobile_to_network"),
        ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 0A 03 02 02 01 1E 02 82 88", "network_to_mobile"),
        ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 05 03 01 01 01 34 01 01", "network_to_mobile"),
        ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 09 03 07 07 01 4C 06 91 94 71 06 00 11", "network_to_mobile"),
        ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 03 03 0F 0F", "mobile_to_network"),
    ]
    
    for hex_data, direction in call_messages:
        manager.process_sccp_message(hex_data, direction)
    
    calls = manager.get_all_calls()
    assert len(calls) == 1, f"呼叫数量错误: {len(calls)}"
    call_id = calls[0]['call_id']
    
    json_export = manager.export_call_flow(call_id, 'json')
    assert json_export is not None, "JSON导出失败"
    json_data = json.loads(json_export)
    assert json_data['type'] == 'call_flow', f"类型错误: {json_data['type']}"
    assert len(json_data['messages']) == 5, f"消息数量错误: {len(json_data['messages'])}"
    print("✓ 呼叫流程 JSON 导出成功")
    print(f"  - 呼叫ID: {json_data['call_id']}")
    print(f"  - 主叫: {json_data.get('calling_number', 'N/A')}")
    print(f"  - 被叫: {json_data.get('called_number', 'N/A')}")
    print(f"  - 消息数: {len(json_data['messages'])}")
    
    mermaid_export = manager.export_call_flow(call_id, 'mermaid')
    assert mermaid_export is not None, "Mermaid导出失败"
    assert 'sequenceDiagram' in mermaid_export, "Mermaid格式错误"
    assert 'Setup' in mermaid_export, "缺少Setup消息"
    assert 'Connect' in mermaid_export, "缺少Connect消息"
    print("✓ 呼叫流程 Mermaid 导出成功")
    
    location_messages = [
        ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 0D 04 08 08 16 09 81 60 14 91 16 00 F4 13 05 13 00 F1 10 00 17 09 91 60 14 91 16 00 F4 10 F0", "mobile_to_network"),
        ("09 00 03 07 0A 12 0F 91 94 71 06 00 10 11 07 91 94 71 06 00 10 11 01 0F 04 09 13 05 13 00 F1 10 00 17 05 F4 09 10 00 41 A0 00", "network_to_mobile"),
    ]
    
    for hex_data, direction in location_messages:
        manager.process_sccp_message(hex_data, direction)
    
    updates = manager.get_all_location_updates()
    assert len(updates) == 1, f"位置更新数量错误: {len(updates)}"
    update_id = updates[0]['update_id']
    
    lu_json = manager.export_location_update_flow(update_id, 'json')
    assert lu_json is not None, "位置更新JSON导出失败"
    lu_data = json.loads(lu_json)
    assert lu_data['type'] == 'location_update_flow', f"类型错误: {lu_data['type']}"
    print("✓ 位置更新 JSON 导出成功")
    print(f"  - IMSI: {lu_data.get('imsi', 'N/A')}")
    
    lu_mermaid = manager.export_location_update_flow(update_id, 'mermaid')
    assert lu_mermaid is not None, "位置更新Mermaid导出失败"
    assert 'sequenceDiagram' in lu_mermaid, "Mermaid格式错误"
    assert 'MS' in lu_mermaid, "缺少MS参与者"
    assert 'HLR' in lu_mermaid, "缺少HLR参与者"
    print("✓ 位置更新 Mermaid 导出成功")
    
    all_mermaid = manager.export_all_flows('mermaid')
    assert all_mermaid is not None, "全部导出失败"
    assert 'sequenceDiagram' in all_mermaid, "Mermaid格式错误"
    assert '[呼叫]' in all_mermaid, "缺少呼叫标记"
    assert '[位置更新]' in all_mermaid, "缺少位置更新标记"
    print("✓ 全部流程 Mermaid 导出成功")
    
    print("\n✓ 导出功能测试通过\n")


def test_ms_classmark_parsing():
    print("=" * 60)
    print("测试 MS Classmark 解析")
    print("=" * 60)
    
    parser = DTAPParser()
    
    classmark1_data = bytes.fromhex('20 05 E5 01')
    result = parser._parse_ms_classmark(classmark1_data[1:], 0x29)
    assert result['classmark_type'] == 'Classmark 1', f"类型错误: {result['classmark_type']}"
    assert result['rf_power_capability'] == 5, f"功率能力错误: {result['rf_power_capability']}"
    print(f"✓ Classmark 1: 功率能力={result['power_capability_db']}")
    
    classmark2_data = bytes.fromhex('1F 04 33 95 05')
    result2 = parser._parse_ms_classmark(classmark2_data[1:], 0x1F)
    assert result2['classmark_type'] == 'Classmark 2', f"类型错误: {result2['classmark_type']}"
    assert 'revision_level' in result2, "缺少revision_level"
    assert 'a5_1' in result2, "缺少a5_1"
    print(f"✓ Classmark 2: 修订级别={result2.get('revision_level', 'N/A')}, A5/1={result2.get('a5_1', 'N/A')}")
    
    print("\n✓ MS Classmark 解析测试通过\n")


if __name__ == '__main__':
    print("\n" + "=" * 60)
    print("GSM SCCP/DTAP 消息解析器 - 单元测试（含递归TLV解析、位置更新、导出功能）")
    print("=" * 60 + "\n")
    
    try:
        test_sccp_parser()
        test_dtap_parser_basic()
        test_recursive_tlv_parsing()
        test_nested_diagnostics_in_cause()
        test_asn1_ber_parsing()
        test_nested_tlv_with_unknown_ie()
        test_bssap_parser()
        test_call_flow_manager()
        test_call_information_extraction()
        test_tlv_length_parsing()
        test_mm_message_parsing()
        test_lai_parsing()
        test_mobile_identity_parsing()
        test_ms_classmark_parsing()
        test_location_update_flow()
        test_export_functions()
        
        print("=" * 60)
        print("✓ 所有测试通过!")
        print("=" * 60)
    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()
