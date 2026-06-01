import numpy as np
from scipy.interpolate import griddata
from scipy.sparse import lil_matrix, csr_matrix, diags
from scipy.sparse.linalg import spsolve, lsqr
from scipy.ndimage import gaussian_filter, median_filter
import warnings
warnings.filterwarnings('ignore')


class ImprovedEIT:
    def __init__(self, n_electrodes=16, resolution=64):
        self.n_electrodes = n_electrodes
        self.resolution = resolution
        self.nodes = None
        self.elements = None
        self.el_pos = None
        self.el_node_idx = None
        self.perm = None
        self.jacobian = None
        self.mesh_elements = None
        
        self.setup_mesh()
        self.build_triangulation()
        
    def setup_mesh(self):
        theta = np.linspace(0, 2*np.pi, self.n_electrodes, endpoint=False)
        r = 0.95
        self.el_pos = np.column_stack([r * np.cos(theta), r * np.sin(theta)])
        
        grid_x = np.linspace(-1, 1, self.resolution)
        grid_y = np.linspace(-1, 1, self.resolution)
        X, Y = np.meshgrid(grid_x, grid_y)
        
        mask = X**2 + Y**2 <= 1
        self.nodes = np.column_stack([X[mask], Y[mask]])
        
        self.el_node_idx = []
        for el_p in self.el_pos:
            dists = np.sum((self.nodes - el_p)**2, axis=1)
            self.el_node_idx.append(np.argmin(dists))
        self.el_node_idx = np.array(self.el_node_idx)
        
        self.perm = np.ones(len(self.nodes))
        
    def build_triangulation(self):
        from scipy.spatial import Delaunay
        tri = Delaunay(self.nodes)
        self.mesh_elements = tri.simplices
        
        center = np.mean(self.nodes[self.mesh_elements], axis=1)
        mask = np.sum(center**2, axis=1) <= 1.05
        self.mesh_elements = self.mesh_elements[mask]
        
    def compute_element_stiffness(self, elem_nodes, perm):
        coords = self.nodes[elem_nodes]
        
        B = np.zeros((3, 2))
        B[0] = coords[1] - coords[2]
        B[1] = coords[2] - coords[0]
        B[2] = coords[0] - coords[1]
        
        area = 0.5 * np.abs(B[0, 0] * B[1, 1] - B[0, 1] * B[1, 0])
        if area < 1e-10:
            return np.zeros((3, 3)), area
        
        B = B / (2 * area)
        
        elem_perm = np.mean(perm[elem_nodes])
        
        Ke = elem_perm * area * (B @ B.T)
        return Ke, area
        
    def build_global_stiffness(self, perm=None):
        if perm is None:
            perm = self.perm
            
        n = len(self.nodes)
        K = lil_matrix((n, n))
        
        for elem in self.mesh_elements:
            Ke, _ = self.compute_element_stiffness(elem, perm)
            for i in range(3):
                for j in range(3):
                    K[elem[i], elem[j]] += Ke[i, j]
                    
        return K.tocsr()
        
    def preprocess_voltage(self, v0, v1):
        v0 = np.array(v0, dtype=np.float64)
        v1 = np.array(v1, dtype=np.float64)
        
        v0_denoised = self.wavelet_denoise(v0)
        v1_denoised = self.wavelet_denoise(v1)
        
        dv = v1_denoised - v0_denoised
        
        dv_normalized = dv / (np.abs(v0_denoised) + 1e-8)
        
        dv_smoothed = gaussian_filter(dv_normalized, sigma=0.5)
        
        return dv_smoothed, v0_denoised, v1_denoised
        
    def wavelet_denoise(self, signal, level=3):
        n = len(signal)
        if n < 4:
            return signal
            
        coeffs = signal.copy()
        for l in range(level):
            step = 2 ** (l + 1)
            half = step // 2
            for i in range(0, n - step + 1, step):
                avg = (coeffs[i] + coeffs[i + half]) / 2
                diff = (coeffs[i] - coeffs[i + half]) / 2
                coeffs[i] = avg
                coeffs[i + half] = diff
                
        threshold = np.std(coeffs[n//2:]) * 0.6745 * np.sqrt(2 * np.log(n))
        coeffs[np.abs(coeffs) < threshold] = 0
        
        for l in range(level-1, -1, -1):
            step = 2 ** (l + 1)
            half = step // 2
            for i in range(0, n - step + 1, step):
                avg = coeffs[i]
                diff = coeffs[i + half]
                coeffs[i] = avg + diff
                coeffs[i + half] = avg - diff
                
        return coeffs
        
    def simulate_voltage_complete(self, perm=None):
        if perm is None:
            perm = self.perm
            
        K = self.build_global_stiffness(perm)
        n = len(self.nodes)
        
        voltages = []
        
        for src in range(self.n_electrodes):
            for sink in range(self.n_electrodes):
                if src == sink:
                    continue
                    
                b = np.zeros(n)
                b[self.el_node_idx[src]] = 1
                b[self.el_node_idx[sink]] = -1
                
                K_mod = K.copy()
                for i in range(n):
                    if K_mod[i, i] == 0:
                        K_mod[i, i] = 1
                
                try:
                    v = spsolve(K_mod, b)
                    voltages.extend(v[self.el_node_idx])
                except:
                    voltages.extend(np.zeros(self.n_electrodes))
                    
        return np.array(voltages)
        
    def forward_solve(self, anomaly=None):
        if anomaly is not None:
            self.set_perm_anomaly(anomaly)
        
        n_meas = self.n_electrodes * (self.n_electrodes - 1)
        v0 = np.zeros(n_meas)
        v1 = np.zeros(n_meas)
        
        meas_idx = 0
        for src in range(self.n_electrodes):
            for sink in range(self.n_electrodes):
                if src == sink:
                    continue
                    
                x_src, y_src = self.el_pos[src]
                x_sink, y_sink = self.el_pos[sink]
                
                for i, (x, y) in enumerate(self.nodes):
                    dist_src = np.sqrt((x - x_src)**2 + (y - y_src)**2)
                    dist_sink = np.sqrt((x - x_sink)**2 + (y - y_sink)**2)
                    
                    if dist_src < 0.01:
                        v0[meas_idx] = 1.0
                    elif dist_sink < 0.01:
                        v0[meas_idx] = -1.0
                    
                meas_idx += 1
        
        v1 = v0.copy()
        
        if anomaly is not None:
            for a in anomaly:
                for i in range(len(v0)):
                    angle_pos = (i / len(v0)) * 2 * np.pi
                    dist_to_anomaly = np.sqrt((np.cos(angle_pos)*0.9 - a['x'])**2 + 
                                              (np.sin(angle_pos)*0.9 - a['y'])**2)
                    influence = np.exp(-dist_to_anomaly**2 / 0.3) * (a['perm'] - 1) * 0.05
                    v1[i] += influence
        
        noise_level = 0.001
        v0 += np.random.randn(len(v0)) * noise_level
        v1 += np.random.randn(len(v1)) * noise_level
                
        return v0, v1
        
    def compute_jacobian(self):
        n_meas = self.n_electrodes * (self.n_electrodes - 1)
        n_elem = len(self.nodes)
        
        J = np.zeros((n_meas, n_elem))
        
        for elem_idx in range(n_elem):
            x, y = self.nodes[elem_idx]
            
            meas_idx = 0
            for src in range(self.n_electrodes):
                for sink in range(self.n_electrodes):
                    if src == sink:
                        continue
                        
                    x_src, y_src = self.el_pos[src]
                    x_sink, y_sink = self.el_pos[sink]
                    
                    dist_src = np.sqrt((x - x_src)**2 + (y - y_src)**2)
                    dist_sink = np.sqrt((x - x_sink)**2 + (y - y_sink)**2)
                    
                    sens_src = np.exp(-dist_src**2 / 0.5)
                    sens_sink = np.exp(-dist_sink**2 / 0.5)
                    
                    J[meas_idx, elem_idx] = (sens_src + sens_sink) * 0.5
                    
                    meas_idx += 1
                    
        self.jacobian = J
        return J
        
    def tikhonov_reconstruct(self, dv, lamb=0.01):
        if self.jacobian is None:
            self.compute_jacobian()
            
        J = self.jacobian
        
        Wd = diags(1.0 / (np.abs(dv) + 1e-6))
        J_weighted = Wd @ J
        dv_weighted = Wd @ dv
        
        L = self.build_smoothness_matrix()
        
        A = J_weighted.T @ J_weighted + lamb * (L.T @ L)
        b = J_weighted.T @ dv_weighted
        
        try:
            ds = np.linalg.solve(A, b)
        except:
            ds = np.linalg.lstsq(A, b, rcond=None)[0]
            
        return ds
        
    def build_smoothness_matrix(self):
        n = len(self.nodes)
        L = lil_matrix((n, n))
        
        for i in range(n):
            neighbors = self._find_neighbors(i, max_dist=0.08)
            L[i, i] = len(neighbors)
            for j in neighbors:
                L[i, j] = -1
                
        return L.tocsr()
        
    def _find_neighbors(self, idx, max_dist=0.05):
        x, y = self.nodes[idx]
        dist = np.sqrt((self.nodes[:, 0] - x)**2 + (self.nodes[:, 1] - y)**2)
        neighbors = np.where((dist > 0) & (dist < max_dist))[0]
        return neighbors
        
    def spatial_filter_greit(self, ds):
        x = self.nodes[:, 0]
        y = self.nodes[:, 1]
        r = np.sqrt(x**2 + y**2)
        
        sigma = 0.15
        weights = np.exp(-r**2 / (2 * sigma**2))
        ds_filtered = ds * weights
        
        ds_smoothed = np.zeros_like(ds)
        for i in range(len(ds)):
            dist = np.sqrt((x - x[i])**2 + (y - y[i])**2)
            kernel = np.exp(-dist**2 / (2 * 0.05**2))
            kernel = kernel / kernel.sum()
            ds_smoothed[i] = np.sum(ds_filtered * kernel)
            
        return ds_smoothed
        
    def post_process(self, ds, sigma=0.8):
        grid_size = int(np.sqrt(len(ds) * 4 / np.pi)) + 1
        grid_x = np.linspace(-1, 1, grid_size)
        grid_y = np.linspace(-1, 1, grid_size)
        X, Y = np.meshgrid(grid_x, grid_y)
        
        mask = X**2 + Y**2 <= 1
        grid_data = np.zeros_like(X)
        
        points = self.nodes
        values = ds
        
        grid_interp = griddata(points, values, (X, Y), method='cubic', fill_value=0)
        
        grid_smoothed = gaussian_filter(grid_interp, sigma=sigma)
        
        ds_smoothed = griddata(
            np.column_stack([X[mask], Y[mask]]),
            grid_smoothed[mask],
            self.nodes,
            method='linear',
            fill_value=0
        )
        
        threshold = np.std(ds_smoothed) * 0.3
        ds_smoothed[np.abs(ds_smoothed) < threshold] *= 0.3
        
        return ds_smoothed
        
    def reconstruct_greit(self, v0, v1, lamb=0.05):
        dv, _, _ = self.preprocess_voltage(v0, v1)
        
        if self.jacobian is None:
            self.compute_jacobian()
            
        ds = self.tikhonov_reconstruct(dv, lamb=lamb)
        
        ds = self.spatial_filter_greit(ds)
        
        ds = self.post_process(ds, sigma=0.7)
        
        ds = (ds - np.mean(ds)) / (np.std(ds) + 1e-8)
        
        return ds
        
    def reconstruct_gauss_newton(self, v0, v1, max_iter=8, lamb_init=0.1):
        dv, v0_clean, v1_clean = self.preprocess_voltage(v0, v1)
        
        if self.jacobian is None:
            self.compute_jacobian()
            
        ds = np.zeros(len(self.nodes))
        lamb = lamb_init
        
        for iteration in range(max_iter):
            ds_updated = self.tikhonov_reconstruct(dv, lamb=lamb)
            ds = 0.6 * ds + 0.4 * ds_updated
            
            lamb *= 0.85
            
            ds = self.post_process(ds, sigma=0.5)
            
        ds = self.spatial_filter_greit(ds)
        ds = self.post_process(ds, sigma=0.8)
        
        ds = (ds - np.mean(ds)) / (np.std(ds) + 1e-8)
        
        return ds
        
    def set_perm_anomaly(self, anomalies):
        self.perm = np.ones(len(self.nodes))
        for anomaly in anomalies:
            x, y, d, p = anomaly['x'], anomaly['y'], anomaly['d'], anomaly['perm']
            dist = np.sqrt((self.nodes[:, 0] - x)**2 + (self.nodes[:, 1] - y)**2)
            self.perm[dist < d/2] = p
            
    def get_mesh_data(self):
        return {
            'nodes': self.nodes.tolist(),
            'elements': self.mesh_elements.tolist() if self.mesh_elements is not None else [],
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
            
        volume = gaussian_filter(volume, sigma=0.5)
            
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
    return ImprovedEIT()
