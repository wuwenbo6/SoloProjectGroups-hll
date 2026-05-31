from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, BackgroundTasks
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import uuid
from datetime import datetime
import base64

from . import models, schemas, database
from .config import UPLOAD_DIR, PROCESSED_DIR, STATIC_DIR
from .image_processor import ImageProcessor
from .tileserver import tile_server
from .classifier import LandCoverClassifier, ChangeDetector, ReportGenerator

models.Base.metadata.create_all(bind=database.engine)

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frontend')

app = FastAPI(title="Sentinel-2 Image Processing API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/processed", StaticFiles(directory=PROCESSED_DIR), name="processed")

processor = ImageProcessor()
classifier = LandCoverClassifier()
change_detector = ChangeDetector()
report_generator = ReportGenerator()


def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def process_task_background(task_id: int, input_path: str, db_session, cloud_mask_option: str = "auto"):
    try:
        task = db_session.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
        if not task:
            return

        task.status = models.TaskStatus.PROCESSING
        db_session.commit()

        apply_mask = cloud_mask_option != "none"
        method = cloud_mask_option if cloud_mask_option != "none" else "auto"

        result = processor.process_sentinel2_chunked(
            input_path=input_path,
            task_id=task_id,
            apply_cloud_mask=apply_mask,
            cloud_detection_method=method
        )

        task.ndvi_path = result["ndvi_path"]
        task.evi_path = result["evi_path"]
        task.ndwi_path = result["ndwi_path"]
        task.cloud_mask_path = result.get("cloud_mask_path")
        task.bbox = result["bbox"]
        task.crs = result["crs"]
        task.status = models.TaskStatus.COMPLETED
        task.completed_at = datetime.utcnow()

        for index_type in ["ndvi", "evi", "ndwi"]:
            raster_path = getattr(task, f"{index_type}_path")
            if raster_path and os.path.exists(raster_path):
                stats = processor.calculate_statistics(raster_path)
                stat_record = models.StatisticsResult(
                    task_id=task.id,
                    index_type=index_type,
                    **stats
                )
                db_session.add(stat_record)

        db_session.commit()
    except Exception as e:
        task.status = models.TaskStatus.FAILED
        task.error_message = str(e)
        db_session.commit()


@app.get("/")
def serve_frontend():
    index_path = os.path.join(FRONTEND_DIR, 'index.html')
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Sentinel-2 Image Processing API"}


@app.post("/api/tasks", response_model=schemas.ProcessingTask)
async def create_task(
    task_name: str,
    apply_cloud_mask: str = "auto",
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.jp2', '.tif', '.tiff']:
        raise HTTPException(status_code=400, detail="Invalid file format. Use JP2 or TIFF.")

    if apply_cloud_mask not in ["none", "auto", "scl", "qa", "spectral"]:
        raise HTTPException(status_code=400, detail="Invalid cloud_mask option")

    file_id = str(uuid.uuid4())
    input_filename = f"{file_id}{ext}"
    input_path = os.path.join(UPLOAD_DIR, input_filename)

    with open(input_path, "wb") as f:
        content = await file.read()
        f.write(content)

    task = models.ProcessingTask(
        task_name=task_name,
        original_filename=file.filename,
        input_path=input_path,
        status=models.TaskStatus.PENDING,
        apply_cloud_mask=apply_cloud_mask
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    db_session = database.SessionLocal()
    background_tasks.add_task(process_task_background, task.id, input_path, db_session, apply_cloud_mask)

    return task


@app.get("/api/tasks", response_model=schemas.TaskListResponse)
def list_tasks(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.ProcessingTask)
    if status:
        query = query.filter(models.ProcessingTask.status == status)

    total = query.count()
    tasks = query.order_by(models.ProcessingTask.created_at.desc()).offset(skip).limit(limit).all()

    return {"tasks": tasks, "total": total}


@app.get("/api/tasks/{task_id}", response_model=schemas.ProcessingTask)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    for path_field in ["ndvi_path", "evi_path", "ndwi_path"]:
        path = getattr(task, path_field)
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except:
                pass

    if os.path.exists(task.input_path):
        try:
            os.remove(task.input_path)
        except:
            pass

    db.delete(task)
    db.commit()
    return {"message": "Task deleted successfully"}


@app.post("/api/tasks/{task_id}/statistics", response_model=schemas.StatisticsResult)
def calculate_region_statistics(
    task_id: int,
    request: schemas.StatisticsRequest,
    db: Session = Depends(get_db)
):
    task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    index_type = request.index_type.lower()
    if index_type not in ["ndvi", "evi", "ndwi"]:
        raise HTTPException(status_code=400, detail="Invalid index type")

    raster_path = getattr(task, f"{index_type}_path")
    if not raster_path or not os.path.exists(raster_path):
        raise HTTPException(status_code=404, detail="Raster file not found")

    stats = processor.calculate_statistics(raster_path, request.polygon_wkt)

    stat_record = models.StatisticsResult(
        task_id=task.id,
        index_type=index_type,
        polygon_wkt=request.polygon_wkt,
        **stats
    )
    db.add(stat_record)
    db.commit()
    db.refresh(stat_record)

    return stat_record


@app.get("/api/tasks/{task_id}/statistics", response_model=List[schemas.StatisticsResult])
def get_task_statistics(task_id: int, db: Session = Depends(get_db)):
    task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return task.statistics


@app.get("/api/tasks/{task_id}/download/{index_type}")
def download_geotiff(task_id: int, index_type: str, db: Session = Depends(get_db)):
    task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    index_type = index_type.lower()
    if index_type not in ["ndvi", "evi", "ndwi"]:
        raise HTTPException(status_code=400, detail="Invalid index type")

    raster_path = getattr(task, f"{index_type}_path")
    if not raster_path or not os.path.exists(raster_path):
        raise HTTPException(status_code=404, detail="Raster file not found")

    filename = f"{task.task_name}_{index_type}.tif"
    return FileResponse(
        raster_path,
        media_type="image/tiff",
        filename=filename
    )


@app.get("/api/tasks/{task_id}/preview/{index_type}")
def get_preview_image(task_id: int, index_type: str, db: Session = Depends(get_db)):
    task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    index_type = index_type.lower()
    if index_type not in ["ndvi", "evi", "ndwi"]:
        raise HTTPException(status_code=400, detail="Invalid index type")

    raster_path = getattr(task, f"{index_type}_path")
    if not raster_path or not os.path.exists(raster_path):
        raise HTTPException(status_code=404, detail="Raster file not found")

    result = tile_server.get_overview_image(raster_path, index_type)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to generate preview")

    from PIL import Image
    from io import BytesIO

    img = Image.fromarray(result['image'], 'RGBA')
    max_size = 1024
    if img.width > max_size or img.height > max_size:
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

    buf = BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)

    return Response(content=buf.getvalue(), media_type="image/png")


@app.get("/api/tasks/{task_id}/preview/{index_type}/base64")
def get_preview_base64(task_id: int, index_type: str, db: Session = Depends(get_db)):
    task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    index_type = index_type.lower()
    if index_type not in ["ndvi", "evi", "ndwi"]:
        raise HTTPException(status_code=400, detail="Invalid index type")

    raster_path = getattr(task, f"{index_type}_path")
    if not raster_path or not os.path.exists(raster_path):
        raise HTTPException(status_code=404, detail="Raster file not found")

    result = tile_server.get_overview_image(raster_path, index_type)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to generate preview")

    from PIL import Image
    from io import BytesIO

    img = Image.fromarray(result['image'], 'RGBA')
    max_size = 1024
    if img.width > max_size or img.height > max_size:
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

    buf = BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)

    img_base64 = base64.b64encode(buf.getvalue()).decode('utf-8')

    return {
        "image": f"data:image/png;base64,{img_base64}",
        "bbox": result['bbox'],
        "width": result['width'],
        "height": result['height']
    }


@app.get("/api/tasks/{task_id}/tiles/{index_type}.png")
def get_tile_overview(task_id: int, index_type: str, db: Session = Depends(get_db)):
    task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    index_type = index_type.lower()
    if index_type not in ["ndvi", "evi", "ndwi"]:
        raise HTTPException(status_code=400, detail="Invalid index type")

    raster_path = getattr(task, f"{index_type}_path")
    if not raster_path or not os.path.exists(raster_path):
        raise HTTPException(status_code=404, detail="Raster file not found")

    tile_png = tile_server.generate_tile(raster_path)
    if tile_png is None:
        raise HTTPException(status_code=500, detail="Failed to generate tile")

    return Response(content=tile_png, media_type="image/png")


def run_classification_background(classification_id: int, task_id: int, db_session):
    """后台运行土地覆盖分类"""
    try:
        classification = db_session.query(models.ClassificationResult).filter(
            models.ClassificationResult.id == classification_id
        ).first()
        if not classification:
            return

        task = db_session.query(models.ProcessingTask).filter(
            models.ProcessingTask.id == task_id
        ).first()
        if not task or not task.input_path:
            classification.status = "failed"
            classification.error_message = "Task or input path not found"
            db_session.commit()
            return

        classification.status = "processing"
        db_session.commit()

        task_dir = os.path.join(PROCESSED_DIR, f"task_{task_id}")
        os.makedirs(task_dir, exist_ok=True)

        unique_id = str(uuid.uuid4())[:8]
        class_path = os.path.join(task_dir, f"classification_{unique_id}.tif")
        preview_path = os.path.join(task_dir, f"classification_{unique_id}_preview.png")

        stats = classifier.classify_image(task.input_path, class_path)

        classifier.create_rgb_preview(class_path, preview_path)

        classification.classification_path = class_path
        classification.preview_path = preview_path
        classification.water_pixels = stats['class_counts'].get(1, 0)
        classification.forest_pixels = stats['class_counts'].get(2, 0)
        classification.built_pixels = stats['class_counts'].get(3, 0)
        classification.bare_pixels = stats['class_counts'].get(4, 0)
        classification.farm_pixels = stats['class_counts'].get(5, 0)
        classification.water_area_km2 = stats['class_areas_km2'].get(1, 0)
        classification.forest_area_km2 = stats['class_areas_km2'].get(2, 0)
        classification.built_area_km2 = stats['class_areas_km2'].get(3, 0)
        classification.bare_area_km2 = stats['class_areas_km2'].get(4, 0)
        classification.farm_area_km2 = stats['class_areas_km2'].get(5, 0)
        classification.status = "completed"
        classification.completed_at = datetime.utcnow()

        db_session.commit()
    except Exception as e:
        classification.status = "failed"
        classification.error_message = str(e)
        db_session.commit()


@app.post("/api/classification", response_model=schemas.ClassificationResult)
def create_classification(
    request: schemas.ClassificationResultCreate,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """创建土地覆盖分类任务"""
    classification = models.ClassificationResult(
        task_id=request.task_id,
        status="pending"
    )
    db.add(classification)
    db.commit()
    db.refresh(classification)

    db_session = database.SessionLocal()
    background_tasks.add_task(run_classification_background, classification.id, request.task_id, db_session)

    return classification


@app.get("/api/classification/{classification_id}", response_model=schemas.ClassificationResult)
def get_classification(classification_id: int, db: Session = Depends(get_db)):
    """获取分类结果"""
    classification = db.query(models.ClassificationResult).filter(
        models.ClassificationResult.id == classification_id
    ).first()
    if not classification:
        raise HTTPException(status_code=404, detail="Classification not found")
    return classification


@app.get("/api/classification/task/{task_id}", response_model=List[schemas.ClassificationResult])
def get_task_classifications(task_id: int, db: Session = Depends(get_db)):
    """获取任务的所有分类结果"""
    classifications = db.query(models.ClassificationResult).filter(
        models.ClassificationResult.task_id == task_id
    ).order_by(models.ClassificationResult.created_at.desc()).all()
    return classifications


@app.get("/api/classification/{classification_id}/download")
def download_classification(classification_id: int, db: Session = Depends(get_db)):
    """下载分类结果GeoTIFF"""
    classification = db.query(models.ClassificationResult).filter(
        models.ClassificationResult.id == classification_id
    ).first()
    if not classification:
        raise HTTPException(status_code=404, detail="Classification not found")

    if not classification.classification_path or not os.path.exists(classification.classification_path):
        raise HTTPException(status_code=404, detail="Classification file not found")

    filename = f"classification_{classification_id}.tif"
    return FileResponse(
        classification.classification_path,
        media_type="image/tiff",
        filename=filename
    )


@app.get("/api/classification/{classification_id}/preview")
def get_classification_preview(classification_id: int, db: Session = Depends(get_db)):
    """获取分类预览图"""
    classification = db.query(models.ClassificationResult).filter(
        models.ClassificationResult.id == classification_id
    ).first()
    if not classification:
        raise HTTPException(status_code=404, detail="Classification not found")

    if not classification.preview_path or not os.path.exists(classification.preview_path):
        raise HTTPException(status_code=404, detail="Preview not found")

    return FileResponse(classification.preview_path, media_type="image/png")


def run_change_detection_background(change_id: int, db_session):
    """后台运行变化检测"""
    try:
        change = db_session.query(models.ChangeDetectionResult).filter(
            models.ChangeDetectionResult.id == change_id
        ).first()
        if not change:
            return

        before_task = db_session.query(models.ProcessingTask).filter(
            models.ProcessingTask.id == change.before_task_id
        ).first()
        after_task = db_session.query(models.ProcessingTask).filter(
            models.ProcessingTask.id == change.after_task_id
        ).first()

        if not before_task or not after_task:
            change.status = "failed"
            change.error_message = "Task not found"
            db_session.commit()
            return

        index_path_before = getattr(before_task, f"{change.index_type}_path")
        index_path_after = getattr(after_task, f"{change.index_type}_path")

        if not index_path_before or not index_path_after:
            change.status = "failed"
            change.error_message = "Index data not found"
            db_session.commit()
            return

        change.status = "processing"
        db_session.commit()

        task_dir = os.path.join(PROCESSED_DIR, f"change_{change_id}")
        os.makedirs(task_dir, exist_ok=True)

        unique_id = str(uuid.uuid4())[:8]
        change_path = os.path.join(task_dir, f"change_{unique_id}.tif")

        stats = change_detector.calculate_change(
            index_path_before,
            index_path_after,
            change_path,
            index_type=change.index_type,
            threshold=change.threshold
        )

        change.change_path = change_path
        change.severe_degradation = stats['change_counts'].get(-2, 0)
        change.mild_degradation = stats['change_counts'].get(-1, 0)
        change.no_change = stats['change_counts'].get(0, 0)
        change.mild_improvement = stats['change_counts'].get(1, 0)
        change.significant_improvement = stats['change_counts'].get(2, 0)
        change.status = "completed"
        change.completed_at = datetime.utcnow()

        db_session.commit()
    except Exception as e:
        change.status = "failed"
        change.error_message = str(e)
        db_session.commit()


@app.post("/api/change-detection", response_model=schemas.ChangeDetectionResult)
def create_change_detection(
    request: schemas.ChangeDetectionRequest,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """创建变化检测任务"""
    change = models.ChangeDetectionResult(
        task_name=request.task_name,
        before_task_id=request.before_task_id,
        after_task_id=request.after_task_id,
        index_type=request.index_type,
        threshold=request.threshold,
        status="pending"
    )
    db.add(change)
    db.commit()
    db.refresh(change)

    db_session = database.SessionLocal()
    background_tasks.add_task(run_change_detection_background, change.id, db_session)

    return change


@app.get("/api/change-detection", response_model=List[schemas.ChangeDetectionResult])
def list_change_detections(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取变化检测任务列表"""
    changes = db.query(models.ChangeDetectionResult).order_by(
        models.ChangeDetectionResult.created_at.desc()
    ).offset(skip).limit(limit).all()
    return changes


@app.get("/api/change-detection/{change_id}", response_model=schemas.ChangeDetectionResult)
def get_change_detection(change_id: int, db: Session = Depends(get_db)):
    """获取变化检测结果"""
    change = db.query(models.ChangeDetectionResult).filter(
        models.ChangeDetectionResult.id == change_id
    ).first()
    if not change:
        raise HTTPException(status_code=404, detail="Change detection not found")
    return change


@app.get("/api/change-detection/{change_id}/download")
def download_change_detection(change_id: int, db: Session = Depends(get_db)):
    """下载变化检测结果"""
    change = db.query(models.ChangeDetectionResult).filter(
        models.ChangeDetectionResult.id == change_id
    ).first()
    if not change:
        raise HTTPException(status_code=404, detail="Change detection not found")

    if not change.change_path or not os.path.exists(change.change_path):
        raise HTTPException(status_code=404, detail="Change file not found")

    filename = f"change_detection_{change_id}.tif"
    return FileResponse(
        change.change_path,
        media_type="image/tiff",
        filename=filename
    )


@app.get("/api/tasks/{task_id}/report/classification")
def download_classification_report(task_id: int, db: Session = Depends(get_db)):
    """下载分类统计报表"""
    task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    classification = db.query(models.ClassificationResult).filter(
        models.ClassificationResult.task_id == task_id,
        models.ClassificationResult.status == "completed"
    ).order_by(models.ClassificationResult.created_at.desc()).first()

    if not classification:
        raise HTTPException(status_code=404, detail="Classification result not found")

    class_stats = {
        "class_counts": {
            1: classification.water_pixels,
            2: classification.forest_pixels,
            3: classification.built_pixels,
            4: classification.bare_pixels,
            5: classification.farm_pixels
        },
        "class_areas_km2": {
            1: classification.water_area_km2,
            2: classification.forest_area_km2,
            3: classification.built_area_km2,
            4: classification.bare_area_km2,
            5: classification.farm_area_km2
        },
        "class_names": classifier.CLASS_NAMES
    }

    report_csv = report_generator.generate_classification_report(task.task_name, class_stats)

    return Response(
        content=report_csv,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=classification_report_{task_id}.csv"}
    )


@app.get("/api/change-detection/{change_id}/report")
def download_change_report(change_id: int, db: Session = Depends(get_db)):
    """下载变化检测统计报表"""
    change = db.query(models.ChangeDetectionResult).filter(
        models.ChangeDetectionResult.id == change_id
    ).first()
    if not change:
        raise HTTPException(status_code=404, detail="Change detection not found")

    change_stats = {
        "change_counts": {
            -2: change.severe_degradation,
            -1: change.mild_degradation,
            0: change.no_change,
            1: change.mild_improvement,
            2: change.significant_improvement
        },
        "change_types": change_detector.CHANGE_TYPES,
        "total_pixels": change.severe_degradation + change.mild_degradation + change.no_change + change.mild_improvement + change.significant_improvement,
        "threshold": change.threshold,
        "index_type": change.index_type
    }

    report_csv = report_generator.generate_change_report(change.task_name, change_stats)

    return Response(
        content=report_csv,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=change_report_{change_id}.csv"}
    )


@app.get("/api/tasks/{task_id}/report/full")
def download_full_report(task_id: int, db: Session = Depends(get_db)):
    """下载完整统计报表"""
    task = db.query(models.ProcessingTask).filter(models.ProcessingTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    index_stats = {}
    for idx_type in ["ndvi", "evi", "ndwi"]:
        stat = db.query(models.StatisticsResult).filter(
            models.StatisticsResult.task_id == task_id,
            models.StatisticsResult.index_type == idx_type,
            models.StatisticsResult.polygon_wkt.is_(None)
        ).first()
        if stat:
            index_stats[idx_type] = {
                "mean_value": stat.mean_value,
                "median_value": stat.median_value,
                "min_value": stat.min_value,
                "max_value": stat.max_value,
                "std_value": stat.std_value
            }

    classification = db.query(models.ClassificationResult).filter(
        models.ClassificationResult.task_id == task_id,
        models.ClassificationResult.status == "completed"
    ).order_by(models.ClassificationResult.created_at.desc()).first()

    if not classification:
        raise HTTPException(status_code=404, detail="Classification result not found")

    class_stats = {
        "class_counts": {
            1: classification.water_pixels,
            2: classification.forest_pixels,
            3: classification.built_pixels,
            4: classification.bare_pixels,
            5: classification.farm_pixels
        },
        "class_areas_km2": {
            1: classification.water_area_km2,
            2: classification.forest_area_km2,
            3: classification.built_area_km2,
            4: classification.bare_area_km2,
            5: classification.farm_area_km2
        },
        "class_names": classifier.CLASS_NAMES
    }

    report_csv = report_generator.generate_full_report(task.task_name, class_stats, index_stats)

    return Response(
        content=report_csv,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=full_report_{task_id}.csv"}
    )
