from typing import List, Dict, Optional
from datetime import datetime
from enum import Enum


class ExerciseType(str, Enum):
    SQUAT = "squat"
    PUSHUP = "pushup"


class TrainingDifficulty(str, Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class TrainingPlanService:
    def __init__(self):
        self.plans = self._create_default_plans()
        self.active_session = None
    
    def _create_default_plans(self) -> List[Dict]:
        return [
            {
                "id": "beginner_squat",
                "name": "入门深蹲训练",
                "description": "适合初学者的深蹲基础训练，建立正确动作模式",
                "difficulty": TrainingDifficulty.BEGINNER,
                "exercise": ExerciseType.SQUAT,
                "rounds": 3,
                "reps_per_round": 10,
                "rest_seconds": 60,
                "calories_estimate": 45
            },
            {
                "id": "beginner_pushup",
                "name": "入门俯卧撑训练",
                "description": "适合初学者的俯卧撑基础训练",
                "difficulty": TrainingDifficulty.BEGINNER,
                "exercise": ExerciseType.PUSHUP,
                "rounds": 3,
                "reps_per_round": 8,
                "rest_seconds": 60,
                "calories_estimate": 50
            },
            {
                "id": "intermediate_squat",
                "name": "进阶深蹲训练",
                "description": "提升腿部力量的进阶训练计划",
                "difficulty": TrainingDifficulty.INTERMEDIATE,
                "exercise": ExerciseType.SQUAT,
                "rounds": 4,
                "reps_per_round": 15,
                "rest_seconds": 45,
                "calories_estimate": 90
            },
            {
                "id": "intermediate_pushup",
                "name": "进阶俯卧撑训练",
                "description": "增强上肢力量的进阶训练",
                "difficulty": TrainingDifficulty.INTERMEDIATE,
                "exercise": ExerciseType.PUSHUP,
                "rounds": 4,
                "reps_per_round": 12,
                "rest_seconds": 45,
                "calories_estimate": 100
            },
            {
                "id": "advanced_squat",
                "name": "高强度深蹲训练",
                "description": "挑战极限的高强度深蹲训练",
                "difficulty": TrainingDifficulty.ADVANCED,
                "exercise": ExerciseType.SQUAT,
                "rounds": 5,
                "reps_per_round": 20,
                "rest_seconds": 30,
                "calories_estimate": 150
            },
            {
                "id": "advanced_pushup",
                "name": "高强度俯卧撑训练",
                "description": "专业级俯卧撑训练，打造完美胸肌",
                "difficulty": TrainingDifficulty.ADVANCED,
                "exercise": ExerciseType.PUSHUP,
                "rounds": 5,
                "reps_per_round": 18,
                "rest_seconds": 30,
                "calories_estimate": 170
            },
            {
                "id": "hybrid_burner",
                "name": "综合燃脂训练",
                "description": "深蹲+俯卧撑组合，高效燃脂",
                "difficulty": TrainingDifficulty.INTERMEDIATE,
                "exercise": "hybrid",
                "rounds": 4,
                "exercises_per_round": [
                    {"type": "squat", "reps": 12},
                    {"type": "pushup", "reps": 10}
                ],
                "rest_seconds": 30,
                "calories_estimate": 120
            }
        ]
    
    def get_all_plans(self) -> List[Dict]:
        return self.plans
    
    def get_plan_by_id(self, plan_id: str) -> Optional[Dict]:
        for plan in self.plans:
            if plan["id"] == plan_id:
                return plan
        return None
    
    def get_plans_by_difficulty(self, difficulty: TrainingDifficulty) -> List[Dict]:
        return [p for p in self.plans if p["difficulty"] == difficulty]
    
    def get_plans_by_exercise(self, exercise: ExerciseType) -> List[Dict]:
        return [p for p in self.plans if p["exercise"] == exercise or p["exercise"] == "hybrid"]
    
    def start_plan(self, plan_id: str) -> Optional[Dict]:
        plan = self.get_plan_by_id(plan_id)
        if not plan:
            return None
        
        self.active_session = {
            "plan_id": plan_id,
            "plan_name": plan["name"],
            "start_time": datetime.now().isoformat(),
            "current_round": 0,
            "current_exercise_index": 0,
            "rounds_completed": 0,
            "total_reps_completed": 0,
            "scores": [],
            "is_resting": False,
            "rest_start_time": None,
            "status": "in_progress"
        }
        
        return self.active_session
    
    def get_active_session(self) -> Optional[Dict]:
        return self.active_session
    
    def complete_round(self, reps: int, avg_score: float = 0) -> Dict:
        if not self.active_session:
            return {"error": "No active session"}
        
        plan = self.get_plan_by_id(self.active_session["plan_id"])
        if not plan:
            return {"error": "Plan not found"}
        
        self.active_session["rounds_completed"] += 1
        self.active_session["total_reps_completed"] += reps
        self.active_session["scores"].append({
            "round": self.active_session["rounds_completed"],
            "reps": reps,
            "avg_score": avg_score
        })
        
        if self.active_session["rounds_completed"] >= plan["rounds"]:
            self.active_session["status"] = "completed"
            self.active_session["end_time"] = datetime.now().isoformat()
        else:
            self.active_session["is_resting"] = True
            self.active_session["rest_start_time"] = datetime.now().isoformat()
        
        return self.active_session
    
    def start_next_round(self) -> Dict:
        if not self.active_session:
            return {"error": "No active session"}
        
        self.active_session["is_resting"] = False
        self.active_session["rest_start_time"] = None
        self.active_session["current_round"] += 1
        
        return self.active_session
    
    def cancel_session(self) -> Dict:
        if not self.active_session:
            return {"error": "No active session"}
        
        self.active_session["status"] = "cancelled"
        self.active_session["end_time"] = datetime.now().isoformat()
        session = self.active_session
        self.active_session = None
        
        return session
    
    def get_session_summary(self) -> Optional[Dict]:
        if not self.active_session:
            return None
        
        plan = self.get_plan_by_id(self.active_session["plan_id"])
        if not plan:
            return None
        
        scores = self.active_session["scores"]
        avg_score = sum(s["avg_score"] for s in scores) / len(scores) if scores else 0
        
        return {
            **self.active_session,
            "plan": plan,
            "avg_score": avg_score,
            "progress": self.active_session["rounds_completed"] / plan["rounds"] * 100
        }
