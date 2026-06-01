#!/usr/bin/env python3
"""
Modbus TCP 测试客户端
用于测试Modbus从站模拟器
"""

import socket
import struct
import time
import random
import argparse

def build_modbus_request(transaction_id, unit_id, function_code, start_addr, quantity):
    """构建Modbus TCP请求"""
    protocol_id = 0
    length = 6
    
    header = struct.pack('>HHHB', transaction_id, protocol_id, length, unit_id)
    body = struct.pack('>BBHH', function_code, 0, start_addr, quantity)
    
    return header + body

def send_modbus_request(host, port, request):
    """发送Modbus请求并接收响应"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((host, port))
        sock.sendall(request)
        response = sock.recv(1024)
        sock.close()
        return response
    except Exception as e:
        print(f"  Error: {e}")
        return None

def parse_response(response):
    """解析Modbus响应"""
    if not response or len(response) < 9:
        return None
    
    transaction_id, protocol_id, length = struct.unpack('>HHH', response[:6])
    unit_id = response[6]
    function_code = response[7]
    
    is_exception = function_code & 0x80
    
    if is_exception:
        exception_code = response[8]
        return {
            'transaction_id': transaction_id,
            'unit_id': unit_id,
            'function_code': function_code & 0x7F,
            'exception': True,
            'exception_code': exception_code
        }
    else:
        return {
            'transaction_id': transaction_id,
            'unit_id': unit_id,
            'function_code': function_code,
            'exception': False,
            'data': response[8:]
        }

def test_function_codes(host, port, unit_id):
    """测试各种功能码"""
    tests = [
        (0x01, "Read Coils", 0, 10),
        (0x02, "Read Discrete Inputs", 0, 10),
        (0x03, "Read Holding Registers", 0, 5),
        (0x04, "Read Input Registers", 0, 5),
        (0x05, "Write Single Coil", 0, 0xFF00),
        (0x06, "Write Single Register", 0, 1234),
    ]
    
    print(f"\n=== 测试从站 {unit_id} (端口 {port}) ===")
    print("-" * 60)
    
    for func_code, func_name, start_addr, quantity in tests:
        req = build_modbus_request(1, unit_id, func_code, start_addr, quantity)
        print(f"测试: {func_name} (0x{func_code:02X})")
        print(f"  请求: {req.hex()}")
        
        start_time = time.time()
        resp = send_modbus_request(host, port, req)
        elapsed = (time.time() - start_time) * 1000
        
        if resp:
            parsed = parse_response(resp)
            if parsed:
                if parsed['exception']:
                    print(f"  异常响应! 异常码: 0x{parsed['exception_code']:02X}")
                else:
                    print(f"  正常响应 ({elapsed:.1f}ms): {resp.hex()}")
        print()

def random_test(host, ports, count=20):
    """随机测试，模拟真实扫描行为"""
    print(f"\n=== 随机测试 ({count} 次) ===")
    print("-" * 60)
    
    function_codes = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06]
    
    for i in range(count):
        port = random.choice(ports)
        unit_id = random.randint(1, 3)
        func_code = random.choice(function_codes)
        start_addr = random.randint(0, 100)
        quantity = random.randint(1, 10)
        
        req = build_modbus_request(i+1, unit_id, func_code, start_addr, quantity)
        resp = send_modbus_request(host, port, req)
        
        if resp:
            parsed = parse_response(resp)
            if parsed:
                status = "异常" if parsed['exception'] else "正常"
                print(f"[{i+1}/{count}] 端口={port}, 从站={unit_id}, 功能码=0x{func_code:02X} -> {status}")
        else:
            print(f"[{i+1}/{count}] 端口={port}, 从站={unit_id}, 功能码=0x{func_code:02X} -> 无响应")
        
        time.sleep(0.2)

def brute_force_test(host, port, unit_id):
    """暴力扫描功能码，用于测试陷阱"""
    print(f"\n=== 功能码扫描测试 (端口 {port}, 从站 {unit_id}) ===")
    print("-" * 60)
    
    for func_code in range(1, 100):
        req = build_modbus_request(func_code, unit_id, func_code, 0, 1)
        print(f"扫描功能码 0x{func_code:02X}... ", end="", flush=True)
        
        start_time = time.time()
        resp = send_modbus_request(host, port, req)
        elapsed = (time.time() - start_time) * 1000
        
        if resp:
            parsed = parse_response(resp)
            if parsed and parsed['exception']:
                print(f"异常 (0x{parsed['exception_code']:02X}, {elapsed:.1f}ms)")
            else:
                print(f"成功 ({elapsed:.1f}ms)")
        else:
            print("超时/无响应")

def main():
    parser = argparse.ArgumentParser(description='Modbus TCP 测试客户端')
    parser.add_argument('--host', default='localhost', help='服务器地址')
    parser.add_argument('--ports', nargs='+', type=int, default=[5021, 5022, 5023], 
                        help='从站端口列表')
    parser.add_argument('--mode', choices=['basic', 'random', 'brute'], default='basic',
                        help='测试模式: basic(基本功能), random(随机扫描), brute(暴力扫描)')
    parser.add_argument('--count', type=int, default=20, help='随机测试次数')
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("Modbus TCP 测试客户端")
    print("=" * 60)
    
    if args.mode == 'basic':
        for i, port in enumerate(args.ports, 1):
            test_function_codes(args.host, port, i)
    elif args.mode == 'random':
        random_test(args.host, args.ports, args.count)
    elif args.mode == 'brute':
        brute_force_test(args.host, args.ports[0], 1)
    
    print("\n测试完成!")

if __name__ == '__main__':
    main()
