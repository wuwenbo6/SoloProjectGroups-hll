from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os

from app.core import get_db
from app.models import TestTask
from app.services.report_generator import ReportGenerator, TestReport
from app.services import get_fuzzer_manager

router = APIRouter(prefix="/reports", tags=["reports"])

_report_generator = ReportGenerator()


@router.post("/{task_id}")
def generate_report(task_id: int, format: str = "html", db: Session = Depends(get_db)):
    task = db.query(TestTask).filter(TestTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="测试任务不存在")
    
    try:
        fuzzer_manager = get_fuzzer_manager()
        fuzzer = fuzzer_manager.get_fuzzer(task_id)
        state_machine = fuzzer._state_machine if fuzzer and hasattr(fuzzer, '_state_machine') else None
        
        report = _report_generator.generate_report(task_id, state_machine=state_machine)
        filepath = _report_generator.save_report(report, format=format)
        
        return {
            "message": "报告生成成功",
            "task_id": task_id,
            "format": format,
            "filepath": filepath,
            "filename": os.path.basename(filepath),
            "report_summary": {
                "total_packets": report.total_packets,
                "total_crashes": report.total_crashes,
                "crash_rate": report.crash_rate,
                "duration_seconds": report.duration_seconds,
                "recommendations": report.recommendations,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"报告生成失败: {str(e)}")


@router.get("/{task_id}/download")
def download_report(task_id: int, format: str = "html"):
    reports_dir = _report_generator.output_dir
    
    if not os.path.exists(reports_dir):
        raise HTTPException(status_code=404, detail="报告目录不存在")
    
    prefix = f"report_{task_id}_"
    extension = f".{format.lower()}"
    
    matching_files = []
    for f in os.listdir(reports_dir):
        if f.startswith(prefix) and f.endswith(extension):
            full_path = os.path.join(reports_dir, f)
            matching_files.append((os.path.getmtime(full_path), full_path))
    
    if not matching_files:
        raise HTTPException(status_code=404, detail=f"未找到任务 {task_id} 的 {format.upper()} 报告")
    
    matching_files.sort(reverse=True)
    latest_report = matching_files[0][1]
    
    return FileResponse(
        latest_report,
        media_type="text/html" if format.lower() == "html" else "application/json",
        filename=os.path.basename(latest_report)
    )


@router.get("/{task_id}/preview")
def get_report_preview(task_id: int, db: Session = Depends(get_db)):
    task = db.query(TestTask).filter(TestTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="测试任务不存在")
    
    try:
        fuzzer_manager = get_fuzzer_manager()
        fuzzer = fuzzer_manager.get_fuzzer(task_id)
        state_machine = fuzzer._state_machine if fuzzer and hasattr(fuzzer, '_state_machine') else None
        
        report = _report_generator.generate_report(task_id, state_machine=state_machine)
        return report.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"报告生成失败: {str(e)}")


@router.get("")
def list_reports():
    reports_dir = _report_generator.output_dir
    
    if not os.path.exists(reports_dir):
        return {"reports": []}
    
    reports = []
    for f in sorted(os.listdir(reports_dir), reverse=True):
        if f.startswith("report_") and (f.endswith(".html") or f.endswith(".json")):
            full_path = os.path.join(reports_dir, f)
            stat = os.stat(full_path)
            parts = f.replace("report_", "").replace(".html", "").replace(".json", "").split("_")
            task_id = int(parts[0]) if parts and parts[0].isdigit() else 0
            
            reports.append({
                "filename": f,
                "task_id": task_id,
                "format": "html" if f.endswith(".html") else "json",
                "size": stat.st_size,
                "created_time": stat.st_mtime,
                "filepath": full_path,
            })
    
    return {"reports": reports}
