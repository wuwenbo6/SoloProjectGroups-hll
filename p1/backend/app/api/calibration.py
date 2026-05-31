from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from typing import List

from app.models.calibration import (
    Calibration, CalibrationCreate, CalibrationPointCreate,
    CalibrationListResponse, CalibrationResult
)
from app.services.calibration_service import CalibrationService, get_calibration_service
from app.services.tank_service import TankService, get_tank_service
from app.utils.pdf_report import generate_calibration_report

router = APIRouter(prefix="/api/calibration", tags=["calibration"])


@router.post("", response_model=Calibration, status_code=status.HTTP_201_CREATED)
def create_calibration(
    calib_create: CalibrationCreate,
    service: CalibrationService = Depends(get_calibration_service),
    tank_service: TankService = Depends(get_tank_service)
):
    tank = tank_service.get_tank(calib_create.tank_id)
    if not tank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tank with id {calib_create.tank_id} not found"
        )
    
    return service.create_calibration(calib_create)


@router.get("/tank/{tank_id}", response_model=CalibrationListResponse)
def get_calibrations_by_tank(
    tank_id: str,
    service: CalibrationService = Depends(get_calibration_service)
):
    calibrations = service.get_calibrations_by_tank(tank_id)
    return CalibrationListResponse(
        total=len(calibrations),
        calibrations=calibrations
    )


@router.get("/{calib_id}", response_model=Calibration)
def get_calibration(
    calib_id: str,
    service: CalibrationService = Depends(get_calibration_service)
):
    calib = service.get_calibration(calib_id)
    if not calib:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Calibration with id {calib_id} not found"
        )
    return calib


@router.post("/{calib_id}/points", response_model=Calibration)
def add_calibration_point(
    calib_id: str,
    point_create: CalibrationPointCreate,
    service: CalibrationService = Depends(get_calibration_service)
):
    calib = service.add_point(calib_id, point_create)
    if not calib:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Calibration with id {calib_id} not found or already completed"
        )
    return calib


@router.post("/{calib_id}/complete", response_model=Calibration)
def complete_calibration(
    calib_id: str,
    service: CalibrationService = Depends(get_calibration_service)
):
    calib = service.get_calibration(calib_id)
    if not calib:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Calibration with id {calib_id} not found"
        )
    
    if len(calib.points) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 2 calibration points are required"
        )
    
    completed = service.complete_calibration(calib_id)
    if not completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to complete calibration"
        )
    return completed


@router.post("/{calib_id}/apply")
def apply_calibration(
    calib_id: str,
    service: CalibrationService = Depends(get_calibration_service)
):
    tank = service.apply_calibration(calib_id)
    if not tank:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to apply calibration. Ensure calibration is completed."
        )
    return {
        "message": "Calibration applied successfully",
        "tank_id": tank.id,
        "calibration_offset": tank.calibration_offset,
        "calibration_scale": tank.calibration_scale
    }


@router.get("/{calib_id}/report")
def download_calibration_report(
    calib_id: str,
    service: CalibrationService = Depends(get_calibration_service),
    tank_service: TankService = Depends(get_tank_service)
):
    calib = service.get_calibration(calib_id)
    if not calib:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Calibration with id {calib_id} not found"
        )
    
    tank = tank_service.get_tank(calib.tank_id)
    if not tank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tank with id {calib.tank_id} not found"
        )
    
    pdf_buffer = generate_calibration_report(calib, tank)
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=calibration_report_{calib_id[:8]}.pdf"
        }
    )


@router.delete("/{calib_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_calibration(
    calib_id: str,
    service: CalibrationService = Depends(get_calibration_service)
):
    success = service.delete_calibration(calib_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Calibration with id {calib_id} not found"
        )
