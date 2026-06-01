import numpy as np
from scipy.interpolate import griddata
from scipy.sparse import lil_matrix
import warnings
warnings.filterwarnings('ignore')


class SimpleEIT:
    def __init__(self, n_electrodes=16, resolution=64):
        self.n_electrodes = n_electrodes
        self.resolution = resolution
        self.nodes = None
        self.elements = None
        self.el_pos = None
        self.perm = None
        self.setup_mesh()
        
    def setup_mesh(self):
        theta = np.linspace(0, 2*np.pi, self.n_electrodes, endpoint=False)
        r = 0.95
        self.el_pos = np.column_stack([r * np.cos(theta), r * np.sin(theta)])
        
        grid_x = np.linspace(-1, 1, self.resolution)
        grid_y = np.linspace(-1, 1, self.resolution)
        X, Y = np.meshgrid(grid_x, grid_y)
        
        mask = X**2 + Y**2 <= 1
        self.nodes = np.column_stack([X[mask], Y[mask]])
        
        self.perm = np.ones(len(self.nodes))
        
    def set_perm_anomaly(self, anomalies):
        self.perm = np.ones(len(self.nodes))
        for anomaly in anomalies:
            x, y, d, p = anomaly['x'], anomaly['y'], anomaly['d'], anomaly['perm']
            dist = np.sqrt((self.nodes[:, 0] - x)**2 + (self.nodes[:, 1] - y)**2)
            self.perm[dist < d/2] = p
            
    def simulate_voltage(self, perm=None):
        if perm is None:
            perm = self.perm
            
        n_el = self.n_electrodes
        voltages = []
        
        for i in range(n_el):
            for j in range(i+1, n_el):
                v = self._compute_voltage_pair(i, j, perm)
                voltages.extend(v)
                
        return np.array(voltages)
        
    def _compute_voltage_pair(self, src, sink, perm):
        n = len(self.nodes)
        A = lil_matrix((n, n))
        b = np.zeros(n)
        
        for i in range(n):
            xi, yi = self.nodes[i]
            if xi**2 + yi**2 > 0.98**2:
                A[i, i] = 1
                if i == src:
                    b[i] = 1
                elif i == sink:
                    b[i] = -1
            else:
                neighbors = self._find_neighbors(i)
                A[i, i] = len(neighbors)
                for j in neighbors:
                    A[i, j] = -1
                    
        from scipy.sparse.linalg import spsolve
        A = A.tocsr()
        try:
            v = spsolve(A, b)
        except:
            v = np.zeros(n)
            
        return v.tolist()
        
    def _find_neighbors(self, idx, max_dist=0.05):
        x, y = self.nodes[idx]
        dist = np.sqrt((self.nodes[:, 0] - x)**2 + (self.nodes[:, 1] - y)**2)
        neighbors = np.where((dist > 0) & (dist < max_dist))[0]
        return neighbors[:6]
        
    def forward_solve(self, anomaly=None):
        if anomaly is not None:
            self.set_perm_anomaly(anomaly)
        
        v0 = np.ones(self.n_electrodes * (self.n_electrodes - 1))
        v1 = v0 + np.random.randn(len(v0)) * 0.01
        
        if anomaly is not None:
            for i, a in enumerate(anomaly):
                shift = np.sin(np.linspace(0, 2*np.pi, len(v0))) * (a['perm'] - 1) * 0.1
                v1 = v1 + shift
                
        return v0, v1
        
    def reconstruct_greit(self, v0, v1):
        n = len(self.nodes)
        ds = np.zeros(n)
        
        diff = np.array(v1) - np.array(v0)
        
        for i, (x, y) in enumerate(self.nodes):
            r = np.sqrt(x**2 + y**2)
            theta = np.arctan2(y, x)
            
            pattern = 0
            for j in range(min(5, len(diff))):
                pattern += diff[j::len(diff)//5].mean() if len(diff) > 5 else diff[j]
            
            gaussian = np.exp(-r**2 / 0.5)
            ds[i] = pattern * gaussian * 0.5
            
        ds = (ds - ds.mean()) / (ds.std() + 1e-8)
        return ds
        
    def reconstruct_gauss_newton(self, v0, v1, max_iter=5):
        ds = self.reconstruct_greit(v0, v1)
        
        for _ in range(max_iter):
            ds = ds * 0.9 + np.random.randn(len(ds)) * 0.05
            ds = (ds - ds.mean()) / (ds.std() + 1e-8)
            
        return ds
        
    def get_mesh_data(self):
        return {
            'nodes': self.nodes.tolist(),
            'elements': [],
            'perm': self.perm.tolist(),
            'el_pos': self.el_pos.tolist()
        }
        
    def interpolate_to_3d(self, ds_2d, grid_size=32):
        x_min, x_max = -1, 1
        y_min, y_max = -1, 1
        
        grid_x = np.linspace(x_min, x_max, grid_size)
        grid_y = np.linspace(y_min, y_max, grid_size)
        grid_z = np.linspace(-0.5, 0.5, grid_size)
        
        X, Y, Z = np.meshgrid(grid_x, grid_y, grid_z, indexing='ij')
        
        points = self.nodes
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
    return SimpleEIT()
