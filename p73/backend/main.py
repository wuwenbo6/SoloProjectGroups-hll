from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import numpy as np
import json
import io

from .database import get_db, RTPlan, Structure, Contour, Beam, ControlPoint, DoseGrid
from .dicom_reader import DICOMRTReader
from .pencil_beam_optimized import PencilBeamOptimized as PencilBeamAlgorithm
from .dvh_calc import DVCalculator
from .bev_exporter import BeamEyeView, RTDoseExporter
from .config import settings

app = FastAPI(title="RT Dose Planning API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/plans/", response_model=None)
async def create_plan(
    plan_name: str,
    patient_id: Optional[str] = None,
    patient_name: Optional[str] = None,
    description: Optional[str] = None,
    db: Session = Depends(get_db)
):
    plan = RTPlan(
        plan_name=plan_name,
        patient_id=patient_id or "",
        patient_name=patient_name or "",
        description=description or ""
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return {"id": plan.id, "plan_name": plan.plan_name, "created_at": plan.created_at}

@app.get("/plans/", response_model=None)
async def list_plans(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    plans = db.query(RTPlan).offset(skip).limit(limit).all()
    return [
        {
            "id": p.id,
            "plan_name": p.plan_name,
            "patient_id": p.patient_id,
            "patient_name": p.patient_name,
            "created_at": p.created_at,
            "beam_count": len(p.beams),
            "structure_count": len(p.structures),
            "has_dose": p.dose_grid is not None
        }
        for p in plans
    ]

@app.get("/plans/{plan_id}", response_model=None)
async def get_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(RTPlan).filter(RTPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    return {
        "id": plan.id,
        "plan_name": plan.plan_name,
        "patient_id": plan.patient_id,
        "patient_name": plan.patient_name,
        "created_at": plan.created_at,
        "description": plan.description,
        "beams": [
            {
                "id": b.id,
                "beam_name": b.beam_name,
                "beam_number": b.beam_number,
                "gantry_angle": b.gantry_angle,
                "collimator_angle": b.collimator_angle,
                "couch_angle": b.couch_angle,
                "energy": b.energy,
                "mu": b.mu,
                "field_size_x": b.field_size_x,
                "field_size_y": b.field_size_y,
                "isocenter": {
                    "x": b.isocenter_x,
                    "y": b.isocenter_y,
                    "z": b.isocenter_z
                }
            }
            for b in plan.beams
        ],
        "structures": [
            {
                "id": s.id,
                "name": s.name,
                "roi_number": s.roi_number,
                "color": s.color,
                "type": s.type,
                "contour_count": len(s.contours)
            }
            for s in plan.structures
        ],
        "has_dose": plan.dose_grid is not None
    }

@app.delete("/plans/{plan_id}", response_model=None)
async def delete_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(RTPlan).filter(RTPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    db.delete(plan)
    db.commit()
    return {"message": "Plan deleted"}

@app.post("/plans/{plan_id}/beams/", response_model=None)
async def add_beam(plan_id: int, beam_data: dict, db: Session = Depends(get_db)):
    plan = db.query(RTPlan).filter(RTPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    beam = Beam(
        plan_id=plan_id,
        beam_name=beam_data.get("beam_name", "Beam"),
        beam_number=beam_data.get("beam_number", 0),
        gantry_angle=beam_data.get("gantry_angle", 0),
        collimator_angle=beam_data.get("collimator_angle", 0),
        couch_angle=beam_data.get("couch_angle", 0),
        energy=beam_data.get("energy", "6MV"),
        dose_rate=beam_data.get("dose_rate", 600),
        mu=beam_data.get("mu", 100),
        field_size_x=beam_data.get("field_size_x", 100),
        field_size_y=beam_data.get("field_size_y", 100),
        sad=beam_data.get("sad", 1000),
        isocenter_x=beam_data.get("isocenter", {}).get("x", 0),
        isocenter_y=beam_data.get("isocenter", {}).get("y", 0),
        isocenter_z=beam_data.get("isocenter", {}).get("z", 0)
    )
    db.add(beam)
    db.commit()
    db.refresh(beam)
    
    if "control_points" in beam_data:
        for cp_data in beam_data["control_points"]:
            cp = ControlPoint(
                beam_id=beam.id,
                index=cp_data.get("index", 0),
                gantry_angle=cp_data.get("gantry_angle", beam.gantry_angle),
                collimator_angle=cp_data.get("collimator_angle", beam.collimator_angle),
                couch_angle=cp_data.get("couch_angle", beam.couch_angle),
                cumulative_mu=cp_data.get("cumulative_mu", 0)
            )
            db.add(cp)
        db.commit()
    
    return {"id": beam.id, "beam_name": beam.beam_name}

@app.get("/plans/{plan_id}/structures/{structure_id}/contours", response_model=None)
async def get_structure_contours(plan_id: int, structure_id: int, db: Session = Depends(get_db)):
    structure = db.query(Structure).filter(
        Structure.id == structure_id, Structure.plan_id == plan_id
    ).first()
    if not structure:
        raise HTTPException(status_code=404, detail="Structure not found")
    
    contours = []
    for c in structure.contours:
        try:
            points = json.loads(c.points)
        except:
            points = []
        contours.append({
            "slice_z": c.slice_z,
            "points": points
        })
    
    return {
        "structure_id": structure.id,
        "name": structure.name,
        "color": structure.color,
        "contours": contours
    }

@app.post("/plans/{plan_id}/calculate-dose", response_model=None)
async def calculate_dose(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(RTPlan).filter(RTPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    beams = []
    for b in plan.beams:
        beams.append({
            "gantry_angle": b.gantry_angle,
            "collimator_angle": b.collimator_angle,
            "couch_angle": b.couch_angle,
            "isocenter": {"x": b.isocenter_x, "y": b.isocenter_y, "z": b.isocenter_z},
            "sad": b.sad,
            "mu": b.mu,
            "field_size_x": b.field_size_x,
            "field_size_y": b.field_size_y
        })
    
    if not beams:
        raise HTTPException(status_code=400, detail="No beams defined in plan")
    
    pb = PencilBeamAlgorithm(
        grid_size=settings.DOSE_GRID_SIZE,
        spacing=settings.DOSE_GRID_SPACING
    )
    dose_result = pb.calculate_dose(beams)
    
    if plan.dose_grid:
        db.delete(plan.dose_grid)
    
    dose_data = dose_result['data'].tobytes()
    
    dose_grid = DoseGrid(
        plan_id=plan_id,
        data=dose_data,
        shape_x=dose_result['shape'][0],
        shape_y=dose_result['shape'][1],
        shape_z=dose_result['shape'][2],
        spacing_x=dose_result['spacing'][0],
        spacing_y=dose_result['spacing'][1],
        spacing_z=dose_result['spacing'][2],
        origin_x=dose_result['origin'][0],
        origin_y=dose_result['origin'][1],
        origin_z=dose_result['origin'][2],
        max_dose=dose_result['max_dose'],
        min_dose=dose_result['min_dose']
    )
    db.add(dose_grid)
    db.commit()
    
    return {
        "message": "Dose calculated successfully",
        "shape": dose_result['shape'],
        "max_dose": dose_result['max_dose'],
        "min_dose": dose_result['min_dose']
    }

@app.get("/plans/{plan_id}/dose/slice", response_model=None)
async def get_dose_slice(
    plan_id: int,
    axis: str = Query("z", description="Axis: x, y, or z"),
    index: int = Query(50, description="Slice index"),
    db: Session = Depends(get_db)
):
    plan = db.query(RTPlan).filter(RTPlan.id == plan_id).first()
    if not plan or not plan.dose_grid:
        raise HTTPException(status_code=404, detail="Plan or dose grid not found")
    
    dg = plan.dose_grid
    dose_array = np.frombuffer(dg.data, dtype=np.float32).reshape(
        (dg.shape_x, dg.shape_y, dg.shape_z)
    )
    
    if axis == 'x':
        idx = min(max(index, 0), dg.shape_x - 1)
        slice_data = dose_array[idx, :, :]
    elif axis == 'y':
        idx = min(max(index, 0), dg.shape_y - 1)
        slice_data = dose_array[:, idx, :]
    elif axis == 'z':
        idx = min(max(index, 0), dg.shape_z - 1)
        slice_data = dose_array[:, :, idx]
    else:
        raise HTTPException(status_code=400, detail="Invalid axis")
    
    return {
        "axis": axis,
        "index": idx,
        "shape": list(slice_data.shape),
        "data": slice_data.tolist(),
        "spacing": [dg.spacing_x, dg.spacing_y, dg.spacing_z],
        "origin": [dg.origin_x, dg.origin_y, dg.origin_z],
        "max_dose": dg.max_dose,
        "min_dose": dg.min_dose
    }

@app.get("/plans/{plan_id}/dose/iso-contours", response_model=None)
async def get_iso_contours(
    plan_id: int,
    axis: str = Query("z", description="Slice axis (x=sagittal, y=coronal, z=axial)"),
    index: int = Query(50, description="Slice index"),
    levels: str = Query("0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2,0.1", description="Comma-separated iso levels"),
    db: Session = Depends(get_db)
):
    from skimage import measure
    
    plan = db.query(RTPlan).filter(RTPlan.id == plan_id).first()
    if not plan or not plan.dose_grid:
        raise HTTPException(status_code=404, detail="Plan or dose grid not found")
    
    dg = plan.dose_grid
    dose_array = np.frombuffer(dg.data, dtype=np.float32).reshape(
        (dg.shape_x, dg.shape_y, dg.shape_z)
    )
    
    if axis == 'x':
        idx = int(np.clip(index, 0, dg.shape_x - 1))
        slice_data = dose_array[idx, :, :]
        slice_spacing = (dg.spacing_y, dg.spacing_z)
        slice_origin = (dg.origin_y, dg.origin_z)
        slice_shape = (dg.shape_y, dg.shape_z)
    elif axis == 'y':
        idx = int(np.clip(index, 0, dg.shape_y - 1))
        slice_data = dose_array[:, idx, :]
        slice_spacing = (dg.spacing_x, dg.spacing_z)
        slice_origin = (dg.origin_x, dg.origin_z)
        slice_shape = (dg.shape_x, dg.shape_z)
    else:
        idx = int(np.clip(index, 0, dg.shape_z - 1))
        slice_data = dose_array[:, :, idx]
        slice_spacing = (dg.spacing_x, dg.spacing_y)
        slice_origin = (dg.origin_x, dg.origin_y)
        slice_shape = (dg.shape_x, dg.shape_y)
    
    level_values = [float(x) for x in levels.split(',')]
    iso_contours = []
    
    max_dose = dg.max_dose if dg.max_dose > 0 else 1.0
    
    for level in level_values:
        threshold = level * max_dose
        contours = measure.find_contours(slice_data, threshold)
        
        contour_list = []
        for contour in contours:
            contour_dicom = np.zeros_like(contour, dtype=np.float64)
            
            contour_dicom[:, 0] = slice_origin[0] + contour[:, 0] * slice_spacing[0]
            contour_dicom[:, 1] = slice_origin[1] + contour[:, 1] * slice_spacing[1]
            
            contour_list.append(contour_dicom.tolist())
        
        if contour_list:
            iso_contours.append({
                "level": level,
                "threshold": float(threshold),
                "contours": contour_list
            })
    
    return {
        "axis": axis,
        "index": int(idx),
        "iso_contours": iso_contours,
        "max_dose": max_dose,
        "slice_info": {
            "spacing": slice_spacing,
            "origin": slice_origin,
            "shape": slice_shape
        }
    }

@app.get("/plans/{plan_id}/dose/volume", response_model=None)
async def get_dose_volume(
    plan_id: int,
    db: Session = Depends(get_db)
):
    plan = db.query(RTPlan).filter(RTPlan.id == plan_id).first()
    if not plan or not plan.dose_grid:
        raise HTTPException(status_code=404, detail="Plan or dose grid not found")
    
    dg = plan.dose_grid
    dose_array = np.frombuffer(dg.data, dtype=np.float32).reshape(
        (dg.shape_x, dg.shape_y, dg.shape_z)
    )
    
    subsample = max(1, min(dg.shape_x, dg.shape_y, dg.shape_z) // 30)
    subsampled = dose_array[::subsample, ::subsample, ::subsample]
    
    return {
        "shape": [dg.shape_x, dg.shape_y, dg.shape_z],
        "spacing": [dg.spacing_x, dg.spacing_y, dg.spacing_z],
        "origin": [dg.origin_x, dg.origin_y, dg.origin_z],
        "subsampled_data": subsampled.flatten().tolist(),
        "subsampled_shape": list(subsampled.shape),
        "max_dose": dg.max_dose,
        "min_dose": dg.min_dose
    }

@app.post("/plans/{plan_id}/upload-rtplan", response_model=None)
async def upload_rtplan(plan_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    plan = db.query(RTPlan).filter(RTPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    contents = await file.read()
    reader = DICOMRTReader()
    
    try:
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.dcm') as tmp:
            tmp.write(contents)
            tmp_path = tmp.name
        
        plan_data = reader.load_rt_plan(tmp_path)
        
        for beam_data in plan_data.get('beams', []):
            beam = Beam(
                plan_id=plan_id,
                beam_name=beam_data.get('beam_name', 'Beam'),
                beam_number=beam_data.get('beam_number', 0),
                gantry_angle=beam_data.get('gantry_angle', 0),
                collimator_angle=beam_data.get('collimator_angle', 0),
                couch_angle=beam_data.get('couch_angle', 0),
                energy=beam_data.get('energy', '6MV'),
                dose_rate=beam_data.get('dose_rate', 600),
                mu=beam_data.get('mu', 100),
                field_size_x=beam_data.get('field_size_x', 100),
                field_size_y=beam_data.get('field_size_y', 100),
                sad=beam_data.get('sad', 1000),
                isocenter_x=beam_data.get('isocenter', {}).get('x', 0),
                isocenter_y=beam_data.get('isocenter', {}).get('y', 0),
                isocenter_z=beam_data.get('isocenter', {}).get('z', 0)
            )
            db.add(beam)
            db.flush()
            
            for cp_data in beam_data.get('control_points', []):
                cp = ControlPoint(
                    beam_id=beam.id,
                    index=cp_data.get('index', 0),
                    gantry_angle=cp_data.get('gantry_angle', beam.gantry_angle),
                    collimator_angle=cp_data.get('collimator_angle', beam.collimator_angle),
                    couch_angle=cp_data.get('couch_angle', beam.couch_angle),
                    cumulative_mu=cp_data.get('cumulative_mu', 0)
                )
                db.add(cp)
        
        db.commit()
        return {"message": "RT Plan loaded successfully", "beam_count": len(plan_data.get('beams', []))}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse DICOM: {str(e)}")

@app.post("/plans/{plan_id}/upload-rtstruct", response_model=None)
async def upload_rtstruct(plan_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    plan = db.query(RTPlan).filter(RTPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    contents = await file.read()
    reader = DICOMRTReader()
    
    try:
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.dcm') as tmp:
            tmp.write(contents)
            tmp_path = tmp.name
        
        structures = reader.load_rt_structure(tmp_path)
        
        for struct_data in structures:
            struct = Structure(
                plan_id=plan_id,
                name=struct_data.get('name', 'Unknown'),
                roi_number=struct_data.get('roi_number', 0),
                color=struct_data.get('color'),
                type=struct_data.get('type', 'MANUAL')
            )
            db.add(struct)
            db.flush()
            
            for contour_data in struct_data.get('contours', []):
                contour = Contour(
                    structure_id=struct.id,
                    slice_z=contour_data.get('slice_z', 0),
                    points=json.dumps(contour_data.get('points', []))
                )
                db.add(contour)
        
        db.commit()
        return {"message": "RT Structure loaded successfully", "structure_count": len(structures)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse DICOM: {str(e)}")

@app.get("/plans/{plan_id}/dvh", response_model=None)
async def calculate_dvh(
    plan_id: int,
    structure_id: Optional[int] = None,
    structure_name: Optional[str] = None,
    num_bins: int = 100,
    db: Session = Depends(get_db)
):
    plan = db.query(RTPlan).filter(RTPlan.id == plan_id).first()
    if not plan or not plan.dose_grid:
        raise HTTPException(status_code=404, detail="Plan or dose grid not found")
    
    dg = plan.dose_grid
    dose_array = np.frombuffer(dg.data, dtype=np.float32).reshape(
        (dg.shape_x, dg.shape_y, dg.shape_z)
    )
    
    dvh_calc = DVCalculator(
        dose_array,
        (dg.spacing_x, dg.spacing_y, dg.spacing_z),
        (dg.origin_x, dg.origin_y, dg.origin_z)
    )
    
    if structure_id:
        structure = db.query(Structure).filter(Structure.id == structure_id).first()
        if not structure:
            raise HTTPException(status_code=404, detail="Structure not found")
        
        contours = []
        for c in structure.contours:
            contours.append({
                'slice_z': c.slice_z,
                'points': json.loads(c.points)
            })
        
        dvh = dvh_calc.calculate_dvh_for_contours(contours, structure.name, num_bins)
        metrics = dvh_calc.get_dose_metrics(dvh)
        
        return {
            'structure_name': dvh.structure_name,
            'dose_bins': dvh.dose_bins.tolist(),
            'volume_bins': dvh.volume_bins.tolist(),
            'max_dose': dvh.max_dose,
            'min_dose': dvh.min_dose,
            'mean_dose': dvh.mean_dose,
            'volume': dvh.volume,
            'metrics': metrics
        }
    
    structures = db.query(Structure).filter(Structure.plan_id == plan_id).all()
    results = []
    
    for struct in structures:
        contours = []
        for c in struct.contours:
            contours.append({
                'slice_z': c.slice_z,
                'points': json.loads(c.points)
            })
        
        dvh = dvh_calc.calculate_dvh_for_contours(contours, struct.name, num_bins)
        metrics = dvh_calc.get_dose_metrics(dvh)
        
        results.append({
            'structure_id': struct.id,
            'structure_name': struct.name,
            'dose_bins': dvh.dose_bins.tolist(),
            'volume_bins': dvh.volume_bins.tolist(),
            'max_dose': dvh.max_dose,
            'min_dose': dvh.min_dose,
            'mean_dose': dvh.mean_dose,
            'volume': dvh.volume,
            'metrics': metrics
        })
    
    return {'dvhs': results}

@app.get("/plans/{plan_id}/bev", response_model=None)
async def get_bev(
    plan_id: int,
    beam_id: int,
    view_size: int = 200,
    view_spacing: float = 1.0,
    db: Session = Depends(get_db)
):
    plan = db.query(RTPlan).filter(RTPlan.id == plan_id).first()
    if not plan or not plan.dose_grid:
        raise HTTPException(status_code=404, detail="Plan or dose grid not found")
    
    beam = db.query(Beam).filter(Beam.id == beam_id).first()
    if not beam:
        raise HTTPException(status_code=404, detail="Beam not found")
    
    dg = plan.dose_grid
    dose_array = np.frombuffer(dg.data, dtype=np.float32).reshape(
        (dg.shape_x, dg.shape_y, dg.shape_z)
    )
    
    bev_calc = BeamEyeView(
        dose_array,
        (dg.spacing_x, dg.spacing_y, dg.spacing_z),
        (dg.origin_x, dg.origin_y, dg.origin_z)
    )
    
    beam_data = {
        'gantry_angle': beam.gantry_angle,
        'couch_angle': beam.couch_angle,
        'collimator_angle': beam.collimator_angle,
        'isocenter': {
            'x': beam.isocenter_x,
            'y': beam.isocenter_y,
            'z': beam.isocenter_z
        },
        'field_size_x': beam.field_size_x,
        'field_size_y': beam.field_size_y
    }
    
    bev_result = bev_calc.compute_bev(beam_data, view_size, view_spacing)
    
    return bev_result

@app.post("/plans/{plan_id}/export/dose", response_model=None)
async def export_rtdose(
    plan_id: int,
    format: str = 'dicom',
    patient_name: Optional[str] = None,
    patient_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    plan = db.query(RTPlan).filter(RTPlan.id == plan_id).first()
    if not plan or not plan.dose_grid:
        raise HTTPException(status_code=404, detail="Plan or dose grid not found")
    
    dg = plan.dose_grid
    dose_array = np.frombuffer(dg.data, dtype=np.float32).reshape(
        (dg.shape_x, dg.shape_y, dg.shape_z)
    )
    
    exporter = RTDoseExporter(
        dose_array,
        (dg.spacing_x, dg.spacing_y, dg.spacing_z),
        (dg.origin_x, dg.origin_y, dg.origin_z)
    )
    
    import tempfile
    import os
    from fastapi.responses import FileResponse
    
    if format == 'dicom':
        with tempfile.NamedTemporaryFile(delete=False, suffix='.dcm') as tmp:
            tmp_path = tmp.name
        
        patient_info = {
            'name': patient_name or 'Anonymous^Patient',
            'id': patient_id or 'UNKNOWN'
        }
        
        plan_info = {
            'name': plan.plan_name
        }
        
        exporter.export_to_dicom(tmp_path, patient_info, plan_info)
        
        return FileResponse(
            tmp_path,
            media_type='application/dicom',
            filename=f'{plan.plan_name}_rtdose.dcm'
        )
    
    elif format == 'numpy':
        with tempfile.NamedTemporaryFile(delete=False, suffix='.npz') as tmp:
            tmp_path = tmp.name
        
        exporter.export_to_numpy(tmp_path)
        
        return FileResponse(
            tmp_path,
            media_type='application/octet-stream',
            filename=f'{plan.plan_name}_dose.npz'
        )
    
    elif format == 'raw':
        with tempfile.NamedTemporaryFile(delete=False, suffix='.raw') as tmp:
            tmp_path = tmp.name
        
        exporter.export_to_raw(tmp_path)
        
        return FileResponse(
            tmp_path,
            media_type='application/octet-stream',
            filename=f'{plan.plan_name}_dose.raw'
        )
    
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
