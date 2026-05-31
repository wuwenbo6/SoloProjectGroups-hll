import os
import time
import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.app.api.deps import (
    get_pipeline,
    get_enhancer_instance,
    read_image_file,
    save_image,
    LicensePlatePipeline
)
from backend.app.schemas import (
    RecognitionResult,
    RecognitionLogResponse,
    HealthCheck
)
from backend.database import get_db, RecognitionLog
from backend.config import settings


router = APIRouter()


@router.get("/health", response_model=HealthCheck)
async def health_check():
    return HealthCheck(
        status="healthy",
        app_name=settings.APP_NAME,
        timestamp=datetime.utcnow()
    )


@router.post("/recognize", response_model=RecognitionResult)
async def recognize_license_plate(
    file: UploadFile = File(...),
    enhance: bool = Query(True, description="Apply image enhancement"),
    pipeline: LicensePlatePipeline = Depends(get_pipeline),
    db: Session = Depends(get_db)
):
    start_time = time.time()
    
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file is not an image")
    
    try:
        contents = await file.read()
        image = read_image_file(contents)
        
        if image is None:
            raise HTTPException(status_code=400, detail="Could not read image file")
        
        unique_id = str(uuid.uuid4())
        file_ext = os.path.splitext(file.filename)[1] or ".jpg"
        
        original_filename = f"{unique_id}_original{file_ext}"
        original_path = os.path.join(settings.UPLOAD_DIR, original_filename)
        save_image(image, original_path)
        
        enhanced_filename = f"{unique_id}_enhanced{file_ext}"
        enhanced_path = os.path.join(settings.UPLOAD_DIR, enhanced_filename)
        
        result = pipeline.process_image(image, enhance=enhance)
        
        processing_time = time.time() - start_time
        
        if result['enhanced_image'] is not None:
            save_image(result['enhanced_image'], enhanced_path)
        else:
            enhanced_path = original_path
        
        log_entry = RecognitionLog(
            filename=file.filename,
            original_path=f"/uploads/{original_filename}",
            enhanced_path=f"/uploads/{enhanced_filename}",
            plate_number=result['plate_number'],
            plate_color=result['plate_color'],
            confidence=float(result['confidence']),
            processing_time=processing_time
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        
        return RecognitionResult(
            success=result['success'],
            plate_number=result['plate_number'],
            plate_color=result['plate_color'],
            confidence=float(result['confidence']),
            processing_time=processing_time,
            original_image=f"/uploads/{original_filename}",
            enhanced_image=f"/uploads/{enhanced_filename}",
            bbox=list(result['detection']['bbox']) if result['detection'] else None,
            message="Recognition completed successfully" if result['success'] else "Could not detect license plate"
        )
        
    except Exception as e:
        error_log = RecognitionLog(
            filename=file.filename if file else "unknown",
            original_path="",
            enhanced_path="",
            plate_number="",
            plate_color="",
            confidence=0.0,
            processing_time=time.time() - start_time,
            error_message=str(e)
        )
        db.add(error_log)
        db.commit()
        
        raise HTTPException(status_code=500, detail=f"Recognition failed: {str(e)}")


@router.post("/enhance")
async def enhance_image(
    file: UploadFile = File(...),
    enhancer = Depends(get_enhancer_instance)
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file is not an image")
    
    try:
        contents = await file.read()
        image = read_image_file(contents)
        
        if image is None:
            raise HTTPException(status_code=400, detail="Could not read image file")
        
        start_time = time.time()
        enhanced_image = enhancer.enhance(image)
        processing_time = time.time() - start_time
        
        unique_id = str(uuid.uuid4())
        file_ext = os.path.splitext(file.filename)[1] or ".jpg"
        enhanced_filename = f"{unique_id}_enhanced{file_ext}"
        enhanced_path = os.path.join(settings.UPLOAD_DIR, enhanced_filename)
        
        save_image(enhanced_image, enhanced_path)
        
        return {
            "success": True,
            "original_image": f"/uploads/{file.filename}",
            "enhanced_image": f"/uploads/{enhanced_filename}",
            "processing_time": processing_time
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Enhancement failed: {str(e)}")


@router.get("/logs", response_model=List[RecognitionLogResponse])
async def get_recognition_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db)
):
    logs = db.query(RecognitionLog)\
        .order_by(RecognitionLog.created_at.desc())\
        .offset(skip)\
        .limit(limit)\
        .all()
    return logs


@router.get("/logs/{log_id}", response_model=RecognitionLogResponse)
async def get_log_by_id(
    log_id: int,
    db: Session = Depends(get_db)
):
    log = db.query(RecognitionLog).filter(RecognitionLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    return log


@router.delete("/logs/{log_id}")
async def delete_log(
    log_id: int,
    db: Session = Depends(get_db)
):
    log = db.query(RecognitionLog).filter(RecognitionLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    
    db.delete(log)
    db.commit()
    
    return {"success": True, "message": "Log deleted successfully"}


@router.get("/stats")
async def get_statistics(db: Session = Depends(get_db)):
    total_records = db.query(RecognitionLog).count()
    successful = db.query(RecognitionLog).filter(RecognitionLog.plate_number != "").count()
    avg_confidence = db.query(
        db.func.avg(RecognitionLog.confidence)
    ).filter(RecognitionLog.plate_number != "").scalar() or 0
    avg_processing_time = db.query(
        db.func.avg(RecognitionLog.processing_time)
    ).scalar() or 0
    
    color_stats = db.query(
        RecognitionLog.plate_color,
        db.func.count(RecognitionLog.id)
    ).filter(RecognitionLog.plate_color != "").group_by(RecognitionLog.plate_color).all()
    
    return {
        "total_records": total_records,
        "successful_recognitions": successful,
        "success_rate": (successful / total_records * 100) if total_records > 0 else 0,
        "average_confidence": float(avg_confidence),
        "average_processing_time": float(avg_processing_time),
        "color_distribution": {color: count for color, count in color_stats}
    }
