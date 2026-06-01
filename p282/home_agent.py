import threading
import time
import hmac
import hashlib
import json
import csv
import io
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, make_response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

BFA_CODES = {
    0: 'Binding Update Accepted',
    67: 'MN-HA Authentication Failed - Invalid credentials',
    69: 'Requested Lifetime Too Long',
    70: 'Malformed BU Request',
    130: 'Binding Expired - Lifetime exhausted',
    131: 'Binding Revoked by HA',
    132: 'Invalid HoA - Not authorized for this HA'
}


def compute_mn_ha_auth(spi, hoa, coa, lifetime, shared_key):
    data = f"{spi}|{hoa}|{coa}|{lifetime}"
    return hmac.new(shared_key.encode(), data.encode(), hashlib.md5).hexdigest()


class HomeAgent:
    def __init__(self):
        self.binding_cache = {}
        self.tunnel_stats = {}
        self.reverse_tunnel_stats = {}
        self.bfa_history = []
        self.binding_update_history = []
        self.total_encapsulated = 0
        self.total_reverse_encapsulated = 0
        self._lock = threading.Lock()
        self._reaper_running = False
        self._reaper_thread = None
        self._security_associations = {
            'SPI-0x00001000': 'secret_key_mobileip_2024',
            'SPI-0x00001001': 'another_secret_key_for_mn2',
            'SPI-0x00001002': 'default_shared_key_ha'
        }
        self.max_lifetime = 7200
        self._history_seq = 0
        self._start_reaper()

    def _start_reaper(self):
        self._reaper_running = True
        self._reaper_thread = threading.Thread(target=self._reap_expired_bindings, daemon=True)
        self._reaper_thread.start()
        print('[HA] 绑定过期清理线程已启动')

    def _reap_expired_bindings(self):
        while self._reaper_running:
            time.sleep(1)
            with self._lock:
                now = datetime.now()
                expired_hoas = []
                for hoa, binding in self.binding_cache.items():
                    expires_at = datetime.fromisoformat(binding['expires_at'])
                    if now >= expires_at:
                        expired_hoas.append(hoa)

                for hoa in expired_hoas:
                    binding = self.binding_cache[hoa]
                    bfa = self._create_bfa(hoa, 130, binding.get('coa'))
                    self.bfa_history.append(bfa)

                    self._record_binding_update_history(
                        hoa=hoa,
                        old_coa=binding['coa'],
                        new_coa=None,
                        spi=binding.get('spi'),
                        lifetime=0,
                        success=False,
                        status_code=130,
                        status_message='Binding Expired - Auto Removed'
                    )

                    print(f'[HA] 绑定过期: {hoa} (CoA: {binding["coa"]}) 已删除，发送BFA')
                    del self.binding_cache[hoa]
                    if hoa in self.tunnel_stats:
                        del self.tunnel_stats[hoa]
                    if hoa in self.reverse_tunnel_stats:
                        del self.reverse_tunnel_stats[hoa]

    def _stop_reaper(self):
        self._reaper_running = False
        if self._reaper_thread:
            self._reaper_thread.join(timeout=2)

    def _create_bfa(self, hoa, status_code, coa=None):
        return {
            'type': 'BFA',
            'hoa': hoa,
            'coa': coa,
            'status': status_code,
            'status_message': BFA_CODES.get(status_code, 'Unknown error'),
            'timestamp': datetime.now().isoformat(),
            'sequence': len(self.bfa_history) + 1
        }

    def _record_binding_update_history(self, hoa, old_coa, new_coa, spi, lifetime, success, status_code, status_message):
        self._history_seq += 1
        record = {
            'sequence': self._history_seq,
            'timestamp': datetime.now().isoformat(),
            'hoa': hoa,
            'old_coa': old_coa,
            'new_coa': new_coa,
            'spi': spi,
            'lifetime': lifetime,
            'success': success,
            'status_code': status_code,
            'status_message': status_message,
            'is_mobile': old_coa is not None and new_coa is not None and old_coa != new_coa
        }
        self.binding_update_history.append(record)
        return record

    def verify_binding_update(self, hoa, coa, lifetime, spi, auth_data):
        if spi not in self._security_associations:
            return False, 67

        shared_key = self._security_associations[spi]
        expected_auth = compute_mn_ha_auth(spi, hoa, coa, lifetime, shared_key)

        if not hmac.compare_digest(expected_auth, auth_data):
            return False, 67

        if lifetime > self.max_lifetime:
            return False, 69

        return True, 0

    def update_binding(self, hoa, coa, lifetime=3600, spi=None, authenticated=False):
        with self._lock:
            old_coa = self.binding_cache.get(hoa, {}).get('coa')
            expires_at = (datetime.now() + timedelta(seconds=lifetime)).isoformat()
            self.binding_cache[hoa] = {
                'coa': coa,
                'lifetime': lifetime,
                'spi': spi,
                'authenticated': authenticated,
                'created_at': self.binding_cache.get(hoa, {}).get('created_at', datetime.now().isoformat()),
                'updated_at': datetime.now().isoformat(),
                'expires_at': expires_at
            }
            if hoa not in self.tunnel_stats:
                self.tunnel_stats[hoa] = {
                    'encapsulated_packets': 0,
                    'last_encapsulated_at': None
                }
            if hoa not in self.reverse_tunnel_stats:
                self.reverse_tunnel_stats[hoa] = {
                    'encapsulated_packets': 0,
                    'last_encapsulated_at': None
                }

            if old_coa != coa:
                status_msg = 'Binding Updated - Roamed to new CoA' if old_coa else 'Binding Created'
            else:
                status_msg = 'Binding Refreshed - Lifetime Extended'

            self._record_binding_update_history(
                hoa=hoa,
                old_coa=old_coa,
                new_coa=coa,
                spi=spi,
                lifetime=lifetime,
                success=True,
                status_code=0,
                status_message=status_msg
            )

            return True

    def get_binding(self, hoa):
        with self._lock:
            binding = self.binding_cache.get(hoa)
            if binding:
                now = datetime.now()
                expires_at = datetime.fromisoformat(binding['expires_at'])
                remaining = max(0, int((expires_at - now).total_seconds()))
                return dict(binding, remaining_seconds=remaining)
            return None

    def get_all_bindings(self):
        with self._lock:
            now = datetime.now()
            result = {}
            for hoa, binding in self.binding_cache.items():
                expires_at = datetime.fromisoformat(binding['expires_at'])
                remaining = max(0, int((expires_at - now).total_seconds()))
                result[hoa] = dict(binding, remaining_seconds=remaining)
            return result

    def remove_binding(self, hoa, status_code=131):
        with self._lock:
            if hoa in self.binding_cache:
                binding = self.binding_cache[hoa]
                bfa = self._create_bfa(hoa, status_code, binding.get('coa'))
                self.bfa_history.append(bfa)

                self._record_binding_update_history(
                    hoa=hoa,
                    old_coa=binding['coa'],
                    new_coa=None,
                    spi=binding.get('spi'),
                    lifetime=0,
                    success=False,
                    status_code=status_code,
                    status_message='Binding Revoked by HA'
                )

                del self.binding_cache[hoa]
                if hoa in self.tunnel_stats:
                    del self.tunnel_stats[hoa]
                if hoa in self.reverse_tunnel_stats:
                    del self.reverse_tunnel_stats[hoa]
                return bfa
            return None

    def encapsulate_packet(self, dest_hoa, payload_size=100):
        with self._lock:
            if dest_hoa not in self.binding_cache:
                return None

            coa = self.binding_cache[dest_hoa]['coa']
            self.tunnel_stats[dest_hoa]['encapsulated_packets'] += 1
            self.tunnel_stats[dest_hoa]['last_encapsulated_at'] = datetime.now().isoformat()
            self.total_encapsulated += 1

            packet = {
                'tunnel_type': 'forward',
                'outer_header': {
                    'src': 'HA',
                    'dst': coa,
                    'protocol': 'IP-in-IP'
                },
                'inner_header': {
                    'src': 'CN',
                    'dst': dest_hoa,
                    'protocol': 'TCP'
                },
                'payload_size': payload_size,
                'timestamp': datetime.now().isoformat()
            }
            return packet

    def encapsulate_reverse_packet(self, src_hoa, dest_cn='10.0.1.50', payload_size=100):
        with self._lock:
            if src_hoa not in self.binding_cache:
                return None

            coa = self.binding_cache[src_hoa]['coa']
            self.reverse_tunnel_stats[src_hoa]['encapsulated_packets'] += 1
            self.reverse_tunnel_stats[src_hoa]['last_encapsulated_at'] = datetime.now().isoformat()
            self.total_reverse_encapsulated += 1

            packet = {
                'tunnel_type': 'reverse',
                'outer_header': {
                    'src': coa,
                    'dst': 'HA',
                    'protocol': 'IP-in-IP'
                },
                'inner_header': {
                    'src': src_hoa,
                    'dst': dest_cn,
                    'protocol': 'TCP'
                },
                'payload_size': payload_size,
                'timestamp': datetime.now().isoformat()
            }
            return packet

    def get_tunnel_stats(self, hoa=None):
        with self._lock:
            if hoa:
                return self.tunnel_stats.get(hoa)
            return {
                'per_hoa': dict(self.tunnel_stats),
                'total_encapsulated': self.total_encapsulated
            }

    def get_reverse_tunnel_stats(self, hoa=None):
        with self._lock:
            if hoa:
                return self.reverse_tunnel_stats.get(hoa)
            return {
                'per_hoa': dict(self.reverse_tunnel_stats),
                'total_reverse_encapsulated': self.total_reverse_encapsulated
            }

    def get_all_tunnel_stats(self):
        with self._lock:
            combined = {}
            all_hoas = set(list(self.tunnel_stats.keys()) + list(self.reverse_tunnel_stats.keys()))
            for hoa in all_hoas:
                forward = self.tunnel_stats.get(hoa, {'encapsulated_packets': 0, 'last_encapsulated_at': None})
                reverse = self.reverse_tunnel_stats.get(hoa, {'encapsulated_packets': 0, 'last_encapsulated_at': None})
                combined[hoa] = {
                    'forward_packets': forward['encapsulated_packets'],
                    'reverse_packets': reverse['encapsulated_packets'],
                    'total_packets': forward['encapsulated_packets'] + reverse['encapsulated_packets'],
                    'last_forward_at': forward['last_encapsulated_at'],
                    'last_reverse_at': reverse['last_encapsulated_at']
                }
            return {
                'per_hoa': combined,
                'total_forward': self.total_encapsulated,
                'total_reverse': self.total_reverse_encapsulated,
                'grand_total': self.total_encapsulated + self.total_reverse_encapsulated
            }

    def get_bfa_history(self, hoa=None):
        with self._lock:
            if hoa:
                return [bfa for bfa in self.bfa_history if bfa['hoa'] == hoa]
            return list(self.bfa_history)

    def get_binding_update_history(self, hoa=None, limit=None):
        with self._lock:
            history = list(self.binding_update_history)
            if hoa:
                history = [h for h in history if h['hoa'] == hoa]
            if limit:
                history = history[-limit:]
            return history

    def export_binding_history_json(self, hoa=None):
        history = self.get_binding_update_history(hoa)
        export_data = {
            'export_timestamp': datetime.now().isoformat(),
            'total_records': len(history),
            'hoa_filter': hoa,
            'records': history
        }
        return json.dumps(export_data, indent=2, ensure_ascii=False)

    def export_binding_history_csv(self, hoa=None):
        history = self.get_binding_update_history(hoa)
        output = io.StringIO()
        fieldnames = ['sequence', 'timestamp', 'hoa', 'old_coa', 'new_coa', 'spi',
                      'lifetime', 'success', 'status_code', 'status_message', 'is_mobile']
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        for record in history:
            writer.writerow(record)
        return output.getvalue()

    def get_security_associations(self):
        with self._lock:
            return {k: '***' for k in self._security_associations.keys()}

    def add_security_association(self, spi, shared_key):
        with self._lock:
            self._security_associations[spi] = shared_key
            return True

    def get_expiring_bindings_countdown(self):
        with self._lock:
            now = datetime.now()
            countdowns = {}
            for hoa, binding in self.binding_cache.items():
                expires_at = datetime.fromisoformat(binding['expires_at'])
                remaining = max(0, int((expires_at - now).total_seconds()))
                countdowns[hoa] = remaining
            return countdowns


ha = HomeAgent()


@app.route('/binding-update', methods=['POST'])
def binding_update():
    data = request.get_json()
    if not data:
        bfa = ha._create_bfa('unknown', 70)
        return jsonify({
            'status': 'error',
            'bfa': bfa,
            'error': 'Invalid request'
        }), 400

    hoa = data.get('hoa')
    coa = data.get('coa')
    lifetime = data.get('lifetime', 3600)
    spi = data.get('spi')
    auth_data = data.get('auth_data')

    if not hoa or not coa:
        bfa = ha._create_bfa(hoa or 'unknown', 70, coa)
        return jsonify({
            'status': 'error',
            'bfa': bfa,
            'error': 'Missing hoa or coa'
        }), 400

    if not spi or not auth_data:
        bfa = ha._create_bfa(hoa, 67, coa)
        with ha._lock:
            ha.bfa_history.append(bfa)
            ha._record_binding_update_history(
                hoa=hoa,
                old_coa=None,
                new_coa=coa,
                spi=spi,
                lifetime=lifetime,
                success=False,
                status_code=67,
                status_message='Missing Authentication Extension'
            )
        return jsonify({
            'status': 'error',
            'bfa': bfa,
            'error': 'MN-HA authentication extension required (spi and auth_data)'
        }), 401

    auth_ok, status_code = ha.verify_binding_update(hoa, coa, lifetime, spi, auth_data)

    if not auth_ok:
        bfa = ha._create_bfa(hoa, status_code, coa)
        with ha._lock:
            ha.bfa_history.append(bfa)
            ha._record_binding_update_history(
                hoa=hoa,
                old_coa=None,
                new_coa=coa,
                spi=spi,
                lifetime=lifetime,
                success=False,
                status_code=status_code,
                status_message=BFA_CODES.get(status_code, 'Authentication failed')
            )
        return jsonify({
            'status': 'error',
            'bfa': bfa,
            'error': BFA_CODES.get(status_code, 'Authentication failed')
        }), 401

    ha.update_binding(hoa, coa, lifetime, spi, authenticated=True)
    binding = ha.get_binding(hoa)

    return jsonify({
        'status': 'success',
        'message': 'Binding update accepted',
        'hoa': hoa,
        'coa': coa,
        'lifetime': lifetime,
        'spi': spi,
        'authenticated': True,
        'remaining_seconds': binding['remaining_seconds'],
        'expires_at': binding['expires_at']
    }), 200


@app.route('/bindings', methods=['GET'])
def get_bindings():
    bindings = ha.get_all_bindings()
    countdowns = ha.get_expiring_bindings_countdown()
    return jsonify({
        'bindings': bindings,
        'countdowns': countdowns,
        'count': len(bindings)
    }), 200


@app.route('/bindings/<hoa>', methods=['GET'])
def get_binding(hoa):
    binding = ha.get_binding(hoa)
    if binding:
        return jsonify(binding), 200
    return jsonify({'error': 'Binding not found'}), 404


@app.route('/bindings/<hoa>', methods=['DELETE'])
def delete_binding(hoa):
    bfa = ha.remove_binding(hoa, 131)
    if bfa:
        return jsonify({
            'status': 'success',
            'message': 'Binding revoked',
            'bfa': bfa
        }), 200
    return jsonify({'error': 'Binding not found'}), 404


@app.route('/simulate-packet', methods=['POST'])
def simulate_packet():
    data = request.get_json() or {}
    dest_hoa = data.get('dest_hoa')
    payload_size = data.get('payload_size', 100)

    if not dest_hoa:
        return jsonify({'error': 'Missing dest_hoa'}), 400

    binding = ha.get_binding(dest_hoa)
    if not binding:
        return jsonify({'error': 'No binding found for this HoA (may have expired)'}), 404

    if binding.get('remaining_seconds', 0) <= 0:
        return jsonify({'error': 'Binding has expired'}), 410

    packet = ha.encapsulate_packet(dest_hoa, payload_size)
    if packet:
        return jsonify({
            'status': 'success',
            'message': 'Packet encapsulated via forward tunnel (CN→MN)',
            'packet': packet,
            'remaining_seconds': binding['remaining_seconds']
        }), 200
    return jsonify({'error': 'No binding found for this HoA'}), 404


@app.route('/simulate-reverse-packet', methods=['POST'])
def simulate_reverse_packet():
    data = request.get_json() or {}
    src_hoa = data.get('src_hoa')
    dest_cn = data.get('dest_cn', '10.0.1.50')
    payload_size = data.get('payload_size', 100)

    if not src_hoa:
        return jsonify({'error': 'Missing src_hoa'}), 400

    binding = ha.get_binding(src_hoa)
    if not binding:
        return jsonify({'error': 'No binding found for this HoA (may have expired)'}), 404

    if binding.get('remaining_seconds', 0) <= 0:
        return jsonify({'error': 'Binding has expired'}), 410

    packet = ha.encapsulate_reverse_packet(src_hoa, dest_cn, payload_size)
    if packet:
        return jsonify({
            'status': 'success',
            'message': 'Packet encapsulated via reverse tunnel (MN→CN)',
            'packet': packet,
            'remaining_seconds': binding['remaining_seconds']
        }), 200
    return jsonify({'error': 'No binding found for this HoA'}), 404


@app.route('/tunnel-stats', methods=['GET'])
def tunnel_stats():
    hoa = request.args.get('hoa')
    stats = ha.get_tunnel_stats(hoa)
    if hoa and stats is None:
        return jsonify({'error': 'No stats found for this HoA'}), 404
    return jsonify(stats), 200


@app.route('/reverse-tunnel-stats', methods=['GET'])
def reverse_tunnel_stats():
    hoa = request.args.get('hoa')
    stats = ha.get_reverse_tunnel_stats(hoa)
    if hoa and stats is None:
        return jsonify({'error': 'No reverse stats found for this HoA'}), 404
    return jsonify(stats), 200


@app.route('/all-tunnel-stats', methods=['GET'])
def all_tunnel_stats():
    return jsonify(ha.get_all_tunnel_stats()), 200


@app.route('/bfa-history', methods=['GET'])
def bfa_history():
    hoa = request.args.get('hoa')
    history = ha.get_bfa_history(hoa)
    return jsonify({
        'bfa_messages': history,
        'count': len(history)
    }), 200


@app.route('/binding-history', methods=['GET'])
def binding_history():
    hoa = request.args.get('hoa')
    limit = request.args.get('limit', type=int)
    history = ha.get_binding_update_history(hoa, limit)
    return jsonify({
        'records': history,
        'count': len(history),
        'hoa_filter': hoa
    }), 200


@app.route('/export-binding-history', methods=['GET'])
def export_binding_history():
    hoa = request.args.get('hoa')
    format_type = request.args.get('format', 'json')

    if format_type == 'csv':
        csv_data = ha.export_binding_history_csv(hoa)
        response = make_response(csv_data)
        response.headers['Content-Type'] = 'text/csv'
        filename = f"binding_history_{hoa or 'all'}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
    else:
        json_data = ha.export_binding_history_json(hoa)
        response = make_response(json_data)
        response.headers['Content-Type'] = 'application/json'
        filename = f"binding_history_{hoa or 'all'}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


@app.route('/security-associations', methods=['GET'])
def security_associations():
    return jsonify({
        'spis': ha.get_security_associations(),
        'max_lifetime': ha.max_lifetime
    }), 200


@app.route('/auth-test', methods=['POST'])
def auth_test():
    data = request.get_json() or {}
    spi = data.get('spi', 'SPI-0x00001000')
    hoa = data.get('hoa', '10.0.0.1')
    coa = data.get('coa', '192.168.1.100')
    lifetime = data.get('lifetime', 3600)

    spis = ha.get_security_associations()
    if spi not in spis:
        return jsonify({'error': f'SPI {spi} not found'}), 404

    shared_key = ha._security_associations.get(spi, '')
    auth_data = compute_mn_ha_auth(spi, hoa, coa, lifetime, shared_key)

    return jsonify({
        'spi': spi,
        'hoa': hoa,
        'coa': coa,
        'lifetime': lifetime,
        'auth_data': auth_data,
        'note': 'Use this auth_data in binding-update requests'
    }), 200


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy',
        'service': 'Home Agent',
        'features': [
            'MN-HA Authentication (SPI + HMAC-MD5)',
            'Binding Expiry Auto-Reaper',
            'Binding Failure Acknowledgment (BFA)',
            'IP-in-IP Forward Tunnel (CN→MN)',
            'IP-in-IP Reverse Tunnel (MN→CN)',
            'Binding Update History Tracking',
            'History Export (JSON/CSV)'
        ]
    }), 200


@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')


if __name__ == '__main__':
    print('=' * 70)
    print('Home Agent Server - Starting on port 5001')
    print('=' * 70)
    print()
    print('预配置的安全关联 (SPI):')
    for spi in ha.get_security_associations().keys():
        key = ha._security_associations[spi]
        print(f'  {spi} → {key}')
    print()
    print('可用API:')
    print('  POST /binding-update           - 发送绑定更新 (需要认证)')
    print('  POST /auth-test                - 生成测试用认证数据')
    print('  POST /simulate-packet          - 模拟正向隧道包 (CN→MN)')
    print('  POST /simulate-reverse-packet  - 模拟反向隧道包 (MN→CN)')
    print('  GET  /bindings                 - 获取绑定表')
    print('  GET  /all-tunnel-stats         - 获取双向隧道统计')
    print('  GET  /binding-history          - 获取绑定更新历史')
    print('  GET  /export-binding-history   - 导出历史 (JSON/CSV)')
    print('  GET  /bfa-history              - 获取BFA历史')
    print()
    print('后端已启动，访问 http://localhost:5001/ 查看前端')
    print('=' * 70)
    app.run(host='0.0.0.0', port=5001, debug=False, use_reloader=False)
