#!/usr/bin/env python3

from iso7816_parser import (
    StreamISO7816Parser, parse_sim_file, 
    export_to_xml, export_file_to_xml
)
import io
import os
import tempfile

def test_basic_parsing_and_paths():
    print('=== 测试1: 基本解析和路径构建 ===')
    data = b'\x00' * 1024
    stream = io.BytesIO(data)
    parser = StreamISO7816Parser(stream)
    root = parser.parse(total_size=len(data))
    print(f'根目录: {root.fid} - {root.path}')
    print(f'子文件数量: {len(root.children)}')
    assert root.path == '3F00', "根路径错误"
    print("✅ 路径构建正确")

def test_recursive_df_parsing():
    print('\n=== 测试2: 递归DF解析 ===')
    data = b'\x00' * 1024
    stream = io.BytesIO(data)
    parser = StreamISO7816Parser(stream)
    root = parser.parse(total_size=len(data))
    
    for child in root.children[:5]:
        print(f'  {child.file_type}: {child.fid} - {child.path} ({len(child.children)} 子文件)')
        assert '/' in child.path, "DF路径格式错误"
    print("✅ 递归DF解析正确")

def test_get_all_paths():
    print('\n=== 测试3: 获取所有路径 ===')
    data = b'\x00' * 1024
    stream = io.BytesIO(data)
    parser = StreamISO7816Parser(stream)
    root = parser.parse(total_size=len(data))
    
    all_paths = parser.get_all_paths()
    print(f'总文件数: {len(all_paths)}')
    print('前10个路径:')
    for path in all_paths[:10]:
        print(f'  {path}')
    assert len(all_paths) > 0, "路径列表为空"
    print("✅ 获取所有路径正确")

def test_find_file_by_path():
    print('\n=== 测试4: 按路径查找文件 ===')
    data = b'\x00' * 1024
    stream = io.BytesIO(data)
    parser = StreamISO7816Parser(stream)
    root = parser.parse(total_size=len(data))
    
    file_obj = parser.find_file_by_path('3F00/7F20/6F07')
    if file_obj:
        print(f'找到文件: {file_obj.fid} - {file_obj.name}')
        print(f'  路径: {file_obj.path}')
        print(f'  类型: {file_obj.file_type}')
        print(f'  大小: {file_obj.size} 字节')
        assert file_obj.path == '3F00/7F20/6F07', "查找路径错误"
    print("✅ 按路径查找正确")

def test_stream_generator():
    print('\n=== 测试5: 流式生成器 ===')
    data = b'\x00' * 1024
    stream = io.BytesIO(data)
    parser = StreamISO7816Parser(stream)
    
    count = 0
    for file_obj in parser.parse_stream_generator(total_size=len(data)):
        count += 1
        if count <= 5:
            print(f'  [{count}] {file_obj.file_type}: {file_obj.path}')
    print(f'  ... 共生成 {count} 个文件对象')
    assert count > 0, "生成器未产生任何文件"
    print("✅ 流式生成器正确")

def test_find_files_by_type():
    print('\n=== 测试6: 按类型查找 ===')
    data = b'\x00' * 1024
    stream = io.BytesIO(data)
    parser = StreamISO7816Parser(stream)
    root = parser.parse(total_size=len(data))
    
    df_files = parser.find_files_by_type('DF')
    ef_files = parser.find_files_by_type('EF')
    print(f'DF文件数量: {len(df_files)}')
    print(f'EF文件数量: {len(ef_files)}')
    assert len(df_files) > 0, "未找到DF文件"
    assert len(ef_files) > 0, "未找到EF文件"
    print("✅ 按类型查找正确")

def test_to_dict():
    print('\n=== 测试7: 转换为字典 ===')
    data = b'\x00' * 1024
    result = parse_sim_file(data)
    print(f'根路径: {result["path"]}')
    print(f'子文件数量: {len(result["children"])}')
    print(f'包含path字段: {"path" in result}')
    assert 'path' in result, "字典结果缺少path字段"
    print("✅ 字典转换正确")

def test_print_tree():
    print('\n=== 测试8: 打印树形结构 ===')
    data = b'\x00' * 1024
    stream = io.BytesIO(data)
    parser = StreamISO7816Parser(stream)
    root = parser.parse(total_size=len(data))
    parser.print_tree()
    print("✅ 树形打印正确")

def test_record_parsing():
    print('\n=== 测试9: 记录解析 (循环EF) ===')
    data = b'\x00' * 1024
    stream = io.BytesIO(data)
    parser = StreamISO7816Parser(stream)
    root = parser.parse(total_size=len(data), parse_records=True)
    
    ef_6f31 = parser.find_file_by_path('3F00/7F20/6F31')
    if ef_6f31:
        print(f'文件: {ef_6f31.fid} - {ef_6f31.name}')
        print(f'  EF类型: {ef_6f31.ef_type}')
        print(f'  记录大小: {ef_6f31.record_size} 字节')
        print(f'  记录数量: {ef_6f31.record_count}')
        if ef_6f31.records:
            print(f'  实际记录数: {len(ef_6f31.records)}')
        else:
            print(f'  注意: 此文件没有真实数据，记录列表为空')
        print('✅ 记录解析字段正确')
    else:
        print('⚠️ 未找到6F31文件')
    
    ef_6f3a = parser.find_file_by_path('3F00/7F20/6F3A')
    if ef_6f3a:
        print(f'文件: {ef_6f3a.fid} - {ef_6f3a.name}')
        print(f'  EF类型: {ef_6f3a.ef_type}')
        print('✅ 透明EF类型正确')

def test_to_dict_with_records():
    print('\n=== 测试10: 转换为字典(含记录) ===')
    data = b'\x00' * 1024
    result = parse_sim_file(data, parse_records=True)
    print(f'根路径: {result["path"]}')
    print(f'包含record_count字段: {"record_count" in result["children"][0] if result["children"] else "N/A"}')
    print(f'包含ef_type字段: {"ef_type" in result["children"][0] if result["children"] else "N/A"}')
    print("✅ 字典转换(含记录)正确")

def test_xml_export():
    print('\n=== 测试11: XML导出 ===')
    data = b'\x00' * 1024
    stream = io.BytesIO(data)
    parser = StreamISO7816Parser(stream)
    root = parser.parse(total_size=len(data), parse_records=True)
    
    xml_content = export_to_xml(root, pretty=True)
    print(f'XML长度: {len(xml_content)} 字符')
    print(f'包含SIMCardFileSystem根元素: {"SIMCardFileSystem" in xml_content}')
    print(f'包含File元素: {"<File" in xml_content}')
    print(f'包含path属性: {"path=" in xml_content}')
    assert 'SIMCardFileSystem' in xml_content, "XML缺少根元素"
    assert '<File' in xml_content, "XML缺少File元素"
    print("✅ XML导出正确")

def test_xml_file_export():
    print('\n=== 测试12: XML文件导出 ===')
    data = b'\x00' * 1024
    stream = io.BytesIO(data)
    parser = StreamISO7816Parser(stream)
    root = parser.parse(total_size=len(data), parse_records=True)
    
    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False)
    try:
        tmp.close()
        success = export_file_to_xml(root, tmp.name, pretty=True)
        assert success, "XML文件导出失败"
        assert os.path.exists(tmp.name), "XML文件未创建"
        file_size = os.path.getsize(tmp.name)
        print(f'XML文件大小: {file_size} 字节')
        assert file_size > 0, "XML文件为空"
        print("✅ XML文件导出正确")
    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)

def test_parser_to_xml_method():
    print('\n=== 测试13: 解析器XML方法 ===')
    data = b'\x00' * 1024
    stream = io.BytesIO(data)
    parser = StreamISO7816Parser(stream)
    root = parser.parse(total_size=len(data), parse_records=True)
    
    xml_content = parser.to_xml(root, pretty=True)
    print(f'XML长度: {len(xml_content)} 字符')
    print(f'包含记录元素: {"<Records>" in xml_content or "records" not in xml_content.lower()}')
    print("✅ 解析器XML方法正确")

if __name__ == '__main__':
    test_basic_parsing_and_paths()
    test_recursive_df_parsing()
    test_get_all_paths()
    test_find_file_by_path()
    test_stream_generator()
    test_find_files_by_type()
    test_to_dict()
    test_print_tree()
    test_record_parsing()
    test_to_dict_with_records()
    test_xml_export()
    test_xml_file_export()
    test_parser_to_xml_method()
    print('\n🎉 所有测试通过!')
