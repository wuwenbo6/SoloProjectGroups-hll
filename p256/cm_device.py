import numpy as np
import time
import json
from datetime import datetime
from channel import Channel, InterferenceMatrix


class LoadBalancer:
    ROUND_ROBIN = 'round_robin'
    LEAST_LOADED = 'least_loaded'
    BEST_SNR = 'best_snr'
    WEIGHTED = 'weighted'

    def __init__(self, strategy='least_loaded'):
        self.strategy = strategy
        self.rebalance_history = []
        self.rebalance_count = 0
        self.utilization_threshold_high = 80
        self.utilization_threshold_low = 20

    def set_strategy(self, strategy):
        if strategy in [self.ROUND_ROBIN, self.LEAST_LOADED, self.BEST_SNR, self.WEIGHTED]:
            self.strategy = strategy
            return True
        return False

    def select_channels(self, cm, all_channels, target_count=4):
        available = [ch for ch in all_channels if not ch.is_busy or ch.assigned_cm == cm.cm_id]
        
        if len(available) == 0:
            return []
        
        target_count = min(target_count, len(available))
        
        if self.strategy == self.ROUND_ROBIN:
            return self._round_robin_select(available, target_count)
        elif self.strategy == self.LEAST_LOADED:
            return self._least_loaded_select(available, target_count)
        elif self.strategy == self.BEST_SNR:
            return self._best_snr_select(available, target_count)
        elif self.strategy == self.WEIGHTED:
            return self._weighted_select(available, target_count)
        
        return available[:target_count]

    def _round_robin_select(self, channels, count):
        current_ids = set()
        if self.rebalance_history:
            last = self.rebalance_history[-1]
            current_ids = set(last.get('selected_channels', []))
        
        sorted_channels = sorted(channels, key=lambda ch: ch.channel_id)
        start_idx = len(self.rebalance_history) % len(sorted_channels) if sorted_channels else 0
        
        result = []
        for i in range(count):
            idx = (start_idx + i) % len(sorted_channels)
            result.append(sorted_channels[idx])
        return result

    def _least_loaded_select(self, channels, count):
        sorted_channels = sorted(channels, key=lambda ch: ch.get_utilization())
        return sorted_channels[:count]

    def _best_snr_select(self, channels, count):
        sorted_channels = sorted(channels, key=lambda ch: ch.snr_db, reverse=True)
        return sorted_channels[:count]

    def _weighted_select(self, channels, count):
        def score(ch):
            utilization = ch.get_utilization()
            snr = ch.snr_db
            throughput = ch.get_theoretical_throughput()
            utilization_penalty = utilization / 100 * 30
            snr_bonus = snr / 30 * 40
            throughput_bonus = (throughput / 1e8) * 30
            return snr_bonus + throughput_bonus - utilization_penalty
        
        sorted_channels = sorted(channels, key=score, reverse=True)
        return sorted_channels[:count]

    def should_rebalance(self, cm):
        if not cm.bound_channels:
            return False
        
        channels = cm.bound_channels
        utilizations = [ch.get_utilization() for ch in channels]
        
        if not utilizations:
            return False
        
        max_util = max(utilizations)
        min_util = min(utilizations)
        avg_util = np.mean(utilizations)
        
        if max_util > self.utilization_threshold_high and min_util < self.utilization_threshold_low:
            return True
        
        if len(utilizations) > 1 and (max_util - min_util) > 50:
            return True
        
        return False

    def record_rebalance(self, cm_id, old_channels, new_channels, reason):
        self.rebalance_count += 1
        self.rebalance_history.append({
            'timestamp': datetime.now().isoformat(),
            'cm_id': cm_id,
            'old_channels': old_channels,
            'new_channels': new_channels,
            'reason': reason,
            'rebalance_id': self.rebalance_count
        })
        if len(self.rebalance_history) > 100:
            self.rebalance_history.pop(0)

    def get_status(self):
        return {
            'strategy': self.strategy,
            'rebalance_count': self.rebalance_count,
            'utilization_threshold_high': self.utilization_threshold_high,
            'utilization_threshold_low': self.utilization_threshold_low,
            'recent_rebalances': self.rebalance_history[-10:]
        }


class CMDevice:
    def __init__(self, cm_id, name="CM", interference_matrix=None):
        self.cm_id = cm_id
        self.name = name
        self.bound_channels = []
        self.data_queue = 0
        self.total_transmitted = 0
        self.is_bonding_enabled = False
        self.interference_matrix = interference_matrix

    def bind_channel(self, channel):
        if channel not in self.bound_channels:
            channel.is_busy = True
            channel.assigned_cm = self.cm_id
            self.bound_channels.append(channel)
            return True
        return False

    def unbind_channel(self, channel):
        if channel in self.bound_channels:
            self.bound_channels.remove(channel)
            channel.is_busy = False
            channel.assigned_cm = None
            return True
        return False

    def unbind_all_channels(self):
        for channel in self.bound_channels:
            channel.is_busy = False
            channel.assigned_cm = None
        self.bound_channels = []

    def enable_bonding(self, enable=True):
        self.is_bonding_enabled = enable

    def disable_bonding(self):
        self.is_bonding_enabled = False

    def _get_active_channel_ids(self):
        return [ch.channel_id for ch in self.bound_channels]

    def get_effective_throughput(self):
        if not self.bound_channels:
            return 0
        
        active_channels = self._get_active_channel_ids() if self.is_bonding_enabled else [self.bound_channels[0].channel_id]
        
        if self.is_bonding_enabled:
            total = 0
            for channel in self.bound_channels:
                total += channel.get_theoretical_throughput(
                    self.interference_matrix, active_channels
                )
            return total
        else:
            return self.bound_channels[0].get_theoretical_throughput(
                self.interference_matrix, active_channels
            )

    def get_bonded_throughput(self):
        if not self.bound_channels:
            return 0
        
        active_channels = self._get_active_channel_ids()
        total = 0
        for channel in self.bound_channels:
            total += channel.get_theoretical_throughput(
                self.interference_matrix, active_channels
            )
        return total

    def get_single_channel_throughput(self):
        if not self.bound_channels:
            return 0
        
        active_channels = [self.bound_channels[0].channel_id]
        return self.bound_channels[0].get_theoretical_throughput(
            self.interference_matrix, active_channels
        )

    def get_channel_throughputs(self):
        if not self.bound_channels:
            return []
        
        active_channels = self._get_active_channel_ids() if self.is_bonding_enabled else [self.bound_channels[0].channel_id]
        throughputs = []
        for channel in self.bound_channels:
            throughput = channel.get_theoretical_throughput(
                self.interference_matrix, active_channels if self.is_bonding_enabled else [channel.channel_id]
            )
            effective_snr = channel.get_effective_snr_with_interference(
                self.interference_matrix, active_channels if self.is_bonding_enabled else [channel.channel_id]
            ) if self.interference_matrix else channel.snr_db
            throughputs.append({
                'channel_id': channel.channel_id,
                'modulation': channel.modulation,
                'base_snr': channel.snr_db,
                'effective_snr': effective_snr,
                'throughput_bps': throughput,
                'throughput_mbps': throughput / 1e6
            })
        return throughputs

    def transmit_data(self, data_size_bits):
        if not self.bound_channels:
            return 0, 0

        if self.is_bonding_enabled and len(self.bound_channels) > 1:
            bits_per_channel = data_size_bits // len(self.bound_channels)
            total_transmitted = 0
            for i, channel in enumerate(self.bound_channels):
                bits = np.random.randint(0, 2, bits_per_channel)
                _, transmitted = channel.transmit(bits)
                total_transmitted += transmitted
        else:
            channel = self.bound_channels[0]
            bits = np.random.randint(0, 2, data_size_bits)
            _, total_transmitted = channel.transmit(bits)

        self.total_transmitted += total_transmitted
        return total_transmitted, len(self.bound_channels) if self.is_bonding_enabled else 1

    def get_status(self):
        return {
            'cm_id': self.cm_id,
            'name': self.name,
            'bound_channels': [ch.channel_id for ch in self.bound_channels],
            'bound_channel_count': len(self.bound_channels),
            'is_bonding_enabled': self.is_bonding_enabled,
            'single_channel_throughput': self.get_single_channel_throughput(),
            'bonded_throughput': self.get_bonded_throughput(),
            'channel_throughputs': self.get_channel_throughputs(),
            'total_transmitted': self.total_transmitted
        }


class ChannelManager:
    def __init__(self, num_channels=4):
        self.num_channels = num_channels
        self.channels = []
        self.cm_devices = {}
        self.interference_matrix = InterferenceMatrix(num_channels)
        self.load_balancer = LoadBalancer(strategy='least_loaded')
        self._initialize_channels(num_channels)

    def _initialize_channels(self, num_channels):
        modulations = ['QPSK', '16QAM', 'QPSK', '16QAM']
        snrs = [25, 22, 20, 18]
        for i in range(num_channels):
            channel = Channel(
                channel_id=i,
                bandwidth=20e6,
                modulation=modulations[i % len(modulations)]
            )
            channel.set_snr(snrs[i % len(snrs)])
            self.channels.append(channel)

    def set_interference(self, channel_i, channel_j, attenuation_db):
        self.interference_matrix.set_interference(channel_i, channel_j, attenuation_db)

    def get_interference_matrix(self):
        return self.interference_matrix.to_dict()

    def create_cm(self, cm_id, name="CM"):
        if cm_id not in self.cm_devices:
            self.cm_devices[cm_id] = CMDevice(cm_id, name, self.interference_matrix)
            return self.cm_devices[cm_id]
        return None

    def get_available_channels(self):
        return [ch for ch in self.channels if not ch.is_busy]

    def bind_cm_to_channels(self, cm_id, channel_ids):
        if cm_id not in self.cm_devices:
            return False
        cm = self.cm_devices[cm_id]
        for ch_id in channel_ids:
            channel = self._get_channel_by_id(ch_id)
            if channel and not channel.is_busy:
                cm.bind_channel(channel)
        return True

    def unbind_cm_channels(self, cm_id):
        if cm_id in self.cm_devices:
            self.cm_devices[cm_id].unbind_all_channels()
            return True
        return False

    def _get_channel_by_id(self, channel_id):
        for channel in self.channels:
            if channel.channel_id == channel_id:
                return channel
        return None

    def set_cm_bonding(self, cm_id, enabled):
        if cm_id in self.cm_devices:
            self.cm_devices[cm_id].enable_bonding(enabled)
            return True
        return False

    def get_cm_status(self, cm_id):
        if cm_id in self.cm_devices:
            return self.cm_devices[cm_id].get_status()
        return None

    def get_all_channels_status(self):
        return [ch.get_status() for ch in self.channels]

    def get_all_cm_status(self):
        return [cm.get_status() for cm in self.cm_devices.values()]

    def run_simulation(self, cm_id, duration_seconds=1, data_rate=100e6):
        if cm_id not in self.cm_devices:
            return None
        
        cm = self.cm_devices[cm_id]
        total_data = int(data_rate * duration_seconds)
        
        cm.disable_bonding()
        throughput_no_bonding = cm.get_effective_throughput()
        transmitted_no_bonding, channels_used_no_bonding = cm.transmit_data(total_data)
        
        cm.enable_bonding()
        throughput_with_bonding = cm.get_effective_throughput()
        transmitted_with_bonding, channels_used_with_bonding = cm.transmit_data(total_data)
        
        return {
            'cm_id': cm_id,
            'duration_seconds': duration_seconds,
            'no_bonding': {
                'throughput_bps': throughput_no_bonding,
                'transmitted_bits': transmitted_no_bonding,
                'channels_used': channels_used_no_bonding
            },
            'with_bonding': {
                'throughput_bps': throughput_with_bonding,
                'transmitted_bits': transmitted_with_bonding,
                'channels_used': channels_used_with_bonding
            },
            'improvement_ratio': throughput_with_bonding / throughput_no_bonding if throughput_no_bonding > 0 else 1
        }

    def auto_bind_channels(self, cm_id, target_count=4):
        if cm_id not in self.cm_devices:
            return None
        
        cm = self.cm_devices[cm_id]
        old_channel_ids = [ch.channel_id for ch in cm.bound_channels]
        
        selected = self.load_balancer.select_channels(cm, self.channels, target_count)
        if not selected:
            return {'rebalanced': False, 'reason': 'no_available_channels'}
        
        new_channel_ids = [ch.channel_id for ch in selected]
        
        if set(old_channel_ids) == set(new_channel_ids):
            return {'rebalanced': False, 'reason': 'no_change_needed', 'current_channels': old_channel_ids}
        
        cm.unbind_all_channels()
        for channel in selected:
            cm.bind_channel(channel)
        cm.enable_bonding()
        
        self.load_balancer.record_rebalance(
            cm_id, old_channel_ids, new_channel_ids,
            f"auto_{self.load_balancer.strategy}"
        )
        
        return {
            'rebalanced': True,
            'old_channels': old_channel_ids,
            'new_channels': new_channel_ids,
            'strategy': self.load_balancer.strategy
        }

    def check_and_rebalance(self, cm_id):
        if cm_id not in self.cm_devices:
            return None
        
        cm = self.cm_devices[cm_id]
        if not self.load_balancer.should_rebalance(cm):
            return {'rebalanced': False, 'reason': 'no_imbalance_detected'}
        
        utilizations = {ch.channel_id: ch.get_utilization() for ch in cm.bound_channels}
        reason = f"imbalance_detected: {utilizations}"
        
        result = self.auto_bind_channels(cm_id, len(cm.bound_channels))
        if result.get('rebalanced'):
            result['reason'] = reason
        return result

    def set_load_balance_strategy(self, strategy):
        return self.load_balancer.set_strategy(strategy)

    def set_utilization_thresholds(self, high, low):
        self.load_balancer.utilization_threshold_high = high
        self.load_balancer.utilization_threshold_low = low
        return True

    def get_load_balancer_status(self):
        return self.load_balancer.get_status()

    def get_channel_utilizations(self):
        return [{
            'channel_id': ch.channel_id,
            'modulation': ch.modulation,
            'utilization': ch.get_utilization(),
            'throughput_bps': ch.get_theoretical_throughput(),
            'bytes_transmitted': ch.bytes_transmitted,
            'is_busy': ch.is_busy,
            'assigned_cm': ch.assigned_cm
        } for ch in self.channels]

    def generate_report(self, cm_id):
        if cm_id not in self.cm_devices:
            return None
        
        cm = self.cm_devices[cm_id]
        now = datetime.now()
        
        channels_info = []
        for ch in cm.bound_channels:
            active_ids = cm._get_active_channel_ids() if cm.is_bonding_enabled else [ch.channel_id]
            effective_snr = ch.get_effective_snr_with_interference(
                self.interference_matrix, active_ids
            ) if self.interference_matrix else ch.snr_db
            throughput = ch.get_theoretical_throughput(
                self.interference_matrix, active_ids if cm.is_bonding_enabled else [ch.channel_id]
            )
            channels_info.append({
                'channel_id': ch.channel_id,
                'modulation': ch.modulation,
                'bandwidth_mhz': ch.bandwidth / 1e6,
                'base_snr_db': ch.snr_db,
                'effective_snr_db': round(effective_snr, 2),
                'snr_degradation_db': round(ch.snr_db - effective_snr, 2),
                'theoretical_throughput_mbps': round(throughput / 1e6, 2),
                'utilization_percent': round(ch.get_utilization(), 2),
                'bytes_transmitted': ch.bytes_transmitted,
                'interference_from': {
                    f'channel_{other_ch.channel_id}': round(self.interference_matrix.get_interference(ch.channel_id, other_ch.channel_id), 1)
                    for other_ch in cm.bound_channels if other_ch.channel_id != ch.channel_id
                }
            })
        
        single_throughput = cm.get_single_channel_throughput()
        bonded_throughput = cm.get_bonded_throughput()
        
        interference_data = self.interference_matrix.to_dict()
        
        report = {
            'report_id': f"RPT-{cm_id}-{now.strftime('%Y%m%d%H%M%S')}",
            'generated_at': now.isoformat(),
            'cm_device': {
                'cm_id': cm.cm_id,
                'name': cm.name,
                'bonding_enabled': cm.is_bonding_enabled,
                'bound_channel_count': len(cm.bound_channels),
                'bound_channel_ids': [ch.channel_id for ch in cm.bound_channels]
            },
            'throughput_summary': {
                'single_channel_mbps': round(single_throughput / 1e6, 2),
                'bonded_total_mbps': round(bonded_throughput / 1e6, 2),
                'improvement_ratio': round(bonded_throughput / single_throughput, 2) if single_throughput > 0 else 1,
                'improvement_percent': round((bonded_throughput - single_throughput) / single_throughput * 100, 1) if single_throughput > 0 else 0
            },
            'channel_details': channels_info,
            'interference_matrix': interference_data,
            'load_balancer': self.load_balancer.get_status(),
            'simulation_config': {
                'num_channels': self.num_channels,
                'channel_bandwidth_mhz': 20,
                'modulations_available': ['QPSK', '16QAM']
            }
        }
        
        return report

    def generate_full_report(self):
        now = datetime.now()
        report = {
            'report_id': f"RPT-FULL-{now.strftime('%Y%m%d%H%M%S')}",
            'generated_at': now.isoformat(),
            'system_summary': {
                'total_channels': len(self.channels),
                'total_cm_devices': len(self.cm_devices),
                'active_channels': sum(1 for ch in self.channels if ch.is_busy),
                'load_balance_strategy': self.load_balancer.strategy
            },
            'channels': self.get_channel_utilizations(),
            'interference_matrix': self.interference_matrix.to_dict(),
            'cm_devices': {},
            'load_balancer': self.load_balancer.get_status()
        }
        
        for cm_id, cm in self.cm_devices.items():
            report['cm_devices'][cm_id] = self.generate_report(cm_id)
        
        return report
