from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
import json

from database import engine, get_db, Base
from models import NestingSolution, Part
from genetic_algorithm import run_nesting
from tsp_planner import optimize_cutting_path
from gcode_exporter import export_gcode
from common_edge_optimizer import optimize_common_edges
from dxf_exporter import export_dxf

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Nesting Optimizer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PartData(BaseModel):
    id: str
    points: List[List[float]]
    quantity: int = 1

class NestingRequest(BaseModel):
    parts: List[PartData]
    sheet_width: float
    sheet_height: float
    population_size: int = 30
    generations: int = 50
    mutation_rate: float = 0.2
    min_safe_distance: float = 5.0
    enable_common_edge: bool = True
    common_edge_tolerance: float = 0.5
    enable_heat_zone: bool = True
    heat_zone_distance: float = 25.0
    heat_penalty: float = 3.0

class SaveSolutionRequest(BaseModel):
    name: str
    sheet_width: float
    sheet_height: float
    utilization: float
    waste: float
    total_travel_distance: float
    placements: List[Dict]
    gcode: str

@app.get("/")
async def root():
    return {"message": "Nesting Optimizer API", "version": "1.0.0"}

@app.post("/api/nesting")
async def compute_nesting(request: NestingRequest):
    try:
        parts_data = [
            {
                "id": p.id,
                "points": [(float(pt[0]), float(pt[1])) for pt in p.points],
                "quantity": p.quantity
            }
            for p in request.parts
        ]
        
        nesting_result = run_nesting(
            parts_data,
            request.sheet_width,
            request.sheet_height,
            population_size=request.population_size,
            generations=request.generations,
            mutation_rate=request.mutation_rate
        )
        
        tsp_result = optimize_cutting_path(
            nesting_result['placements'],
            request.sheet_width,
            request.sheet_height,
            min_safe_distance=request.min_safe_distance,
            heat_zone_distance=request.heat_zone_distance,
            heat_penalty=request.heat_penalty,
            enable_heat_zone=request.enable_heat_zone
        )
        
        common_edge_result = None
        if request.enable_common_edge:
            common_edge_result = optimize_common_edges(
                tsp_result['placements'],
                tolerance=request.common_edge_tolerance
            )
        
        gcode = export_gcode(
            tsp_result['placements'],
            tsp_result['cutting_order']
        )
        
        dxf = export_dxf(
            tsp_result['placements'],
            request.sheet_width,
            request.sheet_height,
            common_edge_data=common_edge_result,
            travel_path=tsp_result.get('path_coordinates')
        )
        
        return {
            "success": True,
            "nesting": nesting_result,
            "tsp": tsp_result,
            "common_edge": common_edge_result,
            "gcode": gcode,
            "dxf": dxf
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/solutions")
async def save_solution(request: SaveSolutionRequest, db: Session = Depends(get_db)):
    try:
        solution = NestingSolution(
            name=request.name,
            sheet_width=request.sheet_width,
            sheet_height=request.sheet_height,
            material_utilization=request.utilization,
            total_waste=request.waste,
            cutting_path_length=request.total_travel_distance,
            gcode=request.gcode
        )
        db.add(solution)
        db.flush()
        
        for placement in request.placements:
            part = Part(
                solution_id=solution.id,
                name=placement.get('part_id', ''),
                x=placement.get('x', 0),
                y=placement.get('y', 0),
                rotation=placement.get('rotation', 0),
                cutting_order=placement.get('cutting_order', 0),
                path_data=json.dumps(placement.get('points', []))
            )
            db.add(part)
        
        db.commit()
        db.refresh(solution)
        
        return {"success": True, "solution_id": solution.id}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/solutions")
async def list_solutions(db: Session = Depends(get_db)):
    solutions = db.query(NestingSolution).order_by(NestingSolution.created_at.desc()).all()
    
    result = []
    for sol in solutions:
        result.append({
            "id": sol.id,
            "name": sol.name,
            "sheet_width": sol.sheet_width,
            "sheet_height": sol.sheet_height,
            "utilization": sol.material_utilization,
            "waste": sol.total_waste,
            "cutting_path_length": sol.cutting_path_length,
            "created_at": sol.created_at.isoformat() if sol.created_at else None
        })
    
    return result

@app.get("/api/solutions/{solution_id}")
async def get_solution(solution_id: int, db: Session = Depends(get_db)):
    solution = db.query(NestingSolution).filter(NestingSolution.id == solution_id).first()
    
    if not solution:
        raise HTTPException(status_code=404, detail="Solution not found")
    
    parts = db.query(Part).filter(Part.solution_id == solution_id).all()
    
    placements = []
    for part in parts:
        placements.append({
            "part_id": part.name,
            "x": part.x,
            "y": part.y,
            "rotation": part.rotation,
            "cutting_order": part.cutting_order,
            "points": json.loads(part.path_data) if part.path_data else []
        })
    
    return {
        "id": solution.id,
        "name": solution.name,
        "sheet_width": solution.sheet_width,
        "sheet_height": solution.sheet_height,
        "utilization": solution.material_utilization,
        "waste": solution.total_waste,
        "cutting_path_length": solution.cutting_path_length,
        "created_at": solution.created_at.isoformat() if solution.created_at else None,
        "placements": placements,
        "gcode": solution.gcode
    }

@app.delete("/api/solutions/{solution_id}")
async def delete_solution(solution_id: int, db: Session = Depends(get_db)):
    solution = db.query(NestingSolution).filter(NestingSolution.id == solution_id).first()
    
    if not solution:
        raise HTTPException(status_code=404, detail="Solution not found")
    
    db.query(Part).filter(Part.solution_id == solution_id).delete()
    db.delete(solution)
    db.commit()
    
    return {"success": True, "message": "Solution deleted"}

@app.get("/api/gcode/{solution_id}", response_class=PlainTextResponse)
async def download_gcode(solution_id: int, db: Session = Depends(get_db)):
    solution = db.query(NestingSolution).filter(NestingSolution.id == solution_id).first()
    
    if not solution:
        raise HTTPException(status_code=404, detail="Solution not found")
    
    return solution.gcode or ""

@app.post("/api/dxf", response_class=PlainTextResponse)
async def generate_dxf(request: NestingRequest):
    try:
        parts_data = [
            {
                "id": p.id,
                "points": [(float(pt[0]), float(pt[1])) for pt in p.points],
                "quantity": p.quantity
            }
            for p in request.parts
        ]
        
        nesting_result = run_nesting(
            parts_data,
            request.sheet_width,
            request.sheet_height,
            population_size=request.population_size,
            generations=request.generations,
            mutation_rate=request.mutation_rate
        )
        
        tsp_result = optimize_cutting_path(
            nesting_result['placements'],
            request.sheet_width,
            request.sheet_height,
            min_safe_distance=request.min_safe_distance,
            heat_zone_distance=request.heat_zone_distance,
            heat_penalty=request.heat_penalty,
            enable_heat_zone=request.enable_heat_zone
        )
        
        common_edge_result = None
        if request.enable_common_edge:
            common_edge_result = optimize_common_edges(
                tsp_result['placements'],
                tolerance=request.common_edge_tolerance
            )
        
        dxf = export_dxf(
            tsp_result['placements'],
            request.sheet_width,
            request.sheet_height,
            common_edge_data=common_edge_result,
            travel_path=tsp_result.get('path_coordinates')
        )
        
        return dxf
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
