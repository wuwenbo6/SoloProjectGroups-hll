from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Dict

class WeatherPoint(BaseModel):
    time: float
    wind_speed: float
    wind_direction: float
    stability_class: str

class SimulationBase(BaseModel):
    name: str
    source_lat: float
    source_lon: float
    emission_rate: float
    wind_speed: float
    wind_direction: float
    stability_class: str
    duration_hours: int
    grid_resolution: float
    pollutant_type: str
    description: Optional[str] = None
    num_particles: int = Field(default=10000, ge=1000, le=50000)
    use_dynamic_weather: bool = False
    weather_series: Optional[List[WeatherPoint]] = None

class SimulationCreate(SimulationBase):
    pass

class SimulationResponse(SimulationBase):
    id: int
    created_at: datetime
    result_data: Optional[str] = None

    class Config:
        from_attributes = True

class SimulationResult(BaseModel):
    simulation_id: int
    grid_lats: List[float]
    grid_lons: List[float]
    concentrations: List[List[float]]
    time_steps: List[float]
    contours: Optional[List[Dict]] = None

class WeatherData(BaseModel):
    wind_speed: float
    wind_direction: float
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    stability_class: str
