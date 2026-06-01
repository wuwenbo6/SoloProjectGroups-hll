import os
import tempfile
import uuid
from typing import Dict, List, Optional, Tuple
import numpy as np
import pydicom
from pydicom.pixel_data_handlers.util import apply_modality_lut


class DicomReader:
    def __init__(self):
        self._sessions: Dict[str, Dict] = {}

    def upload_files(self, files) -> Tuple[str, Dict]:
        session_id = str(uuid.uuid4())
        temp_dir = tempfile.mkdtemp(prefix=f"dicom_{session_id}_")

        saved_files = []
        for file in files:
            if file.filename == '':
                continue
            file_path = os.path.join(temp_dir, file.filename)
            file.save(file_path)
            saved_files.append(file_path)

        if not saved_files:
            raise ValueError("No valid DICOM files uploaded")

        volume_data, meta = self._load_dicom_series(saved_files)

        self._sessions[session_id] = {
            'volume': volume_data,
            'meta': meta,
            'temp_dir': temp_dir
        }

        return session_id, meta

    def _load_dicom_series(self, file_paths: List[str]) -> Tuple[np.ndarray, Dict]:
        dicom_slices = []
        for path in file_paths:
            try:
                ds = pydicom.dcmread(path, force=True)
                if hasattr(ds, 'pixel_array') and hasattr(ds, 'InstanceNumber'):
                    dicom_slices.append(ds)
            except Exception:
                continue

        if not dicom_slices:
            raise ValueError("No valid DICOM slices found")

        dicom_slices.sort(key=lambda x: float(x.InstanceNumber))

        first_slice = dicom_slices[0]
        rows = int(first_slice.Rows)
        cols = int(first_slice.Columns)
        num_slices = len(dicom_slices)

        volume = np.zeros((num_slices, rows, cols), dtype=np.int16)

        for i, ds in enumerate(dicom_slices):
            pixel_data = ds.pixel_array
            pixel_data = apply_modality_lut(pixel_data, ds)
            volume[i] = pixel_data.astype(np.int16)

        spacing = self._get_spacing(first_slice, dicom_slices)
        origin = self._get_origin(first_slice)
        patient_info = self._get_patient_info(first_slice)

        min_val = float(np.min(volume))
        max_val = float(np.max(volume))

        meta = {
            'dimensions': {
                'x': cols,
                'y': rows,
                'z': num_slices
            },
            'spacing': {
                'x': spacing[0],
                'y': spacing[1],
                'z': spacing[2]
            },
            'origin': {
                'x': origin[0],
                'y': origin[1],
                'z': origin[2]
            },
            'minValue': min_val,
            'maxValue': max_val,
            'patientInfo': patient_info
        }

        return volume, meta

    def _get_spacing(self, first_slice, slices) -> Tuple[float, float, float]:
        pixel_spacing = getattr(first_slice, 'PixelSpacing', [1.0, 1.0])
        x_spacing = float(pixel_spacing[0])
        y_spacing = float(pixel_spacing[1])

        if len(slices) > 1:
            try:
                if hasattr(first_slice, 'SliceThickness') and first_slice.SliceThickness:
                    z_spacing = float(first_slice.SliceThickness)
                else:
                    pos0 = np.array(first_slice.ImagePositionPatient, dtype=float)
                    pos1 = np.array(slices[1].ImagePositionPatient, dtype=float)
                    z_spacing = float(np.linalg.norm(pos1 - pos0))
            except Exception:
                z_spacing = 1.0
        else:
            z_spacing = 1.0

        return (x_spacing, y_spacing, z_spacing)

    def _get_origin(self, first_slice) -> Tuple[float, float, float]:
        try:
            origin = first_slice.ImagePositionPatient
            return (float(origin[0]), float(origin[1]), float(origin[2]))
        except Exception:
            return (0.0, 0.0, 0.0)

    def _get_patient_info(self, first_slice) -> Dict:
        return {
            'name': str(getattr(first_slice, 'PatientName', 'Unknown')),
            'id': str(getattr(first_slice, 'PatientID', 'Unknown')),
            'studyDate': str(getattr(first_slice, 'StudyDate', 'Unknown'))
        }

    def get_volume(self, session_id: str) -> Optional[np.ndarray]:
        session = self._sessions.get(session_id)
        if session:
            return session['volume']
        return None

    def get_meta(self, session_id: str) -> Optional[Dict]:
        session = self._sessions.get(session_id)
        if session:
            return session['meta']
        return None

    def cleanup_session(self, session_id: str):
        session = self._sessions.pop(session_id, None)
        if session and 'temp_dir' in session:
            import shutil
            shutil.rmtree(session['temp_dir'], ignore_errors=True)

    def has_session(self, session_id: str) -> bool:
        return session_id in self._sessions
