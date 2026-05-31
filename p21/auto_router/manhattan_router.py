import numpy as np
from collections import defaultdict, deque

class ManhattanRouter:
    def __init__(self):
        self.grid_size = 10
        self.clearance = 2
    
    def generate_routing_suggestions(self, components, wires_img, board_size=None):
        h, w = wires_img.shape if board_size is None else board_size
        
        component_terminals = self._extract_terminals(components)
        
        routing_suggestions = []
        
        for i, comp1 in enumerate(components):
            for comp2 in components[i+1:]:
                if self._should_connect(comp1, comp2):
                    terminals1 = component_terminals.get(comp1['id'], [])
                    terminals2 = component_terminals.get(comp2['id'], [])
                    
                    if terminals1 and terminals2:
                        t1 = terminals1[0]
                        t2 = terminals2[0]
                        
                        path = self._manhattan_path(t1['position'], t2['position'])
                        
                        wire_length = self._calculate_wire_length(path)
                        
                        routing_suggestions.append({
                            'from_component': comp1['id'],
                            'from_type': comp1.get('type', 'UNKNOWN'),
                            'to_component': comp2['id'],
                            'to_type': comp2.get('type', 'UNKNOWN'),
                            'from_terminal': t1['position'],
                            'to_terminal': t2['position'],
                            'path': path,
                            'wire_length': wire_length,
                            'via_count': self._count_vias(path),
                            'quality_score': self._evaluate_path(path, wires_img)
                        })
        
        routing_suggestions.sort(key=lambda x: x['wire_length'])
        
        return {
            'suggestions': routing_suggestions,
            'total_wire_length': sum(s['wire_length'] for s in routing_suggestions),
            'total_vias': sum(s['via_count'] for s in routing_suggestions)
        }
    
    def _extract_terminals(self, components):
        terminals = defaultdict(list)
        
        for comp in components:
            comp_id = comp['id']
            x, y = comp['x'], comp['y']
            w, h = comp['width'], comp['height']
            
            pin_positions = comp.get('pin_positions', [])
            if pin_positions:
                for pin in pin_positions:
                    rel_x, rel_y = pin['position']
                    terminals[comp_id].append({
                        'pin_number': pin.get('pin_number'),
                        'position': (x + rel_x, y + rel_y)
                    })
            else:
                terminals[comp_id].extend([
                    {'pin_number': 1, 'position': (x, y + h // 2)},
                    {'pin_number': 2, 'position': (x + w, y + h // 2)}
                ])
        
        return terminals
    
    def _should_connect(self, comp1, comp2):
        type1 = comp1.get('type', 'UNKNOWN')
        type2 = comp2.get('type', 'UNKNOWN')
        
        if type1 == 'IC' or type2 == 'IC':
            return True
        
        dist = np.sqrt(
            (comp1['centroid'][0] - comp2['centroid'][0])**2 +
            (comp1['centroid'][1] - comp2['centroid'][1])**2
        )
        
        return dist < 300
    
    def _manhattan_path(self, start, end):
        x1, y1 = start
        x2, y2 = end
        
        path = []
        
        x_dir = 1 if x2 >= x1 else -1
        for x in range(int(x1), int(x2) + x_dir, x_dir):
            path.append((x, int(y1)))
        
        y_dir = 1 if y2 >= y1 else -1
        for y in range(int(y1) + y_dir, int(y2) + y_dir, y_dir):
            path.append((int(x2), y))
        
        return path
    
    def _calculate_wire_length(self, path):
        if len(path) < 2:
            return 0
        
        total_length = 0
        for i in range(1, len(path)):
            dx = abs(path[i][0] - path[i-1][0])
            dy = abs(path[i][1] - path[i-1][1])
            total_length += dx + dy
        
        return total_length
    
    def _count_vias(self, path):
        if len(path) < 2:
            return 0
        
        vias = 0
        prev_dir = None
        
        for i in range(1, len(path)):
            dx = path[i][0] - path[i-1][0]
            dy = path[i][1] - path[i-1][1]
            
            curr_dir = 'H' if dx != 0 else 'V'
            
            if prev_dir and curr_dir != prev_dir:
                vias += 1
            
            prev_dir = curr_dir
        
        return vias
    
    def _evaluate_path(self, path, wires_img):
        h, w = wires_img.shape
        score = 1.0
        
        for x, y in path:
            if 0 <= y < h and 0 <= x < w:
                if wires_img[y, x] > 127:
                    score -= 0.01
        
        return max(0, score)
    
    def optimize_placement(self, components, board_width, board_height):
        optimized = []
        
        grid_cols = int(np.ceil(np.sqrt(len(components))))
        grid_rows = int(np.ceil(len(components) / grid_cols))
        
        cell_width = board_width // (grid_cols + 1)
        cell_height = board_height // (grid_rows + 1)
        
        for i, comp in enumerate(components):
            row = i // grid_cols
            col = i % grid_cols
            
            new_x = (col + 1) * cell_width
            new_y = (row + 1) * cell_height
            
            optimized.append({
                **comp,
                'original_position': (comp['x'], comp['y']),
                'suggested_x': new_x,
                'suggested_y': new_y
            })
        
        return optimized

class ChannelRouter:
    def __init__(self):
        pass
    
    def route_channels(self, components, channels):
        routes = []
        
        for channel in channels:
            nets = self._assign_tracks(channel)
            routes.extend(nets)
        
        return routes
    
    def _assign_tracks(self, channel):
        nets = []
        tracks = sorted(channel['terminals'], key=lambda x: x['position'][0])
        
        for i, term in enumerate(tracks):
            nets.append({
                'track': i,
                'terminal': term,
                'channel_direction': channel['direction']
            })
        
        return nets
