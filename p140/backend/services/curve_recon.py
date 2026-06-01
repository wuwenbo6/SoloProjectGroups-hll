from typing import List, Tuple, Dict
import numpy as np
from scipy import interpolate, ndimage
import SimpleITK as sitk


class CurveReconstructionService:
    def __init__(self):
        pass

    def interpolate_curve(self, control_points: List[Tuple[float, float, float]],
                          num_samples: int = 100,
                          method: str = 'bspline') -> np.ndarray:
        points = np.array(control_points)

        if len(points) < 2:
            raise ValueError("At least 2 control points required")

        if method == 'linear':
            t = np.linspace(0, 1, len(points))
            t_new = np.linspace(0, 1, num_samples)
            curve = np.column_stack([
                np.interp(t_new, t, points[:, 0]),
                np.interp(t_new, t, points[:, 1]),
                np.interp(t_new, t, points[:, 2])
            ])

        elif method == 'bspline':
            tck, u = interpolate.splprep([points[:, 0], points[:, 1], points[:, 2]],
                                        s=0, k=min(3, len(points) - 1))
            u_new = np.linspace(0, 1, num_samples)
            x_new, y_new, z_new = interpolate.splev(u_new, tck)
            curve = np.column_stack([x_new, y_new, z_new])

        elif method == 'catmull-rom':
            curve = self._catmull_rom_spline(points, num_samples)

        else:
            raise ValueError(f"Unknown interpolation method: {method}")

        return curve

    def _catmull_rom_spline(self, points: np.ndarray, num_samples: int) -> np.ndarray:
        n_points = len(points)
        if n_points < 4:
            tck, u = interpolate.splprep([points[:, 0], points[:, 1], points[:, 2]], s=0, k=min(3, n_points - 1))
            u_new = np.linspace(0, 1, num_samples)
            x_new, y_new, z_new = interpolate.splev(u_new, tck)
            return np.column_stack([x_new, y_new, z_new])

        curve = []
        samples_per_segment = num_samples // (n_points - 1)

        for i in range(n_points - 1):
            p0 = points[max(0, i - 1)]
            p1 = points[i]
            p2 = points[min(n_points - 1, i + 1)]
            p3 = points[min(n_points - 1, i + 2)]

            for t in np.linspace(0, 1, samples_per_segment):
                t2 = t * t
                t3 = t2 * t

                point = 0.5 * (
                    (2 * p1) +
                    (-p0 + p2) * t +
                    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
                )
                curve.append(point)

        return np.array(curve)

    def get_curve_tangents(self, curve: np.ndarray) -> np.ndarray:
        tangents = np.gradient(curve, axis=0)
        norms = np.linalg.norm(tangents, axis=1, keepdims=True)
        norms[norms < 1e-8] = 1
        return tangents / norms

    def get_curve_normals(self, curve: np.ndarray, tangents: np.ndarray) -> np.ndarray:
        normals = np.zeros_like(tangents)

        for i in range(len(tangents)):
            t = tangents[i]
            if abs(t[2]) < 0.9:
                n = np.array([-t[1], t[0], 0])
            else:
                n = np.array([0, -t[2], t[1]])
            n = n / np.linalg.norm(n)
            normals[i] = n

        return normals

    def extract_curved_mpr(self, volume: np.ndarray, meta: Dict,
                           curve: np.ndarray,
                           slice_width: int = 50,
                           slice_height: int = 50,
                           window_width: float = None,
                           window_level: float = None) -> Dict:
        spacing = meta['spacing']
        dims = meta['dimensions']

        tangents = self.get_curve_tangents(curve)
        normals = self.get_curve_normals(curve, tangents)

        slices = []
        for i in range(len(curve)):
            center = curve[i]
            center_idx = np.array([
                int(round(center[2] / spacing['z'])),
                int(round(center[1] / spacing['y'])),
                int(round(center[0] / spacing['x']))
            ])

            if (0 <= center_idx[0] < dims['z'] and
                0 <= center_idx[1] < dims['y'] and
                0 <= center_idx[2] < dims['x']):

                t = tangents[i]
                n = normals[i]
                b = np.cross(t, n)
                b = b / np.linalg.norm(b)

                slice_data = self._extract_oblique_slice(
                    volume, center_idx, n, b,
                    slice_width, slice_height,
                    (spacing['x'], spacing['y'], spacing['z'])
                )
                slices.append(slice_data)

        if slices:
            straightened = self._straighten_curve(slices, curve)
        else:
            straightened = np.zeros((len(curve), slice_height), dtype=np.float32)

        if window_width is not None and window_level is not None:
            min_val = window_level - window_width / 2
            max_val = window_level + window_width / 2
            straightened = np.clip(straightened, min_val, max_val)

        straightened_255 = self._normalize_to_uint8(straightened)

        return {
            'curve_points': curve.tolist(),
            'tangents': tangents.tolist(),
            'slices_count': len(slices),
            'straightened': {
                'data': straightened_255.tobytes(),
                'width': straightened.shape[1],
                'height': straightened.shape[0]
            }
        }

    def _extract_oblique_slice(self, volume: np.ndarray, center: np.ndarray,
                               normal1: np.ndarray, normal2: np.ndarray,
                               width: int, height: int,
                               spacing: Tuple[float, float, float]) -> np.ndarray:
        slice_data = np.zeros((height, width), dtype=np.float32)

        half_w = width // 2
        half_h = height // 2

        z, y, x = np.ogrid[-half_h:half_h, -half_w:half_w]

        coords = (center[0] + z * normal1[0] + y * normal2[0],
                  center[1] + z * normal1[1] + y * normal2[1],
                  center[2] + z * normal1[2] + y * normal2[2])

        coords_clamped = (
            np.clip(coords[0], 0, volume.shape[0] - 1),
            np.clip(coords[1], 0, volume.shape[1] - 1),
            np.clip(coords[2], 0, volume.shape[2] - 1)
        )

        slice_data = ndimage.map_coordinates(
            volume, coords_clamped, order=3, mode='constant', cval=0
        )

        return slice_data

    def _straighten_curve(self, slices: List[np.ndarray], curve: np.ndarray) -> np.ndarray:
        if not slices:
            return np.array([])

        max_h = max(s.shape[0] for s in slices)
        max_w = max(s.shape[1] for s in slices)

        straightened = np.zeros((len(slices), max_w), dtype=np.float32)
        for i, s in enumerate(slices):
            if s.shape[0] > 0 and s.shape[1] > 0:
                center_row = s.shape[0] // 2
                row = s[center_row, :]
                if len(row) <= max_w:
                    straightened[i, :len(row)] = row
                else:
                    straightened[i, :] = row[:max_w]

        return straightened

    def _normalize_to_uint8(self, data: np.ndarray) -> np.ndarray:
        min_val = np.min(data)
        max_val = np.max(data)

        if max_val - min_val < 1e-6:
            return np.zeros_like(data, dtype=np.uint8)

        normalized = (data - min_val) / (max_val - min_val) * 255.0
        normalized = np.clip(normalized, 0, 255)
        return normalized.astype(np.uint8)

    def generate_vessel_centerline(self, volume: np.ndarray, meta: Dict,
                                   start_point: Tuple[float, float, float],
                                   end_point: Tuple[float, float, float],
                                   threshold: float = 100) -> List[Tuple[float, float, float]]:
        spacing = meta['spacing']

        start_idx = (
            int(round(start_point[2] / spacing['z'])),
            int(round(start_point[1] / spacing['y'])),
            int(round(start_point[0] / spacing['x']))
        )
        end_idx = (
            int(round(end_point[2] / spacing['z'])),
            int(round(end_point[1] / spacing['y'])),
            int(round(end_point[0] / spacing['x']))
        )

        path = self._trace_vessel(volume, start_idx, end_idx, threshold)

        centerline = [
            (p[2] * spacing['x'], p[1] * spacing['y'], p[0] * spacing['z'])
            for p in path
        ]

        return centerline

    def _trace_vessel(self, volume: np.ndarray, start: Tuple[int, int, int],
                      end: Tuple[int, int, int], threshold: float) -> List[Tuple[int, int, int]]:
        start_arr = np.array(start, dtype=float)
        end_arr = np.array(end, dtype=float)

        num_steps = int(np.linalg.norm(end_arr - start_arr)) + 1
        path = []

        for t in np.linspace(0, 1, max(num_steps, 10)):
            point = start_arr + t * (end_arr - start_arr)
            point_int = tuple(int(round(x)) for x in point)
            point_clamped = (
                max(0, min(point_int[0], volume.shape[0] - 1)),
                max(0, min(point_int[1], volume.shape[1] - 1)),
                max(0, min(point_int[2], volume.shape[2] - 1))
            )
            path.append(point_clamped)

        return path
