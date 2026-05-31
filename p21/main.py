import os
import uuid
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
import shutil

from config import Config
from database import init_db, get_db, RecognitionRecord, Component
from circuit_recognizer import CircuitRecognizer

Config.ensure_dirs()
init_db()

app = FastAPI(title="Circuit OCR API", description="电路图识别和SPICE网表生成API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=Config.STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=Config.UPLOAD_DIR), name="uploads")
app.mount("/outputs", StaticFiles(directory=Config.OUTPUT_DIR), name="outputs")

recognizer = None

def get_recognizer():
    global recognizer
    if recognizer is None:
        recognizer = CircuitRecognizer()
    return recognizer

@app.get("/")
async def root():
    return FileResponse(os.path.join(Config.STATIC_DIR, "index.html"))

@app.post("/api/recognize")
async def recognize_circuit(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    recognizer: CircuitRecognizer = Depends(get_recognizer)
):
    try:
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4().hex}{file_ext}"
        file_path = os.path.join(Config.UPLOAD_DIR, unique_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        result = recognizer.process_image(file_path)
        
        record = RecognitionRecord(
            filename=file.filename,
            original_path=f"/uploads/{unique_filename}",
            visualization_path=os.path.relpath(result['visualization_path'], Config.BASE_DIR),
            spice_netlist=result['spice_netlist'],
            component_count=result['component_count'],
            wiring_count=result['wiring_count']
        )
        db.add(record)
        db.flush()
        
        for comp in result['components']:
            component = Component(
                record_id=record.id,
                component_id=comp['id'],
                type=comp['type'],
                confidence=comp['confidence'],
                text=comp['text'],
                x=comp['x'],
                y=comp['y'],
                width=comp['width'],
                height=comp['height'],
                area=comp['area'],
                pin_count=comp['pin_count']
            )
            db.add(component)
        
        db.commit()
        db.refresh(record)
        
        return {
            "success": True,
            "record_id": record.id,
            "components": result['components'],
            "connections": result['connections'],
            "spice_netlist": result['spice_netlist'],
            "visualization_path": "/" + os.path.relpath(result['visualization_path'], Config.BASE_DIR),
            "error_highlight_path": "/" + os.path.relpath(result['error_highlight_path'], Config.BASE_DIR),
            "original_path": f"/uploads/{unique_filename}",
            "component_count": result['component_count'],
            "wiring_count": result['wiring_count'],
            "routing_suggestions": result['routing_suggestions'],
            "validation": result['validation']
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/records")
async def get_records(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    records = db.query(RecognitionRecord).order_by(RecognitionRecord.created_at.desc()).offset(skip).limit(limit).all()
    return {
        "success": True,
        "records": [record.to_dict() for record in records]
    }

@app.get("/api/records/{record_id}")
async def get_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(RecognitionRecord).filter(RecognitionRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return {
        "success": True,
        "record": record.to_dict()
    }

@app.delete("/api/records/{record_id}")
async def delete_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(RecognitionRecord).filter(RecognitionRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    db.delete(record)
    db.commit()
    return {"success": True, "message": "Record deleted"}

@app.get("/api/netlist/{record_id}")
async def get_netlist(record_id: int, db: Session = Depends(get_db)):
    record = db.query(RecognitionRecord).filter(RecognitionRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    return JSONResponse(
        content={"netlist": record.spice_netlist},
        headers={"Content-Disposition": f"attachment; filename=circuit_{record_id}.sp"}
    )

@app.get("/api/kicad/sch/{record_id}")
async def export_kicad_schematic(record_id: int, db: Session = Depends(get_db)):
    record = db.query(RecognitionRecord).filter(RecognitionRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    from kicad_exporter.kicad_writer import KiCadExporter
    exporter = KiCadExporter()
    
    components = [c.to_dict() for c in record.components]
    connections = []
    
    output_filename = f"circuit_{record_id}.kicad_sch"
    output_path = os.path.join(Config.OUTPUT_DIR, output_filename)
    
    exporter.export_schematic(components, connections, output_path)
    
    return FileResponse(
        output_path,
        media_type="application/octet-stream",
        filename=output_filename
    )

@app.get("/api/kicad/pcb/{record_id}")
async def export_kicad_pcb(record_id: int, db: Session = Depends(get_db)):
    record = db.query(RecognitionRecord).filter(RecognitionRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    from kicad_exporter.kicad_writer import KiCadExporter
    exporter = KiCadExporter()
    
    components = [c.to_dict() for c in record.components]
    routing_suggestions = {'suggestions': []}
    
    output_filename = f"circuit_{record_id}.kicad_pcb"
    output_path = os.path.join(Config.OUTPUT_DIR, output_filename)
    
    exporter.export_pcb(components, routing_suggestions, output_path)
    
    return FileResponse(
        output_path,
        media_type="application/octet-stream",
        filename=output_filename
    )

@app.get("/api/kicad/project/{record_id}")
async def export_kicad_project(record_id: int, db: Session = Depends(get_db)):
    record = db.query(RecognitionRecord).filter(RecognitionRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    from kicad_exporter.kicad_writer import KiCadExporter
    exporter = KiCadExporter()
    
    components = [c.to_dict() for c in record.components]
    connections = []
    routing_suggestions = {'suggestions': []}
    
    project_info = exporter.export_full_project(
        components, connections, routing_suggestions, Config.OUTPUT_DIR
    )
    
    import shutil
    zip_path = os.path.join(Config.OUTPUT_DIR, f"{project_info['project_name']}.zip")
    shutil.make_archive(zip_path.replace('.zip', ''), 'zip', project_info['project_dir'])
    
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=f"{project_info['project_name']}.zip"
    )

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Circuit OCR API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
