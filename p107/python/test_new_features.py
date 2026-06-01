#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from canoe_integration import CANoeCapture, CANoeInterfaceType
from trigger_recorder import TriggerRecorder, TriggerType, TriggerCondition, Trigger
from excel_exporter import ExcelExporter, export_dbc_from_database
from database import Database
from dbc_generator import DBCGenerator
import tempfile
import json

def test_canoe_integration():
    print("=" * 60)
    print("测试CANoe集成...")
    print("=" * 60)
    
    canoe = CANoeCapture('simulated')
    
    connected = canoe.connect()
    print(f"连接状态: {connected}")
    assert connected, "CANoe连接失败"
    
    print(f"可用信号: {len(canoe.controller.get_available_signals())} 个")
    
    started = canoe.start()
    print(f"测量启动状态: {started}")
    assert started, "测量启动失败"
    
    print("采集500ms数据...")
    import time
    time.sleep(0.5)
    
    messages = canoe.get_messages()
    print(f"采集到报文数量: {len(messages)}")
    assert len(messages) > 0, "未采集到任何报文"
    
    if messages:
        first_msg = messages[0]
        print(f"第一条报文: ID=0x{first_msg['can_id']:X}, DLC={first_msg['dlc']}, TS={first_msg['timestamp']:.6f}")
    
    canoe.stop()
    print("测量已停止")
    
    canoe.disconnect()
    print("已断开连接")
    
    print("✅ CANoe集成测试通过\n")

def test_trigger_recorder():
    print("=" * 60)
    print("测试触发录制器...")
    print("=" * 60)
    
    recorder = TriggerRecorder()
    
    print("添加CAN ID触发...")
    recorder.add_trigger(Trigger(
        trigger_type=TriggerType.CAN_ID,
        can_id=0x123,
        description="测试CAN ID触发"
    ))
    
    print("添加信号值触发...")
    recorder.add_trigger(Trigger(
        trigger_type=TriggerType.SIGNAL_VALUE,
        can_id=0x456,
        byte_offset=0,
        bit_length=8,
        condition=TriggerCondition.GREATER,
        value=100,
        pre_trigger_samples=50,
        post_trigger_samples=50,
        description="测试信号值触发"
    ))
    
    print(f"当前触发器数量: {len(recorder.get_triggers())}")
    assert len(recorder.get_triggers()) == 2, "触发器数量不正确"
    
    print("启动触发录制...")
    recorder.start_recording()
    assert recorder.is_recording, "录制未启动"
    
    print("注入测试报文...")
    import time
    base_time = time.time()
    
    for i in range(10):
        recorder.process_message({
            'can_id': 0x123,
            'data': bytes([i, 0, 0, 0, 0, 0, 0, 0]),
            'dlc': 8,
            'timestamp': base_time + i * 0.1,
            'is_extended': False
        })
    
    triggered_data = recorder.get_triggered_data()
    print(f"触发捕获报文数量: {len(triggered_data)}")
    
    if triggered_data:
        print(f"第一条报文ID: 0x{triggered_data[0]['can_id']:X}")
    
    print("停止触发录制...")
    recorder.stop_recording()
    assert not recorder.is_recording, "录制未停止"
    
    print("删除触发器...")
    recorder.remove_trigger(0)
    assert len(recorder.get_triggers()) == 1, "删除触发器失败"
    
    print("✅ 触发录制器测试通过\n")

def test_excel_exporter():
    print("=" * 60)
    print("测试Excel导出...")
    print("=" * 60)
    
    db = Database()
    db.create_project("测试项目", "用于Excel导出测试")
    project_id = db.get_all_projects()[-1]['id']
    
    db.insert_messages(project_id, [
        {'can_id': 0x100, 'data': [0x01, 0x02, 0x03, 0x04], 'dlc': 4, 'timestamp': 0.0},
        {'can_id': 0x200, 'data': [0x05, 0x06, 0x07, 0x08], 'dlc': 4, 'timestamp': 0.1}
    ])
    
    db.add_manual_signal(project_id, 0x100, {
        'name': 'TestSignal1',
        'start_bit': 0,
        'bit_length': 8,
        'is_signed': False,
        'is_big_endian': False,
        'scale': 1.0,
        'offset': 0.0,
        'unit': 'km/h',
        'is_manual': True
    })
    
    db.add_manual_signal(project_id, 0x200, {
        'name': 'TestSignal2',
        'start_bit': 8,
        'bit_length': 16,
        'is_signed': True,
        'is_big_endian': True,
        'scale': 0.1,
        'offset': -100.0,
        'unit': '°C',
        'is_manual': True
    })
    
    with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as f:
        temp_path = f.name
    
    try:
        output_path = export_dbc_from_database(project_id, temp_path, db)
        print(f"Excel导出路径: {output_path}")
        assert os.path.exists(temp_path), "Excel文件未生成"
        
        file_size = os.path.getsize(temp_path)
        print(f"Excel文件大小: {file_size} bytes")
        assert file_size > 0, "Excel文件为空"
        
        print("✅ Excel导出测试通过\n")
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        db.delete_project(project_id)

def test_integration_with_main():
    print("=" * 60)
    print("测试主程序IPC接口...")
    print("=" * 60)
    
    import json
    from main import CANAnalyzerServer
    
    server = CANAnalyzerServer()
    
    print("测试连接CANoe...")
    response = server._connect_canoe({'interface_type': 'simulated'})
    print(f"连接结果: {response.get('success', False)}")
    assert response.get('success'), "连接CANoe失败"
    
    print("测试添加触发器...")
    response = server._add_trigger({
        'trigger_type': 'can_id',
        'can_id': 0x100,
        'description': '测试触发器'
    })
    print(f"添加触发器结果: {response.get('success', False)}")
    assert response.get('success'), "添加触发器失败"
    
    print("测试获取触发器...")
    response = server._get_triggers()
    print(f"触发器数量: {len(response.get('triggers', []))}")
    assert len(response.get('triggers', [])) == 1, "触发器数量不正确"
    
    print("✅ IPC接口测试通过\n")

def main():
    print("\n" + "=" * 60)
    print("CAN 分析仪新功能测试套件")
    print("=" * 60 + "\n")
    
    try:
        test_canoe_integration()
        test_trigger_recorder()
        test_excel_exporter()
        test_integration_with_main()
        
        print("=" * 60)
        print("🎉 所有测试通过!")
        print("=" * 60)
        return 0
    except AssertionError as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return 1
    except Exception as e:
        print(f"\n❌ 发生错误: {e}")
        import traceback
        traceback.print_exc()
        return 2

if __name__ == '__main__':
    sys.exit(main())
