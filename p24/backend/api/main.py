import os
import sys
import io
import base64
import cv2
import numpy as np
from typing import Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Request, BackgroundTasks
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session
from PIL import Image

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.models import get_db, init_db
from database import crud
from detection.defect_detector import DefectDetector, blend_heatmap

app = FastAPI(title="Defect Detection API", version="2.0.0")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
STATIC_DIR = os.path.join(FRONTEND_DIR, "static")
TEMPLATES_DIR = os.path.join(FRONTEND_DIR, "templates")
UPLOAD_DIR = os.path.join(BASE_DIR, "data", "uploads")
HEATMAP_DIR = os.path.join(BASE_DIR, "data", "heatmaps")
REPORT_DIR = os.path.join(BASE_DIR, "data", "reports")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(HEATMAP_DIR, exist_ok=True)
os.makedirs(REPORT_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

MODEL_PATH = os.path.join(BASE_DIR, "backend", "models", "maml_model.pth")
SUPPORT_DATA_DIR = os.path.join(BASE_DIR, "data", "train")

detector: Optional[DefectDetector] = None


def get_detector():
    global detector
    if detector is None:
        detector = DefectDetector(
            model_path=MODEL_PATH,
            support_data_dir=SUPPORT_DATA_DIR if os.path.exists(SUPPORT_DATA_DIR) else None,
            device='cpu',
            img_size=128
        )
    return detector


class LabelItemRequest(BaseModel):
    true_class: str
    true_severity: str = "medium"


class LabelRecordRequest(BaseModel):
    true_class: str


@app.on_event("startup")
async def startup_event():
    init_db()
    get_detector()


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/detect")
async def detect_defects(
    file: UploadFile = File(...),
    return_heatmap: bool = True,
    add_to_queue: bool = False,
    db: Session = Depends(get_db)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image file")
        
        image_path = os.path.join(UPLOAD_DIR, file.filename)
        cv2.imwrite(image_path, image)
        
        detector = get_detector()
        result = detector.detect(image, return_heatmap=return_heatmap)
        
        heatmap_path = None
        if return_heatmap and 'heatmap' in result:
            heatmap_filename = f"heatmap_{os.path.splitext(file.filename)[0]}.png"
            heatmap_path = os.path.join(HEATMAP_DIR, heatmap_filename)
            cv2.imwrite(heatmap_path, result['heatmap'])
            
            _, heatmap_buffer = cv2.imencode('.png', result['heatmap'])
            result['heatmap_base64'] = base64.b64encode(heatmap_buffer).decode('utf-8')
            
            blended_image = blend_heatmap(image, result['heatmap'])
            _, blended_buffer = cv2.imencode('.png', blended_image)
            result['blended_heatmap_base64'] = base64.b64encode(blended_buffer).decode('utf-8')
            
            del result['heatmap']
        
        record = crud.create_detection_record(
            db=db,
            image_name=file.filename,
            image_path=image_path,
            detected_class=result['class'],
            confidence=result['confidence'],
            result_json={k: v for k, v in result.items() if not k.endswith('_base64')},
            heatmap_path=heatmap_path
        )
        
        if add_to_queue or result['class'] == 'unknown' or result['confidence'] < 0.5:
            crud.add_to_labeling_queue(
                db=db,
                image_name=file.filename,
                image_path=image_path,
                predicted_class=result['class'],
                confidence=result['confidence'],
                heatmap_path=heatmap_path
            )
        
        result['record_id'] = record.id
        
        return {
            "success": True,
            "result": result
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/records")
async def get_records(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    records = crud.get_detection_records(db, skip=skip, limit=limit)
    return {"success": True, "records": records}


@app.get("/api/records/{record_id}")
async def get_record(record_id: int, db: Session = Depends(get_db)):
    record = crud.get_detection_record(db, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True, "record": record}


@app.post("/api/records/{record_id}/label")
async def label_record(record_id: int, request: LabelRecordRequest, db: Session = Depends(get_db)):
    record = crud.label_detection_record(db, record_id, request.true_class)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True, "record": record}


@app.delete("/api/records/{record_id}")
async def delete_record(record_id: int, db: Session = Depends(get_db)):
    success = crud.delete_detection_record(db, record_id)
    if not success:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"success": True, "message": "Record deleted"}


@app.get("/api/statistics")
async def get_statistics(db: Session = Depends(get_db)):
    stats = crud.get_statistics(db)
    return {"success": True, "statistics": stats}


@app.get("/api/classes")
async def get_classes():
    return {
        "success": True,
        "classes": ["normal", "scratch", "dent", "unknown"],
        "severities": ["light", "medium", "heavy"],
        "descriptions": {
            "normal": "No defects detected",
            "scratch": "Surface scratches detected",
            "dent": "Dents or indentations detected",
            "unknown": "Unknown or unclassified defect"
        },
        "severity_descriptions": {
            "light": "Minor defect, cosmetic only",
            "medium": "Moderate defect, may require attention",
            "heavy": "Severe defect, requires immediate action"
        }
    }


@app.get("/api/labeling-queue")
async def get_labeling_queue(skip: int = 0, limit: int = 100, only_unlabeled: bool = True, db: Session = Depends(get_db)):
    items = crud.get_labeling_queue(db, skip=skip, limit=limit, only_unlabeled=only_unlabeled)
    return {"success": True, "items": items, "count": len(items)}


@app.post("/api/labeling-queue/{item_id}/label")
async def label_queue_item(item_id: int, request: LabelItemRequest, db: Session = Depends(get_db)):
    success = crud.label_queue_item(db, item_id, request.true_class, request.true_severity)
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True, "message": "Item labeled successfully"}


@app.get("/api/export/csv")
async def export_csv(db: Session = Depends(get_db)):
    csv_content = crud.export_to_csv(db)
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=detection_records.csv"}
    )


@app.get("/api/export/defects-csv")
async def export_defects_csv(db: Session = Depends(get_db)):
    csv_content = crud.export_defects_csv(db)
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=defect_details.csv"}
    )


@app.get("/api/report")
async def get_report(db: Session = Depends(get_db)):
    report = crud.generate_report(db)
    return {"success": True, "report": report}


@app.post("/api/retrain")
async def retrain_model(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    global detector
    
    session = crud.create_training_session(db, "Incremental Training", MODEL_PATH)
    
    labeled_data = crud.get_labeled_data(db)
    if len(labeled_data) < 5:
        return {"success": False, "message": "Need at least 5 labeled samples for retraining"}
    
    try:
        detector = None
        get_detector()
        
        crud.update_training_session(db, session.id, status="completed", num_samples=len(labeled_data))
        
        return {
            "success": True,
            "message": f"Model retrained successfully with {len(labeled_data)} samples"
        }
    except Exception as e:
        crud.update_training_session(db, session.id, status="failed")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
