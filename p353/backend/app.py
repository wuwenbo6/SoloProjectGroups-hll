from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import numpy as np
from radar_signal_processing import PDRadarSignalProcessor
from target_tracker import TargetTracker

app = Flask(__name__)
CORS(app)

processor = PDRadarSignalProcessor()
tracker = TargetTracker()


@app.route('/api/radar/process', methods=['GET'])
def process_radar():
    try:
        snr_db = float(request.args.get('snr', 20))
        targets_param = request.args.get('targets')
        cfar_method = request.args.get('cfar', 'ca')
        enable_tracking = request.args.get('tracking', 'true').lower() == 'true'

        targets = None
        if targets_param:
            try:
                target_list = targets_param.split(';')
                targets = []
                for t in target_list:
                    parts = t.split(',')
                    if len(parts) == 3:
                        r = float(parts[0])
                        v = float(parts[1])
                        rcs = float(parts[2])
                        targets.append((r, v, rcs))
            except (ValueError, IndexError):
                targets = None

        result = processor.process(targets=targets, snr_db=snr_db, cfar_method=cfar_method)

        if enable_tracking and result.get('detections'):
            track_info = tracker.process_detections(result['detections'])
            result['tracks'] = track_info
        elif enable_tracking:
            track_info = tracker.process_detections([])
            result['tracks'] = track_info
        else:
            result['tracks'] = []

        result['cfar_method'] = cfar_method
        result['tracking_enabled'] = enable_tracking
        result['scan_count'] = tracker.scan_count

        return jsonify({
            'success': True,
            'data': result
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/radar/config', methods=['GET'])
def get_config():
    return jsonify({
        'success': True,
        'data': {
            'carrier_frequency': processor.fc,
            'bandwidth': processor.bw,
            'pulse_width': processor.tau,
            'prf': processor.prf,
            'num_pulses': processor.num_pulses,
            'sampling_frequency': processor.fs,
            'max_range': processor.range_max,
            'max_speed': processor.speed_max,
            'range_resolution': processor.range_resolution,
            'speed_resolution': processor.speed_resolution,
            'wavelength': processor.wavelength,
            'use_multi_prf': processor.use_multi_prf,
            'prf_list': processor.prf_list,
            'num_pulses_per_prf': processor.num_pulses_per_prf,
            'unambiguous_speed_list': processor.unambiguous_speed_list if processor.use_multi_prf else [],
            'max_unambiguous_speed': processor.max_unambiguous_speed,
            'window_type': 'hamming',
            'available_cfar_methods': ['ca', 'os', 'so'],
            'tracking_scan_count': tracker.scan_count
        }
    })


@app.route('/api/radar/params', methods=['POST'])
def update_params():
    try:
        data = request.get_json()
        global processor

        if 'carrier_frequency' in data:
            processor.fc = float(data['carrier_frequency'])
        if 'bandwidth' in data:
            processor.bw = float(data['bandwidth'])
        if 'pulse_width' in data:
            processor.tau = float(data['pulse_width'])
        if 'prf' in data:
            processor.prf = float(data['prf'])
        if 'num_pulses' in data:
            processor.num_pulses = int(data['num_pulses'])
        if 'max_range' in data:
            processor.range_max = float(data['max_range'])
        if 'max_speed' in data:
            processor.speed_max = float(data['max_speed'])
        if 'use_multi_prf' in data:
            processor.use_multi_prf = bool(data['use_multi_prf'])
        if 'prf_list' in data:
            processor.prf_list = [float(prf) for prf in data['prf_list']]
        if 'num_pulses_per_prf' in data:
            processor.num_pulses_per_prf = int(data['num_pulses_per_prf'])

        processor.fs = 2 * processor.bw
        processor.wavelength = processor.c / processor.fc
        processor.num_range_bins = int(processor.tau * processor.fs)
        processor.range_resolution = processor.c / (2 * processor.bw)
        processor.speed_resolution = processor.wavelength * processor.prf / (2 * processor.num_pulses)
        processor.range_axis = np.linspace(0, processor.range_max, processor.num_range_bins)
        processor.speed_axis = np.linspace(-processor.speed_max, processor.speed_max, processor.num_pulses)
        processor._update_multi_prf_params()

        return jsonify({
            'success': True,
            'message': 'Parameters updated successfully'
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tracks', methods=['GET'])
def get_tracks():
    try:
        tracks = tracker.get_all_tracks()
        return jsonify({
            'success': True,
            'data': {
                'scan_count': tracker.scan_count,
                'total_tracks': len(tracks),
                'tracks': tracks
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tracks/export/json', methods=['GET'])
def export_tracks_json():
    try:
        json_data = tracker.export_tracks_json()
        return Response(
            json_data,
            mimetype='application/json',
            headers={'Content-Disposition': 'attachment; filename=tracks.json'}
        )
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tracks/export/csv', methods=['GET'])
def export_tracks_csv():
    try:
        csv_data = tracker.export_tracks_csv()
        return Response(
            csv_data,
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=tracks.csv'}
        )
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tracks/reset', methods=['POST'])
def reset_tracks():
    try:
        tracker.reset()
        return jsonify({
            'success': True,
            'message': 'Tracks reset successfully'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)
