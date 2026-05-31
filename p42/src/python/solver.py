import numpy as np
import sys
import os

try:
    from . import shallow_water as _sw
except ImportError:
    import shallow_water as _sw


class ShallowWaterSolverCPP:
    def __init__(self, nx, ny, dx, dy, g=9.81, f=1e-4, dt=0.1, viscosity=100.0):
        self._solver = _sw.ShallowWaterSolver(nx, ny, dx, dy, g, f, dt, viscosity)
    
    def initialize(self, mean_depth, perturbation_amplitude=0.0):
        self._solver.initialize(mean_depth, perturbation_amplitude)
    
    def initialize_gaussian_bump(self, mean_depth, amp, x0, y0, sigma):
        self._solver.initialize_gaussian_bump(mean_depth, amp, x0, y0, sigma)
    
    def step(self):
        self._solver.step()
    
    def run(self, num_steps):
        self._solver.run(num_steps)
    
    @property
    def h(self):
        return self._solver.get_h_np()
    
    @property
    def u(self):
        return self._solver.get_u_np()
    
    @property
    def v(self):
        return self._solver.get_v_np()
    
    @h.setter
    def h(self, value):
        self._solver.set_h_np(np.ascontiguousarray(value, dtype=np.float64))
    
    @u.setter
    def u(self, value):
        self._solver.set_u_np(np.ascontiguousarray(value, dtype=np.float64))
    
    @v.setter
    def v(self, value):
        self._solver.set_v_np(np.ascontiguousarray(value, dtype=np.float64))
    
    @property
    def nx(self):
        return self._solver.nx()
    
    @property
    def ny(self):
        return self._solver.ny()
    
    @property
    def dx(self):
        return self._solver.dx()
    
    @property
    def dy(self):
        return self._solver.dy()
    
    @property
    def dt(self):
        return self._solver.dt()
    
    @property
    def current_step(self):
        return self._solver.current_step()
