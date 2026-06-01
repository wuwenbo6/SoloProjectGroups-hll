import threading
import time
from collections import deque
from datetime import datetime


class EventStore:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, max_events=1000):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialize(max_events)
        return cls._instance

    def _initialize(self, max_events):
        self.max_events = max_events
        self.events = deque(maxlen=max_events)
        self.subscribers = []
        self.stats = {
            'total_requests': 0,
            'total_upload_bytes': 0,
            'total_download_bytes': 0,
            'total_credits_granted': 0,
            'active_sessions': set(),
            'request_types': {'INITIAL': 0, 'UPDATE': 0, 'TERMINATION': 0},
            'result_codes': {},
            'services': {}
        }

    def add_event(self, event):
        with self._lock:
            event['timestamp'] = datetime.now().isoformat()
            event['timestamp_epoch'] = time.time()
            self.events.append(event)
            self._update_stats(event)
            self._notify_subscribers(event)

    def _update_stats(self, event):
        self.stats['total_requests'] += 1

        if 'request_type' in event:
            req_type = event['request_type']
            if req_type in self.stats['request_types']:
                self.stats['request_types'][req_type] += 1
            else:
                self.stats['request_types'][req_type] = 1

        if 'result_code' in event:
            rc = str(event['result_code'])
            if rc in self.stats['result_codes']:
                self.stats['result_codes'][rc] += 1
            else:
                self.stats['result_codes'][rc] = 1

        if 'upload_bytes' in event and event['upload_bytes']:
            self.stats['total_upload_bytes'] += event['upload_bytes']

        if 'download_bytes' in event and event['download_bytes']:
            self.stats['total_download_bytes'] += event['download_bytes']

        if 'credits_granted' in event and event['credits_granted']:
            self.stats['total_credits_granted'] += event['credits_granted']

        if 'session_id' in event:
            if event.get('request_type') == 'TERMINATION':
                self.stats['active_sessions'].discard(event['session_id'])
            else:
                self.stats['active_sessions'].add(event['session_id'])

        service_id = event.get('service_id', 0)
        if service_id is not None:
            svc_key = str(service_id)
            if svc_key not in self.stats['services']:
                self.stats['services'][svc_key] = {
                    'service_id': service_id,
                    'total_requests': 0,
                    'total_upload_bytes': 0,
                    'total_download_bytes': 0,
                    'total_credits_granted': 0,
                    'total_used': 0,
                    'remaining_units': 0
                }
            svc_stats = self.stats['services'][svc_key]
            svc_stats['total_requests'] += 1
            if event.get('upload_bytes'):
                svc_stats['total_upload_bytes'] += event['upload_bytes']
            if event.get('download_bytes'):
                svc_stats['total_download_bytes'] += event['download_bytes']
            if event.get('credits_granted'):
                svc_stats['total_credits_granted'] += event['credits_granted']
            if event.get('total_bytes'):
                svc_stats['total_used'] += event['total_bytes']
            if 'remaining_units' in event:
                svc_stats['remaining_units'] = event['remaining_units']

    def get_stats(self):
        with self._lock:
            stats_copy = dict(self.stats)
            stats_copy['active_sessions'] = len(stats_copy['active_sessions'])
            return stats_copy

    def subscribe(self, callback):
        with self._lock:
            self.subscribers.append(callback)

    def unsubscribe(self, callback):
        with self._lock:
            if callback in self.subscribers:
                self.subscribers.remove(callback)

    def _notify_subscribers(self, event):
        for callback in self.subscribers:
            try:
                callback(event)
            except Exception:
                pass

    def get_events(self, limit=None, session_id=None, request_type=None, service_id=None):
        with self._lock:
            events = list(self.events)
            if session_id:
                events = [e for e in events if e.get('session_id') == session_id]
            if request_type:
                events = [e for e in events if e.get('request_type') == request_type]
            if service_id is not None:
                events = [e for e in events if e.get('service_id') == service_id]
            if limit:
                events = events[-limit:]
            return events

    def clear(self):
        with self._lock:
            self.events.clear()
            self.stats = {
                'total_requests': 0,
                'total_upload_bytes': 0,
                'total_download_bytes': 0,
                'total_credits_granted': 0,
                'active_sessions': set(),
                'request_types': {'INITIAL': 0, 'UPDATE': 0, 'TERMINATION': 0},
                'result_codes': {},
                'services': {}
            }


event_store = EventStore()
