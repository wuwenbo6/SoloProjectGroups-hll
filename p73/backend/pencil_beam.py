import numpy as np
from scipy.ndimage import gaussian_filter
from typing import List, Dict, Tuple, Optional
import math

class PencilBeamAlgorithm:
    def __init__(self, grid_size: Tuple[int, int, int] = (100, 100, 100),
                 spacing: Tuple[float, float, float] = (2.0, 2.0, 2.0),
                 origin: Tuple[float, float, float] = (-100.0, -100.0, -100.0)):
        self.grid_size = grid_size
        self.spacing = spacing
        self.origin = origin
        self.dose_grid = None
        
        self._initialize_grid()
    
    def _initialize_grid(self):
        self.dose_grid = np.zeros(self.grid_size, dtype=np.float32)
    
    def _get_grid_coordinates(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        x = np.arange(self.grid_size[0]) * self.spacing[0] + self.origin[0]
        y = np.arange(self.grid_size[1]) * self.spacing[1] + self.origin[1]
        z = np.arange(self.grid_size[2]) * self.spacing[2] + self.origin[2]
        return np.meshgrid(x, y, z, indexing='ij')
    
    def calculate_dose(self, beams: List[Dict]) -> Dict:
        self._initialize_grid()
        
        for beam in beams:
            self._add_beam_dose(beam)
        
        return {
            'data': self.dose_grid,
            'shape': self.dose_grid.shape,
            'spacing': list(self.spacing),
            'origin': list(self.origin),
            'max_dose': float(self.dose_grid.max()),
            'min_dose': float(self.dose_grid.min())
        }
    
    def _add_beam_dose(self, beam: Dict):
        gantry_angle = math.radians(beam.get('gantry_angle', 0))
        couch_angle = math.radians(beam.get('couch_angle', 0))
        collimator_angle = math.radians(beam.get('collimator_angle', 0))
        
        isocenter = beam.get('isocenter', {'x': 0, 'y': 0, 'z': 0})
        iso_x, iso_y, iso_z = isocenter['x'], isocenter['y'], isocenter['z']
        
        sad = beam.get('sad', 1000.0)
        mu = beam.get('mu', 100.0)
        field_size_x = beam.get('field_size_x', 100.0)
        field_size_y = beam.get('field_size_y', 100.0)
        
        X, Y, Z = self._get_grid_coordinates()
        
        X_rel = X - iso_x
        Y_rel = Y - iso_y
        Z_rel = Z - iso_z
        
        source_dir = self._get_beam_direction(gantry_angle, couch_angle)
        
        depth = -(X_rel * source_dir[0] + Y_rel * source_dir[1] + Z_rel * source_dir[2])
        
        depth = np.maximum(depth, 0)
        
        proj_x, proj_y = self._project_to_beam_eye_view(
            X_rel, Y_rel, Z_rel, source_dir, collimator_angle
        )
        
        in_field = (np.abs(proj_x) <= field_size_x / 2) & (np.abs(proj_y) <= field_size_y / 2)
        
        dose = np.zeros_like(depth)
        
        dose_in_field = self._calculate_pdd(depth[in_field])
        dose_in_field *= self._calculate_profile(proj_x[in_field], proj_y[in_field], 
                                                 field_size_x, field_size_y)
        
        dose[in_field] = dose_in_field
        
        sigma_lateral = 5.0 + depth * 0.01
        dose = gaussian_filter(dose, sigma=1.0)
        
        dose *= (mu / 100.0) * 1.0
        
        self.dose_grid += dose
    
    def _get_beam_direction(self, gantry_angle: float, couch_angle: float) -> np.ndarray:
        dir_x = -math.sin(gantry_angle) * math.cos(couch_angle)
        dir_y = math.sin(couch_angle)
        dir_z = -math.cos(gantry_angle) * math.cos(couch_angle)
        return np.array([dir_x, dir_y, dir_z])
    
    def _project_to_beam_eye_view(self, X: np.ndarray, Y: np.ndarray, Z: np.ndarray,
                                   beam_dir: np.ndarray, collimator_angle: float) -> Tuple[np.ndarray, np.ndarray]:
        beam_dir = beam_dir / np.linalg.norm(beam_dir)
        
        up_vec = np.array([0, 1, 0])
        if np.abs(np.dot(beam_dir, up_vec)) > 0.9:
            up_vec = np.array([1, 0, 0])
        
        x_axis = np.cross(up_vec, beam_dir)
        x_axis = x_axis / np.linalg.norm(x_axis)
        y_axis = np.cross(beam_dir, x_axis)
        y_axis = y_axis / np.linalg.norm(y_axis)
        
        cos_c = math.cos(collimator_angle)
        sin_c = math.sin(collimator_angle)
        x_axis_rot = x_axis * cos_c - y_axis * sin_c
        y_axis_rot = x_axis * sin_c + y_axis * cos_c
        
        proj_x = X * x_axis_rot[0] + Y * x_axis_rot[1] + Z * x_axis_rot[2]
        proj_y = X * y_axis_rot[0] + Y * y_axis_rot[1] + Z * y_axis_rot[2]
        
        return proj_x, proj_y
    
    def _calculate_pdd(self, depth: np.ndarray) -> np.ndarray:
        d_max = 15.0
        
        pdd = np.zeros_like(depth)
        
        build_up = depth < d_max
        pdd[build_up] = (1 - np.exp(-depth[build_up] / 2.0))
        
        beyond = depth >= d_max
        attenuation = np.exp(-(depth[beyond] - d_max) / 200.0)
        inverse_square = (1000.0 / (1000.0 + depth[beyond])) ** 2
        pdd[beyond] = attenuation * inverse_square
        
        pdd = pdd / pdd.max() if pdd.max() > 0 else pdd
        
        return pdd
    
    def _calculate_profile(self, x: np.ndarray, y: np.ndarray, 
                           field_x: float, field_y: float) -> np.ndarray:
        sigma_penumbra = 5.0
        
        profile_x = 0.5 * (1 + np.tanh((field_x/2 - np.abs(x)) / sigma_penumbra))
        profile_y = 0.5 * (1 + np.tanh((field_y/2 - np.abs(y)) / sigma_penumbra))
        
        return profile_x * profile_y
    
    def get_iso_dose_surfaces(self, levels: List[float]) -> List[Dict]:
        surfaces = []
        for level in sorted(levels, reverse=True):
            threshold = level * self.dose_grid.max()
            mask = self.dose_grid >= threshold
            
            surface = {
                'level': level,
                'threshold': float(threshold),
                'mask': mask
            }
            surfaces.append(surface)
        
        return surfaces
    
    def get_slice(self, axis: str, index: int) -> Dict:
        if axis == 'x':
            data = self.dose_grid[index, :, :]
        elif axis == 'y':
            data = self.dose_grid[:, index, :]
        elif axis == 'z':
            data = self.dose_grid[:, :, index]
        else:
            raise ValueError(f"Invalid axis: {axis}")
        
        return {
            'data': data.tolist(),
            'shape': list(data.shape),
            'axis': axis,
            'index': index
        }
