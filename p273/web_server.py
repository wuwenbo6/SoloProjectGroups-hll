import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, Response, request
from flask_socketio import SocketIO, emit
import threading
import json
import copy
import config
from controller import MeterController
from monitor import FlowMonitor
from ryu.cmd import manager
import sys
import os
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'openflow-meter-demo'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

flow_monitor = FlowMonitor(max_history=120)
ryu_app = None


def on_controller_data(data):
    processed = flow_monitor.process_data(data)
    socketio.emit('flow_data', processed)


flow_monitor.set_data_callback(on_controller_data)


@app.route('/')
def index():
    meter_chain = config.METER_CHAIN
    return render_template('index.html',
                          meter_chain=meter_chain,
                          dscp_map=config.DSCP_MAP)


@app.route('/api/stats/json')
def export_stats_json():
    json_data = flow_monitor.export_json()
    timestamp = datetime.now().strftime(config.EXPORT_TIMESTAMP_FORMAT)
    filename = f"flow_stats_{timestamp}.json"
    return Response(
        json_data,
        mimetype='application/json',
        headers={
            'Content-Disposition': f'attachment; filename={filename}'
        }
    )


@app.route('/api/meter_chain')
def get_meter_chain():
    chain = config.METER_CHAIN
    return Response(
        json.dumps(chain, indent=2, ensure_ascii=False, default=str),
        mimetype='application/json'
    )


@socketio.on('connect')
def handle_connect():
    print('Client connected')
    summary = flow_monitor.get_summary()
    emit('init_data', summary)


@socketio.on('update_meter_chain')
def handle_update_meter_chain(data):
    global ryu_app
    new_chain = data.get('meter_chain', [])

    if not new_chain or not isinstance(new_chain, list):
        emit('meter_chain_updated', {
            'success': False,
            'message': 'Invalid meter chain configuration'
        })
        return

    try:
        for meter_cfg in new_chain:
            if 'meter_id' not in meter_cfg or 'bands' not in meter_cfg:
                emit('meter_chain_updated', {
                    'success': False,
                    'message': 'Each meter must have meter_id and bands'
                })
                return
            for band_cfg in meter_cfg['bands']:
                if 'type' not in band_cfg or 'rate' not in band_cfg:
                    emit('meter_chain_updated', {
                        'success': False,
                        'message': 'Each band must have type and rate'
                    })
                    return
                if band_cfg['rate'] <= 0:
                    emit('meter_chain_updated', {
                        'success': False,
                        'message': 'Band rate must be positive'
                    })
                    return

        if ryu_app and hasattr(ryu_app, 'update_meter_chain'):
            success = ryu_app.update_meter_chain(new_chain)
            if success:
                emit('meter_chain_updated', {
                    'success': True,
                    'meter_chain': config.METER_CHAIN,
                    'message': f'Meter chain updated: {len(new_chain)} meters'
                })
            else:
                emit('meter_chain_updated', {
                    'success': False,
                    'message': 'Switch not connected yet'
                })
        else:
            config.METER_CHAIN = copy.deepcopy(new_chain)
            emit('meter_chain_updated', {
                'success': True,
                'meter_chain': config.METER_CHAIN,
                'message': f'Meter chain config updated (controller not running): {len(new_chain)} meters'
            })
    except Exception as e:
        emit('meter_chain_updated', {
            'success': False,
            'message': f'Error: {str(e)}'
        })


@socketio.on('export_json')
def handle_export_json():
    json_data = flow_monitor.export_json()
    timestamp = datetime.now().strftime(config.EXPORT_TIMESTAMP_FORMAT)
    emit('json_exported', {
        'data': json.loads(json_data),
        'filename': f"flow_stats_{timestamp}.json"
    })


@socketio.on('reset_stats')
def handle_reset_stats():
    flow_monitor.reset_stats()
    emit('stats_reset', {'success': True})


@socketio.on('request_history')
def handle_request_history():
    history_data = {
        'rate_history': flow_monitor.get_rate_history(),
        'remark_history': flow_monitor.get_remark_history(),
        'drop_history': flow_monitor.get_drop_history()
    }
    emit('history_data', history_data)


def start_ryu_controller():
    global ryu_app
    sys.argv = [
        'ryu-manager',
        '--ofp-tcp-listen-port', '6633',
        '--verbose',
        'controller.meter_controller'
    ]

    from ryu.base.app_manager import AppManager

    manager.main()


def launch_ryu_in_thread():
    ryu_thread = threading.Thread(target=start_ryu_controller, daemon=True)
    ryu_thread.start()

    import time
    time.sleep(2)

    from ryu.base import app_manager
    global ryu_app

    for _ in range(10):
        try:
            apps = app_manager.AppManager.get_instance().applications
            for app in apps.values():
                if isinstance(app, MeterController):
                    ryu_app = app
                    ryu_app.set_data_callback(flow_monitor.process_data)
                    print(f"Ryu app connected: MeterController")
                    break
            if ryu_app:
                break
        except Exception as e:
            print(f"Waiting for Ryu app... {e}")
        time.sleep(1)


if __name__ == '__main__':
    launch_ryu_in_thread()
    socketio.run(app, host='0.0.0.0', port=config.WEB_PORT, debug=False)
