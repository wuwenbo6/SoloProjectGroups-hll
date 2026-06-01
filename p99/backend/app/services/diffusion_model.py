import numpy as np
from typing import List, Tuple, Dict
import math
import json

class GaussianPlumeModel:
    STABILITY_PARAMS = {
        'A': {'alpha': 0.92, 'beta_x': 0.18, 'beta_y': 0.65},
        'B': {'alpha': 0.91, 'beta_x': 0.15, 'beta_y': 0.60},
        'C': {'alpha': 0.89, 'beta_x': 0.12, 'beta_y': 0.55},
        'D': {'alpha': 0.87, 'beta_x': 0.10, 'beta_y': 0.50},
        'E': {'alpha': 0.84, 'beta_x': 0.08, 'beta_y': 0.45},
        'F': {'alpha': 0.80, 'beta_x': 0.06, 'beta_y': 0.40}
    }

    def __init__(self, source_lat: float, source_lon: float, emission_rate: float,
                 wind_speed: float, wind_direction: float, stability_class: str = 'D'):
        self.source_lat = source_lat
        self.source_lon = source_lon
        self.emission_rate = emission_rate
        self.wind_speed = wind_speed
        self.wind_direction = wind_direction
        self.stability_class = stability_class
        self.params = self.STABILITY_PARAMS.get(stability_class, self.STABILITY_PARAMS['D'])

    def _calculate_sigma(self, x: float) -> Tuple[float, float]:
        alpha = self.params['alpha']
        beta_x = self.params['beta_x']
        beta_y = self.params['beta_y']
        
        x_km = x / 1000.0
        if x_km < 0.001:
            x_km = 0.001
        
        sigma_y = beta_x * (x_km ** alpha) * 1000
        sigma_z = beta_y * (x_km ** alpha) * 1000
        
        return sigma_y, sigma_z

    def _latlon_to_meters(self, lat: float, lon: float) -> Tuple[float, float]:
        lat_diff = (lat - self.source_lat) * 111320
        lon_diff = (lon - self.source_lon) * 111320 * math.cos(math.radians(self.source_lat))
        return lat_diff, lon_diff

    def _rotate_coordinates(self, dy: float, dx: float) -> Tuple[float, float]:
        wind_rad = math.radians(self.wind_direction)
        x_parallel = dx * math.cos(wind_rad) + dy * math.sin(wind_rad)
        y_perpendicular = -dx * math.sin(wind_rad) + dy * math.cos(wind_rad)
        return x_parallel, y_perpendicular

    def calculate_concentration(self, lat: float, lon: float, height: float = 0) -> float:
        dy, dx = self._latlon_to_meters(lat, lon)
        
        x_parallel, y_perpendicular = self._rotate_coordinates(dy, dx)
        
        if x_parallel <= 0:
            return 0.0
        
        sigma_y, sigma_z = self._calculate_sigma(x_parallel)
        
        if self.wind_speed < 0.1:
            wind_speed = 0.1
        else:
            wind_speed = self.wind_speed
        
        term1 = self.emission_rate / (2 * math.pi * wind_speed * sigma_y * sigma_z)
        term2 = math.exp(-(y_perpendicular ** 2) / (2 * sigma_y ** 2))
        term3 = math.exp(-(height ** 2) / (2 * sigma_z ** 2))
        
        concentration = term1 * term2 * term3
        
        return max(0, concentration)

    def simulate_grid(self, grid_lats: List[float], grid_lons: List[float]) -> List[List[float]]:
        concentrations = []
        for lat in grid_lats:
            row = []
            for lon in grid_lons:
                conc = self.calculate_concentration(lat, lon)
                row.append(conc)
            concentrations.append(row)
        return concentrations

class TimeDependentDiffusion(GaussianPlumeModel):
    def __init__(self, source_lat: float, source_lon: float, emission_rate: float,
                 wind_speed: float, wind_direction: float, stability_class: str = 'D',
                 duration_hours: int = 24, time_step_minutes: int = 15):
        super().__init__(source_lat, source_lon, emission_rate, wind_speed, wind_direction, stability_class)
        self.duration_hours = duration_hours
        self.time_step_minutes = time_step_minutes

    def calculate_time_dependent_concentration(self, lat: float, lon: float, time_hours: float) -> float:
        dy, dx = self._latlon_to_meters(lat, lon)
        x_parallel, y_perpendicular = self._rotate_coordinates(dy, dx)
        
        if x_parallel <= 0:
            return 0.0
        
        travel_time_hours = x_parallel / (self.wind_speed * 3600)
        
        if time_hours < travel_time_hours:
            return 0.0
        
        sigma_y, sigma_z = self._calculate_sigma(x_parallel)
        
        time_factor = 1 - math.exp(-(time_hours / max(travel_time_hours, 0.1)))
        
        if self.wind_speed < 0.1:
            wind_speed = 0.1
        else:
            wind_speed = self.wind_speed
        
        term1 = self.emission_rate / (2 * math.pi * wind_speed * sigma_y * sigma_z)
        term2 = math.exp(-(y_perpendicular ** 2) / (2 * sigma_y ** 2))
        term3 = math.exp(0)
        
        concentration = term1 * term2 * term3 * time_factor
        
        return max(0, concentration)

    def simulate_time_series(self, grid_lats: List[float], grid_lons: List[float]) -> Tuple[List[float], List[List[List[float]]]]:
        total_steps = int((self.duration_hours * 60) / self.time_step_minutes)
        time_steps = [i * self.time_step_minutes / 60 for i in range(total_steps + 1)]
        
        time_series_data = []
        for t in time_steps:
            grid_data = []
            for lat in grid_lats:
                row = []
                for lon in grid_lons:
                    conc = self.calculate_time_dependent_concentration(lat, lon, t)
                    row.append(conc)
                grid_data.append(row)
            time_series_data.append(grid_data)
        
        return time_steps, time_series_data

def generate_grid(source_lat: float, source_lon: float, 
                  resolution: float = 0.001, size_km: float = 5) -> Tuple[List[float], List[float]]:
    size_deg = size_km / 111.0
    
    min_lat = source_lat - size_deg
    max_lat = source_lat + size_deg
    min_lon = source_lon - size_deg
    max_lon = source_lon + size_deg
    
    lats = list(np.arange(min_lat, max_lat + resolution, resolution))
    lons = list(np.arange(min_lon, max_lon + resolution, resolution))
    
    return lats, lons

def generate_contours(concentrations: List[List[float]], lats: List[float], lons: List[float], 
                      levels: List[float] = None) -> List[Dict]:
    if levels is None:
        max_conc = np.max(concentrations)
        if max_conc > 0:
            levels = [max_conc * 0.01, max_conc * 0.05, max_conc * 0.1, 
                      max_conc * 0.25, max_conc * 0.5, max_conc * 0.75]
        else:
            levels = [1e-6, 1e-5, 1e-4, 1e-3]
    
    contours = []
    for level in levels:
        contour_points = []
        for i, lat in enumerate(lats):
            for j, lon in enumerate(lons):
                if concentrations[i][j] >= level:
                    contour_points.append([lat, lon])
        
        if contour_points:
            contours.append({
                'level': level,
                'points': contour_points
            })
    
    return contours

def run_simulation(source_lat: float, source_lon: float, emission_rate: float,
                   wind_speed: float, wind_direction: float, stability_class: str,
                   duration_hours: int, grid_resolution: float) -> Dict:
    lats, lons = generate_grid(source_lat, source_lon, grid_resolution)
    
    model = TimeDependentDiffusion(
        source_lat=source_lat,
        source_lon=source_lon,
        emission_rate=emission_rate,
        wind_speed=wind_speed,
        wind_direction=wind_direction,
        stability_class=stability_class,
        duration_hours=duration_hours
    )
    
    time_steps, time_series_data = model.simulate_time_series(lats, lons)
    
    final_concentrations = time_series_data[-1]
    contours = generate_contours(final_concentrations, lats, lons)
    
    result = {
        'grid_lats': lats,
        'grid_lons': lons,
        'time_steps': time_steps,
        'concentrations': final_concentrations,
        'time_series': time_series_data,
        'contours': contours
    }
    
    return result
