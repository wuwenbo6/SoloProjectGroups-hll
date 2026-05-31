import numpy as np
from scipy.fft import fft, fftfreq
from scipy.signal import butter, filtfilt
from scipy.stats import norm
from datetime import datetime
import json


class InterharmonicAnalyzer:
    def __init__(self, fs=1000, f0=50, window_type='hanning'):
        self.fs = fs
        self.f0 = f0
        self.window_type = window_type
        
        self.f_resolution = 5.0
        self.n_cycles = 10
        self.n_samples = int(self.n_cycles * self.fs / self.f0)
    
    def _get_window(self, n):
        if self.window_type == 'hanning':
            window = np.hanning(n)
        elif self.window_type == 'hamming':
            window = np.hamming(n)
        elif self.window_type == 'blackman':
            window = np.blackman(n)
        else:
            window = np.hanning(n)
        
        correction = 1.0 / np.mean(window)
        return window, correction
    
    def detect_interharmonics(self, signal):
        n = len(signal)
        window, correction = self._get_window(n)
        windowed_signal = signal * window
        
        yf = fft(windowed_signal)
        xf = fftfreq(n, 1 / self.fs)[:n//2]
        amplitude = correction * 2.0 / n * np.abs(yf[:n//2])
        
        harmonics = {}
        interharmonics = {}
        
        for h in range(1, 51):
            target_freq = h * self.f0
            idx = np.argmin(np.abs(xf - target_freq))
            if idx < len(amplitude):
                harmonics[h] = amplitude[idx]
        
        for freq in np.arange(10, min(500, self.fs/2), self.f_resolution):
            is_harmonic = False
            for h in range(1, 51):
                if abs(freq - h * self.f0) < self.f_resolution / 2:
                    is_harmonic = True
                    break
            
            if not is_harmonic:
                idx = np.argmin(np.abs(xf - freq))
                if idx < len(amplitude) and amplitude[idx] > 0.1:
                    interharmonics[round(freq, 1)] = amplitude[idx]
        
        return harmonics, interharmonics, xf, amplitude
    
    def compute_interharmonic_group(self, signal):
        harmonics, interharmonics, xf, amplitude = self.detect_interharmonics(signal)
        
        groups = {}
        for h in range(1, 51):
            center_freq = h * self.f0
            group_amp = 0
            
            for freq, amp in interharmonics.items():
                if abs(freq - center_freq) <= 15:
                    group_amp += amp ** 2
            
            for hh in range(max(1, h-1), h+2):
                if hh in harmonics:
                    group_amp += harmonics[hh] ** 2
            
            groups[h] = np.sqrt(group_amp) if group_amp > 0 else 0
        
        return groups, harmonics, interharmonics, xf, amplitude


class FlickerMeter:
    def __init__(self, fs=1000, f0=50):
        self.fs = fs
        self.f0 = f0
        
        self.fc1 = 0.05
        self.fc2 = 10.59
        self.fc3 = 35
        self.fc4 = 0.5
        
        self.lam = 2 * np.pi * 1.233
        self.k = 1.7475
    
    def _rms(self, signal, window_size=200):
        n = len(signal)
        rms_signal = np.zeros(n)
        
        for i in range(n):
            start = max(0, i - window_size // 2)
            end = min(n, i + window_size // 2)
            rms_signal[i] = np.sqrt(np.mean(signal[start:end] ** 2))
        
        return rms_signal
    
    def _bandpass_filter(self, signal, lowcut, highcut, order=4):
        nyq = 0.5 * self.fs
        low = lowcut / nyq
        high = highcut / nyq
        b, a = butter(order, [low, high], btype='band')
        return filtfilt(b, a, signal)
    
    def _lowpass_filter(self, signal, cutoff, order=4):
        nyq = 0.5 * self.fs
        normal_cutoff = cutoff / nyq
        b, a = butter(order, normal_cutoff, btype='low')
        return filtfilt(b, a, signal)
    
    def _rectify(self, signal):
        return np.abs(signal)
    
    def _weighting_filter(self, signal):
        n = len(signal)
        t = np.arange(n) / self.fs
        
        s = np.zeros(n, dtype=complex)
        for i in range(n):
            s[i] = signal[i]
        
        return np.abs(signal)
    
    def _statistical_evaluation(self, signal):
        if len(signal) == 0:
            return 0
        
        sorted_signal = np.sort(signal)
        
        p50 = np.percentile(sorted_signal, 50)
        p10 = np.percentile(sorted_signal, 90)
        p3 = np.percentile(sorted_signal, 97)
        p1 = np.percentile(sorted_signal, 99)
        p01 = np.percentile(sorted_signal, 99.9)
        
        pst = np.sqrt(
            0.0314 * p01 +
            0.0525 * p1 +
            0.0657 * p3 +
            0.28 * p10 +
            0.08 * p50
        )
        
        return pst
    
    def compute_pst(self, voltage_signal, duration_seconds=600):
        n_samples = min(len(voltage_signal), int(duration_seconds * self.fs))
        signal = voltage_signal[:n_samples]
        
        rms_signal = self._rms(signal, window_size=int(self.fs/self.f0))
        
        dc_removed = rms_signal - np.mean(rms_signal)
        
        bp_filtered = self._bandpass_filter(dc_removed, self.fc1, self.fc3, order=2)
        
        rectified = self._rectify(bp_filtered)
        
        lp_filtered = self._lowpass_filter(rectified, self.fc4, order=4)
        
        normalized = lp_filtered / np.mean(rms_signal) * 100
        
        pst = self._statistical_evaluation(normalized)
        
        pst_inst = normalized
        
        return {
            'Pst': float(pst),
            'instantaneous': pst_inst.tolist(),
            'rms': rms_signal.tolist(),
            'percentiles': {
                'P50': float(np.percentile(normalized, 50)),
                'P10': float(np.percentile(normalized, 90)),
                'P3': float(np.percentile(normalized, 97)),
                'P1': float(np.percentile(normalized, 99)),
                'P0.1': float(np.percentile(normalized, 99.9))
            }
        }
    
    def compute_plt(self, pst_values):
        if len(pst_values) < 2:
            return 0
        
        n = len(pst_values)
        plt = np.sqrt(np.sum(np.array(pst_values) ** 3) / n)
        return float(plt)


class MeasurementReport:
    def __init__(self):
        self.report_data = {}
    
    def generate_report(self, measurement_data):
        report = {
            'report_id': datetime.now().strftime('%Y%m%d%H%M%S'),
            'generated_at': datetime.now().isoformat(),
            'measurement_period': {
                'start': measurement_data.get('start_time', datetime.now().isoformat()),
                'end': measurement_data.get('end_time', datetime.now().isoformat())
            },
            'voltage_quality': {
                'rms_voltage': {
                    'phase_a': measurement_data.get('rms_a', 0),
                    'phase_b': measurement_data.get('rms_b', 0),
                    'phase_c': measurement_data.get('rms_c', 0),
                    'unit': 'V'
                },
                'frequency': measurement_data.get('frequency', 50.0),
                'frequency_unit': 'Hz'
            },
            'harmonics': measurement_data.get('harmonics', {}),
            'interharmonics': measurement_data.get('interharmonics', {}),
            'thd': {
                'phase_a': measurement_data.get('thd_a', 0),
                'phase_b': measurement_data.get('thd_b', 0),
                'phase_c': measurement_data.get('thd_c', 0),
                'unit': '%'
            },
            'flicker': {
                'Pst': measurement_data.get('Pst', 0),
                'Plt': measurement_data.get('Plt', 0)
            },
            'iec_limits': {
                'THD_limit': 8.0,
                'Pst_limit': 1.0,
                'Plt_limit': 0.65
            },
            'compliance': {
                'thd_compliant': measurement_data.get('thd_a', 0) <= 8.0,
                'pst_compliant': measurement_data.get('Pst', 0) <= 1.0,
                'plt_compliant': measurement_data.get('Plt', 0) <= 0.65
            }
        }
        
        self.report_data = report
        return report
    
    def export_html(self, report_data=None):
        if report_data is None:
            report_data = self.report_data
        
        html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>电能质量测量报告</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        .header {{ text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; }}
        .section {{ margin: 20px 0; }}
        .section h2 {{ color: #2a5298; border-bottom: 1px solid #ddd; padding-bottom: 10px; }}
        table {{ width: 100%; border-collapse: collapse; margin: 10px 0; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f8f9fa; }}
        .compliant {{ color: green; font-weight: bold; }}
        .non-compliant {{ color: red; font-weight: bold; }}
        .footer {{ margin-top: 30px; text-align: center; color: #666; font-size: 0.8em; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>电能质量测量报告</h1>
        <p>报告编号: {report_data['report_id']}</p>
        <p>生成时间: {report_data['generated_at']}</p>
    </div>
    
    <div class="section">
        <h2>1. 测量基本信息</h2>
        <table>
            <tr><th>测量开始时间</th><td>{report_data['measurement_period']['start']}</td></tr>
            <tr><th>测量结束时间</th><td>{report_data['measurement_period']['end']}</td></tr>
            <tr><th>系统频率</th><td>{report_data['voltage_quality']['frequency']:.2f} Hz</td></tr>
        </table>
    </div>
    
    <div class="section">
        <h2>2. 电压质量</h2>
        <table>
            <tr><th>参数</th><th>A相</th><th>B相</th><th>C相</th><th>单位</th></tr>
            <tr>
                <td>电压有效值</td>
                <td>{report_data['voltage_quality']['rms_voltage']['phase_a']:.2f}</td>
                <td>{report_data['voltage_quality']['rms_voltage']['phase_b']:.2f}</td>
                <td>{report_data['voltage_quality']['rms_voltage']['phase_c']:.2f}</td>
                <td>V</td>
            </tr>
            <tr>
                <td>总谐波失真</td>
                <td>{report_data['thd']['phase_a']:.2f}</td>
                <td>{report_data['thd']['phase_b']:.2f}</td>
                <td>{report_data['thd']['phase_c']:.2f}</td>
                <td>%</td>
            </tr>
        </table>
    </div>
    
    <div class="section">
        <h2>3. 闪变测量</h2>
        <table>
            <tr><th>参数</th><th>测量值</th><th>限值</th><th>符合性</th></tr>
            <tr>
                <td>短时间闪变值 Pst</td>
                <td>{report_data['flicker']['Pst']:.3f}</td>
                <td>1.0</td>
                <td class="{'compliant' if report_data['compliance']['pst_compliant'] else 'non-compliant'}">
                    {'合格' if report_data['compliance']['pst_compliant'] else '不合格'}
                </td>
            </tr>
            <tr>
                <td>长时间闪变值 Plt</td>
                <td>{report_data['flicker']['Plt']:.3f}</td>
                <td>0.65</td>
                <td class="{'compliant' if report_data['compliance']['plt_compliant'] else 'non-compliant'}">
                    {'合格' if report_data['compliance']['plt_compliant'] else '不合格'}
                </td>
            </tr>
        </table>
    </div>
    
    <div class="section">
        <h2>4. 谐波含量 (A相, %)</h2>
        <table>
            <tr><th>谐波次数</th><th>含量(%)</th><th>谐波次数</th><th>含量(%)</th></tr>
'''
        
        harmonics_a = report_data['harmonics'].get('contents_a', {})
        for i in range(1, 13, 2):
            html += f'<tr>'
            for j in [i, i+1]:
                if j <= 13:
                    html += f'<td>{j}</td><td>{harmonics_a.get(str(j), harmonics_a.get(j, 0)):.2f}</td>'
            html += f'</tr>'
        
        html += '''
        </table>
    </div>
    
    <div class="section">
        <h2>5. IEC 61000 标准符合性</h2>
        <table>
            <tr><th>参数</th><th>符合性</th></tr>
            <tr>
                <td>THD (限值 8%)</td>
                <td class="''' + ('compliant' if report_data['compliance']['thd_compliant'] else 'non-compliant') + '''">
                    ''' + ('合格' if report_data['compliance']['thd_compliant'] else '不合格') + '''
                </td>
            </tr>
        </table>
    </div>
    
    <div class="footer">
        <p>本报告按照 IEC 61000-4-7 / IEC 61000-4-15 标准生成</p>
    </div>
</body>
</html>'''
        
        return html
    
    def export_json(self, report_data=None):
        if report_data is None:
            report_data = self.report_data
        return json.dumps(report_data, indent=2, ensure_ascii=False)
