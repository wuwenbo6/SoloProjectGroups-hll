import os
import numpy as np
from scipy.interpolate import griddata, Rbf


class SimpleSimulator:
    def __init__(self):
        self.base_path = os.path.dirname(os.path.abspath(__file__))
        
        self.terrain_data = self._generate_terrain_data()
        
    def _generate_terrain_data(self):
        node_coords = {
            'J1': (116.397, 39.908),
            'J2': (116.403, 39.908),
            'J3': (116.400, 39.903),
            'J4': (116.394, 39.900),
            'J5': (116.406, 39.900),
            'J6': (116.397, 39.895),
            'J7': (116.403, 39.892),
            'J8': (116.400, 39.887),
            'OUT1': (116.400, 39.882)
        }
        
        terrain_elevations = {
            'J1': 52.5,
            'J2': 51.8,
            'J3': 48.2,
            'J4': 49.5,
            'J5': 47.8,
            'J6': 45.2,
            'J7': 43.8,
            'J8': 42.1,
            'OUT1': 40.5
        }
        
        return {
            'coords': node_coords,
            'elevations': terrain_elevations
        }
    
    def get_elevation(self, lon, lat):
        lons = [coord[0] for coord in self.terrain_data['coords'].values()]
        lats = [coord[1] for coord in self.terrain_data['coords'].values()]
        elevs = list(self.terrain_data['elevations'].values())
        
        distances = []
        weights = []
        
        for node_lon, node_lat, elev in zip(lons, lats, elevs):
            dist = np.sqrt((lon - node_lon)**2 + (lat - node_lat)**2)
            if dist < 1e-10:
                return elev
            distances.append(dist)
            weights.append(1.0 / (dist ** 2))
        
        total_weight = sum(weights)
        interpolated_elev = sum(w * e for w, e in zip(weights, elevs)) / total_weight
        
        return interpolated_elev
    
    def generate_rainfall_series(self, return_period, duration_hours=24, timestep_min=5):
        n_steps = int(duration_hours * 60 / timestep_min)
        time_points = np.arange(n_steps) * timestep_min / 60
        
        if return_period == 2:
            peak_intensity = 20.0
            a, b = 15.0, 0.6
        elif return_period == 50:
            peak_intensity = 80.0
            a, b = 60.0, 0.5
        else:
            raise ValueError("Unsupported return period")
        
        t_peak = duration_hours * 0.3
        rainfall = np.zeros(n_steps)
        
        for i, t in enumerate(time_points):
            if t <= t_peak:
                rainfall[i] = peak_intensity * (t / t_peak) ** b
            else:
                rainfall[i] = peak_intensity * np.exp(-a * (t - t_peak) / duration_hours)
        
        return rainfall, time_points
    
    def calculate_flooding(self, return_period, node_id, rainfall_intensity, cumulative_rain):
        base_flood = {
            'J1': 0.15, 'J2': 0.08, 'J3': 0.35, 'J4': 0.20,
            'J5': 0.12, 'J6': 0.45, 'J7': 0.38, 'J8': 0.55
        }.get(node_id, 0.2)
        
        elevation = self.terrain_data['elevations'].get(node_id, 50.0)
        
        elevation_factor = 1.0 + (50.0 - elevation) / 20.0
        elevation_factor = max(0.5, min(2.0, elevation_factor))
        
        rain_factor = min(cumulative_rain / 50.0, 2.0)
        
        period_factor = return_period / 2.0
        
        intensity_factor = 1.0 + rainfall_intensity / 40.0
        
        flooding = base_flood * elevation_factor * rain_factor * np.sqrt(period_factor) * intensity_factor
        
        return max(0.0, flooding)
    
    def run_simulation(self, return_period):
        node_coords = self.terrain_data['coords']
        
        rainfall, times = self.generate_rainfall_series(return_period)
        
        cumulative_rain = np.zeros_like(rainfall)
        for i in range(1, len(rainfall)):
            cumulative_rain[i] = cumulative_rain[i-1] + rainfall[i] * 5 / 60
        
        results = {
            'return_period': return_period,
            'nodes': [],
            'max_flooding': []
        }
        
        max_flood_dict = {}
        
        for step_idx, rain_intensity in enumerate(rainfall):
            hour = int(step_idx * 5 / 60)
            minute = (step_idx * 5) % 60
            time_str = f"2024-01-01 {hour:02d}:{minute:02d}:00"
            
            for node_id, (lon, lat) in node_coords.items():
                if node_id == 'OUT1':
                    continue
                    
                flooding = self.calculate_flooding(
                    return_period, node_id, 
                    rain_intensity, cumulative_rain[step_idx]
                )
                depth = flooding * 1.8 + 0.3
                elevation = self.terrain_data['elevations'].get(node_id, 50.0)
                
                node_data = {
                    'node_id': node_id,
                    'time': time_str,
                    'depth': float(depth),
                    'flooding': float(flooding),
                    'elevation': float(elevation),
                    'lon': lon,
                    'lat': lat
                }
                
                results['nodes'].append(node_data)
                
                if node_id not in max_flood_dict or flooding > max_flood_dict[node_id]['flooding']:
                    max_flood_dict[node_id] = node_data
        
        results['max_flooding'] = list(max_flood_dict.values())
        
        return results
    
    def generate_depth_points(self, results, grid_size=30):
        max_flooding = results['max_flooding']
        
        lons = [p['lon'] for p in max_flooding]
        lats = [p['lat'] for p in max_flooding]
        floodings = [p['flooding'] for p in max_flooding]
        elevations = [p['elevation'] for p in max_flooding]
        
        min_lon, max_lon = min(lons), max(lons)
        min_lat, max_lat = min(lats), max(lats)
        
        lon_range = max_lon - min_lon
        lat_range = max_lat - min_lat
        buffer_lon = lon_range * 0.15
        buffer_lat = lat_range * 0.15
        min_lon -= buffer_lon
        max_lon += buffer_lon
        min_lat -= buffer_lat
        max_lat += buffer_lat
        
        grid_lons = np.linspace(min_lon, max_lon, grid_size)
        grid_lats = np.linspace(min_lat, max_lat, grid_size)
        
        depth_points = []
        
        points = np.array([[lon, lat] for lon, lat in zip(lons, lats)])
        
        rbf_flood = Rbf(points[:, 0], points[:, 1], floodings, 
                        function='multiquadric', smooth=0.001)
        rbf_elev = Rbf(points[:, 0], points[:, 1], elevations, 
                       function='multiquadric', smooth=0.001)
        
        for i, glon in enumerate(grid_lons):
            for j, glat in enumerate(grid_lats):
                interpolated_flood = float(rbf_flood(glon, glat))
                interpolated_elev = float(rbf_elev(glon, glat))
                
                dist_to_nearest = np.min(np.sqrt(
                    (points[:, 0] - glon)**2 + (points[:, 1] - glat)**2
                ))
                distance_decay = np.exp(-dist_to_nearest * 800)
                
                final_depth = max(0.0, interpolated_flood * distance_decay)
                
                if final_depth > 0.005:
                    depth_points.append({
                        'lon': float(glon),
                        'lat': float(glat),
                        'depth': float(final_depth),
                        'elevation': float(interpolated_elev)
                    })
        
        return depth_points
