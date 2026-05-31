import numpy as np


class ShallowWaterSolverPurePython:
    def __init__(self, nx, ny, dx, dy, g=9.81, f=1e-4, dt=0.1, viscosity=100.0):
        self.nx = nx
        self.ny = ny
        self.dx = dx
        self.dy = dy
        self.g = g
        self.f = f
        self.dt = dt
        self.viscosity = viscosity
        self.current_step = 0
        
        self.h = np.zeros((ny, nx), dtype=np.float64)
        self.u = np.zeros((ny, nx), dtype=np.float64)
        self.v = np.zeros((ny, nx), dtype=np.float64)
        self.h_new = np.zeros((ny, nx), dtype=np.float64)
        self.u_new = np.zeros((ny, nx), dtype=np.float64)
        self.v_new = np.zeros((ny, nx), dtype=np.float64)
    
    def initialize(self, mean_depth, perturbation_amplitude=0.0):
        self.current_step = 0
        self.h[:] = mean_depth
        self.u[:] = 0.0
        self.v[:] = 0.0
    
    def initialize_gaussian_bump(self, mean_depth, amp, x0, y0, sigma):
        self.initialize(mean_depth)
        x = np.arange(self.nx) * self.dx
        y = np.arange(self.ny) * self.dy
        X, Y = np.meshgrid(x, y)
        r2 = (X - x0)**2 + (Y - y0)**2
        self.h = mean_depth + amp * np.exp(-r2 / (2.0 * sigma**2))
    
    def _get_h(self, i, j):
        i = np.clip(i, 0, self.nx - 1)
        j = np.clip(j, 0, self.ny - 1)
        return self.h[j, i]
    
    def _get_u(self, i, j):
        i = np.clip(i, 0, self.nx - 1)
        j = np.clip(j, 0, self.ny - 1)
        return self.u[j, i]
    
    def _get_v(self, i, j):
        i = np.clip(i, 0, self.nx - 1)
        j = np.clip(j, 0, self.ny - 1)
        return self.v[j, i]
    
    def compute_tendencies(self):
        dx_inv = 1.0 / self.dx
        dy_inv = 1.0 / self.dy
        dx2_inv = 1.0 / (self.dx * self.dx)
        dy2_inv = 1.0 / (self.dy * self.dy)
        
        for j in range(1, self.ny - 1):
            for i in range(1, self.nx - 1):
                h = self.h[j, i]
                u = self.u[j, i]
                v = self.v[j, i]
                
                h_x = (self.h[j, i + 1] - self.h[j, i - 1]) * 0.5 * dx_inv
                h_y = (self.h[j + 1, i] - self.h[j - 1, i]) * 0.5 * dy_inv
                
                hu = h * u
                hv = h * v
                hu_ip = self.h[j, i + 1] * self.u[j, i + 1]
                hu_im = self.h[j, i - 1] * self.u[j, i - 1]
                hv_jp = self.h[j + 1, i] * self.v[j + 1, i]
                hv_jm = self.h[j - 1, i] * self.v[j - 1, i]
                
                hu_x = (hu_ip - hu_im) * 0.5 * dx_inv
                hv_y = (hv_jp - hv_jm) * 0.5 * dy_inv
                
                u_x = (self.u[j, i + 1] - self.u[j, i - 1]) * 0.5 * dx_inv
                u_y = (self.u[j + 1, i] - self.u[j - 1, i]) * 0.5 * dy_inv
                v_x = (self.v[j, i + 1] - self.v[j, i - 1]) * 0.5 * dx_inv
                v_y = (self.v[j + 1, i] - self.v[j - 1, i]) * 0.5 * dy_inv
                
                h_new = h - self.dt * (hu_x + hv_y)
                u_new = u - self.dt * (u * u_x + v * u_y + self.g * h_x - self.f * v)
                v_new = v - self.dt * (u * v_x + v * v_y + self.g * h_y + self.f * u)
                
                if self.viscosity > 0.0:
                    h_lap = (self.h[j, i + 1] + self.h[j, i - 1] - 2.0 * h) * dx2_inv + \
                            (self.h[j + 1, i] + self.h[j - 1, i] - 2.0 * h) * dy2_inv
                    u_lap = (self.u[j, i + 1] + self.u[j, i - 1] - 2.0 * u) * dx2_inv + \
                            (self.u[j + 1, i] + self.u[j - 1, i] - 2.0 * u) * dy2_inv
                    v_lap = (self.v[j, i + 1] + self.v[j, i - 1] - 2.0 * v) * dx2_inv + \
                            (self.v[j + 1, i] + self.v[j - 1, i] - 2.0 * v) * dy2_inv
                    
                    h_new += self.dt * self.viscosity * h_lap
                    u_new += self.dt * self.viscosity * u_lap
                    v_new += self.dt * self.viscosity * v_lap
                
                self.h_new[j, i] = h_new
                self.u_new[j, i] = u_new
                self.v_new[j, i] = v_new
    
    def apply_boundary_conditions(self):
        self.h_new[0, :] = self.h_new[1, :]
        self.h_new[-1, :] = self.h_new[-2, :]
        self.h_new[:, 0] = self.h_new[:, 1]
        self.h_new[:, -1] = self.h_new[:, -2]
        
        self.u_new[0, :] = self.u_new[1, :]
        self.u_new[-1, :] = self.u_new[-2, :]
        self.u_new[:, 0] = 0.0
        self.u_new[:, -1] = 0.0
        
        self.v_new[0, :] = 0.0
        self.v_new[-1, :] = 0.0
        self.v_new[:, 0] = self.v_new[:, 1]
        self.v_new[:, -1] = self.v_new[:, -2]
    
    def step(self):
        self.h_new[:] = self.h
        self.u_new[:] = self.u
        self.v_new[:] = self.v
        
        self.compute_tendencies()
        self.apply_boundary_conditions()
        
        self.h_new[self.h_new < 0.1] = 0.1
        self.u_new[self.h_new < 0.11] = 0.0
        self.v_new[self.h_new < 0.11] = 0.0
        
        self.h[:] = self.h_new
        self.u[:] = self.u_new
        self.v[:] = self.v_new
        
        self.current_step += 1
    
    def run(self, num_steps):
        for _ in range(num_steps):
            self.step()


class ShallowWaterSolverNumpy:
    def __init__(self, nx, ny, dx, dy, g=9.81, f=1e-4, dt=0.1, viscosity=100.0):
        self.nx = nx
        self.ny = ny
        self.dx = dx
        self.dy = dy
        self.g = g
        self.f = f
        self.dt = dt
        self.viscosity = viscosity
        self.current_step = 0
        
        self.h = np.zeros((ny, nx), dtype=np.float64)
        self.u = np.zeros((ny, nx), dtype=np.float64)
        self.v = np.zeros((ny, nx), dtype=np.float64)
    
    def initialize(self, mean_depth, perturbation_amplitude=0.0):
        self.current_step = 0
        self.h[:] = mean_depth
        self.u[:] = 0.0
        self.v[:] = 0.0
    
    def initialize_gaussian_bump(self, mean_depth, amp, x0, y0, sigma):
        self.initialize(mean_depth)
        x = np.arange(self.nx) * self.dx
        y = np.arange(self.ny) * self.dy
        X, Y = np.meshgrid(x, y)
        r2 = (X - x0)**2 + (Y - y0)**2
        self.h = mean_depth + amp * np.exp(-r2 / (2.0 * sigma**2))
    
    def step(self):
        dx_inv = 1.0 / self.dx
        dy_inv = 1.0 / self.dy
        dx2_inv = 1.0 / (self.dx * self.dx)
        dy2_inv = 1.0 / (self.dy * self.dy)
        
        h = self.h
        u = self.u
        v = self.v
        
        h_x = np.zeros_like(h)
        h_y = np.zeros_like(h)
        hu_x = np.zeros_like(h)
        hv_y = np.zeros_like(h)
        u_x = np.zeros_like(h)
        u_y = np.zeros_like(h)
        v_x = np.zeros_like(h)
        v_y = np.zeros_like(h)
        
        h_x[:, 1:-1] = (h[:, 2:] - h[:, :-2]) * 0.5 * dx_inv
        h_y[1:-1, :] = (h[2:, :] - h[:-2, :]) * 0.5 * dy_inv
        
        hu = h * u
        hv = h * v
        hu_x[:, 1:-1] = (hu[:, 2:] - hu[:, :-2]) * 0.5 * dx_inv
        hv_y[1:-1, :] = (hv[2:, :] - hv[:-2, :]) * 0.5 * dy_inv
        
        u_x[:, 1:-1] = (u[:, 2:] - u[:, :-2]) * 0.5 * dx_inv
        u_y[1:-1, :] = (u[2:, :] - u[:-2, :]) * 0.5 * dy_inv
        v_x[:, 1:-1] = (v[:, 2:] - v[:, :-2]) * 0.5 * dx_inv
        v_y[1:-1, :] = (v[2:, :] - v[:-2, :]) * 0.5 * dy_inv
        
        h_new = h - self.dt * (hu_x + hv_y)
        u_new = u - self.dt * (u * u_x + v * u_y + self.g * h_x - self.f * v)
        v_new = v - self.dt * (u * v_x + v * v_y + self.g * h_y + self.f * u)
        
        if self.viscosity > 0.0:
            h_lap = np.zeros_like(h)
            u_lap = np.zeros_like(h)
            v_lap = np.zeros_like(h)
            
            h_lap[:, 1:-1] += (h[:, 2:] + h[:, :-2] - 2.0 * h[:, 1:-1]) * dx2_inv
            h_lap[1:-1, :] += (h[2:, :] + h[:-2, :] - 2.0 * h[1:-1, :]) * dy2_inv
            
            u_lap[:, 1:-1] += (u[:, 2:] + u[:, :-2] - 2.0 * u[:, 1:-1]) * dx2_inv
            u_lap[1:-1, :] += (u[2:, :] + u[:-2, :] - 2.0 * u[1:-1, :]) * dy2_inv
            
            v_lap[:, 1:-1] += (v[:, 2:] + v[:, :-2] - 2.0 * v[:, 1:-1]) * dx2_inv
            v_lap[1:-1, :] += (v[2:, :] + v[:-2, :] - 2.0 * v[1:-1, :]) * dy2_inv
            
            h_new += self.dt * self.viscosity * h_lap
            u_new += self.dt * self.viscosity * u_lap
            v_new += self.dt * self.viscosity * v_lap
        
        h_new[0, :] = h_new[1, :]
        h_new[-1, :] = h_new[-2, :]
        h_new[:, 0] = h_new[:, 1]
        h_new[:, -1] = h_new[:, -2]
        
        u_new[0, :] = u_new[1, :]
        u_new[-1, :] = u_new[-2, :]
        u_new[:, 0] = 0.0
        u_new[:, -1] = 0.0
        
        v_new[0, :] = 0.0
        v_new[-1, :] = 0.0
        v_new[:, 0] = v_new[:, 1]
        v_new[:, -1] = v_new[:, -2]
        
        h_new[h_new < 0.1] = 0.1
        u_new[h_new < 0.11] = 0.0
        v_new[h_new < 0.11] = 0.0
        
        self.h[:] = h_new
        self.u[:] = u_new
        self.v[:] = v_new
        
        self.current_step += 1
    
    def run(self, num_steps):
        for _ in range(num_steps):
            self.step()
