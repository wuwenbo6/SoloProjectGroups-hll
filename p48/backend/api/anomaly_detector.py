import numpy as np
from collections import deque
from datetime import datetime
from database import insert_alert, get_config


class VolumeAnomalyDetector:
    def __init__(self, history_size=50):
        self.history_size = history_size
        self.volume_history = deque(maxlen=history_size)
        self.flow_rate_history = deque(maxlen=history_size)
        self.pile_count_history = deque(maxlen=history_size)
        self.ma_volume = None
        self.std_volume = None
        
    def update(self, total_volume, flow_rate=None, pile_count=None, measurement_id=None):
        alerts = []
        
        self.volume_history.append(total_volume)
        if flow_rate is not None:
            self.flow_rate_history.append(flow_rate)
        if pile_count is not None:
            self.pile_count_history.append(pile_count)
        
        if len(self.volume_history) >= 10:
            self.ma_volume = np.mean(self.volume_history)
            self.std_volume = np.std(self.volume_history)
            
            volume_alert = self._detect_volume_change(total_volume, measurement_id)
            if volume_alert:
                alerts.append(volume_alert)
        
        if len(self.flow_rate_history) >= 5:
            flow_alert = self._detect_flow_anomaly(measurement_id)
            if flow_alert:
                alerts.append(flow_alert)
        
        if len(self.pile_count_history) >= 5:
            pile_alert = self._detect_pile_count_change(pile_count, measurement_id)
            if pile_alert:
                alerts.append(pile_alert)
        
        return alerts
    
    def _detect_volume_change(self, current_volume, measurement_id):
        threshold = float(get_config('volume_change_threshold', '30.0')) / 100.0
        
        if self.ma_volume > 0:
            change_pct = abs(current_volume - self.ma_volume) / self.ma_volume
            
            if change_pct > threshold:
                severity = 'warning' if change_pct < threshold * 1.5 else 'critical'
                
                return insert_alert(
                    alert_type='volume_change',
                    severity=severity,
                    message=f'体积异常变化: {change_pct*100:.1f}%',
                    measurement_id=measurement_id,
                    details={
                        'current_volume': current_volume,
                        'expected_volume': self.ma_volume,
                        'change_percent': change_pct * 100,
                        'threshold': threshold * 100
                    }
                )
        return None
    
    def _detect_flow_anomaly(self, measurement_id):
        if len(self.flow_rate_history) < 5:
            return None
        
        current_flow = self.flow_rate_history[-1]
        avg_flow = np.mean(list(self.flow_rate_history)[:-1])
        
        warning_threshold = float(get_config('flow_rate_warning', '100.0'))
        critical_threshold = float(get_config('flow_rate_critical', '200.0'))
        
        if current_flow > critical_threshold:
            return insert_alert(
                alert_type='flow_rate',
                severity='critical',
                message=f'流量超限: {current_flow:.2f} 吨/小时',
                measurement_id=measurement_id,
                details={
                    'current_flow': current_flow,
                    'avg_flow': avg_flow,
                    'threshold': critical_threshold
                }
            )
        elif current_flow > warning_threshold:
            return insert_alert(
                alert_type='flow_rate',
                severity='warning',
                message=f'流量偏高: {current_flow:.2f} 吨/小时',
                measurement_id=measurement_id,
                details={
                    'current_flow': current_flow,
                    'avg_flow': avg_flow,
                    'threshold': warning_threshold
                }
            )
        
        return None
    
    def _detect_pile_count_change(self, current_count, measurement_id):
        if len(self.pile_count_history) < 5:
            return None
        
        counts = list(self.pile_count_history)[:-1]
        expected_count = max(set(counts), key=counts.count)
        
        if current_count != expected_count:
            return insert_alert(
                alert_type='pile_count',
                severity='warning',
                message=f'料堆数量变化: 期望{expected_count}个, 当前{current_count}个',
                measurement_id=measurement_id,
                details={
                    'current_count': current_count,
                    'expected_count': expected_count
                }
            )
        
        return None
    
    def get_statistics(self):
        return {
            'volume_avg': float(self.ma_volume) if self.ma_volume else 0,
            'volume_std': float(self.std_volume) if self.std_volume else 0,
            'flow_avg': float(np.mean(self.flow_rate_history)) if self.flow_rate_history else 0,
            'flow_peak': float(max(self.flow_rate_history)) if self.flow_rate_history else 0,
            'history_size': len(self.volume_history)
        }
    
    def reset(self):
        self.volume_history.clear()
        self.flow_rate_history.clear()
        self.pile_count_history.clear()
        self.ma_volume = None
        self.std_volume = None


class FlowRateCalculator:
    def __init__(self, material_density=1.6):
        self.material_density = material_density
        self.weights = []
        self.timestamps = []
        self.window_size = 10
    
    def update(self, total_volume, timestamp=None):
        if timestamp is None:
            timestamp = datetime.now()
        
        weight = total_volume * self.material_density
        
        self.weights.append(weight)
        self.timestamps.append(timestamp)
        
        if len(self.weights) > self.window_size:
            self.weights.pop(0)
            self.timestamps.pop(0)
        
        return self.calculate_flow_rate()
    
    def calculate_flow_rate(self):
        if len(self.weights) < 2:
            return 0.0
        
        time_diff = (self.timestamps[-1] - self.timestamps[0]).total_seconds() / 3600.0
        
        if time_diff <= 0:
            return 0.0
        
        weight_diff = self.weights[-1] - self.weights[0]
        flow_rate = weight_diff / time_diff
        
        return max(0.0, flow_rate)
    
    def calculate_hourly_total(self, measurements):
        if not measurements:
            return 0.0
        
        hourly_weights = {}
        
        for m in measurements:
            ts = datetime.fromisoformat(m['timestamp'])
            hour_key = ts.strftime('%Y-%m-%d %H:00')
            weight = m['total_volume'] * self.material_density
            if hour_key not in hourly_weights:
                hourly_weights[hour_key] = []
            hourly_weights[hour_key].append(weight)
        
        hourly_totals = {}
        for hour, weights in hourly_weights.items():
            hourly_totals[hour] = np.mean(weights)
        
        return hourly_totals
    
    def reset(self):
        self.weights.clear()
        self.timestamps.clear()
