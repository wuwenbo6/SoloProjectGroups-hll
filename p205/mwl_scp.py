from pynetdicom import AE, evt
from pynetdicom.sop_class import ModalityWorklistInformationFind
from pydicom.dataset import Dataset
from pydicom.uid import ExplicitVRLittleEndian, ImplicitVRLittleEndian
import logging
from database import search_worklist, init_db

init_db()

LOGGER = logging.getLogger("pynetdicom")

def _get_str(ds, tag):
    if tag in ds and ds[tag].value:
        return str(ds[tag].value)
    return None

def _get_seq_first(ds, tag):
    if tag in ds and ds[tag].value and len(ds[tag].value) > 0:
        return ds[tag].value[0]
    return None

def handle_find(event):
    try:
        ds = event.identifier
        patient_name = _get_str(ds, "PatientName")
        patient_id = _get_str(ds, "PatientID")
        study_uid = _get_str(ds, "StudyInstanceUID")
        accession_number = _get_str(ds, "AccessionNumber")
        referring_physician = _get_str(ds, "ReferringPhysicianName")
        study_description = _get_str(ds, "StudyDescription")
        modality = None
        scheduled_station_ae = None
        scheduled_date = None
        sps_seq = _get_seq_first(ds, "ScheduledProcedureStepSequence")
        if sps_seq is not None:
            modality = _get_str(sps_seq, "Modality") or _get_str(ds, "Modality")
            scheduled_station_ae = _get_str(sps_seq, "ScheduledStationAETitle")
            scheduled_date = _get_str(sps_seq, "ScheduledProcedureStepStartDate")
        else:
            modality = _get_str(ds, "Modality")
        results = search_worklist(
            patient_name=patient_name,
            patient_id=patient_id,
            study_uid=study_uid,
            accession_number=accession_number,
            modality=modality,
            referring_physician=referring_physician,
            scheduled_date=scheduled_date,
            scheduled_station_ae=scheduled_station_ae,
            study_description=study_description,
        )
        for item in results:
            rsp = Dataset()
            rsp.SpecificCharacterSet = "ISO_IR 100"
            rsp.PatientName = item["patient_name"] or ""
            rsp.PatientID = item["patient_id"] or ""
            rsp.PatientBirthDate = item["patient_birth_date"] or ""
            rsp.PatientSex = item["patient_sex"] or ""
            rsp.StudyInstanceUID = item["study_uid"] or ""
            rsp.AccessionNumber = item["accession_number"] or ""
            rsp.StudyDate = item["study_date"] or ""
            rsp.StudyTime = item["study_time"] or ""
            rsp.StudyDescription = item["study_description"] or ""
            rsp.ReferringPhysicianName = item["referring_physician"] or ""
            rsp.ModalitiesInStudy = item["modality_in_study"] or ""
            rsp.InstitutionName = item["institution_name"] or ""
            rsp.InstitutionalDepartmentName = item["institution_name"] or ""
            rsp.RequestedProcedureDescription = item["requested_proc_description"] or ""
            rsp.RequestedProcedureID = item["requested_proc_id"] or ""
            rsp.RequestingPhysician = item["physician_name"] or ""
            sps = Dataset()
            sps.ScheduledStationAETitle = item["scheduled_station_ae"] or ""
            sps.ScheduledProcedureStepStartDate = item["scheduled_date"] or ""
            sps.ScheduledProcedureStepStartTime = item["scheduled_time"] or ""
            sps.ScheduledPerformingPhysicianName = item["scheduled_performing_physician"] or ""
            sps.ScheduledProcedureStepDescription = item["procedure_description"] or ""
            sps.ScheduledProcedureStepID = item["procedure_id"] or ""
            sps.ScheduledStationName = item["station_name"] or ""
            sps.ScheduledProcedureStepStatus = item["scheduled_proc_step_status"] or "SCHEDULED"
            sps.Modality = item["modality"] or ""
            rsp.ScheduledProcedureStepSequence = [sps]
            yield 0xFF00, rsp
    except Exception as e:
        LOGGER.error(f"Error handling C-FIND: {e}", exc_info=True)
        yield 0xC000, None

def main():
    ae = AE(ae_title="MWL_SCP")
    transfer_syntaxes = [
        ExplicitVRLittleEndian,
        ImplicitVRLittleEndian,
    ]
    ae.add_supported_context(ModalityWorklistInformationFind, transfer_syntaxes)
    handlers = [(evt.EVT_C_FIND, handle_find)]
    print("Starting DICOM MWL SCP on port 11112...")
    print("AE Title: MWL_SCP")
    print("Press Ctrl+C to stop")
    ae.start_server(("0.0.0.0", 11112), evt_handlers=handlers)

if __name__ == "__main__":
    main()