import json
import numpy as np
from typing import List, Dict, Tuple
import trimesh


def merge_geometries_by_type(elements: List[Dict]) -> List[Dict]:
    type_groups: Dict[str, List[Dict]] = {}

    for elem in elements:
        ifc_type = elem['ifc_type']
        if ifc_type not in type_groups:
            type_groups[ifc_type] = []
        type_groups[ifc_type].append(elem)

    merged = []
    for ifc_type, group in type_groups.items():
        if len(group) == 1:
            merged.append(group[0])
        else:
            merged_elem = _merge_group(group, ifc_type)
            merged.append(merged_elem)

    return merged


def _merge_group(group: List[Dict], ifc_type: str) -> Dict:
    all_vertices = []
    all_faces = []
    all_colors = []
    vertex_offset = 0

    for elem in group:
        verts = elem['vertices']
        faces = elem['faces']

        shifted_faces = [f + vertex_offset for f in faces]
        all_vertices.extend(verts)
        all_faces.extend(shifted_faces)

        if elem.get('colors'):
            all_colors.extend(elem['colors'])
        else:
            num_v = len(verts) // 3
            all_colors.extend([0.8, 0.8, 0.8, 1.0] * num_v)

        vertex_offset += len(verts) // 3

    aabb_min, aabb_max = _compute_global_aabb(all_vertices)

    return {
        'ifc_id': f'merged_{ifc_type}',
        'ifc_type': ifc_type,
        'name': f'Merged {ifc_type} ({len(group)} elements)',
        'vertices': all_vertices,
        'faces': all_faces,
        'colors': all_colors,
        'aabb_min': aabb_min,
        'aabb_max': aabb_max,
        'merged': True,
    }


def simplify_mesh(vertices: List[float], faces: List[float], face_ratio: float = 0.5) -> Tuple[List[float], List[float]]:
    v = np.array(vertices, dtype=np.float64).reshape(-1, 3)
    f = np.array(faces, dtype=np.int64).reshape(-1, 3)

    mesh = trimesh.Trimesh(vertices=v, faces=f)

    target_faces = max(4, int(len(f) * face_ratio))
    simplified = mesh.simplify_quadric_decimation(target_faces)

    if simplified is not None and len(simplified.faces) > 0:
        return simplified.vertices.flatten().tolist(), simplified.faces.flatten().tolist()

    return vertices, faces


def simplify_element(element: Dict, face_ratio: float = 0.5) -> Dict:
    new_verts, new_faces = simplify_mesh(element['vertices'], element['faces'], face_ratio)
    result = dict(element)
    result['vertices'] = new_verts
    result['faces'] = new_faces

    num_v = len(new_verts) // 3
    if element.get('colors'):
        old_colors = np.array(element['colors']).reshape(-1, 4)
        if len(old_colors) >= num_v:
            result['colors'] = old_colors[:num_v].flatten().tolist()
        else:
            result['colors'] = [0.8, 0.8, 0.8, 1.0] * num_v
    else:
        result['colors'] = [0.8, 0.8, 0.8, 1.0] * num_v

    aabb_min, aabb_max = _compute_global_aabb(new_verts)
    result['aabb_min'] = aabb_min
    result['aabb_max'] = aabb_max
    return result


def _compute_global_aabb(vertices: List[float]) -> Tuple[str, str]:
    arr = np.array(vertices).reshape(-1, 3)
    vmin = arr.min(axis=0)
    vmax = arr.max(axis=0)
    return (
        f'{vmin[0]:.6f},{vmin[1]:.6f},{vmin[2]:.6f}',
        f'{vmax[0]:.6f},{vmax[1]:.6f},{vmax[2]:.6f}',
    )


def compress_geometry(element: Dict) -> Dict:
    element['vertices'] = [round(v, 4) for v in element['vertices']]
    element['faces'] = [int(f) for f in element['faces']]
    if element.get('colors'):
        element['colors'] = [round(c, 4) for c in element['colors']]
    return element


def serialize_element(element: Dict) -> Dict:
    return {
        'ifc_id': element['ifc_id'],
        'ifc_type': element['ifc_type'],
        'name': element['name'],
        'vertices_json': json.dumps(compress_geometry({'vertices': element['vertices']})['vertices']),
        'faces_json': json.dumps(element['faces']),
        'colors_json': json.dumps(element.get('colors')) if element.get('colors') else None,
        'aabb_min': element['aabb_min'],
        'aabb_max': element['aabb_max'],
        'merged': element.get('merged', False),
    }
