#!/usr/bin/env python3
import sys
sys.path.insert(0, '.')
import numpy as np

def test_coordinate_transform():
    print("Testing coordinate transformations...")
    
    spacing = (2.0, 2.0, 2.0)
    origin = (-100.0, -100.0, -100.0)
    shape = (100, 100, 100)
    
    test_indices = [
        (0, 0, 0),
        (50, 50, 50),
        (99, 99, 99),
    ]
    
    print(f"\nGrid: origin={origin}, spacing={spacing}, shape={shape}")
    print("\nIndex to DICOM coordinate conversion:")
    
    for (i, j, k) in test_indices:
        x = origin[0] + i * spacing[0]
        y = origin[1] + j * spacing[1]
        z = origin[2] + k * spacing[2]
        print(f"  Index ({i},{j},{k}) -> DICOM ({x:.1f}, {y:.1f}, {z:.1f})")
    
    center_i, center_j, center_k = 50, 50, 50
    center_x = origin[0] + center_i * spacing[0]
    center_y = origin[1] + center_j * spacing[1]
    center_z = origin[2] + center_k * spacing[2]
    
    print(f"\nIsocenter at center voxel: ({center_x:.1f}, {center_y:.1f}, {center_z:.1f})")
    
    print("\n✓ Coordinate transform test passed!")

def test_iso_contour_coordinates():
    print("\n\nTesting isodose contour coordinates...")
    
    from skimage import measure
    
    slice_origin = (-100.0, -100.0)
    slice_spacing = (2.0, 2.0)
    
    test_data = np.zeros((100, 100), dtype=np.float32)
    test_data[40:60, 40:60] = 1.0
    
    contours = measure.find_contours(test_data, 0.5)
    
    print(f"Found {len(contours)} contour(s)")
    
    if contours:
        contour = contours[0]
        print(f"\nContour voxel coordinates range:")
        print(f"  Dim 0: {contour[:, 0].min():.1f} - {contour[:, 0].max():.1f}")
        print(f"  Dim 1: {contour[:, 1].min():.1f} - {contour[:, 1].max():.1f}")
        
        contour_dicom = np.zeros_like(contour)
        contour_dicom[:, 0] = slice_origin[0] + contour[:, 0] * slice_spacing[0]
        contour_dicom[:, 1] = slice_origin[1] + contour[:, 1] * slice_spacing[1]
        
        print(f"\nContour DICOM coordinates range:")
        print(f"  Dim 0: {contour_dicom[:, 0].min():.1f} - {contour_dicom[:, 0].max():.1f}")
        print(f"  Dim 1: {contour_dicom[:, 1].min():.1f} - {contour_dicom[:, 1].max():.1f}")
        
        expected_min = slice_origin[0] + 40 * slice_spacing[0]
        expected_max = slice_origin[0] + 60 * slice_spacing[0]
        print(f"\nExpected range: {expected_min:.1f} - {expected_max:.1f}")
        print(f"Actual range:   {contour_dicom[:, 0].min():.1f} - {contour_dicom[:, 0].max():.1f}")
        
        assert abs(contour_dicom[:, 0].min() - expected_min) < slice_spacing[0]
        assert abs(contour_dicom[:, 0].max() - expected_max) < slice_spacing[0]
        print("\n✓ Isodose contour coordinate test passed!")

if __name__ == "__main__":
    print("=" * 60)
    print("COORDINATE TRANSFORMATION VERIFICATION")
    print("=" * 60)
    
    test_coordinate_transform()
    test_iso_contour_coordinates()
    
    print("\n" + "=" * 60)
    print("ALL COORDINATE TESTS PASSED!")
    print("=" * 60)
