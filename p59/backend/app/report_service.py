import io
import csv
from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from .models import MedicationRecord, User, MedicationPlan
import logging

logger = logging.getLogger(__name__)

class ReportGenerator:
    def __init__(self, db: Session):
        self.db = db
    
    def generate_csv_report(self, user_id: Optional[int] = None, 
                           start_date: datetime = None, 
                           end_date: datetime = None) -> bytes:
        query = self.db.query(MedicationRecord)
        
        if user_id:
            query = query.filter(MedicationRecord.user_id == user_id)
        if start_date:
            query = query.filter(MedicationRecord.scheduled_time >= start_date)
        if end_date:
            query = query.filter(MedicationRecord.scheduled_time <= end_date)
        
        records = query.order_by(MedicationRecord.scheduled_time).all()
        
        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_ALL)
        
        writer.writerow([
            '记录ID', '用户ID', '用户姓名', '药品名称', '计划服药时间',
            '实际服药时间', '是否服药', '服药片数', '是否通知', '是否播放语音'
        ])
        
        for record in records:
            user = self.db.query(User).filter(User.id == record.user_id).first()
            plan = self.db.query(MedicationPlan).filter(MedicationPlan.id == record.plan_id).first()
            
            writer.writerow([
                record.id,
                record.user_id,
                user.name if user else '-',
                plan.medicine_name if plan else '-',
                record.scheduled_time.strftime('%Y-%m-%d %H:%M:%S') if record.scheduled_time else '-',
                record.actual_time.strftime('%Y-%m-%d %H:%M:%S') if record.actual_time else '-',
                '是' if record.is_taken else '否',
                record.pills_taken,
                '是' if record.is_notified else '否',
                '是' if record.tts_played else '否'
            ])
        
        return output.getvalue().encode('utf-8-sig')
    
    def generate_summary(self, user_id: Optional[int] = None,
                        start_date: datetime = None,
                        end_date: datetime = None) -> dict:
        query = self.db.query(MedicationRecord)
        
        if user_id:
            query = query.filter(MedicationRecord.user_id == user_id)
        if start_date:
            query = query.filter(MedicationRecord.scheduled_time >= start_date)
        if end_date:
            query = query.filter(MedicationRecord.scheduled_time <= end_date)
        
        records = query.all()
        
        total = len(records)
        taken = sum(1 for r in records if r.is_taken)
        missed = total - taken
        adherence_rate = (taken / total * 100) if total > 0 else 0
        
        return {
            'total_records': total,
            'taken_count': taken,
            'missed_count': missed,
            'adherence_rate': round(adherence_rate, 2),
            'start_date': start_date,
            'end_date': end_date,
            'period_days': (end_date - start_date).days if start_date and end_date else None
        }
    
    def generate_daily_report(self, user_id: int, date: datetime) -> dict:
        start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = date.replace(hour=23, minute=59, second=59)
        
        records = self.db.query(MedicationRecord).filter(
            MedicationRecord.user_id == user_id,
            MedicationRecord.scheduled_time >= start_of_day,
            MedicationRecord.scheduled_time <= end_of_day
        ).order_by(MedicationRecord.scheduled_time).all()
        
        return {
            'date': date.date(),
            'records': records,
            'total': len(records),
            'taken': sum(1 for r in records if r.is_taken)
        }
