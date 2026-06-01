#!/usr/bin/env python3
import asyncio
import websockets
import json
import time
import random
from collections import defaultdict
from threading import Thread, Lock


class OpenFlowSimulator:
    def __init__(self):
        self.group_tables = {}
        self.flow_tables = defaultdict(list)
        self.stats = {
            'group_stats': defaultdict(lambda: {
                'packet_count': 0,
                'byte_count': 0,
                'last_packet_count': 0,
                'last_byte_count': 0,
                'pps': 0,
                'bps': 0
            }),
            'port_stats': defaultdict(lambda: {
                'rx_packets': 0,
                'tx_packets': 0,
                'last_rx': 0,
                'last_tx': 0,
                'rx_pps': 0,
                'tx_pps': 0
            })
        }
        self.group_type = 'ALL'
        self.test_running = False
        self.warmup_running = False
        self.traffic_threads = []
        self.ws_clients = set()
        self.wrr_index = 0
        self.wrr_current_count = 0
        self.wrr_lock = Lock()
        self.warmup_seconds = 10
        self.warmup_start_time = 0
        self.test_start_time = 0
        self.weights = []
        self.ff_active_bucket = 0
        self.ff_port_status = {}
        self.test_records = []
        self.current_test_record = None
    
    def create_group_table(self, group_id, group_type, ports, weights=None):
        if weights is None:
            weights = [100] * len(ports)
        
        buckets = []
        for port, weight in zip(ports, weights):
            buckets.append({
                'port': port,
                'weight': weight,
                'watch_port': port
            })
            self.ff_port_status[port] = True
        
        self.group_tables[group_id] = {
            'type': group_type,
            'buckets': buckets
        }
        self.weights = weights
        self.ff_active_bucket = 0
        print(f"Group table {group_id} created with type {group_type}, ports: {ports}, weights: {weights}")
    
    def add_flow(self, match, group_id=1):
        self.flow_tables[group_id].append({
            'match': match,
            'group_id': group_id
        })
    
    def _select_bucket_wrr(self, buckets):
        with self.wrr_lock:
            total_weight = sum(b['weight'] for b in buckets)
            if total_weight == 0:
                return buckets[0]
            
            current_weight = 0
            for i in range(len(buckets)):
                idx = (self.wrr_index + i) % len(buckets)
                bucket = buckets[idx]
                current_weight += bucket['weight']
                if self.wrr_current_count < current_weight:
                    self.wrr_current_count += 1
                    if self.wrr_current_count >= total_weight:
                        self.wrr_current_count = 0
                        self.wrr_index = (self.wrr_index + 1) % len(buckets)
                    return bucket
            
            self.wrr_current_count = 0
            self.wrr_index = (self.wrr_index + 1) % len(buckets)
            return buckets[self.wrr_index]
    
    def _select_bucket_ff(self, buckets):
        for i in range(self.ff_active_bucket, len(buckets)):
            bucket = buckets[i]
            if self.ff_port_status.get(bucket['watch_port'], True):
                self.ff_active_bucket = i
                return bucket
        
        for i in range(0, self.ff_active_bucket):
            bucket = buckets[i]
            if self.ff_port_status.get(bucket['watch_port'], True):
                self.ff_active_bucket = i
                return bucket
        
        return buckets[0]
    
    def simulate_port_failure(self, port):
        self.ff_port_status[port] = False
        print(f"Port {port} simulated failure")
    
    def simulate_port_recovery(self, port):
        self.ff_port_status[port] = True
        print(f"Port {port} recovered")
    
    def process_packet(self, packet_size=64):
        if not self.test_running:
            return
        
        group = self.group_tables.get(1)
        if not group:
            return
        
        group_type = group['type']
        buckets = group['buckets']
        
        if group_type == 'ALL':
            for bucket in buckets:
                port = bucket['port']
                self._update_stats(1, port, packet_size)
        elif group_type == 'INDIRECT':
            bucket = random.choice(buckets)
            port = bucket['port']
            self._update_stats(1, port, packet_size)
        elif group_type == 'WEIGHTED_ROUND_ROBIN':
            bucket = self._select_bucket_wrr(buckets)
            port = bucket['port']
            self._update_stats(1, port, packet_size)
        elif group_type == 'FAST_FAILOVER':
            bucket = self._select_bucket_ff(buckets)
            port = bucket['port']
            self._update_stats(1, port, packet_size)
    
    def _update_stats(self, group_id, port, packet_size):
        if self.warmup_running:
            return
        
        g_stats = self.stats['group_stats'][f'1_{group_id}']
        g_stats['packet_count'] += 1
        g_stats['byte_count'] += packet_size
        
        p_stats = self.stats['port_stats'][f'1_{port}']
        p_stats['rx_packets'] += 1
        p_stats['tx_packets'] += 1
    
    def calculate_pps(self):
        for key, stats in self.stats['group_stats'].items():
            delta_p = stats['packet_count'] - stats['last_packet_count']
            delta_b = stats['byte_count'] - stats['last_byte_count']
            stats['pps'] = delta_p
            stats['bps'] = delta_b * 8
            stats['last_packet_count'] = stats['packet_count']
            stats['last_byte_count'] = stats['byte_count']
        
        for key, stats in self.stats['port_stats'].items():
            delta_rx = stats['rx_packets'] - stats['last_rx']
            delta_tx = stats['tx_packets'] - stats['last_tx']
            stats['rx_pps'] = delta_rx
            stats['tx_pps'] = delta_tx
            stats['last_rx'] = stats['rx_packets']
            stats['last_tx'] = stats['tx_packets']
    
    def generate_traffic(self, flow_id, pps=1000):
        interval = 1.0 / pps
        while self.test_running or self.warmup_running:
            self.process_packet(packet_size=random.randint(64, 1500))
            time.sleep(interval + random.uniform(-interval*0.1, interval*0.1))
    
    def _reset_stats(self):
        for key in self.stats['group_stats']:
            self.stats['group_stats'][key] = {
                'packet_count': 0,
                'byte_count': 0,
                'last_packet_count': 0,
                'last_byte_count': 0,
                'pps': 0,
                'bps': 0
            }
        
        for key in self.stats['port_stats']:
            self.stats['port_stats'][key] = {
                'rx_packets': 0,
                'tx_packets': 0,
                'last_rx': 0,
                'last_tx': 0,
                'rx_pps': 0,
                'tx_pps': 0
            }
    
    def start_test(self, group_type='ALL', num_flows=5, pps_per_flow=2000, weights=None, warmup_seconds=10):
        self.warmup_seconds = warmup_seconds
        self.group_type = group_type
        self.warmup_running = True
        self.test_running = False
        self.warmup_start_time = time.time()
        
        ports = [2, 3, 4]
        if weights is None:
            weights = [50, 30, 20]
        
        self._reset_stats()
        self.wrr_index = 0
        self.wrr_current_count = 0
        
        self.current_test_record = {
            'group_type': group_type,
            'num_flows': num_flows,
            'pps_per_flow': pps_per_flow,
            'weights': weights,
            'warmup_seconds': warmup_seconds,
            'start_time': None,
            'end_time': None,
            'duration': 0,
            'total_packets': 0,
            'total_bytes': 0,
            'avg_pps': 0,
            'avg_bps': 0,
            'peak_pps': 0,
            'port_stats': {}
        }
        
        self.create_group_table(1, group_type, ports, weights)
        
        for i in range(num_flows):
            self.add_flow({'flow_id': i})
        
        self.traffic_threads = []
        for i in range(num_flows):
            t = Thread(target=self.generate_traffic, args=(i, pps_per_flow))
            t.daemon = True
            t.start()
            self.traffic_threads.append(t)
        
        print(f"Warmup started for {warmup_seconds} seconds, type: {group_type}, flows: {num_flows}")
        
        def warmup_timer():
            time.sleep(warmup_seconds)
            if self.warmup_running:
                self.warmup_running = False
                self.test_running = True
                self.test_start_time = time.time()
                self.current_test_record['start_time'] = self.test_start_time
                self._reset_stats()
                print(f"Warmup complete. Test started!")
        
        warmup_thread = Thread(target=warmup_timer)
        warmup_thread.daemon = True
        warmup_thread.start()
    
    def stop_test(self):
        if self.current_test_record and self.test_running:
            end_time = time.time()
            duration = end_time - (self.current_test_record['start_time'] or end_time)
            
            total_packets = 0
            total_bytes = 0
            peak_pps = 0
            port_stats_summary = {}
            
            for key, stat in self.stats['group_stats'].items():
                total_packets += stat['packet_count']
                total_bytes += stat['byte_count']
            
            for key, stat in self.stats['port_stats'].items():
                port_no = key.split('_')[-1]
                port_stats_summary[port_no] = {
                    'rx_packets': stat['rx_packets'],
                    'tx_packets': stat['tx_packets'],
                    'avg_pps': (stat['rx_packets'] + stat['tx_packets']) / max(duration, 1)
                }
            
            self.current_test_record.update({
                'end_time': end_time,
                'duration': duration,
                'total_packets': total_packets,
                'total_bytes': total_bytes,
                'avg_pps': total_packets / max(duration, 1),
                'avg_bps': total_bytes * 8 / max(duration, 1),
                'peak_pps': peak_pps,
                'port_stats': port_stats_summary
            })
            
            self.test_records.append(self.current_test_record)
        
        self.test_running = False
        self.warmup_running = False
        for t in self.traffic_threads:
            t.join(timeout=1)
        self.traffic_threads = []
        print("Test stopped")
    
    def generate_p4_report(self):
        report = []
        report.append('/*')
        report.append(' * OpenFlow Group Table Performance Test Report')
        report.append(' * Generated by P4 Performance Analyzer')
        report.append(f' * Date: {time.strftime("%Y-%m-%d %H:%M:%S")}')
        report.append(' */')
        report.append('')
        report.append('#ifndef GROUP_TABLE_TEST_REPORT_P4')
        report.append('#define GROUP_TABLE_TEST_REPORT_P4')
        report.append('')
        report.append('/* ========================================')
        report.append('   TEST CONFIGURATION')
        report.append('   ======================================== */')
        report.append('')
        
        for i, record in enumerate(self.test_records):
            report.append(f'/* Test #{i + 1} */')
            report.append(f'const group_type_t test_{i+1}_type = {record["group_type"]};')
            report.append(f'const bit<32> test_{i+1}_num_flows = {record["num_flows"]};')
            report.append(f'const bit<32> test_{i+1}_pps_per_flow = {record["pps_per_flow"]};')
            report.append(f'const bit<32> test_{i+1}_warmup_seconds = {record["warmup_seconds"]};')
            report.append('')
        
        report.append('/* ========================================')
        report.append('   PERFORMANCE RESULTS')
        report.append('   ======================================== */')
        report.append('')
        
        for i, record in enumerate(self.test_records):
            report.append(f'/* Test #{i + 1} Results - {record["group_type"]} */')
            report.append(f'struct test_{i+1}_results {{')
            report.append(f'    bit<64> total_packets;    // {record["total_packets"]:,}')
            report.append(f'    bit<64> total_bytes;      // {record["total_bytes"]:,}')
            report.append(f'    bit<32> duration_sec;     // {record["duration"]:.2f}s')
            report.append(f'    bit<32> avg_pps;          // {record["avg_pps"]:.2f}')
            report.append(f'    bit<32> avg_bps;          // {record["avg_bps"]:.2f}')
            report.append(f'}} test_{i+1}_results = {{')
            report.append(f'    {record["total_packets"]},')
            report.append(f'    {record["total_bytes"]},')
            report.append(f'    {int(record["duration"])},')
            report.append(f'    {int(record["avg_pps"])},')
            report.append(f'    {int(record["avg_bps"])}')
            report.append(f'}};')
            report.append('')
        
        report.append('/* ========================================')
        report.append('   GROUP TABLE DEFINITIONS')
        report.append('   ======================================== */')
        report.append('')
        report.append('enum group_type_t {')
        report.append('    ALL,               // Multicast to all ports')
        report.append('    INDIRECT,          // Single port selection')
        report.append('    WEIGHTED_ROUND_ROBIN,  // Weighted distribution')
        report.append('    FAST_FAILOVER      // Port redundancy')
        report.append('}')
        report.append('')
        report.append('/* ========================================')
        report.append('   COMPARATIVE ANALYSIS')
        report.append('   ======================================== */')
        report.append('')
        
        if len(self.test_records) > 1:
            report.append('/* Performance Comparison Table:')
            report.append('')
            report.append(f'{"Test":<6} {"Type":<25} {"Flows":<8} {"PPS/Flow":<10} {"Duration":<10} {"Total Pkts":<15} {"Avg PPS":<12}')
            report.append('-' * 90)
            for i, record in enumerate(self.test_records):
                report.append(f'{i+1:<6} {record["group_type"]:<25} {record["num_flows"]:<8} {record["pps_per_flow"]:<10} {record["duration"]:>7.2f}s  {record["total_packets"]:>13,} {record["avg_pps"]:>10,.2f}')
            report.append('*/')
            report.append('')
        
        report.append('#endif')
        
        return '\n'.join(report)
    
    def generate_csv_report(self):
        import csv
        import io
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(['Test #', 'Group Type', 'Num Flows', 'PPS/Flow', 
                        'Warmup (s)', 'Duration (s)', 'Total Packets', 
                        'Total Bytes', 'Avg PPS', 'Avg BPS'])
        
        for i, record in enumerate(self.test_records):
            writer.writerow([
                i + 1,
                record['group_type'],
                record['num_flows'],
                record['pps_per_flow'],
                record['warmup_seconds'],
                f"{record['duration']:.2f}",
                record['total_packets'],
                record['total_bytes'],
                f"{record['avg_pps']:.2f}",
                f"{record['avg_bps']:.2f}"
            ])
        
        return output.getvalue()
    
    def get_test_records(self):
        return self.test_records
    
    def get_warmup_progress(self):
        if not self.warmup_running:
            return 100
        elapsed = time.time() - self.warmup_start_time
        progress = (elapsed / self.warmup_seconds) * 100
        return min(progress, 100)
    
    def get_elapsed_time(self):
        if self.test_running:
            return time.time() - self.test_start_time
        return 0
    
    def get_stats(self):
        self.calculate_pps()
        return {
            'group_stats': {k: dict(v) for k, v in self.stats['group_stats'].items()},
            'port_stats': {k: dict(v) for k, v in self.stats['port_stats'].items()},
            'group_type': self.group_type,
            'test_running': self.test_running,
            'warmup_running': self.warmup_running,
            'warmup_progress': self.get_warmup_progress(),
            'warmup_seconds': self.warmup_seconds,
            'elapsed_time': self.get_elapsed_time(),
            'weights': self.weights,
            'ff_port_status': self.ff_port_status,
            'ff_active_bucket': self.ff_active_bucket,
            'test_records_count': len(self.test_records),
            'timestamp': time.time()
        }


async def handle_client(websocket, simulator):
    simulator.ws_clients.add(websocket)
    try:
        async for message in websocket:
            data = json.loads(message)
            cmd = data.get('command')
            
            if cmd == 'start_test':
                group_type = data.get('group_type', 'ALL')
                num_flows = data.get('num_flows', 5)
                pps_per_flow = data.get('pps_per_flow', 2000)
                weights = data.get('weights', [50, 30, 20])
                warmup_seconds = data.get('warmup_seconds', 10)
                simulator.start_test(group_type, num_flows, pps_per_flow, weights, warmup_seconds)
                await websocket.send(json.dumps({
                    'status': 'warmup_started',
                    'group_type': group_type,
                    'warmup_seconds': warmup_seconds
                }))
            
            elif cmd == 'stop_test':
                simulator.stop_test()
                await websocket.send(json.dumps({'status': 'test_stopped'}))
            
            elif cmd == 'get_stats':
                await websocket.send(json.dumps(simulator.get_stats()))
            
            elif cmd == 'export_p4_report':
                report = simulator.generate_p4_report()
                await websocket.send(json.dumps({
                    'status': 'p4_report',
                    'report': report
                }))
            
            elif cmd == 'export_csv_report':
                report = simulator.generate_csv_report()
                await websocket.send(json.dumps({
                    'status': 'csv_report',
                    'report': report
                }))
            
            elif cmd == 'get_test_records':
                await websocket.send(json.dumps({
                    'status': 'test_records',
                    'records': simulator.get_test_records()
                }))
            
            elif cmd == 'simulate_port_failure':
                port = data.get('port', 2)
                simulator.simulate_port_failure(port)
                await websocket.send(json.dumps({
                    'status': 'port_failure_simulated',
                    'port': port
                }))
            
            elif cmd == 'simulate_port_recovery':
                port = data.get('port', 2)
                simulator.simulate_port_recovery(port)
                await websocket.send(json.dumps({
                    'status': 'port_recovery_simulated',
                    'port': port
                }))
    
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        simulator.ws_clients.remove(websocket)


async def broadcast_stats(simulator):
    while True:
        if simulator.ws_clients:
            data = json.dumps(simulator.get_stats())
            for ws in list(simulator.ws_clients):
                try:
                    await ws.send(data)
                except:
                    pass
        await asyncio.sleep(0.5)


async def main():
    simulator = OpenFlowSimulator()
    simulator.create_group_table(1, 'ALL', [2, 3, 4], [50, 30, 20])
    
    async def handler(ws):
        await handle_client(ws, simulator)
    
    async with websockets.serve(handler, "0.0.0.0", 6789):
        await broadcast_stats(simulator)


if __name__ == '__main__':
    asyncio.run(main())
