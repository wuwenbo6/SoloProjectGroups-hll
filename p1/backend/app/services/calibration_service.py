from typing import List, Optional, Dict, Any
from datetime import datetime
import numpy as np

from app.models.calibration import (
    Calibration, CalibrationPoint, CalibrationCreate,
    CalibrationPointCreate, CalibrationResult, CalibrationStatus
)
from app.models.tank import Tank
from app.database.sqlite_db import TankDatabase, get_tank_db


class CalibrationService:
    def __init__(self, db: TankDatabase):
        self.db = db

    def _to_calibration_model(self, data: dict) -> Calibration:
        points = [
            CalibrationPoint(
                id=p['id'],
                tank_id=p['tank_id'],
                measured_level=p['measured_level'],
                actual_level=p['actual_level'],
                temperature=p.get('temperature', 25.0),
                error=p['error'],
                note=p.get('note'),
                created_at=p['created_at']
            )
            for p in data.get('points', [])
        ]
        
        result = None
        if data.get('result_offset') is not None:
            result = CalibrationResult(
                offset=data['result_offset'],
                scale_factor=data['result_scale'],
                r_squared=data['result_r_squared'],
                mean_error=data['result_mean_error'],
                max_error=data['result_max_error'],
                point_count=len(points)
            )
        
        return Calibration(
            id=data['id'],
            tank_id=data['tank_id'],
            name=data['name'],
            description=data.get('description'),
            status=CalibrationStatus(data.get('status', 'pending')),
            points=points,
            result=result,
            created_at=data['created_at'],
            completed_at=data.get('completed_at')
        )

    def create_calibration(self, calib_create: CalibrationCreate) -> Calibration:
        data = self.db.create_calibration(calib_create.model_dump())
        return self._to_calibration_model(data)

    def get_calibration(self, calib_id: str) -> Optional[Calibration]:
        data = self.db.get_calibration(calib_id)
        return self._to_calibration_model(data) if data else None

    def get_calibrations_by_tank(self, tank_id: str) -> List[Calibration]:
        data_list = self.db.get_calibrations_by_tank(tank_id)
        return [self._to_calibration_model(d) for d in data_list]

    def add_point(self, calib_id: str, point_create: CalibrationPointCreate) -> Optional[Calibration]:
        calib = self.get_calibration(calib_id)
        if not calib or calib.status != CalibrationStatus.PENDING:
            return None
        
        point_data = point_create.model_dump()
        point_data['tank_id'] = calib.tank_id
        self.db.add_calibration_point(calib_id, point_data)
        
        return self.get_calibration(calib_id)

    def calculate_calibration(self, points: List[CalibrationPoint]) -> Optional[CalibrationResult]:
        if len(points) < 2:
            return None
        
        measured = np.array([p.measured_level for p in points])
        actual = np.array([p.actual_level for p in points])
        errors = np.array([p.error for p in points])
        
        n = len(points)
        sum_x = np.sum(measured)
        sum_y = np.sum(actual)
        sum_xy = np.sum(measured * actual)
        sum_x2 = np.sum(measured ** 2)
        
        denominator = n * sum_x2 - sum_x ** 2
        if denominator == 0:
            return None
        
        slope = (n * sum_xy - sum_x * sum_y) / denominator
        intercept = (sum_y - slope * sum_x) / n
        
        y_pred = intercept + slope * measured
        ss_total = np.sum((actual - np.mean(actual)) ** 2)
        ss_residual = np.sum((actual - y_pred) ** 2)
        r_squared = 1 - (ss_residual / ss_total) if ss_total != 0 else 0.0
        
        mean_error = np.mean(np.abs(errors))
        max_error = np.max(np.abs(errors))
        
        return CalibrationResult(
            offset=round(intercept, 6),
            scale_factor=round(slope, 6),
            r_squared=round(r_squared, 4),
            mean_error=round(mean_error, 4),
            max_error=round(max_error, 4),
            point_count=n
        )

    def complete_calibration(self, calib_id: str) -> Optional[Calibration]:
        calib = self.get_calibration(calib_id)
        if not calib or calib.status != CalibrationStatus.PENDING:
            return None
        
        if len(calib.points) < 2:
            return None
        
        result = self.calculate_calibration(calib.points)
        if not result:
            return None
        
        self.db.complete_calibration(calib_id, result.model_dump())
        
        return self.get_calibration(calib_id)

    def apply_calibration(self, calib_id: str) -> Optional[Tank]:
        calib = self.get_calibration(calib_id)
        if not calib or calib.status != CalibrationStatus.COMPLETED or not calib.result:
            return None
        
        success = self.db.apply_calibration_to_tank(
            calib.tank_id,
            calib.result.offset,
            calib.result.scale_factor
        )
        
        if not success:
            return None
        
        from app.services.tank_service import get_tank_service
        return get_tank_service().get_tank(calib.tank_id)

    def delete_calibration(self, calib_id: str) -> bool:
        return self.db.delete_calibration(calib_id)

    @staticmethod
    def apply_calibration_to_level(level: float, offset: float, scale: float) -> float:
        return offset + scale * level


_calibration_service_instance: Optional[CalibrationService] = None


def get_calibration_service() -> CalibrationService:
    global _calibration_service_instance
    if _calibration_service_instance is None:
        _calibration_service_instance = CalibrationService(get_tank_db())
    return _calibration_service_instance
