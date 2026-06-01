import json
import numpy as np
import ifcopenshell
import ifcopenshell.geom
from typing import Dict, List, Tuple
import trimesh


def parse_ifc_file(file_path: str, quality: str = 'high') -> Tuple[List[Dict], int, int, int]:
    ifc_file = ifcopenshell.open(file_path)

    elements = []
    total_vertices = 0
    total_faces = 0
    element_count = 0

    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)

    quality_params = {
        'low': {'deflection': 0.01, 'angular_deflection': 0.5, 'use_brep': False},
        'medium': {'deflection': 0.005, 'angular_deflection': 0.3, 'use_brep': True},
        'high': {'deflection': 0.001, 'angular_deflection': 0.1, 'use_brep': True},
        'ultra': {'deflection': 0.0005, 'angular_deflection': 0.05, 'use_brep': True},
    }
    params = quality_params.get(quality, quality_params['high'])

    try:
        settings.set(settings.DEFLECTION, params['deflection'])
    except Exception:
        pass

    try:
        settings.set(settings.ANGULAR_DEFLECTION, params['angular_deflection'])
    except Exception:
        pass

    if params['use_brep']:
        try:
            settings.set(settings.USE_BREP_DATA, True)
            settings.set(settings.SEW_SHELLS, True)
            settings.set(settings.ENABLE_OPENGL_SELECTION, False)
        except Exception:
            pass

    try:
        settings.set(settings.DISABLE_TRIANGULATION, False)
        settings.set(settings.APPLY_DEFAULT_MATERIALS, True)
    except Exception:
        pass

    products = ifc_file.by_type('IfcProduct')

    for product in products:
        if not hasattr(product, 'Representation') or product.Representation is None:
            continue

        try:
            shape = ifcopenshell.geom.create_shape(settings, product)
        except Exception:
            try:
                fallback_settings = ifcopenshell.geom.settings()
                fallback_settings.set(fallback_settings.USE_WORLD_COORDS, True)
                shape = ifcopenshell.geom.create_shape(fallback_settings, product)
            except Exception:
                continue

        vertices = list(shape.geometry.verts)
        faces = list(shape.geometry.faces)
        colors = list(shape.geometry.materialIds) if shape.geometry.materialIds else None

        if len(vertices) < 3 or len(faces) < 3:
            continue

        if _is_curved_element(product):
            vertices, faces = _refine_curved_surface(vertices, faces, product)

        element_count += 1
        total_vertices += len(vertices) // 3
        total_faces += len(faces) // 3

        color_list = _process_colors(shape, colors) if colors else None

        aabb_min, aabb_max = _compute_aabb(vertices)

        element = {
            'ifc_id': product.GlobalId,
            'ifc_type': product.is_a(),
            'name': product.Name or product.is_a(),
            'vertices': vertices,
            'faces': faces,
            'colors': color_list,
            'aabb_min': aabb_min,
            'aabb_max': aabb_max,
        }
        elements.append(element)

    return elements, element_count, total_vertices, total_faces


def _is_curved_element(product) -> bool:
    ifc_type = product.is_a()
    curved_types = [
        'IfcCurtainWall', 'IfcWallElementedCase', 'IfcColumn',
        'IfcRailing', 'IfcRamp', 'IfcRoof', 'IfcStair',
        'IfcStairFlight', 'IfcRampFlight', 'IfcBeam', 'IfcMember',
    ]

    if ifc_type in curved_types:
        return True

    try:
        for rep in product.Representation.Representations:
            if rep.RepresentationIdentifier == 'Body':
                for item in rep.Items:
                    item_type = item.is_a()
                    if any(keyword in item_type for keyword in [
                        'Curve', 'Arc', 'Circle', 'Ellipse', 'Spline',
                        'Brep', 'Face', 'AdvancedFace', 'Surface', 'Cylinder', 'Sphere'
                    ]):
                        return True
    except Exception:
        pass

    return False


def _refine_curved_surface(vertices: List[float], faces: List[float], product) -> Tuple[List[float], List[float]]:
    v = np.array(vertices, dtype=np.float64).reshape(-1, 3)
    f = np.array(faces, dtype=np.int64).reshape(-1, 3)

    if len(f) < 4:
        return vertices, faces

    mesh = trimesh.Trimesh(vertices=v, faces=f)

    try:
        angles = mesh.face_angles
        mean_angle = np.mean(angles)

        if mean_angle < 1.5:
            return vertices, faces

        subdivisions = 1 if len(f) < 200 else 0
        for _ in range(subdivisions):
            if len(mesh.faces) > 5000:
                break
            try:
                mesh = mesh.subdivide()
            except Exception:
                break

    except Exception:
        pass

    return mesh.vertices.flatten().tolist(), mesh.faces.flatten().tolist()


def _process_colors(shape, material_ids: List[int]) -> List[float]:
    result = []
    materials = shape.geometry.materials
    num_vertices = len(shape.geometry.verts) // 3

    for i in range(num_vertices):
        mat_idx = material_ids[i] if i < len(material_ids) else 0
        mat = materials[mat_idx] if mat_idx < len(materials) else materials[0]
        result.extend([mat.diffuse.r(), mat.diffuse.g(), mat.diffuse.b(), 1.0])
    return result


def _compute_aabb(vertices: List[float]) -> Tuple[str, str]:
    arr = np.array(vertices).reshape(-1, 3)
    vmin = arr.min(axis=0)
    vmax = arr.max(axis=0)
    return (
        f'{vmin[0]:.6f},{vmin[1]:.6f},{vmin[2]:.6f}',
        f'{vmax[0]:.6f},{vmax[1]:.6f},{vmax[2]:.6f}',
    )


def mesh_from_element(vertices: List[float], faces: List[float]) -> trimesh.Trimesh:
    v = np.array(vertices, dtype=np.float64).reshape(-1, 3)
    f = np.array(faces, dtype=np.int64).reshape(-1, 3)
    return trimesh.Trimesh(vertices=v, faces=f)


def compute_element_aabb(vertices: List[float]) -> Tuple[np.ndarray, np.ndarray]:
    arr = np.array(vertices).reshape(-1, 3)
    return arr.min(axis=0), arr.max(axis=0)
