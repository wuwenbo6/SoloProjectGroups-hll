from typing import Dict, Tuple, Optional
import numpy as np
import SimpleITK as sitk


class FusionService:
    def __init__(self):
        pass

    def register_volumes(self,
                         fixed_volume: np.ndarray, fixed_meta: Dict,
                         moving_volume: np.ndarray, moving_meta: Dict,
                         method: str = 'affine') -> Tuple[np.ndarray, Dict]:
        fixed_image = sitk.GetImageFromArray(fixed_volume.astype(np.float32))
        fixed_image.SetSpacing((fixed_meta['spacing']['x'],
                                fixed_meta['spacing']['y'],
                                fixed_meta['spacing']['z']))
        fixed_image.SetOrigin((fixed_meta['origin']['x'],
                               fixed_meta['origin']['y'],
                               fixed_meta['origin']['z']))

        moving_image = sitk.GetImageFromArray(moving_volume.astype(np.float32))
        moving_image.SetSpacing((moving_meta['spacing']['x'],
                                 moving_meta['spacing']['y'],
                                 moving_meta['spacing']['z']))
        moving_image.SetOrigin((moving_meta['origin']['x'],
                                moving_meta['origin']['y'],
                                moving_meta['origin']['z']))

        if method == 'rigid':
            transform = sitk.Euler3DTransform()
        elif method == 'affine':
            transform = sitk.AffineTransform(3)
        else:
            raise ValueError(f"Unknown registration method: {method}")

        registration_method = sitk.ImageRegistrationMethod()

        registration_method.SetMetricAsMattesMutualInformation(numberOfHistogramBins=50)
        registration_method.SetMetricSamplingStrategy(registration_method.RANDOM)
        registration_method.SetMetricSamplingPercentage(0.01)

        registration_method.SetInterpolator(sitk.sitkLinear)

        registration_method.SetOptimizerAsGradientDescent(
            learningRate=1.0,
            numberOfIterations=100,
            convergenceMinimumValue=1e-6,
            convergenceWindowSize=10
        )
        registration_method.SetOptimizerScalesFromPhysicalShift()

        registration_method.SetInitialTransform(transform, inPlace=False)

        try:
            final_transform = registration_method.Execute(
                sitk.Cast(fixed_image, sitk.sitkFloat32),
                sitk.Cast(moving_image, sitk.sitkFloat32)
            )
        except Exception:
            final_transform = sitk.TranslationTransform(3)

        resampler = sitk.ResampleImageFilter()
        resampler.SetReferenceImage(fixed_image)
        resampler.SetTransform(final_transform)
        resampler.SetInterpolator(sitk.sitkBSpline)
        resampler.SetDefaultPixelValue(0)
        resampler.SetOutputPixelType(sitk.sitkFloat32)

        resampled_moving = resampler.Execute(moving_image)
        resampled_array = sitk.GetArrayFromImage(resampled_moving).astype(np.int16)

        new_meta = fixed_meta.copy()
        return resampled_array, new_meta

    def fuse_volumes(self,
                     ct_volume: np.ndarray, ct_meta: Dict,
                     pet_volume: np.ndarray, pet_meta: Dict,
                     blend_mode: str = 'alpha',
                     alpha: float = 0.5,
                     color_map: str = 'hot') -> Tuple[np.ndarray, Dict]:
        if ct_volume.shape != pet_volume.shape:
            target_shape = ct_volume.shape
            pet_resampled = self._resample_volume(
                pet_volume, pet_meta, ct_meta['spacing'], target_shape
            )
        else:
            pet_resampled = pet_volume

        if blend_mode == 'alpha':
            fused = self._alpha_blend(ct_volume, pet_resampled, alpha)
        elif blend_mode == 'checkerboard':
            fused = self._checkerboard_fusion(ct_volume, pet_resampled)
        elif blend_mode == 'color_overlay':
            fused = self._color_overlay(ct_volume, pet_resampled, alpha, color_map)
        elif blend_mode == 'max':
            fused = np.maximum(ct_volume, pet_resampled)
        else:
            fused = ct_volume * (1 - alpha) + pet_resampled * alpha

        return fused.astype(np.int16), ct_meta

    def _alpha_blend(self, ct: np.ndarray, pet: np.ndarray, alpha: float) -> np.ndarray:
        ct_norm = (ct - np.min(ct)) / (np.max(ct) - np.min(ct) + 1e-8)
        pet_norm = (pet - np.min(pet)) / (np.max(pet) - np.min(pet) + 1e-8)

        fused = ct_norm * (1 - alpha) + pet_norm * alpha
        fused = fused * (np.max(ct) - np.min(ct)) + np.min(ct)

        return fused

    def _checkerboard_fusion(self, ct: np.ndarray, pet: np.ndarray,
                             block_size: int = 10) -> np.ndarray:
        mask = np.zeros_like(ct, dtype=bool)
        for i in range(0, ct.shape[0], block_size):
            for j in range(0, ct.shape[1], block_size):
                for k in range(0, ct.shape[2], block_size):
                    if (i // block_size + j // block_size + k // block_size) % 2 == 0:
                        mask[i:i + block_size, j:j + block_size, k:k + block_size] = True

        fused = np.where(mask, ct, pet)
        return fused

    def _color_overlay(self, ct: np.ndarray, pet: np.ndarray,
                       alpha: float, color_map: str) -> np.ndarray:
        ct_norm = (ct - np.min(ct)) / (np.max(ct) - np.min(ct) + 1e-8)

        pet_norm = (pet - np.min(pet)) / (np.max(pet) - np.min(pet) + 1e-8)
        pet_colored = self._apply_color_map(pet_norm, color_map)

        fused_gray = ct_norm * (1 - alpha) + pet_norm * alpha
        fused = fused_gray * (np.max(ct) - np.min(ct)) + np.min(ct)

        return fused

    def _apply_color_map(self, data: np.ndarray, color_map: str) -> np.ndarray:
        if color_map == 'hot':
            r = np.clip(data * 2, 0, 1)
            g = np.clip((data - 0.33) * 2, 0, 1)
            b = np.clip((data - 0.67) * 3, 0, 1)
            return np.stack([r, g, b], axis=-1)
        elif color_map == 'jet':
            r = np.clip(np.sin(data * np.pi), 0, 1)
            g = np.clip(np.sin(data * np.pi + np.pi / 3), 0, 1)
            b = np.clip(np.sin(data * np.pi + 2 * np.pi / 3), 0, 1)
            return np.stack([r, g, b], axis=-1)
        else:
            return np.stack([data, data, data], axis=-1)

    def _resample_volume(self, volume: np.ndarray, src_meta: Dict,
                         target_spacing: Dict, target_shape: Tuple[int, int, int]) -> np.ndarray:
        src_image = sitk.GetImageFromArray(volume.astype(np.float32))
        src_image.SetSpacing((src_meta['spacing']['x'],
                              src_meta['spacing']['y'],
                              src_meta['spacing']['z']))

        resampler = sitk.ResampleImageFilter()
        resampler.SetSize(target_shape[::-1])
        resampler.SetOutputSpacing((target_spacing['x'],
                                    target_spacing['y'],
                                    target_spacing['z']))
        resampler.SetInterpolator(sitk.sitkBSpline)
        resampler.SetDefaultPixelValue(0)

        resampled = resampler.Execute(src_image)
        return sitk.GetArrayFromImage(resampled).astype(np.int16)

    def get_fusion_slice(self,
                         ct_volume: np.ndarray, ct_meta: Dict,
                         pet_volume: np.ndarray, pet_meta: Dict,
                         plane: str, index: int,
                         blend_mode: str = 'alpha',
                         alpha: float = 0.5) -> Dict:
        from .reconstruction import ReconstructionService
        recon = ReconstructionService()

        if plane == 'axial':
            ct_slice = recon.get_axial_slice(ct_volume, index)
            pet_slice = recon.get_axial_slice(pet_volume, index)
        elif plane == 'sagittal':
            ct_slice = recon.get_sagittal_slice(ct_volume, ct_meta, index)
            pet_slice = recon.get_sagittal_slice(pet_volume, pet_meta, index)
        elif plane == 'coronal':
            ct_slice = recon.get_coronal_slice(ct_volume, ct_meta, index)
            pet_slice = recon.get_coronal_slice(pet_volume, pet_meta, index)
        else:
            raise ValueError(f"Unknown plane: {plane}")

        if ct_slice.shape != pet_slice.shape:
            from scipy import ndimage
            zoom_factors = (ct_slice.shape[0] / pet_slice.shape[0],
                            ct_slice.shape[1] / pet_slice.shape[1])
            pet_slice = ndimage.zoom(pet_slice, zoom_factors, order=3)

        ct_norm = (ct_slice - np.min(ct_slice)) / (np.max(ct_slice) - np.min(ct_slice) + 1e-8)
        pet_norm = (pet_slice - np.min(pet_slice)) / (np.max(pet_slice) - np.min(pet_slice) + 1e-8)

        if blend_mode == 'alpha':
            fused_gray = ct_norm * (1 - alpha) + pet_norm * alpha
        elif blend_mode == 'color_overlay':
            fused_rgb = self._create_fused_rgb(ct_norm, pet_norm, alpha)
            fused_uint8 = (fused_rgb * 255).astype(np.uint8)
            return {
                'data': fused_uint8.tobytes(),
                'width': fused_uint8.shape[1],
                'height': fused_uint8.shape[0],
                'channels': 3
            }
        else:
            fused_gray = ct_norm

        fused_uint8 = (fused_gray * 255).astype(np.uint8)
        return {
            'data': fused_uint8.tobytes(),
            'width': fused_uint8.shape[1],
            'height': fused_uint8.shape[0],
            'channels': 1
        }

    def _create_fused_rgb(self, ct_gray: np.ndarray, pet_gray: np.ndarray,
                          alpha: float = 0.5) -> np.ndarray:
        rgb = np.zeros((*ct_gray.shape, 3), dtype=np.float32)

        rgb[..., 0] = ct_gray * (1 - alpha) + pet_gray * alpha
        rgb[..., 1] = ct_gray * (1 - alpha) + np.clip(pet_gray * 0.5, 0, 1) * alpha
        rgb[..., 2] = ct_gray * (1 - alpha)

        return np.clip(rgb, 0, 1)
