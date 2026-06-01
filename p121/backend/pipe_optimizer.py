import json
import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, field


@dataclass
class PipeElement:
    id: int
    ifc_id: str
    ifc_type: str
    name: str
    vertices: np.ndarray
    faces: np.ndarray
    centerline: np.ndarray
    diameter: float
    direction: np.ndarray
    priority: int
    aabb_min: np.ndarray
    aabb_max: np.ndarray


@dataclass
class ClashSolution:
    element_id: int
    original_centerline: np.ndarray
    new_centerline: np.ndarray
    offset_direction: np.ndarray
    offset_distance: float
    offset_type: str
    transition_length: float


PIPE_PRIORITIES = {
    'IfcPipeSegment': 3,
    'IfcDuctSegment': 4,
    'IfcCableCarrierSegment': 5,
    'IfcPipeFitting': 3,
    'IfcDuctFitting': 4,
    'IfcCableCarrierFitting': 5,
    'IfcSanitaryTerminal': 2,
    'IfcStackTerminal': 2,
    'IfcFlowTerminal': 3,
    'IfcFlowController': 3,
    'IfcFlowFitting': 3,
    'IfcFlowSegment': 3,
    'IfcFlowTreatmentDevice': 3,
    'IfcDistributionChamberElement': 3,
}


def is_pipe_element(ifc_type: str) -> bool:
    pipe_keywords = ['Pipe', 'Duct', 'Cable', 'Flow', 'Sanitary', 'Stack', 'Distribution']
    return any(kw in ifc_type for kw in pipe_keywords)


def estimate_pipe_diameter(vertices: np.ndarray) -> float:
    if len(vertices) < 4:
        return 0.1

    center = np.mean(vertices, axis=0)

    centered = vertices - center
    cov = centered.T @ centered / len(centered)
    eigenvalues, eigenvectors = np.linalg.eigh(cov)

    main_axis_idx = np.argmax(eigenvalues)
    main_axis = eigenvectors[:, main_axis_idx]

    proj_on_axis = vertices @ main_axis
    min_proj = np.min(proj_on_axis)
    max_proj = np.max(proj_on_axis)

    mid_proj = (min_proj + max_proj) / 2
    slice_half_width = (max_proj - min_proj) * 0.1
    if slice_half_width < 0.05:
        slice_half_width = 0.05

    mask = np.abs(proj_on_axis - mid_proj) < slice_half_width
    if np.sum(mask) < 3:
        center_dist = np.abs(proj_on_axis - mid_proj)
        sorted_idx = np.argsort(center_dist)
        mask = np.zeros(len(vertices), dtype=bool)
        mask[sorted_idx[:max(3, len(vertices) // 4)]] = True

    slice_vertices = vertices[mask]
    slice_center = np.mean(slice_vertices, axis=0)

    proj_perp = []
    for v in slice_vertices:
        to_v = v - slice_center
        perp = to_v - np.dot(to_v, main_axis) * main_axis
        proj_perp.append(np.linalg.norm(perp))

    if len(proj_perp) == 0:
        return 0.1

    return 2 * np.mean(proj_perp)


def extract_centerline(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    if len(vertices) < 2:
        return np.array([[0, 0, 0], [1, 0, 0]])

    center = np.mean(vertices, axis=0)

    centered = vertices - center
    cov = centered.T @ centered / len(centered)
    eigenvalues, eigenvectors = np.linalg.eigh(cov)

    axis_idx = np.argmax(eigenvalues)
    main_axis = eigenvectors[:, axis_idx]

    projections = vertices @ main_axis
    min_idx = np.argmin(projections)
    max_idx = np.argmax(projections)

    start = vertices[min_idx]
    end = vertices[max_idx]

    if start[2] > end[2]:
        start, end = end, start

    mid = (start + end) / 2

    return np.array([start, mid, end])


def get_pipe_priority(ifc_type: str) -> int:
    for key, priority in PIPE_PRIORITIES.items():
        if key in ifc_type:
            return priority
    return 10


def create_pipe_element(element_data: Dict) -> Optional[PipeElement]:
    if not is_pipe_element(element_data['ifc_type']):
        return None

    vertices = np.array(json.loads(element_data['vertices_json'])).reshape(-1, 3)
    faces = np.array(json.loads(element_data['faces_json'])).reshape(-1, 3)

    if len(vertices) < 3:
        return None

    diameter = estimate_pipe_diameter(vertices)
    centerline = extract_centerline(vertices, faces)
    direction = centerline[-1] - centerline[0]
    if np.linalg.norm(direction) > 1e-8:
        direction = direction / np.linalg.norm(direction)
    else:
        direction = np.array([1, 0, 0])

    aabb_min = np.array([float(x) for x in element_data['aabb_min'].split(',')])
    aabb_max = np.array([float(x) for x in element_data['aabb_max'].split(',')])

    return PipeElement(
        id=element_data['id'],
        ifc_id=element_data['ifc_id'],
        ifc_type=element_data['ifc_type'],
        name=element_data['name'],
        vertices=vertices,
        faces=faces,
        centerline=centerline,
        diameter=diameter,
        direction=direction,
        priority=get_pipe_priority(element_data['ifc_type']),
        aabb_min=aabb_min,
        aabb_max=aabb_max,
    )


def find_clash_point(pipe_a: PipeElement, pipe_b: PipeElement) -> np.ndarray:
    min_a = pipe_a.aabb_min
    max_a = pipe_a.aabb_max
    min_b = pipe_b.aabb_min
    max_b = pipe_b.aabb_max

    clash_min = np.maximum(min_a, min_b)
    clash_max = np.minimum(max_a, max_b)

    return (clash_min + clash_max) / 2


def calculate_avoidance(pipe: PipeElement, other_pipe: PipeElement,
                        clash_point: np.ndarray,
                        clearance: float = 0.1) -> ClashSolution:
    combined_diameter = pipe.diameter + other_pipe.diameter + clearance

    pipe_dir = pipe.direction
    other_dir = other_pipe.direction

    up = np.array([0, 0, 1])
    cross = np.cross(pipe_dir, other_dir)
    cross_norm = np.linalg.norm(cross)

    if cross_norm > 1e-6:
        offset_direction = cross / cross_norm
    else:
        offset_direction = np.cross(pipe_dir, up)
        if np.linalg.norm(offset_direction) < 1e-6:
            offset_direction = np.array([0, 1, 0])

    center_to_clash = clash_point - pipe.centerline[1]
    proj_on_pipe = np.dot(center_to_clash, pipe_dir) * pipe_dir

    offset_dir_up = np.dot(offset_direction, up)
    if offset_dir_up < 0:
        offset_direction = -offset_direction

    other_priority = other_pipe.priority
    self_priority = pipe.priority

    if self_priority >= other_priority:
        offset_distance = combined_diameter * 1.2
    else:
        offset_distance = combined_diameter * 0.8

    if abs(np.dot(pipe_dir, up)) > 0.7:
        side_dir = np.cross(pipe_dir, np.array([1, 0, 0]))
        if np.linalg.norm(side_dir) < 1e-6:
            side_dir = np.cross(pipe_dir, np.array([0, 1, 0]))
        side_dir = side_dir / np.linalg.norm(side_dir)
        offset_direction = side_dir
        offset_type = 'horizontal'
    else:
        offset_direction = up
        offset_type = 'vertical'

    transition_length = max(combined_diameter * 3, pipe.diameter * 8)

    start_point = pipe.centerline[1] + proj_on_pipe - pipe_dir * transition_length
    end_point = pipe.centerline[1] + proj_on_pipe + pipe_dir * transition_length
    offset_point = pipe.centerline[1] + proj_on_pipe + offset_direction * offset_distance

    new_centerline = np.array([
        pipe.centerline[0],
        start_point,
        offset_point,
        end_point,
        pipe.centerline[-1],
    ])

    return ClashSolution(
        element_id=pipe.id,
        original_centerline=pipe.centerline.copy(),
        new_centerline=new_centerline,
        offset_direction=offset_direction,
        offset_distance=offset_distance,
        offset_type=offset_type,
        transition_length=transition_length,
    )


def generate_avoidance_geometry(vertices: np.ndarray, centerline: np.ndarray,
                                solution: ClashSolution,
                                faces: np.ndarray,
                                diameter: float) -> Tuple[np.ndarray, np.ndarray]:
    original_dir = centerline[-1] - centerline[0]
    original_dir = original_dir / np.linalg.norm(original_dir)

    new_vertices = vertices.copy()
    center = np.mean(vertices, axis=0)

    proj_clash = np.dot(np.array(solution.new_centerline[2]) - center, original_dir)

    transition_length = solution.transition_length
    start_dist = proj_clash - transition_length
    end_dist = proj_clash + transition_length

    offset_vec = np.array(solution.offset_direction) * solution.offset_distance

    min_dist = float('inf')
    max_dist = -float('inf')
    for v in vertices:
        proj = np.dot(v - center, original_dir)
        min_dist = min(min_dist, proj)
        max_dist = max(max_dist, proj)

    for i, v in enumerate(new_vertices):
        to_v = v - center
        proj_on_axis = np.dot(to_v, original_dir)

        if proj_on_axis < start_dist or proj_on_axis > end_dist:
            continue

        t = (proj_on_axis - start_dist) / max(end_dist - start_dist, 1e-6)
        if t < 0.3:
            blend = t / 0.3
        elif t > 0.7:
            blend = (1 - t) / 0.3
        else:
            blend = 1.0

        blend = 0.5 - 0.5 * np.cos(blend * np.pi)
        new_vertices[i] = v + offset_vec * blend

    return new_vertices, faces


def optimize_pipe_routing(elements: List[Dict],
                          collisions: List[Dict],
                          clearance: float = 0.1) -> Tuple[List[Dict], List[Dict]]:

    pipes = {}
    for elem in elements:
        pipe = create_pipe_element(elem)
        if pipe:
            pipes[elem['id']] = pipe

    solutions = []
    processed_clashes = set()

    for collision in collisions:
        id_a = collision['element_a']['id']
        id_b = collision['element_b']['id']

        if id_a not in pipes or id_b not in pipes:
            continue

        clash_key = tuple(sorted([id_a, id_b]))
        if clash_key in processed_clashes:
            continue
        processed_clashes.add(clash_key)

        pipe_a = pipes[id_a]
        pipe_b = pipes[id_b]

        clash_point = find_clash_point(pipe_a, pipe_b)

        if pipe_a.priority <= pipe_b.priority:
            movable_pipe = pipe_a
            other_pipe = pipe_b
        else:
            movable_pipe = pipe_b
            other_pipe = pipe_a

        solution = calculate_avoidance(movable_pipe, other_pipe, clash_point, clearance)

        new_verts, new_faces = generate_avoidance_geometry(
            movable_pipe.vertices,
            movable_pipe.centerline,
            solution,
            movable_pipe.faces,
            movable_pipe.diameter
        )

        from geometry_processor import _compute_global_aabb
        aabb_min, aabb_max = _compute_global_aabb(new_verts.flatten().tolist())

        updated_element = next((e for e in elements if e['id'] == movable_pipe.id), None)
        if updated_element:
            updated_element['vertices_json'] = json.dumps(new_verts.flatten().tolist())
            updated_element['faces_json'] = json.dumps(movable_pipe.faces.flatten().tolist())
            updated_element['aabb_min'] = aabb_min
            updated_element['aabb_max'] = aabb_max

        solutions.append({
            'element_id': movable_pipe.id,
            'ifc_id': movable_pipe.ifc_id,
            'name': movable_pipe.name,
            'ifc_type': movable_pipe.ifc_type,
            'clash_with_id': other_pipe.id,
            'clash_with_name': other_pipe.name,
            'offset_type': solution.offset_type,
            'offset_direction': solution.offset_direction.tolist(),
            'offset_distance_m': round(solution.offset_distance, 4),
            'transition_length_m': round(solution.transition_length, 4),
            'clash_point': clash_point.tolist(),
            'new_centerline': solution.new_centerline.tolist(),
        })

    return elements, solutions
