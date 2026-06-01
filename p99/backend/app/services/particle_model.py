import numpy as np
from typing import List, Tuple, Dict, Optional
import math

class Particle:
    __slots__ = ['lat', 'lon', 'mass', 'age', 'sigma_h', 'sigma_v', 'active']
    
    def __init__(self, lat: float, lon: float, mass: float = 1.0):
        self.lat = lat
        self.lon = lon
        self.mass = mass
        self.age = 0.0
        self.sigma_h = 0.0
        self.sigma_v = 0.0
        self.active = True

class LagrangianParticleModel:
    STABILITY_PARAMS = {
        'A': {'alpha_h': 0.92, 'beta_h': 0.18, 'alpha_v': 0.92, 'beta_v': 0.65, 'k_h': 100.0, 'k_v': 50.0},
        'B': {'alpha_h': 0.91, 'beta_h': 0.15, 'alpha_v': 0.91, 'beta_v': 0.60, 'k_h': 80.0, 'k_v': 40.0},
        'C': {'alpha_h': 0.89, 'beta_h': 0.12, 'alpha_v': 0.89, 'beta_v': 0.55, 'k_h': 60.0, 'k_v': 30.0},
        'D': {'alpha_h': 0.87, 'beta_h': 0.10, 'alpha_v': 0.87, 'beta_v': 0.50, 'k_h': 40.0, 'k_v': 20.0},
        'E': {'alpha_h': 0.84, 'beta_h': 0.08, 'alpha_v': 0.84, 'beta_v': 0.45, 'k_h': 20.0, 'k_v': 10.0},
        'F': {'alpha_h': 0.80, 'beta_h': 0.06, 'alpha_v': 0.80, 'beta_v': 0.40, 'k_h': 10.0, 'k_v': 5.0}
    }

    def __init__(self, source_lat: float, source_lon: float, emission_rate: float,
                 num_particles: int = 5000, simulation_duration_hours: float = 24.0):
        self.source_lat = source_lat
        self.source_lon = source_lon
        self.emission_rate = emission_rate
        self.num_particles = num_particles
        self.simulation_duration_hours = simulation_duration_hours
        
        self.particles: List[Particle] = []
        self.weather_series: List[Dict] = []
        self.current_time = 0.0
        
        self.lat_to_m = 111320.0
        self.lon_to_m = 111320.0 * math.cos(math.radians(source_lat))
        
        self.particles_released = 0
        self.total_particles_to_release = num_particles
        self.particle_mass = emission_rate * 3600 * simulation_duration_hours / num_particles if num_particles > 0 else 0

    def set_weather_series(self, weather_series: List[Dict]):
        self.weather_series = sorted(weather_series, key=lambda x: x['time'])

    def get_weather_at_time(self, t: float) -> Dict:
        if not self.weather_series:
            return {'wind_speed': 3.0, 'wind_direction': 90.0, 'stability_class': 'D'}
        
        for i in range(len(self.weather_series) - 1):
            if self.weather_series[i]['time'] <= t < self.weather_series[i + 1]['time']:
                t1, w1 = self.weather_series[i]['time'], self.weather_series[i]
                t2, w2 = self.weather_series[i + 1]['time'], self.weather_series[i + 1]
                alpha = (t - t1) / (t2 - t1) if t2 != t1 else 0
                
                return {
                    'wind_speed': w1['wind_speed'] + alpha * (w2['wind_speed'] - w1['wind_speed']),
                    'wind_direction': self._interpolate_direction(w1['wind_direction'], w2['wind_direction'], alpha),
                    'stability_class': w1['stability_class']
                }
        
        return self.weather_series[-1]

    def _interpolate_direction(self, d1: float, d2: float, alpha: float) -> float:
        delta = d2 - d1
        if delta > 180:
            delta -= 360
        elif delta < -180:
            delta += 360
        result = d1 + alpha * delta
        return result % 360

    def _calculate_diffusion_sigmas(self, travel_time: float, stability_class: str) -> Tuple[float, float]:
        params = self.STABILITY_PARAMS.get(stability_class, self.STABILITY_PARAMS['D'])
        
        t_hours = max(travel_time / 3600.0, 0.001)
        
        sigma_h = params['beta_h'] * (t_hours ** params['alpha_h']) * 1000
        sigma_v = params['beta_v'] * (t_hours ** params['alpha_v']) * 1000
        
        return sigma_h, sigma_v

    def release_particles(self, num_to_release: int, current_time: float):
        for _ in range(num_to_release):
            particle = Particle(
                lat=self.source_lat + np.random.normal(0, 0.0001),
                lon=self.source_lon + np.random.normal(0, 0.0001),
                mass=self.particle_mass
            )
            particle.age = 0.0
            self.particles.append(particle)
            self.particles_released += 1

    def advect_particle(self, particle: Particle, dt: float, weather: Dict) -> Tuple[float, float]:
        wind_speed = weather['wind_speed']
        wind_direction = weather['wind_direction']
        stability_class = weather['stability_class']
        
        wind_rad = math.radians(270 - wind_direction)
        
        dx = wind_speed * math.cos(wind_rad) * dt
        dy = wind_speed * math.sin(wind_rad) * dt
        
        params = self.STABILITY_PARAMS.get(stability_class, self.STABILITY_PARAMS['D'])
        sigma_h = np.sqrt(2 * params['k_h'] * particle.age) if particle.age > 0 else 10
        sigma_v = np.sqrt(2 * params['k_v'] * particle.age) if particle.age > 0 else 5
        
        dx += np.random.normal(0, sigma_h * np.sqrt(dt / 3600.0))
        dy += np.random.normal(0, sigma_v * np.sqrt(dt / 3600.0))
        
        dlat = dy / self.lat_to_m
        dlon = dx / self.lon_to_m
        
        return dlat, dlon

    def step(self, dt: float):
        weather = self.get_weather_at_time(self.current_time)
        
        total_simulation_seconds = self.simulation_duration_hours * 3600
        particles_per_second = self.total_particles_to_release / max(total_simulation_seconds, 1)
        particles_per_step = max(10, int(particles_per_second * dt * 1.2))
        
        if self.particles_released < self.total_particles_to_release:
            to_release = min(particles_per_step, self.total_particles_to_release - self.particles_released)
            self.release_particles(to_release, self.current_time)
        
        for particle in self.particles:
            if not particle.active:
                continue
            
            dlat, dlon = self.advect_particle(particle, dt, weather)
            particle.lat += dlat
            particle.lon += dlon
            particle.age += dt
            
            if particle.age > 24 * 3600:
                particle.active = False
        
        self.current_time += dt

    def run_simulation(self, duration_hours: float, time_step_seconds: float = 60.0) -> List[Dict]:
        total_steps = int(duration_hours * 3600 / time_step_seconds)
        time_series_results = []
        
        snapshot_interval = max(1, int(15 * 60 / time_step_seconds))
        
        for step in range(total_steps + 1):
            if step > 0:
                self.step(time_step_seconds)
            
            if step % snapshot_interval == 0 or step == total_steps:
                snapshot = self.get_particle_snapshot()
                time_series_results.append({
                    'time_hours': self.current_time / 3600.0,
                    'particles': snapshot
                })
        
        return time_series_results

    def get_particle_snapshot(self) -> List[Tuple[float, float, float]]:
        return [(p.lat, p.lon, p.mass) for p in self.particles if p.active]

    def calculate_concentration_grid(self, lats: List[float], lons: List[float],
                                     particle_snapshot: List[Tuple[float, float, float]],
                                     kernel_radius: float = 150.0) -> List[List[float]]:
        n_lat = len(lats)
        n_lon = len(lons)
        concentrations = np.zeros((n_lat, n_lon))
        
        if not particle_snapshot:
            return concentrations.tolist()
        
        particles = np.array(particle_snapshot)
        p_lats = particles[:, 0]
        p_lons = particles[:, 1]
        p_masses = particles[:, 2]
        
        kernel_radius_lat = kernel_radius / self.lat_to_m
        kernel_radius_lon = kernel_radius / self.lon_to_m
        
        for i, lat in enumerate(lats):
            for j, lon in enumerate(lons):
                dx = (p_lons - lon) * self.lon_to_m
                dy = (p_lats - lat) * self.lat_to_m
                dist_sq = dx**2 + dy**2
                
                within_radius = dist_sq < kernel_radius**2
                
                if np.any(within_radius):
                    distances = np.sqrt(dist_sq[within_radius])
                    kernel = (1 - distances / kernel_radius) ** 2
                    concentrations[i, j] = np.sum(p_masses[within_radius] * kernel)
        
        area_per_cell = (lats[1] - lats[0]) * self.lat_to_m * (lons[1] - lons[0]) * self.lon_to_m
        if area_per_cell > 0:
            concentrations = concentrations / area_per_cell * 1e6
        
        return concentrations.tolist()

def generate_particle_grid(source_lat: float, source_lon: float, 
                           resolution: float = 0.002, size_km: float = 8) -> Tuple[List[float], List[float]]:
    size_deg = size_km / 111.0
    
    min_lat = source_lat - size_deg
    max_lat = source_lat + size_deg
    min_lon = source_lon - size_deg
    max_lon = source_lon + size_deg
    
    lats = list(np.arange(min_lat, max_lat + resolution, resolution))
    lons = list(np.arange(min_lon, max_lon + resolution, resolution))
    
    return lats, lons

def generate_contours_from_grid(concentrations: List[List[float]], lats: List[float], lons: List[float], 
                                num_levels: int = 6) -> List[Dict]:
    conc_array = np.array(concentrations)
    max_conc = np.max(conc_array)
    
    if max_conc <= 0:
        return []
    
    levels = np.logspace(np.log10(max_conc * 0.01), np.log10(max_conc * 0.8), num_levels)
    
    contours = []
    for level in levels:
        mask = conc_array >= level
        if not np.any(mask):
            continue
            
        points = []
        for i in range(len(lats)):
            for j in range(len(lons)):
                if mask[i, j]:
                    points.append([lats[i], lons[j]])
        
        if len(points) > 10:
            contours.append({
                'level': float(level),
                'points': points
            })
    
    return contours

def run_particle_simulation(source_lat: float, source_lon: float, emission_rate: float,
                            wind_speed: float, wind_direction: float, stability_class: str,
                            duration_hours: int, grid_resolution: float,
                            num_particles: int = 10000, time_step_seconds: float = 300.0,
                            wind_series: Optional[List[Dict]] = None) -> Dict:
    lats, lons = generate_particle_grid(source_lat, source_lon, grid_resolution)
    
    model = LagrangianParticleModel(
        source_lat=source_lat,
        source_lon=source_lon,
        emission_rate=emission_rate,
        num_particles=num_particles,
        simulation_duration_hours=duration_hours
    )
    
    if wind_series:
        model.set_weather_series(wind_series)
    else:
        model.set_weather_series([
            {'time': 0.0, 'wind_speed': wind_speed, 'wind_direction': wind_direction, 
             'stability_class': stability_class},
            {'time': duration_hours * 3600.0, 'wind_speed': wind_speed, 
             'wind_direction': wind_direction, 'stability_class': stability_class}
        ])
    
    time_series_results = model.run_simulation(duration_hours, time_step_seconds)
    
    concentration_series = []
    for result in time_series_results:
        conc_grid = model.calculate_concentration_grid(lats, lons, result['particles'])
        concentration_series.append(conc_grid)
    
    final_concentrations = concentration_series[-1]
    contours = generate_contours_from_grid(final_concentrations, lats, lons)
    
    particle_snapshots = []
    for result in time_series_results:
        particle_snapshots.append({
            'time_hours': result['time_hours'],
            'particles': result['particles'][:2000]
        })
    
    result = {
        'grid_lats': lats,
        'grid_lons': lons,
        'time_steps': [r['time_hours'] for r in time_series_results],
        'concentrations': final_concentrations,
        'time_series': concentration_series,
        'particle_snapshots': particle_snapshots,
        'contours': contours,
        'num_particles_used': model.particles_released
    }
    
    return result
