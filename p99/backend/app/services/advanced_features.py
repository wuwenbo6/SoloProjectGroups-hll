import numpy as np
from typing import List, Tuple, Dict, Optional
import math
import xml.etree.ElementTree as ET
from xml.dom import minidom
from datetime import datetime, timedelta

from backend.app.services.particle_model import LagrangianParticleModel, generate_particle_grid

class BackwardTrajectoryModel:
    def __init__(self, observation_lat: float, observation_lon: float,
                 observation_time_hours: float = 6.0, num_particles: int = 5000):
        self.observation_lat = observation_lat
        self.observation_lon = observation_lon
        self.observation_time_hours = observation_time_hours
        self.num_particles = num_particles
        
        self.particles: List[Dict] = []
        self.lat_to_m = 111320.0
        self.lon_to_m = 111320.0 * math.cos(math.radians(observation_lat))
        self.weather_series: List[Dict] = []
        
    def set_weather_series(self, weather_series: List[Dict]):
        self.weather_series = sorted(weather_series, key=lambda x: x['time'])

    def _get_weather_at_backward_time(self, backward_seconds: float) -> Dict:
        if not self.weather_series:
            return {'wind_speed': 3.0, 'wind_direction': 90.0}
        
        forward_time = backward_seconds
        for i in range(len(self.weather_series) - 1):
            if self.weather_series[i]['time'] <= forward_time < self.weather_series[i + 1]['time']:
                t1, w1 = self.weather_series[i]['time'], self.weather_series[i]
                t2, w2 = self.weather_series[i + 1]['time'], self.weather_series[i + 1]
                alpha = (forward_time - t1) / (t2 - t1) if t2 != t1 else 0
                
                return {
                    'wind_speed': w1['wind_speed'] + alpha * (w2['wind_speed'] - w1['wind_speed']),
                    'wind_direction': self._interpolate_direction(w1['wind_direction'], w2['wind_direction'], alpha)
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

    def run_backward_simulation(self, duration_hours: float = 24.0, 
                                time_step_seconds: float = 300.0) -> Dict:
        total_steps = int(duration_hours * 3600 / time_step_seconds)
        
        for i in range(self.num_particles):
            self.particles.append({
                'lat': self.observation_lat + np.random.normal(0, 0.0005),
                'lon': self.observation_lon + np.random.normal(0, 0.0005),
                'mass': 1.0,
                'history': [(self.observation_lat, self.observation_lon)]
            })
        
        trajectory_series = []
        trajectory_series.append({
            'time_hours': 0.0,
            'particles': [(p['lat'], p['lon']) for p in self.particles]
        })
        
        for step in range(total_steps):
            backward_time = step * time_step_seconds
            weather = self._get_weather_at_backward_time(backward_time)
            
            wind_rad = math.radians(270 - weather['wind_direction'])
            wind_speed = weather['wind_speed']
            
            dx_backward = wind_speed * math.cos(wind_rad) * time_step_seconds
            dy_backward = wind_speed * math.sin(wind_rad) * time_step_seconds
            
            turbulence_strength = 20.0
            
            for particle in self.particles:
                turbulence_x = np.random.normal(0, turbulence_strength)
                turbulence_y = np.random.normal(0, turbulence_strength)
                
                dlat = (dy_backward + turbulence_y) / self.lat_to_m
                dlon = (dx_backward + turbulence_x) / self.lon_to_m
                
                particle['lat'] += dlat
                particle['lon'] += dlon
                particle['history'].append((particle['lat'], particle['lon']))
            
            if step % max(1, int(15 * 60 / time_step_seconds)) == 0 or step == total_steps - 1:
                trajectory_series.append({
                    'time_hours': (step + 1) * time_step_seconds / 3600.0,
                    'particles': [(p['lat'], p['lon']) for p in self.particles]
                })
        
        source_probability = self._calculate_source_probability()
        
        return {
            'observation_point': (self.observation_lat, self.observation_lon),
            'trajectory_series': trajectory_series,
            'source_probability': source_probability,
            'particle_histories': [p['history'] for p in self.particles[:100]]
        }

    def _calculate_source_probability(self, grid_resolution: float = 0.002, 
                                     size_km: float = 10.0) -> Dict:
        lats, lons = generate_particle_grid(self.observation_lat, self.observation_lon, 
                                            grid_resolution, size_km)
        
        final_lats = np.array([p['lat'] for p in self.particles])
        final_lons = np.array([p['lon'] for p in self.particles])
        
        counts = np.zeros((len(lats), len(lons)))
        bandwidth = 300
        
        for i, lat in enumerate(lats):
            for j, lon in enumerate(lons):
                dx = (final_lons - lon) * self.lon_to_m
                dy = (final_lats - lat) * self.lat_to_m
                dist_sq = dx**2 + dy**2
                
                kernel = np.exp(-dist_sq / (2 * bandwidth**2))
                counts[i, j] = np.sum(kernel)
        
        max_count = np.max(counts)
        if max_count > 0:
            probability = counts / max_count
        else:
            probability = counts
        
        return {
            'grid_lats': lats,
            'grid_lons': lons,
            'probability': probability.tolist(),
            'max_probability_location': self._find_max_probability(lats, lons, probability)
        }

    def _find_max_probability(self, lats: List[float], lons: List[float], 
                              probability: np.ndarray) -> Tuple[float, float, float]:
        max_idx = np.unravel_index(np.argmax(probability), probability.shape)
        return (lats[max_idx[0]], lons[max_idx[1]], float(probability[max_idx]))

class MultiSourceSimulation:
    def __init__(self, sources: List[Dict]):
        self.sources = sources
        self.results: List[Dict] = []
        
    def run_simulation(self, duration_hours: float = 6.0, grid_resolution: float = 0.003,
                       num_particles_per_source: int = 8000) -> Dict:
        all_lats = set()
        all_lons = set()
        
        for source in self.sources:
            lats, lons = generate_particle_grid(source['lat'], source['lon'], grid_resolution, 10.0)
            all_lats.update(lats)
            all_lons.update(lons)
        
        combined_lats = sorted(list(all_lats))
        combined_lons = sorted(list(all_lons))
        
        combined_concentrations = np.zeros((len(combined_lats), len(combined_lons)))
        time_series_results = []
        
        for source in self.sources:
            model = LagrangianParticleModel(
                source_lat=source['lat'],
                source_lon=source['lon'],
                emission_rate=source['emission_rate'],
                num_particles=num_particles_per_source,
                simulation_duration_hours=duration_hours
            )
            
            model.set_weather_series([
                {'time': 0.0, 'wind_speed': source.get('wind_speed', 3.0), 
                 'wind_direction': source.get('wind_direction', 90.0),
                 'stability_class': source.get('stability_class', 'D')},
                {'time': duration_hours * 3600.0, 'wind_speed': source.get('wind_speed', 3.0),
                 'wind_direction': source.get('wind_direction', 90.0),
                 'stability_class': source.get('stability_class', 'D')}
            ])
            
            time_series = model.run_simulation(duration_hours, 300.0)
            
            source_concentrations = np.zeros((len(combined_lats), len(combined_lons)))
            
            for particle in model.particles:
                lat_idx = np.searchsorted(combined_lats, particle.lat)
                lon_idx = np.searchsorted(combined_lons, particle.lon)
                if 0 <= lat_idx < len(combined_lats) and 0 <= lon_idx < len(combined_lons):
                    source_concentrations[lat_idx, lon_idx] += particle.mass
            
            combined_concentrations += source_concentrations
            
            self.results.append({
                'source': source,
                'concentrations': source_concentrations.tolist(),
                'num_particles': model.particles_released
            })
        
        return {
            'combined_grid_lats': combined_lats,
            'combined_grid_lons': combined_lons,
            'combined_concentrations': combined_concentrations.tolist(),
            'individual_results': self.results,
            'max_concentration': float(np.max(combined_concentrations))
        }

class KMLExporter:
    def __init__(self, simulation_result: Dict):
        self.result = simulation_result
        
    def _get_color(self, concentration: float, max_conc: float) -> str:
        if max_conc <= 0:
            return '00000000'
        
        ratio = min(concentration / max_conc, 1.0)
        
        if ratio > 0.75:
            alpha = int(200 * ratio)
            return f'{alpha:02x}0080ff'
        elif ratio > 0.5:
            alpha = int(180 * ratio)
            return f'{alpha:02x}0000ff'
        elif ratio > 0.25:
            alpha = int(160 * ratio)
            return f'{alpha:02x}00a5ff'
        elif ratio > 0.1:
            alpha = int(140 * ratio)
            return f'{alpha:02x}00ffff'
        elif ratio > 0.01:
            alpha = int(120 * ratio)
            return f'{alpha:02x}00ff00'
        else:
            alpha = int(100 * ratio)
            return f'{alpha:02x}ffff00'

    def generate_animated_kml(self, output_path: str = None) -> str:
        kml = ET.Element('kml')
        kml.set('xmlns', 'http://www.opengis.net/kml/2.2')
        kml.set('xmlns:gx', 'http://www.google.com/kml/ext/2.2')
        
        document = ET.SubElement(kml, 'Document')
        ET.SubElement(document, 'name').text = '污染扩散模拟动画'
        
        if 'time_series' not in self.result:
            return self._generate_static_kml(document)
        
        time_steps = self.result['time_steps']
        lats = self.result['grid_lats']
        lons = self.result['grid_lons']
        
        max_conc = max(max(max(row) for row in concentrations) 
                        for concentrations in self.result['time_series'])
        
        for t_idx, time_hours in enumerate(time_steps):
            folder = ET.SubElement(document, 'Folder')
            ET.SubElement(folder, 'name').text = f't={time_hours:.1f}h'
            
            time_span = ET.SubElement(folder, 'TimeSpan')
            ET.SubElement(time_span, 'begin').text = f'{time_hours:.2f}'
            ET.SubElement(time_span, 'end').text = f'{time_hours + 0.1:.2f}'
            
            concentrations = self.result['time_series'][t_idx]
            
            for i in range(len(lats) - 1):
                for j in range(len(lons) - 1):
                    conc = concentrations[i][j]
                    if conc > max_conc * 0.01:
                        placemark = ET.SubElement(folder, 'Placemark')
                        
                        style = ET.SubElement(placemark, 'Style')
                        poly_style = ET.SubElement(style, 'PolyStyle')
                        ET.SubElement(poly_style, 'color').text = self._get_color(conc, max_conc)
                        ET.SubElement(poly_style, 'fill').text = '1'
                        ET.SubElement(poly_style, 'outline').text = '0'
                        
                        polygon = ET.SubElement(placemark, 'Polygon')
                        ET.SubElement(polygon, 'extrude').text = '0'
                        ET.SubElement(polygon, 'altitudeMode').text = 'clampToGround'
                        
                        outer_boundary = ET.SubElement(polygon, 'outerBoundaryIs')
                        linear_ring = ET.SubElement(outer_boundary, 'LinearRing')
                        coords = ET.SubElement(linear_ring, 'coordinates')
                        
                        coord_text = f"""
{lons[j]},{lats[i]},0
{lons[j+1]},{lats[i]},0
{lons[j+1]},{lats[i+1]},0
{lons[j]},{lats[i+1]},0
{lons[j]},{lats[i]},0
                        """.strip()
                        coords.text = coord_text
        
        xml_str = minidom.parseString(ET.tostring(kml)).toprettyxml(indent='  ')
        
        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(xml_str)
        
        return xml_str

    def _generate_static_kml(self, document: ET.Element) -> str:
        folder = ET.SubElement(document, 'Folder')
        ET.SubElement(folder, 'name').text = '污染分布'
        
        lats = self.result.get('grid_lats', [])
        lons = self.result.get('grid_lons', [])
        concentrations = self.result.get('concentrations', [])
        
        if not concentrations or not lats or not lons:
            return ET.tostring(document, encoding='unicode')
        
        flat_concs = [item for row in concentrations for item in row]
        max_conc = max(flat_concs) if flat_concs else 1
        
        for i in range(len(lats) - 1):
            for j in range(len(lons) - 1):
                conc = concentrations[i][j]
                if conc > max_conc * 0.01:
                    placemark = ET.SubElement(folder, 'Placemark')
                    
                    style = ET.SubElement(placemark, 'Style')
                    poly_style = ET.SubElement(style, 'PolyStyle')
                    ET.SubElement(poly_style, 'color').text = self._get_color(conc, max_conc)
                    ET.SubElement(poly_style, 'fill').text = '1'
                    ET.SubElement(poly_style, 'outline').text = '0'
                    
                    polygon = ET.SubElement(placemark, 'Polygon')
                    ET.SubElement(polygon, 'extrude').text = '0'
                    ET.SubElement(polygon, 'altitudeMode').text = 'clampToGround'
                    
                    outer_boundary = ET.SubElement(polygon, 'outerBoundaryIs')
                    linear_ring = ET.SubElement(outer_boundary, 'LinearRing')
                    coords = ET.SubElement(linear_ring, 'coordinates')
                    
                    coord_text = f"""
{lons[j]},{lats[i]},0
{lons[j+1]},{lats[i]},0
{lons[j+1]},{lats[i+1]},0
{lons[j]},{lats[i+1]},0
{lons[j]},{lats[i]},0
                    """.strip()
                    coords.text = coord_text
        
        return ET.tostring(document, encoding='unicode')

def run_backward_tracery(observation_lat: float, observation_lon: float,
                        wind_speed: float, wind_direction: float,
                        duration_hours: float = 24.0, num_particles: int = 5000) -> Dict:
    model = BackwardTrajectoryModel(observation_lat, observation_lon, num_particles=num_particles)
    
    model.set_weather_series([
        {'time': 0.0, 'wind_speed': wind_speed, 'wind_direction': wind_direction},
        {'time': duration_hours * 3600.0, 'wind_speed': wind_speed, 'wind_direction': wind_direction}
    ])
    
    return model.run_backward_simulation(duration_hours)

def run_multi_source_simulation(sources: List[Dict], duration_hours: float = 6.0,
                                grid_resolution: float = 0.003) -> Dict:
    simulator = MultiSourceSimulation(sources)
    return simulator.run_simulation(duration_hours, grid_resolution)

def export_kml(simulation_result: Dict, output_path: str = None) -> str:
    exporter = KMLExporter(simulation_result)
    return exporter.generate_animated_kml(output_path)
