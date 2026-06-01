import json
import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class OBB:
    center: np.ndarray
    axes: np.ndarray
    extents: np.ndarray

    @staticmethod
    def from_vertices(vertices: np.ndarray) -> 'OBB':
        centered = vertices - np.mean(vertices, axis=0)
        cov = centered.T @ centered / len(centered)
        eigenvalues, eigenvectors = np.linalg.eigh(cov)

        order = np.argsort(eigenvalues)[::-1]
        axes = eigenvectors[:, order]

        for i in range(3):
            if np.linalg.det(axes) < 0:
                axes[:, i] *= -1

        projected = vertices @ axes
        min_proj = projected.min(axis=0)
        max_proj = projected.max(axis=0)
        extents = (max_proj - min_proj) / 2
        center = axes @ ((min_proj + max_proj) / 2)

        return OBB(center=center, axes=axes, extents=extents)


def parse_aabb(aabb_str: str) -> np.ndarray:
    return np.array([float(x) for x in aabb_str.split(',')])


def aabb_intersect(min1: np.ndarray, max1: np.ndarray,
                   min2: np.ndarray, max2: np.ndarray,
                   tolerance: float = 0.0) -> bool:
    return all(min1[i] - tolerance <= max2[i] and min2[i] - tolerance <= max1[i]
               for i in range(3))


def aabb_expand(aabb_min: np.ndarray, aabb_max: np.ndarray,
                margin: float) -> Tuple[np.ndarray, np.ndarray]:
    return aabb_min - margin, aabb_max + margin


def obb_intersect(obb1: OBB, obb2: OBB, tolerance: float = 0.0) -> bool:
    axes = np.zeros((15, 3))
    axes[0:3] = obb1.axes.T
    axes[3:6] = obb2.axes.T

    idx = 6
    for i in range(3):
        for j in range(3):
            cross = np.cross(obb1.axes[:, i], obb2.axes[:, j])
            norm = np.linalg.norm(cross)
            if norm > 1e-8:
                axes[idx] = cross / norm
            else:
                axes[idx] = np.zeros(3)
            idx += 1

    d = obb2.center - obb1.center

    for axis in axes:
        if np.linalg.norm(axis) < 1e-8:
            continue

        p1 = np.abs(np.dot(obb1.axes @ np.diag(obb1.extents * 2), axis)).sum() / 2
        p2 = np.abs(np.dot(obb2.axes @ np.diag(obb2.extents * 2), axis)).sum() / 2
        dist = np.abs(np.dot(d, axis))

        if dist > p1 + p2 + tolerance:
            return False

    return True


def tri_intersect_tri(t1: np.ndarray, t2: np.ndarray,
                      tolerance: float = 1e-6) -> bool:
    v0, v1, v2 = t1
    u0, u1, u2 = t2

    e1 = v1 - v0
    e2 = v2 - v0
    n1 = np.cross(e1, e2)
    n1_norm = np.linalg.norm(n1)
    if n1_norm < 1e-10:
        return False
    n1 = n1 / n1_norm

    d1 = -np.dot(n1, v0)
    dist_u = np.array([np.dot(n1, u) + d1 for u in t2])

    if np.all(dist_u > tolerance) or np.all(dist_u < -tolerance):
        return False

    e3 = u1 - u0
    e4 = u2 - u0
    n2 = np.cross(e3, e4)
    n2_norm = np.linalg.norm(n2)
    if n2_norm < 1e-10:
        return False
    n2 = n2 / n2_norm

    d2 = -np.dot(n2, u0)
    dist_v = np.array([np.dot(n2, v) + d2 for v in t1])

    if np.all(dist_v > tolerance) or np.all(dist_v < -tolerance):
        return False

    coplanar = np.max(np.abs(dist_u)) < tolerance and np.max(np.abs(dist_v)) < tolerance
    if coplanar:
        return _tri_intersect_coplanar(t1, t2, tolerance)

    t1_onto = _project_to_interval(t1, n1, e1, e2, tolerance)
    t2_onto = _project_to_interval(t2, n1, e1, e2, tolerance)
    if not _overlap(t1_onto, t2_onto, tolerance):
        return False

    plane_dir = np.cross(n1, n2)
    t1_onto_d = _project_to_line(t1, plane_dir)
    t2_onto_d = _project_to_line(t2, plane_dir)
    if not _overlap(t1_onto_d, t2_onto_d, tolerance):
        return False

    return True


def _project_to_interval(tri, n, e1, e2, tolerance):
    e1_sq = np.dot(e1, e1)
    e2_sq = np.dot(e2, e2)
    e1_dot_e2 = np.dot(e1, e2)
    denom = e1_sq * e2_sq - e1_dot_e2 ** 2

    if abs(denom) < 1e-10:
        return [0, 0]

    results = []
    for v in tri:
        p = v - tri[0]
        u = (np.dot(p, e1) * e2_sq - np.dot(p, e2) * e1_dot_e2) / denom
        v_ = (np.dot(p, e2) * e1_sq - np.dot(p, e1) * e1_dot_e2) / denom
        results.append(u + v_)

    return [min(results), max(results)]


def _project_to_line(tri, direction):
    projs = [np.dot(v, direction) for v in tri]
    return [min(projs), max(projs)]


def _overlap(interval1, interval2, tolerance):
    return interval1[0] - tolerance <= interval2[1] and interval2[0] - tolerance <= interval1[1]


def _tri_intersect_coplanar(t1, t2, tolerance):
    for edges, tri_other in [
        ([(t1[0], t1[1]), (t1[1], t1[2]), (t1[2], t1[0])], t2),
        ([(t2[0], t2[1]), (t2[1], t2[2]), (t2[2], t2[0])], t1),
    ]:
        for (p0, p1) in edges:
            edge = p1 - p0
            normal = np.cross(edge, np.cross(edge, np.array([1, 0, 0])))
            if np.linalg.norm(normal) < 1e-8:
                normal = np.cross(edge, np.cross(edge, np.array([0, 1, 0])))
            if np.linalg.norm(normal) < 1e-8:
                continue
            normal = normal / np.linalg.norm(normal)

            d = -np.dot(normal, p0)
            dists = [np.dot(normal, v) + d for v in tri_other]

            if all(d > tolerance for d in dists) or all(d < -tolerance for d in dists):
                return False

    for v in t1:
        if _point_in_triangle(v, t2, tolerance):
            return True
    for v in t2:
        if _point_in_triangle(v, t1, tolerance):
            return True

    edges1 = [(t1[0], t1[1]), (t1[1], t1[2]), (t1[2], t1[0])]
    edges2 = [(t2[0], t2[1]), (t2[1], t2[2]), (t2[2], t2[0])]
    for (a1, a2) in edges1:
        for (b1, b2) in edges2:
            if _seg_intersect_seg(a1, a2, b1, b2, tolerance):
                return True

    return False


def _point_in_triangle(p, tri, tolerance):
    v0 = tri[2] - tri[0]
    v1 = tri[1] - tri[0]
    v2 = p - tri[0]

    dot00 = np.dot(v0, v0)
    dot01 = np.dot(v0, v1)
    dot02 = np.dot(v0, v2)
    dot11 = np.dot(v1, v1)
    dot12 = np.dot(v1, v2)

    denom = dot00 * dot11 - dot01 * dot01
    if abs(denom) < 1e-10:
        return False

    u = (dot11 * dot02 - dot01 * dot12) / denom
    v = (dot00 * dot12 - dot01 * dot02) / denom

    return (u >= -tolerance) and (v >= -tolerance) and (u + v <= 1 + tolerance)


def _seg_intersect_seg(a1, a2, b1, b2, tolerance):
    u = a2 - a1
    v = b2 - b1
    w = a1 - b1

    denom = np.dot(u, v)
    if abs(denom) < 1e-10:
        return False

    s = np.dot(v, w) / denom
    t = np.dot(u, w) / denom

    return -tolerance <= s <= 1 + tolerance and -tolerance <= t <= 1 + tolerance


def mesh_intersect_mesh(vertices1: np.ndarray, faces1: np.ndarray,
                        vertices2: np.ndarray, faces2: np.ndarray,
                        tolerance: float = 1e-6,
                        early_exit: bool = True) -> Tuple[bool, int]:
    tris1 = vertices1[faces1]
    tris2 = vertices2[faces2]

    intersect_count = 0

    for i, t1 in enumerate(tris1):
        for j, t2 in enumerate(tris2):
            if tri_intersect_tri(t1, t2, tolerance):
                intersect_count += 1
                if early_exit:
                    return True, intersect_count

    return intersect_count > 0, intersect_count


@dataclass
class CollisionResult:
    element_a_id: int
    element_b_id: int
    element_a_ifc_id: str
    element_b_ifc_id: str
    element_a_type: str
    element_b_type: str
    element_a_name: str
    element_b_name: str
    level: str
    aabb_intersect: bool
    obb_intersect: Optional[bool]
    mesh_intersect: Optional[bool]
    intersection_count: Optional[int]


class CollisionDetector:
    def __init__(self, elements: List[Dict]):
        self.elements = []
        for e in elements:
            if e.get('aabb_min') and e.get('aabb_max'):
                self.elements.append(e)

    def detect(self, mode: str = 'precise',
               aabb_tolerance: float = 0.001,
               obb_tolerance: float = 0.0,
               mesh_tolerance: float = 1e-6) -> List[CollisionResult]:

        results = []
        aabb_collisions = []

        for i in range(len(self.elements)):
            for j in range(i + 1, len(self.elements)):
                elem_a = self.elements[i]
                elem_b = self.elements[j]

                aabb_min_a = parse_aabb(elem_a['aabb_min'])
                aabb_max_a = parse_aabb(elem_a['aabb_max'])
                aabb_min_b = parse_aabb(elem_b['aabb_min'])
                aabb_max_b = parse_aabb(elem_b['aabb_max'])

                aabb_min_a_exp, aabb_max_a_exp = aabb_expand(
                    aabb_min_a, aabb_max_a, -aabb_tolerance)

                if not aabb_intersect(aabb_min_a_exp, aabb_max_a_exp,
                                      aabb_min_b, aabb_max_b):
                    continue

                aabb_collisions.append((i, j, elem_a, elem_b))

                result = CollisionResult(
                    element_a_id=elem_a['id'],
                    element_b_id=elem_b['id'],
                    element_a_ifc_id=elem_a['ifc_id'],
                    element_b_ifc_id=elem_b['ifc_id'],
                    element_a_type=elem_a['ifc_type'],
                    element_b_type=elem_b['ifc_type'],
                    element_a_name=elem_a['name'],
                    element_b_name=elem_b['name'],
                    level='aabb',
                    aabb_intersect=True,
                    obb_intersect=None,
                    mesh_intersect=None,
                    intersection_count=None,
                )

                if mode == 'aabb':
                    results.append(result)

        if mode == 'aabb':
            return results

        for (i, j, elem_a, elem_b) in aabb_collisions:
            result = next((r for r in results
                           if r.element_a_id == elem_a['id'] and r.element_b_id == elem_b['id']),
                          CollisionResult(
                              element_a_id=elem_a['id'],
                              element_b_id=elem_b['id'],
                              element_a_ifc_id=elem_a['ifc_id'],
                              element_b_ifc_id=elem_b['ifc_id'],
                              element_a_type=elem_a['ifc_type'],
                              element_b_type=elem_b['ifc_type'],
                              element_a_name=elem_a['name'],
                              element_b_name=elem_b['name'],
                              level='aabb',
                              aabb_intersect=True,
                              obb_intersect=None,
                              mesh_intersect=None,
                              intersection_count=None,
                          ))

            obb_ok = True
            try:
                verts_a = np.array(json.loads(elem_a['vertices_json'])).reshape(-1, 3)
                verts_b = np.array(json.loads(elem_b['vertices_json'])).reshape(-1, 3)

                if len(verts_a) >= 3 and len(verts_b) >= 3:
                    obb_a = OBB.from_vertices(verts_a)
                    obb_b = OBB.from_vertices(verts_b)
                    obb_hit = obb_intersect(obb_a, obb_b, obb_tolerance)
                    result.obb_intersect = obb_hit

                    if not obb_hit:
                        result.level = 'obb'
                        results.append(result)
                        continue
                else:
                    obb_ok = False
            except Exception:
                obb_ok = False

            if mode == 'obb':
                result.level = 'obb' if obb_ok else 'aabb'
                results.append(result)
                continue

            mesh_hit = False
            intersect_count = 0
            try:
                faces_a = np.array(json.loads(elem_a['faces_json'])).reshape(-1, 3)
                faces_b = np.array(json.loads(elem_b['faces_json'])).reshape(-1, 3)

                if len(verts_a) >= 3 and len(verts_b) >= 3 and len(faces_a) > 0 and len(faces_b) > 0:
                    mesh_hit, intersect_count = mesh_intersect_mesh(
                        verts_a, faces_a, verts_b, faces_b, mesh_tolerance, early_exit=True)
                    result.mesh_intersect = mesh_hit
                    result.intersection_count = intersect_count
                    result.level = 'mesh'

                    if mesh_hit:
                        results.append(result)
                else:
                    results.append(result)
            except Exception:
                results.append(result)

        return results
