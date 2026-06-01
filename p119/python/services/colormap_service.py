import numpy as np
from PIL import Image
import io
import base64
from typing import Tuple


class ColormapService:
    @staticmethod
    def _normalize_pixels(pixels: np.ndarray, window_center: float = None, window_width: float = None) -> np.ndarray:
        if pixels is None or pixels.size == 0:
            return np.zeros((256, 256), dtype=np.uint8)

        if window_center is None or window_width is None or window_width <= 0:
            min_val = np.min(pixels)
            max_val = np.max(pixels)
            if max_val == min_val:
                return np.zeros_like(pixels, dtype=np.uint8)
            normalized = (pixels - min_val) / (max_val - min_val)
        else:
            lower = window_center - window_width / 2
            upper = window_center + window_width / 2
            normalized = np.clip((pixels - lower) / (upper - lower), 0, 1)

        return (normalized * 255).astype(np.uint8)

    @staticmethod
    def _gray_colormap(gray: np.ndarray) -> np.ndarray:
        return np.stack([gray, gray, gray], axis=-1)

    @staticmethod
    def _rainbow_colormap(gray: np.ndarray) -> np.ndarray:
        normalized = gray / 255.0
        h = (1.0 - normalized) * 0.7
        s = np.ones_like(normalized)
        v = np.ones_like(normalized)
        
        h_i = (h * 6).astype(int)
        f = h * 6 - h_i
        p = v * (1 - s)
        q = v * (1 - f * s)
        t = v * (1 - (1 - f) * s)
        
        r = np.zeros_like(normalized)
        g = np.zeros_like(normalized)
        b = np.zeros_like(normalized)
        
        mask = h_i == 0
        r[mask] = v[mask]
        g[mask] = t[mask]
        b[mask] = p[mask]
        
        mask = h_i == 1
        r[mask] = q[mask]
        g[mask] = v[mask]
        b[mask] = p[mask]
        
        mask = h_i == 2
        r[mask] = p[mask]
        g[mask] = v[mask]
        b[mask] = t[mask]
        
        mask = h_i == 3
        r[mask] = p[mask]
        g[mask] = q[mask]
        b[mask] = v[mask]
        
        mask = h_i == 4
        r[mask] = t[mask]
        g[mask] = p[mask]
        b[mask] = v[mask]
        
        mask = (h_i == 5) | (h_i == 6)
        r[mask] = v[mask]
        g[mask] = p[mask]
        b[mask] = q[mask]
        
        rgb = np.stack([r, g, b], axis=-1)
        return (rgb * 255).astype(np.uint8)

    @staticmethod
    def _hotmetal_colormap(gray: np.ndarray) -> np.ndarray:
        normalized = gray / 255.0
        
        r = np.zeros_like(normalized)
        g = np.zeros_like(normalized)
        b = np.zeros_like(normalized)
        
        mask1 = normalized < 0.25
        t = normalized[mask1] / 0.25
        r[mask1] = t
        g[mask1] = 0
        b[mask1] = 0
        
        mask2 = (normalized >= 0.25) & (normalized < 0.5)
        t = (normalized[mask2] - 0.25) / 0.25
        r[mask2] = 1.0
        g[mask2] = t
        b[mask2] = 0
        
        mask3 = (normalized >= 0.5) & (normalized < 0.75)
        t = (normalized[mask3] - 0.5) / 0.25
        r[mask3] = 1.0
        g[mask3] = 1.0
        b[mask3] = t
        
        mask4 = normalized >= 0.75
        t = (normalized[mask4] - 0.75) / 0.25
        r[mask4] = 1.0
        g[mask4] = 1.0
        b[mask4] = 1.0
        
        rgb = np.stack([r, g, b], axis=-1)
        return (rgb * 255).astype(np.uint8)

    def apply_colormap(
        self,
        pixels: np.ndarray,
        colormap: str = 'gray',
        window_center: float = None,
        window_width: float = None
    ) -> Tuple[str, Tuple[float, float]]:
        min_val = float(np.min(pixels))
        max_val = float(np.max(pixels))
        
        gray = self._normalize_pixels(pixels, window_center, window_width)
        
        if colormap == 'rainbow':
            rgb = self._rainbow_colormap(gray)
        elif colormap == 'hotmetal':
            rgb = self._hotmetal_colormap(gray)
        else:
            rgb = self._gray_colormap(gray)
        
        img = Image.fromarray(rgb)
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        return img_base64, (min_val, max_val)

    def create_thumbnail(self, pixels: np.ndarray, max_size: int = 128) -> str:
        gray = self._normalize_pixels(pixels)
        rgb = self._gray_colormap(gray)
        img = Image.fromarray(rgb)
        
        w, h = img.size
        scale = max_size / max(w, h)
        new_w = int(w * scale)
        new_h = int(h * scale)
        img.thumbnail((new_w, new_h))
        
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
