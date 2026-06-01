import numpy as np
from shapely.geometry import Polygon
from typing import List, Dict, Any, Tuple, Optional


class MeasurementService:
    @staticmethod
    def calculate_area(
        points: List[Dict[str, float]],
        pixel_spacing: Tuple[float, float]
    ) -> float:
        if len(points) < 3:
            return 0.0

        coords = [(p['x'], p['y']) for p in points]
        
        if coords[0] != coords[-1]:
            coords.append(coords[0])

        try:
            polygon = Polygon(coords)
            if not polygon.is_valid:
                polygon = polygon.buffer(0)
            
            area_pixels = polygon.area
            area_mm2 = area_pixels * pixel_spacing[0] * pixel_spacing[1]
            
            return float(area_mm2)
        except Exception as e:
            print(f"Error calculating area: {e}")
            return 0.0

    @staticmethod
    def calculate_volume(
        contours: List[Dict[str, Any]],
        pixel_spacing: Tuple[float, float],
        slice_thickness: float
    ) -> float:
        if len(contours) < 1:
            return 0.0

        contour_areas = []
        for contour in contours:
            points = contour.get('points', [])
            if len(points) >= 3:
                area = MeasurementService.calculate_area(points, pixel_spacing)
                contour_areas.append((contour.get('sliceIndex', 0), area))

        if len(contour_areas) == 0:
            return 0.0

        contour_areas.sort(key=lambda x: x[0])
        areas = [a for _, a in contour_areas]
        slice_indices = [idx for idx, _ in contour_areas]

        if len(areas) == 1:
            volume = areas[0] * slice_thickness
        else:
            volume = 0.0
            for i in range(len(areas) - 1):
                idx_diff = abs(slice_indices[i + 1] - slice_indices[i])
                distance = idx_diff * slice_thickness
                area1 = areas[i]
                area2 = areas[i + 1]
                volume += (area1 + area2) / 2 * distance

        return float(volume)

    @staticmethod
    def calculate_centroid(
        points: List[Dict[str, float]]
    ) -> Optional[Tuple[float, float]]:
        if len(points) < 3:
            return None

        coords = [(p['x'], p['y']) for p in points]
        if coords[0] != coords[-1]:
            coords.append(coords[0])

        try:
            polygon = Polygon(coords)
            if not polygon.is_valid:
                polygon = polygon.buffer(0)
            
            centroid = polygon.centroid
            return (float(centroid.x), float(centroid.y))
        except Exception as e:
            print(f"Error calculating centroid: {e}")
            return None

    @staticmethod
    def calculate_perimeter(
        points: List[Dict[str, float]],
        pixel_spacing: Tuple[float, float]
    ) -> float:
        if len(points) < 2:
            return 0.0

        coords = [(p['x'], p['y']) for p in points]
        if coords[0] != coords[-1]:
            coords.append(coords[0])

        try:
            polygon = Polygon(coords)
            if not polygon.is_valid:
                polygon = polygon.buffer(0)
            
            perimeter_pixels = polygon.length
            perimeter_mm = perimeter_pixels * np.mean(pixel_spacing)
            
            return float(perimeter_mm)
        except Exception as e:
            print(f"Error calculating perimeter: {e}")
            return 0.0
