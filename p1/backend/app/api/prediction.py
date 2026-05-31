from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional

from app.models.sensor import TrendDataPoint
from app.services.tank_service import TankService, get_tank_service
from app.database.influxdb import InfluxDBManager, get_influx_db
from app.utils.level_prediction import level_predictor

router = APIRouter(prefix="/api/prediction", tags=["prediction"])


@router.get("/{tank_id}")
def get_level_prediction(
    tank_id: str,
    predict_minutes_ahead: float = Query(30.0, description="预测多少分钟后", ge=1, le=1440),
    data_points: int = Query(100, description="使用的历史数据点数", ge=10, le=500),
    tank_service: TankService = Depends(get_tank_service),
    influx_db: InfluxDBManager = Depends(get_influx_db)
):
    tank = tank_service.get_tank(tank_id)
    if not tank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tank with id {tank_id} not found"
        )
    
    try:
        level_data = influx_db.query_recent_levels(tank_id=tank_id, limit=data_points)
        level_data = list(reversed(level_data))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error querying data: {str(e)}"
        )
    
    prediction = level_predictor.predict(
        level_data=level_data,
        predict_minutes_ahead=predict_minutes_ahead,
        max_level=tank.max_height,
        min_threshold=tank.min_level,
        max_threshold=tank.max_level
    )
    
    return {
        "tank_id": tank_id,
        "tank_name": tank.name,
        "current_level": level_data[-1]["level"] if level_data else None,
        "predicted_level": prediction.predicted_level,
        "confidence": prediction.confidence,
        "trend": {
            "direction": prediction.trend_direction,
            "slope": prediction.trend_slope,
            "description": {
                "rising": "液位上升中",
                "falling": "液位下降中",
                "stable": "液位稳定"
            }.get(prediction.trend_direction, "未知")
        },
        "prediction_time": prediction.prediction_time,
        "predict_minutes_ahead": predict_minutes_ahead,
        "threshold_warning": {
            "time_to_threshold_minutes": prediction.time_to_threshold,
            "threshold_type": prediction.threshold_type,
            "message": 
                f"预计 {prediction.time_to_threshold:.1f} 分钟后到达高液位报警阈值" 
                if prediction.threshold_type == "high" else
                f"预计 {prediction.time_to_threshold:.1f} 分钟后到达低液位报警阈值"
                if prediction.threshold_type == "low" else
                None
        } if prediction.threshold_type else None
    }


@router.get("/{tank_id}/series")
def get_prediction_series(
    tank_id: str,
    points: int = Query(12, description="预测点数量", ge=5, le=48),
    interval_minutes: float = Query(5.0, description="预测间隔(分钟)", ge=1, le=60),
    data_points: int = Query(100, description="使用的历史数据点数", ge=10, le=500),
    tank_service: TankService = Depends(get_tank_service),
    influx_db: InfluxDBManager = Depends(get_influx_db)
):
    tank = tank_service.get_tank(tank_id)
    if not tank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tank with id {tank_id} not found"
        )
    
    try:
        level_data = influx_db.query_recent_levels(tank_id=tank_id, limit=data_points)
        level_data = list(reversed(level_data))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error querying data: {str(e)}"
        )
    
    predictions = level_predictor.predict_multiple_points(
        level_data=level_data,
        points=points,
        interval_minutes=interval_minutes,
        max_level=tank.max_height
    )
    
    trend_data = [
        TrendDataPoint(
            time=point["time"],
            level=point["level"]
        )
        for point in level_data[-50:]
    ]
    
    prediction_points = [
        TrendDataPoint(
            time=point["time"],
            level=point["level"]
        )
        for point in predictions
    ]
    
    return {
        "tank_id": tank_id,
        "historical_data": trend_data,
        "predictions": prediction_points,
        "interval_minutes": interval_minutes,
        "total_points": len(predictions)
    }
