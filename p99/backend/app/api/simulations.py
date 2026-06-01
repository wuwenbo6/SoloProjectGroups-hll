from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from backend.app.models.database import get_db
from backend.app.schemas.simulation import SimulationCreate, SimulationResponse
from backend.app.services.simulation_service import SimulationService
from backend.app.services.advanced_features import (
    run_backward_tracery,
    run_multi_source_simulation,
    export_kml
)

router = APIRouter()

@router.post("/", response_model=SimulationResponse)
def create_simulation(simulation: SimulationCreate, db: Session = Depends(get_db)):
    service = SimulationService(db)
    return service.create_simulation(simulation)

@router.get("/", response_model=List[SimulationResponse])
def get_simulations(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    service = SimulationService(db)
    return service.get_all_simulations(skip, limit)

@router.get("/{simulation_id}", response_model=SimulationResponse)
def get_simulation(simulation_id: int, db: Session = Depends(get_db)):
    service = SimulationService(db)
    simulation = service.get_simulation(simulation_id)
    if not simulation:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return simulation

@router.post("/run")
def run_simulation_endpoint(simulation: SimulationCreate, db: Session = Depends(get_db)):
    service = SimulationService(db)
    result = service.run_and_save_simulation(simulation)
    return {
        "simulation_id": result['simulation'].id,
        "grid_lats": result['result']['grid_lats'],
        "grid_lons": result['result']['grid_lons'],
        "concentrations": result['result']['concentrations'],
        "time_steps": result['result']['time_steps'],
        "time_series": result['result']['time_series'],
        "contours": result['result']['contours'],
        "particle_snapshots": result['result'].get('particle_snapshots', []),
        "num_particles_used": result['result'].get('num_particles_used', 0)
    }

@router.get("/{simulation_id}/result")
def get_simulation_result(simulation_id: int, db: Session = Depends(get_db)):
    service = SimulationService(db)
    result = service.get_simulation_result(simulation_id)
    if not result:
        raise HTTPException(status_code=404, detail="Simulation result not found")
    return result

@router.delete("/{simulation_id}")
def delete_simulation(simulation_id: int, db: Session = Depends(get_db)):
    service = SimulationService(db)
    success = service.delete_simulation(simulation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return {"message": "Simulation deleted successfully"}

class BackwardTraceryRequest(BaseModel):
    observation_lat: float
    observation_lon: float
    wind_speed: float
    wind_direction: float
    duration_hours: float = 24.0
    num_particles: int = 5000

@router.post("/backward-tracery")
def backward_tracery_endpoint(request: BackwardTraceryRequest):
    result = run_backward_tracery(
        observation_lat=request.observation_lat,
        observation_lon=request.observation_lon,
        wind_speed=request.wind_speed,
        wind_direction=request.wind_direction,
        duration_hours=request.duration_hours,
        num_particles=request.num_particles
    )
    return result

class SourceConfig(BaseModel):
    lat: float
    lon: float
    emission_rate: float
    wind_speed: float = 3.0
    wind_direction: float = 90.0
    stability_class: str = "D"

class MultiSourceRequest(BaseModel):
    sources: List[SourceConfig]
    duration_hours: float = 6.0
    grid_resolution: float = 0.003

@router.post("/multi-source")
def multi_source_endpoint(request: MultiSourceRequest):
    sources = [s.model_dump() for s in request.sources]
    result = run_multi_source_simulation(
        sources=sources,
        duration_hours=request.duration_hours,
        grid_resolution=request.grid_resolution
    )
    return result

@router.post("/{simulation_id}/export-kml")
def export_kml_endpoint(simulation_id: int, db: Session = Depends(get_db)):
    service = SimulationService(db)
    result = service.get_simulation_result(simulation_id)
    if not result:
        raise HTTPException(status_code=404, detail="Simulation result not found")
    
    kml_content = export_kml(result)
    
    return Response(
        content=kml_content,
        media_type="application/vnd.google-earth.kml+xml",
        headers={
            "Content-Disposition": f"attachment; filename=simulation_{simulation_id}.kml"
        }
    )
