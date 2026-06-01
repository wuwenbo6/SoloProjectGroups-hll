import pydicom
import numpy as np
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from pydicom.uid import ImplicitVRLittleEndian

class DICOMRTReader:
    def __init__(self):
        self.plan_data = None
        self.structure_data = None
        self.dose_data = None
    
    def load_rt_plan(self, file_path: str) -> Dict:
        ds = pydicom.dcmread(file_path, force=True)
        self.plan_data = ds
        
        beams = []
        if hasattr(ds, 'BeamSequence'):
            for beam in ds.BeamSequence:
                beam_info = {
                    'beam_name': getattr(beam, 'BeamName', 'Unknown'),
                    'beam_number': getattr(beam, 'BeamNumber', 0),
                    'gantry_angle': float(getattr(beam, 'GantryAngle', 0)),
                    'collimator_angle': float(getattr(beam, 'BeamLimitingDeviceAngle', 0)),
                    'couch_angle': float(getattr(beam, 'PatientSupportAngle', 0)),
                    'energy': getattr(beam, 'NominalBeamEnergy', '6MV'),
                    'dose_rate': float(getattr(beam, 'DoseRateSet', 600)),
                    'mu': 0,
                    'field_size_x': 100.0,
                    'field_size_y': 100.0,
                    'sad': float(getattr(beam, 'SourceAxisDistance', 1000)),
                    'isocenter': {'x': 0, 'y': 0, 'z': 0},
                    'control_points': []
                }
                
                if hasattr(beam, 'ControlPointSequence'):
                    cps = beam.ControlPointSequence
                    for i, cp in enumerate(cps):
                        cp_info = {
                            'index': i,
                            'gantry_angle': float(getattr(cp, 'GantryAngle', beam_info['gantry_angle'])),
                            'collimator_angle': float(getattr(cp, 'BeamLimitingDeviceAngle', beam_info['collimator_angle'])),
                            'couch_angle': float(getattr(cp, 'PatientSupportAngle', beam_info['couch_angle'])),
                            'cumulative_mu': float(getattr(cp, 'CumulativeMetersetWeight', 0))
                        }
                        
                        if hasattr(cp, 'IsocenterPosition'):
                            iso = cp.IsocenterPosition
                            beam_info['isocenter'] = {'x': iso[0], 'y': iso[1], 'z': iso[2]}
                        
                        beam_info['control_points'].append(cp_info)
                    
                    if hasattr(beam, 'FinalCumulativeMetersetWeight'):
                        beam_info['mu'] = float(beam.FinalCumulativeMetersetWeight)
                
                beams.append(beam_info)
        
        return {
            'plan_name': getattr(ds, 'RTPlanLabel', 'Unknown Plan'),
            'patient_id': getattr(ds, 'PatientID', 'Unknown'),
            'patient_name': str(getattr(ds, 'PatientName', 'Unknown')),
            'beams': beams
        }
    
    def load_rt_structure(self, file_path: str) -> List[Dict]:
        ds = pydicom.dcmread(file_path, force=True)
        self.structure_data = ds
        
        structures = []
        if hasattr(ds, 'StructureSetROISequence'):
            roi_map = {}
            for roi in ds.StructureSetROISequence:
                roi_number = roi.ROINumber
                roi_map[roi_number] = {
                    'name': getattr(roi, 'ROIName', 'Unknown'),
                    'roi_number': roi_number,
                    'type': getattr(roi, 'ROIGenerationAlgorithm', 'MANUAL'),
                    'color': None,
                    'contours': []
                }
            
            if hasattr(ds, 'ROIContourSequence'):
                for roi_contour in ds.ROIContourSequence:
                    ref_roi_number = roi_contour.ReferencedROINumber
                    if ref_roi_number in roi_map:
                        if hasattr(roi_contour, 'ROIDisplayColor'):
                            color = roi_contour.ROIDisplayColor
                            roi_map[ref_roi_number]['color'] = f'rgb({color[0]},{color[1]},{color[2]})'
                        
                        if hasattr(roi_contour, 'ContourSequence'):
                            for contour in roi_contour.ContourSequence:
                                if hasattr(contour, 'ContourData'):
                                    contour_data = contour.ContourData
                                    points = []
                                    for i in range(0, len(contour_data), 3):
                                        points.append({
                                            'x': contour_data[i],
                                            'y': contour_data[i+1],
                                            'z': contour_data[i+2]
                                        })
                                    
                                    roi_map[ref_roi_number]['contours'].append({
                                        'slice_z': contour_data[2] if len(contour_data) > 2 else 0,
                                        'points': points
                                    })
            
            structures = list(roi_map.values())
        
        return structures
    
    def load_rt_dose(self, file_path: str) -> Dict:
        ds = pydicom.dcmread(file_path, force=True)
        self.dose_data = ds
        
        dose_array = ds.pixel_array.astype(np.float32)
        dose_scaling = float(getattr(ds, 'DoseGridScaling', 1.0))
        dose_array *= dose_scaling
        
        origin = [float(x) for x in getattr(ds, 'ImagePositionPatient', [0, 0, 0])]
        spacing = [float(x) for x in getattr(ds, 'PixelSpacing', [1, 1])]
        slice_thickness = float(getattr(ds, 'SliceThickness', 1.0))
        
        return {
            'data': dose_array,
            'shape': dose_array.shape,
            'spacing': [spacing[0], spacing[1], slice_thickness],
            'origin': origin,
            'max_dose': float(dose_array.max()),
            'min_dose': float(dose_array.min())
        }
