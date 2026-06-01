import os
import datetime
import uuid
import pydicom
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import generate_uid, ImplicitVRLittleEndian
from typing import List, Dict, Any


class RTSTRUCTExporter:
    def __init__(self):
        pass

    def export_rtstruct(
        self,
        series_info: Dict[str, Any],
        rois: List[Dict[str, Any]],
        output_path: str
    ) -> Dict[str, Any]:
        try:
            file_meta = self._create_file_meta()
            
            ds = FileDataset(
                output_path,
                {},
                file_meta=file_meta,
                preamble=b"\x00" * 128
            )

            self._add_patient_module(ds, series_info)
            self._add_study_module(ds, series_info)
            self._add_series_module(ds, series_info)
            self._add_equipment_module(ds)
            self._add_rt_series_module(ds)
            
            structure_set_roi = self._create_structure_set_roi(rois)
            ds.StructureSetROISequence = structure_set_roi
            
            roi_contours = self._create_roi_contours(rois, series_info)
            ds.ROIContourSequence = roi_contours
            
            rt_roi_observations = self._create_rt_roi_observations(rois)
            ds.RTROIObservationsSequence = rt_roi_observations
            
            ds.StructureSetLabel = "RTSTRUCT"
            ds.StructureSetName = "ROI Structure Set"
            ds.StructureSetDescription = f"ROIs exported from DICOM Workstation"
            
            ds.is_little_endian = True
            ds.is_implicit_VR = True
            
            ds.save_as(output_path, write_like_original=False)
            
            return {
                "success": True,
                "filePath": output_path,
                "roiCount": len(rois)
            }
            
        except Exception as e:
            print(f"Error exporting RTSTRUCT: {e}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "filePath": "",
                "error": str(e)
            }

    def _create_file_meta(self) -> FileMetaDataset:
        file_meta = FileMetaDataset()
        file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.481.3"
        file_meta.MediaStorageSOPInstanceUID = generate_uid()
        file_meta.TransferSyntaxUID = ImplicitVRLittleEndian
        file_meta.ImplementationClassUID = "1.2.826.0.1.3680043.9.7433.1"
        return file_meta

    def _add_patient_module(self, ds: FileDataset, series_info: Dict[str, Any]):
        ds.PatientName = series_info.get('patientName', 'Unknown')
        ds.PatientID = series_info.get('patientId', 'Unknown')
        ds.PatientBirthDate = ""
        ds.PatientSex = ""

    def _add_study_module(self, ds: FileDataset, series_info: Dict[str, Any]):
        ds.StudyInstanceUID = series_info.get('studyInstanceUid', generate_uid())
        ds.StudyDate = series_info.get('studyDate', self._get_current_date())
        ds.StudyTime = self._get_current_time()
        ds.StudyID = ""
        ds.AccessionNumber = ""

    def _add_series_module(self, ds: FileDataset, series_info: Dict[str, Any]):
        ds.SeriesInstanceUID = generate_uid()
        ds.SeriesDate = self._get_current_date()
        ds.SeriesTime = self._get_current_time()
        ds.SeriesNumber = 1
        ds.Modality = "RTSTRUCT"
        ds.SeriesDescription = "RT Structure Set"

    def _add_equipment_module(self, ds: FileDataset):
        ds.Manufacturer = "DICOM Workstation"
        ds.InstitutionName = ""
        ds.DeviceSerialNumber = ""
        ds.SoftwareVersions = "1.0"

    def _add_rt_series_module(self, ds: FileDataset):
        ds.SOPClassUID = "1.2.840.10008.5.1.4.1.1.481.3"
        ds.SOPInstanceUID = generate_uid()
        ds.InstanceCreationDate = self._get_current_date()
        ds.InstanceCreationTime = self._get_current_time()
        ds.ApprovalStatus = "UNAPPROVED"

    def _create_structure_set_roi(self, rois: List[Dict[str, Any]]) -> List[Dataset]:
        sequence = []
        for roi in rois:
            item = Dataset()
            item.ROINumber = roi.get('roiNumber', len(sequence) + 1)
            item.ReferencedFrameOfReferenceUID = generate_uid()
            item.ROIName = roi.get('name', f"ROI_{item.ROINumber}")
            item.ROIDescription = f"ROI {item.ROINumber}"
            item.ROIGenerationAlgorithm = "USER"
            sequence.append(item)
        return sequence

    def _create_roi_contours(
        self,
        rois: List[Dict[str, Any]],
        series_info: Dict[str, Any]
    ) -> List[Dataset]:
        sequence = []
        slices = series_info.get('slices', [])
        
        for roi in rois:
            item = Dataset()
            item.ROIDisplayColor = self._hex_to_rgb(roi.get('color', '#ff0000'))
            
            contour_sequence = []
            for contour in roi.get('contours', []):
                slice_index = contour.get('sliceIndex', 0)
                points = contour.get('points', [])
                
                if len(points) < 3:
                    continue
                
                contour_item = Dataset()
                contour_item.ContourGeometricType = "CLOSED_PLANAR"
                contour_item.NumberOfContourPoints = len(points)
                
                slice_info = slices[slice_index] if slice_index < len(slices) else None
                image_position_patient = slice_info.get('imagePositionPatient', [0, 0, 0]) if slice_info else [0, 0, 0]
                
                contour_data = []
                for p in points:
                    pixel_spacing = series_info.get('pixelSpacing', [1, 1])
                    x_mm = p['x'] * pixel_spacing[0] + image_position_patient[0]
                    y_mm = p['y'] * pixel_spacing[1] + image_position_patient[1]
                    z_mm = image_position_patient[2]
                    contour_data.extend([x_mm, y_mm, z_mm])
                
                if points[0] != points[-1]:
                    first_p = points[0]
                    x_mm = first_p['x'] * pixel_spacing[0] + image_position_patient[0]
                    y_mm = first_p['y'] * pixel_spacing[1] + image_position_patient[1]
                    z_mm = image_position_patient[2]
                    contour_data.extend([x_mm, y_mm, z_mm])
                    contour_item.NumberOfContourPoints = len(points) + 1
                
                contour_item.ContourData = [float(x) for x in contour_data]
                
                image_seq = Dataset()
                image_seq.ReferencedSOPClassUID = "1.2.840.10008.5.1.4.1.1.2"
                image_seq.ReferencedSOPInstanceUID = slice_info.get('instanceUid', generate_uid()) if slice_info else generate_uid()
                
                contour_item.ContourImageSequence = [image_seq]
                contour_sequence.append(contour_item)
            
            item.ContourSequence = contour_sequence
            item.ReferencedROINumber = roi.get('roiNumber', len(sequence) + 1)
            sequence.append(item)
        
        return sequence

    def _create_rt_roi_observations(self, rois: List[Dict[str, Any]]) -> List[Dataset]:
        sequence = []
        for roi in rois:
            item = Dataset()
            item.ObservationNumber = roi.get('roiNumber', len(sequence) + 1)
            item.ReferencedROINumber = roi.get('roiNumber', len(sequence) + 1)
            item.ROIObservationLabel = roi.get('name', f"ROI_{item.ReferencedROINumber}")
            item.ROIObservationDescription = f"Volume: {roi.get('volumeMm3', 0):.2f} mm³"
            item.RTROIInterpretedType = "ORGAN"
            item.ROIInterpreter = ""
            sequence.append(item)
        return sequence

    def _hex_to_rgb(self, hex_color: str) -> List[int]:
        hex_color = hex_color.lstrip('#')
        if len(hex_color) == 6:
            return [int(hex_color[i:i+2], 16) for i in (0, 2, 4)]
        return [255, 0, 0]

    def _get_current_date(self) -> str:
        return datetime.datetime.now().strftime("%Y%m%d")

    def _get_current_time(self) -> str:
        return datetime.datetime.now().strftime("%H%M%S")
