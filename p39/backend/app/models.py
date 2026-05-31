from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Dict


class ProbeDataModel(BaseModel):
    mac_address: str = Field(..., pattern=r'^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$')
    rssi: int = Field(..., ge=-100, le=0)
    ap_id: str
    timestamp: Optional[datetime] = None
    zone: Optional[str] = None


class PassengerCountResponse(BaseModel):
    zone: str
    timestamp: datetime
    raw_count: int
    adjusted_count: Optional[int] = None
    estimated_count: float
    lower_bound: float
    upper_bound: float
    confidence: float
    total_probes: Optional[int] = None
    random_mac_ratio: Optional[float] = None


class HeatmapPoint(BaseModel):
    x: float
    y: float
    value: float
    zone: str


class HeatmapResponse(BaseModel):
    timestamp: datetime
    points: List[HeatmapPoint]
    total_estimated: float


class TrendDataPoint(BaseModel):
    timestamp: datetime
    count: float


class ForecastMetadata(BaseModel):
    is_holiday: bool
    holiday_type: str
    day_factor: float
    season_factor: float
    is_weekend: bool
    weekday: int


class TrendResponse(BaseModel):
    zone: str
    historical: List[TrendDataPoint]
    predicted: List[TrendDataPoint]
    forecast_metadata: Optional[ForecastMetadata] = None


class ZoneConfigModel(BaseModel):
    zone_id: str
    name: str
    x: float
    y: float
    width: float
    height: float
    max_capacity: int
    ap_ids: List[str]


class SeatOccupancyResponse(BaseModel):
    zone: str
    timestamp: datetime
    total_seats: int
    estimated_seated: int
    standing_devices: int
    occupancy_rate: float
    avg_stay_minutes: float
    long_stay_devices: int
    confidence: float
    status: str


class StayDistribution(BaseModel):
    __root__: Dict[str, int]


class TrainScheduleModel(BaseModel):
    train_number: str
    departure_station: str
    arrival_station: str
    scheduled_departure: datetime
    scheduled_arrival: datetime
    actual_departure: Optional[datetime] = None
    actual_arrival: Optional[datetime] = None
    status: str
    platform: str
    gate: str
    delay_minutes: int


class TrainForecastResponse(BaseModel):
    zone: str
    forecast_minutes: int
    departing_trains_count: int
    estimated_total_passengers: int
    peak_load_estimate: int
    boarding_trains_count: int
    related_trains: List[Dict]


class WaitingTimeResponse(BaseModel):
    zone: str
    estimated_wait_minutes: float
    crowd_status: str
    next_train_departure: Optional[datetime] = None
    next_train_number: Optional[str] = None
    boarding_active: bool


class ReportSummaryResponse(BaseModel):
    period_start: datetime
    period_end: datetime
    total_probe_records: int
    unique_devices: int
    passenger_records: int
    zones: List[str]
    avg_passengers: float
    max_passengers: float
    min_passengers: float
    total_data_points: int
