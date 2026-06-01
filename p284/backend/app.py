from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from bitarray import bitarray
import os
from datetime import datetime

from gmr_parser import GMRParser, GMRConstants
from test_data_generator import TestDataGenerator

app = Flask(__name__)
CORS(app)

parser = GMRParser()
data_generator = TestDataGenerator()


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.now().isoformat(),
        'service': 'GMR Frame Parser'
    })


@app.route('/api/constants', methods=['GET'])
def get_constants():
    return jsonify({
        'superframe_size': GMRConstants.SUPERFRAME_SIZE,
        'multiframe_size': GMRConstants.MULTIFRAME_SIZE,
        'basic_frame_size': GMRConstants.BASIC_FRAME_SIZE,
        'superframe_multiframes': GMRConstants.SUPERFRAME_MULTIFRAMES,
        'multiframe_basic_frames': GMRConstants.MULTIFRAME_BASIC_FRAMES,
        'basic_frame_timeslots': GMRConstants.BASIC_FRAME_TIMESLOTS,
        'sync_word': GMRConstants.SYNC_WORD.to01(),
        'bch_code_length': GMRConstants.BCH_CODE_LENGTH,
        'bch_info_length': GMRConstants.BCH_INFO_LENGTH,
        'timeslot_length': GMRConstants.TIMESLOT_LENGTH
    })


@app.route('/api/parse/hex', methods=['POST'])
def parse_hex():
    try:
        data = request.get_json()
        if not data or 'hex_data' not in data:
            return jsonify({'error': 'Missing hex_data parameter'}), 400

        hex_data = data['hex_data']
        use_flw = data.get('use_flw', True)
        use_soft = data.get('use_soft', True)
        superframe = parser.parse_hex_string(hex_data, use_flw=use_flw, use_soft=use_soft)

        return jsonify({
            'success': True,
            'superframe': superframe.to_dict(),
            'sync_status': parser.get_sync_status(),
            'bch_codes': parser.extract_bch_codes()[:50],
            'traffic_timeslots': parser.extract_traffic_timeslots()[:100],
            'flw_correlations': parser.extract_flw_correlations()[:50],
            'soft_stats': parser.extract_soft_decode_stats(),
            'lqi': parser.get_lqi(),
            'lqi_statistics': parser.get_lqi_statistics(),
            'error_summary': parser.get_error_summary(),
            'error_distribution': parser.get_error_distribution()
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/parse/binary', methods=['POST'])
def parse_binary():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400

        file = request.files['file']
        raw_bytes = file.read()

        superframe = parser.parse_bytes(raw_bytes)

        return jsonify({
            'success': True,
            'superframe': superframe.to_dict(),
            'sync_status': parser.get_sync_status(),
            'bch_codes': parser.extract_bch_codes()[:50],
            'traffic_timeslots': parser.extract_traffic_timeslots()[:100],
            'flw_correlations': parser.extract_flw_correlations()[:50],
            'soft_stats': parser.extract_soft_decode_stats(),
            'lqi': parser.get_lqi(),
            'lqi_statistics': parser.get_lqi_statistics(),
            'error_summary': parser.get_error_summary(),
            'error_distribution': parser.get_error_distribution()
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/test/generate', methods=['POST'])
def generate_test_data():
    try:
        data = request.get_json() or {}
        occupancy_rate = data.get('occupancy_rate', 0.6)
        error_rate = data.get('error_rate', 0.01)

        hex_data = data_generator.generate_hex_superframe(occupancy_rate, error_rate)

        return jsonify({
            'success': True,
            'hex_data': hex_data,
            'parameters': {
                'occupancy_rate': occupancy_rate,
                'error_rate': error_rate
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/test/parse', methods=['POST'])
def generate_and_parse():
    try:
        data = request.get_json() or {}
        occupancy_rate = data.get('occupancy_rate', 0.6)
        error_rate = data.get('error_rate', 0.01)
        use_flw = data.get('use_flw', True)
        use_soft = data.get('use_soft', True)

        bits = data_generator.generate_superframe(occupancy_rate, error_rate)
        superframe = parser.parse_bitarray(bits, use_flw=use_flw, use_soft=use_soft)

        return jsonify({
            'success': True,
            'superframe': superframe.to_dict(),
            'sync_status': parser.get_sync_status(),
            'bch_codes': parser.extract_bch_codes()[:50],
            'traffic_timeslots': parser.extract_traffic_timeslots()[:100],
            'flw_correlations': parser.extract_flw_correlations()[:50],
            'soft_stats': parser.extract_soft_decode_stats(),
            'lqi': parser.get_lqi(),
            'lqi_statistics': parser.get_lqi_statistics(),
            'error_summary': parser.get_error_summary(),
            'error_distribution': parser.get_error_distribution(),
            'parameters': {
                'occupancy_rate': occupancy_rate,
                'error_rate': error_rate,
                'use_flw': use_flw,
                'use_soft': use_soft
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/sync-status', methods=['GET'])
def get_sync_status():
    try:
        return jsonify({
            'success': True,
            'sync_status': parser.get_sync_status()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/timeslot-occupancy', methods=['GET'])
def get_timeslot_occupancy():
    try:
        if parser.current_superframe is None:
            return jsonify({'error': 'No frame parsed yet'}), 404

        occupancy = parser.current_superframe.get_combined_timeslot_occupancy()
        return jsonify({
            'success': True,
            'occupancy': occupancy
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/bch-codes', methods=['GET'])
def get_bch_codes():
    try:
        limit = request.args.get('limit', 100, type=int)
        bch_codes = parser.extract_bch_codes()[:limit]
        return jsonify({
            'success': True,
            'count': len(bch_codes),
            'bch_codes': bch_codes
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/flw-correlations', methods=['GET'])
def get_flw_correlations():
    try:
        limit = request.args.get('limit', 100, type=int)
        flw_data = parser.extract_flw_correlations()[:limit]
        return jsonify({
            'success': True,
            'count': len(flw_data),
            'flw_correlations': flw_data
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/soft-stats', methods=['GET'])
def get_soft_stats():
    try:
        stats = parser.extract_soft_decode_stats()
        return jsonify({
            'success': True,
            'soft_stats': stats
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/lqi', methods=['GET'])
def get_lqi():
    try:
        lqi = parser.get_lqi()
        if lqi is None:
            return jsonify({'error': 'No LQI data available, parse a frame first'}), 404
        return jsonify({
            'success': True,
            'lqi': lqi
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/lqi/history', methods=['GET'])
def get_lqi_history():
    try:
        count = request.args.get('count', 10, type=int)
        history = parser.get_lqi_history(count)
        return jsonify({
            'success': True,
            'count': len(history),
            'history': history
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/lqi/statistics', methods=['GET'])
def get_lqi_statistics():
    try:
        stats = parser.get_lqi_statistics()
        return jsonify({
            'success': True,
            'statistics': stats
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/errors/summary', methods=['GET'])
def get_error_summary():
    try:
        summary = parser.get_error_summary()
        return jsonify({
            'success': True,
            'summary': summary
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/errors/entries', methods=['GET'])
def get_error_entries():
    try:
        limit = request.args.get('limit', 100, type=int)
        entries = parser.get_error_entries(limit)
        return jsonify({
            'success': True,
            'count': len(entries),
            'entries': entries
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/errors/distribution', methods=['GET'])
def get_error_distribution():
    try:
        distribution = parser.get_error_distribution()
        return jsonify({
            'success': True,
            'distribution': distribution
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/errors/export/csv', methods=['GET'])
def export_errors_csv():
    try:
        limit = request.args.get('limit', 1000, type=int)
        csv_content = parser.export_error_csv(limit)
        response = Response(
            csv_content,
            mimetype='text/csv',
            headers={
                'Content-Disposition': 'attachment; filename="error_statistics.csv"'
            }
        )
        return response

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/errors/export/json', methods=['GET'])
def export_errors_json():
    try:
        limit = request.args.get('limit', 1000, type=int)
        json_content = parser.export_error_json(limit)
        response = Response(
            json_content,
            mimetype='application/json',
            headers={
                'Content-Disposition': 'attachment; filename="error_statistics.json"'
            }
        )
        return response

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/errors/clear', methods=['POST'])
def clear_errors():
    try:
        parser.clear_error_stats()
        return jsonify({
            'success': True,
            'message': 'Error statistics and LQI history cleared'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/traffic-timeslots', methods=['GET'])
def get_traffic_timeslots():
    try:
        limit = request.args.get('limit', 100, type=int)
        traffic_slots = parser.extract_traffic_timeslots()[:limit]
        return jsonify({
            'success': True,
            'count': len(traffic_slots),
            'traffic_timeslots': traffic_slots
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/statistics', methods=['GET'])
def get_statistics():
    try:
        if parser.current_superframe is None:
            return jsonify({'error': 'No frame parsed yet'}), 404

        sf = parser.current_superframe

        total_basic_frames = 0
        synced_basic_frames = 0
        total_timeslots = 0
        occupied_timeslots = 0
        signaling_slots = 0
        traffic_slots = 0
        idle_slots = 0
        guard_slots = 0
        total_bch = 0
        valid_bch = 0
        flw_detected = 0
        flw_total = 0
        corr_peak_sum = 0.0
        corr_norm_sum = 0.0

        for mf in sf.multiframes:
            for bf in mf.basic_frames:
                total_basic_frames += 1
                if bf.sync_detected:
                    synced_basic_frames += 1
                flw_total += 1
                if bf.flw_result.get('found', False):
                    flw_detected += 1
                corr_peak_sum += bf.correlation_peak
                corr_norm_sum += bf.correlation_normalized
                for ts in bf.timeslots:
                    total_timeslots += 1
                    if ts.is_occupied:
                        occupied_timeslots += 1
                    if ts.slot_type == 'signaling':
                        signaling_slots += 1
                    elif ts.slot_type == 'traffic':
                        traffic_slots += 1
                    elif ts.slot_type == 'idle':
                        idle_slots += 1
                    elif ts.slot_type == 'guard':
                        guard_slots += 1
                total_bch += len(bf.bch_codes)
                valid_bch += sum(1 for bch in parser.extract_bch_codes()
                                 if bch.get('valid', False)
                                 and bch.get('multiframe') == mf.index
                                 and bch.get('basic_frame') == bf.index)

        soft_stats = parser.extract_soft_decode_stats()

        return jsonify({
            'success': True,
            'superframe_number': sf.frame_number,
            'sync_status': sf.sync_status,
            'multiframe_count': len(sf.multiframes),
            'total_basic_frames': total_basic_frames,
            'synced_basic_frames': synced_basic_frames,
            'sync_rate': synced_basic_frames / total_basic_frames if total_basic_frames > 0 else 0,
            'total_timeslots': total_timeslots,
            'occupied_timeslots': occupied_timeslots,
            'occupancy_rate': occupied_timeslots / total_timeslots if total_timeslots > 0 else 0,
            'slot_distribution': {
                'signaling': signaling_slots,
                'traffic': traffic_slots,
                'idle': idle_slots,
                'guard': guard_slots
            },
            'bch_statistics': {
                'total': total_bch,
                'valid': valid_bch,
                'error_rate': 1 - (valid_bch / total_bch) if total_bch > 0 else 0
            },
            'flw_statistics': {
                'detected': flw_detected,
                'total': flw_total,
                'detection_rate': flw_detected / flw_total if flw_total > 0 else 0,
                'avg_correlation_peak': round(corr_peak_sum / flw_total, 4) if flw_total > 0 else 0,
                'avg_correlation_normalized': round(corr_norm_sum / flw_total, 4) if flw_total > 0 else 0
            },
            'soft_decision': soft_stats
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
