from fastapi import APIRouter, Depends, HTTPException, status
from typing import List

from app.models.tank import Tank, TankCreate, TankUpdate, TankListResponse
from app.services.tank_service import TankService, get_tank_service

router = APIRouter(prefix="/api/tanks", tags=["tanks"])


@router.get("", response_model=TankListResponse)
def get_tanks(service: TankService = Depends(get_tank_service)):
    tanks = service.get_all_tanks()
    return TankListResponse(total=len(tanks), tanks=tanks)


@router.get("/{tank_id}", response_model=Tank)
def get_tank(tank_id: str, service: TankService = Depends(get_tank_service)):
    tank = service.get_tank(tank_id)
    if not tank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tank with id {tank_id} not found"
        )
    return tank


@router.post("", response_model=Tank, status_code=status.HTTP_201_CREATED)
def create_tank(tank_create: TankCreate, service: TankService = Depends(get_tank_service)):
    return service.create_tank(tank_create)


@router.put("/{tank_id}", response_model=Tank)
def update_tank(
    tank_id: str,
    tank_update: TankUpdate,
    service: TankService = Depends(get_tank_service)
):
    tank = service.update_tank(tank_id, tank_update)
    if not tank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tank with id {tank_id} not found"
        )
    return tank


@router.delete("/{tank_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tank(tank_id: str, service: TankService = Depends(get_tank_service)):
    success = service.delete_tank(tank_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tank with id {tank_id} not found"
        )
