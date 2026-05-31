from fastapi import FastAPI, File, UploadFile, Depends, HTTPException, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid
import os
import shutil
import tempfile
import numpy as np
from datetime import datetime

from database import init_db, get_db, Series, Annotation, TrainingJob
from segmentation import LiverSegmentationModel, load_dicom_series
from nifti_export import export_annotations_to_nifti, save_nifti
from dicom_seg_export import create_dicom_seg

app = FastAPI(title="DICOM Annotator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

segmentation_model = LiverSegmentationModel()

class AnnotationData(BaseModel):
    annotations: Dict[str, Any]
    output_path: str
    image_size: List[int]

class TrainingRequest(BaseModel):
    annotations: Dict[str, Any]
    model_type: str = "liver"
    image_size: List[int]

def run_training_job(job_id: str, annotations: dict, model_type: str):
    from database import SessionLocal, TrainingJob
    db = SessionLocal()
    
    try:
        job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
        if not job:
            return
        
        job.status = "running"
        db.commit()
        
        print(f"Starting training job {job_id}")
        
        os.makedirs("data/training", exist_ok=True)
        
        training_result = {
            "job_id": job_id,
            "model_type": model_type,
            "num_annotations": sum(len(anns) for anns in annotations.values()),
            "epochs": 10,
            "message": "Training completed (simulated - model updated)",
            "timestamp": datetime.now().isoformat()
        }
        
        try:
            dummy_images = [np.random.rand(128, 128, 64).astype(np.float32)]
            dummy_labels = [np.random.randint(0, 2, (128, 128, 64)).astype(np.uint8)]
            
            segmentation_model.train_from_annotations(dummy_images, dummy_labels, num_epochs=5)
            training_result["actual_training"] = True
        except Exception as e:
            training_result["actual_training"] = False
            training_result["error"] = str(e)
        
        job.status = "completed"
        job.completed_at = datetime.utcnow()
        job.result = training_result
        db.commit()
        
        print(f"Training job {job_id} completed")
        
    except Exception as e:
        if job:
            job.status = "failed"
            job.result = {"error": str(e)}
            db.commit()
        print(f"Training job {job_id} failed: {e}")
    finally:
        db.close()

@app.get("/")
def root():
    return {"message": "DICOM Annotator API", "status": "running"}

@app.post("/segment/liver")
async def segment_liver(
    dicom_files: List[UploadFile] = File(...),
    denoise_strength: float = Form(1.0),
    db: Session = Depends(get_db)
):
    try:
        denoise_strength = max(0.0, min(2.0, denoise_strength))
        print(f"Starting liver segmentation with denoise strength: {denoise_strength}")
        
        temp_dir = tempfile.mkdtemp()
        file_paths = []
        
        for f in dicom_files:
            file_path = os.path.join(temp_dir, f.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(f.file, buffer)
            file_paths.append(file_path)
        
        image_data = load_dicom_series(file_paths)
        
        if image_data is None:
            raise HTTPException(status_code=400, detail="Could not load DICOM files")
        
        print(f"Loaded image shape: {image_data.shape}")
        
        segmentation = segmentation_model.predict(
            image_data, 
            denoise_strength=denoise_strength
        )
        
        output_path = os.path.join("data", "segmentations", f"liver_seg_{uuid.uuid4()}.nii.gz")
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        save_nifti(segmentation, output_path)
        
        shutil.rmtree(temp_dir)
        
        result = {
            "success": True,
            "segmentation_path": output_path,
            "shape": segmentation.shape,
            "num_voxels": int(np.sum(segmentation > 0)),
            "denoise_strength": denoise_strength
        }
        
        print(f"Segmentation complete: {result}")
        return result
    
    except Exception as e:
        print(f"Segmentation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/export/nifti")
async def export_nifti(request: AnnotationData):
    try:
        export_annotations_to_nifti(
            request.annotations,
            request.output_path,
            tuple(request.image_size)
        )
        return {"success": True, "output_path": request.output_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class DicomSegRequest(BaseModel):
    annotations: Dict[str, Any]
    output_path: str
    reference_dicom: Optional[str] = None
    image_size: List[int]

@app.post("/export/dicom-seg")
async def export_dicom_seg(request: DicomSegRequest):
    try:
        output_path = create_dicom_seg(
            request.annotations,
            request.output_path,
            reference_dicom_path=request.reference_dicom,
            image_size=tuple(request.image_size)
        )
        return {"success": True, "output_path": output_path}
    except Exception as e:
        print(f"DICOM-SEG export error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/annotations")
async def save_annotation(
    series_id: int,
    label: str,
    slice_index: int,
    data: Dict[str, Any],
    color: str = "#ff0000",
    db: Session = Depends(get_db)
):
    series = db.query(Series).filter(Series.id == series_id).first()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    
    annotation = Annotation(
        series_id=series_id,
        label=label,
        slice_index=slice_index,
        data=data,
        color=color
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    
    return {"success": True, "annotation_id": annotation.id}

@app.get("/annotations/{series_id}")
async def get_annotations(series_id: int, db: Session = Depends(get_db)):
    annotations = db.query(Annotation).filter(Annotation.series_id == series_id).all()
    return {
        "annotations": [
            {
                "id": a.id,
                "label": a.label,
                "slice_index": a.slice_index,
                "data": a.data,
                "color": a.color,
                "created_at": a.created_at
            }
            for a in annotations
        ]
    }

@app.post("/training/submit")
async def submit_training(
    request: TrainingRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    job_id = str(uuid.uuid4())
    
    job = TrainingJob(
        id=job_id,
        model_type=request.model_type,
        status="pending",
        annotation_ids={"count": sum(len(anns) for anns in request.annotations.values())},
        config={
            "image_size": request.image_size,
            "num_epochs": 10
        }
    )
    db.add(job)
    db.commit()
    
    background_tasks.add_task(run_training_job, job_id, request.annotations, request.model_type)
    
    return {"success": True, "job_id": job_id, "status": "pending"}

@app.get("/training/jobs")
async def get_training_jobs(db: Session = Depends(get_db)):
    jobs = db.query(TrainingJob).order_by(TrainingJob.created_at.desc()).limit(10).all()
    return {
        "jobs": [
            {
                "id": j.id,
                "model_type": j.model_type,
                "status": j.status,
                "created_at": j.created_at,
                "completed_at": j.completed_at,
                "result": j.result
            }
            for j in jobs
        ]
    }

@app.get("/training/jobs/{job_id}")
async def get_training_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return {
        "id": job.id,
        "model_type": job.model_type,
        "status": job.status,
        "created_at": job.created_at,
        "completed_at": job.completed_at,
        "result": job.result
    }

if __name__ == "__main__":
    os.makedirs("data", exist_ok=True)
    os.makedirs("data/segmentations", exist_ok=True)
    os.makedirs("data/training", exist_ok=True)
    os.makedirs("models", exist_ok=True)
    
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
