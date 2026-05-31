import numpy as np
import math
from typing import List, Dict, Tuple, Optional
from shapely.geometry import Point, Polygon, LineString
from shapely.affinity import translate, rotate

class TSPPathPlanner:
    def __init__(self, placements: List[Dict], sheet_width: float, sheet_height: float):
        self.placements = placements
        self.sheet_width = sheet_width
        self.sheet_height = sheet_height
        self.num_parts = len(placements)
        
    def get_part_centroid(self, placement: Dict) -> Tuple[float, float]:
        points = placement['points']
        poly = Polygon(points)
        centroid = poly.centroid
        return (centroid.x, centroid.y)
    
    def get_part_entry_point(self, placement: Dict) -> Tuple[float, float]:
        points = placement['points']
        if points:
            return points[0]
        return (0, 0)
    
    def distance(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)
    
    def build_distance_matrix(self) -> np.ndarray:
        n = self.num_parts
        matrix = np.zeros((n + 1, n + 1))
        
        origin = (0, 0)
        
        for i in range(n):
            entry_i = self.get_part_entry_point(self.placements[i])
            centroid_i = self.get_part_centroid(self.placements[i])
            
            matrix[0][i + 1] = self.distance(origin, centroid_i)
            matrix[i + 1][0] = self.distance(centroid_i, origin)
            
            for j in range(n):
                if i != j:
                    centroid_j = self.get_part_centroid(self.placements[j])
                    matrix[i + 1][j + 1] = self.distance(centroid_i, centroid_j)
        
        return matrix
    
    def find_best_start_point(self, distance_matrix: np.ndarray) -> int:
        n = len(distance_matrix)
        if n <= 1:
            return 0
        
        min_dist = float('inf')
        best_start = 1
        
        for i in range(1, n):
            if distance_matrix[0][i] < min_dist:
                min_dist = distance_matrix[0][i]
                best_start = i
        
        return best_start
    
    def nearest_neighbor_tsp(self, distance_matrix: np.ndarray) -> List[int]:
        n = len(distance_matrix)
        if n <= 1:
            return [0]
        
        best_start = self.find_best_start_point(distance_matrix)
        
        best_path = None
        best_distance = float('inf')
        
        start_candidates = [best_start]
        for i in range(1, min(n, 5)):
            start_candidates.append(i)
        
        for start in start_candidates:
            visited = [False] * n
            path = [0]
            visited[0] = True
            
            if start != 0:
                path.append(start)
                visited[start] = True
            
            for _ in range(n - len(path)):
                current = path[-1]
                nearest = None
                nearest_dist = float('inf')
                
                for next_node in range(n):
                    if not visited[next_node] and distance_matrix[current][next_node] < nearest_dist:
                        nearest = next_node
                        nearest_dist = distance_matrix[current][next_node]
                
                if nearest is not None:
                    path.append(nearest)
                    visited[nearest] = True
            
            path.append(0)
            total_dist = self.calculate_total_distance(path, distance_matrix)
            
            if total_dist < best_distance:
                best_distance = total_dist
                best_path = path[:-1]
        
        return best_path if best_path else [0]
    
    def two_opt(self, path: List[int], distance_matrix: np.ndarray) -> List[int]:
        best = path.copy()
        improved = True
        iterations = 0
        
        while improved and iterations < 100:
            improved = False
            iterations += 1
            
            for i in range(1, len(best) - 2):
                for j in range(i + 1, len(best) - 1):
                    old_distance = (
                        distance_matrix[best[i - 1]][best[i]] +
                        distance_matrix[best[j]][best[j + 1]]
                    )
                    new_distance = (
                        distance_matrix[best[i - 1]][best[j]] +
                        distance_matrix[best[i]][best[j + 1]]
                    )
                    
                    if new_distance < old_distance:
                        best[i:j + 1] = reversed(best[i:j + 1])
                        improved = True
        
        return best
    
    def calculate_total_distance(self, path: List[int], distance_matrix: np.ndarray) -> float:
        total = 0
        for i in range(len(path) - 1):
            total += distance_matrix[path[i]][path[i + 1]]
        return total
    
    def check_burn_conflict(self, part1_idx: int, part2_idx: int, min_distance: float = 5.0) -> bool:
        if part1_idx < 0 or part2_idx < 0:
            return False
            
        poly1 = Polygon(self.placements[part1_idx]['points'])
        poly2 = Polygon(self.placements[part2_idx]['points'])
        
        distance = poly1.distance(poly2)
        
        if distance < min_distance:
            return True
        
        return False
    
    def get_heat_affected_zone_cost(self, path: List[int], heat_zone_distance: float = 20.0) -> float:
        cost = 0
        for i in range(1, len(path) - 1):
            for j in range(max(1, i - 3), i):
                part_i = path[i] - 1
                part_j = path[j] - 1
                if part_i >= 0 and part_j >= 0:
                    if self.check_burn_conflict(part_i, part_j, heat_zone_distance):
                        cost += (heat_zone_distance * 10)
        return cost
    
    def nearest_neighbor_tsp_with_heat_zone(self, distance_matrix: np.ndarray, 
                                              heat_zone_distance: float = 20.0,
                                              heat_penalty: float = 5.0) -> List[int]:
        n = len(distance_matrix)
        if n <= 1:
            return [0]
        
        best_start = self.find_best_start_point(distance_matrix)
        best_path = None
        best_total_cost = float('inf')
        
        start_candidates = [best_start]
        for i in range(1, min(n, 5)):
            start_candidates.append(i)
        
        for start in start_candidates:
            visited = [False] * n
            path = [0]
            visited[0] = True
            
            if start != 0:
                path.append(start)
                visited[start] = True
            
            for _ in range(n - len(path)):
                current = path[-1]
                best_next = None
                best_cost = float('inf')
                
                for next_node in range(n):
                    if not visited[next_node]:
                        travel_cost = distance_matrix[current][next_node]
                        
                        heat_cost = 0
                        for recent in path[max(1, len(path) - 3):]:
                            if next_node > 0 and recent > 0:
                                if self.check_burn_conflict(next_node - 1, recent - 1, heat_zone_distance):
                                    heat_cost += heat_zone_distance * heat_penalty
                        
                        total_cost = travel_cost + heat_cost
                        
                        if total_cost < best_cost:
                            best_cost = total_cost
                            best_next = next_node
                
                if best_next is not None:
                    path.append(best_next)
                    visited[best_next] = True
            
            path.append(0)
            travel_dist = self.calculate_total_distance(path, distance_matrix)
            heat_cost = self.get_heat_affected_zone_cost(path, heat_zone_distance)
            total_cost = travel_dist + heat_cost
            
            if total_cost < best_total_cost:
                best_total_cost = total_cost
                best_path = path[:-1]
        
        return best_path if best_path else [0]
    
    def two_opt_with_heat_zone(self, path: List[int], distance_matrix: np.ndarray,
                                heat_zone_distance: float = 20.0,
                                heat_penalty: float = 5.0) -> List[int]:
        best = path.copy()
        improved = True
        iterations = 0
        
        while improved and iterations < 100:
            improved = False
            iterations += 1
            
            for i in range(1, len(best) - 2):
                for j in range(i + 1, len(best) - 1):
                    old_travel = (
                        distance_matrix[best[i - 1]][best[i]] +
                        distance_matrix[best[j]][best[j + 1]]
                    )
                    new_travel = (
                        distance_matrix[best[i - 1]][best[j]] +
                        distance_matrix[best[i]][best[j + 1]]
                    )
                    
                    new_path = best.copy()
                    new_path[i:j + 1] = reversed(new_path[i:j + 1])
                    
                    old_heat = self.get_heat_affected_zone_cost(best, heat_zone_distance)
                    new_heat = self.get_heat_affected_zone_cost(new_path, heat_zone_distance)
                    
                    old_total = old_travel + old_heat * heat_penalty
                    new_total = new_travel + new_heat * heat_penalty
                    
                    if new_total < old_total:
                        best = new_path
                        improved = True
        
        return best
    
    def resolve_burn_conflicts(self, order: List[int], min_safe_distance: float = 5.0, 
                                min_recent_distance: float = 30.0,
                                recent_count: int = 3) -> List[int]:
        resolved = order.copy()
        conflicts_resolved = 0
        
        for i in range(len(resolved) - 1):
            for j in range(i + 1, min(i + recent_count + 1, len(resolved))):
                if j - i <= recent_count:
                    if resolved[i] > 0 and resolved[j] > 0:
                        if self.check_burn_conflict(resolved[i] - 1, resolved[j] - 1, min_recent_distance):
                            for k in range(j + 1, len(resolved)):
                                if resolved[k] > 0:
                                    if not self.check_burn_conflict(resolved[i] - 1, resolved[k] - 1, min_recent_distance):
                                        resolved[j], resolved[k] = resolved[k], resolved[j]
                                        conflicts_resolved += 1
                                        break
        
        return resolved, conflicts_resolved
    
    def optimize_cutting_path(self, min_safe_distance: float = 5.0,
                               heat_zone_distance: float = 25.0,
                               heat_penalty: float = 3.0,
                               enable_heat_zone: bool = True) -> Dict:
        if self.num_parts == 0:
            return {
                'cutting_order': [],
                'total_travel_distance': 0,
                'path_coordinates': [(0, 0)],
                'conflicts_resolved': 0,
                'heat_zone_enabled': enable_heat_zone,
                'placements': self.placements
            }
        
        distance_matrix = self.build_distance_matrix()
        
        if enable_heat_zone:
            nn_path = self.nearest_neighbor_tsp_with_heat_zone(
                distance_matrix, heat_zone_distance, heat_penalty
            )
            optimized_path = self.two_opt_with_heat_zone(
                nn_path, distance_matrix, heat_zone_distance, heat_penalty
            )
        else:
            nn_path = self.nearest_neighbor_tsp(distance_matrix)
            optimized_path = self.two_opt(nn_path, distance_matrix)
        
        total_distance = self.calculate_total_distance(optimized_path, distance_matrix)
        
        resolved_order, conflicts_resolved = self.resolve_burn_conflicts(
            [idx for idx in optimized_path], min_safe_distance, heat_zone_distance
        )
        
        final_part_order = [idx - 1 for idx in resolved_order if idx > 0]
        
        path_coords = [(0, 0)]
        for part_idx in final_part_order:
            if 0 <= part_idx < self.num_parts:
                entry_point = self.get_part_entry_point(self.placements[part_idx])
                path_coords.append(entry_point)
        
        path_coords.append((0, 0))
        
        for i, part_idx in enumerate(final_part_order):
            if 0 <= part_idx < self.num_parts:
                self.placements[part_idx]['cutting_order'] = i
        
        heat_zone_violations = self.get_heat_affected_zone_cost(resolved_order + [0], heat_zone_distance) if enable_heat_zone else 0
        
        return {
            'cutting_order': final_part_order,
            'total_travel_distance': total_distance,
            'path_coordinates': path_coords,
            'conflicts_resolved': conflicts_resolved,
            'heat_zone_enabled': enable_heat_zone,
            'heat_zone_violations': heat_zone_violations,
            'placements': self.placements
        }

def optimize_cutting_path(placements: List[Dict], sheet_width: float, sheet_height: float, **kwargs) -> Dict:
    planner = TSPPathPlanner(placements, sheet_width, sheet_height)
    return planner.optimize_cutting_path(**kwargs)
