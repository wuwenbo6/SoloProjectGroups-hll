import os
import sys
import json
import zipfile
import tempfile
from datetime import datetime
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from bcf_exporter import create_bcf_report
from pipe_optimizer import (
    is_pipe_element, estimate_pipe_diameter, extract_centerline,
    get_pipe_priority, create_pipe_element, find_clash_point,
    calculate_avoidance, generate_avoidance_geometry, optimize_pipe_routing
)
from sunlight_analyzer import (
    calculate_sun_position, get_sun_direction, calculate_solar_irradiance,
    ray_triangle_intersect, is_point_in_shadow, analyze_sunlight, get_exposure_color
)


def test_bcf_exporter():
    print("=== 测试 BCF 导出器 ===")

    collisions = [
        {
            'element_a': {
                'id': 1,
                'ifc_id': '2hR4kX5Sz5xPzWvU8tQ9bN',
                'ifc_type': 'IfcPipeSegment',
                'name': '管道 A-101',
            },
            'element_b': {
                'id': 2,
                'ifc_id': '3kS5mY6TxNqKzRvT7wP2dM',
                'ifc_type': 'IfcDuctSegment',
                'name': '风管 D-201',
            },
            'level': 'mesh',
            'aabb_intersect': True,
            'obb_intersect': True,
            'mesh_intersect': True,
            'intersection_count': 42,
        },
        {
            'element_a': {
                'id': 3,
                'ifc_id': '5fG7hJ9kL3mN1pQ2rS8tW',
                'ifc_type': 'IfcWallStandardCase',
                'name': '外墙',
            },
            'element_b': {
                'id': 4,
                'ifc_id': '7xY2zA4bC6dE8fG0hI2jK',
                'ifc_type': 'IfcBeam',
                'name': '梁 B-301',
            },
            'level': 'obb',
            'aabb_intersect': True,
            'obb_intersect': True,
            'mesh_intersect': False,
            'intersection_count': 0,
        },
    ]

    elements = [
        {
            'id': 1,
            'ifc_id': '2hR4kX5Sz5xPzWvU8tQ9bN',
            'ifc_type': 'IfcPipeSegment',
            'name': '管道 A-101',
            'aabb_min': '0.0,0.0,0.0',
            'aabb_max': '1.0,0.5,3.0',
            'vertices_json': json.dumps([0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.5, 0.5, 3.0]),
            'faces_json': json.dumps([0, 1, 2]),
        },
        {
            'id': 2,
            'ifc_id': '3kS5mY6TxNqKzRvT7wP2dM',
            'ifc_type': 'IfcDuctSegment',
            'name': '风管 D-201',
            'aabb_min': '0.8,-0.5,1.5',
            'aabb_max': '1.8,1.5,2.5',
            'vertices_json': json.dumps([0.8, -0.5, 1.5, 1.8, -0.5, 1.5, 1.3, 1.5, 2.5]),
            'faces_json': json.dumps([0, 1, 2]),
        },
    ]

    with tempfile.TemporaryDirectory() as tmpdir:
        bcf_path = create_bcf_report(
            model_name='测试模型',
            collisions=collisions,
            elements=elements,
            author='测试用户',
            output_dir=tmpdir,
        )

        assert os.path.exists(bcf_path), "BCF 文件不存在"
        assert bcf_path.endswith('.bcf'), "文件扩展名不正确"

        with zipfile.ZipFile(bcf_path, 'r') as zf:
            file_list = zf.namelist()
            assert 'project.bcfp' in file_list, "缺少 project.bcfp"
            assert 'bcf.version' in file_list, "缺少 bcf.version"

            dirs = set(name.split('/')[0] for name in file_list if '/' in name)
            dirs.discard('')
            assert len(dirs) >= 2, f"主题目录数量不足，期望至少 2 个，实际 {len(dirs)}"

            for topic_dir in dirs:
                assert f'{topic_dir}/markup.bcf' in file_list, f"{topic_dir} 缺少 markup.bcf"
                assert f'{topic_dir}/viewpoint.bcfv' in file_list, f"{topic_dir} 缺少 viewpoint.bcfv"
                assert f'{topic_dir}/snapshot.png' in file_list, f"{topic_dir} 缺少 snapshot.png"

            project_content = zf.read('project.bcfp').decode('utf-8')
            assert '测试模型' in project_content, "项目名称未写入"
            assert '碰撞检测报告' in project_content, "报告标题未写入"

            found_collision = False
            for topic_dir in dirs:
                markup_content = zf.read(f'{topic_dir}/markup.bcf').decode('utf-8')
                if '碰撞 #1' in markup_content and 'IfcPipeSegment' in markup_content:
                    found_collision = True
                    assert 'Critical' in markup_content or 'Major' in markup_content, "优先级未写入"
                    assert '相交三角面数: 42' in markup_content, "相交三角面数未写入"
                    break

            assert found_collision, "碰撞 #1 未找到"

        print("✓ BCF 导出测试通过")
        return True


def test_pipe_optimizer():
    print("\n=== 测试管线优化器 ===")

    assert is_pipe_element('IfcPipeSegment'), "管道识别失败"
    assert is_pipe_element('IfcDuctSegment'), "风管识别失败"
    assert is_pipe_element('IfcCableCarrierSegment'), "桥架识别失败"
    assert not is_pipe_element('IfcWall'), "墙体被误识别为管道"
    print("✓ 管线类型识别测试通过")

    vertices = np.array([
        [0.1, 0.1, 0], [0.1, -0.1, 0], [-0.1, -0.1, 0], [-0.1, 0.1, 0],
        [0.1, 0.1, 3], [0.1, -0.1, 3], [-0.1, -0.1, 3], [-0.1, 0.1, 3],
        [0.1, 0.1, 5], [0.1, -0.1, 5], [-0.1, -0.1, 5], [-0.1, 0.1, 5],
        [0.1, 0.1, 7], [0.1, -0.1, 7], [-0.1, -0.1, 7], [-0.1, 0.1, 7],
        [0.1, 0.1, 10], [0.1, -0.1, 10], [-0.1, -0.1, 10], [-0.1, 0.1, 10],
    ])
    diameter = estimate_pipe_diameter(vertices)
    assert 0.1 < diameter < 0.3, f"管径估算错误: {diameter}"
    print(f"✓ 管径估算测试通过 (估算直径: {diameter:.3f}m)")

    faces = np.array([
        [0, 1, 2], [0, 2, 3],
        [0, 4, 5], [0, 5, 1],
        [1, 5, 6], [1, 6, 2],
        [2, 6, 7], [2, 7, 3],
        [3, 7, 4], [3, 4, 0],
        [4, 8, 9], [4, 9, 5],
        [5, 9, 10], [5, 10, 6],
        [6, 10, 11], [6, 11, 7],
        [7, 11, 8], [7, 8, 4],
        [8, 12, 13], [8, 13, 9],
        [9, 13, 14], [9, 14, 10],
        [10, 14, 15], [10, 15, 11],
        [11, 15, 12], [11, 12, 8],
        [12, 16, 17], [12, 17, 13],
        [13, 17, 18], [13, 18, 14],
        [14, 18, 19], [14, 19, 15],
        [15, 19, 16], [15, 16, 12],
        [16, 17, 18], [16, 18, 19],
    ])
    centerline = extract_centerline(vertices, faces)
    assert len(centerline) == 3, "中心线点数错误"
    assert np.abs(centerline[0][2]) < 1.0, f"起点Z坐标错误: {centerline[0][2]}"
    assert np.abs(centerline[-1][2] - 10) < 1.0, f"终点Z坐标错误: {centerline[-1][2]}"
    print(f"✓ 中心线提取测试通过 (起点Z={centerline[0][2]:.2f}, 终点Z={centerline[-1][2]:.2f})")

    assert get_pipe_priority('IfcPipeSegment') == 3, "管道优先级错误"
    assert get_pipe_priority('IfcDuctSegment') == 4, "风管优先级错误"
    assert get_pipe_priority('IfcCableCarrierSegment') == 5, "桥架优先级错误"
    print("✓ 优先级分配测试通过")

    elem_data = {
        'id': 1,
        'ifc_id': 'test_pipe_1',
        'ifc_type': 'IfcPipeSegment',
        'name': '测试管道',
        'aabb_min': '-0.2,-0.2,0.0',
        'aabb_max': '0.2,0.2,10.0',
        'vertices_json': json.dumps(vertices.flatten().tolist()),
        'faces_json': json.dumps(faces.flatten().tolist()),
    }
    pipe = create_pipe_element(elem_data)
    assert pipe is not None, "管道元素创建失败"
    assert pipe.id == 1, "ID 错误"
    assert pipe.ifc_type == 'IfcPipeSegment', "类型错误"
    assert 0.1 < pipe.diameter < 0.3, "直径错误"
    print("✓ 管道元素创建测试通过")

    pipe_a = pipe
    pipe_b_verts = np.array([
        [1.0, -0.15, 4.85], [1.0, 0.15, 4.85], [1.0, 0.15, 5.15], [1.0, -0.15, 5.15],
        [-0.5, -0.15, 4.85], [-0.5, 0.15, 4.85], [-0.5, 0.15, 5.15], [-0.5, -0.15, 5.15],
    ])
    pipe_b_elem = {
        'id': 2,
        'ifc_id': 'test_pipe_2',
        'ifc_type': 'IfcDuctSegment',
        'name': '测试风管',
        'aabb_min': '-0.5,-0.15,4.85',
        'aabb_max': '1.0,0.15,5.15',
        'vertices_json': json.dumps(pipe_b_verts.flatten().tolist()),
        'faces_json': json.dumps([[0,1,2],[0,2,3],[4,6,5],[4,7,6]]),
    }
    pipe_b = create_pipe_element(pipe_b_elem)
    assert pipe_b is not None, "风管创建失败"

    clash_point = find_clash_point(pipe_a, pipe_b)
    assert -0.1 < clash_point[0] < 0.2, f"碰撞点 X 错误: {clash_point[0]}"
    assert -0.1 < clash_point[1] < 0.1, f"碰撞点 Y 错误: {clash_point[1]}"
    assert 4.5 < clash_point[2] < 5.5, f"碰撞点 Z 错误: {clash_point[2]}"
    print(f"✓ 碰撞点计算测试通过 (碰撞点: {clash_point.round(2)})")

    solution = calculate_avoidance(pipe_a, pipe_b, clash_point, clearance=0.1)
    assert solution.element_id == 1, "解决方案元素ID错误"
    assert solution.offset_distance > 0.3, f"偏移距离过小: {solution.offset_distance}"
    assert len(solution.new_centerline) == 5, "新中心线点数错误"
    print(f"✓ 避让方案计算测试通过 (偏移距离: {solution.offset_distance:.3f}m, 类型: {solution.offset_type})")

    new_verts, new_faces = generate_avoidance_geometry(
        pipe_a.vertices, pipe_a.centerline, solution,
        pipe_a.faces, pipe_a.diameter
    )
    assert len(new_verts) == len(pipe_a.vertices), "顶点数量改变"
    assert np.any(new_verts != pipe_a.vertices), "顶点未发生偏移"
    print(f"✓ 避让几何生成测试通过")

    elements = [elem_data, pipe_b_elem]
    collisions = [
        {'element_a': {'id': 1}, 'element_b': {'id': 2}},
    ]
    updated, solutions = optimize_pipe_routing(elements, collisions, clearance=0.1)
    assert len(updated) == 2, "元素数量改变"
    assert len(solutions) >= 1, "未生成解决方案"
    print(f"✓ 管线整体优化测试通过 (生成 {len(solutions)} 个避让方案)")

    print("✓ 所有管线优化测试通过")
    return True


def test_sunlight_analyzer():
    print("\n=== 测试日照分析器 ===")

    sun = calculate_sun_position(31.23, 121.47, 172, 12.0, 8.0)
    assert sun is not None, "太阳位置计算失败"
    assert 60 < sun.altitude < 90, f"夏至正午高度角过低: {sun.altitude}"
    assert 170 < sun.azimuth < 195, f"正午方位角错误: {sun.azimuth}"
    assert sun.declination > 20, f"夏至赤纬角错误: {sun.declination}"
    print(f"✓ 太阳位置计算测试通过 (夏至正午: 高度角={sun.altitude:.1f}°, 方位角={sun.azimuth:.1f}°)")

    sun_winter = calculate_sun_position(31.23, 121.47, 355, 12.0, 8.0)
    assert sun_winter.altitude < 45, f"冬至正午高度角过高: {sun_winter.altitude}"
    assert sun_winter.altitude > 20, f"冬至正午高度角过低: {sun_winter.altitude}"
    assert 170 < sun_winter.azimuth < 195, f"冬至正午方位角错误: {sun_winter.azimuth}"
    assert sun_winter.declination < -20, f"冬至赤纬角错误: {sun_winter.declination}"
    print(f"✓ 冬至太阳位置测试通过 (高度角={sun_winter.altitude:.1f}°)")

    sun_morning = calculate_sun_position(31.23, 121.47, 172, 8.0, 8.0)
    assert 80 < sun_morning.azimuth < 140, f"上午方位角错误: {sun_morning.azimuth}"
    sun_afternoon = calculate_sun_position(31.23, 121.47, 172, 16.0, 8.0)
    assert 220 < sun_afternoon.azimuth < 280, f"下午方位角错误: {sun_afternoon.azimuth}"
    print(f"✓ 上午/下午方位角测试通过 (上午={sun_morning.azimuth:.0f}°, 下午={sun_afternoon.azimuth:.0f}°)")

    sun_direction = get_sun_direction(sun)
    assert abs(np.linalg.norm(sun_direction) - 1.0) < 1e-6, "太阳方向不是单位向量"
    assert sun_direction[2] > 0, "太阳方向Z分量应为正"
    print(f"✓ 太阳方向向量测试通过 (方向: {sun_direction.round(3)})")

    irradiance = calculate_solar_irradiance(sun)
    assert 500 < irradiance < 1500, f"辐照度计算错误: {irradiance}"
    assert calculate_solar_irradiance(sun) > calculate_solar_irradiance(sun_winter), "夏季辐照度应大于冬季"

    sun_night = calculate_sun_position(31.23, 121.47, 172, 2.0, 8.0)
    assert calculate_solar_irradiance(sun_night) == 0, "夜间辐照度应为0"
    print(f"✓ 太阳辐照度计算测试通过 (正午: {irradiance:.0f} W/m², 夜间: {calculate_solar_irradiance(sun_night)} W/m²)")

    ray_origin = np.array([0.0, 0.0, 2.0])
    ray_dir = np.array([0.0, 0.0, -1.0])

    v0 = np.array([-1.0, -1.0, 0.0])
    v1 = np.array([1.0, -1.0, 0.0])
    v2 = np.array([0.0, 1.0, 0.0])

    assert ray_triangle_intersect(ray_origin, ray_dir, v0, v1, v2), "射线应与三角形相交"

    ray_miss = np.array([2.0, 0.0, -1.0])
    assert not ray_triangle_intersect(ray_origin, ray_miss, v0, v1, v2), "射线不应与三角形相交"
    print("✓ 射线三角形相交测试通过")

    all_verts = np.array([v0, v1, v2, [-1.5, -1.5, -2], [1.5, -1.5, -2], [0, 1.5, -2]])
    all_faces = np.array([[0, 1, 2], [3, 4, 5]])

    assert is_point_in_shadow(np.array([0, 0, 10]), np.array([0, 0, -1]), all_verts, all_faces, [0]), "应为阴影"
    assert not is_point_in_shadow(np.array([0, 0, -10]), np.array([0, 0, -1]), all_verts, all_faces, [0]), "不应为阴影"
    print("✓ 阴影检测测试通过")

    elements = [
        {
            'id': 1,
            'ifc_id': 'test_slab_1',
            'ifc_type': 'IfcSlab',
            'name': '屋顶板',
            'aabb_min': '-5.0,-5.0,3.0',
            'aabb_max': '5.0,5.0,3.2',
            'vertices_json': json.dumps([-5, -5, 3, 5, -5, 3, 5, 5, 3, -5, 5, 3, -5, -5, 3.2, 5, -5, 3.2, 5, 5, 3.2, -5, 5, 3.2]),
            'faces_json': json.dumps([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]),
        },
        {
            'id': 2,
            'ifc_id': 'test_room_1',
            'ifc_type': 'IfcSpace',
            'name': '室内空间',
            'aabb_min': '-4.0,-4.0,0.0',
            'aabb_max': '4.0,4.0,2.8',
            'vertices_json': json.dumps([-4, -4, 0, 4, -4, 0, 4, 4, 0, -4, 4, 0, -4, -4, 2.8, 4, -4, 2.8, 4, 4, 2.8, -4, 4, 2.8]),
            'faces_json': json.dumps([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]),
        },
    ]

    result = analyze_sunlight(
        elements,
        latitude=31.23,
        longitude=121.47,
        day_of_year=172,
        start_hour=8,
        end_hour=16,
        hour_step=2,
    )

    assert 'metadata' in result, "缺少元数据"
    assert 'sun_path' in result, "缺少太阳轨迹"
    assert 'results' in result, "缺少分析结果"
    assert 'summary' in result, "缺少统计信息"

    assert len(result['sun_path']) == 5, f"太阳轨迹点数错误: {len(result['sun_path'])}"
    assert len(result['results']) == 2, f"分析结果数量错误: {len(result['results'])}"

    slab_result = next(r for r in result['results'] if r['element_id'] == 1)
    space_result = next(r for r in result['results'] if r['element_id'] == 2)

    assert slab_result['total_hours'] >= 0, "屋顶日照时长为负"
    assert space_result['total_hours'] >= 0, "室内日照时长为负"
    assert slab_result['total_hours'] >= space_result['total_hours'], "屋顶日照时长应大于室内"

    assert result['summary']['avg_hours'] >= 0, "平均日照时长为负"
    assert result['summary']['excellent_count'] + result['summary']['good_count'] + result['summary']['moderate_count'] + result['summary']['poor_count'] + result['summary']['none_count'] == 2, "统计数量不匹配"

    print(f"✓ 完整日照分析测试通过 (平均日照: {result['summary']['avg_hours']}h, 屋顶: {slab_result['total_hours']}h, 室内: {space_result['total_hours']}h)")

    assert get_exposure_color('excellent') == '#4caf50', "优秀颜色错误"
    assert get_exposure_color('none') == '#f44336', "无日照颜色错误"
    print("✓ 曝光等级颜色测试通过")

    print("✓ 所有日照分析测试通过")
    return True


def run_all_tests():
    print("=" * 60)
    print("运行所有新功能单元测试")
    print("=" * 60)

    tests = [
        ('BCF 导出', test_bcf_exporter),
        ('管线优化', test_pipe_optimizer),
        ('日照分析', test_sunlight_analyzer),
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            failed += 1
            print(f"\n✗ {name} 测试失败: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 60)
    print(f"测试结果: {passed} 个通过, {failed} 个失败")
    print("=" * 60)

    if failed == 0:
        print("\n🎉 所有测试通过！")
    else:
        print(f"\n⚠️  有 {failed} 个测试失败")

    return failed == 0


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
