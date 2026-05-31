import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, jsonify, request, send_file, render_template
from flask_cors import CORS
import numpy as np
import time
from datetime import datetime
import io
import zipfile

from core import (
    ThreePhaseSignalGenerator, ThreePhasePLL, HarmonicAnalyzer, ComtradeExporter,
    InterharmonicAnalyzer, FlickerMeter, MeasurementReport
)
from database import Database

app = Flask(__name__, template_folder='../templates', static_folder='../static')
CORS(app)

FS = 1000
F0 = 50

signal_generator = ThreePhaseSignalGenerator(fs=FS, f0=F0)
pll = ThreePhasePLL(f0=F0, fs=FS)
analyzer = HarmonicAnalyzer(fs=FS, f0=F0, window_type='blackman')
comtrade_exporter = ComtradeExporter(fs=FS)
interharmonic_analyzer = InterharmonicAnalyzer(fs=FS, f0=F0)
flicker_meter = FlickerMeter(fs=FS, f0=F0)
report_generator = MeasurementReport()
db = Database()

current_time = 0
phase_a_history = []
phase_b_history = []
phase_c_history = []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/realtime')
def get_realtime_data():
    global current_time, phase_a_history, phase_b_history, phase_c_history
    
    dt = 1.0 / FS
    n_points = int(request.args.get('n', FS))
    
    t = []
    phase_a = []
    phase_b = []
    phase_c = []
    pll_phase = []
    pll_freq = []
    
    for i in range(n_points):
        current_time += dt
        va, vb, vc = signal_generator.get_instantaneous_three_phase(current_time)
        theta, freq, d, q = pll.update(va, vb, vc)
        
        t.append(current_time)
        phase_a.append(va)
        phase_b.append(vb)
        phase_c.append(vc)
        pll_phase.append(theta)
        pll_freq.append(freq)
    
    phase_a_history.extend(phase_a)
    phase_b_history.extend(phase_b)
    phase_c_history.extend(phase_c)
    
    max_history = 10 * FS
    if len(phase_a_history) > max_history:
        phase_a_history = phase_a_history[-max_history:]
        phase_b_history = phase_b_history[-max_history:]
        phase_c_history = phase_c_history[-max_history:]
    
    if len(phase_a_history) >= FS:
        recent_a = np.array(phase_a_history[-FS:])
        recent_b = np.array(phase_b_history[-FS:])
        recent_c = np.array(phase_c_history[-FS:])
        
        harmonic_data = analyzer.compute_three_phase_thd(recent_a, recent_b, recent_c)
    else:
        harmonic_data = {
            'thd_a': 0, 'thd_b': 0, 'thd_c': 0, 'avg_thd': 0,
            'contents_a': {}, 'contents_b': {}, 'contents_c': {},
            'frequencies': [], 'amplitude_a': [], 'amplitude_b': [], 'amplitude_c': []
        }
    
    last_pll_phase = pll_phase[-1] if pll_phase else 0
    phase_angle_a = last_pll_phase % (2 * np.pi)
    phase_angle_b = (last_pll_phase - 2 * np.pi / 3) % (2 * np.pi)
    phase_angle_c = (last_pll_phase + 2 * np.pi / 3) % (2 * np.pi)
    
    return jsonify({
        'time': t,
        'phase_a': phase_a,
        'phase_b': phase_b,
        'phase_c': phase_c,
        'pll_phase': pll_phase,
        'pll_freq': pll_freq,
        'estimated_frequency': pll_freq[-1] if pll_freq else F0,
        'phase_angles': {
            'a': phase_angle_a,
            'b': phase_angle_b,
            'c': phase_angle_c
        },
        'harmonic_data': harmonic_data
    })

@app.route('/api/harmonics')
def get_harmonics():
    duration = float(request.args.get('duration', 1.0))
    t, phase_a, phase_b, phase_c = signal_generator.generate_three_phase(duration=duration)
    
    result = analyzer.compute_three_phase_thd(phase_a, phase_b, phase_c)
    
    return jsonify(result)

@app.route('/api/records', methods=['GET'])
def get_records():
    limit = int(request.args.get('limit', 100))
    records = db.get_recent_records(limit)
    return jsonify(records)

@app.route('/api/records', methods=['POST'])
def save_record():
    data = request.json
    record_id = db.insert_monitoring_record(data)
    
    if 'waveform' in data:
        db.insert_waveform_record(record_id, data['waveform'])
    
    db.insert_event_log('RECORD_SAVE', f'Saved monitoring record #{record_id}', 'INFO')
    
    return jsonify({'status': 'success', 'record_id': record_id})

@app.route('/api/waveform/<int:record_id>')
def get_waveform(record_id):
    waveform = db.get_waveform_by_record_id(record_id)
    if waveform:
        return jsonify(waveform)
    return jsonify({'error': 'Waveform not found'}), 404

@app.route('/api/comtrade/export', methods=['POST'])
def export_comtrade():
    data = request.json
    t = np.array(data.get('time', []))
    phase_a = np.array(data.get('phase_a', []))
    phase_b = np.array(data.get('phase_b', []))
    phase_c = np.array(data.get('phase_c', []))
    
    cfg_content, dat_content = comtrade_exporter.export_to_memory(t, phase_a, phase_b, phase_c)
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w') as zf:
        zf.writestr('waveform.cfg', cfg_content)
        zf.writestr('waveform.dat', dat_content)
    
    zip_buffer.seek(0)
    
    db.insert_event_log('COMTRADE_EXPORT', 'Exported waveform to COMTRADE format', 'INFO')
    
    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name='comtrade_export.zip'
    )

@app.route('/api/comtrade/download')
def download_comtrade():
    duration = float(request.args.get('duration', 1.0))
    t, phase_a, phase_b, phase_c = signal_generator.generate_three_phase(duration=duration)
    
    cfg_content, dat_content = comtrade_exporter.export_to_memory(t, phase_a, phase_b, phase_c)
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w') as zf:
        zf.writestr('waveform.cfg', cfg_content)
        zf.writestr('waveform.dat', dat_content)
    
    zip_buffer.seek(0)
    
    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name='comtrade_export.zip'
    )

@app.route('/api/events')
def get_events():
    limit = int(request.args.get('limit', 100))
    events = db.get_event_logs(limit)
    return jsonify(events)

@app.route('/api/reset')
def reset():
    global current_time, phase_a_history, phase_b_history, phase_c_history
    current_time = 0
    phase_a_history = []
    phase_b_history = []
    phase_c_history = []
    pll.reset()
    
    db.insert_event_log('SYSTEM_RESET', 'System reset performed', 'INFO')
    
    return jsonify({'status': 'success'})

@app.route('/api/status')
def get_status():
    return jsonify({
        'status': 'running',
        'frequency': F0,
        'sample_rate': FS,
        'current_time': current_time
    })

@app.route('/api/interharmonics')
def get_interharmonics():
    global phase_a_history, phase_b_history, phase_c_history
    
    if len(phase_a_history) < 2000:
        return jsonify({'error': 'Insufficient data, need at least 2 seconds of data'})
    
    signal_a = np.array(phase_a_history[-2000:])
    
    groups, harmonics, interharmonics, xf, amplitude = interharmonic_analyzer.compute_interharmonic_group(signal_a)
    
    return jsonify({
        'harmonic_groups': {str(k): float(v) for k, v in groups.items()},
        'harmonics': {str(k): float(v) for k, v in harmonics.items()},
        'interharmonics': {str(k): float(v) for k, v in interharmonics.items()},
        'frequencies': xf.tolist(),
        'amplitude': amplitude.tolist()
    })

@app.route('/api/flicker')
def get_flicker():
    global phase_a_history, phase_b_history, phase_c_history
    
    min_samples = 10 * FS
    if len(phase_a_history) < min_samples:
        return jsonify({
            'Pst': 0,
            'Plt': 0,
            'message': f'Collecting data... ({len(phase_a_history)}/{min_samples} samples)'
        })
    
    signal_a = np.array(phase_a_history[-min_samples:])
    flicker_result = flicker_meter.compute_pst(signal_a, duration_seconds=10)
    
    return jsonify(flicker_result)

@app.route('/api/report/generate', methods=['POST'])
def generate_report():
    global phase_a_history, phase_b_history, phase_c_history
    
    data = request.json or {}
    
    harmonic_data = analyzer.compute_three_phase_thd(
        np.array(phase_a_history[-FS:]) if len(phase_a_history) >= FS else np.zeros(FS),
        np.array(phase_b_history[-FS:]) if len(phase_b_history) >= FS else np.zeros(FS),
        np.array(phase_c_history[-FS:]) if len(phase_c_history) >= FS else np.zeros(FS)
    )
    
    flicker_pst = 0
    if len(phase_a_history) >= 10 * FS:
        signal_a = np.array(phase_a_history[-10*FS:])
        flicker_result = flicker_meter.compute_pst(signal_a, duration_seconds=10)
        flicker_pst = flicker_result['Pst']
    
    measurement_data = {
        'start_time': data.get('start_time', datetime.now().isoformat()),
        'end_time': data.get('end_time', datetime.now().isoformat()),
        'rms_a': float(np.sqrt(np.mean(np.array(phase_a_history[-FS:])**2))) if len(phase_a_history) >= FS else 220,
        'rms_b': float(np.sqrt(np.mean(np.array(phase_b_history[-FS:])**2))) if len(phase_b_history) >= FS else 220,
        'rms_c': float(np.sqrt(np.mean(np.array(phase_c_history[-FS:])**2))) if len(phase_c_history) >= FS else 220,
        'frequency': pll.get_frequency(),
        'thd_a': harmonic_data['thd_a'],
        'thd_b': harmonic_data['thd_b'],
        'thd_c': harmonic_data['thd_c'],
        'harmonics': {
            'contents_a': {str(k): v for k, v in harmonic_data['contents_a'].items()},
            'contents_b': {str(k): v for k, v in harmonic_data['contents_b'].items()},
            'contents_c': {str(k): v for k, v in harmonic_data['contents_c'].items()}
        },
        'Pst': flicker_pst,
        'Plt': flicker_pst * 0.8
    }
    
    report = report_generator.generate_report(measurement_data)
    db.insert_event_log('REPORT_GENERATE', 'Generated measurement report', 'INFO')
    
    return jsonify(report)

@app.route('/api/report/download/html')
def download_report_html():
    global phase_a_history, phase_b_history, phase_c_history
    
    harmonic_data = analyzer.compute_three_phase_thd(
        np.array(phase_a_history[-FS:]) if len(phase_a_history) >= FS else np.zeros(FS),
        np.array(phase_b_history[-FS:]) if len(phase_b_history) >= FS else np.zeros(FS),
        np.array(phase_c_history[-FS:]) if len(phase_c_history) >= FS else np.zeros(FS)
    )
    
    flicker_pst = 0
    if len(phase_a_history) >= 10 * FS:
        signal_a = np.array(phase_a_history[-10*FS:])
        flicker_result = flicker_meter.compute_pst(signal_a, duration_seconds=10)
        flicker_pst = flicker_result['Pst']
    
    measurement_data = {
        'start_time': datetime.now().isoformat(),
        'end_time': datetime.now().isoformat(),
        'rms_a': float(np.sqrt(np.mean(np.array(phase_a_history[-FS:])**2))) if len(phase_a_history) >= FS else 220,
        'rms_b': float(np.sqrt(np.mean(np.array(phase_b_history[-FS:])**2))) if len(phase_b_history) >= FS else 220,
        'rms_c': float(np.sqrt(np.mean(np.array(phase_c_history[-FS:])**2))) if len(phase_c_history) >= FS else 220,
        'frequency': pll.get_frequency(),
        'thd_a': harmonic_data['thd_a'],
        'thd_b': harmonic_data['thd_b'],
        'thd_c': harmonic_data['thd_c'],
        'harmonics': {
            'contents_a': {str(k): v for k, v in harmonic_data['contents_a'].items()},
            'contents_b': {str(k): v for k, v in harmonic_data['contents_b'].items()},
            'contents_c': {str(k): v for k, v in harmonic_data['contents_c'].items()}
        },
        'Pst': flicker_pst,
        'Plt': flicker_pst * 0.8
    }
    
    report = report_generator.generate_report(measurement_data)
    html_content = report_generator.export_html(report)
    
    buf = io.BytesIO()
    buf.write(html_content.encode('utf-8'))
    buf.seek(0)
    
    db.insert_event_log('REPORT_DOWNLOAD', 'Downloaded HTML report', 'INFO')
    
    return send_file(
        buf,
        mimetype='text/html',
        as_attachment=True,
        download_name=f'power_quality_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.html'
    )

@app.route('/api/report/download/json')
def download_report_json():
    global phase_a_history, phase_b_history, phase_c_history
    
    harmonic_data = analyzer.compute_three_phase_thd(
        np.array(phase_a_history[-FS:]) if len(phase_a_history) >= FS else np.zeros(FS),
        np.array(phase_b_history[-FS:]) if len(phase_b_history) >= FS else np.zeros(FS),
        np.array(phase_c_history[-FS:]) if len(phase_c_history) >= FS else np.zeros(FS)
    )
    
    flicker_pst = 0
    if len(phase_a_history) >= 10 * FS:
        signal_a = np.array(phase_a_history[-10*FS:])
        flicker_result = flicker_meter.compute_pst(signal_a, duration_seconds=10)
        flicker_pst = flicker_result['Pst']
    
    measurement_data = {
        'start_time': datetime.now().isoformat(),
        'end_time': datetime.now().isoformat(),
        'rms_a': float(np.sqrt(np.mean(np.array(phase_a_history[-FS:])**2))) if len(phase_a_history) >= FS else 220,
        'rms_b': float(np.sqrt(np.mean(np.array(phase_b_history[-FS:])**2))) if len(phase_b_history) >= FS else 220,
        'rms_c': float(np.sqrt(np.mean(np.array(phase_c_history[-FS:])**2))) if len(phase_c_history) >= FS else 220,
        'frequency': pll.get_frequency(),
        'thd_a': harmonic_data['thd_a'],
        'thd_b': harmonic_data['thd_b'],
        'thd_c': harmonic_data['thd_c'],
        'harmonics': {
            'contents_a': {str(k): v for k, v in harmonic_data['contents_a'].items()},
            'contents_b': {str(k): v for k, v in harmonic_data['contents_b'].items()},
            'contents_c': {str(k): v for k, v in harmonic_data['contents_c'].items()}
        },
        'Pst': flicker_pst,
        'Plt': flicker_pst * 0.8
    }
    
    report = report_generator.generate_report(measurement_data)
    json_content = report_generator.export_json(report)
    
    buf = io.BytesIO()
    buf.write(json_content.encode('utf-8'))
    buf.seek(0)
    
    db.insert_event_log('REPORT_DOWNLOAD', 'Downloaded JSON report', 'INFO')
    
    return send_file(
        buf,
        mimetype='application/json',
        as_attachment=True,
        download_name=f'power_quality_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
