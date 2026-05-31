from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from .database import SessionLocal
from .models import MedicationPlan, MedicationRecord, User
from .wechat import wechat_notifier
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

def create_daily_medication_records():
    db = SessionLocal()
    try:
        today = datetime.now().date()
        weekday = str(today.weekday())
        
        plans = db.query(MedicationPlan).filter(
            MedicationPlan.is_active == True
        ).all()
        
        for plan in plans:
            days = plan.days_of_week.split(',')
            if weekday not in days:
                continue
                
            scheduled_dt = datetime.combine(today, plan.take_time)
            
            existing = db.query(MedicationRecord).filter(
                MedicationRecord.plan_id == plan.id,
                MedicationRecord.scheduled_time == scheduled_dt
            ).first()
            
            if not existing:
                record = MedicationRecord(
                    user_id=plan.user_id,
                    plan_id=plan.id,
                    pillbox_id=plan.pillbox_id,
                    scheduled_time=scheduled_dt,
                    is_taken=False
                )
                db.add(record)
                logger.info(f"Created medication record for plan {plan.id} at {scheduled_dt}")
        
        db.commit()
    except Exception as e:
        logger.error(f"Error creating daily records: {e}")
        db.rollback()
    finally:
        db.close()

def check_medication_reminders():
    db = SessionLocal()
    try:
        now = datetime.now()
        reminder_window = now + timedelta(minutes=5)
        
        records = db.query(MedicationRecord).filter(
            MedicationRecord.is_taken == False,
            MedicationRecord.is_notified == False,
            MedicationRecord.scheduled_time <= reminder_window,
            MedicationRecord.scheduled_time >= now
        ).all()
        
        for record in records:
            user = db.query(User).filter(User.id == record.user_id).first()
            plan = record.medication_plan
            
            if user and user.wechat_openid:
                wechat_notifier.send_reminder(
                    openid=user.wechat_openid,
                    user_name=user.name,
                    medicine_name=plan.medicine_name,
                    take_time=record.scheduled_time.strftime("%H:%M")
                )
                
            record.is_notified = True
            logger.info(f"Sent reminder for record {record.id}")
            
        db.commit()
    except Exception as e:
        logger.error(f"Error checking reminders: {e}")
    finally:
        db.close()

def check_missed_medications():
    db = SessionLocal()
    try:
        now = datetime.now()
        missed_threshold = now - timedelta(minutes=30)
        
        records = db.query(MedicationRecord).filter(
            MedicationRecord.is_taken == False,
            MedicationRecord.scheduled_time <= missed_threshold,
            MedicationRecord.scheduled_time >= now - timedelta(hours=1)
        ).all()
        
        for record in records:
            user = db.query(User).filter(User.id == record.user_id).first()
            plan = record.medication_plan
            
            if user and user.wechat_openid:
                wechat_notifier.send_missed_reminder(
                    openid=user.wechat_openid,
                    user_name=user.name,
                    medicine_name=plan.medicine_name,
                    take_time=record.scheduled_time.strftime("%H:%M")
                )
                
            logger.info(f"Missed medication: record {record.id}")
            
    except Exception as e:
        logger.error(f"Error checking missed medications: {e}")
    finally:
        db.close()

def init_scheduler():
    scheduler.add_job(
        create_daily_medication_records,
        CronTrigger(hour=0, minute=1),
        id="create_daily_records"
    )
    
    scheduler.add_job(
        check_medication_reminders,
        'interval',
        minutes=1,
        id="check_reminders"
    )
    
    scheduler.add_job(
        check_missed_medications,
        'interval',
        minutes=5,
        id="check_missed"
    )
    
    scheduler.start()
    logger.info("Scheduler started")
    
def shutdown_scheduler():
    scheduler.shutdown()
    logger.info("Scheduler shutdown")
