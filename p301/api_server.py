import json
import logging
import os
import queue
import threading
import time
from datetime import datetime
from flask import Flask, jsonify, request, Response, send_from_directory
from flask_cors import CORS

from event_store import event_store
from account_manager import account_manager
from cdr_manager import cdr_manager

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('APIServer')

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

subscriber_queues = []
subscriber_lock = threading.Lock()


def format_bytes(num_bytes):
    if num_bytes is None:
        return '0 B'
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:.2f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.2f} PB"


def event_subscriber(event):
    with subscriber_lock:
        for q in subscriber_queues:
            try:
                q.put_nowait(event)
            except queue.Full:
                try:
                    q.get_nowait()
                    q.put_nowait(event)
                except:
                    pass


event_store.subscribe(event_subscriber)


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/api/events', methods=['POST'])
def add_event():
    try:
        event = request.get_json(force=True)
        if not event:
            return jsonify({'error': 'Invalid event data'}), 400
        
        event_store.add_event(event)
        logger.info(f"Event added: {event.get('session_id')} - {event.get('request_type')}")
        
        return jsonify({'status': 'success', 'message': 'Event added'}), 201
    except Exception as e:
        logger.error(f"Failed to add event: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/events', methods=['GET'])
def get_events():
    limit = request.args.get('limit', type=int, default=100)
    session_id = request.args.get('session_id', type=str)
    request_type = request.args.get('request_type', type=str)
    service_id = request.args.get('service_id', type=int)

    events = event_store.get_events(limit=limit, session_id=session_id, request_type=request_type, service_id=service_id)

    formatted_events = []
    for event in events:
        formatted_event = dict(event)
        formatted_event['upload_bytes_formatted'] = format_bytes(event.get('upload_bytes', 0))
        formatted_event['download_bytes_formatted'] = format_bytes(event.get('download_bytes', 0))
        formatted_event['total_bytes_formatted'] = format_bytes(event.get('total_bytes', 0))
        formatted_event['credits_granted_formatted'] = format_bytes(event.get('credits_granted', 0))
        formatted_event['session_total_upload_formatted'] = format_bytes(event.get('session_total_upload', 0))
        formatted_event['session_total_download_formatted'] = format_bytes(event.get('session_total_download', 0))
        formatted_event['session_total_credits_formatted'] = format_bytes(event.get('session_total_credits', 0))
        formatted_events.append(formatted_event)

    return jsonify({
        'count': len(formatted_events),
        'events': formatted_events
    })


@app.route('/api/stats', methods=['GET'])
def get_stats():
    stats = event_store.get_stats()

    formatted_stats = dict(stats)
    formatted_stats['total_upload_bytes_formatted'] = format_bytes(stats.get('total_upload_bytes', 0))
    formatted_stats['total_download_bytes_formatted'] = format_bytes(stats.get('total_download_bytes', 0))
    formatted_stats['total_credits_granted_formatted'] = format_bytes(stats.get('total_credits_granted', 0))
    formatted_stats['total_traffic_formatted'] = format_bytes(
        stats.get('total_upload_bytes', 0) + stats.get('total_download_bytes', 0)
    )

    return jsonify(formatted_stats)


@app.route('/api/events/stream', methods=['GET'])
def stream_events():
    def generate():
        q = queue.Queue(maxsize=100)
        with subscriber_lock:
            subscriber_queues.append(q)

        try:
            yield 'data: ' + json.dumps({'type': 'connected', 'timestamp': time.time()}) + '\n\n'

            while True:
                try:
                    event = q.get(timeout=30)
                    formatted_event = dict(event)
                    formatted_event['upload_bytes_formatted'] = format_bytes(event.get('upload_bytes', 0))
                    formatted_event['download_bytes_formatted'] = format_bytes(event.get('download_bytes', 0))
                    formatted_event['total_bytes_formatted'] = format_bytes(event.get('total_bytes', 0))
                    formatted_event['credits_granted_formatted'] = format_bytes(event.get('credits_granted', 0))
                    formatted_event['session_total_upload_formatted'] = format_bytes(event.get('session_total_upload', 0))
                    formatted_event['session_total_download_formatted'] = format_bytes(event.get('session_total_download', 0))
                    formatted_event['session_total_credits_formatted'] = format_bytes(event.get('session_total_credits', 0))

                    yield 'data: ' + json.dumps({'type': 'event', 'data': formatted_event}) + '\n\n'
                except queue.Empty:
                    yield 'data: ' + json.dumps({'type': 'heartbeat', 'timestamp': time.time()}) + '\n\n'
        finally:
            with subscriber_lock:
                if q in subscriber_queues:
                    subscriber_queues.remove(q)

    return Response(generate(), mimetype='text/event-stream')


@app.route('/api/clear', methods=['POST'])
def clear_events():
    event_store.clear()
    logger.info("Events and stats cleared")
    return jsonify({'status': 'success', 'message': 'All events and stats cleared'})


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': time.time(),
        'event_store_initialized': event_store is not None
    })


@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    accounts = account_manager.get_all_accounts()
    return jsonify({
        'count': len(accounts),
        'accounts': accounts
    })


@app.route('/api/accounts/<msisdn>', methods=['GET'])
def get_account(msisdn):
    account = account_manager.get_account(msisdn)
    if not account:
        return jsonify({'error': 'Account not found'}), 404
    return jsonify(account.to_dict())


@app.route('/api/accounts', methods=['POST'])
def create_or_recharge_account():
    try:
        data = request.get_json(force=True)
        msisdn = data.get('msisdn')
        amount = data.get('recharge_amount')

        if not msisdn:
            return jsonify({'error': 'MSISDN is required'}), 400

        if amount is not None and float(amount) > 0:
            result = account_manager.recharge_account(msisdn, float(amount))
            if not result['success']:
                account = account_manager.get_or_create_account(msisdn)
                account.recharge(float(amount))
                result = {
                    'success': True,
                    'recharged': float(amount),
                    'balance': account.available_balance
                }
            logger.info(f"Account {msisdn} recharged: {amount} yuan")
            return jsonify(result)
        else:
            imsi = data.get('imsi')
            initial_balance = data.get('initial_balance', 100.0)
            account = account_manager.get_or_create_account(msisdn, imsi, float(initial_balance))
            return jsonify(account.to_dict())
    except Exception as e:
        logger.error(f"Failed to process account: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/accounts/stats', methods=['GET'])
def get_accounts_stats():
    stats = account_manager.get_accounts_stats()
    return jsonify(stats)


@app.route('/api/accounts/price', methods=['POST'])
def set_price():
    try:
        data = request.get_json(force=True)
        price = data.get('price_per_mb')
        if price is None:
            return jsonify({'error': 'price_per_mb is required'}), 400
        account_manager.set_price_per_mb(float(price))
        logger.info(f"Price set to {price} yuan per MB")
        return jsonify({'success': True, 'price_per_mb': float(price)})
    except Exception as e:
        logger.error(f"Failed to set price: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/accounts/sync', methods=['POST'])
def sync_account():
    try:
        data = request.get_json(force=True)
        msisdn = data.get('msisdn')
        if not msisdn:
            return jsonify({'error': 'MSISDN is required'}), 400

        account = account_manager.get_or_create_account(
            msisdn,
            data.get('imsi'),
            data.get('initial_balance', 100.0)
        )

        if data.get('balance') is not None:
            account.balance = float(data['balance'])
        if data.get('total_charged') is not None:
            account.total_charged = float(data['total_charged'])
        if data.get('total_recharged') is not None:
            account.total_recharged = float(data['total_recharged'])
        if data.get('is_active') is not None:
            account.is_active = bool(data['is_active'])

        logger.info(f"Account {msisdn} synced: balance={account.available_balance:.2f}")
        return jsonify({'success': True, 'account': account.to_dict()})
    except Exception as e:
        logger.error(f"Failed to sync account: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/cdrs', methods=['GET'])
def get_cdrs():
    limit = request.args.get('limit', type=int, default=100)
    session_id = request.args.get('session_id', type=str)
    msisdn = request.args.get('msisdn', type=str)
    service_id = request.args.get('service_id', type=int)
    cdr_type = request.args.get('cdr_type', type=str)

    cdrs = cdr_manager.get_cdrs_as_dicts(
        limit=limit, session_id=session_id, msisdn=msisdn,
        service_id=service_id, cdr_type=cdr_type
    )

    for cdr in cdrs:
        cdr['total_bytes_formatted'] = format_bytes(cdr.get('total_bytes', 0))
        cdr['upload_bytes_formatted'] = format_bytes(cdr.get('upload_bytes', 0))
        cdr['download_bytes_formatted'] = format_bytes(cdr.get('download_bytes', 0))
        cdr['credits_granted_formatted'] = format_bytes(cdr.get('credits_granted', 0))

    return jsonify({
        'count': len(cdrs),
        'cdrs': cdrs
    })


@app.route('/api/cdrs/export/csv', methods=['GET'])
def export_cdrs_csv():
    session_id = request.args.get('session_id', type=str)
    msisdn = request.args.get('msisdn', type=str)
    service_id = request.args.get('service_id', type=int)
    cdr_type = request.args.get('cdr_type', type=str)

    csv_data = cdr_manager.export_csv(
        session_id=session_id, msisdn=msisdn,
        service_id=service_id, cdr_type=cdr_type
    )

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'cdrs_{timestamp}.csv'

    return Response(
        csv_data,
        mimetype='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"'
        }
    )


@app.route('/api/cdrs/export/json', methods=['GET'])
def export_cdrs_json():
    session_id = request.args.get('session_id', type=str)
    msisdn = request.args.get('msisdn', type=str)
    service_id = request.args.get('service_id', type=int)
    cdr_type = request.args.get('cdr_type', type=str)

    json_data = cdr_manager.export_json(
        session_id=session_id, msisdn=msisdn,
        service_id=service_id, cdr_type=cdr_type
    )

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'cdrs_{timestamp}.json'

    return Response(
        json_data,
        mimetype='application/json',
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"'
        }
    )


@app.route('/api/cdrs/stats', methods=['GET'])
def get_cdrs_stats():
    stats = cdr_manager.get_stats()
    stats['total_revenue'] = round(stats.get('total_revenue', 0.0), 2)
    stats['total_bytes_formatted'] = format_bytes(stats.get('total_bytes', 0))
    stats['total_upload_formatted'] = format_bytes(stats.get('total_upload', 0))
    stats['total_download_formatted'] = format_bytes(stats.get('total_download', 0))
    for svc in stats.get('services', {}).values():
        svc['total_bytes_formatted'] = format_bytes(svc.get('total_bytes', 0))
        svc['total_revenue'] = round(svc.get('total_revenue', 0.0), 2)
    return jsonify(stats)


@app.route('/api/cdrs', methods=['POST'])
def add_cdr():
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({'error': 'Invalid CDR data'}), 400

        cdr = cdr_manager.create_cdr(
            data.get('session_id', ''),
            data.get('msisdn', ''),
            data.get('imsi')
        )
        cdr.service_id = data.get('service_id', 0)
        cdr.rating_group = data.get('rating_group')
        cdr.cdr_type = data.get('cdr_type', 'UPDATE')
        cdr.request_number = data.get('request_number', 0)
        cdr.upload_bytes = data.get('upload_bytes', 0)
        cdr.download_bytes = data.get('download_bytes', 0)
        cdr.total_bytes = data.get('total_bytes', 0)
        cdr.credits_granted = data.get('credits_granted', 0)
        cdr.charged_amount = data.get('charged_amount', 0.0)
        cdr.balance_before = data.get('balance_before', 0.0)
        cdr.balance_after = data.get('balance_after', 0.0)
        cdr.result_code = data.get('result_code', 2001)
        cdr.reauth_required = data.get('reauth_required', False)
        cdr.price_per_mb = data.get('price_per_mb', 0.0)

        cdr_manager.add_cdr(cdr)
        logger.info(f"CDR added: {cdr.cdr_id} for session {cdr.session_id}")
        return jsonify({'status': 'success', 'cdr_id': cdr.cdr_id}), 201
    except Exception as e:
        logger.error(f"Failed to add CDR: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/cdrs/clear', methods=['POST'])
def clear_cdrs():
    cdr_manager.clear()
    logger.info("CDRs cleared")
    return jsonify({'status': 'success', 'message': 'All CDRs cleared'})


def main():
    import argparse
    parser = argparse.ArgumentParser(description='OCS API Server')
    parser.add_argument('--host', default='0.0.0.0', help='Listen host')
    parser.add_argument('--port', type=int, default=5000, help='Listen port')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')

    args = parser.parse_args()

    logger.info(f"Starting API Server on {args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)


if __name__ == '__main__':
    main()
