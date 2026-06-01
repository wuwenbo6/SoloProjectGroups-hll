import os
import uuid
import json
import asyncio
import shutil
import zipfile
from typing import Dict, Optional
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse, StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import aiofiles

from pbf_clip import (
    clip_pbf_with_filter,
    load_geojson_boundary,
    count_pbf_elements
)


app = FastAPI(title="PBF Clipper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")
DATA_DIR = Path("data")

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)


class TaskStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Task:
    def __init__(self, task_id: str, pbf_path: str, geojson_path: str, 
                 output_format: str, include_relations: bool = True):
        self.task_id = task_id
        self.pbf_path = pbf_path
        self.geojson_path = geojson_path
        self.output_format = output_format
        self.include_relations = include_relations
        self.status = TaskStatus.PENDING
        self.progress = 0.0
        self.message = "Waiting to start..."
        self.result_path: Optional[str] = None
        self.download_path: Optional[str] = None
        self.error: Optional[str] = None
        self.stats: Dict = {}
        self._progress_queue: Optional[asyncio.Queue] = None
    
    def set_progress_queue(self, queue: asyncio.Queue):
        self._progress_queue = queue
    
    async def update_progress(self, phase: str, progress: float, details: Dict):
        self.progress = progress
        self.message = f"{phase}: {progress:.1f}%"
        self.stats.update(details)
        
        if self._progress_queue:
            await self._progress_queue.put({
                "task_id": self.task_id,
                "status": self.status,
                "progress": progress,
                "message": self.message,
                "details": details,
                "phase": phase
            })


tasks: Dict[str, Task] = {}


def create_zip_from_directory(source_dir: str, output_zip: str) -> str:
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, source_dir)
                zipf.write(file_path, arcname)
    return output_zip


async def run_clipping_task(task: Task):
    try:
        task.status = TaskStatus.RUNNING
        task.message = "Starting..."
        
        if task._progress_queue:
            await task._progress_queue.put({
                "task_id": task.task_id,
                "status": TaskStatus.RUNNING,
                "progress": 0,
                "message": "Initializing...",
                "phase": "initializing"
            })
        
        output_format = task.output_format.lower()
        
        if output_format in ["csv", "shapefile", "shp"]:
            output_path = OUTPUT_DIR / task.task_id
            output_path.mkdir(parents=True, exist_ok=True)
            output_path_str = str(output_path)
        else:
            ext_map = {
                "osm": "osm",
                "geojson": "geojson"
            }
            ext = ext_map.get(output_format, "geojson")
            output_path_str = str(OUTPUT_DIR / f"{task.task_id}.{ext}")
        
        def progress_callback(phase: str, progress: float, details: Dict):
            asyncio.run_coroutine_threadsafe(
                task.update_progress(phase, progress, details),
                asyncio.get_event_loop()
            )
        
        stats = clip_pbf_with_filter(
            task.pbf_path,
            task.geojson_path,
            output_path_str,
            output_format,
            progress_callback,
            task.include_relations
        )
        
        if output_format in ["csv", "shapefile", "shp"]:
            zip_path = str(OUTPUT_DIR / f"{task.task_id}.zip")
            create_zip_from_directory(output_path_str, zip_path)
            task.result_path = output_path_str
            task.download_path = zip_path
        else:
            task.result_path = output_path_str
            task.download_path = output_path_str
        
        task.status = TaskStatus.COMPLETED
        task.progress = 100.0
        task.message = "Completed!"
        task.stats.update(stats)
        
        if task._progress_queue:
            await task._progress_queue.put({
                "task_id": task.task_id,
                "status": TaskStatus.COMPLETED,
                "progress": 100,
                "message": "Completed!",
                "stats": stats,
                "download_url": f"/download/{task.task_id}"
            })
            
            await task._progress_queue.put(None)
            
    except Exception as e:
        task.status = TaskStatus.FAILED
        task.error = str(e)
        task.message = f"Error: {str(e)}"
        
        import traceback
        traceback.print_exc()
        
        if task._progress_queue:
            await task._progress_queue.put({
                "task_id": task.task_id,
                "status": TaskStatus.FAILED,
                "progress": task.progress,
                "message": f"Error: {str(e)}",
                "error": str(e)
            })
            await task._progress_queue.put(None)


@app.get("/", response_class=HTMLResponse)
async def root():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.post("/upload/geojson")
async def upload_geojson(file: UploadFile = File(...)):
    if not file.filename.endswith(".geojson") and not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="File must be a GeoJSON file")
    
    file_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{file_id}.geojson"
    
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    try:
        boundary = load_geojson_boundary(str(file_path))
        bounds = boundary.bounds
        
        return {
            "file_id": file_id,
            "filename": file.filename,
            "bounds": {
                "min_lon": bounds[0],
                "min_lat": bounds[1],
                "max_lon": bounds[2],
                "max_lat": bounds[3]
            },
            "area": boundary.area
        }
    except Exception as e:
        os.remove(file_path)
        raise HTTPException(status_code=400, detail=f"Invalid GeoJSON: {str(e)}")


@app.post("/upload/pbf")
async def upload_pbf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pbf") and not file.filename.endswith(".osm.pbf"):
        raise HTTPException(status_code=400, detail="File must be a PBF file")
    
    file_id = str(uuid.uuid4())
    file_path = DATA_DIR / f"{file_id}.osm.pbf"
    
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    try:
        counts = count_pbf_elements(str(file_path))
        return {
            "file_id": file_id,
            "filename": file.filename,
            "elements": counts
        }
    except Exception as e:
        os.remove(file_path)
        raise HTTPException(status_code=400, detail=f"Invalid PBF file: {str(e)}")


@app.get("/pbf/list")
async def list_pbf_files():
    pbf_files = []
    for f in DATA_DIR.glob("*.osm.pbf"):
        pbf_files.append({
            "name": f.name,
            "size": f.stat().st_size,
            "path": str(f)
        })
    return {"files": pbf_files}


class ClipRequest(BaseModel):
    geojson_id: str
    pbf_path: str
    output_format: str = "geojson"
    include_relations: bool = True


@app.post("/clip")
async def start_clip(request: ClipRequest):
    geojson_path = UPLOAD_DIR / f"{request.geojson_id}.geojson"
    if not geojson_path.exists():
        raise HTTPException(status_code=404, detail="GeoJSON file not found")
    
    if not os.path.exists(request.pbf_path):
        raise HTTPException(status_code=404, detail="PBF file not found")
    
    valid_formats = ["osm", "geojson", "csv", "shapefile", "shp"]
    if request.output_format.lower() not in valid_formats:
        raise HTTPException(status_code=400, 
                           detail=f"Output format must be one of: {', '.join(valid_formats)}")
    
    task_id = str(uuid.uuid4())
    task = Task(
        task_id=task_id,
        pbf_path=request.pbf_path,
        geojson_path=str(geojson_path),
        output_format=request.output_format,
        include_relations=request.include_relations
    )
    tasks[task_id] = task
    
    asyncio.create_task(run_clipping_task(task))
    
    return {"task_id": task_id, "status": task.status}


@app.get("/status/{task_id}")
async def get_status(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = tasks[task_id]
    return {
        "task_id": task_id,
        "status": task.status,
        "progress": task.progress,
        "message": task.message,
        "stats": task.stats,
        "error": task.error,
        "download_url": f"/download/{task_id}" if task.download_path else None
    }


@app.get("/stream/{task_id}")
async def stream_progress(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = tasks[task_id]
    queue: asyncio.Queue = asyncio.Queue()
    task.set_progress_queue(queue)
    
    if task.status == TaskStatus.COMPLETED:
        async def send_completed():
            yield json.dumps({
                "task_id": task_id,
                "status": TaskStatus.COMPLETED,
                "progress": 100,
                "message": "Completed!",
                "stats": task.stats,
                "download_url": f"/download/{task_id}"
            }) + "\n"
            yield None
        
        return StreamingResponse(
            send_completed(),
            media_type="text/event-stream"
        )
    
    if task.status == TaskStatus.FAILED:
        async def send_failed():
            yield json.dumps({
                "task_id": task_id,
                "status": TaskStatus.FAILED,
                "progress": task.progress,
                "message": f"Error: {task.error}",
                "error": task.error
            }) + "\n"
            yield None
        
        return StreamingResponse(
            send_failed(),
            media_type="text/event-stream"
        )
    
    async def event_generator():
        try:
            while True:
                data = await queue.get()
                if data is None:
                    break
                yield json.dumps(data) + "\n"
        except asyncio.CancelledError:
            pass
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.get("/download/{task_id}")
async def download_result(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = tasks[task_id]
    if not task.download_path or not os.path.exists(task.download_path):
        raise HTTPException(status_code=404, detail="Result not found")
    
    output_format = task.output_format.lower()
    
    if output_format in ["csv", "shapefile", "shp"]:
        filename = f"clipped_{task_id}_{output_format}.zip"
        media_type = "application/zip"
    elif output_format == "osm":
        filename = f"clipped_{task_id}.osm"
        media_type = "application/vnd.openstreetmap.data+xml"
    else:
        filename = f"clipped_{task_id}.geojson"
        media_type = "application/geo+json"
    
    return FileResponse(
        task.download_path,
        media_type=media_type,
        filename=filename
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
