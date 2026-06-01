import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass

@dataclass
class DVHData:
    structure_name: str
    dose_bins: np.ndarray
    volume_bins: np.ndarray
    max_dose: float
    min_dose: float
    mean_dose: float
    volume: float
    dose_units: str = 'Gy'
    volume_units: str = 'cm³'

class DVCalculator:
    def __init__(self, dose_grid: np.ndarray, spacing: Tuple[float, float, float],
                 origin: Tuple[float, float, float]):
        self.dose_grid = dose_grid
        self.spacing = np.array(spacing)
        self.origin = np.array(origin)
        self.voxel_volume = np.prod(self.spacing) / 1000.0
        
        self.nx, self.ny, self.nz = dose_grid.shape
        
        x_coords = self.origin[0] + np.arange(self.nx) * self.spacing[0]
        y_coords = self.origin[1] + np.arange(self.ny) * self.spacing[1]
        z_coords = self.origin[2] + np.arange(self.nz) * self.spacing[2]
        
        self.X, self.Y, self.Z = np.meshgrid(x_coords, y_coords, z_coords, indexing='ij')
    
    def _points_to_voxel_indices(self, points: np.ndarray) -> np.ndarray:
        indices = np.zeros_like(points, dtype=int)
        indices[:, 0] = np.round((points[:, 0] - self.origin[0]) / self.spacing[0]).astype(int)
        indices[:, 1] = np.round((points[:, 1] - self.origin[1]) / self.spacing[1]).astype(int)
        indices[:, 2] = np.round((points[:, 2] - self.origin[2]) / self.spacing[2]).astype(int)
        
        indices[:, 0] = np.clip(indices[:, 0], 0, self.nx - 1)
        indices[:, 1] = np.clip(indices[:, 1], 0, self.ny - 1)
        indices[:, 2] = np.clip(indices[:, 2], 0, self.nz - 1)
        
        return indices
    
    def calculate_dvh_for_contours(self, contours: List[Dict], structure_name: str,
                                    num_bins: int = 100) -> DVHData:
        all_indices = []
        
        for contour in contours:
            points = np.array(contour['points'])
            if len(points) < 3:
                continue
            
            indices = self._points_to_voxel_indices(points)
            
            slice_z = contour.get('slice_z', 0)
            z_idx = int(np.round((slice_z - self.origin[2]) / self.spacing[2]))
            z_idx = np.clip(z_idx, 0, self.nz - 1)
            
            if len(indices) > 0:
                min_i = indices[:, 0].min()
                max_i = indices[:, 0].max()
                min_j = indices[:, 1].min()
                max_j = indices[:, 1].max()
                
                for i in range(min_i, max_i + 1):
                    for j in range(min_j, max_j + 1):
                        x = self.origin[0] + i * self.spacing[0]
                        y = self.origin[1] + j * self.spacing[1]
                        if self._point_in_polygon(x, y, points):
                            all_indices.append((i, j, z_idx))
        
        if not all_indices:
            return self._create_empty_dvh(structure_name)
        
        indices = np.array(all_indices)
        doses = self.dose_grid[indices[:, 0], indices[:, 1], indices[:, 2]]
        
        return self._compute_dvh_from_doses(doses, structure_name, num_bins)
    
    def _point_in_polygon(self, x: float, y: float, polygon: np.ndarray) -> bool:
        n = len(polygon)
        inside = False
        
        j = n - 1
        for i in range(n):
            xi, yi = polygon[i, 0], polygon[i, 1]
            xj, yj = polygon[j, 0], polygon[j, 1]
            
            if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-10) + xi):
                inside = not inside
            j = i
        
        return inside
    
    def calculate_dvh_for_mask(self, mask: np.ndarray, structure_name: str,
                                num_bins: int = 100) -> DVHData:
        doses = self.dose_grid[mask]
        
        if len(doses) == 0:
            return self._create_empty_dvh(structure_name)
        
        return self._compute_dvh_from_doses(doses, structure_name, num_bins)
    
    def calculate_dvh_for_roi_box(self, min_point: Tuple[float, float, float],
                                   max_point: Tuple[float, float, float], structure_name: str,
                                   num_bins: int = 100) -> DVHData:
        min_idx = self._points_to_voxel_indices(np.array([min_point]))[0]
        max_idx = self._points_to_voxel_indices(np.array([max_point]))[0]
        
        roi_doses = self.dose_grid[
            min_idx[0]:max_idx[0]+1,
            min_idx[1]:max_idx[1]+1,
            min_idx[2]:max_idx[2]+1
        ].flatten()
        
        if len(roi_doses) == 0:
            return self._create_empty_dvh(structure_name)
        
        return self._compute_dvh_from_doses(roi_doses, structure_name, num_bins)
    
    def _compute_dvh_from_doses(self, doses: np.ndarray, structure_name: str,
                                  num_bins: int) -> DVHData:
        if len(doses) == 0:
            return self._create_empty_dvh(structure_name)
        
        max_dose = float(doses.max())
        min_dose = float(doses.min())
        mean_dose = float(doses.mean())
        volume = len(doses) * self.voxel_volume
        
        bin_width = max_dose / num_bins if max_dose > 0 else 1.0
        dose_bins = np.arange(0, max_dose + bin_width, bin_width)
        
        volume_bins = np.zeros_like(dose_bins)
        total_voxels = len(doses)
        
        for i, dose in enumerate(dose_bins):
            volume_bins[i] = np.sum(doses >= dose) * self.voxel_volume
        
        return DVHData(
            structure_name=structure_name,
            dose_bins=dose_bins,
            volume_bins=volume_bins,
            max_dose=max_dose,
            min_dose=min_dose,
            mean_dose=mean_dose,
            volume=volume
        )
    
    def _create_empty_dvh(self, structure_name: str) -> DVHData:
        return DVHData(
            structure_name=structure_name,
            dose_bins=np.array([0.0]),
            volume_bins=np.array([0.0]),
            max_dose=0.0,
            min_dose=0.0,
            mean_dose=0.0,
            volume=0.0
        )
    
    def get_dose_metrics(self, dvh: DVHData) -> Dict:
        metrics = {
            'Dmax': dvh.max_dose,
            'Dmin': dvh.min_dose,
            'Dmean': dvh.mean_dose,
            'Volume': dvh.volume,
            'D95': self._get_dose_at_volume(dvh, 95),
            'D90': self._get_dose_at_volume(dvh, 90),
            'D50': self._get_dose_at_volume(dvh, 50),
            'V100': self._get_volume_at_dose(dvh, 1.0),
            'V95': self._get_volume_at_dose(dvh, 0.95),
            'V90': self._get_volume_at_dose(dvh, 0.90),
            'V50': self._get_volume_at_dose(dvh, 0.50),
        }
        return metrics
    
    def _get_dose_at_volume(self, dvh: DVHData, volume_percent: float) -> float:
        if dvh.volume <= 0:
            return 0.0
        
        target_volume = dvh.volume * (volume_percent / 100.0)
        
        for i in range(len(dvh.volume_bins) - 1):
            if dvh.volume_bins[i] >= target_volume >= dvh.volume_bins[i + 1]:
                t = (target_volume - dvh.volume_bins[i]) / (dvh.volume_bins[i + 1] - dvh.volume_bins[i] + 1e-10)
                return dvh.dose_bins[i] + t * (dvh.dose_bins[i + 1] - dvh.dose_bins[i])
        
        return 0.0
    
    def _get_volume_at_dose(self, dvh: DVHData, dose_percent: float) -> float:
        if dvh.max_dose <= 0:
            return 0.0
        
        target_dose = dvh.max_dose * dose_percent
        
        for i in range(len(dvh.dose_bins) - 1):
            if dvh.dose_bins[i] <= target_dose <= dvh.dose_bins[i + 1]:
                t = (target_dose - dvh.dose_bins[i]) / (dvh.dose_bins[i + 1] - dvh.dose_bins[i] + 1e-10)
                volume = dvh.volume_bins[i] + t * (dvh.volume_bins[i + 1] - dvh.volume_bins[i])
                return volume / dvh.volume * 100 if dvh.volume > 0 else 0
        
        return 0.0
