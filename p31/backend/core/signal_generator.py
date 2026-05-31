import numpy as np

class ThreePhaseSignalGenerator:
    def __init__(self, fs=1000, f0=50, amplitude=220*np.sqrt(2)):
        self.fs = fs
        self.f0 = f0
        self.amplitude = amplitude
        self.phase = 0
        self.noise_level = 0.01
        
    def generate_sample(self, t, harmonics=None, phase_offset=0):
        if harmonics is None:
            harmonics = {3: 0.05, 5: 0.03, 7: 0.02}
        
        signal = self.amplitude * np.sin(2 * np.pi * self.f0 * t + phase_offset)
        
        for h_order, h_amp in harmonics.items():
            signal += self.amplitude * h_amp * np.sin(2 * np.pi * self.f0 * h_order * t + phase_offset)
        
        signal += np.random.normal(0, self.amplitude * self.noise_level)
        
        return signal
    
    def generate_three_phase(self, duration=1.0, harmonics=None):
        n_samples = int(duration * self.fs)
        t = np.arange(n_samples) / self.fs
        
        phase_a = np.zeros(n_samples)
        phase_b = np.zeros(n_samples)
        phase_c = np.zeros(n_samples)
        
        for i in range(n_samples):
            phase_a[i] = self.generate_sample(t[i], harmonics, 0)
            phase_b[i] = self.generate_sample(t[i], harmonics, -2*np.pi/3)
            phase_c[i] = self.generate_sample(t[i], harmonics, 2*np.pi/3)
        
        return t, phase_a, phase_b, phase_c
    
    def get_instantaneous_three_phase(self, t):
        phase_a = self.generate_sample(t, None, 0)
        phase_b = self.generate_sample(t, None, -2*np.pi/3)
        phase_c = self.generate_sample(t, None, 2*np.pi/3)
        return phase_a, phase_b, phase_c
    
    def generate_frequency_sweep(self, duration=5.0, f_start=49.5, f_end=50.5, transition_time=2.5):
        n_samples = int(duration * self.fs)
        t = np.arange(n_samples) / self.fs
        
        phase_a = np.zeros(n_samples)
        phase_b = np.zeros(n_samples)
        phase_c = np.zeros(n_samples)
        
        phase = 0
        
        for i in range(n_samples):
            if t[i] < transition_time:
                current_freq = f_start
            else:
                current_freq = f_end
            
            phase += 2 * np.pi * current_freq * (1.0 / self.fs)
            
            harmonics = {3: 0.05, 5: 0.03, 7: 0.02}
            
            signal_a = self.amplitude * np.sin(phase)
            signal_b = self.amplitude * np.sin(phase - 2*np.pi/3)
            signal_c = self.amplitude * np.sin(phase + 2*np.pi/3)
            
            for h_order, h_amp in harmonics.items():
                signal_a += self.amplitude * h_amp * np.sin(h_order * phase)
                signal_b += self.amplitude * h_amp * np.sin(h_order * phase - 2*np.pi/3)
                signal_c += self.amplitude * h_amp * np.sin(h_order * phase + 2*np.pi/3)
            
            signal_a += np.random.normal(0, self.amplitude * self.noise_level)
            signal_b += np.random.normal(0, self.amplitude * self.noise_level)
            signal_c += np.random.normal(0, self.amplitude * self.noise_level)
            
            phase_a[i] = signal_a
            phase_b[i] = signal_b
            phase_c[i] = signal_c
        
        return t, phase_a, phase_b, phase_c
