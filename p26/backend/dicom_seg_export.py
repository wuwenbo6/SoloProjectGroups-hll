import os
import numpy as np
import pydicom
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import generate_uid, ExplicitVRLittleEndian, ImplicitVRLittleEndian
from datetime import datetime, timezone
from PIL import Image, ImageDraw

def create_dicom_seg(
    annotations,
    output_path,
    reference_dicom_path=None,
    image_size=(512, 512, 1),
    series_description="DICOM Segmentation"
):
    """
    创建DICOM-SEG格式的分割文件
    
    参数:
        annotations: 标注数据字典 {slice_idx: [annotations]}
        output_path: 输出文件路径
        reference_dicom_path: 参考DICOM文件路径（用于复制元数据）
        image_size: 图像尺寸 (width, height, num_slices)
        series_description: 系列描述
    """
    print(f"Creating DICOM-SEG: {output_path}")
    
    width, height, num_slices = image_size
    
    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = '1.2.840.10008.5.1.4.1.1.66.4'
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    
    ds = FileDataset(
        output_path,
        {},
        file_meta=file_meta,
        preamble=b"\x00" * 128
    )
    
    ds.is_little_endian = True
    ds.is_implicit_VR = False
    
    now = datetime.now(timezone.utc)
    ds.ContentDate = now.strftime('%Y%m%d')
    ds.ContentTime = now.strftime('%H%M%S.%f')[:-3]
    
    ds.SOPClassUID = '1.2.840.10008.5.1.4.1.1.66.4'
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.SeriesNumber = 1
    ds.InstanceNumber = 1
    
    ds.PatientName = "Anonymous"
    ds.PatientID = "ANON001"
    ds.PatientBirthDate = ""
    ds.PatientSex = ""
    
    ds.StudyDate = now.strftime('%Y%m%d')
    ds.StudyTime = now.strftime('%H%M%S')
    ds.StudyDescription = "DICOM Annotation Study"
    
    ds.SeriesDescription = series_description
    ds.Modality = "SEG"
    
    ds.Manufacturer = "DICOM Annotator"
    ds.ManufacturerModelName = "DICOM Annotator v1.0"
    ds.SoftwareVersions = "1.0"
    
    ds.Rows = height
    ds.Columns = width
    ds.NumberOfFrames = num_slices
    
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    
    ds.ImageType = ["DERIVED", "PRIMARY", "SEGMENTATION"]
    
    ds.ImagePositionPatient = [-250.0, -250.0, -num_slices / 2 * 3.0]
    ds.ImageOrientationPatient = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
    ds.SliceThickness = 3.0
    ds.SpacingBetweenSlices = 3.0
    ds.PixelSpacing = [0.9765625, 0.9765625]
    
    if reference_dicom_path and os.path.exists(reference_dicom_path):
        try:
            ref_ds = pydicom.dcmread(reference_dicom_path)
            if hasattr(ref_ds, 'PatientName'):
                ds.PatientName = ref_ds.PatientName
            if hasattr(ref_ds, 'PatientID'):
                ds.PatientID = ref_ds.PatientID
            if hasattr(ref_ds, 'StudyInstanceUID'):
                ds.StudyInstanceUID = ref_ds.StudyInstanceUID
            if hasattr(ref_ds, 'PixelSpacing'):
                ds.PixelSpacing = ref_ds.PixelSpacing
            if hasattr(ref_ds, 'ImagePositionPatient'):
                ds.ImagePositionPatient = ref_ds.ImagePositionPatient
            if hasattr(ref_ds, 'ImageOrientationPatient'):
                ds.ImageOrientationPatient = ref_ds.ImageOrientationPatient
            if hasattr(ref_ds, 'SliceThickness'):
                ds.SliceThickness = ref_ds.SliceThickness
            print("Copied metadata from reference DICOM")
        except Exception as e:
            print(f"Could not read reference DICOM: {e}")
    
    pixel_data = np.zeros((num_slices, height, width), dtype=np.uint8)
    
    label_map = {}
    current_label = 1
    
    for slice_idx_str, anns in annotations.items():
        slice_idx = int(slice_idx_str)
        if 0 <= slice_idx < num_slices:
            for ann in anns:
                label = ann.get('label', 'Lesion')
                if label not in label_map:
                    label_map[label] = current_label
                    current_label += 1
                
                if ann.get('type') == 'polygon' and 'points' in ann:
                    mask = polygon_to_mask(ann['points'], width, height)
                    pixel_data[slice_idx][mask > 0] = label_map[label]
    
    ds.PixelData = pixel_data.tobytes()
    
    ds.SegmentSequence = []
    for label_name, label_num in label_map.items():
        segment = Dataset()
        segment.SegmentNumber = label_num
        segment.SegmentLabel = label_name
        segment.SegmentDescription = f"Segmentation: {label_name}"
        segment.SegmentedPropertyCategoryCodeSequence = [Dataset()]
        segment.SegmentedPropertyCategoryCodeSequence[0].CodeValue = "T-D000A"
        segment.SegmentedPropertyCategoryCodeSequence[0].CodingSchemeDesignator = "SRT"
        segment.SegmentedPropertyCategoryCodeSequence[0].CodeMeaning = "Anatomical Structure"
        segment.SegmentedPropertyTypeCodeSequence = [Dataset()]
        segment.SegmentedPropertyTypeCodeSequence[0].CodeValue = "T-11200"
        segment.SegmentedPropertyTypeCodeSequence[0].CodingSchemeDesignator = "SRT"
        segment.SegmentedPropertyTypeCodeSequence[0].CodeMeaning = label_name
        ds.SegmentSequence.append(segment)
    
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    ds.save_as(output_path)
    
    print(f"DICOM-SEG saved to: {output_path}")
    return output_path

def polygon_to_mask(polygon_points, width, height):
    """将多边形转换为二进制掩码"""
    img = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(img)
    
    points = [(p['x'], p['y']) for p in polygon_points]
    if len(points) >= 3:
        draw.polygon(points, fill=1)
    
    return np.array(img)

def annotations_to_volume(annotations, image_size):
    """将标注转换为3D体积"""
    width, height, num_slices = image_size
    volume = np.zeros((height, width, num_slices), dtype=np.uint8)
    
    label_map = {}
    current_label = 1
    
    for slice_idx_str, anns in annotations.items():
        slice_idx = int(slice_idx_str)
        if 0 <= slice_idx < num_slices:
            for ann in anns:
                label = ann.get('label', 'Lesion')
                if label not in label_map:
                    label_map[label] = current_label
                    current_label += 1
                
                if ann.get('type') == 'polygon' and 'points' in ann:
                    mask = polygon_to_mask(ann['points'], width, height)
                    volume[:, :, slice_idx] = np.where(
                        mask > 0,
                        label_map[label],
                        volume[:, :, slice_idx]
                    )
    
    return volume, label_map

if __name__ == "__main__":
    test_annotations = {
        "0": [
            {
                "type": "polygon",
                "points": [
                    {"x": 100, "y": 100},
                    {"x": 200, "y": 100},
                    {"x": 150, "y": 200}
                ],
                "label": "Test"
            }
        ]
    }
    
    create_dicom_seg(
        test_annotations,
        "test_seg.dcm",
        image_size=(512, 512, 1)
    )
    print("Test DICOM-SEG created")
