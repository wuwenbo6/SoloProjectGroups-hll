from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic_settings import BaseSettings
import logging
import io

from .database import engine, get_db, Base
from .models import User, Pillbox, MedicationPlan, MedicationRecord, SensorLog, MedicationRefill
from .schemas import (
    User as UserSchema,
    UserCreate,
    UserUpdate,
    Pillbox as PillboxSchema,
    PillboxCreate,
    MedicationPlan as MedicationPlanSchema,
    MedicationPlanCreate,
    MedicationPlanUpdate,
    MedicationRefill as MedicationRefillSchema,
    MedicationRefillCreate,
    MedicationRecord as MedicationRecordSchema,
    SensorLog as SensorLogSchema,
    SensorDataBatch,
    BatchUploadResponse,
    TTSRequest,
    ReportRequest,
    LowStockAlert,
)
from .mqtt_client import MQTTClient
from .scheduler import init_scheduler, shutdown_scheduler
from .pillbox_state import state_machine
from .tts_service import tts_service
from .report_service import ReportGenerator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    mqtt_broker: str = "localhost"
    mqtt_port: int = 1883
    mqtt_topic: str = "smart_pillbox/#"
    
    class Config:
        env_file = ".env"

settings = Settings()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="智能药盒系统 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mqtt_client: MQTTClient = None

@app.on_event("startup")
async def startup_event():
    global mqtt_client
    mqtt_client = MQTTClient(settings.mqtt_broker, settings.mqtt_port, settings.mqtt_topic)
    mqtt_client.register_handler("sensor", handle_sensor_data)
    mqtt_client.connect()
    init_scheduler()

@app.on_event("shutdown")
async def shutdown_event():
    if mqtt_client:
        mqtt_client.disconnect()
    shutdown_scheduler()

def process_sensor_event(db: Session, pillbox_id: int, device_id: str, 
                         sensor_type: str, value: int, event_timestamp: datetime = None):
    timestamp = event_timestamp or datetime.utcnow()
    
    sensor_log = SensorLog(
        pillbox_id=pillbox_id,
        sensor_type=sensor_type,
        value=str(value),
        timestamp=timestamp
    )
    db.add(sensor_log)
    
    medication_taken = False
    
    if sensor_type == "hall":
        result = state_machine.handle_hall_sensor(device_id, value, timestamp)
        if result.get("medication_taken"):
            medication_taken = True
            mark_medication_taken(db, pillbox_id, timestamp)
            
    elif sensor_type == "ir":
        result = state_machine.handle_ir_sensor(device_id, value, timestamp)
        if result.get("medication_confirmed"):
            medication_taken = True
            mark_medication_taken(db, pillbox_id, timestamp)
    
    return medication_taken

def handle_sensor_data(device_id: str, sensor_type: str, payload: dict):
    db = next(get_db())
    try:
        pillbox = db.query(Pillbox).filter(Pillbox.device_id == device_id).first()
        if not pillbox:
            logger.warning(f"Pillbox not found for device_id: {device_id}")
            return

        pillbox.last_heartbeat = datetime.utcnow()
        pillbox.is_online = True
        
        value = payload.get("value", 0)
        timestamp = datetime.utcnow()
        if "timestamp" in payload:
            try:
                timestamp = datetime.fromtimestamp(payload["timestamp"])
            except:
                pass
        
        process_sensor_event(db, pillbox.id, device_id, sensor_type, value, timestamp)
        
        db.commit()
    except Exception as e:
        logger.error(f"Error handling sensor data: {e}")
        db.rollback()
    finally:
        db.close()

def mark_medication_taken(db: Session, pillbox_id: int, actual_time: datetime = None):
    now = actual_time or (datetime.utcnow() + timedelta(hours=8))
    time_window = timedelta(hours=1)
    
    record = db.query(MedicationRecord).filter(
        MedicationRecord.pillbox_id == pillbox_id,
        MedicationRecord.is_taken == False,
        MedicationRecord.scheduled_time <= now + time_window,
        MedicationRecord.scheduled_time >= now - time_window
    ).order_by(MedicationRecord.scheduled_time).first()
    
    if record:
        record.is_taken = True
        record.actual_time = now
        
        plan = db.query(MedicationPlan).filter(MedicationPlan.id == record.plan_id).first()
        if plan and plan.remaining_pills >= plan.pills_per_dose:
            plan.remaining_pills -= plan.pills_per_dose
            record.pills_taken = plan.pills_per_dose
            logger.info(f"Deducted {plan.pills_per_dose} pills from plan {plan.id}, remaining: {plan.remaining_pills}")
        
        logger.info(f"Marked medication record {record.id} as taken at {now}")
        return True
    else:
        logger.info(f"No pending medication record found for pillbox {pillbox_id}")
        return False

def check_low_stock(db: Session, plan: MedicationPlan, user: User) -> bool:
    if plan.remaining_pills <= plan.refill_threshold and not plan.low_stock_notified:
        logger.warning(f"Low stock alert: {plan.medicine_name} remaining {plan.remaining_pills} pills")
        plan.low_stock_notified = True
        if user and user.wechat_openid:
            from .wechat import wechat_notifier
            wechat_notifier.send_low_stock_reminder(
                user.wechat_openid,
                user.name,
                plan.medicine_name,
                plan.remaining_pills
            )
        return True
    return False

@app.get("/")
def read_root():
    return {"message": "智能药盒系统 API"}

@app.post("/users/", response_model=UserSchema)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = User(**user.dict())
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.get("/users/", response_model=List[UserSchema])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()

@app.get("/users/{user_id}", response_model=UserSchema)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.put("/users/{user_id}", response_model=UserSchema)
def update_user(user_id: int, user_update: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)
    
    db.commit()
    db.refresh(user)
    return user

@app.post("/pillboxes/", response_model=PillboxSchema)
def create_pillbox(pillbox: PillboxCreate, db: Session = Depends(get_db)):
    db_pillbox = Pillbox(**pillbox.dict())
    db.add(db_pillbox)
    db.commit()
    db.refresh(db_pillbox)
    return db_pillbox

@app.get("/pillboxes/", response_model=List[PillboxSchema])
def get_pillboxes(db: Session = Depends(get_db)):
    return db.query(Pillbox).all()

@app.get("/pillboxes/{pillbox_id}", response_model=PillboxSchema)
def get_pillbox(pillbox_id: int, db: Session = Depends(get_db)):
    pillbox = db.query(Pillbox).filter(Pillbox.id == pillbox_id).first()
    if not pillbox:
        raise HTTPException(status_code=404, detail="Pillbox not found")
    return pillbox

@app.post("/plans/", response_model=MedicationPlanSchema)
def create_plan(plan: MedicationPlanCreate, db: Session = Depends(get_db)):
    db_plan = MedicationPlan(**plan.dict())
    db.add(db_plan)
    db.commit()
    db.refresh(db_plan)
    return db_plan

@app.get("/plans/", response_model=List[MedicationPlanSchema])
def get_plans(user_id: int = None, db: Session = Depends(get_db)):
    query = db.query(MedicationPlan)
    if user_id:
        query = query.filter(MedicationPlan.user_id == user_id)
    return query.all()

@app.put("/plans/{plan_id}", response_model=MedicationPlanSchema)
def update_plan(plan_id: int, plan_update: MedicationPlanUpdate, db: Session = Depends(get_db)):
    db_plan = db.query(MedicationPlan).filter(MedicationPlan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    update_data = plan_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_plan, key, value)
    
    if 'remaining_pills' in update_data:
        db_plan.low_stock_notified = False
    
    db.commit()
    db.refresh(db_plan)
    return db_plan

@app.post("/plans/{plan_id}/refill", response_model=MedicationRefillSchema)
def refill_medication(plan_id: int, refill: MedicationRefillCreate, db: Session = Depends(get_db)):
    plan = db.query(MedicationPlan).filter(MedicationPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    previous_count = plan.remaining_pills
    new_count = previous_count + refill.added_count
    
    refill_record = MedicationRefill(
        plan_id=plan_id,
        previous_count=previous_count,
        added_count=refill.added_count,
        new_count=new_count,
        note=refill.note
    )
    
    plan.remaining_pills = new_count
    plan.total_pills = new_count
    plan.low_stock_notified = False
    
    db.add(refill_record)
    db.commit()
    db.refresh(refill_record)
    
    return refill_record

@app.get("/plans/{plan_id}/refills", response_model=List[MedicationRefillSchema])
def get_plan_refills(plan_id: int, db: Session = Depends(get_db)):
    refills = db.query(MedicationRefill).filter(MedicationRefill.plan_id == plan_id).order_by(MedicationRefill.refill_date.desc()).all()
    return refills

@app.get("/alerts/low-stock", response_model=List[LowStockAlert])
def get_low_stock_alerts(db: Session = Depends(get_db)):
    alerts = []
    plans = db.query(MedicationPlan).filter(
        MedicationPlan.is_active == True,
        MedicationPlan.remaining_pills <= MedicationPlan.refill_threshold
    ).all()
    
    for plan in plans:
        user = db.query(User).filter(User.id == plan.user_id).first()
        alerts.append(LowStockAlert(
            plan_id=plan.id,
            medicine_name=plan.medicine_name,
            remaining_pills=plan.remaining_pills,
            threshold=plan.refill_threshold,
            user_id=plan.user_id,
            user_name=user.name if user else "-"
        ))
    
    return alerts

@app.delete("/plans/{plan_id}")
def delete_plan(plan_id: int, db: Session = Depends(get_db)):
    db_plan = db.query(MedicationPlan).filter(MedicationPlan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    db.delete(db_plan)
    db.commit()
    return {"message": "Plan deleted"}

@app.get("/records/", response_model=List[MedicationRecordSchema])
def get_records(user_id: int = None, limit: int = 50, db: Session = Depends(get_db)):
    query = db.query(MedicationRecord)
    if user_id:
        query = query.filter(MedicationRecord.user_id == user_id)
    return query.order_by(MedicationRecord.scheduled_time.desc()).limit(limit).all()

@app.get("/sensor-logs/", response_model=List[SensorLogSchema])
def get_sensor_logs(pillbox_id: int = None, limit: int = 50, db: Session = Depends(get_db)):
    query = db.query(SensorLog)
    if pillbox_id:
        query = query.filter(SensorLog.pillbox_id == pillbox_id)
    return query.order_by(SensorLog.timestamp.desc()).limit(limit).all()

@app.post("/sensor-data/batch", response_model=BatchUploadResponse)
def upload_sensor_data_batch(batch: SensorDataBatch, db: Session = Depends(get_db)):
    pillbox = db.query(Pillbox).filter(Pillbox.device_id == batch.device_id).first()
    if not pillbox:
        raise HTTPException(status_code=404, detail="Pillbox not found")
    
    pillbox.last_heartbeat = datetime.utcnow()
    pillbox.is_online = True
    
    sorted_data = sorted(batch.data, key=lambda x: x.timestamp)
    
    medication_taken = False
    processed_count = 0
    
    for item in sorted_data:
        try:
            taken = process_sensor_event(
                db, pillbox.id, batch.device_id,
                item.sensor_type, item.value, item.timestamp
            )
            if taken:
                medication_taken = True
            processed_count += 1
        except Exception as e:
            logger.error(f"Error processing sensor event: {e}")
            continue
    
    db.commit()
    
    message = f"Successfully processed {processed_count} records"
    if batch.is_offline_data:
        message += " (offline data)"
    
    return BatchUploadResponse(
        success=True,
        processed_count=processed_count,
        medication_taken=medication_taken,
        message=message
    )

@app.post("/tts/generate")
async def generate_tts(request: TTSRequest):
    audio_data = tts_service.generate_speech(request.text, request.voice, request.speed)
    
    if not audio_data:
        raise HTTPException(status_code=500, detail="TTS generation failed")
    
    return Response(
        content=audio_data,
        media_type="audio/wav",
        headers={"Content-Disposition": "attachment; filename=speech.wav"}
    )

@app.get("/tts/reminder/{record_id}")
async def get_reminder_tts(record_id: int, db: Session = Depends(get_db)):
    record = db.query(MedicationRecord).filter(MedicationRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    user = db.query(User).filter(User.id == record.user_id).first()
    plan = db.query(MedicationPlan).filter(MedicationPlan.id == record.plan_id).first()
    
    if not user or not plan:
        raise HTTPException(status_code=404, detail="User or plan not found")
    
    text = tts_service.generate_reminder_text(user.name, plan.medicine_name, plan.dosage)
    audio_data = tts_service.generate_speech(text, user.tts_voice)
    
    if not audio_data:
        raise HTTPException(status_code=500, detail="TTS generation failed")
    
    record.tts_played = True
    db.commit()
    
    return Response(
        content=audio_data,
        media_type="audio/wav",
        headers={"Content-Disposition": f"attachment; filename=reminder_{record_id}.wav"}
    )

@app.post("/reports/export/csv")
async def export_report_csv(request: ReportRequest, db: Session = Depends(get_db)):
    generator = ReportGenerator(db)
    csv_data = generator.generate_csv_report(request.user_id, request.start_date, request.end_date)
    
    filename = f"medication_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.post("/reports/summary")
async def get_report_summary(request: ReportRequest, db: Session = Depends(get_db)):
    generator = ReportGenerator(db)
    summary = generator.generate_summary(request.user_id, request.start_date, request.end_date)
    return summary

@app.get("/reports/daily/{user_id}")
async def get_daily_report(user_id: int, date: Optional[datetime] = None, db: Session = Depends(get_db)):
    if not date:
        date = datetime.now()
    generator = ReportGenerator(db)
    return generator.generate_daily_report(user_id, date)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
