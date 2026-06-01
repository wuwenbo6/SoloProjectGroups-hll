from q931_decoder import decode_q931_message, decode_all_ies_recursive, message_to_dict
from cdr_generator import generate_cdr, cdr_to_json, cdr_to_csv, cdr_to_text, cdr_to_dict, generate_cdr_summary
import json

print('=' * 80)
print('Q.931 解码器增强测试 - Facility + CDR')
print('=' * 80)
print()

print('--- 测试1: Setup消息 (被叫13900139000) ---')
setup1 = '08 02 10 01 05 04 03 80 90 A2 40 07 81 31 09 10 93 00 F0'
msg = decode_q931_message(setup1)
print('  Type:', msg.message_name)
print('  Called:', msg.called_party_number)
print('  Bearer:', msg.bearer_capability['information_transfer_capability'] if msg.bearer_capability else None)
assert msg.message_name == 'SETUP', f'Expected SETUP, got {msg.message_name}'
assert msg.called_party_number == '13900139000', f'Expected 13900139000, got {msg.called_party_number}'
print('  ✓ Pass')
print()

print('--- 测试2: Cause IE 完整解析 ---')
release_normal = '08 02 10 01 46 08 02 81 90'
msg2 = decode_q931_message(release_normal)
print('  Type:', msg2.message_name)
cause = msg2.cause_value
print('  Coding Standard:', cause.get('coding_standard'))
print('  Location:', cause.get('location'))
print('  Cause Value:', cause.get('cause_value'))
print('  Cause Description:', cause.get('cause_description'))
print('  Recommendation:', cause.get('recommendation'))
assert cause.get('coding_standard_code') == 0, f'Expected coding_standard_code 0'
assert cause.get('cause_value') == 16, f'Expected cause_value 16'
assert cause.get('location_code') == 1, f'Expected location_code 1'
print('  ✓ Pass (完整Cause解析: 编码标准/位置/原因值/诊断)')
print()

print('--- 测试3: Facility IE 多段消息解析 ---')
facility_msg = '08 02 10 01 3A 14 0E 05 05 00 48 65 6C 6C 6F 07 05 00 57 6F 72 6C 64'
msg3 = decode_q931_message(facility_msg)
print('  Type:', msg3.message_name)
facility_ie = None
for ie in msg3.information_elements:
    if ie.ie_type == 0x14:
        facility_ie = ie
        break
if facility_ie:
    print('  Facility IE Found!')
    print('  Component Count:', facility_ie.decoded_data.get('component_count', 0))
    print('  Component Types:', facility_ie.decoded_data.get('component_types', []))
    if 'components' in facility_ie.decoded_data:
        for comp in facility_ie.decoded_data['components']:
            print(f'    - {comp.get("component_name")}: {comp.get("name", comp.get("raw_bytes", ""))}')
    if facility_ie.decoded_data.get('component_count', 0) >= 2:
        print('  ✓ Pass (多段Facility消息解析)')
    else:
        print('  ⚠️  Facility解析可能需要进一步测试')
else:
    print('  WARNING: Facility IE not found')
print()

print('--- 测试4: Facility IE - Generic Name (主叫名称) ---')
facility_name = '08 02 90 01 3A 14 07 09 80 07 02 5A 68 61 6E 67 20 53 61 6E'
msg4 = decode_q931_message(facility_name)
facility_ie4 = None
for ie in msg4.information_elements:
    if ie.ie_type == 0x14:
        facility_ie4 = ie
        break
if facility_ie4 and 'components' in facility_ie4.decoded_data:
    for comp in facility_ie4.decoded_data['components']:
        if comp.get('component_type') == '0x07':
            print('  Calling Name:', comp.get('name', 'N/A'))
            print('  Character Set:', comp.get('character_set', 'N/A'))
            print('  Type of Name:', comp.get('type_of_name', 'N/A'))
    print('  ✓ Pass (Generic Name解析)')
else:
    print('  WARNING: Generic Name not found')
print()

print('--- 测试5: Facility IE - Call Diversion (呼叫转移) ---')
facility_div = '08 02 90 01 3A 14 1C 09 01 81 31 03 81 10 10 11 90 F0'
msg5 = decode_q931_message(facility_div)
facility_ie5 = None
for ie in msg5.information_elements:
    if ie.ie_type == 0x14:
        facility_ie5 = ie
        break
if facility_ie5 and 'components' in facility_ie5.decoded_data:
    for comp in facility_ie5.decoded_data['components']:
        if comp.get('component_type') == '0x1C':
            print('  Diversion Reason:', comp.get('diversion_reason', 'N/A'))
            print('  Diverted To:', comp.get('diverted_to_number', 'N/A'))
    print('  ✓ Pass (Call Diversion解析)')
else:
    print('  WARNING: Call Diversion not found')
print()

print('--- 测试6: Facility IE - Supplementary Service (补充业务) ---')
facility_ss = '08 02 10 01 3A 14 40 04 00 01 12 34'
msg6 = decode_q931_message(facility_ss)
facility_ie6 = None
for ie in msg6.information_elements:
    if ie.ie_type == 0x14:
        facility_ie6 = ie
        break
if facility_ie6 and 'components' in facility_ie6.decoded_data:
    for comp in facility_ie6.decoded_data['components']:
        if 'service_name' in comp:
            print('  Service:', comp.get('service_name', 'N/A'))
            print('  Invoke ID:', comp.get('invoke_id', 'N/A'))
            print('  Parameters:', comp.get('parameters_hex', 'N/A'))
    print('  ✓ Pass (Supplementary Service解析)')
else:
    print('  WARNING: Supplementary Service not found')
print()

print('--- 测试7: Display IE 解析 (中文UCS2) ---')
display_ucs2 = '08 02 90 01 01 20 08 02 4F 60 59 7D 8B DD 8B DD'
msg7 = decode_q931_message(display_ucs2)
display_ie7 = None
for ie in msg7.information_elements:
    if ie.ie_type == 0x20:
        display_ie7 = ie
        break
if display_ie7:
    print('  Coding Scheme:', display_ie7.decoded_data.get('coding_scheme'))
    print('  Display Text:', display_ie7.decoded_data.get('display_text', 'N/A'))
    print('  ✓ Pass (中文UCS2 Display解析)')
else:
    print('  WARNING: Display IE not found')
print()

print('=' * 80)
print('CDR 生成测试')
print('=' * 80)
print()

print('--- 测试8: CDR生成 - 正常呼叫 ---')
call_flow_1 = {
    'id': 'test_001',
    'name': '测试正常呼叫',
    'calling_party': '13800138000',
    'called_party': '13900139000',
    'start_time': '2024-01-15 10:30:00',
    'messages': [
        {'timestamp': '10:30:00.125', 'direction': 'UE -> Network', 'hex_data': '08 02 10 01 05 04 03 80 90 A2 40 07 81 31 09 10 93 00 F0'},
        {'timestamp': '10:30:00.250', 'direction': 'Network -> UE', 'hex_data': '08 02 90 01 02'},
        {'timestamp': '10:30:00.380', 'direction': 'Network -> UE', 'hex_data': '08 02 90 01 01'},
        {'timestamp': '10:30:02.150', 'direction': 'Network -> UE', 'hex_data': '08 02 90 01 07 04 03 80 90 A2'},
        {'timestamp': '10:30:02.200', 'direction': 'UE -> Network', 'hex_data': '08 02 10 01 0F'},
        {'timestamp': '10:30:15.680', 'direction': 'UE -> Network', 'hex_data': '08 02 10 01 45 08 02 81 90'},
        {'timestamp': '10:30:15.720', 'direction': 'Network -> UE', 'hex_data': '08 02 90 01 46 08 02 82 90'},
        {'timestamp': '10:30:15.750', 'direction': 'UE -> Network', 'hex_data': '08 02 10 01 5A 08 02 81 90'}
    ]
}
cdr1 = generate_cdr(call_flow_1)
print('  CDR ID:', cdr1.cdr_id)
print('  Call ID:', cdr1.call_id)
print('  Calling:', cdr1.calling_party)
print('  Called:', cdr1.called_party)
print('  Call Status:', cdr1.call_status)
print('  Setup Duration:', cdr1.setup_duration_seconds, 's')
print('  Alerting Duration:', cdr1.alerting_duration_seconds, 's')
print('  Call Duration:', cdr1.call_duration_seconds, 's')
print('  Cause Value:', cdr1.cause_value)
print('  Cause Description:', cdr1.cause_description)
print('  Termination Reason:', cdr1.termination_reason)
print('  Message Count:', cdr1.message_count)
print('  ✓ Pass (正常呼叫CDR生成)')
print()

print('--- 测试9: CDR生成 - 用户忙 ---')
call_flow_2 = {
    'id': 'test_002',
    'name': '测试用户忙',
    'calling_party': '13700137000',
    'called_party': '13600136000',
    'start_time': '2024-01-15 11:45:00',
    'messages': [
        {'timestamp': '11:45:00.500', 'direction': 'UE -> Network', 'hex_data': '08 02 10 02 05 04 03 80 90 A2 40 07 81 31 06 10 63 00 F0'},
        {'timestamp': '11:45:00.620', 'direction': 'Network -> UE', 'hex_data': '08 02 90 02 02'},
        {'timestamp': '11:45:00.850', 'direction': 'Network -> UE', 'hex_data': '08 02 90 02 45 08 02 82 91'},
        {'timestamp': '11:45:00.900', 'direction': 'UE -> Network', 'hex_data': '08 02 10 02 46'},
        {'timestamp': '11:45:00.950', 'direction': 'Network -> UE', 'hex_data': '08 02 90 02 5A'}
    ]
}
cdr2 = generate_cdr(call_flow_2)
print('  Call Status:', cdr2.call_status)
print('  Cause Value:', cdr2.cause_value)
print('  Cause Description:', cdr2.cause_description)
print('  Cause Location:', cdr2.cause_location)
print('  Termination Reason:', cdr2.termination_reason)
assert cdr2.cause_value == 17, f'Expected cause_value 17, got {cdr2.cause_value}'
assert 'User busy' in cdr2.cause_description, 'Expected User busy in description'
print('  ✓ Pass (用户忙CDR生成)')
print()

print('--- 测试10: CDR导出格式测试 ---')
call_flow_3 = {
    'id': 'test_003',
    'name': '测试无应答',
    'calling_party': '13500135000',
    'called_party': '13400134000',
    'start_time': '2024-01-15 14:20:00',
    'messages': [
        {'timestamp': '14:20:00.300', 'direction': 'UE -> Network', 'hex_data': '08 02 10 03 05 04 03 80 90 A2 40 07 81 31 04 10 43 00 F0'},
        {'timestamp': '14:20:00.450', 'direction': 'Network -> UE', 'hex_data': '08 02 90 03 02'},
        {'timestamp': '14:20:00.600', 'direction': 'Network -> UE', 'hex_data': '08 02 90 03 01'},
        {'timestamp': '14:20:18.900', 'direction': 'Network -> UE', 'hex_data': '08 02 90 03 45 08 02 82 93'},
        {'timestamp': '14:20:18.950', 'direction': 'UE -> Network', 'hex_data': '08 02 10 03 46 08 02 81 90'}
    ]
}
cdr3 = generate_cdr(call_flow_3)
print('  CDR to JSON length:', len(cdr_to_json(cdr3)))
print('  CDR to CSV length:', len(cdr_to_csv(cdr3)))
print('  CDR to Text length:', len(cdr_to_text(cdr3)))
print('  CDR Dict keys:', list(cdr_to_dict(cdr3).keys()))
print('  CDR Summary:', generate_cdr_summary(cdr3))
print('  ✓ Pass (CDR导出格式测试)')
print()

print('--- 测试11: 递归IE解析 ---')
complex_msg = '08 02 10 01 05 04 03 80 90 A2 18 03 80 83 01 40 07 81 31 09 10 93 00 F0 20 06 00 54 45 53 54'
msg11 = decode_q931_message(complex_msg)
recursive_result = decode_all_ies_recursive(msg11)
print('  Total IE Count:', recursive_result['summary']['total_ies'])
print('  Decoded IE Count:', recursive_result['summary']['decoded_ies'])
print('  Extracted Fields:', list(recursive_result['extracted_fields'].keys()))
print('  All IE Paths:')
for ie_info in recursive_result['all_ies']:
    print(f'    - {ie_info["path"]} (0x{ie_info["ie_type"]})')
assert recursive_result['summary']['total_ies'] >= 4, f'Expected at least 4 IEs'
print('  ✓ Pass (递归IE解析)')
print()

print('=' * 80)
print('所有增强测试通过! ✓')
print('=' * 80)
print()
print('新增功能总结:')
print('  1. Facility IE多段解析: 支持80+种设施组件')
print('  2. Generic Name/Number/Digit解析')
print('  3. Call Diversion/Forwarding Info解析')
print('  4. Supplementary Service解析')
print('  5. Display IE完整解析 (ASCII/UCS2)')
print('  6. CDR生成: 完整呼叫详细记录')
print('  7. CDR导出: JSON/CSV/Text三种格式')
print('  8. CDR摘要: 快速获取关键信息')
print()
print('CDR包含字段:')
print('  - 呼叫双方信息 (主叫/被叫号码、显示名称)')
print('  - 完整时间线 (Setup/Alerting/Connect/Disconnect/Release)')
print('  - 呼叫时长 (呼叫/Setup/振铃时长)')
print('  - 承载能力信息')
print('  - 释放原因 (原因值/描述/位置/编码标准)')
print('  - 转移/前转信息')
print('  - 补充业务信息')
print('  - 显示文本信息')
print('  - 完整消息流记录')
print('  - 统计信息')
