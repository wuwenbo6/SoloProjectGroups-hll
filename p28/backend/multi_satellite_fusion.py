import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Tuple

SATELLITE_WEIGHTS = {
    'CYGNSS-01': 1.0,
    'CYGNSS-02': 1.0,
    'CYGNSS-03': 1.0,
    'CYGNSS-04': 1.0,
    'CYGNSS-05': 1.0,
    'CYGNSS-06': 1.0,
    'CYGNSS-07': 1.0,
    'CYGNSS-08': 1.0,
}

def calculate_distance_weight(distance_km, max_distance=50):
    if distance_km > max_distance:
        return 0.0
    return np.exp(-(distance_km ** 2) / (2 * (max_distance / 3) ** 2))

def calculate_time_weight(time_diff_hours, max_hours=6):
    if time_diff_hours > max_hours:
        return 0.0
    return np.exp(-(time_diff_hours ** 2) / (2 * (max_hours / 2) ** 2))

def calculate_snr_weight(snr, min_snr=5, optimal_snr=15):
    if snr < min_snr:
        return 0.1
    elif snr >= optimal_snr:
        return 1.0
    return (snr - min_snr) / (optimal_snr - min_snr)

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1_rad, lon1_rad = np.radians(lat1), np.radians(lon1)
    lat2_rad, lon2_rad = np.radians(lat2), np.radians(lon2)
    
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlon / 2) ** 2
    c = 2 * np.arcsin(np.sqrt(a))
    
    return R * c

def weighted_average_fusion(points: List[Dict], target_lat: float, target_lon: float, target_time: datetime = None) -> Dict:
    if len(points) == 0:
        return {'soil_moisture': 0.0, 'uncertainty': 0.0, 'n_points': 0}
    
    if target_time is None:
        target_time = datetime.now()
    
    weights = []
    values = []
    uncertainties = []
    
    for point in points:
        distance = haversine_distance(target_lat, target_lon, point['latitude'], point['longitude'])
        dist_weight = calculate_distance_weight(distance)
        
        point_time = point.get('timestamp', target_time)
        if isinstance(point_time, str):
            point_time = datetime.fromisoformat(point_time)
        time_diff = abs((point_time - target_time).total_seconds() / 3600)
        time_weight = calculate_time_weight(time_diff)
        
        snr_weight = calculate_snr_weight(point.get('snr', 10))
        sat_weight = SATELLITE_WEIGHTS.get(point.get('satellite', 'CYGNSS-01'), 1.0)
        
        total_weight = dist_weight * time_weight * snr_weight * sat_weight
        
        if total_weight > 0:
            weights.append(total_weight)
            values.append(point['soil_moisture'])
            uncertainties.append(0.05 / max(snr_weight, 0.1))
    
    if sum(weights) == 0:
        return {'soil_moisture': 0.0, 'uncertainty': 0.0, 'n_points': 0}
    
    weights = np.array(weights) / sum(weights)
    fused_value = np.sum(np.array(values) * weights)
    fused_uncertainty = np.sqrt(np.sum((np.array(uncertainties) * weights) ** 2))
    
    return {
        'soil_moisture': float(fused_value),
        'uncertainty': float(fused_uncertainty),
        'n_points': len(points),
        'weights': weights.tolist()
    }

def inverse_distance_weighting(points: List[Dict], grid_lats: np.ndarray, grid_lons: np.ndarray, power: float = 2) -> np.ndarray:
    n_lat, n_lon = len(grid_lats), len(grid_lons)
    result = np.full((n_lat, n_lon), np.nan)
    
    lats = np.array([p['latitude'] for p in points])
    lons = np.array([p['longitude'] for p in points])
    values = np.array([p['soil_moisture'] for p in points])
    
    for i, lat in enumerate(grid_lats):
        for j, lon in enumerate(grid_lons):
            distances = haversine_distance(lat, lon, lats, lons)
            distances = np.maximum(distances, 1e-6)
            
            weights = 1.0 / (distances ** power)
            weights[distances > 100] = 0
            
            if np.sum(weights) > 0:
                result[i, j] = np.sum(values * weights) / np.sum(weights)
    
    return result

def simple_kriging(points: List[Dict], grid_lats: np.ndarray, grid_lons: np.ndarray, variogram_range: float = 50) -> np.ndarray:
    n_lat, n_lon = len(grid_lats), len(grid_lons)
    result = np.full((n_lat, n_lon), np.nan)
    
    lats = np.array([p['latitude'] for p in points])
    lons = np.array([p['longitude'] for p in points])
    values = np.array([p['soil_moisture'] for p in points])
    n = len(values)
    
    if n < 3:
        return inverse_distance_weighting(points, grid_lats, grid_lons)
    
    mean_val = np.mean(values)
    values_centered = values - mean_val
    
    for i, lat in enumerate(grid_lats):
        for j, lon in enumerate(grid_lons):
            distances = haversine_distance(lat, lon, lats, lons)
            
            gamma = 1 - np.exp(-distances ** 2 / (2 * variogram_range ** 2))
            
            C = np.zeros((n, n))
            for k in range(n):
                for l in range(n):
                    d = haversine_distance(lats[k], lons[k], lats[l], lons[l])
                    C[k, l] = np.exp(-d ** 2 / (2 * variogram_range ** 2))
            
            c = np.exp(-distances ** 2 / (2 * variogram_range ** 2))
            
            try:
                weights = np.linalg.solve(C, c)
                result[i, j] = mean_val + np.sum(weights * values_centered)
            except np.linalg.LinAlgError:
                weights = c / np.sum(c) if np.sum(c) > 0 else np.ones(n) / n
                result[i, j] = mean_val + np.sum(weights * values_centered)
    
    return np.clip(result, 0, 0.6)

def fuse_multi_satellite_data(points: List[Dict], method: str = 'idw', **kwargs) -> Dict:
    if method == 'weighted_average':
        target_lat = kwargs.get('target_lat', np.mean([p['latitude'] for p in points]))
        target_lon = kwargs.get('target_lon', np.mean([p['longitude'] for p in points]))
        return weighted_average_fusion(points, target_lat, target_lon)
    
    elif method == 'idw':
        grid_res = kwargs.get('grid_res', 1.0)
        min_lat = kwargs.get('min_lat', np.min([p['latitude'] for p in points]))
        max_lat = kwargs.get('max_lat', np.max([p['latitude'] for p in points]))
        min_lon = kwargs.get('min_lon', np.min([p['longitude'] for p in points]))
        max_lon = kwargs.get('max_lon', np.max([p['longitude'] for p in points]))
        
        grid_lats = np.arange(min_lat, max_lat + grid_res, grid_res)
        grid_lons = np.arange(min_lon, max_lon + grid_res, grid_res)
        
        grid_data = inverse_distance_weighting(points, grid_lats, grid_lons, kwargs.get('power', 2))
        
        return {
            'method': 'idw',
            'grid_lats': grid_lats.tolist(),
            'grid_lons': grid_lons.tolist(),
            'soil_moisture_grid': grid_data.tolist(),
            'n_points': len(points)
        }
    
    elif method == 'kriging':
        grid_res = kwargs.get('grid_res', 1.0)
        min_lat = kwargs.get('min_lat', np.min([p['latitude'] for p in points]))
        max_lat = kwargs.get('max_lat', np.max([p['latitude'] for p in points]))
        min_lon = kwargs.get('min_lon', np.min([p['longitude'] for p in points]))
        max_lon = kwargs.get('max_lon', np.max([p['longitude'] for p in points]))
        
        grid_lats = np.arange(min_lat, max_lat + grid_res, grid_res)
        grid_lons = np.arange(min_lon, max_lon + grid_res, grid_res)
        
        grid_data = simple_kriging(points, grid_lats, grid_lons, kwargs.get('variogram_range', 50))
        
        return {
            'method': 'kriging',
            'grid_lats': grid_lats.tolist(),
            'grid_lons': grid_lons.tolist(),
            'soil_moisture_grid': grid_data.tolist(),
            'n_points': len(points)
        }
    
    else:
        raise ValueError(f"Unknown fusion method: {method}")
