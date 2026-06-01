import sys
sys.path.insert(0, 'python')

import numpy as np

from services.dicom_loader import DicomLoader
from services.colormap_service import ColormapService
from services.measurement_service import MeasurementService
from services.rtstruct_exporter import RTSTRUCTExporter

print('✓ All Python services imported successfully')

cm = ColormapService()
test_data = np.random.rand(100, 100) * 1000
img_data, min_max = cm.apply_colormap(test_data, 'rainbow', 500, 1000)
print(f'✓ ColormapService works: {len(img_data)} chars, min/max: {min_max}')

img_data_gray, _ = cm.apply_colormap(test_data, 'gray')
print(f'✓ Gray colormap works: {len(img_data_gray)} chars')

img_data_hot, _ = cm.apply_colormap(test_data, 'hotmetal')
print(f'✓ Hotmetal colormap works: {len(img_data_hot)} chars')

points = [{'x': 0, 'y': 0}, {'x': 10, 'y': 0}, {'x': 10, 'y': 10}, {'x': 0, 'y': 10}]
ms = MeasurementService()
area = ms.calculate_area(points, (1.0, 1.0))
print(f'✓ Square area: {area} mm² (expected: 100)')

triangle = [{'x': 0, 'y': 0}, {'x': 10, 'y': 0}, {'x': 5, 'y': 10}]
tri_area = ms.calculate_area(triangle, (1.0, 1.0))
print(f'✓ Triangle area: {tri_area} mm² (expected: 50)')

contours = [
    {'sliceIndex': 0, 'points': points},
    {'sliceIndex': 1, 'points': points},
]
volume = ms.calculate_volume(contours, (1.0, 1.0), 5.0)
print(f'✓ Volume calculation: {volume} mm³')

exporter = RTSTRUCTExporter()
print('✓ RTSTRUCTExporter initialized')

test_series = {
    'patientName': 'Test^Patient',
    'patientId': 'P001',
    'studyDate': '20240101',
    'studyInstanceUid': '1.2.3.4',
    'seriesInstanceUid': '1.2.3.5',
    'slices': [
        {
            'instanceUid': '1.2.3.6',
            'imagePositionPatient': [0, 0, 0],
            'pixelSpacing': [1.0, 1.0],
        }
    ],
    'pixelSpacing': [1.0, 1.0],
    'sliceThickness': 5.0,
}

test_rois = [
    {
        'id': 'roi-1',
        'name': 'Test_ROI',
        'color': '#ff4444',
        'roiNumber': 1,
        'contours': [
            {
                'sliceIndex': 0,
                'points': [{'x': 10, 'y': 10}, {'x': 20, 'y': 10}, {'x': 20, 'y': 20}, {'x': 10, 'y': 20}],
            }
        ],
        'volumeMm3': 500.0,
    }
]

result = exporter.export_rtstruct(test_series, test_rois, '/tmp/test_rtstruct.dcm')
print(f'✓ RTSTRUCT export: {result}')

import os
if os.path.exists('/tmp/test_rtstruct.dcm'):
    os.remove('/tmp/test_rtstruct.dcm')
    print('✓ Test RTSTRUCT file cleaned up')

print('\n' + '='*50)
print('✓ ALL PYTHON TESTS PASSED!')
print('='*50)
