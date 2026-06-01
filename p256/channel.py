import numpy as np
import time


class InterferenceMatrix:
    def __init__(self, num_channels=4):
        self.num_channels = num_channels
        self.interference_matrix = np.zeros((num_channels, num_channels))
        self._initialize_default_interference()

    def _initialize_default_interference(self):
        for i in range(self.num_channels):
            for j in range(self.num_channels):
                if i == j:
                    self.interference_matrix[i, j] = 0
                else:
                    distance = abs(i - j)
                    if distance == 1:
                        attenuation = 15
                    elif distance == 2:
                        attenuation = 25
                    else:
                        attenuation = 35
                    self.interference_matrix[i, j] = attenuation

    def set_interference(self, channel_i, channel_j, attenuation_db):
        if 0 <= channel_i < self.num_channels and 0 <= channel_j < self.num_channels:
            self.interference_matrix[channel_i, channel_j] = attenuation_db

    def get_interference(self, channel_i, channel_j):
        if 0 <= channel_i < self.num_channels and 0 <= channel_j < self.num_channels:
            return self.interference_matrix[channel_i, channel_j]
        return 0

    def get_total_interference(self, target_channel, active_channels):
        if len(active_channels) <= 1:
            return 0
        
        max_interference = 0
        for ch in active_channels:
            if ch != target_channel:
                interference = self.get_interference(target_channel, ch)
                if interference > max_interference:
                    max_interference = interference
        return max_interference

    def get_effective_snr(self, channel_id, base_snr_db, active_channels):
        if len(active_channels) <= 1:
            return base_snr_db
        
        total_interference_db = 0
        for ch in active_channels:
            if ch != channel_id:
                interference_db = self.get_interference(channel_id, ch)
                total_interference_db += 10 ** (-interference_db / 10)
        
        if total_interference_db > 0:
            combined_interference_db = -10 * np.log10(total_interference_db)
            return max(base_snr_db - combined_interference_db, 0)
        
        return base_snr_db

    def to_dict(self):
        return {
            'num_channels': self.num_channels,
            'matrix': self.interference_matrix.tolist()
        }


class Modulation:
    @staticmethod
    def qpsk_modulate(bits):
        bits = bits.reshape(-1, 2)
        symbols = (1 - 2 * bits[:, 0]) + 1j * (1 - 2 * bits[:, 1])
        return symbols / np.sqrt(2)

    @staticmethod
    def qam16_modulate(bits):
        bits = bits.reshape(-1, 4)
        real = 2 * bits[:, 0] + bits[:, 1]
        imag = 2 * bits[:, 2] + bits[:, 3]
        real = 1 - 2 * real
        imag = 1 - 2 * imag
        symbols = real + 1j * imag
        return symbols / np.sqrt(10)

    @staticmethod
    def get_bits_per_symbol(modulation_type):
        if modulation_type == 'QPSK':
            return 2
        elif modulation_type == '16QAM':
            return 4
        else:
            raise ValueError(f"Unknown modulation type: {modulation_type}")

    @staticmethod
    def modulate(bits, modulation_type):
        if modulation_type == 'QPSK':
            return Modulation.qpsk_modulate(bits)
        elif modulation_type == '16QAM':
            return Modulation.qam16_modulate(bits)
        else:
            raise ValueError(f"Unknown modulation type: {modulation_type}")


class Channel:
    def __init__(self, channel_id, bandwidth=20e6, noise_floor=-174, modulation='QPSK'):
        self.channel_id = channel_id
        self.bandwidth = bandwidth
        self.noise_floor = noise_floor
        self.modulation = modulation
        self.snr_db = 20
        self.frequency_offset = 0
        self.multipath_delays = np.array([0])
        self.multipath_gains = np.array([1])
        self.is_busy = False
        self.assigned_cm = None
        self.bytes_transmitted = 0
        self.last_active_time = None
        self.utilization_samples = []
        self.max_sample_count = 60

    def set_snr(self, snr_db):
        self.snr_db = snr_db

    def set_modulation(self, modulation):
        self.modulation = modulation

    def calculate_channel_capacity(self):
        snr_linear = 10 ** (self.snr_db / 10)
        capacity = self.bandwidth * np.log2(1 + snr_linear)
        return capacity

    def get_theoretical_throughput(self, interference_matrix=None, active_channels=None):
        bits_per_symbol = Modulation.get_bits_per_symbol(self.modulation)
        symbol_rate = self.bandwidth
        
        effective_snr = self.snr_db
        if interference_matrix is not None and active_channels is not None:
            effective_snr = interference_matrix.get_effective_snr(
                self.channel_id, self.snr_db, active_channels
            )
        
        snr_linear = 10 ** (effective_snr / 10)
        
        if self.modulation == 'QPSK':
            ber = 0.5 * np.exp(-snr_linear / 2)
        elif self.modulation == '16QAM':
            ber = (3 / 8) * np.exp(-snr_linear / 5)
        else:
            ber = 0
        
        efficiency = bits_per_symbol * (1 - ber)
        throughput = symbol_rate * efficiency
        return throughput

    def get_effective_snr_with_interference(self, interference_matrix, active_channels):
        return interference_matrix.get_effective_snr(
            self.channel_id, self.snr_db, active_channels
        )

    def transmit(self, bits):
        if len(bits) == 0:
            return np.array([]), 0
        
        symbols = Modulation.modulate(bits, self.modulation)
        snr_linear = 10 ** (self.snr_db / 10)
        signal_power = np.mean(np.abs(symbols) ** 2)
        noise_power = signal_power / snr_linear
        
        noise = np.sqrt(noise_power / 2) * (np.random.randn(len(symbols)) + 1j * np.random.randn(len(symbols)))
        received_symbols = symbols + noise
        
        bits_per_symbol = Modulation.get_bits_per_symbol(self.modulation)
        transmitted_bits = len(bits)
        
        self.bytes_transmitted += transmitted_bits // 8
        self.last_active_time = time.time()
        self._record_utilization(transmitted_bits)
        
        return received_symbols, transmitted_bits

    def _record_utilization(self, transmitted_bits):
        throughput = transmitted_bits
        capacity = self.calculate_channel_capacity()
        if capacity > 0:
            utilization = min(throughput / capacity * 100, 100)
        else:
            utilization = 0
        self.utilization_samples.append({
            'timestamp': time.time(),
            'utilization': utilization,
            'throughput_bps': throughput
        })
        if len(self.utilization_samples) > self.max_sample_count:
            self.utilization_samples.pop(0)

    def get_utilization(self):
        if not self.utilization_samples:
            return 0
        return np.mean([s['utilization'] for s in self.utilization_samples[-10:]])

    def get_current_throughput(self):
        if not self.utilization_samples:
            return 0
        return self.utilization_samples[-1]['throughput_bps']

    def get_utilization_history(self):
        return self.utilization_samples[-30:]

    def reset_stats(self):
        self.bytes_transmitted = 0
        self.last_active_time = None
        self.utilization_samples = []

    def get_status(self):
        return {
            'channel_id': self.channel_id,
            'modulation': self.modulation,
            'snr_db': self.snr_db,
            'bandwidth': self.bandwidth,
            'is_busy': self.is_busy,
            'assigned_cm': self.assigned_cm,
            'theoretical_throughput': self.get_theoretical_throughput(),
            'utilization': self.get_utilization(),
            'bytes_transmitted': self.bytes_transmitted
        }
