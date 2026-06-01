import json
import uuid
import time
import threading
from collections import defaultdict, deque
from models import db, FlowRule

class MininetSimulator:
    _instance = None
    _is_running = False
    _topology = None
    _flow_rules = defaultdict(list)
    _pending_flow_rules = defaultdict(list)
    _packet_traces = {}
    
    _packet_in_queue = deque()
    _packet_in_lock = threading.Lock()
    _packet_in_worker = None
    _is_worker_running = False
    
    _stats = {
        'packet_in_count': 0,
        'packet_in_processed': 0,
        'packet_in_dropped': 0,
        'avg_processing_time': 0,
        'flow_rule_install_time': [],
        'loop_detected': 0,
    }
    
    _ttl_threshold = 10
    _max_queue_size = 1000
    _flow_install_batch = []
    _batch_timer = None
    _batch_timeout = 0.1

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def start_simulation(self, topology_data):
        self._topology = topology_data
        self._is_running = True
        self._build_network()
        self._start_packet_in_worker()
        return {'status': 'running', 'message': 'Simulation started successfully'}

    def stop_simulation(self):
        self._is_running = False
        self._is_worker_running = False
        self._packet_traces.clear()
        self._pending_flow_rules.clear()
        self._flow_install_batch.clear()
        with self._packet_in_lock:
            self._packet_in_queue.clear()
        return {'status': 'stopped', 'message': 'Simulation stopped'}

    def get_status(self):
        return {
            'running': self._is_running,
            'stats': {
                'nodes': len(self._topology.get('nodes', [])) if self._topology else 0,
                'links': len(self._topology.get('links', [])) if self._topology else 0,
                'flow_rules': sum(len(rules) for rules in self._flow_rules.values()),
                'pending_rules': sum(len(rules) for rules in self._pending_flow_rules.values()),
                'queue_size': len(self._packet_in_queue),
                'packet_in': self._stats['packet_in_count'],
                'packet_processed': self._stats['packet_in_processed'],
                'packet_dropped': self._stats['packet_in_dropped'],
                'avg_processing_ms': self._stats['avg_processing_time'],
                'loops_detected': self._stats['loop_detected'],
            }
        }
    
    def get_detailed_stats(self):
        return {
            'packet_in_queue': {
                'current_size': len(self._packet_in_queue),
                'max_size': self._max_queue_size,
                'utilization': f"{(len(self._packet_in_queue) / self._max_queue_size * 100):.1f}%"
            },
            'flow_installation': {
                'pending_batches': len(self._flow_install_batch),
                'avg_install_time_ms': sum(self._stats['flow_rule_install_time'][-50:]) / max(1, len(self._stats['flow_rule_install_time'][-50:]))
            },
            'performance': self._stats
        }

    def _build_network(self):
        if not self._topology:
            return
        
        nodes = self._topology.get('nodes', [])
        for node in nodes:
            if node['type'] == 'switch':
                self._flow_rules[node['id']] = []
                self._pending_flow_rules[node['id']] = []
        
        self._load_flow_rules_from_db()

    def _load_flow_rules_from_db(self):
        rules = FlowRule.query.all()
        for rule in rules:
            self._flow_rules[rule.switch_id].append({
                'id': rule.rule_id,
                'priority': rule.priority,
                'match': json.loads(rule.match_fields),
                'actions': json.loads(rule.actions),
                'active': True
            })

    def _start_packet_in_worker(self):
        self._is_worker_running = True
        self._packet_in_worker = threading.Thread(target=self._process_packet_in_queue, daemon=True)
        self._packet_in_worker.start()

    def _process_packet_in_queue(self):
        while self._is_worker_running:
            try:
                with self._packet_in_lock:
                    if self._packet_in_queue:
                        packet_in = self._packet_in_queue.popleft()
                    else:
                        time.sleep(0.001)
                        continue
                
                start_time = time.time()
                self._handle_packet_in(packet_in)
                process_time = (time.time() - start_time) * 1000
                
                self._stats['packet_in_processed'] += 1
                total_processed = self._stats['packet_in_processed']
                self._stats['avg_processing_time'] = (
                    (self._stats['avg_processing_time'] * (total_processed - 1) + process_time) / total_processed
                )
                
            except Exception as e:
                print(f"Error processing packet-in: {e}")
    
    def _handle_packet_in(self, packet_in):
        switch_id = packet_in['switch_id']
        packet = packet_in['packet']
        in_port = packet_in['in_port']
        
        if self._detect_loop(packet, switch_id):
            self._stats['loop_detected'] += 1
            self._add_trace_event(packet['packet_id'], {
                'type': 'loop_detected',
                'switch': switch_id,
                'action': 'dropped'
            })
            return
        
        path = packet.get('path_so_far', [])
        if len(path) > self._ttl_threshold:
            self._add_trace_event(packet['packet_id'], {
                'type': 'ttl_expired',
                'switch': switch_id,
                'hops': len(path)
            })
            return
        
        dst_id = packet.get('dst')
        if dst_id:
            new_path = self._calculate_path(switch_id, dst_id)
            if new_path and len(new_path) > 1:
                self._install_path_rules(new_path, packet)
                self._add_trace_event(packet['packet_id'], {
                    'type': 'flow_installed',
                    'path': new_path,
                    'switch': switch_id
                })
    
    def _detect_loop(self, packet, current_switch):
        path_so_far = packet.get('path_so_far', [])
        return path_so_far.count(current_switch) >= 2
    
    def _install_path_rules(self, path, packet):
        batch_id = f"batch_{uuid.uuid4().hex[:8]}"
        
        for i, node_id in enumerate(path):
            node = self._get_node_by_id(node_id)
            if not node or node['type'] != 'switch':
                continue
            
            in_port = self._get_port_between(path[i-1], node_id) if i > 0 else None
            out_port = self._get_port_between(node_id, path[i+1]) if i < len(path) - 1 else None
            
            if out_port is None:
                continue
            
            rule = {
                'id': f"auto_{uuid.uuid4().hex[:8]}",
                'switchId': node_id,
                'priority': 100,
                'match': self._extract_match_fields(packet),
                'actions': [{'type': 'OUTPUT', 'port': out_port}],
                'batch_id': batch_id,
                'phase': 'pending'
            }
            
            self._pending_flow_rules[node_id].append(rule)
        
        self._commit_batch(batch_id)
    
    def _commit_batch(self, batch_id):
        start_time = time.time()
        
        pending_commits = []
        for switch_id, rules in self._pending_flow_rules.items():
            for rule in rules:
                if rule.get('batch_id') == batch_id:
                    pending_commits.append((switch_id, rule))
        
        for switch_id, rule in pending_commits:
            rule['phase'] = 'committed'
            rule['active'] = True
            self._flow_rules[switch_id].append(rule)
            self._flow_rules[switch_id].sort(key=lambda x: -x['priority'])
        
        for switch_id, rules in self._pending_flow_rules.items():
            self._pending_flow_rules[switch_id] = [
                r for r in rules if r.get('batch_id') != batch_id
            ]
        
        install_time = (time.time() - start_time) * 1000
        self._stats['flow_rule_install_time'].append(install_time)
        
        return True
    
    def add_flow_rule(self, rule_data):
        switch_id = rule_data['switchId']
        rule = {
            'id': rule_data['id'],
            'switchId': switch_id,
            'priority': rule_data['priority'],
            'match': rule_data['match'],
            'actions': rule_data['actions'],
            'phase': 'pending',
            'depends_on': rule_data.get('depends_on', [])
        }
        
        dependencies_met = self._check_dependencies(rule)
        if not dependencies_met:
            self._pending_flow_rules[switch_id].append(rule)
            return {'status': 'pending', 'rule': rule, 'reason': 'waiting_for_dependencies'}
        
        self._activate_flow_rule(switch_id, rule)
        
        db_rule = FlowRule(
            rule_id=rule['id'],
            switch_id=switch_id,
            priority=rule['priority'],
            match_fields=json.dumps(rule['match']),
            actions=json.dumps(rule['actions'])
        )
        db.session.add(db_rule)
        db.session.commit()
        
        return rule
    
    def _check_dependencies(self, rule):
        if not rule.get('depends_on'):
            return True
        
        topology_switches = [n['id'] for n in self._topology.get('nodes', []) if n['type'] == 'switch']
        for dep in rule['depends_on']:
            if dep not in topology_switches:
                continue
            dep_rules = self._flow_rules.get(dep, [])
            if len(dep_rules) == 0:
                return False
        return True
    
    def _activate_flow_rule(self, switch_id, rule):
        rule['phase'] = 'committed'
        rule['active'] = True
        self._flow_rules[switch_id].append(rule)
        self._flow_rules[switch_id].sort(key=lambda x: -x['priority'])
    
    def commit_pending_rules(self):
        committed = []
        for switch_id in list(self._pending_flow_rules.keys()):
            rules = self._pending_flow_rules[switch_id]
            remaining = []
            for rule in rules:
                if self._check_dependencies(rule):
                    self._activate_flow_rule(switch_id, rule)
                    committed.append(rule)
                else:
                    remaining.append(rule)
            self._pending_flow_rules[switch_id] = remaining
        return committed

    def get_flow_rules(self, switch_id):
        return [r for r in self._flow_rules.get(switch_id, []) if r.get('active', True)]
    
    def get_pending_rules(self, switch_id=None):
        if switch_id:
            return self._pending_flow_rules.get(switch_id, [])
        return {s: rules for s, rules in self._pending_flow_rules.items() if rules}

    def delete_flow_rule(self, rule_id):
        for switch_id in self._flow_rules:
            self._flow_rules[switch_id] = [r for r in self._flow_rules[switch_id] if r['id'] != rule_id]
        
        for switch_id in self._pending_flow_rules:
            self._pending_flow_rules[switch_id] = [r for r in self._pending_flow_rules[switch_id] if r['id'] != rule_id]
        
        rule = FlowRule.query.filter_by(rule_id=rule_id).first()
        if rule:
            db.session.delete(rule)
            db.session.commit()
            return True
        return False
    
    def _enqueue_packet_in(self, switch_id, packet, in_port):
        self._stats['packet_in_count'] += 1
        
        with self._packet_in_lock:
            if len(self._packet_in_queue) >= self._max_queue_size:
                self._stats['packet_in_dropped'] += 1
                return False
            
            self._packet_in_queue.append({
                'switch_id': switch_id,
                'packet': packet,
                'in_port': in_port,
                'timestamp': time.time()
            })
            return True
    
    def _extract_match_fields(self, packet):
        match = {}
        if 'eth_src' in packet:
            match['eth_src'] = packet['eth_src']
        if 'eth_dst' in packet:
            match['eth_dst'] = packet['eth_dst']
        if 'eth_type' in packet:
            match['eth_type'] = packet['eth_type']
        if 'ip_src' in packet:
            match['ip_src'] = packet['ip_src']
        if 'ip_dst' in packet:
            match['ip_dst'] = packet['ip_dst']
        if 'ip_proto' in packet:
            match['ip_proto'] = packet['ip_proto']
        return match
    
    def _get_node_by_id(self, node_id):
        if not self._topology:
            return None
        for node in self._topology['nodes']:
            if node['id'] == node_id:
                return node
        return None
    
    def _get_port_between(self, node_a, node_b):
        if not self._topology:
            return None
        
        links = self._topology['links']
        port_counter = defaultdict(int)
        
        for link in links:
            port_counter[link['source']] += 1
            port_counter[link['target']] += 1
            
            if (link['source'] == node_a and link['target'] == node_b):
                return port_counter[node_a]
            if (link['source'] == node_b and link['target'] == node_a):
                return port_counter[node_b]
        
        return 1
    
    def _add_trace_event(self, packet_id, event):
        if packet_id in self._packet_traces:
            trace = self._packet_traces[packet_id]
            if 'events' not in trace:
                trace['events'] = []
            trace['events'].append(event)
    
    def send_packet(self, src_id, dst_id, packet_type='ICMP'):
        if not self._is_running or not self._topology:
            return None

        packet_id = str(uuid.uuid4())
        path = self._calculate_path(src_id, dst_id)
        
        src_node = self._get_node_by_id(src_id)
        dst_node = self._get_node_by_id(dst_id)
        
        packet = {
            'packet_id': packet_id,
            'src': src_id,
            'dst': dst_id,
            'type': packet_type,
            'eth_src': src_node.get('mac', '00:00:00:00:00:01') if src_node else '00:00:00:00:00:01',
            'eth_dst': dst_node.get('mac', '00:00:00:00:00:02') if dst_node else '00:00:00:00:00:02',
            'eth_type': 0x0800,
            'ip_src': src_node.get('ip', '10.0.0.1') if src_node else '10.0.0.1',
            'ip_dst': dst_node.get('ip', '10.0.0.2') if dst_node else '10.0.0.2',
            'ip_proto': 1 if packet_type == 'ICMP' else 6 if packet_type == 'TCP' else 17,
            'path_so_far': []
        }
        
        trace = {
            'packet_id': packet_id,
            'src': src_id,
            'dst': dst_id,
            'type': packet_type,
            'path': path,
            'hops': [],
            'matched_rules': [],
            'events': []
        }

        nodes = {n['id']: n for n in self._topology['nodes']}
        path_so_far = []
        packet_size = 100
        
        for i, node_id in enumerate(path):
            path_so_far.append(node_id)
            packet['path_so_far'] = path_so_far
            
            node = nodes.get(node_id)
            if node and node['type'] == 'switch':
                if i > 0 and i < len(path) - 1:
                    in_port = self._get_port_between(path[i-1], node_id)
                    out_port = self._get_port_between(node_id, path[i+1])
                    
                    self._record_traffic(node_id, in_port, 'rx', packet_size)
                    if out_port:
                        self._record_traffic(node_id, out_port, 'tx', packet_size)
                    
                    meter_passed, meter_id = self._check_meter(node_id, packet_size)
                    if not meter_passed:
                        trace['events'].append({
                            'type': 'meter_drop',
                            'switch': node_id,
                            'meterId': meter_id,
                            'reason': 'rate_limit_exceeded'
                        })
                        trace['hops'].append({
                            'node': node_id,
                            'type': 'switch',
                            'rule_matched': False,
                            'meter_dropped': True
                        })
                        continue
                    
                    matched_rule = self._match_flow_rule(node_id, packet, i)
                    if matched_rule:
                        trace['matched_rules'].append({
                            'switch': node_id,
                            'rule': matched_rule
                        })
                        trace['hops'].append({
                            'node': node_id,
                            'type': 'switch',
                            'rule_matched': True,
                            'rule_id': matched_rule.get('id'),
                            'meterId': meter_id if meter_id else None
                        })
                    else:
                        self._enqueue_packet_in(node_id, packet, in_port)
                        trace['hops'].append({
                            'node': node_id,
                            'type': 'switch',
                            'rule_matched': False,
                            'packet_in': True,
                            'meterId': meter_id if meter_id else None
                        })
                        trace['events'].append({
                            'type': 'packet_in',
                            'switch': node_id,
                            'queue_position': len(self._packet_in_queue)
                        })
                else:
                    trace['hops'].append({
                        'node': node_id,
                        'type': 'switch',
                        'rule_matched': False
                    })
            else:
                trace['hops'].append({
                    'node': node_id,
                    'type': node['type'] if node else 'unknown'
                })

        self._packet_traces[packet_id] = trace
        return packet_id

    def _calculate_path(self, src_id, dst_id):
        if not self._topology:
            return []

        nodes = self._topology['nodes']
        links = self._topology['links']
        
        adj = defaultdict(list)
        for link in links:
            adj[link['source']].append(link['target'])
            adj[link['target']].append(link['source'])

        from collections import deque
        queue = deque([(src_id, [src_id])])
        visited = {src_id}

        while queue:
            current, path = queue.popleft()
            if current == dst_id:
                return path
            for neighbor in adj[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, path + [neighbor]))
        
        return [src_id]

    def _match_flow_rule(self, switch_id, packet, hop_index):
        rules = self._flow_rules.get(switch_id, [])
        for rule in rules:
            if not rule.get('active', True):
                continue
            if self._check_match(rule['match'], packet, hop_index):
                return rule
        return None

    def _check_match(self, match_fields, packet, hop_index):
        if not match_fields:
            return True
        
        for field, value in match_fields.items():
            if field not in packet:
                return False
            if str(packet[field]).lower() != str(value).lower():
                return False
        
        return True

    def get_packet_path(self, packet_id):
        return self._packet_traces.get(packet_id)

    _meter_tables = defaultdict(list)
    _group_tables = defaultdict(list)
    _traffic_stats = defaultdict(lambda: defaultdict(lambda: {
        'rx_packets': 0,
        'tx_packets': 0,
        'rx_bytes': 0,
        'tx_bytes': 0,
        'rx_errors': 0,
        'tx_errors': 0,
    }))

    def add_meter(self, meter_data):
        from models import MeterTable as MeterModel
        
        switch_id = meter_data['switchId']
        meter = {
            'id': meter_data['id'],
            'switchId': switch_id,
            'rate': meter_data['rate'],
            'burstSize': meter_data.get('burstSize', 100),
            'type': meter_data.get('type', 'kbps'),
            'active': True,
            'current_bucket': meter_data['burstSize'] * 1000,
            'last_update': time.time()
        }
        self._meter_tables[switch_id].append(meter)
        
        db_meter = MeterModel(
            meter_id=meter['id'],
            switch_id=switch_id,
            rate=meter['rate'],
            burst_size=meter['burstSize'],
            meter_type=meter['type']
        )
        db.session.add(db_meter)
        db.session.commit()
        
        return meter

    def get_meters(self, switch_id=None):
        if switch_id:
            return [m for m in self._meter_tables.get(switch_id, []) if m.get('active', True)]
        result = {}
        for sid, meters in self._meter_tables.items():
            active_meters = [m for m in meters if m.get('active', True)]
            if active_meters:
                result[sid] = active_meters
        return result

    def delete_meter(self, meter_id):
        from models import MeterTable as MeterModel
        
        for switch_id in self._meter_tables:
            self._meter_tables[switch_id] = [
                m for m in self._meter_tables[switch_id] if m['id'] != meter_id
            ]
        
        meter = MeterModel.query.filter_by(meter_id=meter_id).first()
        if meter:
            db.session.delete(meter)
            db.session.commit()
            return True
        return False

    def _check_meter(self, switch_id, packet_size):
        meters = self._meter_tables.get(switch_id, [])
        for meter in meters:
            if not meter.get('active', True):
                continue
            
            now = time.time()
            elapsed = now - meter['last_update']
            rate_bytes_per_sec = meter['rate'] * 125
            
            meter['current_bucket'] = min(
                meter['burstSize'] * 1000,
                meter['current_bucket'] + elapsed * rate_bytes_per_sec
            )
            meter['last_update'] = now
            
            if packet_size <= meter['current_bucket']:
                meter['current_bucket'] -= packet_size
            else:
                return False, meter['id']
        
        return True, None

    def add_group(self, group_data):
        from models import GroupTable as GroupModel
        
        switch_id = group_data['switchId']
        group = {
            'id': group_data['id'],
            'switchId': switch_id,
            'type': group_data['type'],
            'buckets': group_data['buckets'],
            'active': True,
            'current_bucket': 0
        }
        self._group_tables[switch_id].append(group)
        
        db_group = GroupModel(
            group_id=group['id'],
            switch_id=switch_id,
            group_type=group['type'],
            buckets=json.dumps(group['buckets'])
        )
        db.session.add(db_group)
        db.session.commit()
        
        return group

    def get_groups(self, switch_id=None):
        if switch_id:
            return [g for g in self._group_tables.get(switch_id, []) if g.get('active', True)]
        result = {}
        for sid, groups in self._group_tables.items():
            active_groups = [g for g in groups if g.get('active', True)]
            if active_groups:
                result[sid] = active_groups
        return result

    def delete_group(self, group_id):
        from models import GroupTable as GroupModel
        
        for switch_id in self._group_tables:
            self._group_tables[switch_id] = [
                g for g in self._group_tables[switch_id] if g['id'] != group_id
            ]
        
        group = GroupModel.query.filter_by(group_id=group_id).first()
        if group:
            db.session.delete(group)
            db.session.commit()
            return True
        return False

    def _apply_group(self, switch_id, group_id, packet):
        groups = self._group_tables.get(switch_id, [])
        for group in groups:
            if group['id'] != group_id or not group.get('active', True):
                continue
            
            if group['type'] == 'ALL':
                return group['buckets']
            
            elif group['type'] == 'SELECT':
                bucket_idx = group['current_bucket'] % len(group['buckets'])
                group['current_bucket'] += 1
                return [group['buckets'][bucket_idx]]
            
            elif group['type'] == 'INDIRECT':
                return group['buckets']
            
            elif group['type'] == 'FF':
                for bucket in group['buckets']:
                    if bucket.get('active', True):
                        return [bucket]
                return []
        
        return []

    def _record_traffic(self, switch_id, port, direction, packet_size, is_error=False):
        stats = self._traffic_stats[switch_id][port]
        
        if direction == 'rx':
            stats['rx_packets'] += 1
            stats['rx_bytes'] += packet_size
            if is_error:
                stats['rx_errors'] += 1
        else:
            stats['tx_packets'] += 1
            stats['tx_bytes'] += packet_size
            if is_error:
                stats['tx_errors'] += 1

    def get_traffic_stats(self, switch_id=None, port=None):
        if switch_id and port is not None:
            return {
                'switchId': switch_id,
                'port': port,
                **self._traffic_stats.get(switch_id, {}).get(port, {
                    'rx_packets': 0, 'tx_packets': 0,
                    'rx_bytes': 0, 'tx_bytes': 0,
                    'rx_errors': 0, 'tx_errors': 0
                })
            }
        elif switch_id:
            result = {'switchId': switch_id, 'ports': {}}
            for port_num, stats in self._traffic_stats.get(switch_id, {}).items():
                result['ports'][str(port_num)] = stats
            return result
        else:
            result = {}
            for sid, ports in self._traffic_stats.items():
                result[sid] = {str(p): s for p, s in ports.items()}
            return result

    def export_traffic_stats(self, format='json'):
        from models import TrafficStats as TrafficStatsModel
        from datetime import datetime
        
        stats_data = []
        for switch_id, ports in self._traffic_stats.items():
            for port, stats in ports.items():
                db_stats = TrafficStatsModel(
                    switch_id=switch_id,
                    port=port,
                    rx_packets=stats['rx_packets'],
                    tx_packets=stats['tx_packets'],
                    rx_bytes=stats['rx_bytes'],
                    tx_bytes=stats['tx_bytes'],
                    rx_errors=stats['rx_errors'],
                    tx_errors=stats['tx_errors']
                )
                db.session.add(db_stats)
                stats_data.append({
                    'timestamp': datetime.utcnow().isoformat(),
                    'switchId': switch_id,
                    'port': port,
                    **stats
                })
        
        db.session.commit()
        
        if format == 'csv':
            csv_lines = ['timestamp,switch_id,port,rx_packets,tx_packets,rx_bytes,tx_bytes,rx_errors,tx_errors']
            for s in stats_data:
                csv_lines.append(
                    f"{s['timestamp']},{s['switchId']},{s['port']},"
                    f"{s['rx_packets']},{s['tx_packets']},"
                    f"{s['rx_bytes']},{s['tx_bytes']},"
                    f"{s['rx_errors']},{s['tx_errors']}"
                )
            return '\n'.join(csv_lines), 'text/csv'
        
        return {'stats': stats_data, 'total_entries': len(stats_data)}, 'application/json'

    def reset_traffic_stats(self):
        self._traffic_stats.clear()
        return True

mininet_service = MininetSimulator()
