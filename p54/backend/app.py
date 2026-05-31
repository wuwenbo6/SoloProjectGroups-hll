from flask import Flask, jsonify, request, send_from_directory, make_response
from flask_cors import CORS
import sqlite3
import json
import os
from datetime import datetime
from collections import defaultdict
import math
import csv
import io

app = Flask(__name__, static_folder='../static', template_folder='../')
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), '../database/eye_tracking.db')

AOI_DEFINITIONS = {
    'q1': {'name': '问题1 - 满意度', 'x': 0, 'y': 0, 'width': 100, 'height': 20},
    'q2': {'name': '问题2 - 易用性', 'x': 0, 'y': 20, 'width': 100, 'height': 20},
    'q3': {'name': '问题3 - 推荐意愿', 'x': 0, 'y': 40, 'width': 100, 'height': 20},
    'q4': {'name': '问题4 - 理解程度', 'x': 0, 'y': 60, 'width': 100, 'height': 40}
}

STIMULI_CONFIG = [
    {
        'id': 'stim1',
        'type': 'image',
        'name': '风景图片',
        'url': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600',
        'duration': 5000,
        'description': '自然风景图片 - 基线测量'
    },
    {
        'id': 'stim2',
        'type': 'image',
        'name': '复杂图表',
        'url': 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600',
        'duration': 8000,
        'description': '数据分析图表 - 高认知负荷'
    },
    {
        'id': 'stim3',
        'type': 'image',
        'name': '文字段落',
        'url': 'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?w=800&h=600',
        'duration': 10000,
        'description': '阅读材料 - 中等认知负荷'
    }
]

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS subjects (
            id TEXT PRIMARY KEY,
            age INTEGER,
            gender TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS experiments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id TEXT,
            answers TEXT,
            gaze_data TEXT,
            raw_gaze_data TEXT,
            pupil_data TEXT,
            aoi_analysis TEXT,
            pupil_analysis TEXT,
            stimulus_data TEXT,
            total_time INTEGER,
            calibration_quality REAL,
            is_mobile INTEGER,
            sampling_rate INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subject_id) REFERENCES subjects(id)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS stimuli (
            id TEXT PRIMARY KEY,
            type TEXT,
            name TEXT,
            url TEXT,
            duration INTEGER,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id TEXT,
            report_type TEXT,
            report_data TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subject_id) REFERENCES subjects(id)
        )
    ''')
    
    conn.commit()
    conn.close()

def interpolate_sparse_data(gaze_data, target_interval=16):
    if len(gaze_data) < 2:
        return gaze_data
    
    interpolated = []
    
    for i in range(len(gaze_data) - 1):
        current = gaze_data[i]
        next_point = gaze_data[i + 1]
        
        current_time = current.get('timestamp', i * 50)
        next_time = next_point.get('timestamp', (i + 1) * 50)
        
        time_diff = next_time - current_time
        
        interpolated.append(current)
        
        if time_diff > target_interval * 2:
            steps = int(time_diff / target_interval)
            for j in range(1, steps):
                ratio = j / steps
                interpolated.append({
                    'timestamp': current_time + time_diff * ratio,
                    'x': current['x'] + (next_point['x'] - current['x']) * ratio,
                    'y': current['y'] + (next_point['y'] - current['y']) * ratio,
                    'interpolated': True
                })
    
    interpolated.append(gaze_data[-1])
    return interpolated

def apply_moving_average(gaze_data, window_size=5):
    if len(gaze_data) < window_size:
        return gaze_data
    
    smoothed = []
    for i in range(len(gaze_data)):
        start_idx = max(0, i - window_size // 2)
        end_idx = min(len(gaze_data), i + window_size // 2 + 1)
        
        window = gaze_data[start_idx:end_idx]
        avg_x = sum(p['x'] for p in window) / len(window)
        avg_y = sum(p['y'] for p in window) / len(window)
        
        smoothed_point = gaze_data[i].copy()
        smoothed_point['x'] = avg_x
        smoothed_point['y'] = avg_y
        smoothed.append(smoothed_point)
    
    return smoothed

def detect_fixations(gaze_data, dispersion_threshold=50, duration_threshold=100):
    if len(gaze_data) < 2:
        return []
    
    fixations = []
    current_fixation = [gaze_data[0]]
    
    for i in range(1, len(gaze_data)):
        point = gaze_data[i]
        centroid_x = sum(p['x'] for p in current_fixation) / len(current_fixation)
        centroid_y = sum(p['y'] for p in current_fixation) / len(current_fixation)
        
        distance = math.sqrt((point['x'] - centroid_x) ** 2 + (point['y'] - centroid_y) ** 2)
        
        if distance <= dispersion_threshold:
            current_fixation.append(point)
        else:
            start_time = current_fixation[0].get('timestamp', 0)
            end_time = current_fixation[-1].get('timestamp', len(current_fixation) * 16)
            duration = end_time - start_time
            
            if duration >= duration_threshold and len(current_fixation) >= 3:
                fixations.append({
                    'x': centroid_x,
                    'y': centroid_y,
                    'start_time': start_time,
                    'end_time': end_time,
                    'duration': duration,
                    'point_count': len(current_fixation)
                })
            
            current_fixation = [point]
    
    if len(current_fixation) >= 3:
        start_time = current_fixation[0].get('timestamp', 0)
        end_time = current_fixation[-1].get('timestamp', len(current_fixation) * 16)
        duration = end_time - start_time
        
        if duration >= duration_threshold:
            centroid_x = sum(p['x'] for p in current_fixation) / len(current_fixation)
            centroid_y = sum(p['y'] for p in current_fixation) / len(current_fixation)
            fixations.append({
                'x': centroid_x,
                'y': centroid_y,
                'start_time': start_time,
                'end_time': end_time,
                'duration': duration,
                'point_count': len(current_fixation)
            })
    
    return fixations

def get_point_aoi(x_pct, y_pct):
    for aoi_id, aoi in AOI_DEFINITIONS.items():
        if (aoi['x'] <= x_pct <= aoi['x'] + aoi['width'] and
            aoi['y'] <= y_pct <= aoi['y'] + aoi['height']):
            return aoi_id
    return None

def analyze_aoi(gaze_data, screen_width=1920, screen_height=1080, is_mobile=False):
    if is_mobile or len(gaze_data) < 50:
        gaze_data = interpolate_sparse_data(gaze_data)
    
    gaze_data = apply_moving_average(gaze_data, window_size=3 if is_mobile else 5)
    
    fixations = detect_fixations(gaze_data)
    
    aoi_results = defaultdict(lambda: {
        'total_time': 0,
        'fixation_count': 0,
        'entries': 0,
        'exits': 0,
        'first_entry_time': None,
        'fixations': []
    })
    
    current_aoi = None
    entry_time = 0
    
    for fixation in fixations:
        x_pct = (fixation['x'] / screen_width) * 100
        y_pct = (fixation['y'] / screen_height) * 100
        
        fixation_aoi = get_point_aoi(x_pct, y_pct)
        
        if fixation_aoi != current_aoi:
            if current_aoi is not None:
                aoi_results[current_aoi]['exits'] += 1
            
            if fixation_aoi is not None:
                aoi_results[fixation_aoi]['entries'] += 1
                if aoi_results[fixation_aoi]['first_entry_time'] is None:
                    aoi_results[fixation_aoi]['first_entry_time'] = fixation['start_time']
            
            current_aoi = fixation_aoi
        
        if fixation_aoi is not None:
            aoi_results[fixation_aoi]['total_time'] += fixation['duration']
            aoi_results[fixation_aoi]['fixation_count'] += 1
            aoi_results[fixation_aoi]['fixations'].append({
                'x': fixation['x'],
                'y': fixation['y'],
                'duration': fixation['duration']
            })
    
    if current_aoi is not None:
        aoi_results[current_aoi]['exits'] += 1
    
    for aoi_id in AOI_DEFINITIONS.keys():
        if aoi_id not in aoi_results:
            aoi_results[aoi_id] = {
                'total_time': 0,
                'fixation_count': 0,
                'entries': 0,
                'exits': 0,
                'first_entry_time': None,
                'fixations': []
            }
    
    result = dict(aoi_results)
    for aoi_id in result:
        result[aoi_id].pop('fixations', None)
    
    return result

def analyze_pupil(pupil_data, stimulus_timestamps=None):
    if not pupil_data or len(pupil_data) < 10:
        return {
            'baseline_diameter': 0,
            'mean_diameter': 0,
            'max_diameter': 0,
            'min_diameter': 0,
            'std_diameter': 0,
            'cognitive_load_index': 0,
            'dilation_rate': 0,
            'stimulus_analysis': {}
        }
    
    diameters = [p['diameter'] for p in pupil_data if p.get('diameter', 0) > 0]
    
    if not diameters:
        return {
            'baseline_diameter': 0,
            'mean_diameter': 0,
            'max_diameter': 0,
            'min_diameter': 0,
            'std_diameter': 0,
            'cognitive_load_index': 0,
            'dilation_rate': 0,
            'stimulus_analysis': {}
        }
    
    baseline_count = min(30, len(diameters) // 4)
    baseline_diameter = sum(diameters[:baseline_count]) / baseline_count
    
    mean_diameter = sum(diameters) / len(diameters)
    max_diameter = max(diameters)
    min_diameter = min(diameters)
    
    variance = sum((d - mean_diameter) ** 2 for d in diameters) / len(diameters)
    std_diameter = math.sqrt(variance)
    
    dilation_count = sum(1 for i in range(1, len(diameters)) if diameters[i] > diameters[i-1])
    dilation_rate = dilation_count / (len(diameters) - 1) if len(diameters) > 1 else 0
    
    cognitive_load_index = 0
    if baseline_diameter > 0:
        cognitive_load_index = ((mean_diameter - baseline_diameter) / baseline_diameter) * 100
    
    stimulus_analysis = {}
    if stimulus_timestamps:
        for stim_id, timestamps in stimulus_timestamps.items():
            stim_data = [
                p['diameter'] for p in pupil_data
                if timestamps['start'] <= p['timestamp'] <= timestamps['end']
                and p.get('diameter', 0) > 0
            ]
            
            if stim_data:
                stim_mean = sum(stim_data) / len(stim_data)
                stim_load = ((stim_mean - baseline_diameter) / baseline_diameter * 100) if baseline_diameter > 0 else 0
                
                stimulus_analysis[stim_id] = {
                    'mean_diameter': stim_mean,
                    'sample_count': len(stim_data),
                    'cognitive_load': stim_load,
                    'max_diameter': max(stim_data),
                    'min_diameter': min(stim_data)
                }
    
    return {
        'baseline_diameter': baseline_diameter,
        'mean_diameter': mean_diameter,
        'max_diameter': max_diameter,
        'min_diameter': min_diameter,
        'std_diameter': std_diameter,
        'cognitive_load_index': cognitive_load_index,
        'dilation_rate': dilation_rate,
        'stimulus_analysis': stimulus_analysis,
        'sample_count': len(diameters)
    }

def generate_statistics_report(subject_ids=None):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    if subject_ids:
        placeholders = ','.join('?' * len(subject_ids))
        cursor.execute(f'''
            SELECT e.*, s.age, s.gender
            FROM experiments e
            JOIN subjects s ON e.subject_id = s.id
            WHERE e.subject_id IN ({placeholders})
            ORDER BY e.created_at DESC
        ''', subject_ids)
    else:
        cursor.execute('''
            SELECT e.*, s.age, s.gender
            FROM experiments e
            JOIN subjects s ON e.subject_id = s.id
            ORDER BY e.created_at DESC
        ''')
    
    rows = cursor.fetchall()
    conn.close()
    
    report_data = []
    
    for row in rows:
        result = dict(row)
        
        try:
            answers = json.loads(result.get('answers', '{}'))
        except:
            answers = {}
        
        try:
            aoi_analysis = json.loads(result.get('aoi_analysis', '{}'))
        except:
            aoi_analysis = {}
        
        try:
            pupil_analysis = json.loads(result.get('pupil_analysis', '{}'))
        except:
            pupil_analysis = {}
        
        total_aoi_time = sum(aoi.get('total_time', 0) for aoi in aoi_analysis.values())
        
        report_row = {
            '被试ID': result.get('subject_id', ''),
            '年龄': result.get('age', ''),
            '性别': result.get('gender', ''),
            '实验时长(秒)': round(result.get('total_time', 0) / 1000, 2),
            '校准精度(%)': round(result.get('calibration_quality', 0), 1),
            '设备类型': '移动端' if result.get('is_mobile', 0) else '桌面端',
            '基线瞳孔直径': round(pupil_analysis.get('baseline_diameter', 0), 2),
            '平均瞳孔直径': round(pupil_analysis.get('mean_diameter', 0), 2),
            '认知负荷指数(%)': round(pupil_analysis.get('cognitive_load_index', 0), 2),
            '瞳孔扩张率': round(pupil_analysis.get('dilation_rate', 0), 2),
            '总AOI停留时间(秒)': round(total_aoi_time / 1000, 2),
            '问题1答案': answers.get('q1', ''),
            '问题2答案': answers.get('q2', ''),
            '问题3答案': answers.get('q3', ''),
            '问题4答案': answers.get('q4', ''),
            '实验日期': result.get('created_at', '')
        }
        
        for aoi_id, aoi_data in aoi_analysis.items():
            aoi_name = AOI_DEFINITIONS.get(aoi_id, {}).get('name', aoi_id)
            report_row[f'{aoi_name}_停留时间(秒)'] = round(aoi_data.get('total_time', 0) / 1000, 2)
            report_row[f'{aoi_name}_注视次数'] = aoi_data.get('fixation_count', 0)
        
        report_data.append(report_row)
    
    return report_data

@app.route('/')
def index():
    return send_from_directory('../', 'index.html')

@app.route('/api/stimuli', methods=['GET'])
def get_stimuli():
    return jsonify(STIMULI_CONFIG)

@app.route('/api/subjects', methods=['GET'])
def get_subjects():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM subjects ORDER BY created_at DESC')
    subjects = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    return jsonify(subjects)

@app.route('/api/experiment', methods=['POST'])
def save_experiment():
    data = request.json
    
    subject_id = data.get('subject_id')
    age = data.get('age')
    gender = data.get('gender')
    answers = data.get('answers', {})
    gaze_data = data.get('gaze_data', [])
    raw_gaze_data = data.get('raw_gaze_data', [])
    pupil_data = data.get('pupil_data', [])
    stimulus_data = data.get('stimulus_data', {})
    total_time = data.get('total_time', 0)
    calibration_quality = data.get('calibration_quality', 0)
    is_mobile = data.get('is_mobile', False)
    sampling_rate = data.get('sampling_rate', 16)
    
    aoi_analysis = analyze_aoi(gaze_data, is_mobile=is_mobile)
    
    stimulus_timestamps = {}
    for stim_id, stim_data in stimulus_data.items():
        if 'start_time' in stim_data and 'end_time' in stim_data:
            stimulus_timestamps[stim_id] = {
                'start': stim_data['start_time'],
                'end': stim_data['end_time']
            }
    
    pupil_analysis = analyze_pupil(pupil_data, stimulus_timestamps)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            INSERT OR REPLACE INTO subjects (id, age, gender)
            VALUES (?, ?, ?)
        ''', (subject_id, age, gender))
        
        cursor.execute('''
            INSERT INTO experiments (
                subject_id, answers, gaze_data, raw_gaze_data, pupil_data,
                aoi_analysis, pupil_analysis, stimulus_data, total_time, 
                calibration_quality, is_mobile, sampling_rate
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            subject_id,
            json.dumps(answers),
            json.dumps(gaze_data),
            json.dumps(raw_gaze_data),
            json.dumps(pupil_data),
            json.dumps(aoi_analysis),
            json.dumps(pupil_analysis),
            json.dumps(stimulus_data),
            total_time,
            calibration_quality,
            1 if is_mobile else 0,
            sampling_rate
        ))
        
        conn.commit()
        return jsonify({
            'status': 'success', 
            'message': '实验数据已保存', 
            'calibration_quality': calibration_quality,
            'pupil_analysis': pupil_analysis
        })
    except Exception as e:
        conn.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/experiment/<subject_id>', methods=['GET'])
def get_experiment(subject_id):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT e.*, s.age, s.gender
        FROM experiments e
        JOIN subjects s ON e.subject_id = s.id
        WHERE e.subject_id = ?
        ORDER BY e.created_at DESC
        LIMIT 1
    ''', (subject_id,))
    
    row = cursor.fetchone()
    conn.close()
    
    if row:
        result = dict(row)
        result['answers'] = json.loads(result['answers'])
        result['gaze_data'] = json.loads(result['gaze_data'])
        result['aoi_analysis'] = json.loads(result['aoi_analysis'])
        result['is_mobile'] = bool(result.get('is_mobile', 0))
        
        if result.get('pupil_data'):
            result['pupil_data'] = json.loads(result['pupil_data'])
        if result.get('pupil_analysis'):
            result['pupil_analysis'] = json.loads(result['pupil_analysis'])
        if result.get('stimulus_data'):
            result['stimulus_data'] = json.loads(result['stimulus_data'])
        
        return jsonify(result)
    else:
        return jsonify({'status': 'error', 'message': '未找到实验数据'}), 404

@app.route('/api/comparison', methods=['POST'])
def get_comparison():
    data = request.json
    subject_ids = data.get('subject_ids', [])
    
    results = {}
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    for subject_id in subject_ids:
        cursor.execute('''
            SELECT e.*, s.age, s.gender
            FROM experiments e
            JOIN subjects s ON e.subject_id = s.id
            WHERE e.subject_id = ?
            ORDER BY e.created_at DESC
            LIMIT 1
        ''', (subject_id,))
        
        row = cursor.fetchone()
        if row:
            result = dict(row)
            result['answers'] = json.loads(result['answers'])
            result['gaze_data'] = json.loads(result['gaze_data'])
            result['aoi_analysis'] = json.loads(result['aoi_analysis'])
            result['is_mobile'] = bool(result.get('is_mobile', 0))
            
            if result.get('pupil_analysis'):
                result['pupil_analysis'] = json.loads(result['pupil_analysis'])
            
            results[subject_id] = result
    
    conn.close()
    return jsonify(results)

@app.route('/api/stats', methods=['GET'])
def get_stats():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('SELECT COUNT(*) as count FROM subjects')
    subject_count = cursor.fetchone()['count']
    
    cursor.execute('SELECT COUNT(*) as count FROM experiments')
    experiment_count = cursor.fetchone()['count']
    
    cursor.execute('SELECT AVG(total_time) as avg_time FROM experiments')
    avg_time = cursor.fetchone()['avg_time']
    
    cursor.execute('SELECT AVG(calibration_quality) as avg_quality FROM experiments WHERE calibration_quality > 0')
    avg_quality = cursor.fetchone()['avg_quality']
    
    cursor.execute('SELECT AVG(json_extract(pupil_analysis, "$.cognitive_load_index")) as avg_load FROM experiments WHERE pupil_analysis IS NOT NULL')
    avg_load = cursor.fetchone()['avg_load']
    
    conn.close()
    
    return jsonify({
        'subject_count': subject_count,
        'experiment_count': experiment_count,
        'average_experiment_time': avg_time,
        'average_calibration_quality': avg_quality,
        'average_cognitive_load': avg_load
    })

@app.route('/api/report/csv', methods=['GET'])
def export_csv():
    subject_ids = request.args.getlist('subject_ids')
    
    report_data = generate_statistics_report(subject_ids if subject_ids else None)
    
    output = io.StringIO()
    if report_data:
        writer = csv.DictWriter(output, fieldnames=report_data[0].keys())
        writer.writeheader()
        writer.writerows(report_data)
    
    output.seek(0)
    
    response = make_response(output.getvalue())
    response.headers['Content-Disposition'] = f'attachment; filename="eye_tracking_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv"'
    response.headers['Content-type'] = 'text/csv; charset=utf-8-sig'
    
    return response

@app.route('/api/report/json', methods=['GET'])
def export_json():
    subject_ids = request.args.getlist('subject_ids')
    
    report_data = generate_statistics_report(subject_ids if subject_ids else None)
    
    response = make_response(json.dumps(report_data, ensure_ascii=False, indent=2))
    response.headers['Content-Disposition'] = f'attachment; filename="eye_tracking_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json"'
    response.headers['Content-type'] = 'application/json; charset=utf-8'
    
    return response

@app.route('/api/pupil/chart/<subject_id>', methods=['GET'])
def get_pupil_chart_data(subject_id):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT pupil_data, pupil_analysis, stimulus_data
        FROM experiments
        WHERE subject_id = ?
        ORDER BY created_at DESC
        LIMIT 1
    ''', (subject_id,))
    
    row = cursor.fetchone()
    conn.close()
    
    if row and row['pupil_data']:
        pupil_data = json.loads(row['pupil_data'])
        pupil_analysis = json.loads(row['pupil_analysis']) if row['pupil_analysis'] else {}
        stimulus_data = json.loads(row['stimulus_data']) if row['stimulus_data'] else {}
        
        chart_data = {
            'timestamps': [p['timestamp'] for p in pupil_data],
            'diameters': [p.get('diameter', 0) for p in pupil_data],
            'analysis': pupil_analysis,
            'stimuli': stimulus_data
        }
        return jsonify(chart_data)
    else:
        return jsonify({'status': 'error', 'message': '未找到瞳孔数据'}), 404

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5001)
