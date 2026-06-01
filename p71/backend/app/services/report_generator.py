import json
import csv
from io import StringIO
from datetime import datetime
from typing import List, Dict, Optional
from sqlalchemy.orm import Session

from app.models.database import TrainingSession, ActionRecord


class ReportGeneratorService:
    def __init__(self, db: Session):
        self.db = db
    
    def generate_training_summary(self, session_id: int) -> Optional[Dict]:
        session = self.db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
        if not session:
            return None
        
        actions = []
        for action in session.actions:
            actions.append({
                "name": action.action_name,
                "count": action.count,
                "avg_confidence": round(action.avg_confidence, 2)
            })
        
        duration = session.duration or 0
        return {
            "session_id": session.id,
            "start_time": session.start_time.isoformat() if session.start_time else None,
            "end_time": session.end_time.isoformat() if session.end_time else None,
            "duration_minutes": round(duration / 60, 2),
            "duration_seconds": int(duration),
            "total_calories": round(session.total_calories, 2),
            "actions": actions,
            "total_actions": sum(a["count"] for a in actions),
            "calories_per_minute": round(session.total_calories / (duration / 60), 2) if duration > 0 else 0
        }
    
    def generate_progress_report(self, days: int = 30) -> Dict:
        from sqlalchemy import func
        cutoff = datetime.fromtimestamp(datetime.now().timestamp() - days * 86400)
        
        sessions = self.db.query(TrainingSession).filter(
            TrainingSession.start_time >= cutoff
        ).order_by(TrainingSession.start_time).all()
        
        daily_stats = {}
        for session in sessions:
            date_key = session.start_time.strftime("%Y-%m-%d")
            if date_key not in daily_stats:
                daily_stats[date_key] = {
                    "sessions": 0,
                    "calories": 0,
                    "duration": 0,
                    "actions": {}
                }
            
            daily_stats[date_key]["sessions"] += 1
            daily_stats[date_key]["calories"] += session.total_calories
            daily_stats[date_key]["duration"] += session.duration or 0
            
            for action in session.actions:
                if action.action_name not in daily_stats[date_key]["actions"]:
                    daily_stats[date_key]["actions"][action.action_name] = 0
                daily_stats[date_key]["actions"][action.action_name] += action.count
        
        total_sessions = len(sessions)
        total_calories = sum(s.total_calories for s in sessions)
        total_duration = sum(s.duration or 0 for s in sessions)
        
        action_totals = {}
        for session in sessions:
            for action in session.actions:
                if action.action_name not in action_totals:
                    action_totals[action.action_name] = 0
                action_totals[action.action_name] += action.count
        
        streak_days = self._calculate_streak(sessions)
        
        return {
            "period_days": days,
            "summary": {
                "total_sessions": total_sessions,
                "total_calories": round(total_calories, 2),
                "total_duration_minutes": round(total_duration / 60, 2),
                "current_streak_days": streak_days,
                "avg_calories_per_session": round(total_calories / total_sessions, 2) if total_sessions > 0 else 0,
                "avg_duration_minutes": round(total_duration / 60 / total_sessions, 2) if total_sessions > 0 else 0
            },
            "action_totals": action_totals,
            "daily_stats": daily_stats,
            "sessions_count": total_sessions
        }
    
    def _calculate_streak(self, sessions: List[TrainingSession]) -> int:
        if not sessions:
            return 0
        
        session_dates = set()
        for s in sessions:
            session_dates.add(s.start_time.strftime("%Y-%m-%d"))
        
        streak = 0
        current_date = datetime.now()
        
        for _ in range(365):
            date_str = current_date.strftime("%Y-%m-%d")
            if date_str in session_dates:
                streak += 1
                from datetime import timedelta
                current_date -= timedelta(days=1)
            else:
                if streak > 0:
                    break
                from datetime import timedelta
                current_date -= timedelta(days=1)
        
        return streak
    
    def export_to_json(self, report_data: Dict) -> str:
        return json.dumps(report_data, indent=2, ensure_ascii=False)
    
    def export_to_csv(self, report_data: Dict) -> str:
        output = StringIO()
        writer = csv.writer(output)
        
        writer.writerow(["训练进度报告"])
        writer.writerow([f"统计周期: 最近 {report_data['period_days']} 天"])
        writer.writerow([])
        
        writer.writerow(["汇总统计"])
        summary = report_data["summary"]
        writer.writerow(["总训练次数", summary["total_sessions"]])
        writer.writerow(["总消耗热量(kcal)", summary["total_calories"]])
        writer.writerow(["总训练时长(分钟)", summary["total_duration_minutes"]])
        writer.writerow(["当前连续训练天数", summary["current_streak_days"]])
        writer.writerow(["平均每次热量", summary["avg_calories_per_session"]])
        writer.writerow(["平均每次时长", summary["avg_duration_minutes"]])
        writer.writerow([])
        
        writer.writerow(["动作统计"])
        writer.writerow(["动作类型", "总次数"])
        for action_name, count in report_data["action_totals"].items():
            writer.writerow([action_name, count])
        
        return output.getvalue()
    
    def generate_text_report(self, report_data: Dict) -> str:
        summary = report_data["summary"]
        
        report = []
        report.append("=" * 50)
        report.append("          AI 动作识别训练进度报告")
        report.append("=" * 50)
        report.append("")
        report.append(f"📅 统计周期：最近 {report_data['period_days']} 天")
        report.append(f"📊 生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report.append("")
        report.append("-" * 50)
        report.append("📈 训练汇总")
        report.append("-" * 50)
        report.append(f"  总训练次数：{summary['total_sessions']} 次")
        report.append(f"  总消耗热量：{summary['total_calories']} kcal")
        report.append(f"  总训练时长：{summary['total_duration_minutes']} 分钟")
        report.append(f"  🔥 连续训练：{summary['current_streak_days']} 天")
        report.append("")
        report.append(f"  平均每次热量：{summary['avg_calories_per_session']} kcal")
        report.append(f"  平均每次时长：{summary['avg_duration_minutes']} 分钟")
        report.append("")
        report.append("-" * 50)
        report.append("💪 动作统计")
        report.append("-" * 50)
        
        action_names = {
            "squat": "深蹲",
            "pushup": "俯卧撑",
            "stand": "站立"
        }
        
        for action, count in report_data["action_totals"].items():
            name = action_names.get(action, action)
            report.append(f"  {name}：{count} 次")
        
        if not report_data["action_totals"]:
            report.append("  暂无训练记录")
        
        report.append("")
        report.append("=" * 50)
        report.append("         继续加油，坚持就是胜利！💪")
        report.append("=" * 50)
        
        return "\n".join(report)
