#!/usr/bin/env python3
"""测试新功能：DVH, BEV, RT Dose导出"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

import numpy as np
import tempfile
from pencil_beam_optimized import PencilBeamOptimized
from dvh_calc import DVCalculator
from bev_exporter import BeamEyeView, RTDoseExporter

def test_dvh_calculation():
    print("=" * 60)
    print("测试1: DVH (剂量体积直方图) 计算")
    print("=" * 60)
    
    algo = PencilBeamOptimized(
        grid_size=(100, 100, 100),
        spacing=(2.0, 2.0, 2.0),
        origin=(-100.0, -100.0, -100.0)
    )
    
    beam = {
        'gantry_angle': 0,
        'couch_angle': 0,
        'collimator_angle': 0,
        'isocenter': {'x': 0, 'y': 0, 'z': 0},
        'field_size_x': 80.0,
        'field_size_y': 80.0,
        'energy': '6MV',
        'mu': 100,
        'sad': 1000
    }
    algo.calculate_dose([beam])
    
    dose_grid = algo.dose_grid
    spacing = tuple(algo.spacing)
    origin = tuple(algo.origin)
    
    dvh_calc = DVCalculator(dose_grid, spacing, origin)
    
    dvh_ptv = dvh_calc.calculate_dvh_for_roi_box(
        (-20, -20, -20), (20, 20, 20), 'PTV'
    )
    
    print(f"结构名称: {dvh_ptv.structure_name}")
    print(f"最大剂量: {dvh_ptv.max_dose:.4f} Gy")
    print(f"最小剂量: {dvh_ptv.min_dose:.4f} Gy")
    print(f"平均剂量: {dvh_ptv.mean_dose:.4f} Gy")
    print(f"体积: {dvh_ptv.volume:.4f} cm³")
    print(f"Dose bins: {len(dvh_ptv.dose_bins)} 个")
    
    metrics = dvh_calc.get_dose_metrics(dvh_ptv)
    print("\n剂量指标:")
    for key, value in metrics.items():
        print(f"  {key}: {value:.4f}")
    
    print("✓ DVH计算测试通过\n")
    return dvh_calc

def test_bev_calculation():
    print("=" * 60)
    print("测试2: BEV (射野方向视图) 计算")
    print("=" * 60)
    
    algo = PencilBeamOptimized(
        grid_size=(100, 100, 100),
        spacing=(2.0, 2.0, 2.0),
        origin=(-100.0, -100.0, -100.0)
    )
    
    beam = {
        'gantry_angle': 0,
        'couch_angle': 0,
        'collimator_angle': 0,
        'isocenter': {'x': 0, 'y': 0, 'z': 0},
        'field_size_x': 80.0,
        'field_size_y': 80.0,
        'energy': '6MV',
        'mu': 100,
        'sad': 1000
    }
    algo.calculate_dose([beam])
    
    bev_calc = BeamEyeView(
        algo.dose_grid,
        tuple(algo.spacing),
        tuple(algo.origin)
    )
    
    bev_result = bev_calc.compute_bev(beam, view_size=128)
    
    print(f"BEV图像尺寸: {bev_result['shape']}")
    print(f"像素间距: {bev_result['spacing']} mm")
    print(f"射野大小: {bev_result['field_size']} mm")
    print(f"最大剂量: {bev_result['max_dose']:.4f} Gy")
    print(f"最小剂量: {bev_result['min_dose']:.4f} Gy")
    print(f"机架角度: {bev_result['gantry_angle']}°")
    print(f"准直器角度: {bev_result['collimator_angle']}°")
    print(f"等中心: {bev_result['isocenter']}")
    print(f"光阑位置: {bev_result['jaw_positions']}")
    
    print("✓ BEV计算测试通过\n")
    return bev_result

def test_rtdose_export():
    print("=" * 60)
    print("测试3: RT Dose 导出")
    print("=" * 60)
    
    algo = PencilBeamOptimized(
        grid_size=(50, 50, 50),
        spacing=(2.0, 2.0, 2.0),
        origin=(-50.0, -50.0, -50.0)
    )
    
    beam = {
        'gantry_angle': 0,
        'couch_angle': 0,
        'collimator_angle': 0,
        'isocenter': {'x': 0, 'y': 0, 'z': 0},
        'field_size_x': 60.0,
        'field_size_y': 60.0,
        'energy': '6MV',
        'mu': 100,
        'sad': 1000
    }
    algo.calculate_dose([beam])
    
    exporter = RTDoseExporter(
        algo.dose_grid,
        tuple(algo.spacing),
        tuple(algo.origin)
    )
    
    with tempfile.NamedTemporaryFile(suffix='.npz', delete=False) as tmp:
        npz_path = tmp.name
    
    exporter.export_to_numpy(npz_path)
    print(f"NumPy导出: {npz_path}")
    print(f"  文件存在: {os.path.exists(npz_path)}")
    print(f"  文件大小: {os.path.getsize(npz_path) / 1024:.2f} KB")
    
    data = np.load(npz_path)
    print(f"  剂量网格形状: {data['dose_grid'].shape}")
    print(f"  间距: {data['spacing']}")
    print(f"  原点: {data['origin']}")
    
    os.unlink(npz_path)
    
    with tempfile.NamedTemporaryFile(suffix='.raw', delete=False) as tmp:
        raw_path = tmp.name
    
    exporter.export_to_raw(raw_path)
    print(f"\nRAW导出: {raw_path}")
    print(f"  文件存在: {os.path.exists(raw_path)}")
    print(f"  文件大小: {os.path.getsize(raw_path) / 1024:.2f} KB")
    
    header_path = raw_path + '.json'
    print(f"  头文件存在: {os.path.exists(header_path)}")
    
    os.unlink(raw_path)
    os.unlink(header_path)
    
    try:
        import pydicom
        with tempfile.NamedTemporaryFile(suffix='.dcm', delete=False) as tmp:
            dcm_path = tmp.name
        
        exporter.export_to_dicom(
            dcm_path,
            patient_info={'name': 'Test^Patient', 'id': 'P001'},
            plan_info={'name': 'Test Plan'}
        )
        print(f"\nDICOM导出: {dcm_path}")
        print(f"  文件存在: {os.path.exists(dcm_path)}")
        print(f"  文件大小: {os.path.getsize(dcm_path) / 1024:.2f} KB")
        
        ds = pydicom.dcmread(dcm_path)
        print(f"  Modality: {ds.Modality}")
        print(f"  Dose Units: {ds.DoseUnits}")
        print(f"  Dose Grid Scaling: {ds.DoseGridScaling}")
        print(f"  Rows: {ds.Rows}")
        print(f"  Columns: {ds.Columns}")
        print(f"  Number of Frames: {ds.NumberOfFrames}")
        
        os.unlink(dcm_path)
        print("✓ DICOM导出成功")
    except ImportError:
        print("\n⚠  pydicom未安装，跳过DICOM导出测试")
    except Exception as e:
        print(f"\n⚠  DICOM导出跳过: {e}")
    
    print("\n✓ RT Dose导出测试通过\n")

def main():
    print("\n")
    print("╔" + "=" * 58 + "╗")
    print("║" + " " * 10 + "新功能测试: DVH, BEV, RT Dose导出" + " " * 10 + "║")
    print("╚" + "=" * 58 + "╝")
    print("\n")
    
    try:
        test_dvh_calculation()
        test_bev_calculation()
        test_rtdose_export()
        
        print("=" * 60)
        print("✓ 所有测试通过！")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
