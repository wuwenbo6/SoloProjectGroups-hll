import os
import pydicom
import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass, asdict
import uuid


@dataclass
class DicomSliceInfo:
    index: int
    instanceUid: str
    filepath: str
    rows: int
    cols: int
    windowCenter: float
    windowWidth: float
    sliceLocation: float
    imagePositionPatient: Tuple[float, float, float]
    imageOrientationPatient: Tuple[float, float, float, float, float, float]


@dataclass
class DicomSeriesInfo:
    id: str
    patientName: str
    patientId: str
    studyDate: str
    studyInstanceUid: str
    seriesInstanceUid: str
    seriesDescription: str
    modality: str
    slices: List[DicomSliceInfo]
    pixelSpacing: Tuple[float, float]
    sliceThickness: float
    rows: int
    cols: int


class DicomLoader:
    def __init__(self):
        self._pixel_data_cache: Dict[str, np.ndarray] = {}
        self._current_series: Optional[DicomSeriesInfo] = None
        self._current_folder: Optional[str] = None

    def load_series(self, folder_path: str) -> Dict[str, Any]:
        dicom_files = self._find_dicom_files(folder_path)
        if not dicom_files:
            raise ValueError(f"No DICOM files found in {folder_path}")

        slices = []
        for fpath in dicom_files:
            try:
                ds = pydicom.dcmread(fpath, stop_before_pixels=False)
                slices.append(ds)
            except Exception as e:
                print(f"Warning: Could not read {fpath}: {e}")
                continue

        if not slices:
            raise ValueError("No valid DICOM slices could be loaded")

        slices = self._sort_slices(slices)

        first_slice = slices[0]
        pixel_spacing = self._get_pixel_spacing(first_slice)
        slice_thickness = self._get_slice_thickness(first_slice)
        window_center, window_width = self._get_window_level(first_slice)

        series_slices = []
        for i, ds in enumerate(slices):
            wc, ww = self._get_window_level(ds)
            series_slices.append(DicomSliceInfo(
                index=i,
                instanceUid=str(getattr(ds, 'SOPInstanceUID', str(uuid.uuid4()))),
                filepath=ds.filename,
                rows=int(ds.Rows),
                cols=int(ds.Columns),
                windowCenter=wc,
                windowWidth=ww,
                sliceLocation=float(getattr(ds, 'SliceLocation', i * slice_thickness)),
                imagePositionPatient=tuple(float(x) for x in getattr(ds, 'ImagePositionPatient', (0, 0, i * slice_thickness))),
                imageOrientationPatient=tuple(float(x) for x in getattr(ds, 'ImageOrientationPatient', (1, 0, 0, 0, 1, 0))),
            ))
            self._pixel_data_cache[ds.filename] = self._get_pixel_array(ds)

        series_info = DicomSeriesInfo(
            id=str(uuid.uuid4()),
            patientName=str(getattr(first_slice, 'PatientName', 'Unknown')),
            patientId=str(getattr(first_slice, 'PatientID', 'Unknown')),
            studyDate=str(getattr(first_slice, 'StudyDate', '')),
            studyInstanceUid=str(getattr(first_slice, 'StudyInstanceUID', str(uuid.uuid4()))),
            seriesInstanceUid=str(getattr(first_slice, 'SeriesInstanceUID', str(uuid.uuid4()))),
            seriesDescription=str(getattr(first_slice, 'SeriesDescription', 'Unknown')),
            modality=str(getattr(first_slice, 'Modality', 'CT')),
            slices=series_slices,
            pixelSpacing=pixel_spacing,
            sliceThickness=slice_thickness,
            rows=int(first_slice.Rows),
            cols=int(first_slice.Columns),
        )

        self._current_series = series_info
        self._current_folder = folder_path

        return asdict(series_info)

    def get_slice_pixels(self, index: int) -> Optional[np.ndarray]:
        if not self._current_series or index >= len(self._current_series.slices):
            return None
        
        slice_info = self._current_series.slices[index]
        if slice_info.filepath not in self._pixel_data_cache:
            ds = pydicom.dcmread(slice_info.filepath, stop_before_pixels=False)
            self._pixel_data_cache[slice_info.filepath] = self._get_pixel_array(ds)
        
        return self._pixel_data_cache[slice_info.filepath]

    def get_series_info(self) -> Optional[Dict[str, Any]]:
        return asdict(self._current_series) if self._current_series else None

    def clear_cache(self):
        self._pixel_data_cache.clear()
        self._current_series = None
        self._current_folder = None

    def _find_dicom_files(self, folder_path: str) -> List[str]:
        dicom_files = []
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                fpath = os.path.join(root, file)
                if self._is_dicom_file(fpath):
                    dicom_files.append(fpath)
        return sorted(dicom_files)

    def _is_dicom_file(self, filepath: str) -> bool:
        try:
            with open(filepath, 'rb') as f:
                f.seek(128)
                prefix = f.read(4)
                return prefix == b'DICM'
        except:
            return False

    def _sort_slices(self, slices: List[pydicom.Dataset]) -> List[pydicom.Dataset]:
        def get_sort_key(ds):
            if hasattr(ds, 'ImagePositionPatient'):
                return ds.ImagePositionPatient[2]
            if hasattr(ds, 'SliceLocation'):
                return ds.SliceLocation
            if hasattr(ds, 'InstanceNumber'):
                return ds.InstanceNumber
            return 0
        
        return sorted(slices, key=get_sort_key)

    def _get_pixel_spacing(self, ds: pydicom.Dataset) -> Tuple[float, float]:
        if hasattr(ds, 'PixelSpacing'):
            return (float(ds.PixelSpacing[0]), float(ds.PixelSpacing[1]))
        return (1.0, 1.0)

    def _get_slice_thickness(self, ds: pydicom.Dataset) -> float:
        if hasattr(ds, 'SliceThickness'):
            return float(ds.SliceThickness)
        return 1.0

    def _get_window_level(self, ds: pydicom.Dataset) -> Tuple[float, float]:
        if hasattr(ds, 'WindowCenter') and hasattr(ds, 'WindowWidth'):
            wc = ds.WindowCenter
            ww = ds.WindowWidth
            if isinstance(wc, pydicom.multival.MultiValue):
                wc = wc[0]
            if isinstance(ww, pydicom.multival.MultiValue):
                ww = ww[0]
            return (float(wc), float(ww))
        return (0.0, 0.0)

    def _get_pixel_array(self, ds: pydicom.Dataset) -> np.ndarray:
        arr = ds.pixel_array.astype(np.float32)
        
        if hasattr(ds, 'RescaleSlope') and hasattr(ds, 'RescaleIntercept'):
            slope = float(ds.RescaleSlope)
            intercept = float(ds.RescaleIntercept)
            arr = arr * slope + intercept
        
        return arr
