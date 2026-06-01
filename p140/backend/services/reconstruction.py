from typing import Dict, Tuple
import numpy as np
from scipy import ndimage
import SimpleITK as sitk


class ReconstructionService:
    def __init__(self):
        pass

    def get_axial_slice(self, volume: np.ndarray, index: int,
                        window_width: float = None, window_level: float = None) -> np.ndarray:
        z_size = volume.shape[0]
        index = max(0, min(index, z_size - 1))
        slice_data = volume[index, :, :]
        return self._apply_window(slice_data, window_width, window_level)

    def get_sagittal_slice(self, volume: np.ndarray, meta: Dict, index: int,
                           window_width: float = None, window_level: float = None) -> np.ndarray:
        x_size = volume.shape[2]
        index = max(0, min(index, x_size - 1))
        slice_data = volume[:, :, index]
        slice_data = self._resample_isotropic(slice_data, meta, 'sagittal')
        return self._apply_window(slice_data, window_width, window_level)

    def get_coronal_slice(self, volume: np.ndarray, meta: Dict, index: int,
                          window_width: float = None, window_level: float = None) -> np.ndarray:
        y_size = volume.shape[1]
        index = max(0, min(index, y_size - 1))
        slice_data = volume[:, index, :]
        slice_data = self._resample_isotropic(slice_data, meta, 'coronal')
        return self._apply_window(slice_data, window_width, window_level)

    def _resample_isotropic(self, slice_data: np.ndarray, meta: Dict, plane: str) -> np.ndarray:
        spacing = meta['spacing']

        if plane == 'sagittal':
            input_spacing = (spacing['z'], spacing['y'])
        elif plane == 'coronal':
            input_spacing = (spacing['z'], spacing['x'])
        else:
            return slice_data

        min_spacing = min(input_spacing)
        if abs(input_spacing[0] - input_spacing[1]) < 0.01:
            return slice_data

        sitk_image = sitk.GetImageFromArray(slice_data.astype(np.float32))
        sitk_image.SetSpacing((input_spacing[1], input_spacing[0]))

        original_size = sitk_image.GetSize()
        new_size = [
            int(round(original_size[0] * input_spacing[1] / min_spacing)),
            int(round(original_size[1] * input_spacing[0] / min_spacing))
        ]

        resampler = sitk.ResampleImageFilter()
        resampler.SetOutputSpacing((min_spacing, min_spacing))
        resampler.SetSize(new_size)
        resampler.SetOutputDirection(sitk_image.GetDirection())
        resampler.SetOutputOrigin(sitk_image.GetOrigin())
        resampler.SetTransform(sitk.Transform())
        resampler.SetDefaultPixelValue(float(np.min(slice_data)))
        resampler.SetInterpolator(sitk.sitkBSpline)

        resampled_image = resampler.Execute(sitk_image)
        resampled_array = sitk.GetArrayFromImage(resampled_image).astype(slice_data.dtype)

        return resampled_array

    def resample_volume_isotropic(self, volume: np.ndarray, meta: Dict) -> Tuple[np.ndarray, Dict]:
        spacing = meta['spacing']
        dims = meta['dimensions']

        min_spacing = min(spacing['x'], spacing['y'], spacing['z'])

        new_spacing = {
            'x': min_spacing,
            'y': min_spacing,
            'z': min_spacing
        }

        new_dims = {
            'x': int(round(dims['x'] * spacing['x'] / min_spacing)),
            'y': int(round(dims['y'] * spacing['y'] / min_spacing)),
            'z': int(round(dims['z'] * spacing['z'] / min_spacing))
        }

        sitk_image = sitk.GetImageFromArray(volume.astype(np.float32))
        sitk_image.SetSpacing((spacing['x'], spacing['y'], spacing['z']))
        sitk_image.SetOrigin((meta['origin']['x'], meta['origin']['y'], meta['origin']['z']))

        original_size = sitk_image.GetSize()
        target_spacing = (min_spacing, min_spacing, min_spacing)
        new_size = [
            int(round(original_size[0] * spacing['x'] / min_spacing)),
            int(round(original_size[1] * spacing['y'] / min_spacing)),
            int(round(original_size[2] * spacing['z'] / min_spacing))
        ]

        resampler = sitk.ResampleImageFilter()
        resampler.SetOutputSpacing(target_spacing)
        resampler.SetSize(new_size)
        resampler.SetOutputDirection(sitk_image.GetDirection())
        resampler.SetOutputOrigin(sitk_image.GetOrigin())
        resampler.SetTransform(sitk.Transform())
        resampler.SetDefaultPixelValue(float(np.min(volume)))
        resampler.SetInterpolator(sitk.sitkBSpline)

        resampled_image = resampler.Execute(sitk_image)
        resampled = sitk.GetArrayFromImage(resampled_image).astype(np.int16)

        new_meta = meta.copy()
        new_meta['dimensions'] = new_dims
        new_meta['spacing'] = new_spacing

        return resampled, new_meta

    def resample_volume_sitk(self, volume: np.ndarray, meta: Dict,
                             target_spacing: Tuple[float, float, float] = None) -> Tuple[np.ndarray, Dict]:
        spacing = meta['spacing']
        dims = meta['dimensions']

        sitk_image = sitk.GetImageFromArray(volume.astype(np.float32))
        sitk_image.SetSpacing((spacing['x'], spacing['y'], spacing['z']))
        sitk_image.SetOrigin((meta['origin']['x'], meta['origin']['y'], meta['origin']['z']))

        if target_spacing is None:
            min_spacing = min(spacing['x'], spacing['y'], spacing['z'])
            target_spacing = (min_spacing, min_spacing, min_spacing)

        original_size = sitk_image.GetSize()
        new_size = [
            int(round(original_size[0] * spacing['x'] / target_spacing[0])),
            int(round(original_size[1] * spacing['y'] / target_spacing[1])),
            int(round(original_size[2] * spacing['z'] / target_spacing[2]))
        ]

        resampler = sitk.ResampleImageFilter()
        resampler.SetOutputSpacing(target_spacing)
        resampler.SetSize(new_size)
        resampler.SetOutputDirection(sitk_image.GetDirection())
        resampler.SetOutputOrigin(sitk_image.GetOrigin())
        resampler.SetTransform(sitk.Transform())
        resampler.SetDefaultPixelValue(float(np.min(volume)))
        resampler.SetInterpolator(sitk.sitkLinear)

        resampled_image = resampler.Execute(sitk_image)
        resampled_array = sitk.GetArrayFromImage(resampled_image).astype(np.int16)

        new_meta = meta.copy()
        new_meta['dimensions'] = {
            'x': new_size[0],
            'y': new_size[1],
            'z': new_size[2]
        }
        new_meta['spacing'] = {
            'x': target_spacing[0],
            'y': target_spacing[1],
            'z': target_spacing[2]
        }

        return resampled_array, new_meta

    def get_multi_planar_reconstruction(self, volume: np.ndarray, meta: Dict,
                                        axial_idx: int = None, sagittal_idx: int = None,
                                        coronal_idx: int = None,
                                        window_width: float = None, window_level: float = None) -> Dict:
        dims = meta['dimensions']

        if axial_idx is None:
            axial_idx = dims['z'] // 2
        if sagittal_idx is None:
            sagittal_idx = dims['x'] // 2
        if coronal_idx is None:
            coronal_idx = dims['y'] // 2

        axial = self.get_axial_slice(volume, axial_idx, window_width, window_level)
        sagittal = self.get_sagittal_slice(volume, meta, sagittal_idx, window_width, window_level)
        coronal = self.get_coronal_slice(volume, meta, coronal_idx, window_width, window_level)

        axial_255 = self._normalize_to_uint8(axial, window_width, window_level)
        sagittal_255 = self._normalize_to_uint8(sagittal, window_width, window_level)
        coronal_255 = self._normalize_to_uint8(coronal, window_width, window_level)

        return {
            'axial': {
                'data': axial_255.tobytes(),
                'width': axial_255.shape[1],
                'height': axial_255.shape[0],
                'index': axial_idx
            },
            'sagittal': {
                'data': sagittal_255.tobytes(),
                'width': sagittal_255.shape[1],
                'height': sagittal_255.shape[0],
                'index': sagittal_idx
            },
            'coronal': {
                'data': coronal_255.tobytes(),
                'width': coronal_255.shape[1],
                'height': coronal_255.shape[0],
                'index': coronal_idx
            }
        }

    def _apply_window(self, data: np.ndarray, window_width: float = None,
                      window_level: float = None) -> np.ndarray:
        if window_width is None or window_level is None:
            return data

        min_val = window_level - window_width / 2
        max_val = window_level + window_width / 2

        windowed = np.clip(data, min_val, max_val)
        return windowed

    def _normalize_to_uint8(self, data: np.ndarray, window_width: float = None,
                            window_level: float = None) -> np.ndarray:
        if window_width is not None and window_level is not None:
            min_val = window_level - window_width / 2
            max_val = window_level + window_width / 2
        else:
            min_val = np.min(data)
            max_val = np.max(data)

        if max_val - min_val < 1e-6:
            return np.zeros_like(data, dtype=np.uint8)

        normalized = (data - min_val) / (max_val - min_val) * 255.0
        normalized = np.clip(normalized, 0, 255)
        return normalized.astype(np.uint8)

    def normalize_volume_for_texture(self, volume: np.ndarray, meta: Dict) -> np.ndarray:
        min_val = meta['minValue']
        max_val = meta['maxValue']

        range_val = max_val - min_val
        if range_val < 1e-6:
            return np.zeros_like(volume, dtype=np.uint8)

        normalized = (volume.astype(np.float32) - min_val) / range_val * 255.0
        normalized = np.clip(normalized, 0, 255)
        return normalized.astype(np.uint8)

    def apply_window_to_volume(self, volume: np.ndarray, meta: Dict,
                               window_width: float, window_level: float) -> np.ndarray:
        min_val = window_level - window_width / 2
        max_val = window_level + window_width / 2

        windowed = np.clip(volume, min_val, max_val)
        normalized = (windowed - min_val) / (max_val - min_val) * 255.0
        normalized = np.clip(normalized, 0, 255)
        return normalized.astype(np.uint8)
