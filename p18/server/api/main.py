from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os
import json
import uuid
import numpy as np

from .database import get_db, User, GaitSession, MLModel, Doctor, GaitReport
from training.gait_trainer import GaitTrainer
from training.rehab_score import RehabScorer
from training.pdf_generator import PDFReportGenerator

app = FastAPI(title="步态分析云端API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_STORAGE_PATH = os.getenv("MODEL_STORAGE_PATH", "./models")
DATA_STORAGE_PATH = os.getenv("DATA_STORAGE_PATH", "./data")
os.makedirs(MODEL_STORAGE_PATH, exist_ok=True)
os.makedirs(DATA_STORAGE_PATH, exist_ok=True)


class IMUDataPoint(BaseModel):
    timestamp: int
    accelX: float
    accelY: float
    accelZ: float
    gyroX: float
    gyroY: float
    gyroZ: float
    predictedPhase: str
    confidence: float


class UploadRequest(BaseModel):
    sessionId: str
    userId: str
    data: List[IMUDataPoint]


class UploadResponse(BaseModel):
    success: bool
    message: str
    modelUpdated: bool = False


@app.get("/")
async def root():
    return {"message": "步态分析云端API服务运行中"}


@app.post("/api/data/upload", response_model=UploadResponse)
async def upload_data(request: UploadRequest, db: Session = Depends(get_db)):
    try:
        user_dir = os.path.join(DATA_STORAGE_PATH, request.userId)
        os.makedirs(user_dir, exist_ok=True)
        
        data_file = os.path.join(user_dir, f"{request.sessionId}.json")
        
        existing_data = []
        if os.path.exists(data_file):
            with open(data_file, 'r') as f:
                existing_data = json.load(f)
        
        new_data = [dp.dict() for dp in request.data]
        existing_data.extend(new_data)
        
        with open(data_file, 'w') as f:
            json.dump(existing_data, f)
        
        data_count = len(existing_data)
        should_train = data_count >= 1000 and data_count % 500 == 0
        
        model_updated = False
        if should_train:
            try:
                trainer = GaitTrainer(request.userId, MODEL_STORAGE_PATH)
                model_path, accuracy = trainer.train(existing_data)
                
                db_model = MLModel(
                    user_id=request.userId,
                    model_version=f"v{datetime.now().strftime('%Y%m%d%H%M%S')}",
                    model_path=model_path,
                    accuracy=float(accuracy),
                    trained_on_samples=data_count,
                    is_personalized=True,
                    is_active=True
                )
                db.add(db_model)
                db.commit()
                model_updated = True
            except Exception as e:
                print(f"训练失败: {e}")
        
        return UploadResponse(
            success=True,
            message=f"成功上传 {len(request.data)} 条数据",
            modelUpdated=model_updated
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/model/download/{user_id}")
async def download_model(user_id: str, db: Session = Depends(get_db)):
    model = db.query(MLModel).filter(
        MLModel.user_id == user_id,
        MLModel.is_active == True
    ).order_by(MLModel.created_at.desc()).first()
    
    if model and os.path.exists(model.model_path):
        return FileResponse(
            model.model_path,
            media_type="application/octet-stream",
            filename=f"gait_model_{user_id}.tflite"
        )
    
    default_model = os.path.join(MODEL_STORAGE_PATH, "default", "gait_lstm_model.tflite")
    if os.path.exists(default_model):
        return FileResponse(
            default_model,
            media_type="application/octet-stream",
            filename="gait_lstm_model.tflite"
        )
    
    raise HTTPException(status_code=404, detail="模型未找到")


@app.get("/api/model/info/{user_id}")
async def get_model_info(user_id: str, db: Session = Depends(get_db)):
    model = db.query(MLModel).filter(
        MLModel.user_id == user_id,
        MLModel.is_active == True
    ).order_by(MLModel.created_at.desc()).first()
    
    if model:
        return {
            "modelVersion": model.model_version,
            "lastUpdated": model.created_at.timestamp() * 1000,
            "accuracy": model.accuracy
        }
    
    return {
        "modelVersion": "default",
        "lastUpdated": 0,
        "accuracy": 0.85
    }


@app.post("/api/session/start")
async def start_session(session: dict, db: Session = Depends(get_db)):
    db_session = GaitSession(
        id=str(uuid.uuid4()),
        user_id=session.get("userId"),
        session_id=session.get("sessionId"),
        start_time=datetime.fromtimestamp(session.get("startTime", 0) / 1000)
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return session


@app.post("/api/session/end")
async def end_session(session: dict, db: Session = Depends(get_db)):
    db_session = db.query(GaitSession).filter(
        GaitSession.session_id == session.get("sessionId")
    ).first()
    
    if db_session:
        db_session.end_time = datetime.fromtimestamp(session.get("endTime", 0) / 1000)
        db_session.total_steps = session.get("totalSteps", 0)
        db_session.avg_stance_time = session.get("avgStanceTime", 0)
        db_session.avg_swing_time = session.get("avgSwingTime", 0)
        db_session.asymmetry_index = session.get("asymmetryIndex", 0)
        db.commit()
    
    return session


@app.get("/api/session/list")
async def get_session_list(userId: str, db: Session = Depends(get_db)):
    sessions = db.query(GaitSession).filter(
        GaitSession.user_id == userId
    ).order_by(GaitSession.created_at.desc()).all()
    
    return [{
        "sessionId": s.session_id,
        "userId": s.user_id,
        "startTime": s.start_time.timestamp() * 1000,
        "endTime": s.end_time.timestamp() * 1000 if s.end_time else None,
        "totalSteps": s.total_steps,
        "avgStanceTime": s.avg_stance_time,
        "avgSwingTime": s.avg_swing_time,
        "asymmetryIndex": s.asymmetry_index
    } for s in sessions]


@app.get("/api/doctor/patients")
async def get_patients(doctorId: str, db: Session = Depends(get_db)):
    patients = db.query(User).filter(User.doctor_id == doctorId).all()
    return [{
        "id": p.id,
        "name": p.name,
        "email": p.email
    } for p in patients]


@app.get("/api/doctor/reports")
async def get_reports(doctorId: Optional[str] = None, userId: Optional[str] = None, 
                      db: Session = Depends(get_db)):
    query = db.query(GaitReport)
    if doctorId:
        query = query.filter(GaitReport.doctor_id == doctorId)
    if userId:
        query = query.filter(GaitReport.user_id == userId)
    
    reports = query.order_by(GaitReport.created_at.desc()).all()
    
    return [{
        "id": r.id,
        "sessionId": r.session_id,
        "userId": r.user_id,
        "reportContent": r.report_content,
        "recommendations": r.recommendations,
        "createdAt": r.created_at.timestamp() * 1000,
        "isReviewed": r.is_reviewed
    } for r in reports]


@app.get("/api/report/{report_id}")
async def get_report(report_id: str, db: Session = Depends(get_db)):
    report = db.query(GaitReport).filter(GaitReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="报告未找到")
    
    return {
        "id": report.id,
        "sessionId": report.session_id,
        "userId": report.user_id,
        "reportContent": report.report_content,
        "recommendations": report.recommendations,
        "createdAt": report.created_at.timestamp() * 1000,
        "isReviewed": report.is_reviewed
    }


@app.post("/api/report/generate/{session_id}")
async def generate_report(session_id: str, db: Session = Depends(get_db)):
    session = db.query(GaitSession).filter(GaitSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="会话未找到")
    
    report_content = generate_gait_analysis_report(session)
    recommendations = generate_recommendations(session)
    
    report = GaitReport(
        id=str(uuid.uuid4()),
        session_id=session_id,
        user_id=session.user_id,
        report_content=report_content,
        recommendations=recommendations
    )
    db.add(report)
    db.commit()
    
    return {"reportId": report.id}


def generate_gait_analysis_report(session):
    stance_ratio = session.avg_stance_time / (session.avg_stance_time + session.avg_swing_time) if (session.avg_stance_time + session.avg_swing_time) > 0 else 0
    
    report = f"""步态分析报告
============

会话信息:
- 用户ID: {session.user_id}
- 会话ID: {session.session_id}
- 分析时间: {session.start_time}

步态参数:
- 总步数: {session.total_steps}
- 平均支撑相时间: {session.avg_stance_time:.2f} ms
- 平均摆动相时间: {session.avg_swing_time:.2f} ms
- 支撑相比率: {stance_ratio:.2%}
- 不对称指数: {session.asymmetry_index:.2f}

分析结果:
"""
    
    if 0.6 <= stance_ratio <= 0.65:
        report += "- 支撑相时间比例在正常范围内\n"
    elif stance_ratio > 0.65:
        report += "- 支撑相时间偏长，可能表明步态稳定性问题\n"
    else:
        report += "- 支撑相时间偏短，可能表明步态速度过快\n"
    
    if session.asymmetry_index < 5:
        report += "- 左右步态对称性良好\n"
    elif session.asymmetry_index < 15:
        report += "- 左右步态存在轻度不对称\n"
    else:
        report += "- 左右步态存在明显不对称，建议进一步检查\n"
    
    return report


def generate_recommendations(session):
    recs = []
    
    if session.asymmetry_index > 10:
        recs.append("1. 建议进行平衡训练，改善步态对称性")
        recs.append("2. 考虑进行物理治疗以纠正步态偏差")
    
    if session.avg_stance_time > 800:
        recs.append("3. 支撑相时间偏长，建议进行速度训练")
    
    if session.avg_stance_time < 500:
        recs.append("3. 支撑相时间偏短，建议加强下肢力量训练")
    
    recs.append("4. 建议每天进行30分钟的步行训练")
    recs.append("5. 定期复查步态分析，跟踪改善情况")
    
    return "\n".join(recs)


@app.get("/api/scores/{session_id}")
async def get_rehab_scores(session_id: str, userId: str):
    try:
        user_dir = os.path.join(DATA_STORAGE_PATH, userId)
        data_file = os.path.join(user_dir, f"{session_id}.json")
        
        if not os.path.exists(data_file):
            raise HTTPException(status_code=404, detail="数据文件未找到")
        
        with open(data_file, 'r') as f:
            data = json.load(f)
        
        scorer = RehabScorer()
        scores = scorer.calculate_all_scores(data)
        interpretations = scorer.get_score_interpretation(scores)
        
        return {
            "scores": scores,
            "interpretations": interpretations
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/report/pdf/{session_id}")
async def generate_pdf_report(session_id: str, userId: str, db: Session = Depends(get_db)):
    try:
        user_dir = os.path.join(DATA_STORAGE_PATH, userId)
        data_file = os.path.join(user_dir, f"{session_id}.json")
        
        if not os.path.exists(data_file):
            raise HTTPException(status_code=404, detail="数据文件未找到")
        
        with open(data_file, 'r') as f:
            data = json.load(f)
        
        session = db.query(GaitSession).filter(
            GaitSession.session_id == session_id
        ).first()
        
        session_info = {
            "total_steps": session.total_steps if session else 0,
            "duration_minutes": len(data) / 50 / 60
        }
        
        pdf_generator = PDFReportGenerator("./reports")
        pdf_path = pdf_generator.generate_report(session_id, userId, data, session_info)
        
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=f"gait_report_{session_id}.pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/report/pdf/download/{filename}")
async def download_pdf_report(filename: str):
    pdf_path = os.path.join("./reports", filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="报告文件未找到")
    
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=filename
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
