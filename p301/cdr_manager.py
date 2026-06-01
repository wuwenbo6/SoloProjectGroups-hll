import csv
import io
import json
import threading
import time
import uuid
from collections import deque
from datetime import datetime
from typing import Optional, Dict, Any, List


class CDR:
    CDR_TYPE_INITIAL = 'INITIAL'
    CDR_TYPE_UPDATE = 'UPDATE'
    CDR_TYPE_TERMINATION = 'TERMINATION'

    def __init__(self, session_id: str, msisdn: str, imsi: Optional[str] = None):
        self.cdr_id = str(uuid.uuid4())
        self.session_id = session_id
        self.msisdn = msisdn
        self.imsi = imsi
        self.service_id = 0
        self.rating_group: Optional[int] = None
        self.cdr_type = CDR.CDR_TYPE_INITIAL
        self.request_number = 0
        self.start_time = time.time()
        self.end_time: Optional[float] = None
        self.duration = 0
        self.upload_bytes = 0
        self.download_bytes = 0
        self.total_bytes = 0
        self.credits_granted = 0
        self.charged_amount = 0.0
        self.balance_before = 0.0
        self.balance_after = 0.0
        self.result_code = 2001
        self.reauth_required = False
        self.price_per_mb = 0.0
        self.created_at = time.time()

    def finalize(self):
        self.end_time = time.time()
        self.duration = int(self.end_time - self.start_time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'cdr_id': self.cdr_id,
            'session_id': self.session_id,
            'msisdn': self.msisdn,
            'imsi': self.imsi,
            'service_id': self.service_id,
            'rating_group': self.rating_group,
            'cdr_type': self.cdr_type,
            'request_number': self.request_number,
            'start_time': datetime.fromtimestamp(self.start_time).isoformat() if self.start_time else None,
            'end_time': datetime.fromtimestamp(self.end_time).isoformat() if self.end_time else None,
            'duration': self.duration,
            'upload_bytes': self.upload_bytes,
            'download_bytes': self.download_bytes,
            'total_bytes': self.total_bytes,
            'credits_granted': self.credits_granted,
            'charged_amount': round(self.charged_amount, 2),
            'balance_before': round(self.balance_before, 2),
            'balance_after': round(self.balance_after, 2),
            'result_code': self.result_code,
            'reauth_required': self.reauth_required,
            'price_per_mb': self.price_per_mb,
            'created_at': datetime.fromtimestamp(self.created_at).isoformat()
        }

    def to_csv_row(self) -> List[Any]:
        return [
            self.cdr_id,
            self.session_id,
            self.msisdn,
            self.imsi or '',
            self.service_id,
            self.rating_group or '',
            self.cdr_type,
            self.request_number,
            datetime.fromtimestamp(self.start_time).strftime('%Y-%m-%d %H:%M:%S') if self.start_time else '',
            datetime.fromtimestamp(self.end_time).strftime('%Y-%m-%d %H:%M:%S') if self.end_time else '',
            self.duration,
            self.upload_bytes,
            self.download_bytes,
            self.total_bytes,
            self.credits_granted,
            round(self.charged_amount, 2),
            round(self.balance_before, 2),
            round(self.balance_after, 2),
            self.result_code,
            self.reauth_required,
            self.price_per_mb
        ]

    @staticmethod
    def get_csv_headers() -> List[str]:
        return [
            'cdr_id', 'session_id', 'msisdn', 'imsi', 'service_id', 'rating_group',
            'cdr_type', 'request_number', 'start_time', 'end_time', 'duration',
            'upload_bytes', 'download_bytes', 'total_bytes', 'credits_granted',
            'charged_amount', 'balance_before', 'balance_after', 'result_code',
            'reauth_required', 'price_per_mb'
        ]


class CDRManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, max_cdrs: int = 10000):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialize(max_cdrs)
        return cls._instance

    def _initialize(self, max_cdrs: int):
        self.max_cdrs = max_cdrs
        self.cdrs: deque = deque(maxlen=max_cdrs)
        self.session_cdrs: Dict[str, List[CDR]] = {}
        self.lock = threading.Lock()

    def create_cdr(self, session_id: str, msisdn: str, imsi: Optional[str] = None) -> CDR:
        return CDR(session_id, msisdn, imsi)

    def add_cdr(self, cdr: CDR):
        with self.lock:
            cdr.finalize()
            self.cdrs.append(cdr)
            if cdr.session_id not in self.session_cdrs:
                self.session_cdrs[cdr.session_id] = []
            self.session_cdrs[cdr.session_id].append(cdr)

    def get_cdrs(self, limit: Optional[int] = None, session_id: Optional[str] = None,
                 msisdn: Optional[str] = None, service_id: Optional[int] = None,
                 cdr_type: Optional[str] = None) -> List[CDR]:
        with self.lock:
            cdrs = list(self.cdrs)
            if session_id:
                cdrs = [c for c in cdrs if c.session_id == session_id]
            if msisdn:
                cdrs = [c for c in cdrs if c.msisdn == msisdn]
            if service_id is not None:
                cdrs = [c for c in cdrs if c.service_id == service_id]
            if cdr_type:
                cdrs = [c for c in cdrs if c.cdr_type == cdr_type]
            if limit:
                cdrs = cdrs[-limit:]
            return cdrs

    def get_cdrs_as_dicts(self, **kwargs) -> List[Dict[str, Any]]:
        cdrs = self.get_cdrs(**kwargs)
        return [c.to_dict() for c in cdrs]

    def export_csv(self, **kwargs) -> str:
        cdrs = self.get_cdrs(**kwargs)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(CDR.get_csv_headers())
        for cdr in cdrs:
            writer.writerow(cdr.to_csv_row())
        return output.getvalue()

    def export_json(self, **kwargs) -> str:
        cdrs = self.get_cdrs_as_dicts(**kwargs)
        return json.dumps(cdrs, indent=2, ensure_ascii=False)

    def get_stats(self) -> Dict[str, Any]:
        with self.lock:
            total_cdrs = len(self.cdrs)
            total_revenue = sum(c.charged_amount for c in self.cdrs)
            total_bytes = sum(c.total_bytes for c in self.cdrs)
            total_upload = sum(c.upload_bytes for c in self.cdrs)
            total_download = sum(c.download_bytes for c in self.cdrs)
            cdr_types = {}
            for c in self.cdrs:
                cdr_types[c.cdr_type] = cdr_types.get(c.cdr_type, 0) + 1
            service_stats = {}
            for c in self.cdrs:
                svc_id = str(c.service_id)
                if svc_id not in service_stats:
                    service_stats[svc_id] = {
                        'service_id': c.service_id,
                        'cdr_count': 0,
                        'total_bytes': 0,
                        'total_revenue': 0.0
                    }
                service_stats[svc_id]['cdr_count'] += 1
                service_stats[svc_id]['total_bytes'] += c.total_bytes
                service_stats[svc_id]['total_revenue'] += c.charged_amount
            return {
                'total_cdrs': total_cdrs,
                'total_revenue': round(total_revenue, 2),
                'total_bytes': total_bytes,
                'total_upload': total_upload,
                'total_download': total_download,
                'cdr_types': cdr_types,
                'services': service_stats
            }

    def clear(self):
        with self.lock:
            self.cdrs.clear()
            self.session_cdrs.clear()


cdr_manager = CDRManager()
