from sqlalchemy.orm import Session
from datetime import datetime
import json
import csv
import io

from .models import DetectionRecord, DefectLocation, LabelingQueue, TrainingSession


def create_detection_record(
    db: Session,
    image_name: str,
    image_path: str,
    detected_class: str,
    confidence: float,
    result_json: dict,
    heatmap_path: str = None
):
    db_record = DetectionRecord(
        image_name=image_name,
        image_path=image_path,
        detected_class=detected_class,
        confidence=confidence,
        heatmap_path=heatmap_path,
        result_json=json.dumps(result_json)
    )
    db.add(db_record)
    db.flush()
    
    defects = result_json.get('defects', [])
    for defect in defects:
        db_defect = DefectLocation(
            detection_record_id=db_record.id,
            defect_class=defect.get('class', ''),
            severity=defect.get('severity', 'medium'),
            x=defect.get('x', 0),
            y=defect.get('y', 0),
            width=defect.get('width', 0),
            height=defect.get('height', 0),
            area=defect.get('area', 0)
        )
        db.add(db_defect)
    
    db.commit()
    db.refresh(db_record)
    return db_record


def get_detection_records(db: Session, skip: int = 0, limit: int = 100):
    records = db.query(DetectionRecord).order_by(DetectionRecord.created_at.desc()).offset(skip).limit(limit).all()
    
    results = []
    for record in records:
        record_dict = _record_to_dict(record)
        results.append(record_dict)
    
    return results


def get_detection_record(db: Session, record_id: int):
    record = db.query(DetectionRecord).filter(DetectionRecord.id == record_id).first()
    return _record_to_dict(record) if record else None


def _record_to_dict(record):
    if not record:
        return None
    
    record_dict = {
        'id': record.id,
        'image_name': record.image_name,
        'image_path': record.image_path,
        'detected_class': record.detected_class,
        'confidence': record.confidence,
        'created_at': record.created_at.isoformat(),
        'heatmap_path': record.heatmap_path,
        'is_labeled': record.is_labeled,
        'true_class': record.true_class,
        'defects': []
    }
    
    for defect in record.defects:
        record_dict['defects'].append({
            'id': defect.id,
            'defect_class': defect.defect_class,
            'severity': defect.severity,
            'x': defect.x,
            'y': defect.y,
            'width': defect.width,
            'height': defect.height,
            'area': defect.area
        })
    
    return record_dict


def label_detection_record(db: Session, record_id: int, true_class: str):
    record = db.query(DetectionRecord).filter(DetectionRecord.id == record_id).first()
    if record:
        record.is_labeled = True
        record.true_class = true_class
        db.commit()
        db.refresh(record)
        return _record_to_dict(record)
    return None


def get_statistics(db: Session):
    total_records = db.query(DetectionRecord).count()
    normal_count = db.query(DetectionRecord).filter(DetectionRecord.detected_class == 'normal').count()
    scratch_count = db.query(DetectionRecord).filter(DetectionRecord.detected_class == 'scratch').count()
    dent_count = db.query(DetectionRecord).filter(DetectionRecord.detected_class == 'dent').count()
    unknown_count = db.query(DetectionRecord).filter(DetectionRecord.detected_class == 'unknown').count()
    labeled_count = db.query(DetectionRecord).filter(DetectionRecord.is_labeled == True).count()
    
    defect_count = scratch_count + dent_count
    
    severity_stats = {
        'light': db.query(DefectLocation).filter(DefectLocation.severity == 'light').count(),
        'medium': db.query(DefectLocation).filter(DefectLocation.severity == 'medium').count(),
        'heavy': db.query(DefectLocation).filter(DefectLocation.severity == 'heavy').count()
    }
    
    return {
        'total': total_records,
        'normal': normal_count,
        'scratch': scratch_count,
        'dent': dent_count,
        'unknown': unknown_count,
        'labeled': labeled_count,
        'severity': severity_stats,
        'defect_rate': (defect_count / total_records * 100) if total_records > 0 else 0
    }


def delete_detection_record(db: Session, record_id: int):
    record = db.query(DetectionRecord).filter(DetectionRecord.id == record_id).first()
    if record:
        db.delete(record)
        db.commit()
        return True
    return False


def add_to_labeling_queue(
    db: Session,
    image_name: str,
    image_path: str,
    predicted_class: str,
    confidence: float,
    heatmap_path: str = None
):
    priority = 1.0 - confidence
    
    item = LabelingQueue(
        image_name=image_name,
        image_path=image_path,
        predicted_class=predicted_class,
        confidence=confidence,
        heatmap_path=heatmap_path,
        priority=priority
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_labeling_queue(db: Session, skip: int = 0, limit: int = 100, only_unlabeled: bool = True):
    query = db.query(LabelingQueue)
    if only_unlabeled:
        query = query.filter(LabelingQueue.is_labeled == False)
    items = query.order_by(LabelingQueue.priority.desc(), LabelingQueue.added_at.desc()).offset(skip).limit(limit).all()
    
    results = []
    for item in items:
        results.append({
            'id': item.id,
            'image_name': item.image_name,
            'image_path': item.image_path,
            'predicted_class': item.predicted_class,
            'confidence': item.confidence,
            'is_labeled': item.is_labeled,
            'true_class': item.true_class,
            'true_severity': item.true_severity,
            'added_at': item.added_at.isoformat(),
            'labeled_at': item.labeled_at.isoformat() if item.labeled_at else None,
            'priority': item.priority,
            'heatmap_path': item.heatmap_path
        })
    return results


def label_queue_item(db: Session, item_id: int, true_class: str, true_severity: str = 'medium'):
    item = db.query(LabelingQueue).filter(LabelingQueue.id == item_id).first()
    if item:
        item.is_labeled = True
        item.true_class = true_class
        item.true_severity = true_severity
        item.labeled_at = datetime.utcnow()
        db.commit()
        db.refresh(item)
        
        target_dir = f"data/train/{true_class}"
        import os
        os.makedirs(target_dir, exist_ok=True)
        
        import shutil
        if os.path.exists(item.image_path):
            target_path = os.path.join(target_dir, item.image_name)
            if not os.path.exists(target_path):
                shutil.copy(item.image_path, target_path)
        
        return True
    return False


def get_labeled_data(db: Session):
    items = db.query(LabelingQueue).filter(LabelingQueue.is_labeled == True).all()
    return [{
        'image_path': item.image_path,
        'true_class': item.true_class,
        'true_severity': item.true_severity
    } for item in items if item.true_class]


def create_training_session(db: Session, session_name: str, model_path: str):
    session = TrainingSession(
        session_name=session_name,
        model_path=model_path
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def update_training_session(db: Session, session_id: int, **kwargs):
    session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
    if session:
        for key, value in kwargs.items():
            setattr(session, key, value)
        db.commit()
        db.refresh(session)
    return session


def export_to_csv(db: Session, output_path: str = None):
    records = get_detection_records(db, limit=10000)
    
    if output_path is None:
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(['ID', '图像名称', '检测类别', '真实类别', '置信度', '检测时间', '缺陷数量', '严重程度'])
        
        for record in records:
            severities = [d['severity'] for d in record['defects']]
            max_severity = max(severities) if severities else 'none'
            writer.writerow([
                record['id'],
                record['image_name'],
                record['detected_class'],
                record['true_class'] or '未标注',
                f"{record['confidence']:.2%}",
                record['created_at'],
                len(record['defects']),
                max_severity
            ])
        
        return output.getvalue()
    else:
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            
            writer.writerow(['ID', '图像名称', '检测类别', '真实类别', '置信度', '检测时间', '缺陷数量', '严重程度'])
            
            for record in records:
                severities = [d['severity'] for d in record['defects']]
                max_severity = max(severities) if severities else 'none'
                writer.writerow([
                    record['id'],
                    record['image_name'],
                    record['detected_class'],
                    record['true_class'] or '未标注',
                    f"{record['confidence']:.2%}",
                    record['created_at'],
                    len(record['defects']),
                    max_severity
                ])
        return output_path


def export_defects_csv(db: Session, output_path: str = None):
    records = get_detection_records(db, limit=10000)
    
    if output_path is None:
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(['记录ID', '缺陷ID', '缺陷类别', '严重程度', 'X坐标', 'Y坐标', '宽度', '高度', '面积'])
        
        for record in records:
            for defect in record['defects']:
                writer.writerow([
                    record['id'],
                    defect['id'],
                    defect['defect_class'],
                    defect['severity'],
                    defect['x'],
                    defect['y'],
                    defect['width'],
                    defect['height'],
                    defect['area']
                ])
        
        return output.getvalue()
    else:
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            
            writer.writerow(['记录ID', '缺陷ID', '缺陷类别', '严重程度', 'X坐标', 'Y坐标', '宽度', '高度', '面积'])
            
            for record in records:
                for defect in record['defects']:
                    writer.writerow([
                        record['id'],
                        defect['id'],
                        defect['defect_class'],
                        defect['severity'],
                        defect['x'],
                        defect['y'],
                        defect['width'],
                        defect['height'],
                        defect['area']
                    ])
        return output_path


def generate_report(db: Session):
    stats = get_statistics(db)
    
    recent_records = get_detection_records(db, limit=10)
    
    report = {
        'summary': {
            'total_detections': stats['total'],
            'normal_count': stats['normal'],
            'scratch_count': stats['scratch'],
            'dent_count': stats['dent'],
            'unknown_count': stats['unknown'],
            'defect_rate': stats['defect_rate'],
            'labeled_count': stats['labeled']
        },
        'severity_breakdown': stats['severity'],
        'recent_detections': recent_records[:10],
        'generated_at': datetime.utcnow().isoformat()
    }
    
    return report
