import math
import numpy as np
from typing import Dict, List, Tuple
from dataclasses import dataclass
import json


@dataclass
class SunPosition:
    altitude: float
    azimuth: float
    zenith: float
    hour_angle: float
    declination: float


@dataclass
class SunlightResult:
    element_id: int
    ifc_id: str
    name: str
    ifc_type: str
    total_hours: float
    hourly_exposure: List[float]
    average_irradiance: float
    max_irradiance: float
    shadow_ratio: float
    exposure_level: str


def calculate_sun_position(latitude: float, longitude: float,
                           day_of_year: int, hour: float,
                           timezone_offset: float = 8.0) -> SunPosition:

    latitude_rad = math.radians(latitude)

    julian_day = day_of_year
    declination = 23.45 * math.sin(math.radians(360 / 365 * (julian_day - 81)))
    declination_rad = math.radians(declination)

    lstm = 15 * timezone_offset
    b = math.radians(360 / 365 * (julian_day - 81))
    eot = 9.87 * math.sin(2 * b) - 7.53 * math.cos(b) - 1.5 * math.sin(b)

    tc = 4 * (longitude - lstm) + eot
    lst = hour + tc / 60

    hour_angle = 15 * (lst - 12)
    hour_angle_rad = math.radians(hour_angle)

    sin_altitude = (math.sin(latitude_rad) * math.sin(declination_rad) +
                    math.cos(latitude_rad) * math.cos(declination_rad) * math.cos(hour_angle_rad))
    sin_altitude = max(-1.0, min(1.0, sin_altitude))
    altitude = math.degrees(math.asin(sin_altitude))

    cos_altitude = math.cos(math.radians(altitude))
    if cos_altitude > 1e-6:
        sin_azimuth = (-math.cos(declination_rad) * math.sin(hour_angle_rad) / cos_altitude)
        sin_azimuth = max(-1.0, min(1.0, sin_azimuth))
        cos_azimuth = ((math.sin(declination_rad) * math.cos(latitude_rad) -
                        math.cos(declination_rad) * math.sin(latitude_rad) * math.cos(hour_angle_rad)) / cos_altitude)
        cos_azimuth = max(-1.0, min(1.0, cos_azimuth))
        azimuth = math.degrees(math.atan2(sin_azimuth, cos_azimuth))
        if azimuth < 0:
            azimuth += 360
    else:
        azimuth = 180.0

    zenith = 90 - altitude

    return SunPosition(
        altitude=altitude,
        azimuth=azimuth,
        zenith=zenith,
        hour_angle=hour_angle,
        declination=declination,
    )


def get_sun_direction(sun: SunPosition) -> np.ndarray:
    alt_rad = math.radians(sun.altitude)
    az_rad = math.radians(sun.azimuth)

    x = math.cos(alt_rad) * math.sin(az_rad)
    y = math.cos(alt_rad) * math.cos(az_rad)
    z = math.sin(alt_rad)

    return np.array([x, y, z])


def calculate_solar_irradiance(sun: SunPosition,
                               direct_normal: float = 1000.0,
                               diffuse: float = 100.0) -> float:
    if sun.altitude <= 0:
        return 0.0

    m = 1 / max(0.01, math.sin(math.radians(sun.altitude)))

    direct = direct_normal * math.exp(-0.1 * m) * max(0, math.sin(math.radians(sun.altitude)))
    total = direct + diffuse

    return total


def ray_triangle_intersect(ray_origin: np.ndarray, ray_dir: np.ndarray,
                           v0: np.ndarray, v1: np.ndarray, v2: np.ndarray,
                           t_max: float = 1e6) -> bool:
    eps = 1e-8

    edge1 = v1 - v0
    edge2 = v2 - v0
    h = np.cross(ray_dir, edge2)
    a = np.dot(edge1, h)

    if abs(a) < eps:
        return False

    f = 1.0 / a
    s = ray_origin - v0
    u = f * np.dot(s, h)

    if u < 0.0 or u > 1.0:
        return False

    q = np.cross(s, edge1)
    v = f * np.dot(ray_dir, q)

    if v < 0.0 or u + v > 1.0:
        return False

    t = f * np.dot(edge2, q)

    return eps < t < t_max


def is_point_in_shadow(point: np.ndarray, sun_dir: np.ndarray,
                       all_vertices: np.ndarray, all_faces: np.ndarray,
                       self_face_indices: List[int] = None,
                       ray_offset: float = 0.01) -> bool:
    ray_origin = point + sun_dir * ray_offset

    for i, face in enumerate(all_faces):
        if self_face_indices and i in self_face_indices:
            continue

        v0 = all_vertices[face[0]]
        v1 = all_vertices[face[1]]
        v2 = all_vertices[face[2]]

        if ray_triangle_intersect(ray_origin, sun_dir, v0, v1, v2):
            return True

    return False


def calculate_element_exposure(element: Dict, sun: SunPosition,
                               all_vertices: np.ndarray, all_faces: np.ndarray,
                               element_face_start: int, element_face_count: int,
                               sample_density: float = 0.5) -> Tuple[float, float]:
    if sun.altitude <= 0:
        return 0.0, 0.0

    elem_verts = np.array(json.loads(element['vertices_json'])).reshape(-1, 3)

    if len(elem_verts) < 3:
        return 0.0, 0.0

    min_v = elem_verts.min(axis=0)
    max_v = elem_verts.max(axis=0)
    center = (min_v + max_v) / 2
    size = max_v - min_v

    sample_points = [center]

    for i in range(3):
        for offset in [-0.3, 0.3]:
            pt = center.copy()
            pt[i] += size[i] * offset
            sample_points.append(pt)

    sun_dir = get_sun_direction(sun)
    irradiance = calculate_solar_irradiance(sun)

    exposed_samples = 0
    for pt in sample_points:
        self_faces = list(range(element_face_start, element_face_start + element_face_count))
        if not is_point_in_shadow(pt, sun_dir, all_vertices, all_faces, self_faces):
            exposed_samples += 1

    exposure_ratio = exposed_samples / len(sample_points)
    incident_irradiance = irradiance * exposure_ratio

    return exposure_ratio, incident_irradiance


def analyze_sunlight(elements: List[Dict],
                     latitude: float = 31.23,
                     longitude: float = 121.47,
                     day_of_year: int = 172,
                     start_hour: int = 6,
                     end_hour: int = 18,
                     hour_step: float = 1.0) -> Dict:

    all_vertices = []
    all_faces = []
    element_face_ranges = []
    vertex_offset = 0
    face_offset = 0

    for elem in elements:
        verts = np.array(json.loads(elem['vertices_json'])).reshape(-1, 3)
        faces = np.array(json.loads(elem['faces_json'])).reshape(-1, 3)

        all_vertices.extend(verts)
        all_faces.extend(faces + vertex_offset)
        element_face_ranges.append((face_offset, len(faces)))
        face_offset += len(faces)
        vertex_offset += len(verts)

    all_vertices = np.array(all_vertices)
    all_faces = np.array(all_faces)

    hourly_data = []
    current_hour = start_hour

    while current_hour <= end_hour:
        sun = calculate_sun_position(latitude, longitude, day_of_year, current_hour)
        hourly_data.append({
            'hour': current_hour,
            'sun': sun,
        })
        current_hour += hour_step

    results = []
    for elem_idx, elem in enumerate(elements):
        face_start, face_count = element_face_ranges[elem_idx]

        hourly_exposure = []
        total_hours = 0.0
        total_irradiance = 0.0
        max_irradiance = 0.0
        total_ratio = 0.0

        for hd in hourly_data:
            ratio, irradiance = calculate_element_exposure(
                elem, hd['sun'], all_vertices, all_faces,
                face_start, face_count
            )

            hourly_exposure.append({
                'hour': hd['hour'],
                'exposure_ratio': round(ratio, 4),
                'irradiance': round(irradiance, 2),
                'sun_altitude': round(hd['sun'].altitude, 2),
                'sun_azimuth': round(hd['sun'].azimuth, 2),
            })

            total_hours += ratio * hour_step
            total_irradiance += irradiance * hour_step
            max_irradiance = max(max_irradiance, irradiance)
            total_ratio += ratio

        avg_irradiance = total_irradiance / max(1, (end_hour - start_hour))
        shadow_ratio = 1.0 - (total_ratio / max(1, len(hourly_data)))

        if total_hours >= 6:
            level = 'excellent'
        elif total_hours >= 4:
            level = 'good'
        elif total_hours >= 2:
            level = 'moderate'
        elif total_hours >= 0.5:
            level = 'poor'
        else:
            level = 'none'

        result = SunlightResult(
            element_id=elem['id'],
            ifc_id=elem['ifc_id'],
            name=elem['name'],
            ifc_type=elem['ifc_type'],
            total_hours=round(total_hours, 2),
            hourly_exposure=hourly_exposure,
            average_irradiance=round(avg_irradiance, 2),
            max_irradiance=round(max_irradiance, 2),
            shadow_ratio=round(shadow_ratio, 4),
            exposure_level=level,
        )
        results.append(result)

    sun_path = []
    for hd in hourly_data:
        sun_path.append({
            'hour': hd['hour'],
            'altitude': round(hd['sun'].altitude, 2),
            'azimuth': round(hd['sun'].azimuth, 2),
            'irradiance': round(calculate_solar_irradiance(hd['sun']), 2),
        })

    return {
        'metadata': {
            'latitude': latitude,
            'longitude': longitude,
            'day_of_year': day_of_year,
            'start_hour': start_hour,
            'end_hour': end_hour,
            'hour_step': hour_step,
        },
        'sun_path': sun_path,
        'results': [r.__dict__ for r in results],
        'summary': {
            'avg_hours': round(np.mean([r.total_hours for r in results]), 2),
            'excellent_count': sum(1 for r in results if r.exposure_level == 'excellent'),
            'good_count': sum(1 for r in results if r.exposure_level == 'good'),
            'moderate_count': sum(1 for r in results if r.exposure_level == 'moderate'),
            'poor_count': sum(1 for r in results if r.exposure_level == 'poor'),
            'none_count': sum(1 for r in results if r.exposure_level == 'none'),
        }
    }


def get_exposure_color(level: str) -> str:
    colors = {
        'excellent': '#4caf50',
        'good': '#8bc34a',
        'moderate': '#ffc107',
        'poor': '#ff9800',
        'none': '#f44336',
    }
    return colors.get(level, '#9e9e9e')
