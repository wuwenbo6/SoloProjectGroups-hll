from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, JSONResponse
from sqlalchemy.orm import Session
from typing import List

from app.models.database import get_db
from app.services.action_scoring import ActionScoringService
from app.services.training_plan import TrainingPlanService
from app.services.report_generator import ReportGeneratorService
from app.schemas.pose import PoseFrame

router = APIRouter(prefix="/advanced", tags=["advanced"])

scoring_service = ActionScoringService()
plan_service = TrainingPlanService()


@router.post("/score/{action_type}")
def score_action(action_type: str, frames: List[PoseFrame]):
    landmarks_sequence = []
    for frame in frames:
        landmarks_sequence.append(frame.landmarks)
    
    result = scoring_service.score_action(landmarks_sequence, action_type)
    return result


@router.get("/plans")
def get_training_plans(
    difficulty: str = Query(None, description="Filter by difficulty: beginner, intermediate, advanced"),
    exercise: str = Query(None, description="Filter by exercise type: squat, pushup")
):
    if difficulty:
        from app.services.training_plan import TrainingDifficulty
        return plan_service.get_plans_by_difficulty(TrainingDifficulty(difficulty))
    if exercise:
        from app.services.training_plan import ExerciseType
        return plan_service.get_plans_by_exercise(ExerciseType(exercise))
    return plan_service.get_all_plans()


@router.get("/plans/{plan_id}")
def get_training_plan(plan_id: str):
    plan = plan_service.get_plan_by_id(plan_id)
    if not plan:
        return JSONResponse(status_code=404, content={"error": "Plan not found"})
    return plan


@router.post("/plans/{plan_id}/start")
def start_training_plan(plan_id: str):
    session = plan_service.start_plan(plan_id)
    if not session:
        return JSONResponse(status_code=404, content={"error": "Plan not found"})
    return session


@router.get("/plans/session/active")
def get_active_session():
    session = plan_service.get_active_session()
    if not session:
        return {"active": False}
    return {"active": True, "session": plan_service.get_session_summary()}


@router.post("/plans/session/round/complete")
def complete_round(data: dict):
    reps = data.get("reps", 0)
    avg_score = data.get("avg_score", 0)
    return plan_service.complete_round(reps, avg_score)


@router.post("/plans/session/round/next")
def start_next_round():
    return plan_service.start_next_round()


@router.post("/plans/session/cancel")
def cancel_session():
    return plan_service.cancel_session()


@router.get("/report/progress")
def get_progress_report(
    days: int = Query(30, description="Number of days to include in report"),
    db: Session = Depends(get_db)
):
    report_service = ReportGeneratorService(db)
    return report_service.generate_progress_report(days)


@router.get("/report/progress/export")
def export_progress_report(
    days: int = Query(30, description="Number of days to include in report"),
    format: str = Query("json", description="Export format: json, csv, text"),
    db: Session = Depends(get_db)
):
    report_service = ReportGeneratorService(db)
    report_data = report_service.generate_progress_report(days)
    
    if format == "csv":
        content = report_service.export_to_csv(report_data)
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=training_report_{days}days.csv"}
        )
    elif format == "text":
        content = report_service.generate_text_report(report_data)
        return Response(
            content=content,
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename=training_report_{days}days.txt"}
        )
    else:
        content = report_service.export_to_json(report_data)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=training_report_{days}days.json"}
        )


@router.get("/report/session/{session_id}")
def get_session_report(session_id: int, db: Session = Depends(get_db)):
    report_service = ReportGeneratorService(db)
    summary = report_service.generate_training_summary(session_id)
    if not summary:
        return JSONResponse(status_code=404, content={"error": "Session not found"})
    return summary
