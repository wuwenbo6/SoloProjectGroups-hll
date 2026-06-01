from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.models.database import get_db, TrainingSession, ActionRecord
from app.schemas.training import (
    TrainingSessionCreate,
    TrainingSessionResponse,
)

router = APIRouter(prefix="/training", tags=["training"])


@router.get("", response_model=List[TrainingSessionResponse])
def get_training_sessions(db: Session = Depends(get_db)):
    sessions = db.query(TrainingSession).order_by(TrainingSession.start_time.desc()).all()
    return [TrainingSessionResponse.from_orm(s) for s in sessions]


@router.get("/{session_id}", response_model=TrainingSessionResponse)
def get_training_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Training session not found")
    return TrainingSessionResponse.from_orm(session)


@router.post("", response_model=TrainingSessionResponse)
def create_training_session(session_data: TrainingSessionCreate, db: Session = Depends(get_db)):
    session = TrainingSession(
        start_time=datetime.fromisoformat(session_data.startTime.replace('Z', '+00:00')),
        end_time=datetime.fromisoformat(session_data.endTime.replace('Z', '+00:00')),
        duration=session_data.duration,
        total_calories=session_data.totalCalories,
    )
    
    for action_data in session_data.actions:
        action_record = ActionRecord(
            action_name=action_data.action_name,
            count=action_data.count,
            avg_confidence=action_data.avg_confidence
        )
        session.actions.append(action_record)
    
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return TrainingSessionResponse.from_orm(session)


@router.delete("/{session_id}")
def delete_training_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Training session not found")
    
    db.delete(session)
    db.commit()
    
    return {"message": "Training session deleted successfully"}
