import json
import time
import signal
import sys
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS

from simulator.replication_manager import ReplicationManager

app = Flask(__name__)
CORS(app)

manager = ReplicationManager(replica_count=3)


def signal_handler(signum, frame):
    print('\nShutting down gracefully...')
    manager.shutdown()
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/status', methods=['GET'])
def get_status():
    try:
        status = manager.get_all_status()
        return jsonify(status)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/zk/status', methods=['GET'])
def get_zk_status():
    try:
        status = manager.get_zk_status()
        return jsonify(status)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/insert', methods=['POST'])
def insert_data():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'message': 'No data provided'}), 400
        
        replica_id = data.get('replicaId')
        content = data.get('content')
        
        if not replica_id:
            return jsonify({'success': False, 'message': 'replicaId is required'}), 400
        
        if not content:
            return jsonify({'success': False, 'message': 'content is required'}), 400
        
        result = manager.insert_to_replica(replica_id, content)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/control/pause', methods=['POST'])
def pause_replication():
    try:
        result = manager.pause_replication()
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/control/resume', methods=['POST'])
def resume_replication():
    try:
        result = manager.resume_replication()
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/control/reset', methods=['POST'])
def reset_cluster():
    try:
        result = manager.reset()
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@app.route('/api/conflicts', methods=['GET'])
def get_conflicts():
    try:
        result = manager.get_conflicts()
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/part-log', methods=['GET'])
def get_part_log():
    try:
        result = manager.get_part_log()
        return jsonify({'partLog': result, 'count': len(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dedup', methods=['GET'])
def get_dedup_records():
    try:
        result = manager.get_dedup_records()
        return jsonify({'dedupRecords': result, 'count': len(result)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/latency-report', methods=['GET'])
def get_latency_report():
    try:
        result = manager.get_latency_report()
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/latency-report/export', methods=['GET'])
def export_latency_report():
    try:
        fmt = request.args.get('format', 'text')
        report = manager.get_latency_report()
        
        if fmt == 'json':
            return jsonify(report)
        
        overall = report['overall']
        per_replica = report['per_replica']
        generated_at = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(report['generated_at']))
        
        lines = []
        lines.append('=' * 70)
        lines.append('ClickHouse 复制延迟报告')
        lines.append('=' * 70)
        lines.append(f'生成时间: {generated_at}')
        lines.append('')
        
        lines.append('【总体延迟统计】')
        lines.append('-' * 70)
        lines.append(f'  复制次数: {overall["count"]}')
        lines.append(f'  平均延迟: {overall["avg_ms"]} ms')
        lines.append(f'  最小延迟: {overall["min_ms"]} ms')
        lines.append(f'  最大延迟: {overall["max_ms"]} ms')
        lines.append(f'  P50 (中位数): {overall["p50_ms"]} ms')
        lines.append(f'  P95 (95%): {overall["p95_ms"]} ms')
        lines.append(f'  P99 (99%): {overall["p99_ms"]} ms')
        lines.append('')
        
        for replica_id, data in per_replica.items():
            stats = data['stats']
            records = data['records']
            
            lines.append(f'【{data["name"]} ({replica_id})】')
            lines.append('-' * 70)
            lines.append(f'  复制次数: {stats["count"]}')
            lines.append(f'  平均延迟: {stats["avg_ms"]} ms')
            lines.append(f'  P50: {stats["p50_ms"]} ms  |  P95: {stats["p95_ms"]} ms  |  P99: {stats["p99_ms"]} ms')
            lines.append('')
            
            if records:
                lines.append('  最近延迟记录:')
                lines.append(f'  {"块ID":<20} {"来源":<10} {"延迟(ms)":<12} {"分区":<12} 版本')
                lines.append(f'  {"-"*20} {"-"*10} {"-"*12} {"-"*12} {"-"*6}')
                for r in records[:10]:
                    source_name = {
                        'replica-1': '副本1', 'replica-2': '副本2', 'replica-3': '副本3'
                    }.get(r['source_replica'], r['source_replica'])
                    block_id_short = r['block_id'][:18] + '...' if len(r['block_id']) > 18 else r['block_id']
                    lines.append(f'  {block_id_short:<20} {source_name:<10} {r["latency_ms"]:<12} {str(r["partition_key"]):<12} v{r["version"]}')
            lines.append('')
        
        lines.append('=' * 70)
        lines.append('报告结束')
        lines.append('=' * 70)
        
        text_report = '\n'.join(lines)
        
        response = app.response_class(
            response=text_report,
            status=200,
            mimetype='text/plain; charset=utf-8'
        )
        response.headers['Content-Disposition'] = f'attachment; filename=latency_report_{int(time.time())}.txt'
        return response
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print('=' * 60)
    print('ClickHouse 多副本数据复制模拟器')
    print('=' * 60)
    print(f'副本数量: {manager.get_replica_count()}')
    print(f'副本ID: {manager.get_replica_ids()}')
    print(f'Leader: {manager.zk.get_leader()}')
    print('=' * 60)
    print('访问 http://localhost:9090 查看模拟器界面')
    print('按 Ctrl+C 退出')
    print('=' * 60)
    
    app.run(host='0.0.0.0', port=9090, debug=False, threaded=True)
