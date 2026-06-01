import time
import json
import copy
from collections import deque
from datetime import datetime
import config


class FlowMonitor:
    def __init__(self, max_history=60):
        self.max_history = max_history
        self.rate_history = deque(maxlen=max_history)
        self.drop_history = deque(maxlen=max_history)
        self.remark_history = deque(maxlen=max_history)
        self.current_rate = 0
        self.current_drop_rate = 0
        self.current_remark_rate = 0
        self.total_packets = 0
        self.total_bytes = 0
        self.total_remarked_packets = 0
        self.total_remarked_bytes = 0
        self.total_dropped_packets = 0
        self.total_dropped_bytes = 0
        self.threshold_exceeded = False
        self.threshold_exceeded_count = 0
        self.last_threshold_exceeded_time = None
        self.burst_exceeded = False
        self.burst_exceeded_count = 0
        self.last_burst_exceeded_time = None
        self.dscp_remark_value = config.DSCP_REMARK_VALUE
        self.dscp_remark_name = config.DSCP_MAP.get(config.DSCP_REMARK_VALUE, 'Unknown')
        self.burst_tolerance_threshold = (config.RATE_THRESHOLD + config.BURST_TOLERANCE_RATE) * 1000
        self.data_callback = None
        self.ipv4_flow_key = 'eth_type=2048'
        self.meter_chain = copy.deepcopy(config.METER_CHAIN)
        self.meter_stats_data = {}
        self.flow_entries_data = []
        for meter_cfg in self.meter_chain:
            mid = meter_cfg['meter_id']
            self.meter_stats_data[mid] = {
                'meter_id': mid,
                'name': meter_cfg['name'],
                'bands': meter_cfg['bands'],
                'band_stats': [],
                'remarked_packets': 0,
                'remarked_bytes': 0,
                'dropped_packets': 0,
                'dropped_bytes': 0,
            }
        self.per_meter_remark_history = {}
        self.per_meter_drop_history = {}
        for meter_cfg in self.meter_chain:
            mid = meter_cfg['meter_id']
            self.per_meter_remark_history[mid] = deque(maxlen=max_history)
            self.per_meter_drop_history[mid] = deque(maxlen=max_history)

    def set_data_callback(self, callback):
        self.data_callback = callback

    def process_data(self, data):
        flows = data.get('flows', {})
        timestamp = data.get('timestamp', time.time())
        meter_chain = data.get('meter_chain', self.meter_chain)
        meter_stats = data.get('meter_stats', {})
        flow_entries = data.get('flow_entries', [])

        self.meter_chain = meter_chain
        self.flow_entries_data = flow_entries

        for mid, ms in meter_stats.items():
            mid = int(mid)
            self.meter_stats_data[mid] = ms

        ipv4_flow = flows.get(self.ipv4_flow_key, {})
        self.current_rate = ipv4_flow.get('rate_bps', 0)
        self.total_packets = ipv4_flow.get('packet_count', 0)
        self.total_bytes = ipv4_flow.get('byte_count', 0)

        total_remarked = 0
        total_dropped = 0
        total_remark_rate = 0
        total_drop_rate = 0

        for meter_cfg in self.meter_chain:
            mid = meter_cfg['meter_id']
            ms = self.meter_stats_data.get(mid, {})

            remarked = ms.get('remarked_packets', 0)
            dropped = ms.get('dropped_packets', 0)
            total_remarked += remarked
            total_dropped += dropped

            if len(self.per_meter_remark_history.get(mid, [])) > 0:
                last = self.per_meter_remark_history[mid][-1]
                time_diff = timestamp - last['timestamp']
                if time_diff > 0:
                    diff = remarked - last['total_remarked']
                    rate = diff / time_diff
                    total_remark_rate += rate

            if len(self.per_meter_drop_history.get(mid, [])) > 0:
                last = self.per_meter_drop_history[mid][-1]
                time_diff = timestamp - last['timestamp']
                if time_diff > 0:
                    diff = dropped - last['total_dropped']
                    rate = diff / time_diff
                    total_drop_rate += rate

            if mid not in self.per_meter_remark_history:
                self.per_meter_remark_history[mid] = deque(maxlen=self.max_history)
            self.per_meter_remark_history[mid].append({
                'timestamp': timestamp,
                'remark_rate': 0,
                'total_remarked': remarked
            })

            if mid not in self.per_meter_drop_history:
                self.per_meter_drop_history[mid] = deque(maxlen=self.max_history)
            self.per_meter_drop_history[mid].append({
                'timestamp': timestamp,
                'drop_rate': 0,
                'total_dropped': dropped
            })

        self.total_remarked_packets = total_remarked
        self.total_dropped_packets = total_dropped
        self.current_remark_rate = total_remark_rate
        self.current_drop_rate = total_drop_rate

        self.rate_history.append({
            'timestamp': timestamp,
            'rate': self.current_rate
        })

        self.remark_history.append({
            'timestamp': timestamp,
            'remark_rate': self.current_remark_rate,
            'total_remarked': self.total_remarked_packets
        })

        self.drop_history.append({
            'timestamp': timestamp,
            'drop_rate': self.current_drop_rate,
            'total_dropped': self.total_dropped_packets
        })

        first_threshold = None
        last_threshold = None
        for meter_cfg in self.meter_chain:
            for band_cfg in meter_cfg['bands']:
                rate_val = band_cfg['rate'] * 1000
                if first_threshold is None or rate_val < first_threshold:
                    first_threshold = rate_val
                if last_threshold is None or rate_val > last_threshold:
                    last_threshold = rate_val

        if first_threshold is not None:
            was_threshold_exceeded = self.threshold_exceeded
            self.threshold_exceeded = self.current_rate > first_threshold
            if self.threshold_exceeded and not was_threshold_exceeded:
                self.threshold_exceeded_count += 1
                self.last_threshold_exceeded_time = timestamp

        if last_threshold is not None:
            was_burst_exceeded = self.burst_exceeded
            self.burst_exceeded = self.current_rate > last_threshold
            if self.burst_exceeded and not was_burst_exceeded:
                self.burst_exceeded_count += 1
                self.last_burst_exceeded_time = timestamp

        processed_data = {
            'timestamp': timestamp,
            'current_rate': self.current_rate,
            'current_rate_mbps': self.current_rate / 1000000,
            'current_remark_rate': self.current_remark_rate,
            'current_drop_rate': self.current_drop_rate,
            'total_packets': self.total_packets,
            'total_bytes': self.total_bytes,
            'total_remarked_packets': self.total_remarked_packets,
            'total_dropped_packets': self.total_dropped_packets,
            'threshold_exceeded': self.threshold_exceeded,
            'threshold_exceeded_count': self.threshold_exceeded_count,
            'last_threshold_exceeded_time': self.last_threshold_exceeded_time,
            'burst_exceeded': self.burst_exceeded,
            'burst_exceeded_count': self.burst_exceeded_count,
            'last_burst_exceeded_time': self.last_burst_exceeded_time,
            'meter_chain': self.meter_chain,
            'meter_stats': self.meter_stats_data,
            'flow_entries': self.flow_entries_data,
            'packet_loss_percentage': self._calculate_loss_percentage(),
            'packet_remark_percentage': self._calculate_remark_percentage()
        }

        if first_threshold is not None:
            processed_data['threshold'] = first_threshold
            processed_data['threshold_mbps'] = first_threshold / 1000000
        if last_threshold is not None:
            processed_data['burst_tolerance_threshold'] = last_threshold
            processed_data['burst_tolerance_threshold_mbps'] = last_threshold / 1000000

        if self.data_callback:
            self.data_callback(processed_data)

        return processed_data

    def _calculate_loss_percentage(self):
        total = self.total_packets + self.total_dropped_packets
        if total == 0:
            return 0.0
        return (self.total_dropped_packets / total) * 100

    def _calculate_remark_percentage(self):
        total = self.total_packets + self.total_remarked_packets
        if total == 0:
            return 0.0
        return (self.total_remarked_packets / total) * 100

    def get_summary(self):
        return {
            'current_rate': self.current_rate,
            'current_rate_mbps': self.current_rate / 1000000,
            'total_packets': self.total_packets,
            'total_bytes': self.total_bytes,
            'total_remarked_packets': self.total_remarked_packets,
            'total_dropped_packets': self.total_dropped_packets,
            'threshold_exceeded': self.threshold_exceeded,
            'threshold_exceeded_count': self.threshold_exceeded_count,
            'burst_exceeded': self.burst_exceeded,
            'burst_exceeded_count': self.burst_exceeded_count,
            'packet_loss_percentage': self._calculate_loss_percentage(),
            'packet_remark_percentage': self._calculate_remark_percentage(),
            'meter_chain': self.meter_chain,
            'meter_stats': self.meter_stats_data,
        }

    def get_rate_history(self):
        return list(self.rate_history)

    def get_remark_history(self):
        return list(self.remark_history)

    def get_drop_history(self):
        return list(self.drop_history)

    def export_json(self):
        export_data = {
            'export_time': datetime.now().isoformat(),
            'export_timestamp': time.time(),
            'summary': {
                'current_rate_bps': self.current_rate,
                'current_rate_mbps': self.current_rate / 1000000,
                'total_packets': self.total_packets,
                'total_bytes': self.total_bytes,
                'total_remarked_packets': self.total_remarked_packets,
                'total_dropped_packets': self.total_dropped_packets,
                'packet_loss_percentage': round(self._calculate_loss_percentage(), 4),
                'packet_remark_percentage': round(self._calculate_remark_percentage(), 4),
                'threshold_exceeded_count': self.threshold_exceeded_count,
                'burst_exceeded_count': self.burst_exceeded_count,
            },
            'meter_chain_config': self.meter_chain,
            'meter_stats': {},
            'flow_entries': self.flow_entries_data,
            'history': {
                'rate_history': list(self.rate_history),
                'remark_history': list(self.remark_history),
                'drop_history': list(self.drop_history),
            },
        }

        for mid, ms in self.meter_stats_data.items():
            export_data['meter_stats'][str(mid)] = {
                'meter_id': ms.get('meter_id', mid),
                'name': ms.get('name', ''),
                'bands': ms.get('bands', []),
                'band_stats': ms.get('band_stats', []),
                'remarked_packets': ms.get('remarked_packets', 0),
                'remarked_bytes': ms.get('remarked_bytes', 0),
                'dropped_packets': ms.get('dropped_packets', 0),
                'dropped_bytes': ms.get('dropped_bytes', 0),
            }

        return json.dumps(export_data, indent=2, ensure_ascii=False, default=str)

    def reset_stats(self):
        self.rate_history.clear()
        self.remark_history.clear()
        self.drop_history.clear()
        self.current_rate = 0
        self.current_remark_rate = 0
        self.current_drop_rate = 0
        self.total_packets = 0
        self.total_bytes = 0
        self.total_remarked_packets = 0
        self.total_remarked_bytes = 0
        self.total_dropped_packets = 0
        self.total_dropped_bytes = 0
        self.threshold_exceeded = False
        self.threshold_exceeded_count = 0
        self.last_threshold_exceeded_time = None
        self.burst_exceeded = False
        self.burst_exceeded_count = 0
        self.last_burst_exceeded_time = None
        for mid in self.per_meter_remark_history:
            self.per_meter_remark_history[mid].clear()
        for mid in self.per_meter_drop_history:
            self.per_meter_drop_history[mid].clear()
        for mid in self.meter_stats_data:
            self.meter_stats_data[mid]['band_stats'] = []
            self.meter_stats_data[mid]['remarked_packets'] = 0
            self.meter_stats_data[mid]['remarked_bytes'] = 0
            self.meter_stats_data[mid]['dropped_packets'] = 0
            self.meter_stats_data[mid]['dropped_bytes'] = 0
        self.flow_entries_data = []
