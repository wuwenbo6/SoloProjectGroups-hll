from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core import get_db
from app.models import Target
from app.schemas import TargetCreate, TargetUpdate, Target as TargetSchema, ConnectionTestResult
from app.services import PLCHealthMonitor

router = APIRouter(prefix="/targets", tags=["targets"])


@router.get("", response_model=List[TargetSchema])
def get_targets(db: Session = Depends(get_db)):
    targets = db.query(Target).order_by(Target.created_at.desc()).all()
    return targets


@router.get("/{target_id}", response_model=TargetSchema)
def get_target(target_id: int, db: Session = Depends(get_db)):
    target = db.query(Target).filter(Target.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="目标设备不存在")
    return target


@router.post("", response_model=TargetSchema)
def create_target(target: TargetCreate, db: Session = Depends(get_db)):
    db_target = Target(**target.model_dump())
    db.add(db_target)
    db.commit()
    db.refresh(db_target)
    return db_target


@router.put("/{target_id}", response_model=TargetSchema)
def update_target(target_id: int, target: TargetUpdate, db: Session = Depends(get_db)):
    db_target = db.query(Target).filter(Target.id == target_id).first()
    if not db_target:
        raise HTTPException(status_code=404, detail="目标设备不存在")
    
    for key, value in target.model_dump().items():
        setattr(db_target, key, value)
    
    db.commit()
    db.refresh(db_target)
    return db_target


@router.delete("/{target_id}")
def delete_target(target_id: int, db: Session = Depends(get_db)):
    db_target = db.query(Target).filter(Target.id == target_id).first()
    if not db_target:
        raise HTTPException(status_code=404, detail="目标设备不存在")
    
    db.delete(db_target)
    db.commit()
    return {"message": "删除成功"}


@router.post("/{target_id}/test", response_model=ConnectionTestResult)
def test_target_connection(target_id: int, db: Session = Depends(get_db)):
    target = db.query(Target).filter(Target.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="目标设备不存在")
    
    monitor = PLCHealthMonitor(target.ip_address, target.port, target.slave_id, target.timeout)
    success, message, response_time = monitor.test_connection()
    
    return ConnectionTestResult(
        success=success,
        message=message,
        response_time_ms=response_time
    )
