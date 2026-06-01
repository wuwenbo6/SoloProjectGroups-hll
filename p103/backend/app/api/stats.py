from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core import get_db
from app.models import Target, TestTask, PacketRecord, CrashRecord
from app.schemas import DashboardStats, CrashRecord as CrashSchema, TestTask as TaskSchema

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    total_targets = db.query(func.count(Target.id)).scalar() or 0
    total_tasks = db.query(func.count(TestTask.id)).scalar() or 0
    running_tasks = db.query(func.count(TestTask.id)).filter(TestTask.status == "running").scalar() or 0
    total_packets = db.query(func.count(PacketRecord.id)).scalar() or 0
    total_crashes = db.query(func.count(CrashRecord.id)).scalar() or 0
    
    recent_crashes = db.query(CrashRecord)\
        .order_by(CrashRecord.timestamp.desc())\
        .limit(5)\
        .all()
    
    recent_tasks = db.query(TestTask)\
        .order_by(TestTask.start_time.desc().nullslast())\
        .limit(5)\
        .all()
    
    return DashboardStats(
        total_targets=total_targets,
        total_tasks=total_tasks,
        running_tasks=running_tasks,
        total_packets=total_packets,
        total_crashes=total_crashes,
        recent_crashes=recent_crashes,
        recent_tasks=recent_tasks
    )
