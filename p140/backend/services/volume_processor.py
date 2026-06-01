import io
import os
import uuid
from typing import Dict, Optional, Tuple
import numpy as np
from PIL import Image


class VolumeProcessor:
    def __init__(self, export_dir: str = None):
        if export_dir is None:
            export_dir = os.path.join(os.path.dirname(__file__), '..', 'exports')
        self.export_dir = export_dir
        os.makedirs(self.export_dir, exist_ok=True)

    def volume_to_binary(self, volume: np.ndarray, meta: Dict) -> bytes:
        dims = meta['dimensions']
        spacing = meta['spacing']

        header = bytearray()
        header.extend(np.uint32(dims['x']).tobytes())
        header.extend(np.uint32(dims['y']).tobytes())
        header.extend(np.uint32(dims['z']).tobytes())
        header.extend(np.float32(spacing['x']).tobytes())
        header.extend(np.float32(spacing['y']).tobytes())
        header.extend(np.float32(spacing['z']).tobytes())

        volume_bytes = volume.astype(np.uint8, copy=False).tobytes(order='C')

        return bytes(header) + volume_bytes

    def binary_to_volume(self, binary_data: bytes) -> Tuple[np.ndarray, Dict]:
        header_size = 4 * 3 + 4 * 3
        header = binary_data[:header_size]

        dims = {
            'x': int(np.frombuffer(header[0:4], dtype=np.uint32)[0]),
            'y': int(np.frombuffer(header[4:8], dtype=np.uint32)[0]),
            'z': int(np.frombuffer(header[8:12], dtype=np.uint32)[0])
        }
        spacing = {
            'x': float(np.frombuffer(header[12:16], dtype=np.float32)[0]),
            'y': float(np.frombuffer(header[16:20], dtype=np.float32)[0]),
            'z': float(np.frombuffer(header[20:24], dtype=np.float32)[0])
        }

        volume_data = np.frombuffer(binary_data[header_size:], dtype=np.uint16)
        volume = volume_data.reshape((dims['z'], dims['y'], dims['x']), order='C')

        meta = {
            'dimensions': dims,
            'spacing': spacing
        }

        return volume, meta

    def export_slice_image(self, slice_data: np.ndarray, plane: str,
                           index: int, window_width: float = None,
                           window_level: float = None) -> str:
        if window_width is not None and window_level is not None:
            min_val = window_level - window_width / 2
            max_val = window_level + window_width / 2
            normalized = np.clip(slice_data, min_val, max_val)
            normalized = (normalized - min_val) / (max_val - min_val) * 255.0
        else:
            min_val = np.min(slice_data)
            max_val = np.max(slice_data)
            if max_val - min_val < 1e-6:
                normalized = np.zeros_like(slice_data, dtype=np.float32)
            else:
                normalized = (slice_data - min_val) / (max_val - min_val) * 255.0

        normalized = np.clip(normalized, 0, 255).astype(np.uint8)

        img = Image.fromarray(normalized, mode='L')
        img = img.transpose(Image.FLIP_TOP_BOTTOM)

        filename = f"{plane}_slice_{index}_{uuid.uuid4().hex[:8]}.png"
        filepath = os.path.join(self.export_dir, filename)
        img.save(filepath, format='PNG')

        return filename

    def export_rgb_image(self, rgb_data: np.ndarray, prefix: str = "render") -> str:
        img = Image.fromarray(rgb_data, mode='RGB')
        img = img.transpose(Image.FLIP_TOP_BOTTOM)

        filename = f"{prefix}_{uuid.uuid4().hex[:12]}.png"
        filepath = os.path.join(self.export_dir, filename)
        img.save(filepath, format='PNG')

        return filename

    def export_slice_from_volume(self, volume: np.ndarray, meta: Dict,
                                 plane: str, index: int,
                                 window_width: float = None,
                                 window_level: float = None) -> Optional[str]:
        from .reconstruction import ReconstructionService
        recon = ReconstructionService()

        try:
            if plane == 'axial':
                slice_data = recon.get_axial_slice(volume, index)
            elif plane == 'sagittal':
                slice_data = recon.get_sagittal_slice(volume, meta, index)
            elif plane == 'coronal':
                slice_data = recon.get_coronal_slice(volume, meta, index)
            else:
                raise ValueError(f"Unknown plane: {plane}")

            return self.export_slice_image(
                slice_data, plane, index, window_width, window_level
            )
        except Exception as e:
            print(f"Error exporting slice: {e}")
            return None

    def apply_colormap(self, data: np.ndarray, colormap: str = 'gray') -> np.ndarray:
        data_norm = (data - np.min(data)) / (np.max(data) - np.min(data) + 1e-8)

        if colormap == 'gray':
            return np.stack([data_norm] * 3, axis=-1)
        elif colormap == 'heat':
            cmap = np.array([
                [0, 0, 1],
                [0, 1, 1],
                [0, 1, 0],
                [1, 1, 0],
                [1, 0, 0]
            ])
            return self._interpolate_colormap(data_norm, cmap)
        elif colormap == 'bone':
            gray = data_norm
            blue = np.clip(data_norm * 1.2 - 0.1, 0, 1)
            return np.stack([gray, gray, blue], axis=-1)
        else:
            return np.stack([data_norm] * 3, axis=-1)

    def _interpolate_colormap(self, data: np.ndarray, cmap: np.ndarray) -> np.ndarray:
        n_colors = cmap.shape[0]
        indices = data * (n_colors - 1)
        idx_low = np.floor(indices).astype(int)
        idx_high = np.ceil(indices).astype(int)
        frac = indices - idx_low

        idx_low = np.clip(idx_low, 0, n_colors - 1)
        idx_high = np.clip(idx_high, 0, n_colors - 1)

        color_low = cmap[idx_low]
        color_high = cmap[idx_high]
        frac = frac[..., np.newaxis]

        return color_low * (1 - frac) + color_high * frac

    def create_thumbnail(self, image_data: np.ndarray, max_size: int = 256) -> np.ndarray:
        h, w = image_data.shape[:2]
        scale = min(max_size / h, max_size / w)

        if scale < 1.0:
            new_h = int(h * scale)
            new_w = int(w * scale)
            from scipy import ndimage
            if image_data.ndim == 2:
                return ndimage.zoom(image_data, (new_h / h, new_w / w), order=1)
            else:
                return ndimage.zoom(image_data, (new_h / h, new_w / w, 1), order=1)
        return image_data

    def get_export_path(self, filename: str) -> str:
        return os.path.join(self.export_dir, filename)

    def cleanup_old_exports(self, max_age_hours: int = 24):
        import time
        now = time.time()
        cutoff = now - max_age_hours * 3600

        for filename in os.listdir(self.export_dir):
            filepath = os.path.join(self.export_dir, filename)
            if os.path.isfile(filepath):
                mtime = os.path.getmtime(filepath)
                if mtime < cutoff:
                    os.remove(filepath)
