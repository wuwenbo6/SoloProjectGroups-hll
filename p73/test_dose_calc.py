#!/usr/bin/env python3
import sys
sys.path.insert(0, '.')

from backend.pencil_beam import PencilBeamAlgorithm
import numpy as np

def test_pencil_beam():
    print("Testing Pencil Beam Algorithm...")
    
    pb = PencilBeamAlgorithm(
        grid_size=(50, 50, 50),
        spacing=(4.0, 4.0, 4.0),
        origin=(-100.0, -100.0, -100.0)
    )
    
    beams = [
        {
            'gantry_angle': 0,
            'collimator_angle': 0,
            'couch_angle': 0,
            'isocenter': {'x': 0, 'y': 0, 'z': 0},
            'sad': 1000,
            'mu': 100,
            'field_size_x': 80,
            'field_size_y': 80
        },
        {
            'gantry_angle': 180,
            'collimator_angle': 0,
            'couch_angle': 0,
            'isocenter': {'x': 0, 'y': 0, 'z': 0},
            'sad': 1000,
            'mu': 100,
            'field_size_x': 80,
            'field_size_y': 80
        }
    ]
    
    result = pb.calculate_dose(beams)
    
    print(f"Grid shape: {result['shape']}")
    print(f"Max dose: {result['max_dose']:.4f}")
    print(f"Min dose: {result['min_dose']:.4f}")
    print(f"Mean dose: {np.mean(result['data']):.4f}")
    
    assert result['max_dose'] > 0, "Max dose should be positive"
    assert result['shape'] == (50, 50, 50), "Shape mismatch"
    
    print("✓ Pencil Beam test passed!")

if __name__ == "__main__":
    test_pencil_beam()
    print("\nAll tests passed!")
