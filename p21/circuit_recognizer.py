import cv2
import numpy as np
import os
from config import Config
from ocr_engine.image_processor import ImageProcessor
from ocr_engine.component_recognizer import ComponentRecognizer
from graph_builder.wire_analyzer import WireAnalyzer
from graph_builder.circuit_graph import CircuitGraph
from spice_generator.netlist_generator import NetlistGenerator
from auto_router.manhattan_router import ManhattanRouter
from error_detector.circuit_validator import CircuitValidator

class CircuitRecognizer:
    def __init__(self):
        Config.ensure_dirs()
        self.image_processor = ImageProcessor()
        self.component_recognizer = ComponentRecognizer()
        self.wire_analyzer = WireAnalyzer()
        self.circuit_graph = CircuitGraph()
        self.netlist_generator = NetlistGenerator()
        self.auto_router = ManhattanRouter()
        self.validator = CircuitValidator()
    
    def process_image(self, image_path):
        original_img, gray_img, cleaned_img = self.image_processor.preprocess(image_path)
        
        components = self.image_processor.detect_components(cleaned_img)
        
        wires_img = self.image_processor.detect_wires(cleaned_img)
        
        components_data = {}
        for comp in components:
            comp_img = self.image_processor.extract_component_image(original_img, comp)
            classification = self.component_recognizer.classify_component(comp, comp_img)
            
            comp_data = {
                'id': comp['id'],
                'x': comp['x'],
                'y': comp['y'],
                'width': comp['width'],
                'height': comp['height'],
                'area': comp['area'],
                'centroid': comp['centroid'],
                'type': classification['type'],
                'confidence': classification['confidence'],
                'text': classification['text'],
                'pin_count': classification['pin_count'],
                'features': classification['features']
            }
            components_data[comp['id']] = comp_data
            
            self.circuit_graph.add_component(
                comp['id'],
                classification['type'],
                comp_data
            )
        
        connection_points = self.wire_analyzer.find_connection_points(
            components, wires_img
        )
        
        self._build_connections(components, connection_points, wires_img)
        
        connections_list = self._get_connections_list()
        
        spice_netlist = self.netlist_generator.generate_detailed_netlist(
            self.circuit_graph, components_data
        )
        
        routing_suggestions = self.auto_router.generate_routing_suggestions(
            list(components_data.values()), wires_img
        )
        
        validation_result = self.validator.validate_circuit(
            list(components_data.values()), connections_list, wires_img, original_img
        )
        
        visualization_path = self._create_visualization(
            original_img, components_data, wires_img, connection_points
        )
        
        error_highlight_path = self._create_error_highlight(
            original_img, validation_result['errors']
        )
        
        result = {
            'components': list(components_data.values()),
            'connections': connections_list,
            'spice_netlist': spice_netlist,
            'visualization_path': visualization_path,
            'error_highlight_path': error_highlight_path,
            'component_count': len(components_data),
            'wiring_count': len(connection_points) // 2,
            'routing_suggestions': routing_suggestions,
            'validation': validation_result
        }
        
        return result
    
    def _create_error_highlight(self, original_img, errors):
        highlighted = self.validator.draw_error_highlights(original_img, errors)
        
        output_filename = f"errors_{os.urandom(4).hex()}.png"
        output_path = os.path.join(Config.OUTPUT_DIR, output_filename)
        cv2.imwrite(output_path, highlighted)
        
        return output_path
    
    def _build_connections(self, components, connection_points, wires_img):
        comp_connections = {}
        
        junction_points = [cp for cp in connection_points if cp.get('is_junction', False)]
        component_points = [cp for cp in connection_points if not cp.get('is_junction', False)]
        
        comp_to_junctions = self._find_component_to_junctions(
            component_points, junction_points, wires_img
        )
        
        junction_to_comps = self._group_comps_by_junction(comp_to_junctions)
        
        for junction_id, comps in junction_to_comps.items():
            for i, comp1 in enumerate(comps):
                for comp2 in comps[i+1:]:
                    if comp1 != comp2:
                        self.circuit_graph.connect(
                            comp1, f'via_junction_{junction_id}',
                            comp2, f'via_junction_{junction_id}'
                        )
        
        for comp in components:
            comp_id = comp['id']
            comp_connections[comp_id] = []
            
            comp_points = [
                cp for cp in component_points 
                if cp['component_id'] == comp_id
            ]
            
            for other_comp in components:
                if other_comp['id'] == comp_id:
                    continue
                
                other_points = [
                    cp for cp in component_points 
                    if cp['component_id'] == other_comp['id']
                ]
                
                already_connected = self.circuit_graph.graph.has_edge(comp_id, other_comp['id'])
                if not already_connected and self._are_connected(comp_points, other_points, wires_img, junction_points):
                    self.circuit_graph.connect(
                        comp_id, 'direct',
                        other_comp['id'], 'direct'
                    )
                    comp_connections[comp_id].append(other_comp['id'])
    
    def _find_component_to_junctions(self, component_points, junction_points, wires_img):
        comp_to_junctions = []
        
        for cp in component_points:
            comp_id = cp['component_id']
            comp_pos = cp['position']
            
            for jp in junction_points:
                jp_pos = jp['position']
                dist = np.sqrt(
                    (comp_pos[0] - jp_pos[0])**2 +
                    (comp_pos[1] - jp_pos[1])**2
                )
                
                if dist < 300:
                    if self._check_path_bfs(wires_img, comp_pos, jp_pos):
                        comp_to_junctions.append({
                            'component_id': comp_id,
                            'junction_id': id(jp),
                            'junction_pos': jp_pos
                        })
        
        return comp_to_junctions
    
    def _group_comps_by_junction(self, comp_to_junctions):
        junction_to_comps = {}
        
        for item in comp_to_junctions:
            jp_id = item['junction_id']
            if jp_id not in junction_to_comps:
                junction_to_comps[jp_id] = []
            junction_to_comps[jp_id].append(item['component_id'])
        
        return {k: list(set(v)) for k, v in junction_to_comps.items() if len(set(v)) >= 2}
    
    def _are_connected(self, points1, points2, wires_img, junction_points):
        jp_positions = [jp['position'] for jp in junction_points]
        
        for p1 in points1:
            for p2 in points2:
                dist = np.sqrt(
                    (p1['position'][0] - p2['position'][0])**2 +
                    (p1['position'][1] - p2['position'][1])**2
                )
                if dist < 400:
                    if self._check_path_bfs(wires_img, p1['position'], p2['position'], jp_positions):
                        return True
        return False
    
    def _check_path_bfs(self, wires_img, start, end, forbidden_points=None, max_distance=500):
        from collections import deque
        
        h, w = wires_img.shape
        start_x, start_y = int(start[0]), int(start[1])
        end_x, end_y = int(end[0]), int(end[1])
        
        if not (0 <= start_x < w and 0 <= start_y < h):
            return False
        if not (0 <= end_x < w and 0 <= end_y < h):
            return False
        
        if wires_img[start_y, start_x] < 127 or wires_img[end_y, end_x] < 127:
            return False
        
        queue = deque()
        queue.append((start_x, start_y, 0))
        visited = set()
        visited.add((start_x, start_y))
        
        forbidden = set()
        if forbidden_points:
            for fp in forbidden_points:
                fx, fy = int(fp[0]), int(fp[1])
                dist_to_start = np.sqrt((fx - start_x)**2 + (fy - start_y)**2)
                dist_to_end = np.sqrt((fx - end_x)**2 + (fy - end_y)**2)
                if dist_to_start > 20 and dist_to_end > 20:
                    forbidden.add((fx, fy))
        
        directions = [
            (1, 0), (-1, 0), (0, 1), (0, -1),
            (1, 1), (-1, -1), (1, -1), (-1, 1)
        ]
        
        while queue:
            x, y, dist = queue.popleft()
            
            if dist > max_distance:
                continue
            
            if abs(x - end_x) <= 8 and abs(y - end_y) <= 8:
                return True
            
            for dx, dy in directions:
                nx, ny = x + dx, y + dy
                
                if (nx, ny) in visited:
                    continue
                if (nx, ny) in forbidden:
                    continue
                
                if 0 <= nx < w and 0 <= ny < h:
                    if wires_img[ny, nx] > 127:
                        visited.add((nx, ny))
                        queue.append((nx, ny, dist + 1))
        
        return False
    
    def _check_path(self, wires_img, start, end, step=5):
        return self._check_path_bfs(wires_img, start, end)
    
    def _get_connections_list(self):
        connections = []
        seen = set()
        
        for u, v, data in self.circuit_graph.graph.edges(data=True):
            key = tuple(sorted([str(u), str(v)]))
            if key not in seen:
                seen.add(key)
                connections.append({
                    'from': u,
                    'to': v,
                    'data': data
                })
        
        return connections
    
    def _create_visualization(self, original_img, components_data, wires_img, connection_points):
        vis_img = original_img.copy()
        
        for comp_id, comp in components_data.items():
            x, y, w, h = comp['x'], comp['y'], comp['width'], comp['height']
            
            color = self._get_type_color(comp['type'])
            cv2.rectangle(vis_img, (x, y), (x + w, y + h), color, 2)
            
            label = f"{comp['type']} ({comp['confidence']:.2f})"
            cv2.putText(vis_img, label, (x, y - 10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
            
            if comp.get('rotation_angle', 0) != 0:
                angle_label = f"rot: {comp['rotation_angle']}°"
                cv2.putText(vis_img, angle_label, (x, y - 25),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
            
            if comp.get('pin_positions'):
                for pin in comp['pin_positions']:
                    pin_x, pin_y = pin['position']
                    abs_pin_x = x + pin_x
                    abs_pin_y = y + pin_y
                    
                    pin_num = pin.get('pin_number', '')
                    if pin_num:
                        cv2.circle(vis_img, (abs_pin_x, abs_pin_y), 6, (0, 165, 255), -1)
                        cv2.putText(vis_img, str(pin_num), 
                                    (abs_pin_x + 8, abs_pin_y + 4),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 165, 255), 1)
            
            if comp['text']:
                cv2.putText(vis_img, comp['text'][:20], (x, y + h + 15),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 0, 255), 1)
        
        for cp in connection_points:
            x, y = cp['position']
            if cp.get('is_junction', False):
                j_type = cp.get('junction_type', 'unknown')
                if j_type == 'crossing':
                    cv2.circle(vis_img, (int(x), int(y)), 8, (0, 0, 255), -1)
                    cv2.putText(vis_img, 'X', (int(x) - 5, int(y) + 4),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
                else:
                    cv2.circle(vis_img, (int(x), int(y)), 6, (255, 165, 0), -1)
            else:
                cv2.circle(vis_img, (int(x), int(y)), 4, (0, 255, 0), -1)
        
        wires_colored = cv2.cvtColor(wires_img, cv2.GRAY2BGR)
        wires_colored[wires_img > 0] = [0, 255, 255]
        
        vis_img = cv2.addWeighted(vis_img, 0.85, wires_colored, 0.15, 0)
        
        output_filename = f"vis_{os.urandom(4).hex()}.png"
        output_path = os.path.join(Config.OUTPUT_DIR, output_filename)
        cv2.imwrite(output_path, vis_img)
        
        return output_path
    
    def _get_type_color(self, comp_type):
        colors = {
            'RESISTOR': (0, 255, 0),
            'CAPACITOR': (255, 0, 0),
            'IC': (0, 0, 255),
            'UNKNOWN': (128, 128, 128)
        }
        return colors.get(comp_type, (128, 128, 128))
