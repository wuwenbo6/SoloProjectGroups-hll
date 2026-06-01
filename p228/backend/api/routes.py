import logging
from datetime import datetime
from flask import Blueprint, jsonify, request, send_file, Response

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cli import get_ses_cli, LED_VALID_MODES
from config import ENCLOSURE_DEVICES

logger = logging.getLogger(__name__)
api_bp = Blueprint('api', __name__)


def success_response(data=None):
    return jsonify({'success': True, 'data': data})


def error_response(message, status_code=400):
    return jsonify({'success': False, 'error': message}), status_code


@api_bp.route('/health')
def health_check():
    ses = get_ses_cli()
    return jsonify({
        'status': 'ok',
        'simulation_mode': ses.is_simulation_mode,
        'device': ses.device,
        'timestamp': datetime.now().isoformat(),
    })


@api_bp.route('/enclosures')
def get_enclosures():
    try:
        ses = get_ses_cli()
        enclosures = ses.scan_enclosures()
        return success_response(enclosures)
    except Exception as e:
        logger.exception(f"Failed to get enclosures: {e}")
        return error_response(str(e))


@api_bp.route('/status')
def get_status():
    try:
        ses = get_ses_cli()
        slots = ses.get_slot_status()
        temperatures = ses.get_temperature()

        data = {
            'enclosure': ses.device,
            'slot_count': len(slots),
            'slots': slots,
            'temperatures': temperatures,
            'simulation_mode': ses.is_simulation_mode,
            'updated_at': datetime.now().isoformat(),
        }
        return success_response(data)
    except Exception as e:
        logger.exception(f"Failed to get status: {e}")
        return error_response(str(e))


@api_bp.route('/slots')
def get_slots():
    try:
        ses = get_ses_cli()
        slots = ses.get_slot_status()
        return success_response(slots)
    except Exception as e:
        logger.exception(f"Failed to get slots: {e}")
        return error_response(str(e))


@api_bp.route('/slots/<int:slot>')
def get_slot(slot):
    try:
        ses = get_ses_cli()
        slot_data = ses.get_single_slot(slot)
        if slot_data is None:
            return error_response(f'Slot {slot} not found', 404)
        return success_response(slot_data)
    except Exception as e:
        logger.exception(f"Failed to get slot {slot}: {e}")
        return error_response(str(e))


@api_bp.route('/led/<int:slot>/<led_type>/<action>', methods=['POST'])
def set_led(slot, led_type, action):
    try:
        ses = get_ses_cli()

        if led_type not in ['locate', 'fault', 'active']:
            return error_response(f"Invalid LED type: {led_type}. Must be 'locate', 'fault', or 'active'")

        if action not in ['on', 'off']:
            return error_response(f"Invalid action: {action}. Must be 'on' or 'off'")

        slot_data = ses.get_single_slot(slot)
        if slot_data is None:
            return error_response(f'Slot {slot} not found', 404)

        result = ses.set_led(slot, led_type, action)
        if result:
            logger.info(f"Successfully set slot {slot} {led_type} LED to {action}")
            return success_response(None)
        else:
            return error_response(f'Failed to set LED for slot {slot}', 500)

    except ValueError as e:
        return error_response(str(e))
    except Exception as e:
        logger.exception(f"Failed to set LED: {e}")
        return error_response(str(e))


@api_bp.route('/temperature')
def get_temperature():
    try:
        ses = get_ses_cli()
        temperatures = ses.get_temperature()
        return success_response(temperatures)
    except Exception as e:
        logger.exception(f"Failed to get temperature: {e}")
        return error_response(str(e))


@api_bp.route('/led/mode/<int:slot>/<led_type>/<mode>', methods=['POST'])
def set_led_mode(slot, led_type, mode):
    """
    设置LED灯模式（闪灯/常亮/熄灭）
    
    Args:
        slot: 槽位号
        led_type: LED类型 - locate, fault, active
        mode: 模式 - off, on, blink, flash
    """
    try:
        ses = get_ses_cli()

        if led_type not in ['locate', 'fault', 'active']:
            return error_response(
                f"Invalid LED type: {led_type}. Must be 'locate', 'fault', or 'active'"
            )

        if mode not in LED_VALID_MODES:
            return error_response(
                f"Invalid LED mode: {mode}. Must be one of {LED_VALID_MODES}"
            )

        slot_data = ses.get_single_slot(slot)
        if slot_data is None:
            return error_response(f'Slot {slot} not found', 404)

        result = ses.set_led_mode(slot, led_type, mode)
        if result:
            logger.info(f"Successfully set slot {slot} {led_type} LED mode to {mode}")
            return success_response({'slot': slot, 'led_type': led_type, 'mode': mode})
        else:
            return error_response(f'Failed to set LED mode for slot {slot}', 500)

    except ValueError as e:
        return error_response(str(e))
    except Exception as e:
        logger.exception(f"Failed to set LED mode: {e}")
        return error_response(str(e))


@api_bp.route('/led/modes')
def get_led_modes():
    """获取支持的LED模式列表"""
    return success_response({
        'modes': LED_VALID_MODES,
        'descriptions': {
            'off': 'LED off',
            'on': 'LED steady on',
            'blink': 'LED blinking (1Hz)',
            'flash': 'LED flashing (2Hz)',
        },
    })


@api_bp.route('/diagnostics')
def get_diagnostics():
    """
    获取诊断日志
    
    Query params:
        format: json (default) or text
        download: true/false (default false) - 是否作为文件下载
    """
    try:
        ses = get_ses_cli()
        fmt = request.args.get('format', 'json').lower()
        download = request.args.get('download', 'false').lower() == 'true'

        if fmt not in ['json', 'text']:
            return error_response(f"Invalid format: {fmt}. Must be 'json' or 'text'")

        logs = ses.get_diagnostic_logs(format=fmt)

        if download:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            if fmt == 'text':
                filename = f'enclosure_diagnostics_{timestamp}.txt'
                return Response(
                    logs,
                    mimetype='text/plain',
                    headers={'Content-Disposition': f'attachment; filename={filename}'}
                )
            else:
                import json as json_lib
                filename = f'enclosure_diagnostics_{timestamp}.json'
                return Response(
                    json_lib.dumps(logs, indent=2),
                    mimetype='application/json',
                    headers={'Content-Disposition': f'attachment; filename={filename}'}
                )

        if fmt == 'text':
            return Response(logs, mimetype='text/plain')

        return success_response(logs)

    except Exception as e:
        logger.exception(f"Failed to get diagnostics: {e}")
        return error_response(str(e))
