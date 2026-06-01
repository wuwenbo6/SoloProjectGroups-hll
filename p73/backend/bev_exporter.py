import numpy as np
from typing import List, Dict, Tuple, Optional
import math
from scipy.ndimage import map_coordinates

class BeamEyeView:
    def __init__(self, dose_grid: np.ndarray, spacing: Tuple[float, float, float],
                 origin: Tuple[float, float, float]):
        self.dose_grid = dose_grid
        self.spacing = np.array(spacing, dtype=np.float32)
        self.origin = np.array(origin, dtype=np.float32)
        
        self.nx, self.ny, self.nz = dose_grid.shape
        
        x = self.origin[0] + np.arange(self.nx) * self.spacing[0]
        y = self.origin[1] + np.arange(self.ny) * self.spacing[1]
        z = self.origin[2] + np.arange(self.nz) * self.spacing[2]
        
        self.X, self.Y, self.Z = np.meshgrid(x, y, z, indexing='ij')
    
    def compute_bev(self, beam: Dict, view_size: int = 200, 
                    view_spacing: float = 1.0) -> Dict:
        gantry_angle = math.radians(beam.get('gantry_angle', 0))
        couch_angle = math.radians(beam.get('couch_angle', 0))
        collimator_angle = math.radians(beam.get('collimator_angle', 0))
        
        isocenter = np.array([
            beam.get('isocenter', {}).get('x', 0),
            beam.get('isocenter', {}).get('y', 0),
            beam.get('isocenter', {}).get('z', 0)
        ], dtype=np.float32)
        
        field_size_x = beam.get('field_size_x', 100.0)
        field_size_y = beam.get('field_size_y', 100.0)
        
        beam_dir = self._get_beam_direction(gantry_angle, couch_angle)
        
        view_half_size = (view_size * view_spacing) / 2.0
        
        u_coords = np.linspace(-view_half_size, view_half_size, view_size)
        v_coords = np.linspace(-view_half_size, view_half_size, view_size)
        U, V = np.meshgrid(u_coords, v_coords)
        
        up_vec = np.array([0, 1, 0], dtype=np.float32)
        if np.abs(np.dot(beam_dir, up_vec)) > 0.9:
            up_vec = np.array([1, 0, 0], dtype=np.float32)
        
        u_axis = np.cross(up_vec, beam_dir)
        u_axis = u_axis / np.linalg.norm(u_axis)
        v_axis = np.cross(beam_dir, u_axis)
        v_axis = v_axis / np.linalg.norm(v_axis)
        
        cos_c = math.cos(collimator_angle)
        sin_c = math.sin(collimator_angle)
        u_axis_rot = u_axis * cos_c - v_axis * sin_c
        v_axis_rot = u_axis * sin_c + v_axis * cos_c
        
        points = np.zeros((view_size, view_size, 3), dtype=np.float32)
        points[..., 0] = isocenter[0] + U * u_axis_rot[0] + V * v_axis_rot[0]
        points[..., 1] = isocenter[1] + U * u_axis_rot[1] + V * v_axis_rot[1]
        points[..., 2] = isocenter[2] + U * u_axis_rot[2] + V * v_axis_rot[2]
        
        indices = np.zeros_like(points, dtype=np.float32)
        indices[..., 0] = (points[..., 0] - self.origin[0]) / self.spacing[0]
        indices[..., 1] = (points[..., 1] - self.origin[1]) / self.spacing[1]
        indices[..., 2] = (points[..., 2] - self.origin[2]) / self.spacing[2]
        
        bev_dose = map_coordinates(
            self.dose_grid,
            [indices[..., 0].flatten(), indices[..., 1].flatten(), indices[..., 2].flatten()],
            order=1,
            mode='constant',
            cval=0.0
        ).reshape(view_size, view_size)
        
        jaw_x1 = -field_size_x / 2.0
        jaw_x2 = field_size_x / 2.0
        jaw_y1 = -field_size_y / 2.0
        jaw_y2 = field_size_y / 2.0
        
        return {
            'bev_image': bev_dose.tolist(),
            'shape': [view_size, view_size],
            'spacing': [view_spacing, view_spacing],
            'field_size': [field_size_x, field_size_y],
            'jaw_positions': [jaw_x1, jaw_x2, jaw_y1, jaw_y2],
            'isocenter': isocenter.tolist(),
            'gantry_angle': math.degrees(gantry_angle),
            'collimator_angle': math.degrees(collimator_angle),
            'max_dose': float(bev_dose.max()),
            'min_dose': float(bev_dose.min())
        }
    
    def _get_beam_direction(self, gantry_angle: float, couch_angle: float) -> np.ndarray:
        dir_x = -math.sin(gantry_angle) * math.cos(couch_angle)
        dir_y = math.sin(couch_angle)
        dir_z = -math.cos(gantry_angle) * math.cos(couch_angle)
        return np.array([dir_x, dir_y, dir_z], dtype=np.float32)


class RTDoseExporter:
    def __init__(self, dose_grid: np.ndarray, spacing: Tuple[float, float, float],
                 origin: Tuple[float, float, float]):
        self.dose_grid = dose_grid
        self.spacing = spacing
        self.origin = origin
    
    def export_to_dicom(self, output_path: str, patient_info: Dict = None,
                         plan_info: Dict = None) -> str:
        try:
            import pydicom
            from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
            from pydicom.uid import generate_uid, ExplicitVRLittleEndian, RTDoseStorage
            from datetime import datetime, date
            import os
            
            dose_scaling = 1e-5
            scaled_dose = (self.dose_grid / dose_scaling).astype(np.uint16)
            
            file_meta = FileMetaDataset()
            file_meta.MediaStorageSOPClassUID = RTDoseStorage
            file_meta.MediaStorageSOPInstanceUID = generate_uid()
            file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
            
            ds = FileDataset(output_path, {}, file_meta=file_meta, preamble=b"\x00" * 128)
            
            ds.SOPClassUID = RTDoseStorage
            ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
            
            ds.PatientName = patient_info.get('name', 'Anonymous^Patient') if patient_info else 'Anonymous^Patient'
            ds.PatientID = patient_info.get('id', 'UNKNOWN') if patient_info else 'UNKNOWN'
            ds.PatientBirthDate = ''
            ds.PatientSex = ''
            
            ds.StudyInstanceUID = generate_uid()
            ds.SeriesInstanceUID = generate_uid()
            ds.StudyDate = date.today().strftime('%Y%m%d')
            ds.StudyTime = datetime.now().strftime('%H%M%S')
            ds.Modality = 'RTDOSE'
            ds.SeriesDescription = plan_info.get('name', 'Dose Distribution') if plan_info else 'Dose Distribution'
            
            ds.Rows = self.dose_grid.shape[1]
            ds.Columns = self.dose_grid.shape[2]
            ds.NumberOfFrames = self.dose_grid.shape[0]
            
            ds.PixelSpacing = [self.spacing[1], self.spacing[2]]
            ds.SliceThickness = self.spacing[0]
            
            ds.ImagePositionPatient = [str(self.origin[0]), str(self.origin[1]), str(self.origin[2])]
            ds.ImageOrientationPatient = ['1', '0', '0', '0', '1', '0']
            
            ds.SamplesPerPixel = 1
            ds.PhotometricInterpretation = 'MONOCHROME2'
            ds.BitsAllocated = 16
            ds.BitsStored = 16
            ds.HighBit = 15
            ds.PixelRepresentation = 0
            
            ds.DoseUnits = 'GY'
            ds.DoseType = 'PHYSICAL'
            ds.DoseSummationType = 'PLAN'
            ds.DoseGridScaling = str(dose_scaling)
            
            pixel_data = scaled_dose.tobytes()
            ds.PixelData = pixel_data
            
            ds.FrameOfReferenceUID = generate_uid()
            ds.PositionReferenceIndicator = ''
            
            pydicom.dcmwrite(output_path, ds)
            
            return output_path
            
        except ImportError:
            raise ImportError("pydicom is required for DICOM export")
    
    def export_to_numpy(self, output_path: str) -> str:
        np.savez(
            output_path,
            dose_grid=self.dose_grid,
            spacing=self.spacing,
            origin=self.origin
        )
        return output_path
    
    def export_to_raw(self, output_path: str) -> str:
        header = {
            'shape': [int(s) for s in self.dose_grid.shape],
            'spacing': [float(s) for s in self.spacing],
            'origin': [float(o) for o in self.origin],
            'dtype': str(self.dose_grid.dtype)
        }
        
        self.dose_grid.tofile(output_path)
        
        import json
        with open(output_path + '.json', 'w') as f:
            json.dump(header, f, indent=2)
        
        return output_path
