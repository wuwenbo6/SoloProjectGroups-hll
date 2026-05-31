from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
import uuid
import asyncio

from backend.database import SessionLocal, engine, Base
from backend import models, schemas
from backend.video_processor import VideoProcessor

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Fish Detection and Tracking API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
RESULTS_DIR = Path("results")
UPLOAD_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

video_processor = VideoProcessor()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.post("/api/videos/upload", response_model=schemas.VideoTask)
async def upload_video(file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    task_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{task_id}_{file.filename}"
    
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    db = next(get_db())
    db_task = models.VideoTask(
        id=task_id,
        filename=file.filename,
        file_path=str(file_path),
        status="pending"
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    
    background_tasks.add_task(process_video_background, task_id, str(file_path))
    
    return db_task


async def process_video_background(task_id: str, file_path: str):
    db = next(get_db())
    task = db.query(models.VideoTask).filter(models.VideoTask.id == task_id).first()
    task.status = "processing"
    db.commit()
    
    try:
        result = await asyncio.to_thread(video_processor.process_video, file_path, task_id)
        
        task.status = "completed"
        task.fish_count = result["total_count"]
        task.fish_types = result["fish_types"]
        task.result_path = result["result_path"]
        task.track_data = result["track_data"]
        db.commit()
    except Exception as e:
        task.status = "failed"
        task.error_message = str(e)
        db.commit()


@app.get("/api/videos", response_model=list[schemas.VideoTask])
def list_videos():
    db = next(get_db())
    return db.query(models.VideoTask).all()


@app.get("/api/videos/{task_id}", response_model=schemas.VideoTask)
def get_video(task_id: str):
    db = next(get_db())
    task = db.query(models.VideoTask).filter(models.VideoTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Video not found")
    return task


@app.get("/api/videos/{task_id}/heatmap")
def get_heatmap(task_id: str):
    heatmap_path = RESULTS_DIR / task_id / "heatmap.png"
    if heatmap_path.exists():
        return FileResponse(str(heatmap_path))
    raise HTTPException(status_code=404, detail="Heatmap not found")


@app.get("/api/videos/{task_id}/count-curve")
def get_count_curve(task_id: str):
    curve_path = RESULTS_DIR / task_id / "count_curve.png"
    if curve_path.exists():
        return FileResponse(str(curve_path))
    raise HTTPException(status_code=404, detail="Count curve not found")


@app.get("/api/videos/{task_id}/tracks")
def get_tracks(task_id: str):
    db = next(get_db())
    task = db.query(models.VideoTask).filter(models.VideoTask.id == task_id).first()
    if not task or not task.track_data:
        raise HTTPException(status_code=404, detail="Track data not found")
    return JSONResponse(content=task.track_data)


@app.get("/api/videos/{task_id}/export")
def export_csv(task_id: str):
    from backend.csv_exporter import export_tracks_to_csv
    db = next(get_db())
    task = db.query(models.VideoTask).filter(models.VideoTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Video not found")
    
    csv_path = export_tracks_to_csv(task_id, task.track_data, task.filename)
    return FileResponse(csv_path, media_type="text/csv", filename=f"{task_id}_report.csv")


@app.get("/")
def root():
    return {"message": "Fish Detection and Tracking API is running"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
