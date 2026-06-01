import json
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
import statistics
from datetime import datetime
import io


class ProtocolAnalyzer:
    def __init__(self):
        self.requests = {}
        self.responses = {}
        self.latencies = []
        self.errors = []
        self.alerts = []
        self.packet_count = 0
        self.modbus_count = 0

    def analyze_packets(self, packets: List[Dict[str, Any]]) -> Dict[str, Any]:
        self._reset()
        self.packet_count = len(packets)

        raw_modbus_packets = []
        for pkt in packets:
            layers = pkt.get('layers', [])
            for layer in layers:
                if layer.get('name') == 'modbus_ext':
                    self.modbus_count += 1
                    fields = {f['name']: f['value'] for f in layer.get('fields', [])}
                    trans_id = self._extract_transaction_id(fields)
                    func_code = self._extract_function_code(fields)
                    is_exception = self._is_exception_response(fields)

                    if trans_id is not None and func_code is not None:
                        raw_modbus_packets.append({
                            'packet': pkt,
                            'trans_id': trans_id,
                            'func_code': func_code,
                            'is_exception': is_exception,
                            'fields': fields
                        })
                    break

        self._pair_transactions(raw_modbus_packets)
        self._calculate_latencies()
        self._generate_statistics()
        self._check_alerts()

        return {
            'summary': self._generate_summary(),
            'latency': self.latency_stats,
            'errors': self.errors,
            'alerts': self.alerts,
            'transactions': self._get_transactions()
        }

    def _reset(self):
        self.requests = defaultdict(list)
        self.responses = defaultdict(list)
        self.latencies = []
        self.errors = []
        self.alerts = []
        self.packet_count = 0
        self.modbus_count = 0
        self.latency_stats = {}

    def _pair_transactions(self, raw_packets: List[Dict[str, Any]]):
        trans_groups = defaultdict(list)
        for rp in raw_packets:
            trans_groups[rp['trans_id']].append(rp)

        for trans_id, packets in trans_groups.items():
            if len(packets) <= 1:
                pkt = packets[0]
                pkt_data = {
                    'packet_number': pkt['packet']['packet_number'],
                    'timestamp': self._parse_timestamp(pkt['packet'].get('timestamp', '')),
                    'function_code': pkt['func_code'],
                    'src_ip': pkt['packet'].get('src_ip', ''),
                    'dst_ip': pkt['packet'].get('dst_ip', ''),
                    'raw_timestamp': pkt['packet'].get('timestamp')
                }
                if pkt['is_exception']:
                    self.errors.append({
                        'packet_number': pkt['packet']['packet_number'],
                        'transaction_id': trans_id,
                        'function_code': pkt['func_code'],
                        'exception_code': self._extract_exception_code(pkt['fields']),
                        'src_ip': pkt['packet'].get('src_ip', ''),
                        'dst_ip': pkt['packet'].get('dst_ip', ''),
                        'timestamp': pkt['packet'].get('timestamp')
                    })
                    pkt_data['is_exception'] = True
                    self.responses[trans_id].append(pkt_data)
                else:
                    self.requests[trans_id].append(pkt_data)
                continue

            packets_sorted = sorted(packets, key=lambda x: self._parse_timestamp(x['packet'].get('timestamp', '')))

            request = packets_sorted[0]
            self.requests[trans_id].append({
                'packet_number': request['packet']['packet_number'],
                'timestamp': self._parse_timestamp(request['packet'].get('timestamp', '')),
                'function_code': request['func_code'],
                'src_ip': request['packet'].get('src_ip', ''),
                'dst_ip': request['packet'].get('dst_ip', ''),
                'raw_timestamp': request['packet'].get('timestamp')
            })

            for response in packets_sorted[1:]:
                resp_data = {
                    'packet_number': response['packet']['packet_number'],
                    'timestamp': self._parse_timestamp(response['packet'].get('timestamp', '')),
                    'function_code': response['func_code'],
                    'is_exception': response['is_exception'],
                    'src_ip': response['packet'].get('src_ip', ''),
                    'dst_ip': response['packet'].get('dst_ip', ''),
                    'raw_timestamp': response['packet'].get('timestamp')
                }
                if response['is_exception']:
                    self.errors.append({
                        'packet_number': response['packet']['packet_number'],
                        'transaction_id': trans_id,
                        'function_code': response['func_code'],
                        'exception_code': self._extract_exception_code(response['fields']),
                        'src_ip': response['packet'].get('src_ip', ''),
                        'dst_ip': response['packet'].get('dst_ip', ''),
                        'timestamp': response['packet'].get('timestamp')
                    })
                self.responses[trans_id].append(resp_data)

    def _extract_transaction_id(self, fields: Dict[str, str]) -> Optional[int]:
        trans_id_str = fields.get('trans_id', '')
        try:
            if '(' in trans_id_str:
                hex_part = trans_id_str.split('(')[0].strip()
                return int(hex_part, 16)
            elif trans_id_str.startswith('0x'):
                return int(trans_id_str, 16)
            else:
                return int(trans_id_str)
        except:
            return None

    def _extract_function_code(self, fields: Dict[str, str]) -> Optional[int]:
        fc_str = fields.get('func_code', '')
        try:
            if 'x' in fc_str:
                if '-' in fc_str:
                    hex_part = fc_str.split('-')[0].strip()
                elif '(' in fc_str:
                    hex_part = fc_str.split('(')[0].strip()
                else:
                    hex_part = fc_str.strip()
                return int(hex_part, 16)
            else:
                return int(fc_str)
        except:
            return None

    def _is_exception_response(self, fields: Dict[str, str]) -> bool:
        fc_str = fields.get('func_code', '')
        return 'Exception' in fc_str

    def _extract_exception_code(self, fields: Dict[str, str]) -> int:
        exc_str = fields.get('exception_code', '0')
        try:
            return int(exc_str.split('(')[0].strip())
        except:
            return 0

    def _is_request(self, func_code: int, src_ip: str, dst_ip: str) -> bool:
        if func_code is None:
            return False
        if func_code >= 0x80:
            return False
        if not hasattr(self, '_src_ips'):
            self._src_ips = set()
            self._dst_ips = set()
        self._src_ips.add(src_ip)
        self._dst_ips.add(dst_ip)
        return True

    def _parse_timestamp(self, ts_str: str) -> float:
        try:
            if '.' in ts_str:
                return float(ts_str)
        except:
            pass
        return 0.0

    def _calculate_latencies(self):
        for trans_id, req_list in self.requests.items():
            if trans_id in self.responses:
                for req in req_list:
                    matching_resp = None
                    for resp in self.responses[trans_id]:
                        if resp['timestamp'] > req['timestamp']:
                            matching_resp = resp
                            break

                    if matching_resp:
                        latency_ms = (matching_resp['timestamp'] - req['timestamp']) * 1000
                        self.latencies.append({
                            'transaction_id': trans_id,
                            'function_code': req['function_code'],
                            'request_packet': req['packet_number'],
                            'response_packet': matching_resp['packet_number'],
                            'latency_ms': round(latency_ms, 3),
                            'src_ip': req['src_ip'],
                            'dst_ip': req['dst_ip']
                        })

    def _generate_statistics(self):
        latency_values = [l['latency_ms'] for l in self.latencies]

        if latency_values:
            self.latency_stats = {
                'count': len(latency_values),
                'min': round(min(latency_values), 3),
                'max': round(max(latency_values), 3),
                'avg': round(statistics.mean(latency_values), 3),
                'median': round(statistics.median(latency_values), 3),
                'p95': round(self._percentile(latency_values, 95), 3),
                'p99': round(self._percentile(latency_values, 99), 3)
            }
        else:
            self.latency_stats = {
                'count': 0,
                'min': 0,
                'max': 0,
                'avg': 0,
                'median': 0,
                'p95': 0,
                'p99': 0
            }

    def _percentile(self, data: List[float], percentile: int) -> float:
        sorted_data = sorted(data)
        k = (len(sorted_data) - 1) * (percentile / 100)
        f = int(k)
        c = f + 1 if f + 1 < len(sorted_data) else f
        if f == c:
            return sorted_data[f]
        return sorted_data[f] + (sorted_data[c] - sorted_data[f]) * (k - f)

    def _check_alerts(self):
        alert_rules = [
            self._alert_high_latency,
            self._alert_exceptions,
            self._alert_unmatched_requests,
            self._alert_unmatched_responses
        ]

        for rule in alert_rules:
            alerts = rule()
            if alerts:
                self.alerts.extend(alerts)

    def _alert_high_latency(self) -> List[Dict[str, Any]]:
        alerts = []
        threshold = 100

        for latency in self.latencies:
            if latency['latency_ms'] > threshold:
                alerts.append({
                    'level': 'warning',
                    'type': 'high_latency',
                    'message': f"事务 {latency['transaction_id']} 响应延迟过高: {latency['latency_ms']}ms",
                    'details': latency
                })

        if self.latency_stats.get('avg', 0) > 50:
            alerts.append({
                'level': 'warning',
                'type': 'high_avg_latency',
                'message': f"平均响应延迟过高: {self.latency_stats['avg']}ms",
                'details': self.latency_stats
            })

        return alerts

    def _alert_exceptions(self) -> List[Dict[str, Any]]:
        alerts = []
        if self.errors:
            alerts.append({
                'level': 'error',
                'type': 'protocol_exceptions',
                'message': f"检测到 {len(self.errors)} 个协议异常响应",
                'details': self.errors
            })
        return alerts

    def _alert_unmatched_requests(self) -> List[Dict[str, Any]]:
        alerts = []
        unmatched = 0

        for trans_id, req_list in self.requests.items():
            if trans_id not in self.responses or len(req_list) > len(self.responses[trans_id]):
                unmatched += len(req_list) - len(self.responses.get(trans_id, []))

        if unmatched > 0:
            alerts.append({
                'level': 'warning',
                'type': 'unmatched_requests',
                'message': f"存在 {unmatched} 个未匹配的请求",
                'details': {'unmatched_count': unmatched}
            })

        return alerts

    def _alert_unmatched_responses(self) -> List[Dict[str, Any]]:
        alerts = []
        unmatched = 0

        for trans_id, resp_list in self.responses.items():
            if trans_id not in self.requests or len(resp_list) > len(self.requests.get(trans_id, [])):
                unmatched += len(resp_list) - len(self.requests.get(trans_id, []))

        if unmatched > 0:
            alerts.append({
                'level': 'warning',
                'type': 'unmatched_responses',
                'message': f"存在 {unmatched} 个未匹配的响应",
                'details': {'unmatched_count': unmatched}
            })

        return alerts

    def _generate_summary(self) -> Dict[str, Any]:
        func_distribution = defaultdict(int)
        for trans_id, req_list in self.requests.items():
            for req in req_list:
                func_distribution[req['function_code']] += 1

        fc_names = {
            0x01: 'Read Coils',
            0x02: 'Read Discrete Inputs',
            0x03: 'Read Holding Registers',
            0x04: 'Read Input Registers',
            0x05: 'Write Single Coil',
            0x06: 'Write Single Register',
            0x0F: 'Write Multiple Coils',
            0x10: 'Write Multiple Registers',
            0x41: 'Custom Read Sensor Data',
            0x42: 'Custom Write Configuration',
            0x43: 'Custom Firmware Update',
            0x44: 'Custom Device Status Query',
            0x45: 'Custom Alarm Acknowledge'
        }

        return {
            'total_packets': self.packet_count,
            'modbus_packets': self.modbus_count,
            'total_transactions': len(self.requests),
            'completed_transactions': len(self.latencies),
            'error_count': len(self.errors),
            'alert_count': len(self.alerts),
            'function_distribution': {
                fc_names.get(fc, f'0x{fc:02x}'): count
                for fc, count in func_distribution.items()
            }
        }

    def _get_transactions(self) -> List[Dict[str, Any]]:
        transactions = []

        for trans_id in set(list(self.requests.keys()) + list(self.responses.keys())):
            reqs = self.requests.get(trans_id, [])
            resps = self.responses.get(trans_id, [])

            for i, req in enumerate(reqs):
                resp = resps[i] if i < len(resps) else None
                latency = None

                if resp and req['timestamp'] > 0 and resp['timestamp'] > req['timestamp']:
                    latency = round((resp['timestamp'] - req['timestamp']) * 1000, 3)

                transactions.append({
                    'transaction_id': trans_id,
                    'function_code': req.get('function_code'),
                    'request_packet': req.get('packet_number'),
                    'response_packet': resp.get('packet_number') if resp else None,
                    'latency_ms': latency,
                    'status': 'completed' if resp else 'pending',
                    'has_error': resp.get('is_exception', False) if resp else False
                })

        return sorted(transactions, key=lambda x: x['request_packet'] or 0)

    def export_report(self, analysis: Dict[str, Any], format: str = 'json') -> Tuple[str, str, bytes]:
        if format == 'json':
            return self._export_json(analysis)
        elif format == 'html':
            return self._export_html(analysis)
        else:
            raise ValueError(f"Unsupported format: {format}")

    def _export_json(self, analysis: Dict[str, Any]) -> Tuple[str, str, bytes]:
        content = json.dumps(analysis, indent=2, ensure_ascii=False)
        return 'protocol_analysis_report.json', 'application/json', content.encode('utf-8')

    def _export_html(self, analysis: Dict[str, Any]) -> Tuple[str, str, bytes]:
        summary = analysis.get('summary', {})
        latency = analysis.get('latency', {})
        alerts = analysis.get('alerts', [])
        errors = analysis.get('errors', [])
        transactions = analysis.get('transactions', [])

        html = f"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Modbus 协议分析报告</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }}
        .container {{ max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        h1 {{ color: #333; border-bottom: 3px solid #667eea; padding-bottom: 10px; }}
        h2 {{ color: #444; margin-top: 30px; border-left: 4px solid #667eea; padding-left: 10px; }}
        .summary-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }}
        .summary-card {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }}
        .summary-card .value {{ font-size: 32px; font-weight: bold; }}
        .summary-card .label {{ font-size: 14px; opacity: 0.9; }}
        .alert-error {{ background: #fee; color: #c33; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #f44; }}
        .alert-warning {{ background: #fff3cd; color: #856404; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #ffc107; }}
        table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
        th {{ background: #f8f9fa; font-weight: bold; }}
        tr:hover {{ background: #f5f5f5; }}
        .latency-bars {{ display: flex; gap: 5px; align-items: flex-end; height: 100px; padding: 10px; background: #f8f9fa; border-radius: 6px; }}
        .latency-bar {{ flex: 1; background: linear-gradient(to top, #667eea, #764ba2); min-width: 20px; }}
        .timestamp {{ color: #666; font-size: 0.9em; margin-top: 20px; text-align: right; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🔌 Modbus 协议分析报告</h1>
        <p class="timestamp">生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>

        <h2>📊 总览</h2>
        <div class="summary-grid">
            <div class="summary-card">
                <div class="value">{summary.get('total_packets', 0)}</div>
                <div class="label">总数据包</div>
            </div>
            <div class="summary-card">
                <div class="value">{summary.get('modbus_packets', 0)}</div>
                <div class="label">Modbus 包</div>
            </div>
            <div class="summary-card">
                <div class="value">{summary.get('completed_transactions', 0)}</div>
                <div class="label">完成事务</div>
            </div>
            <div class="summary-card">
                <div class="value">{summary.get('alert_count', 0)}</div>
                <div class="label">告警数量</div>
            </div>
        </div>

        <h2>⏱️ 响应延迟统计</h2>
        <table>
            <tr><th>指标</th><th>值 (ms)</th></tr>
            <tr><td>样本数</td><td>{latency.get('count', 0)}</td></tr>
            <tr><td>最小值</td><td>{latency.get('min', 0)}</td></tr>
            <tr><td>最大值</td><td>{latency.get('max', 0)}</td></tr>
            <tr><td>平均值</td><td>{latency.get('avg', 0)}</td></tr>
            <tr><td>中位数</td><td>{latency.get('median', 0)}</td></tr>
            <tr><td>P95</td><td>{latency.get('p95', 0)}</td></tr>
            <tr><td>P99</td><td>{latency.get('p99', 0)}</td></tr>
        </table>

        <h2>⚠️ 告警信息</h2>
"""

        if alerts:
            for alert in alerts:
                alert_class = 'alert-error' if alert['level'] == 'error' else 'alert-warning'
                html += f'<div class="{alert_class}"><strong>{alert["type"]}:</strong> {alert["message"]}</div>'
        else:
            html += '<p style="color: #28a745;">✅ 无告警信息</p>'

        html += f"""
        <h2>❌ 协议异常</h2>
"""

        if errors:
            html += '<table><tr><th>包序号</th><th>事务ID</th><th>功能码</th><th>异常码</th><th>源IP</th><th>目的IP</th></tr>'
            for err in errors:
                html += f'<tr><td>{err["packet_number"]}</td><td>{err["transaction_id"]}</td><td>0x{err["function_code"]:02x}</td><td>{err.get("exception_code", 0)}</td><td>{err["src_ip"]}</td><td>{err["dst_ip"]}</td></tr>'
            html += '</table>'
        else:
            html += '<p style="color: #28a745;">✅ 无协议异常</p>'

        html += f"""
        <h2>📋 功能码分布</h2>
        <table>
            <tr><th>功能码</th><th>数量</th></tr>
"""
        for fc_name, count in summary.get('function_distribution', {}).items():
            html += f'<tr><td>{fc_name}</td><td>{count}</td></tr>'

        html += f"""
        </table>

        <h2>🔄 事务列表</h2>
        <table>
            <tr><th>事务ID</th><th>功能码</th><th>请求包</th><th>响应包</th><th>延迟(ms)</th><th>状态</th></tr>
"""
        for trans in transactions[:50]:
            status_class = 'color: #28a745;' if trans['status'] == 'completed' else 'color: #ffc107;'
            if trans.get('has_error'):
                status_class = 'color: #dc3545;'
            html += f'<tr><td>{trans["transaction_id"]}</td><td>0x{trans.get("function_code", 0):02x}</td><td>{trans.get("request_packet", "-")}</td><td>{trans.get("response_packet", "-")}</td><td>{trans.get("latency_ms", "-")}</td><td style="{status_class}">{trans["status"]}</td></tr>'

        if len(transactions) > 50:
            html += f'<tr><td colspan="6" style="text-align: center;">... 还有 {len(transactions) - 50} 个事务</td></tr>'

        html += """
        </table>
    </div>
</body>
</html>
"""
        return 'protocol_analysis_report.html', 'text/html', html.encode('utf-8')
