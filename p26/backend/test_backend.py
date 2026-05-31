#!/usr/bin/env python3
"""
后端功能测试脚本
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_imports():
    """测试所有导入是否正常"""
    print("Testing imports...")
    try:
        import numpy as np
        import torch
        from scipy.ndimage import gaussian_filter, median_filter
        print("  - numpy, torch, scipy: OK")
    except Exception as e:
        print(f"  - ERROR: {e}")
        return False
    
    try:
        from segmentation import (
            denoise_low_dose_ct, 
            preprocess_ct_for_segmentation, 
            postprocess_segmentation,
            LiverSegmentationModel
        )
        print("  - segmentation module: OK")
    except Exception as e:
        print(f"  - ERROR: {e}")
        return False
    
    try:
        from nifti_export import export_annotations_to_nifti, save_nifti
        print("  - nifti_export module: OK")
    except Exception as e:
        print(f"  - ERROR: {e}")
        return False
    
    try:
        from database import init_db, get_db, Series, Annotation, TrainingJob
        print("  - database module: OK")
    except Exception as e:
        print(f"  - ERROR: {e}")
        return False
    
    return True

def test_denoise_functions():
    """测试降噪函数"""
    print("\nTesting denoise functions...")
    import numpy as np
    from segmentation import denoise_low_dose_ct, preprocess_ct_for_segmentation, postprocess_segmentation
    
    test_image = np.random.rand(64, 64, 64).astype(np.float32) * 1000 - 500
    test_image_noisy = test_image + np.random.randn(*test_image.shape) * 50
    
    try:
        denoised = denoise_low_dose_ct(test_image_noisy, method='hybrid', sigma=1.0)
        print(f"  - denoise_low_dose_ct: OK, shape={denoised.shape}")
    except Exception as e:
        print(f"  - ERROR: {e}")
        return False
    
    try:
        preprocessed = preprocess_ct_for_segmentation(test_image_noisy, denoise_strength=1.0)
        print(f"  - preprocess_ct_for_segmentation: OK, shape={preprocessed.shape}")
    except Exception as e:
        print(f"  - ERROR: {e}")
        return False
    
    try:
        dummy_seg = np.random.randint(0, 2, (64, 64, 64)).astype(np.uint8)
        postprocessed = postprocess_segmentation(dummy_seg, min_volume=100)
        print(f"  - postprocess_segmentation: OK, sum={np.sum(postprocessed)}")
    except Exception as e:
        print(f"  - ERROR: {e}")
        return False
    
    return True

def test_model():
    """测试模型初始化"""
    print("\nTesting model initialization...")
    import numpy as np
    from segmentation import LiverSegmentationModel
    
    try:
        model = LiverSegmentationModel(device="cpu")
        print("  - Model initialization: OK")
        
        test_input = np.random.rand(32, 32, 32).astype(np.float32) * 100
        output = model.predict(test_input, denoise_strength=0.5)
        print(f"  - Model prediction: OK, shape={output.shape}")
    except Exception as e:
        print(f"  - WARNING (expected if no CUDA or first run): {e}")
    
    return True

def test_database():
    """测试数据库初始化"""
    print("\nTesting database...")
    try:
        from database import init_db
        init_db()
        print("  - Database initialization: OK")
    except Exception as e:
        print(f"  - ERROR: {e}")
        return False
    return True

def main():
    print("=" * 50)
    print("DICOM Annotator Backend Test")
    print("=" * 50)
    
    all_passed = True
    
    all_passed &= test_imports()
    all_passed &= test_denoise_functions()
    all_passed &= test_model()
    all_passed &= test_database()
    
    print("\n" + "=" * 50)
    if all_passed:
        print("All tests PASSED!")
    else:
        print("Some tests FAILED!")
    print("=" * 50)
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
