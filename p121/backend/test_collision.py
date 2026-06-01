import sys
import os
import json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from collision_detector import (
    OBB, aabb_intersect, aabb_expand, obb_intersect,
    tri_intersect_tri, mesh_intersect_mesh, CollisionDetector
)


def test_aabb():
    min1 = np.array([0, 0, 0])
    max1 = np.array([1, 1, 1])
    min2 = np.array([0.5, 0.5, 0.5])
    max2 = np.array([1.5, 1.5, 1.5])

    assert aabb_intersect(min1, max1, min2, max2) == True
    assert aabb_intersect(min1, max1, min2, max2, tolerance=0.6) == True

    min3 = np.array([2, 2, 2])
    max3 = np.array([3, 3, 3])
    assert aabb_intersect(min1, max1, min3, max3) == False
    assert aabb_intersect(min1, max1, min3, max3, tolerance=1.5) == True

    print("✓ AABB 测试通过")


def test_obb():
    v1 = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
                   [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], dtype=np.float64)
    obb1 = OBB.from_vertices(v1)

    v2 = v1 + np.array([0.5, 0.5, 0.5])
    obb2 = OBB.from_vertices(v2)
    assert obb_intersect(obb1, obb2) == True

    v3 = v1 + np.array([3, 0, 0])
    obb3 = OBB.from_vertices(v3)
    assert obb_intersect(obb1, obb3) == False

    angle = np.pi / 4
    rot = np.array([
        [np.cos(angle), -np.sin(angle), 0],
        [np.sin(angle), np.cos(angle), 0],
        [0, 0, 1]
    ])
    v4 = (v1 - 0.5) @ rot + np.array([1.2, 0, 0]) + 0.5
    obb4 = OBB.from_vertices(v4)
    assert obb_intersect(obb1, obb4) == False

    print("✓ OBB 测试通过")


def test_triangle_intersection():
    t1 = np.array([[0, 0, 0], [1, 0, 0], [0.5, 1, 0]], dtype=np.float64)
    t2 = np.array([[0.25, 0.5, -0.5], [0.75, 0.5, -0.5], [0.5, 0.5, 0.5]], dtype=np.float64)
    assert tri_intersect_tri(t1, t2) == True

    t3 = np.array([[2, 0, 0], [3, 0, 0], [2.5, 1, 0]], dtype=np.float64)
    assert tri_intersect_tri(t1, t3) == False

    t4 = np.array([[0, 0, 0.0001], [1, 0, 0.0001], [0.5, 1, 0.0001]], dtype=np.float64)
    assert tri_intersect_tri(t1, t4, tolerance=1e-3) == True
    assert tri_intersect_tri(t1, t4, tolerance=1e-6) == False

    print("✓ 三角面相交测试通过")


def test_mesh_intersection():
    v1 = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
                   [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], dtype=np.float64)
    f1 = np.array([[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6],
                   [0, 4, 5], [0, 5, 1], [2, 6, 7], [2, 7, 3],
                   [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2]], dtype=np.int64)

    v2 = v1 + np.array([0.5, 0.5, 0.5])
    hit, count = mesh_intersect_mesh(v1, f1, v2, f1)
    assert hit == True
    assert count > 0

    v3 = v1 + np.array([3, 0, 0])
    hit, count = mesh_intersect_mesh(v1, f1, v3, f1)
    assert hit == False
    assert count == 0

    print("✓ 网格相交测试通过")


def test_collision_detector():
    elements = [
        {
            'id': 1, 'ifc_id': 'a1', 'ifc_type': 'IfcWall', 'name': '墙1',
            'aabb_min': '0,0,0', 'aabb_max': '1,1,1',
            'vertices_json': json.dumps([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
                                         0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]),
            'faces_json': json.dumps([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
                                      0, 4, 5, 0, 5, 1, 2, 6, 7, 2, 7, 3,
                                      0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2]),
        },
        {
            'id': 2, 'ifc_id': 'a2', 'ifc_type': 'IfcWall', 'name': '墙2',
            'aabb_min': '0.5,0.5,0.5', 'aabb_max': '1.5,1.5,1.5',
            'vertices_json': json.dumps([0.5, 0.5, 0.5, 1.5, 0.5, 0.5, 1.5, 1.5, 0.5, 0.5, 1.5, 0.5,
                                         0.5, 0.5, 1.5, 1.5, 0.5, 1.5, 1.5, 1.5, 1.5, 0.5, 1.5, 1.5]),
            'faces_json': json.dumps([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
                                      0, 4, 5, 0, 5, 1, 2, 6, 7, 2, 7, 3,
                                      0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2]),
        },
        {
            'id': 3, 'ifc_id': 'a3', 'ifc_type': 'IfcColumn', 'name': '柱1',
            'aabb_min': '3,3,3', 'aabb_max': '4,4,4',
            'vertices_json': json.dumps([3, 3, 3, 4, 3, 3, 4, 4, 3, 3, 4, 3,
                                         3, 3, 4, 4, 3, 4, 4, 4, 4, 3, 4, 4]),
            'faces_json': json.dumps([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
                                      0, 4, 5, 0, 5, 1, 2, 6, 7, 2, 7, 3,
                                      0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2]),
        },
    ]

    detector = CollisionDetector(elements)

    results_aabb = detector.detect(mode='aabb')
    assert len(results_aabb) == 1
    assert results_aabb[0].element_a_id == 1
    assert results_aabb[0].element_b_id == 2
    assert results_aabb[0].level == 'aabb'

    results_precise = detector.detect(mode='precise')
    assert len(results_precise) == 1
    assert results_precise[0].mesh_intersect == True
    assert results_precise[0].level == 'mesh'

    results_precise_small_tol = detector.detect(mode='precise', aabb_tolerance=0.1)
    assert len(results_precise_small_tol) == 1

    elements_touching = elements.copy()
    elements_touching[1] = {
        'id': 2, 'ifc_id': 'a2', 'ifc_type': 'IfcWall', 'name': '墙2',
        'aabb_min': '0.9999,0,0', 'aabb_max': '1.9999,1,1',
        'vertices_json': json.dumps([0.9999, 0, 0, 1.9999, 0, 0, 1.9999, 1, 0, 0.9999, 1, 0,
                                     0.9999, 0, 1, 1.9999, 0, 1, 1.9999, 1, 1, 0.9999, 1, 1]),
        'faces_json': json.dumps([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
                                  0, 4, 5, 0, 5, 1, 2, 6, 7, 2, 7, 3,
                                  0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2]),
    }
    detector_touching = CollisionDetector(elements_touching)
    results_no_tol = detector_touching.detect(mode='aabb', aabb_tolerance=0.0)
    assert len(results_no_tol) == 1

    results_with_tol = detector_touching.detect(mode='aabb', aabb_tolerance=0.001)
    assert len(results_with_tol) == 0

    print("✓ 碰撞检测器测试通过")


if __name__ == '__main__':
    test_aabb()
    test_obb()
    test_triangle_intersection()
    test_mesh_intersection()
    test_collision_detector()
    print("\n🎉 所有测试通过！")
