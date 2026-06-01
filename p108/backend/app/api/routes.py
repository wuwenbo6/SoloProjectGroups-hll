from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import os

from app.core.database import get_db
from app.schemas.simulation import (
    SimulationParams,
    SimulationParamsCreate,
    SimulationStartRequest
)
from app.services.parameter_service import ParameterService
from app.services.simulation_service import simulation_service

router = APIRouter()


@router.get("/health")
async def health_check():
    return {"status": "healthy", "message": "PhaseField Simulation API is running"}


@router.get("/exports/{filename}")
async def download_export(filename: str):
    """下载导出的OBJ序列ZIP文件"""
    filepath = os.path.join("exports", filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Export file not found")
    return FileResponse(
        filepath,
        media_type="application/zip",
        filename=filename
    )


@router.get("/parameters", response_model=List[SimulationParams])
def get_all_parameters(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return ParameterService.get_all_params(db, skip=skip, limit=limit)


@router.get("/parameters/{params_id}", response_model=SimulationParams)
def get_parameter(params_id: int, db: Session = Depends(get_db)):
    params = ParameterService.get_params(db, params_id)
    if params is None:
        raise HTTPException(status_code=404, detail="Parameter set not found")
    return params


@router.post("/parameters", response_model=SimulationParams)
def create_parameter(params: SimulationParamsCreate, db: Session = Depends(get_db)):
    return ParameterService.create_params(db, params)


@router.delete("/parameters/{params_id}")
def delete_parameter(params_id: int, db: Session = Depends(get_db)):
    success = ParameterService.delete_params(db, params_id)
    if not success:
        raise HTTPException(status_code=404, detail="Parameter set not found")
    return {"message": "Parameter set deleted successfully"}


@router.websocket("/ws/simulate")
async def websocket_simulation(websocket: WebSocket):
    await websocket.accept()
    
    try:
        init_data = await websocket.receive_json()
        
        if init_data.get('type') == 'start':
            params = init_data.get('params', {})
            await simulation_service.start_simulation(websocket, params)
        
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "data": {"message": str(e)}})
        except:
            pass
