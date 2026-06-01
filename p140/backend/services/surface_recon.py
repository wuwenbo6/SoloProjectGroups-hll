from typing import Dict, Tuple, Optional
import numpy as np
from skimage import measure
from stl import mesh
import os
import uuid


class SurfaceReconstructionService:
    def __init__(self, export_dir: str = None):
        if export_dir is None:
            export_dir = os.path.join(os.path.dirname(__file__), '..', 'exports')
        self.export_dir = export_dir
        os.makedirs(self.export_dir, exist_ok=True)

    def marching_cubes(self, volume: np.ndarray, meta: Dict,
                       threshold: float = None,
                       step_size: int = 1) -> Tuple[np.ndarray, np.ndarray]:
        if threshold is None:
            threshold = np.percentile(volume[volume > 0], 50)

        try:
            verts, faces, normals, values = measure.marching_cubes(
                volume,
                level=threshold,
                step_size=step_size,
                method='lewiner'
            )
        except Exception:
            try:
                verts, faces, normals, values = measure.marching_cubes(
                    volume,
                    level=threshold,
                    step_size=step_size
                )
            except Exception as e:
                print(f"Marching Cubes error: {e}")
                return np.array([]), np.array([])

        spacing = meta['spacing']
        verts[:, 0] *= spacing['z']
        verts[:, 1] *= spacing['y']
        verts[:, 2] *= spacing['x']

        return verts, faces

    def simplify_mesh(self, verts: np.ndarray, faces: np.ndarray,
                      target_faces: int = 10000) -> Tuple[np.ndarray, np.ndarray]:
        if len(faces) <= target_faces:
            return verts, faces

        try:
            ratio = target_faces / len(faces)
            from scipy.spatial import cKDTree

            verts_simplified = verts[::max(1, int(1 / ratio))]
            tree = cKDTree(verts_simplified)
            _, indices = tree.query(verts)

            faces_simplified = np.unique(indices[faces], axis=0)
            return verts_simplified, faces_simplified
        except Exception:
            return verts, faces

    def smooth_mesh(self, verts: np.ndarray, faces: np.ndarray,
                    iterations: int = 3, lambda_factor: float = 0.33) -> Tuple[np.ndarray, np.ndarray]:
        if len(verts) == 0:
            return verts, faces

        try:
            for _ in range(iterations):
                verts_smoothed = np.zeros_like(verts)
                neighbor_count = np.zeros(len(verts))

                for face in faces:
                    for i in range(3):
                        v1 = face[i]
                        v2 = face[(i + 1) % 3]
                        verts_smoothed[v1] += verts[v2]
                        neighbor_count[v1] += 1
                        verts_smoothed[v2] += verts[v1]
                        neighbor_count[v2] += 1

                neighbor_count[neighbor_count == 0] = 1
                verts_smoothed /= neighbor_count[:, None]

                verts = verts * (1 - lambda_factor) + verts_smoothed * lambda_factor
        except Exception:
            pass

        return verts, faces

    def export_stl(self, verts: np.ndarray, faces: np.ndarray,
                   filename: str = None) -> str:
        if len(verts) == 0 or len(faces) == 0:
            raise ValueError("Empty mesh cannot be exported")

        if filename is None:
            filename = f"surface_{uuid.uuid4().hex[:12]}.stl"

        filepath = os.path.join(self.export_dir, filename)

        surface_mesh = mesh.Mesh(np.zeros(faces.shape[0], dtype=mesh.Mesh.dtype))

        for i, face in enumerate(faces):
            for j in range(3):
                surface_mesh.vectors[i][j] = verts[face[j]]

        surface_mesh.save(filepath)

        return filename

    def export_ply(self, verts: np.ndarray, faces: np.ndarray,
                   filename: str = None) -> str:
        if len(verts) == 0 or len(faces) == 0:
            raise ValueError("Empty mesh cannot be exported")

        if filename is None:
            filename = f"surface_{uuid.uuid4().hex[:12]}.ply"

        filepath = os.path.join(self.export_dir, filename)

        with open(filepath, 'w') as f:
            f.write("ply\n")
            f.write("format ascii 1.0\n")
            f.write(f"element vertex {len(verts)}\n")
            f.write("property float x\n")
            f.write("property float y\n")
            f.write("property float z\n")
            f.write(f"element face {len(faces)}\n")
            f.write("property list uchar int vertex_index\n")
            f.write("end_header\n")

            for v in verts:
                f.write(f"{v[0]} {v[1]} {v[2]}\n")

            for face in faces:
                f.write(f"3 {face[0]} {face[1]} {face[2]}\n")

        return filename

    def reconstruct_and_export(self, volume: np.ndarray, meta: Dict,
                               threshold: float = None,
                               smooth: bool = True,
                               simplify: bool = True,
                               format: str = 'stl') -> Dict:
        verts, faces = self.marching_cubes(volume, meta, threshold)

        if len(verts) == 0:
            raise ValueError("No surface could be extracted from volume")

        if smooth:
            verts, faces = self.smooth_mesh(verts, faces, iterations=3)

        if simplify:
            verts, faces = self.simplify_mesh(verts, faces, target_faces=50000)

        if format == 'stl':
            filename = self.export_stl(verts, faces)
        elif format == 'ply':
            filename = self.export_ply(verts, faces)
        else:
            raise ValueError(f"Unsupported format: {format}")

        return {
            'filename': filename,
            'num_vertices': len(verts),
            'num_faces': len(faces),
            'file_size': os.path.getsize(os.path.join(self.export_dir, filename))
        }

    def multi_threshold_reconstruction(self, volume: np.ndarray, meta: Dict,
                                       thresholds: list,
                                       format: str = 'stl') -> Dict:
        results = []

        for threshold in thresholds:
            try:
                result = self.reconstruct_and_export(
                    volume, meta, threshold, smooth=True, simplify=True, format=format
                )
                result['threshold'] = threshold
                results.append(result)
            except Exception as e:
                print(f"Failed to reconstruct at threshold {threshold}: {e}")

        return {'surfaces': results}

    def get_mesh_info(self, verts: np.ndarray, faces: np.ndarray) -> Dict:
        if len(verts) == 0:
            return {
                'num_vertices': 0,
                'num_faces': 0,
                'volume': 0,
                'surface_area': 0,
                'bbox': {'min': [0, 0, 0], 'max': [0, 0, 0]}
            }

        volume = self._calculate_volume(verts, faces)
        surface_area = self._calculate_surface_area(verts, faces)

        return {
            'num_vertices': len(verts),
            'num_faces': len(faces),
            'volume': volume,
            'surface_area': surface_area,
            'bbox': {
                'min': verts.min(axis=0).tolist(),
                'max': verts.max(axis=0).tolist()
            }
        }

    def _calculate_volume(self, verts: np.ndarray, faces: np.ndarray) -> float:
        volume = 0.0
        for face in faces:
            v0 = verts[face[0]]
            v1 = verts[face[1]]
            v2 = verts[face[2]]

            volume += np.dot(v0, np.cross(v1, v2)) / 6.0

        return abs(volume)

    def _calculate_surface_area(self, verts: np.ndarray, faces: np.ndarray) -> float:
        area = 0.0
        for face in faces:
            v0 = verts[face[0]]
            v1 = verts[face[1]]
            v2 = verts[face[2]]

            area += np.linalg.norm(np.cross(v1 - v0, v2 - v0)) / 2.0

        return area
