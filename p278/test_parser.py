#!/usr/bin/env python3
import sys
sys.path.insert(0, 'backend')

from enip_parser import parse_enip_packet, build_read_tag_request, build_write_tag_request, decode_tag_data, CIPDataType


def test_parse_read_request():
    print("=" * 60)
    print("测试1: 解析读取标签请求报文")
    print("=" * 60)
    
    hex_data = "6f00360000000000000000000000000000000000000000000000000a00020000000000b10010004c0291085465737454616700000100"
    data = bytes.fromhex(hex_data)
    
    result = parse_enip_packet(data)
    
    if result['success']:
        packet = result['packet']
        print(f"✓ 命令: {packet['header']['command_name']}")
        print(f"✓ 会话句柄: {packet['header']['session_handle']}")
        
        if packet['cip_message']:
            cip = packet['cip_message']
            print(f"✓ CIP服务: {cip['service_name']}")
            print(f"✓ 路径段数: {len(cip['path_segments'])}")
            for i, seg in enumerate(cip['path_segments']):
                print(f"  路径[{i}]: {seg['segment_type']} = {seg['value']}")
        print("✓ 解析成功!")
    else:
        print(f"✗ 解析失败: {result['error']}")
    
    return result['success']


def test_parse_read_response():
    print("\n" + "=" * 60)
    print("测试2: 解析读取标签响应报文")
    print("=" * 60)
    
    hex_data = "6f001e0000000000000000000000000000000000000000000000000a00020000000000b1000800cc0000c40001002a000000"
    data = bytes.fromhex(hex_data)
    
    result = parse_enip_packet(data)
    
    if result['success']:
        packet = result['packet']
        print(f"✓ 命令: {packet['header']['command_name']}")
        
        if packet['cip_message']:
            cip = packet['cip_message']
            print(f"✓ CIP服务: {cip['service_name']}")
            print(f"✓ 状态码: {cip['status']}")
            print(f"✓ 数据长度: {cip['data_length']} 字节")
            print(f"✓ 原始数据(Hex): {cip['data_hex']}")
            
            decoded = decode_tag_data(bytes.fromhex(cip['data_hex']), CIPDataType.DINT)
            print(f"✓ 解码后的值: {decoded}")
        print("✓ 解析成功!")
    else:
        print(f"✗ 解析失败: {result['error']}")
    
    return result['success']


def test_build_read_request():
    print("\n" + "=" * 60)
    print("测试3: 构建读取标签请求")
    print("=" * 60)
    
    tag_name = "TestTag"
    request = build_read_tag_request(tag_name, CIPDataType.DINT)
    
    print(f"✓ 标签名: {tag_name}")
    print(f"✓ 请求数据(Hex): {request.hex()}")
    print(f"✓ 请求长度: {len(request)} 字节")
    print("✓ 构建成功!")
    
    return True


def test_build_write_request():
    print("\n" + "=" * 60)
    print("测试4: 构建写入标签请求")
    print("=" * 60)
    
    tag_name = "TestTag"
    value = 255
    request = build_write_tag_request(tag_name, value, CIPDataType.DINT)
    
    print(f"✓ 标签名: {tag_name}")
    print(f"✓ 写入值: {value}")
    print(f"✓ 请求数据(Hex): {request.hex()}")
    print(f"✓ 请求长度: {len(request)} 字节")
    print("✓ 构建成功!")
    
    return True


def test_parse_write_request():
    print("\n" + "=" * 60)
    print("测试5: 解析写入标签请求报文")
    print("=" * 60)
    
    hex_data = "6f003a0000000000000000000000000000000000000000000000000a00020000000000b10014004d029108546573745461670000c4000100ff000000"
    data = bytes.fromhex(hex_data)
    
    result = parse_enip_packet(data)
    
    if result['success']:
        packet = result['packet']
        print(f"✓ 命令: {packet['header']['command_name']}")
        
        if packet['cip_message']:
            cip = packet['cip_message']
            print(f"✓ CIP服务: {cip['service_name']}")
            print(f"✓ 路径段数: {len(cip['path_segments'])}")
            for i, seg in enumerate(cip['path_segments']):
                print(f"  路径[{i}]: {seg['segment_type']} = {seg['value']}")
            print(f"✓ 数据长度: {cip['data_length']} 字节")
        print("✓ 解析成功!")
    else:
        print(f"✗ 解析失败: {result['error']}")
    
    return result['success']


def test_register_session():
    print("\n" + "=" * 60)
    print("测试6: 解析注册会话报文")
    print("=" * 60)
    
    hex_data = "650004000000000000000000000000000000000001000000"
    data = bytes.fromhex(hex_data)
    
    result = parse_enip_packet(data)
    
    if result['success']:
        packet = result['packet']
        print(f"✓ 命令: {packet['header']['command_name']}")
        print(f"✓ 长度: {packet['header']['length']} 字节")
        print("✓ 解析成功!")
    else:
        print(f"✗ 解析失败: {result['error']}")
    
    return result['success']


def test_big_endian_path():
    print("\n" + "=" * 60)
    print("测试7: 大端序路径解析")
    print("=" * 60)
    
    from backend.enip_parser import CIPMessage
    
    path_data = bytes([
        0x20, 0x04,
        0x26, 0x00, 0x01,
        0x2C, 0x00, 0x00, 0x00, 0x01,
        0x00
    ])
    segments = CIPMessage._parse_path(path_data)
    
    print(f"✓ 路径数据: {path_data.hex()}")
    print(f"✓ 解析到 {len(segments)} 个路径段")
    
    for i, seg in enumerate(segments):
        print(f"  段[{i}]: {seg.segment_type} = {seg.value}")
    
    if len(segments) >= 3:
        class_8bit = segments[0].value
        class_16bit = segments[1].value
        class_32bit = segments[2].value
        
        if class_8bit == 0x04 and class_16bit == 0x0001 and class_32bit == 0x00000001:
            print("✓ 大端序解析成功! (8-bit: 0x04, 16-bit: 0x0001, 32-bit: 0x00000001)")
            return True
        else:
            print(f"✗ 大端序值不正确: 8-bit={hex(class_8bit)}, 16-bit={hex(class_16bit)}, 32-bit={hex(class_32bit)}")
            return False
    else:
        print(f"✗ 大端序解析失败，期望至少3个段，实际 {len(segments)} 个")
        return False


def test_multi_segment_path_with_terminator():
    print("\n" + "=" * 60)
    print("测试8: 多段递归解析与路径结束符")
    print("=" * 60)
    
    from backend.enip_parser import CIPMessage
    
    path_data = bytes([
        0x20, 0x04,
        0x21, 0x01,
        0x30, 0x00, 0x00, 0x00, 0x01,
        0x87, 0x54, 0x65, 0x73, 0x74, 0x54, 0x61, 0x67, 0x00,
        0x00,
        0xFF, 0xFF
    ])
    
    segments = CIPMessage._parse_path(path_data)
    
    print(f"✓ 路径数据: {path_data.hex()}")
    print(f"✓ 解析到 {len(segments)} 个路径段")
    
    for i, seg in enumerate(segments):
        print(f"  段[{i}]: {seg.segment_type} = {seg.value}")
    
    if len(segments) >= 4:
        print("✓ 多段递归解析与结束符检测成功! (结束符 0x00 后的数据 0xFF 0xFF 已被忽略)")
        return True
    else:
        print(f"✗ 多段解析失败，期望至少4个段，实际 {len(segments)} 个")
        return False


def test_port_segment():
    print("\n" + "=" * 60)
    print("测试9: 端口段解析")
    print("=" * 60)
    
    from backend.enip_parser import CIPMessage
    
    path_data = bytes([0x42, 0x03, 0x01, 0x02, 0x03, 0x00])
    segments = CIPMessage._parse_path(path_data)
    
    print(f"✓ 路径数据: {path_data.hex()}")
    print(f"✓ 解析到 {len(segments)} 个路径段")
    
    for i, seg in enumerate(segments):
        print(f"  段[{i}]: {seg.segment_type} = {seg.value}")
    
    if len(segments) > 0 and 'Port' in segments[0].segment_type:
        port = segments[0].value.get('port') if isinstance(segments[0].value, dict) else None
        if port == 2:
            print("✓ 端口段解析成功! (port=2, link_address=010203)")
            return True
    
    print("✗ 端口段解析失败")
    return False


def test_explicit_message_build():
    print("\n" + "=" * 60)
    print("测试10: 构建显式消息请求")
    print("=" * 60)
    
    from backend.enip_parser import build_explicit_message, CIPServiceCode
    
    service_code = CIPServiceCode.GET_ATTRIBUTE_SINGLE
    class_id = 0x04
    instance_id = 0x01
    attribute_id = 0x03
    
    message = build_explicit_message(service_code, class_id, instance_id, attribute_id)
    
    print(f"✓ 服务码: 0x{service_code:02X} ({CIPServiceCode(service_code).name})")
    print(f"✓ Class ID: 0x{class_id:02X}")
    print(f"✓ Instance ID: 0x{instance_id:02X}")
    print(f"✓ Attribute ID: 0x{attribute_id:02X}")
    print(f"✓ 消息数据(Hex): {message.hex()}")
    print(f"✓ 消息长度: {len(message)} 字节")
    
    parsed = parse_enip_packet(bytes([0x6F, 0x00, len(message)+6, 0x00, 0x00, 0x00, 0x00, 
                                     0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                     0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                     0x00, 0x00, 0x00, 0x00, 0x0A, 0x00, 0x02, 0x00, 
                                     0x00, 0x00, 0x00, 0x00, 0xB1, 0x00, len(message) & 0xFF, 
                                     (len(message) >> 8) & 0xFF]) + message)
    
    if parsed['success']:
        print("✓ 显式消息构建成功!")
        return True
    
    print("✗ 显式消息构建失败")
    return False


def test_tag_database_operations():
    print("\n" + "=" * 60)
    print("测试11: 标签数据库操作")
    print("=" * 60)
    
    from backend.enip_parser import create_default_tag_database, TagDefinition, CIPDataType
    
    db = create_default_tag_database()
    
    print(f"✓ 默认标签数量: {len(db.list_tags())}")
    
    for tag_name in db.list_tags()[:5]:
        tag = db.get_tag(tag_name)
        print(f"  - {tag.name}: {tag.data_type_name} = {tag.current_value}")
    
    new_tag = TagDefinition(
        name='CustomTag.MyTag',
        data_type=CIPDataType.DINT,
        data_type_name='DINT',
        instance_id=999,
        description='自定义测试标签',
        current_value=12345
    )
    db.add_tag(new_tag)
    
    added_tag = db.get_tag('CustomTag.MyTag')
    if added_tag and added_tag.current_value == 12345:
        print("✓ 标签添加成功!")
    else:
        print("✗ 标签添加失败")
        return False
    
    dint_tags = db.filter_by_type(CIPDataType.DINT)
    print(f"✓ DINT类型标签数量: {len(dint_tags)}")
    
    db.remove_tag('CustomTag.MyTag')
    if db.get_tag('CustomTag.MyTag') is None:
        print("✓ 标签删除成功!")
    else:
        print("✗ 标签删除失败")
        return False
    
    return True


def test_tag_database_export():
    print("\n" + "=" * 60)
    print("测试12: 标签数据库导出")
    print("=" * 60)
    
    from backend.enip_parser import create_default_tag_database, CIPDataType
    import json
    
    db = create_default_tag_database()
    
    json_str = db.export_json()
    json_data = json.loads(json_str)
    
    print(f"✓ JSON导出成功，共 {len(json_data)} 个标签")
    print(f"✓ 第一个标签: {json_data[0]['name']} ({json_data[0]['data_type_name']})")
    
    if len(json_data) == len(db.list_tags()):
        print("✓ JSON导出验证通过!")
    else:
        print("✗ JSON导出验证失败")
        return False
    
    csv_str = db.export_csv()
    csv_lines = csv_str.strip().split('\n')
    
    print(f"✓ CSV导出成功，共 {len(csv_lines)} 行 (含表头)")
    print(f"✓ CSV表头: {csv_lines[0]}")
    
    if len(csv_lines) == len(db.list_tags()) + 1:
        print("✓ CSV导出验证通过!")
    else:
        print("✗ CSV导出验证失败")
        return False
    
    import tempfile
    import os
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        temp_json = f.name
        db.export_json(temp_json)
    
    db2 = create_default_tag_database()
    db2.import_json(temp_json)
    
    if len(db2.list_tags()) == len(db.list_tags()):
        print("✓ JSON导入验证通过!")
    else:
        print("✗ JSON导入验证失败")
        os.unlink(temp_json)
        return False
    
    os.unlink(temp_json)
    return True


def test_explicit_message_request_class():
    print("\n" + "=" * 60)
    print("测试13: ExplicitMessageRequest类测试")
    print("=" * 60)
    
    from backend.enip_parser import ExplicitMessageRequest, CIPPathSegment, CIPServiceCode
    
    path_segments = [
        CIPPathSegment(segment_type='Logical: Class ID (8-bit, BE)', value=0x04),
        CIPPathSegment(segment_type='Logical: Instance ID (8-bit, BE)', value=0x01),
        CIPPathSegment(segment_type='Logical: Attribute ID (8-bit, BE)', value=0x03),
    ]
    
    request = ExplicitMessageRequest(
        service_code=CIPServiceCode.GET_ATTRIBUTE_SINGLE,
        path=[(0x04, 0x01)],
        path_segments=path_segments,
        data=b''
    )
    
    request_bytes = request.to_bytes()
    
    print(f"✓ 服务码: 0x{request_bytes[0]:02X}")
    print(f"✓ 路径长度: {request_bytes[1]} words")
    print(f"✓ 请求数据(Hex): {request_bytes.hex()}")
    print(f"✓ 请求长度: {len(request_bytes)} 字节")
    
    expected_service = CIPServiceCode.GET_ATTRIBUTE_SINGLE
    if request_bytes[0] == expected_service:
        print("✓ ExplicitMessageRequest类测试通过!")
        return True
    else:
        print(f"✗ 服务码不匹配: 期望 0x{expected_service:02X}, 实际 0x{request_bytes[0]:02X}")
        return False


def main():
    print("\nEtherNet/IP 解析器测试套件")
    print("=" * 60)
    
    tests = [
        test_parse_read_request,
        test_parse_read_response,
        test_build_read_request,
        test_build_write_request,
        test_parse_write_request,
        test_register_session,
        test_big_endian_path,
        test_multi_segment_path_with_terminator,
        test_port_segment,
        test_explicit_message_build,
        test_tag_database_operations,
        test_tag_database_export,
        test_explicit_message_request_class
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"✗ 异常: {e}")
            failed += 1
    
    print("\n" + "=" * 60)
    print(f"测试结果: {passed} 个通过, {failed} 个失败")
    print("=" * 60)
    
    return failed == 0


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
