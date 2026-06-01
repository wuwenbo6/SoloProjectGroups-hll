from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import json
import asyncio

from database import get_db, init_db, Record, SeizureEvent
from cnn_model import seizure_model

app = FastAPI(title="EEG Seizure Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EEGDataPacket(BaseModel):
    timestamp: float
    channelData: List[float]
    samplingRate: int


class DetectionResult(BaseModel):
    timestamp: float
    isSeizure: bool
    confidence: float
    seizureType: Optional[str] = None


class RecordCreate(BaseModel):
    startTime: str
    endTime: str
    eegData: List[List[float]]
    detectionResults: List[dict]


class RecordResponse(BaseModel):
    id: str
    startTime: str
    endTime: str
    seizureCount: int
    duration: int
    createdAt: str


class SeizureEventResponse(BaseModel):
    timestamp: str
    duration: float
    confidence: float
    seizureType: Optional[str]


class RecordDetailResponse(BaseModel):
    id: str
    startTime: str
    endTime: str
    seizureEvents: List[SeizureEventResponse]
    eegPreview: List[List[float]]


@app.on_event("startup")
async def startup_event():
    init_db()
    print("Database initialized")


@app.websocket("/ws/eeg")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    eeg_buffer = []
    buffer_size = 256
    
    try:
        while True:
            data = await websocket.receive_text()
            packet = json.loads(data)
            
            channel_data = packet.get("channelData", [])
            timestamp = packet.get("timestamp", 0)
            
            if len(channel_data) == 4:
                eeg_buffer.append(channel_data)
                
                if len(eeg_buffer) >= buffer_size:
                    result = seizure_model.predict(eeg_buffer[-buffer_size:])
                    
                    detection_result = {
                        "timestamp": timestamp,
                        "isSeizure": result["is_seizure"],
                        "confidence": result["confidence"],
                        "seizureType": result["seizure_type"]
                    }
                    
                    await websocket.send_json(detection_result)
                    eeg_buffer = eeg_buffer[-128:]
                
            await asyncio.sleep(0.001)
            
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")


@app.get("/api/records", response_model=dict)
async def get_records(page: int = 1, limit: int = 20, db: Session = Depends(get_db)):
    offset = (page - 1) * limit
    
    records = db.query(Record).order_by(Record.start_time.desc()).offset(offset).limit(limit).all()
    total = db.query(Record).count()
    
    return {
        "records": [
            {
                "id": r.id,
                "startTime": r.start_time.isoformat(),
                "endTime": r.end_time.isoformat(),
                "seizureCount": r.seizure_count,
                "duration": r.duration_seconds,
                "createdAt": r.created_at.isoformat()
            }
            for r in records
        ],
        "total": total,
        "page": page,
        "limit": limit
    }


@app.get("/api/records/{record_id}", response_model=RecordDetailResponse)
async def get_record_detail(record_id: str, db: Session = Depends(get_db)):
    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    events = db.query(SeizureEvent).filter(SeizureEvent.record_id == record_id).all()
    
    return {
        "id": record.id,
        "startTime": record.start_time.isoformat(),
        "endTime": record.end_time.isoformat(),
        "seizureEvents": [
            {
                "timestamp": e.timestamp.isoformat(),
                "duration": e.duration,
                "confidence": e.confidence,
                "seizureType": e.seizure_type
            }
            for e in events
        ],
        "eegPreview": []
    }


@app.post("/api/records", response_model=dict)
async def create_record(record_data: RecordCreate, db: Session = Depends(get_db)):
    try:
        start_time = datetime.fromisoformat(record_data.startTime.replace('Z', '+00:00'))
        end_time = datetime.fromisoformat(record_data.endTime.replace('Z', '+00:00'))
        
        record = Record(
            start_time=start_time,
            end_time=end_time,
            duration_seconds=int((end_time - start_time).total_seconds()),
            seizure_count=sum(1 for r in record_data.detectionResults if r.get("isSeizure", False))
        )
        db.add(record)
        db.flush()
        
        for result in record_data.detectionResults:
            if result.get("isSeizure", False):
                event = SeizureEvent(
                    record_id=record.id,
                    timestamp=datetime.fromtimestamp(result["timestamp"] / 1000),
                    duration=result.get("duration", 1.0),
                    confidence=result["confidence"],
                    seizure_type=result.get("seizureType")
                )
                db.add(event)
        
        db.commit()
        
        return {"success": True, "recordId": record.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/records/{record_id}")
async def delete_record(record_id: str, db: Session = Depends(get_db)):
    record = db.query(Record).filter(Record.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    db.delete(record)
    db.commit()
    
    return {"success": True}


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "model_loaded": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
