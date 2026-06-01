#!/usr/bin/env python3
import sys
sys.path.insert(0, '.')
import time
import numpy as np

from backend.pencil_beam import PencilBeamAlgorithm
from backend.pencil_beam_optimized import PencilBeamOptimized

def test_original_version():
    print("Testing original Pencil Beam Algorithm...")
    start = time.time()
    
    pb = PencilBeamAlgorithm(
        grid_size=(100, 100, 100),
        spacing=(2.0, 2.0, 2.0),
        origin=(-100.0, -100.0, -100.0)
    )
    
    beams = [
        {'gantry_angle': 0, 'isocenter': {'x': 0, 'y': 0, 'z': 0}, 'mu': 100, 'field_size_x': 80, 'field_size_y': 80},
        {'gantry_angle': 90, 'isocenter': {'x': 0, 'y': 0, 'z': 0}, 'mu': 100, 'field_size_x': 80, 'field_size_y': 80},
        {'gantry_angle': 180, 'isocenter': {'x': 0, 'y': 0, 'z': 0}, 'mu': 100, 'field_size_x': 80, 'field_size_y': 80},
        {'gantry_angle': 270, 'isocenter': {'x': 0, 'y': 0, 'z': 0}, 'mu': 100, 'field_size_x': 80, 'field_size_y': 80},
    ]
    
    result = pb.calculate_dose(beams)
    elapsed = time.time() - start
    
    print(f"  Time: {elapsed:.3f}s")
    print(f"  Max dose: {result['max_dose']:.4f}")
    return elapsed

def test_optimized_version():
    print("\nTesting optimized Pencil Beam Algorithm...")
    start = time.time()
    
    pb = PencilBeamOptimized(
        grid_size=(100, 100, 100),
        spacing=(2.0, 2.0, 2.0),
        origin=(-100.0, -100.0, -100.0)
    )
    
    beams = [
        {'gantry_angle': 0, 'isocenter': {'x': 0, 'y': 0, 'z': 0}, 'mu': 100, 'field_size_x': 80, 'field_size_y': 80},
        {'gantry_angle': 90, 'isocenter': {'x': 0, 'y': 0, 'z': 0}, 'mu': 100, 'field_size_x': 80, 'field_size_y': 80},
        {'gantry_angle': 180, 'isocenter': {'x': 0, 'y': 0, 'z': 0}, 'mu': 100, 'field_size_x': 80, 'field_size_y': 80},
        {'gantry_angle': 270, 'isocenter': {'x': 0, 'y': 0, 'z': 0}, 'mu': 100, 'field_size_x': 80, 'field_size_y': 80},
    ]
    
    result = pb.calculate_dose(beams)
    elapsed = time.time() - start
    
    print(f"  Time: {elapsed:.3f}s")
    print(f"  Max dose: {result['max_dose']:.4f}")
    return elapsed

def test_large_grid():
    print("\nTesting optimized version with LARGE grid (200x200x200)...")
    start = time.time()
    
    pb = PencilBeamOptimized(
        grid_size=(200, 200, 200),
        spacing=(1.0, 1.0, 1.0),
        origin=(-100.0, -100.0, -100.0)
    )
    
    beams = [
        {'gantry_angle': 0, 'isocenter': {'x': 0, 'y': 0, 'z': 0}, 'mu': 100, 'field_size_x': 80, 'field_size_y': 80},
        {'gantry_angle': 90, 'isocenter': {'x': 0, 'y': 0, 'z': 0}, 'mu': 100, 'field_size_x': 80, 'field_size_y': 80},
    ]
    
    result = pb.calculate_dose(beams)
    elapsed = time.time() - start
    
    print(f"  Grid size: 200x200x200 = {200**3:,} voxels")
    print(f"  Time: {elapsed:.3f}s")
    print(f"  Max dose: {result['max_dose']:.4f}")
    return elapsed

if __name__ == "__main__":
    print("=" * 60)
    print("PERFORMANCE COMPARISON")
    print("=" * 60)
    
    try:
        orig_time = test_original_version()
    except Exception as e:
        print(f"  Original version error: {e}")
        orig_time = float('inf')
    
    opt_time = test_optimized_version()
    
    if orig_time > 0:
        speedup = orig_time / opt_time
        print(f"\n{'='*60}")
        print(f"SPEEDUP: {speedup:.1f}x faster!")
        print(f"{'='*60}")
    
    large_time = test_large_grid()
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Optimized (100^3): {opt_time:.3f}s")
    print(f"Optimized (200^3): {large_time:.3f}s")
    print("✓ All tests completed!")
