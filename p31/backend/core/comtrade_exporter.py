import os
import struct
from datetime import datetime
import numpy as np

class ComtradeExporter:
    def __init__(self, fs=1000, station_name="PowerMonitor", device_id="PMU-001"):
        self.fs = fs
        self.station_name = station_name
        self.device_id = device_id
        self.trigger_time = None
        self.start_time = None
    
    def export_ascii(self, filename, t, phase_a, phase_b, phase_c):
        base_name = os.path.splitext(filename)[0]
        self._write_cfg(base_name + '.cfg', t, phase_a, phase_b, phase_c)
        self._write_dat_ascii(base_name + '.dat', t, phase_a, phase_b, phase_c)
        return base_name + '.cfg', base_name + '.dat'
    
    def export_binary(self, filename, t, phase_a, phase_b, phase_c):
        base_name = os.path.splitext(filename)[0]
        self._write_cfg(base_name + '.cfg', t, phase_a, phase_b, phase_c, file_type='BINARY')
        self._write_dat_binary(base_name + '.dat', t, phase_a, phase_b, phase_c)
        return base_name + '.cfg', base_name + '.dat'
    
    def _write_cfg(self, filename, t, phase_a, phase_b, phase_c, file_type='ASCII'):
        n_samples = len(t)
        duration = t[-1] - t[0] if n_samples > 1 else 1.0
        
        start_time = datetime.now()
        trigger_time = start_time
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(f"{self.station_name},{self.device_id},2013\n")
            f.write("3,3A\n")
            f.write("1,Va,Phase A Voltage,V,1,220,0,0,0,0\n")
            f.write("2,Vb,Phase B Voltage,V,1,220,0,0,0,0\n")
            f.write("3,Vc,Phase C Voltage,V,1,220,0,0,0,0\n")
            f.write("0\n")
            f.write("1\n")
            f.write(f"{self.fs},{n_samples}\n")
            f.write(f"{start_time.strftime('%d/%m/%Y %H:%M:%S.%f')[:-3]}\n")
            f.write(f"{trigger_time.strftime('%d/%m/%Y %H:%M:%S.%f')[:-3]}\n")
            f.write(f"{file_type}\n")
            f.write("1.0\n")
            f.write("0\n")
            f.write("0\n")
    
    def _write_dat_ascii(self, filename, t, phase_a, phase_b, phase_c):
        with open(filename, 'w', encoding='utf-8') as f:
            for i in range(len(t)):
                timestamp = int(t[i] * self.fs)
                val_a = int(phase_a[i] * 1000)
                val_b = int(phase_b[i] * 1000)
                val_c = int(phase_c[i] * 1000)
                f.write(f"{i+1},{timestamp},{val_a},{val_b},{val_c}\n")
    
    def _write_dat_binary(self, filename, t, phase_a, phase_b, phase_c):
        with open(filename, 'wb') as f:
            for i in range(len(t)):
                data = struct.pack('>I', i + 1)
                f.write(data)
                timestamp = int(t[i] * self.fs)
                data = struct.pack('>I', timestamp)
                f.write(data)
                val_a = int(phase_a[i] * 1000)
                val_b = int(phase_b[i] * 1000)
                val_c = int(phase_c[i] * 1000)
                data = struct.pack('>hhh', val_a, val_b, val_c)
                f.write(data)
    
    def export_to_memory(self, t, phase_a, phase_b, phase_c):
        base_name = "/tmp/comtrade_export"
        cfg_file, dat_file = self.export_ascii(base_name, t, phase_a, phase_b, phase_c)
        
        cfg_content = ""
        dat_content = ""
        
        with open(cfg_file, 'r', encoding='utf-8') as f:
            cfg_content = f.read()
        with open(dat_file, 'r', encoding='utf-8') as f:
            dat_content = f.read()
        
        os.remove(cfg_file)
        os.remove(dat_file)
        
        return cfg_content, dat_content
