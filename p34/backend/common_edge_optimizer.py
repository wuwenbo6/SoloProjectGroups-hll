import math
from typing import List, Dict, Tuple, Set
from shapely.geometry import Polygon, LineString
from shapely.ops import nearest_points
from collections import defaultdict


class CommonEdgeOptimizer:
    def __init__(self, placements: List[Dict], tolerance: float = 0.5):
        self.placements = placements
        self.tolerance = tolerance
        self.common_edges = []
        self.part_polygons = []
        
        for p in placements:
            points = p.get('points', [])
            if len(points) >= 3:
                self.part_polygons.append({
                    'part_id': p.get('part_id'),
                    'polygon': Polygon(points),
                    'index': len(self.part_polygons),
                    'cutting_order': p.get('cutting_order', len(self.part_polygons))
                })
    
    def get_edges(self, polygon: Polygon) -> List[Tuple[Tuple[float, float], Tuple[float, float]]]:
        coords = list(polygon.exterior.coords)
        edges = []
        for i in range(len(coords) - 1):
            p1 = coords[i]
            p2 = coords[i + 1]
            edges.append((p1, p2))
        return edges
    
    def edge_length(self, edge: Tuple[Tuple[float, float], Tuple[float, float]]) -> float:
        (x1, y1), (x2, y2) = edge
        return math.sqrt((x2 - x1)**2 + (y2 - y1)**2)
    
    def edges_are_common(self, edge1: Tuple, edge2: Tuple) -> Tuple[bool, float]:
        (a1, a2), (b1, b2) = edge1, edge2
        
        dist_a1b1 = math.sqrt((a1[0] - b1[0])**2 + (a1[1] - b1[1])**2)
        dist_a2b2 = math.sqrt((a2[0] - b2[0])**2 + (a2[1] - b2[1])**2)
        
        if dist_a1b1 < self.tolerance and dist_a2b2 < self.tolerance:
            return True, self.edge_length(edge1)
        
        dist_a1b2 = math.sqrt((a1[0] - b2[0])**2 + (a1[1] - b2[1])**2)
        dist_a2b1 = math.sqrt((a2[0] - b1[0])**2 + (a2[1] - b1[1])**2)
        
        if dist_a1b2 < self.tolerance and dist_a2b1 < self.tolerance:
            return True, self.edge_length(edge1)
        
        return False, 0
    
    def find_common_edges(self) -> List[Dict]:
        common_edges = []
        
        for i, part1 in enumerate(self.part_polygons):
            edges1 = self.get_edges(part1['polygon'])
            
            for j, part2 in enumerate(self.part_polygons[i+1:], start=i+1):
                edges2 = self.get_edges(part2['polygon'])
                
                for e1_idx, e1 in enumerate(edges1):
                    for e2_idx, e2 in enumerate(edges2):
                        is_common, length = self.edges_are_common(e1, e2)
                        if is_common and length > self.tolerance * 2:
                            common_edges.append({
                                'part1_index': i,
                                'part2_index': j,
                                'part1_id': part1['part_id'],
                                'part2_id': part2['part_id'],
                                'edge1_index': e1_idx,
                                'edge2_index': e2_idx,
                                'edge_coords': e1,
                                'length': length
                            })
        
        self.common_edges = common_edges
        return common_edges
    
    def calculate_savings(self) -> Dict:
        total_cutting_length = 0
        common_edge_length = 0
        edge_skip_map = defaultdict(set)
        
        for ce in self.common_edges:
            common_edge_length += ce['length']
            edge_skip_map[ce['part1_index']].add(ce['edge1_index'])
            edge_skip_map[ce['part2_index']].add(ce['edge2_index'])
        
        for part in self.part_polygons:
            total_cutting_length += part['polygon'].length
        
        savings = common_edge_length / 2
        savings_percent = (savings / total_cutting_length * 100) if total_cutting_length > 0 else 0
        
        return {
            'total_common_edges': len(self.common_edges),
            'common_edge_length': common_edge_length,
            'total_cutting_length': total_cutting_length,
            'savings': savings,
            'savings_percent': savings_percent,
            'edge_skip_map': dict(edge_skip_map)
        }
    
    def optimize_cutting_path(self) -> Dict:
        common_edges = self.find_common_edges()
        savings = self.calculate_savings()
        
        optimized_placements = []
        for idx, part in enumerate(self.part_polygons):
            coords = list(part['polygon'].exterior.coords)
            edges_to_skip = savings['edge_skip_map'].get(idx, set())
            
            optimized_path = []
            for i in range(len(coords) - 1):
                if i not in edges_to_skip:
                    optimized_path.append(coords[i])
                else:
                    if optimized_path:
                        optimized_path.append(coords[i])
            
            if optimized_path:
                optimized_path.append(optimized_path[0])
            
            optimized_placements.append({
                'part_id': part['part_id'],
                'original_points': coords,
                'optimized_points': optimized_path if optimized_path else coords,
                'skipped_edges': list(edges_to_skip),
                'cutting_order': part['cutting_order']
            })
        
        return {
            'common_edges': common_edges,
            'savings': savings,
            'optimized_placements': optimized_placements
        }


def optimize_common_edges(placements: List[Dict], tolerance: float = 0.5) -> Dict:
    optimizer = CommonEdgeOptimizer(placements, tolerance)
    return optimizer.optimize_cutting_path()
