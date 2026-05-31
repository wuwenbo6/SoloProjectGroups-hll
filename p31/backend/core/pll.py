import numpy as np

class SoftwarePLL:
    def __init__(self, f0=50, fs=1000, kp=100, ki=5000):
        self.f0 = f0
        self.fs = fs
        self.dt = 1.0 / fs
        self.kp = kp
        self.ki = ki
        
        self.theta = 0
        self.integrator = 0
        self.omega = 2 * np.pi * f0
        
        self.min_omega = 2 * np.pi * 45
        self.max_omega = 2 * np.pi * 55
        
        self.phase_error_history = []
        self.estimated_phase_history = []
        self.estimated_freq_history = []
    
    def update(self, input_signal):
        sin_est = np.sin(self.theta)
        cos_est = np.cos(self.theta)
        
        pd_output = input_signal * cos_est
        
        self.integrator += self.ki * pd_output * self.dt
        omega_est = 2 * np.pi * self.f0 + self.kp * pd_output + self.integrator
        
        omega_est = np.clip(omega_est, self.min_omega, self.max_omega)
        
        self.theta += omega_est * self.dt
        self.theta = self.theta % (2 * np.pi)
        
        self.omega = omega_est
        
        self.phase_error_history.append(pd_output)
        self.estimated_phase_history.append(self.theta)
        self.estimated_freq_history.append(omega_est / (2 * np.pi))
        
        return self.theta, omega_est / (2 * np.pi)
    
    def reset(self):
        self.theta = 0
        self.integrator = 0
        self.omega = 2 * np.pi * self.f0
        self.phase_error_history = []
        self.estimated_phase_history = []
        self.estimated_freq_history = []
    
    def get_estimated_phase(self):
        return self.theta
    
    def get_estimated_frequency(self):
        return self.omega / (2 * np.pi)


class ThreePhasePLL:
    def __init__(self, f0=50, fs=1000, kp=150, ki=10000):
        self.f0 = f0
        self.fs = fs
        self.dt = 1.0 / fs
        self.kp = kp
        self.ki = ki
        
        self.theta = 0
        self.integrator = 0
        self.omega = 2 * np.pi * f0
        
        self.min_omega = 2 * np.pi * 45
        self.max_omega = 2 * np.pi * 55
        
        self.lpf_alpha = 0.1
        self.q_filtered = 0
    
    def clark_transform(self, a, b, c):
        alpha = (2/3) * (a - 0.5*b - 0.5*c)
        beta = (2/3) * (np.sqrt(3)/2*b - np.sqrt(3)/2*c)
        return alpha, beta
    
    def park_transform(self, alpha, beta, theta):
        d = alpha * np.cos(theta) + beta * np.sin(theta)
        q = -alpha * np.sin(theta) + beta * np.cos(theta)
        return d, q
    
    def update(self, a, b, c):
        alpha, beta = self.clark_transform(a, b, c)
        d, q = self.park_transform(alpha, beta, self.theta)
        
        self.q_filtered = self.lpf_alpha * q + (1 - self.lpf_alpha) * self.q_filtered
        
        self.integrator += self.ki * self.q_filtered * self.dt
        
        omega_est = 2 * np.pi * self.f0 + self.kp * self.q_filtered + self.integrator
        
        omega_est = np.clip(omega_est, self.min_omega, self.max_omega)
        
        self.theta += omega_est * self.dt
        self.theta = self.theta % (2 * np.pi)
        self.omega = omega_est
        
        return self.theta, omega_est / (2 * np.pi), d, q
    
    def reset(self):
        self.theta = 0
        self.integrator = 0
        self.omega = 2 * np.pi * self.f0
        self.q_filtered = 0
    
    def get_phase(self):
        return self.theta
    
    def get_frequency(self):
        return self.omega / (2 * np.pi)
