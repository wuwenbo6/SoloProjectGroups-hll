#!/usr/bin/env python3
"""
高并发压力测试脚本
用于验证：
1. 高并发下日志不丢失
2. 界面在大量日志下不卡死
"""

import socket
import struct
import time
import threading
import random
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed

def build_modbus_request(transaction_id, unit_id, function_code, start_addr, quantity):
    protocol_id = 0
    length = 6
    header = struct.pack('>HHHB', transaction_id, protocol_id, length, unit_id)
    body = struct.pack('>BBHH', function_code, 0, start_addr, quantity)
    return header + body

def send_request(host, port, unit_id, func_code, timeout=2):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((host, port))
        req = build_modbus_request(random.randint(1, 65535), unit_id, func_code, 
                                   random.randint(0, 100), random.randint(1, 20))
        sock.sendall(req)
        resp = sock.recv(1024)
        sock.close()
        return True, resp
    except Exception as e:
        return False, str(e)

def worker_thread(host, ports, unit_ids, func_codes, num_requests, results, thread_id):
    success_count = 0
    fail_count = 0
    
    for i in range(num_requests):
        port = random.choice(ports)
        unit_id = random.choice(unit_ids)
        func_code = random.choice(func_codes)
        
        success, _ = send_request(host, port, unit_id, func_code)
        if success:
            success_count += 1
        else:
            fail_count += 1
        
        if i % 100 == 0 and i > 0:
            print(f"[线程 {thread_id:2d}] 已发送 {i}/{num_requests}, 成功: {success_count}, 失败: {fail_count}")
    
    results[thread_id] = (success_count, fail_count)

def stress_test(host, ports, num_threads, requests_per_thread, delay=0):
    unit_ids = [1, 2, 3]
    func_codes = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0F, 0x10]
    
    total_requests = num_threads * requests_per_thread
    print("=" * 70)
    print(f"高并发压力测试")
    print("=" * 70)
    print(f"目标地址: {host}:{ports}")
    print(f"线程数: {num_threads}")
    print(f"每线程请求数: {requests_per_thread}")
    print(f"总请求数: {total_requests:,}")
    print(f"请求间隔: {delay}s")
    print("-" * 70)
    
    results = {}
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = []
        for i in range(num_threads):
            future = executor.submit(worker_thread, host, ports, unit_ids, func_codes, 
                                     requests_per_thread, results, i)
            futures.append(future)
        
        for future in as_completed(futures):
            pass
    
    elapsed = time.time() - start_time
    
    total_success = sum(r[0] for r in results.values())
    total_fail = sum(r[1] for r in results.values())
    
    print("-" * 70)
    print(f"测试完成! 耗时: {elapsed:.2f}秒")
    print(f"总请求: {total_requests:,}")
    print(f"成功: {total_success:,} ({total_success/total_requests*100:.1f}%)")
    print(f"失败: {total_fail:,} ({total_fail/total_requests*100:.1f}%)")
    print(f"吞吐量: {total_requests/elapsed:.1f} 请求/秒")
    print("-" * 70)
    print("请刷新前端页面验证:")
    print(f"  1. 日志总数应接近 {total_success:,} (部分可能在队列中处理中)")
    print(f"  2. 界面应流畅不卡顿")
    print(f"  3. 攻击地图应显示多个访问来源")
    print("=" * 70)
    
    return total_success, total_fail

def rapid_fire_test(host, ports, duration=10):
    """快速连续发送请求，测试日志队列处理能力"""
    unit_ids = [1, 2, 3]
    func_codes = [0x03, 0x04, 0x06]
    
    print("=" * 70)
    print(f"快速射击测试 (持续 {duration} 秒)")
    print("=" * 70)
    
    count = 0
    start_time = time.time()
    
    try:
        while time.time() - start_time < duration:
            port = random.choice(ports)
            unit_id = random.choice(unit_ids)
            func_code = random.choice(func_codes)
            send_request(host, port, unit_id, func_code, timeout=1)
            count += 1
            if count % 100 == 0:
                elapsed = time.time() - start_time
                print(f"  已发送 {count:,} 请求, 速度: {count/elapsed:.1f} req/s")
    except KeyboardInterrupt:
        pass
    
    elapsed = time.time() - start_time
    print(f"\n测试完成! 发送了 {count:,} 请求, 速度: {count/elapsed:.1f} req/s")
    return count

def slowloris_test(host, port, duration=5):
    """慢速攻击测试，验证slow陷阱效果"""
    print("=" * 70)
    print(f"慢速请求测试 (测试 slow 陷阱)")
    print("=" * 70)
    
    print(f"向端口 {port} 发送请求 (设置超时10秒)...")
    start = time.time()
    success, resp = send_request(host, port, 1, 0x03, timeout=10)
    elapsed = time.time() - start
    
    if success:
        print(f"收到响应, 耗时: {elapsed:.2f}秒")
        if elapsed > 25:
            print("✓ 慢速陷阱生效!")
        else:
            print("响应较快，可能未触发slow陷阱")
    else:
        print(f"请求超时或失败，耗时: {elapsed:.2f}秒")
    
    return elapsed

def main():
    parser = argparse.ArgumentParser(description='Modbus 高并发压力测试')
    parser.add_argument('--host', default='localhost', help='服务器地址')
    parser.add_argument('--ports', nargs='+', type=int, default=[5021, 5022, 5023],
                        help='从站端口列表')
    parser.add_argument('--mode', choices=['stress', 'rapid', 'slow', 'all'], 
                        default='all', help='测试模式')
    parser.add_argument('--threads', type=int, default=10, help='并发线程数')
    parser.add_argument('--requests', type=int, default=1000, help='每线程请求数')
    parser.add_argument('--duration', type=int, default=10, help='快速测试持续时间(秒)')
    
    args = parser.parse_args()
    
    if args.mode == 'stress' or args.mode == 'all':
        stress_test(args.host, args.ports, args.threads, args.requests)
        print()
    
    if args.mode == 'rapid' or args.mode == 'all':
        rapid_fire_test(args.host, args.ports, args.duration)
        print()
    
    if args.mode == 'slow' or args.mode == 'all':
        slowloris_test(args.host, args.ports[0])
        print()

if __name__ == '__main__':
    main()
