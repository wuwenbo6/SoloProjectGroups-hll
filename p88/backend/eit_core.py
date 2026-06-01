import numpy as np
from pyeit.mesh import create, set_perm
from pyeit.eit.fem import Forward
from pyeit.eit.utils import eit_scan_lines
from pyeit.eit.greit import GREIT
from pyeit.eit.jac import JAC
from pyeit.mesh.shape import circle
import warnings
warnings.filterwarnings('ignore')


class EITSystem:
    def __init__(self, n_electrodes=16, h0=0.05):
        self.n_electrodes = n_electrodes
        self.h0 = h0
        self.mesh_obj = None
        self.el_pos = None
        self.fwd = None
        self.tri = None
        self.perm = None
        self.mesh_newton = None
        
    def setup_mesh(self):
        self.mesh_obj, self.el_pos = create(self.n_electrodes, h0=self.h0, fd=circle)
        self.tri = self.mesh_obj['element']
        self.perm = self.mesh_obj['perm']
        self.fwd = Forward(self.mesh_obj, self.el_pos)
        
    def generate_boundary_voltage(self, anomaly=None):
        if self.mesh_obj is None:
            self.setup_mesh()
            
        if anomaly is not None:
            mesh_new = set_perm(self.mesh_obj, anomaly)
            self.mesh_newton = mesh_new
        else:
            mesh_new = self.mesh_obj
            
        ex_mat = eit_scan_lines(self.n_electrodes, 1)
        fwd = Forward(mesh_new, self.el_pos)
        v1 = fwd.solve_eit(ex_mat=ex_mat, parser='std')
        return v1.v
    
    def simulate_anomaly(self, anomaly):
        if self.mesh_obj is None:
            self.setup_mesh()
            
        mesh_new = set_perm(self.mesh_obj, anomaly)
        self.mesh_newton = mesh_new
        
        ex_mat = eit_scan_lines(self.n_electrodes, 1)
        fwd1 = Forward(self.mesh_obj, self.el_pos)
        fwd2 = Forward(mesh_new, self.el_pos)
        
        v0 = fwd1.solve_eit(ex_mat=ex_mat, parser='std')
        v1 = fwd2.solve_eit(ex_mat=ex_mat, parser='std')
        
        return v0.v, v1.v
    
    def reconstruct_greit(self, v0, v1):
        if self.mesh_obj is None:
            self.setup_mesh()
            
        ex_mat = eit_scan_lines(self.n_electrodes, 1)
        eit = GREIT(self.mesh_obj, self.el_pos, ex_mat=ex_mat, step=1, parser='std')
        eit.setup(p=0.50, lamb=0.01, n=self.n_electrodes)
        ds = eit.solve(v1, v0, normalize=False)
        
        return ds
    
    def reconstruct_gauss_newton(self, v0, v1, max_iter=10):
        if self.mesh_obj is None:
            self.setup_mesh()
            
        ex_mat = eit_scan_lines(self.n_electrodes, 1)
        eit = JAC(self.mesh_obj, self.el_pos, ex_mat=ex_mat, step=1, parser='std')
        eit.setup(p=0.50, lamb=0.01, method='lm')
        ds = eit.gn(v1 - v0, lamb_decay=0.1, lamb_min=1e-5, maxiter=max_iter, verbose=False)
        
        return ds
    
    def get_mesh_data(self):
        if self.mesh_obj is None:
            self.setup_mesh()
            
        return {
            'nodes': self.mesh_obj['node'].tolist(),
            'elements': self.tri.tolist(),
            'perm': self.perm.tolist(),
            'el_pos': self.el_pos.tolist()
        }
    
    def interpolate_to_3d(self, ds_2d, grid_size=32):
        if self.mesh_obj is None:
            self.setup_mesh()
            
        nodes = self.mesh_obj['node']
        x_min, x_max = nodes[:, 0].min(), nodes[:, 0].max()
        y_min, y_max = nodes[:, 1].min(), nodes[:, 1].max()
        
        grid_x = np.linspace(x_min, x_max, grid_size)
        grid_y = np.linspace(y_min, y_max, grid_size)
        grid_z = np.linspace(-0.5, 0.5, grid_size)
        
        X, Y, Z = np.meshgrid(grid_x, grid_y, grid_z, indexing='ij')
        
        from scipy.interpolate import griddata
        points = nodes
        values = ds_2d
        
        ds_2d_grid = griddata(points, values, (X[:, :, 0], Y[:, :, 0]), method='cubic', fill_value=0)
        
        sigma = 0.15
        z_profile = np.exp(-(grid_z ** 2) / (2 * sigma ** 2))
        
        volume = np.zeros((grid_size, grid_size, grid_size))
        for k in range(grid_size):
            volume[:, :, k] = ds_2d_grid * z_profile[k]
            
        return {
            'volume': volume.tolist(),
            'x_coords': grid_x.tolist(),
            'y_coords': grid_y.tolist(),
            'z_coords': grid_z.tolist(),
            'shape': [grid_size, grid_size, grid_size]
        }
    
    def create_sample_anomaly(self):
        return [
            {'x': 0.3, 'y': 0.2, 'd': 0.2, 'perm': 10.0},
            {'x': -0.2, 'y': -0.2, 'd': 0.15, 'perm': 0.1}
        ]


def get_eit_system():
    return EITSystem()
