from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import json

from app.core import get_db
from app.models import TestTask, Target, PacketRecord, CrashRecord
from app.schemas import (
    TestTaskCreate, TestTaskUpdate, TestTask as TestTaskSchema,
    PacketRecord as PacketSchema, CrashRecord as CrashSchema, TaskControl
)
from app.services import get_fuzzer_manager

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _get_fuzzer_manager():
    return get_fuzzer_manager()


@router.get("", response_model=List[TestTaskSchema])
def get_tasks(db: Session = Depends(get_db)):
    tasks = db.query(TestTask).order_by(TestTask.start_time.desc().nullslast()).all()
    return tasks


@router.get("/{task_id}", response_model=TestTaskSchema)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(TestTask).filter(TestTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="测试任务不存在")
    return task


@router.post("", response_model=TestTaskSchema)
def create_task(task: TestTaskCreate, db: Session = Depends(get_db)):
    target = db.query(Target).filter(Target.id == task.target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="目标设备不存在")
    
    db_task = TestTask(
        name=task.name,
        target_id=task.target_id,
        status="idle",
        strategies_json=json.dumps(task.strategies),
        packet_count=0,
        crash_count=0
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task


@router.put("/{task_id}", response_model=TestTaskSchema)
def update_task(task_id: int, task: TestTaskUpdate, db: Session = Depends(get_db)):
    db_task = db.query(TestTask).filter(TestTask.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="测试任务不存在")
    
    for key, value in task.model_dump(exclude_unset=True).items():
        setattr(db_task, key, value)
    
    db.commit()
    db.refresh(db_task)
    return db_task


@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    db_task = db.query(TestTask).filter(TestTask.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="测试任务不存在")
    
    fuzzer_manager = _get_fuzzer_manager()
    fuzzer_manager.remove_fuzzer(task_id)
    
    db.delete(db_task)
    db.commit()
    return {"message": "删除成功"}


@router.post("/{task_id}/start")
def start_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(TestTask).filter(TestTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="测试任务不存在")
    
    target = db.query(Target).filter(Target.id == task.target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="目标设备不存在")
    
    strategies = json.loads(task.strategies_json) if task.strategies_json else []
    
    fuzzer_manager = _get_fuzzer_manager()
    fuzzer = fuzzer_manager.create_fuzzer(
        task_id=task_id,
        target_config={
            "ip_address": target.ip_address,
            "port": target.port,
            "slave_id": target.slave_id,
            "timeout": target.timeout
        },
        strategies=strategies
    )
    
    fuzzer.start()
    
    return {"message": "测试已启动", "task_id": task_id}


@router.post("/{task_id}/pause")
def pause_task(task_id: int):
    fuzzer_manager = _get_fuzzer_manager()
    fuzzer = fuzzer_manager.get_fuzzer(task_id)
    if not fuzzer:
        raise HTTPException(status_code=404, detail="测试任务未运行")
    
    if fuzzer.pause():
        return {"message": "测试已暂停"}
    return {"message": "测试暂停失败"}


@router.post("/{task_id}/resume")
def resume_task(task_id: int):
    fuzzer_manager = _get_fuzzer_manager()
    fuzzer = fuzzer_manager.get_fuzzer(task_id)
    if not fuzzer:
        raise HTTPException(status_code=404, detail="测试任务未运行")
    
    if fuzzer.resume():
        return {"message": "测试已继续"}
    return {"message": "测试继续失败"}


@router.post("/{task_id}/stop")
def stop_task(task_id: int):
    fuzzer_manager = _get_fuzzer_manager()
    fuzzer = fuzzer_manager.get_fuzzer(task_id)
    if not fuzzer:
        raise HTTPException(status_code=404, detail="测试任务未运行")
    
    if fuzzer.stop():
        return {"message": "测试已停止"}
    return {"message": "测试停止失败"}


@router.get("/{task_id}/status")
def get_task_status(task_id: int):
    fuzzer_manager = _get_fuzzer_manager()
    fuzzer = fuzzer_manager.get_fuzzer(task_id)
    if fuzzer:
        return fuzzer.get_status()
    
    from app.core import SessionLocal
    db = SessionLocal()
    task = db.query(TestTask).filter(TestTask.id == task_id).first()
    db.close()
    
    if not task:
        raise HTTPException(status_code=404, detail="测试任务不存在")
    
    return {
        "task_id": task_id,
        "status": task.status,
        "packet_count": task.packet_count,
        "crash_count": task.crash_count,
        "crash_packets": []
    }


@router.get("/{task_id}/packets", response_model=List[PacketSchema])
def get_task_packets(task_id: int, limit: int = 100, db: Session = Depends(get_db)):
    packets = db.query(PacketRecord)\
        .filter(PacketRecord.task_id == task_id)\
        .order_by(PacketRecord.timestamp.desc())\
        .limit(limit)\
        .all()
    return packets


@router.get("/{task_id}/crashes", response_model=List[CrashSchema])
def get_task_crashes(task_id: int, db: Session = Depends(get_db)):
    crashes = db.query(CrashRecord)\
        .filter(CrashRecord.task_id == task_id)\
        .order_by(CrashRecord.timestamp.desc())\
        .all()
    return crashes
