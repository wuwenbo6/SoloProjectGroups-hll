from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional

from app.models.sensor import TrendResponse, TrendDataPoint
from app.services.tank_service import TankService, get_tank_service
from app.database.influxdb import InfluxDBManager, get_influx_db

router = APIRouter(prefix="/api/trends", tags=["trends"])


@router.get("/{tank_id}", response_model=TrendResponse)
def get_trend_data(
    tank_id: str,
    start_time: str = Query("-24h", description="开始时间，如: -24h, -7d, 2024-01-01T00:00:00Z"),
    end_time: str = Query("now()", description="结束时间"),
    aggregate: str = Query("5m", description="聚合间隔，如: 1m, 5m, 1h"),
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
        data = influx_db.query_level_history(
            tank_id=tank_id,
            start_time=start_time,
            end_time=end_time,
            aggregate=aggregate
        )
        
        trend_points = [
            TrendDataPoint(
                time=point["time"],
                level=point["level"],
                temperature=point.get("temperature")
            )
            for point in data
        ]
        
        return TrendResponse(
            tank_id=tank_id,
            data=trend_points,
            start_time=start_time,
            end_time=end_time
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error querying trend data: {str(e)}"
        )


@router.get("/{tank_id}/recent")
def get_recent_data(
    tank_id: str,
    limit: int = Query(100, description="返回数据点数", ge=1, le=1000),
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
        data = influx_db.query_recent_levels(tank_id=tank_id, limit=limit)
        return {
            "tank_id": tank_id,
            "data": data,
            "count": len(data)
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error querying recent data: {str(e)}"
        )
