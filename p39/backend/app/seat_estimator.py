import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from collections import defaultdict, deque
from dataclasses import dataclass


@dataclass
class DeviceStayRecord:
    mac: str
    first_seen: datetime
    last_seen: datetime
    zone: str
    rssi_samples: List[int]
    stay_duration: float = 0.0


class SeatOccupancyEstimator:
    def __init__(self, total_seats: int = 100):
        self.total_seats = total_seats
        self.device_records: Dict[str, DeviceStayRecord] = {}
        self.zone_seat_map: Dict[str, int] = defaultdict(lambda: 50)
        self.stay_history: deque = deque(maxlen=10000)
        self.stay_duration_threshold = 120
        self.seat_conversion_rate = 0.85

    def configure_zone_seats(self, zone: str, seat_count: int):
        self.zone_seat_map[zone] = seat_count

    def process_probe(self, mac: str, timestamp: datetime, rssi: int, zone: str):
        if mac in self.device_records:
            record = self.device_records[mac]
            record.last_seen = timestamp
            record.rssi_samples.append(rssi)
            record.stay_duration = (timestamp - record.first_seen).total_seconds()
        else:
            self.device_records[mac] = DeviceStayRecord(
                mac=mac,
                first_seen=timestamp,
                last_seen=timestamp,
                zone=zone,
                rssi_samples=[rssi],
                stay_duration=0.0
            )

    def cleanup_stale_devices(self, current_time: datetime, timeout_seconds: int = 600):
        stale_macs = []
        for mac, record in self.device_records.items():
            if (current_time - record.last_seen).total_seconds() > timeout_seconds:
                self.stay_history.append({
                    'mac': mac,
                    'zone': record.zone,
                    'first_seen': record.first_seen,
                    'last_seen': record.last_seen,
                    'duration': record.stay_duration,
                    'avg_rssi': np.mean(record.rssi_samples) if record.rssi_samples else 0
                })
                stale_macs.append(mac)

        for mac in stale_macs:
            del self.device_records[mac]

        return len(stale_macs)

    def calculate_stay_metrics(self, zone: str = None) -> Dict:
        if zone:
            records = [r for r in self.device_records.values() if r.zone == zone]
        else:
            records = list(self.device_records.values())

        if not records:
            return {
                'active_devices': 0,
                'avg_stay_duration': 0.0,
                'median_stay_duration': 0.0,
                'long_stay_devices': 0,
                'long_stay_ratio': 0.0
            }

        durations = [r.stay_duration for r in records]
        long_stay_count = sum(1 for d in durations if d >= self.stay_duration_threshold)

        return {
            'active_devices': len(records),
            'avg_stay_duration': round(np.mean(durations), 1),
            'median_stay_duration': round(np.median(durations), 1),
            'long_stay_devices': long_stay_count,
            'long_stay_ratio': round(long_stay_count / len(records), 2) if records else 0
        }

    def estimate_seat_occupancy(self, zone: str, current_time: datetime = None) -> Dict:
        if current_time is None:
            current_time = datetime.utcnow()

        self.cleanup_stale_devices(current_time)

        metrics = self.calculate_stay_metrics(zone)
        long_stay_devices = metrics['long_stay_devices']

        zone_seats = self.zone_seat_map.get(zone, 50)

        estimated_seated = int(long_stay_devices * self.seat_conversion_rate)
        estimated_seated = min(estimated_seated, zone_seats)

        occupancy_rate = estimated_seated / zone_seats if zone_seats > 0 else 0

        avg_stay_minutes = metrics['avg_stay_duration'] / 60 if metrics['avg_stay_duration'] else 0

        confidence = self._calculate_confidence(
            metrics['active_devices'],
            metrics['long_stay_ratio'],
            avg_stay_minutes
        )

        return {
            'zone': zone,
            'timestamp': current_time,
            'total_seats': zone_seats,
            'estimated_seated': estimated_seated,
            'standing_devices': metrics['active_devices'] - long_stay_devices,
            'occupancy_rate': round(occupancy_rate * 100, 1),
            'avg_stay_minutes': round(avg_stay_minutes, 1),
            'long_stay_devices': long_stay_devices,
            'confidence': round(confidence, 2),
            'status': self._get_occupancy_status(occupancy_rate)
        }

    def _calculate_confidence(self, active_count: int, long_stay_ratio: float, avg_stay_minutes: float) -> float:
        score = 0.0

        score += min(active_count / 20.0, 1.0) * 0.3

        score += min(long_stay_ratio * 1.5, 1.0) * 0.4

        score += min(avg_stay_minutes / 10.0, 1.0) * 0.3

        return max(0.3, min(1.0, score))

    def _get_occupancy_status(self, occupancy_rate: float) -> str:
        if occupancy_rate < 0.3:
            return 'low'
        elif occupancy_rate < 0.6:
            return 'medium'
        elif occupancy_rate < 0.85:
            return 'high'
        else:
            return 'critical'

    def get_stay_distribution(self, zone: str = None) -> Dict[str, int]:
        if zone:
            records = [r for r in self.device_records.values() if r.zone == zone]
        else:
            records = list(self.device_records.values())

        distribution = {
            '0-5min': 0,
            '5-15min': 0,
            '15-30min': 0,
            '30-60min': 0,
            '60min+': 0
        }

        for record in records:
            minutes = record.stay_duration / 60
            if minutes < 5:
                distribution['0-5min'] += 1
            elif minutes < 15:
                distribution['5-15min'] += 1
            elif minutes < 30:
                distribution['15-30min'] += 1
            elif minutes < 60:
                distribution['30-60min'] += 1
            else:
                distribution['60min+'] += 1

        return distribution

    def get_zone_summary(self, zones: List[str]) -> Dict:
        summary = {}
        current_time = datetime.utcnow()

        for zone in zones:
            summary[zone] = self.estimate_seat_occupancy(zone, current_time)

        return summary


global_seat_estimator = SeatOccupancyEstimator()
