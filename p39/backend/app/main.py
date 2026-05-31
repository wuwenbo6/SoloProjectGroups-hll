from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
import json
import asyncio
from .config import settings
from .database import get_db, init_db, ProbeData, PassengerCount, ZoneConfig
from .models import (
    ProbeDataModel, PassengerCountResponse,
    HeatmapResponse, HeatmapPoint, TrendResponse, TrendDataPoint,
    ZoneConfigModel, ForecastMetadata,
    SeatOccupancyResponse, TrainScheduleModel,
    TrainForecastResponse, WaitingTimeResponse
)
from .seat_estimator import global_seat_estimator
from .train_schedule import global_train_manager, TrainStatus
from .report_exporter import ReportExporter
from fastapi.responses import StreamingResponse
from .estimator import global_estimator
from .predictor import global_predictor
from .kafka_consumer import ProbeDataConsumer, create_producer

app = FastAPI(title="Passenger Flow API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    init_db()
    asyncio.create_task(start_kafka_consumer())


async def start_kafka_consumer():
    consumer = ProbeDataConsumer()
    await consumer.start()


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass


manager = ConnectionManager()


@app.post("/api/probe", status_code=202)
async def receive_probe(data: ProbeDataModel, db: Session = Depends(get_db)):
    timestamp = data.timestamp or datetime.utcnow()
    zone = data.zone or "default"

    probe = ProbeData(
        mac_address=data.mac_address,
        rssi=data.rssi,
        ap_id=data.ap_id,
        timestamp=timestamp,
        zone=zone
    )
    db.add(probe)
    db.commit()

    global_estimator.add_probe(data.mac_address, timestamp, data.rssi, zone)

    return {"status": "accepted"}


@app.post("/api/probe/batch", status_code=202)
async def receive_probe_batch(data: List[ProbeDataModel], db: Session = Depends(get_db)):
    producer = create_producer()
    for item in data:
        producer.send(settings.kafka_topic, value=item.model_dump())
    producer.flush()
    producer.close()
    return {"status": "accepted", "count": len(data)}


@app.get("/api/count/current", response_model=List[PassengerCountResponse])
async def get_current_count(zone: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(PassengerCount)
    if zone:
        query = query.filter(PassengerCount.zone == zone)

    latest_counts = query.order_by(PassengerCount.timestamp.desc()).limit(10).all()

    zone_map = {}
    for count in latest_counts:
        if count.zone not in zone_map:
            zone_map[count.zone] = count

    results = []
    for zone_id, count in zone_map.items():
        realtime_result = global_estimator.estimate_zone(zone_id)
        results.append(PassengerCountResponse(
            zone=zone_id,
            timestamp=realtime_result['timestamp'],
            raw_count=realtime_result['raw_count'],
            adjusted_count=realtime_result.get('adjusted_count'),
            estimated_count=realtime_result['estimated_count'],
            lower_bound=realtime_result['lower_bound'],
            upper_bound=realtime_result['upper_bound'],
            confidence=realtime_result['confidence'],
            total_probes=realtime_result.get('total_probes'),
            random_mac_ratio=realtime_result.get('random_mac_ratio')
        ))

    return results


@app.get("/api/count/history", response_model=List[PassengerCountResponse])
async def get_count_history(
    zone: str = "default",
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    if not start_time:
        start_time = datetime.utcnow() - timedelta(hours=1)
    if not end_time:
        end_time = datetime.utcnow()

    counts = db.query(PassengerCount).filter(
        PassengerCount.zone == zone,
        PassengerCount.timestamp >= start_time,
        PassengerCount.timestamp <= end_time
    ).order_by(PassengerCount.timestamp).all()

    return [
        PassengerCountResponse(
            zone=c.zone,
            timestamp=c.timestamp,
            raw_count=c.raw_count,
            estimated_count=c.estimated_count,
            lower_bound=c.lower_bound,
            upper_bound=c.upper_bound,
            confidence=c.confidence
        ) for c in counts
    ]


@app.get("/api/heatmap", response_model=HeatmapResponse)
async def get_heatmap(db: Session = Depends(get_db)):
    zones = db.query(ZoneConfig).all()

    points = []
    total_estimated = 0

    for zone_config in zones:
        result = global_estimator.estimate_zone(zone_config.zone_id)
        estimated = result['estimated_count']
        total_estimated += estimated

        center_x = zone_config.x + zone_config.width / 2
        center_y = zone_config.y + zone_config.height / 2
        intensity = estimated / max(1, zone_config.max_capacity)

        points.append(HeatmapPoint(
            x=center_x,
            y=center_y,
            value=min(1.0, intensity),
            zone=zone_config.zone_id
        ))

    if not points:
        result = global_estimator.estimate_zone("default")
        total_estimated = result['estimated_count']
        points.append(HeatmapPoint(
            x=0.5,
            y=0.5,
            value=min(1.0, result['estimated_count'] / 100),
            zone="default"
        ))

    return HeatmapResponse(
        timestamp=datetime.utcnow(),
        points=points,
        total_estimated=round(total_estimated, 2)
    )


@app.get("/api/trend", response_model=TrendResponse)
async def get_trend(
    zone: str = "default",
    prediction_steps: int = 12,
    db: Session = Depends(get_db)
):
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(hours=2)

    historical_data = db.query(PassengerCount).filter(
        PassengerCount.zone == zone,
        PassengerCount.timestamp >= start_time,
        PassengerCount.timestamp <= end_time
    ).order_by(PassengerCount.timestamp).all()

    historical = []
    for h in historical_data:
        historical.append(TrendDataPoint(
            timestamp=h.timestamp,
            count=h.estimated_count
        ))
        global_predictor.add_historical_data(zone, h.timestamp, h.estimated_count)

    predictions = global_predictor.predict_trend(zone, steps=prediction_steps)
    predicted = [
        TrendDataPoint(timestamp=ts, count=count)
        for ts, count in predictions
    ]

    forecast_meta = global_predictor.get_forecast_metadata(zone, datetime.utcnow())

    return TrendResponse(
        zone=zone,
        historical=historical,
        predicted=predicted,
        forecast_metadata=ForecastMetadata(**forecast_meta)
    )


@app.get("/api/zones", response_model=List[ZoneConfigModel])
async def get_zones(db: Session = Depends(get_db)):
    zones = db.query(ZoneConfig).all()
    return [
        ZoneConfigModel(
            zone_id=z.zone_id,
            name=z.name,
            x=z.x,
            y=z.y,
            width=z.width,
            height=z.height,
            max_capacity=z.max_capacity,
            ap_ids=z.ap_ids.split(',') if z.ap_ids else []
        ) for z in zones
    ]


@app.post("/api/zones", response_model=ZoneConfigModel)
async def create_zone(zone_config: ZoneConfigModel, db: Session = Depends(get_db)):
    existing = db.query(ZoneConfig).filter(ZoneConfig.zone_id == zone_config.zone_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Zone already exists")

    zone = ZoneConfig(
        zone_id=zone_config.zone_id,
        name=zone_config.name,
        x=zone_config.x,
        y=zone_config.y,
        width=zone_config.width,
        height=zone_config.height,
        max_capacity=zone_config.max_capacity,
        ap_ids=','.join(zone_config.ap_ids)
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)

    return zone_config


@app.get("/api/display/{display_id}")
async def get_display_data(display_id: str, zone: str = "default", db: Session = Depends(get_db)):
    result = global_estimator.estimate_zone(zone)

    zone_config = db.query(ZoneConfig).filter(ZoneConfig.zone_id == zone).first()
    max_capacity = zone_config.max_capacity if zone_config else 100
    occupancy_rate = result['estimated_count'] / max_capacity * 100

    return {
        "display_id": display_id,
        "zone": zone,
        "current_count": int(round(result['estimated_count'])),
        "max_capacity": max_capacity,
        "occupancy_rate": round(occupancy_rate, 1),
        "confidence": result['confidence'],
        "timestamp": datetime.utcnow(),
        "status": "normal" if occupancy_rate < 80 else "warning" if occupancy_rate < 95 else "critical"
    }


@app.get("/api/seat/occupancy", response_model=SeatOccupancyResponse)
async def get_seat_occupancy(zone: str = "default", db: Session = Depends(get_db)):
    zone_config = db.query(ZoneConfig).filter(ZoneConfig.zone_id == zone).first()
    if zone_config:
        seat_count = int(zone_config.max_capacity * 0.6)
        global_seat_estimator.configure_zone_seats(zone, seat_count)

    return global_seat_estimator.estimate_seat_occupancy(zone)


@app.get("/api/seat/distribution")
async def get_stay_distribution(zone: str = None):
    return global_seat_estimator.get_stay_distribution(zone)


@app.get("/api/trains/schedules", response_model=List[TrainScheduleModel])
async def get_train_schedules():
    schedules = global_train_manager.get_all_schedules()
    return [
        TrainScheduleModel(
            train_number=s.train_number,
            departure_station=s.departure_station,
            arrival_station=s.arrival_station,
            scheduled_departure=s.scheduled_departure,
            scheduled_arrival=s.scheduled_arrival,
            actual_departure=s.actual_departure,
            actual_arrival=s.actual_arrival,
            status=s.status,
            platform=s.platform,
            gate=s.gate,
            delay_minutes=s.delay_minutes
        ) for s in schedules
    ]


@app.get("/api/trains/departing", response_model=List[TrainScheduleModel])
async def get_departing_trains(next_minutes: int = 120):
    trains = global_train_manager.get_departing_trains(next_minutes)
    return [
        TrainScheduleModel(
            train_number=s.train_number,
            departure_station=s.departure_station,
            arrival_station=s.arrival_station,
            scheduled_departure=s.scheduled_departure,
            scheduled_arrival=s.scheduled_arrival,
            actual_departure=s.actual_departure,
            actual_arrival=s.actual_arrival,
            status=s.status,
            platform=s.platform,
            gate=s.gate,
            delay_minutes=s.delay_minutes
        ) for s in trains
    ]


@app.get("/api/trains/forecast", response_model=TrainForecastResponse)
async def get_train_forecast(zone: str = "default", minutes_ahead: int = 60):
    return global_train_manager.get_passenger_flow_forecast(zone, minutes_ahead)


@app.get("/api/trains/waiting-time", response_model=WaitingTimeResponse)
async def get_waiting_time(zone: str = "default"):
    return global_train_manager.get_waiting_time_estimate(zone)


@app.get("/api/reports/summary")
async def get_report_summary(
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    return ReportExporter.get_report_summary(db, start_time, end_time)


@app.get("/api/reports/daily")
async def get_daily_report(report_date: Optional[datetime] = None, db: Session = Depends(get_db)):
    return ReportExporter.generate_daily_report(db, report_date)


@app.get("/api/reports/export/csv")
async def export_csv(
    report_type: str = "passenger",
    zone: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    if report_type == "passenger":
        csv_content = ReportExporter.export_passenger_count_csv(db, zone, start_time, end_time)
        filename = f"passenger_count_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    elif report_type == "hourly":
        csv_content = ReportExporter.export_hourly_summary_csv(db, zone, start_time, end_time)
        filename = f"hourly_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    elif report_type == "probe":
        csv_content = ReportExporter.export_probe_data_csv(db, zone, start_time, end_time)
        filename = f"probe_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    else:
        raise HTTPException(status_code=400, detail="Invalid report type")

    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.websocket("/ws/realtime")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Message received: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.api_host, port=settings.api_port)
