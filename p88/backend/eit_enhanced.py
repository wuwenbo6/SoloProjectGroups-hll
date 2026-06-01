import numpy as np
from scipy.interpolate import griddata
from scipy.sparse import lil_matrix, csr_matrix, diags
from scipy.sparse.linalg import spsolve
from scipy.ndimage import gaussian_filter, median_filter
from scipy.signal import medfilt
from collections import deque
import datetime
import warnings
warnings.filterwarnings('ignore')

try:
    import pydicom
    from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
    from pydicom.uid import ExplicitVRLittleEndian, generate_uid
    DICOM_AVAILABLE = True
except ImportError:
    DICOM_AVAILABLE = False


class EnhancedEIT:
    def __init__(self, n_electrodes=16, resolution=64):
        self.n_electrodes = n_electrodes
        self.resolution = resolution
        self.nodes = None
        self.mesh_elements = None
        self.el_pos = None
        self.el_node_idx = None
        self.perm = None
        self.jacobian = None
        
        self.frame_buffer = deque(maxlen=30)
        self.temporal_smooth_alpha = 0.3
        self.last_reconstruction = None
        
        self.electrode_impedance = np.ones(n_electrodes) * 1000
        self.electrode_contact_threshold = 5000
        self.electrode_noise_level = np.zeros(n_electrodes)
        
        self.setup_mesh()
        self.build_triangulation()
        self.compute_jacobian()
        
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
        
    def check_electrode_contact(self, voltage_data):
        contact_status = []
        noise_levels = []
        
        for el in range(self.n_electrodes):
            el_meas_idx = el * (self.n_electrodes - 1)
            el_voltages = voltage_data[el_meas_idx:el_meas_idx + (self.n_electrodes - 1)]
            
            if len(el_voltages) > 0:
                noise = np.std(el_voltages)
                amplitude = np.ptp(el_voltages)
                
                noise_levels.append(noise)
                
                if amplitude < 0.001 or noise > amplitude * 0.5:
                    contact_status.append('poor')
                elif noise > amplitude * 0.2:
                    contact_status.append('fair')
                else:
                    contact_status.append('good')
            else:
                contact_status.append('unknown')
                noise_levels.append(0)
        
        self.electrode_noise_level = np.array(noise_levels)
        
        quality_score = contact_status.count('good') / self.n_electrodes * 100
        
        return {
            'electrode_status': contact_status,
            'noise_levels': noise_levels,
            'quality_score': quality_score,
            'recommendation': self._get_contact_recommendation(contact_status)
        }
        
    def _get_contact_recommendation(self, status):
        poor_electrodes = [i+1 for i, s in enumerate(status) if s == 'poor']
        if poor_electrodes:
            return f"请检查电极: {', '.join(map(str, poor_electrodes))}"
        elif 'fair' in status:
            return "部分电极接触一般，建议调整"
        else:
            return "所有电极接触良好"
    
    def simulate_voltage_with_contact_artifacts(self, anomaly=None, bad_electrodes=None):
        if bad_electrodes is None:
            bad_electrodes = []
            
        v0, v1 = self.forward_solve(anomaly)
        
        for el in bad_electrodes:
            el_meas_idx = el * (self.n_electrodes - 1)
            slice_end = el_meas_idx + (self.n_electrodes - 1)
            if slice_end <= len(v1):
                noise = np.random.randn(self.n_electrodes - 1) * 0.1
                v1[el_meas_idx:slice_end] += noise
                
        return v0, v1
        
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
        
    def temporal_smooth(self, ds):
        if self.last_reconstruction is None:
            self.last_reconstruction = ds
        else:
            ds = self.temporal_smooth_alpha * ds + (1 - self.temporal_smooth_alpha) * self.last_reconstruction
            self.last_reconstruction = ds
        self.frame_buffer.append(ds)
        return ds
        
    def reconstruct_frame(self, v0, v1, method='greit', lamb=0.05, smooth_sigma=0.8, temporal_smooth=True):
        dv, _, _ = self.preprocess_voltage(v0, v1)
        
        if method == 'greit':
            ds = self.tikhonov_reconstruct(dv, lamb=lamb)
        else:
            ds = self.tikhonov_reconstruct(dv, lamb=lamb)
            for _ in range(3):
                ds = 0.7 * ds + 0.3 * self.tikhonov_reconstruct(dv, lamb=lamb*0.8)
        
        ds = self.spatial_filter_greit(ds)
        ds = self.post_process(ds, sigma=smooth_sigma)
        
        if temporal_smooth:
            ds = self.temporal_smooth(ds)
        
        ds = (ds - np.mean(ds)) / (np.std(ds) + 1e-8)
        return ds
        
    def reconstruct_greit(self, v0, v1, lamb=0.05):
        return self.reconstruct_frame(v0, v1, method='greit', lamb=lamb)
        
    def reconstruct_gauss_newton(self, v0, v1, lamb_init=0.1):
        return self.reconstruct_frame(v0, v1, method='gn', lamb=lamb_init)
        
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
            'shape': [grid_size, grid_size, grid_size],
            'volume_array': volume.tolist()
        }
        
    def create_sample_anomaly(self):
        return [
            {'x': 0.3, 'y': 0.2, 'd': 0.2, 'perm': 10.0},
            {'x': -0.2, 'y': -0.2, 'd': 0.15, 'perm': 0.1}
        ]
        
    def generate_dynamic_sequence(self, n_frames=30, anomaly=None):
        if anomaly is None:
            anomaly = self.create_sample_anomaly()
            
        frames = []
        v0, _ = self.forward_solve(None)
        
        for i in range(n_frames):
            phase = i / n_frames * 2 * np.pi
            moving_anomaly = [
                {
                    'x': anomaly[0]['x'] + 0.1 * np.sin(phase),
                    'y': anomaly[0]['y'] + 0.1 * np.cos(phase),
                    'd': anomaly[0]['d'],
                    'perm': anomaly[0]['perm']
                },
                anomaly[1]
            ] if len(anomaly) > 1 else [
                {
                    'x': anomaly[0]['x'] + 0.1 * np.sin(phase),
                    'y': anomaly[0]['y'] + 0.1 * np.cos(phase),
                    'd': anomaly[0]['d'],
                    'perm': anomaly[0]['perm']
                }
            ]
            
            _, v1 = self.forward_solve(moving_anomaly)
            
            if i > 0 and len(frames) > 0:
                v1 = 0.7 * v1 + 0.3 * frames[-1]['v1']
            
            frames.append({
                'frame_index': i,
                'v0': v0.tolist(),
                'v1': v1.tolist(),
                'anomaly': moving_anomaly
            })
        
        return frames
        
    def export_dicom(self, volume_data, filename=None, patient_name="EIT_PATIENT"):
        try:
            volume = np.array(volume_data['volume_array']) if isinstance(volume_data['volume_array'], list) else volume_data['volume_array']
            shape = volume_data['shape']
            
            volume_normalized = ((volume - volume.min()) / (volume.max() - volume.min() + 1e-8) * 4095).astype(np.uint16)
            
            if DICOM_AVAILABLE:
                file_meta = FileMetaDataset()
                file_meta.MediaStorageSOPClassUID = '1.2.840.10008.5.1.4.1.1.2'
                file_meta.MediaStorageSOPInstanceUID = generate_uid()
                file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
                
                ds = FileDataset(filename or f"eit_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.dcm", {}, file_meta=file_meta, preamble=b"\x00" * 128)
                
                ds.PatientName = patient_name
                ds.PatientID = "EIT001"
                ds.PatientBirthDate = "00000000"
                ds.PatientSex = "O"
                
                ds.StudyInstanceUID = generate_uid()
                ds.SeriesInstanceUID = generate_uid()
                ds.SOPInstanceUID = generate_uid()
                
                ds.Modality = "OT"
                ds.SeriesDescription = "EIT Impedance Tomography"
                ds.StudyDescription = "Electrical Impedance Tomography"
                
                ds.Rows = shape[0]
                ds.Columns = shape[1]
                ds.NumberOfFrames = shape[2]
                
                ds.PixelSpacing = [0.1, 0.1]
                ds.SliceThickness = 0.1
                
                ds.SamplesPerPixel = 1
                ds.PhotometricInterpretation = "MONOCHROME2"
                ds.BitsAllocated = 16
                ds.BitsStored = 12
                ds.HighBit = 11
                ds.PixelRepresentation = 0
                
                ds.InstanceNumber = 1
                
                ds.PixelData = volume_normalized.tobytes()
                
                if filename:
                    ds.save_as(filename)
                    return {
                        'success': True,
                        'filename': filename,
                        'shape': shape,
                        'dicom_info': {
                            'patient': patient_name,
                            'modality': 'EIT',
                            'frames': shape[2],
                            'format': 'DICOM'
                        }
                    }
                else:
                    return {
                        'success': True,
                        'dataset': ds,
                        'shape': shape
                    }
            else:
                return self._export_raw_dicom(volume_normalized, shape, filename, patient_name)
                
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def _export_raw_dicom(self, volume_data, shape, filename, patient_name):
        try:
            raw_filename = filename.replace('.dcm', '.raw') if filename else f"eit_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.raw"
            
            volume_data.tofile(raw_filename)
            
            header = {
                'patient_name': patient_name,
                'modality': 'EIT',
                'shape': shape,
                'dtype': 'uint16',
                'bits_stored': 12,
                'pixel_spacing_mm': [1.0, 1.0, 1.0],
                'study_date': datetime.datetime.now().strftime('%Y%m%d'),
                'study_time': datetime.datetime.now().strftime('%H%M%S'),
                'description': 'Electrical Impedance Tomography Raw Data',
                'note': 'Raw format (pydicom not available). Use header info to interpret data.'
            }
            
            import json
            header_filename = raw_filename.replace('.raw', '_header.json')
            with open(header_filename, 'w') as f:
                json.dump(header, f, indent=2)
            
            return {
                'success': True,
                'filename': raw_filename,
                'header_file': header_filename,
                'shape': shape,
                'dicom_info': {
                    'patient': patient_name,
                    'modality': 'EIT',
                    'frames': shape[2],
                    'format': 'RAW'
                }
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }


def get_eit_system():
    return EnhancedEIT()
