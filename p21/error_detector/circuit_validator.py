import cv2
import numpy as np
from collections import defaultdict

class CircuitValidator:
    def __init__(self):
        self.error_types = {
            'FLOATING_PIN': {'severity': 'warning', 'color': (0, 165, 255)},
            'SHORT_CIRCUIT': {'severity': 'error', 'color': (0, 0, 255)},
            'MISSING_CONNECTION': {'severity': 'warning', 'color': (255, 0, 255)},
            'LOW_CONFIDENCE': {'severity': 'warning', 'color': (0, 255, 255)},
            'UNRECOGNIZED_COMPONENT': {'severity': 'error', 'color': (255, 0, 0)},
            'OVERLAPPING_COMPONENTS': {'severity': 'warning', 'color': (255, 165, 0)},
            'POWER_MISSING': {'severity': 'error', 'color': (0, 0, 255)},
            'GROUND_MISSING': {'severity': 'warning', 'color': (0, 165, 255)},
            'INCORRECT_PIN_COUNT': {'severity': 'warning', 'color': (255, 0, 255)},
            'ROUTING_DRC_ERROR': {'severity': 'error', 'color': (255, 0, 0)}
        }
    
    def validate_circuit(self, components, connections, wires_img, original_img):
        errors = []
        
        errors.extend(self._check_floating_pins(components, connections))
        errors.extend(self._check_short_circuits(components, connections, wires_img))
        errors.extend(self._check_low_confidence(components))
        errors.extend(self._check_unrecognized_components(components))
        errors.extend(self._check_overlapping_components(components))
        errors.extend(self._check_pin_count_consistency(components))
        errors.extend(self._check_drc_violations(components, wires_img))
        
        errors.sort(key=lambda x: self._get_error_priority(x['type']), reverse=True)
        
        error_summary = self._generate_error_summary(errors)
        
        return {
            'errors': errors,
            'summary': error_summary,
            'total_errors': len([e for e in errors if e['severity'] == 'error']),
            'total_warnings': len([e for e in errors if e['severity'] == 'warning'])
        }
    
    def _check_floating_pins(self, components, connections):
        errors = []
        
        connected_components = set()
        for conn in connections:
            connected_components.add(conn.get('from'))
            connected_components.add(conn.get('to'))
        
        for comp in components:
            comp_id = comp['id']
            pin_count = comp.get('pin_count', 2)
            
            if pin_count >= 2 and comp_id not in connected_components:
                errors.append({
                    'type': 'FLOATING_PIN',
                    'severity': 'warning',
                    'component_id': comp_id,
                    'component_type': comp.get('type', 'UNKNOWN'),
                    'message': f'元件 {comp_id} ({comp.get("type", "UNKNOWN")}) 没有连接',
                    'position': (comp.get('x', 0), comp.get('y', 0)),
                    'area': (comp.get('x', 0), comp.get('y', 0), 
                             comp.get('width', 0), comp.get('height', 0))
                })
        
        return errors
    
    def _check_short_circuits(self, components, connections, wires_img):
        errors = []
        
        for i, comp1 in enumerate(components):
            for comp2 in components[i+1:]:
                dist = np.sqrt(
                    (comp1['centroid'][0] - comp2['centroid'][0])**2 +
                    (comp1['centroid'][1] - comp2['centroid'][1])**2
                )
                
                if dist < 30:
                    if self._check_wire_overlap(wires_img, comp1, comp2):
                        errors.append({
                            'type': 'SHORT_CIRCUIT',
                            'severity': 'error',
                            'components': [comp1['id'], comp2['id']],
                            'message': f'元件 {comp1["id"]} 和 {comp2["id"]} 之间可能存在短路',
                            'position': ((comp1['x'] + comp2['x']) // 2, 
                                        (comp1['y'] + comp2['y']) // 2),
                            'area': (min(comp1['x'], comp2['x']), 
                                     min(comp1['y'], comp2['y']),
                                     abs(comp1['x'] + comp1['width'] - comp2['x']),
                                     abs(comp1['y'] + comp1['height'] - comp2['y']))
                        })
        
        return errors
    
    def _check_wire_overlap(self, wires_img, comp1, comp2):
        x1, y1 = comp1['centroid']
        x2, y2 = comp2['centroid']
        
        steps = 10
        for i in range(steps + 1):
            t = i / steps
            x = int(x1 + (x2 - x1) * t)
            y = int(y1 + (y2 - y1) * t)
            
            if 0 <= y < wires_img.shape[0] and 0 <= x < wires_img.shape[1]:
                if wires_img[y, x] > 127:
                    return True
        
        return False
    
    def _check_low_confidence(self, components, threshold=0.5):
        errors = []
        
        for comp in components:
            confidence = comp.get('confidence', 0)
            if confidence < threshold:
                errors.append({
                    'type': 'LOW_CONFIDENCE',
                    'severity': 'warning',
                    'component_id': comp['id'],
                    'component_type': comp.get('type', 'UNKNOWN'),
                    'message': f'元件 {comp["id"]} 识别置信度较低: {confidence:.2f}',
                    'confidence': confidence,
                    'position': (comp.get('x', 0), comp.get('y', 0)),
                    'area': (comp.get('x', 0), comp.get('y', 0), 
                             comp.get('width', 0), comp.get('height', 0))
                })
        
        return errors
    
    def _check_unrecognized_components(self, components):
        errors = []
        
        for comp in components:
            if comp.get('type') == 'UNKNOWN':
                errors.append({
                    'type': 'UNRECOGNIZED_COMPONENT',
                    'severity': 'error',
                    'component_id': comp['id'],
                    'message': f'元件 {comp["id"]} 无法识别类型',
                    'position': (comp.get('x', 0), comp.get('y', 0)),
                    'area': (comp.get('x', 0), comp.get('y', 0), 
                             comp.get('width', 0), comp.get('height', 0))
                })
        
        return errors
    
    def _check_overlapping_components(self, components):
        errors = []
        
        for i, comp1 in enumerate(components):
            for comp2 in components[i+1:]:
                if self._boxes_overlap(comp1, comp2):
                    overlap_area = self._calculate_overlap_area(comp1, comp2)
                    min_area = min(comp1['area'], comp2['area'])
                    
                    if overlap_area > min_area * 0.3:
                        errors.append({
                            'type': 'OVERLAPPING_COMPONENTS',
                            'severity': 'warning',
                            'components': [comp1['id'], comp2['id']],
                            'message': f'元件 {comp1["id"]} 和 {comp2["id"]} 重叠',
                            'overlap_ratio': overlap_area / min_area,
                            'position': ((comp1['x'] + comp2['x']) // 2, 
                                        (comp1['y'] + comp2['y']) // 2),
                            'area': (min(comp1['x'], comp2['x']), 
                                     min(comp1['y'], comp2['y']),
                                     max(comp1['x'] + comp1['width'], comp2['x'] + comp2['width']) - min(comp1['x'], comp2['x']),
                                     max(comp1['y'] + comp1['height'], comp2['y'] + comp2['height']) - min(comp1['y'], comp2['y']))
                        })
        
        return errors
    
    def _boxes_overlap(self, comp1, comp2):
        x1, y1, w1, h1 = comp1['x'], comp1['y'], comp1['width'], comp1['height']
        x2, y2, w2, h2 = comp2['x'], comp2['y'], comp2['width'], comp2['height']
        
        return not (x1 + w1 < x2 or x2 + w2 < x1 or y1 + h1 < y2 or y2 + h2 < y1)
    
    def _calculate_overlap_area(self, comp1, comp2):
        x1, y1, w1, h1 = comp1['x'], comp1['y'], comp1['width'], comp1['height']
        x2, y2, w2, h2 = comp2['x'], comp2['y'], comp2['width'], comp2['height']
        
        overlap_x1 = max(x1, x2)
        overlap_y1 = max(y1, y2)
        overlap_x2 = min(x1 + w1, x2 + w2)
        overlap_y2 = min(y1 + h1, y2 + h2)
        
        if overlap_x1 >= overlap_x2 or overlap_y1 >= overlap_y2:
            return 0
        
        return (overlap_x2 - overlap_x1) * (overlap_y2 - overlap_y1)
    
    def _check_pin_count_consistency(self, components):
        errors = []
        
        expected_pins = {
            'RESISTOR': 2,
            'CAPACITOR': 2,
            'IC': (4, 16)
        }
        
        for comp in components:
            ctype = comp.get('type', 'UNKNOWN')
            actual_pins = comp.get('pin_count', 0)
            
            if ctype in expected_pins:
                expected = expected_pins[ctype]
                if isinstance(expected, tuple):
                    if not (expected[0] <= actual_pins <= expected[1]):
                        errors.append({
                            'type': 'INCORRECT_PIN_COUNT',
                            'severity': 'warning',
                            'component_id': comp['id'],
                            'component_type': ctype,
                            'message': f'{ctype} 引脚数异常: 实际 {actual_pins}, 期望 {expected[0]}-{expected[1]}',
                            'actual_pins': actual_pins,
                            'expected_pins': expected,
                            'position': (comp.get('x', 0), comp.get('y', 0)),
                            'area': (comp.get('x', 0), comp.get('y', 0), 
                                     comp.get('width', 0), comp.get('height', 0))
                        })
                else:
                    if actual_pins != expected:
                        errors.append({
                            'type': 'INCORRECT_PIN_COUNT',
                            'severity': 'warning',
                            'component_id': comp['id'],
                            'component_type': ctype,
                            'message': f'{ctype} 引脚数异常: 实际 {actual_pins}, 期望 {expected}',
                            'actual_pins': actual_pins,
                            'expected_pins': expected,
                            'position': (comp.get('x', 0), comp.get('y', 0)),
                            'area': (comp.get('x', 0), comp.get('y', 0), 
                                     comp.get('width', 0), comp.get('height', 0))
                        })
        
        return errors
    
    def _check_drc_violations(self, components, wires_img):
        errors = []
        
        min_clearance = 10
        
        wire_pixels = np.argwhere(wires_img > 127)
        
        for comp in components:
            x, y, w, h = comp['x'], comp['y'], comp['width'], comp['height']
            
            boundary_pixels = wire_pixels[
                (wire_pixels[:, 1] >= x - min_clearance) & 
                (wire_pixels[:, 1] <= x + w + min_clearance) &
                (wire_pixels[:, 0] >= y - min_clearance) & 
                (wire_pixels[:, 0] <= y + h + min_clearance)
            ]
            
            for wy, wx in boundary_pixels:
                if (wx < x or wx > x + w or wy < y or wy > y + h):
                    dist = min(abs(wx - x), abs(wx - x - w), abs(wy - y), abs(wy - y - h))
                    if dist < min_clearance:
                        errors.append({
                            'type': 'ROUTING_DRC_ERROR',
                            'severity': 'error',
                            'component_id': comp['id'],
                            'message': f'元件 {comp["id"]} 附近布线间距不足: {dist}px',
                            'clearance': dist,
                            'min_clearance': min_clearance,
                            'position': (wx, wy),
                            'area': (wx - 5, wy - 5, 10, 10)
                        })
                        break
        
        return errors
    
    def _get_error_priority(self, error_type):
        priorities = {
            'SHORT_CIRCUIT': 10,
            'UNRECOGNIZED_COMPONENT': 9,
            'ROUTING_DRC_ERROR': 8,
            'POWER_MISSING': 7,
            'FLOATING_PIN': 6,
            'MISSING_CONNECTION': 5,
            'OVERLAPPING_COMPONENTS': 4,
            'INCORRECT_PIN_COUNT': 3,
            'LOW_CONFIDENCE': 2,
            'GROUND_MISSING': 1
        }
        return priorities.get(error_type, 0)
    
    def _generate_error_summary(self, errors):
        summary = defaultdict(int)
        
        for error in errors:
            summary[error['type']] += 1
        
        return dict(summary)
    
    def draw_error_highlights(self, image, errors):
        highlighted = image.copy()
        
        for error in errors:
            color = self.error_types.get(error['type'], {}).get('color', (0, 255, 255))
            severity = error['severity']
            
            area = error.get('area')
            if area and len(area) == 4:
                x, y, w, h = area
                thickness = 3 if severity == 'error' else 2
                cv2.rectangle(highlighted, (x, y), (x + w, y + h), color, thickness)
                
                pos = error.get('position', (x, y))
                label = f"[{severity.upper()}] {error['type']}"
                cv2.putText(highlighted, label, (pos[0], pos[1] - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
        
        legend_y = 30
        displayed = set()
        for error in errors:
            if error['type'] not in displayed:
                color = self.error_types.get(error['type'], {}).get('color', (0, 255, 255))
                label = f"{error['type']} ({error['severity']})"
                cv2.putText(highlighted, label, (10, legend_y),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
                legend_y += 20
                displayed.add(error['type'])
                if legend_y > 200:
                    break
        
        return highlighted
