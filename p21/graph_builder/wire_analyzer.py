import cv2
import numpy as np
from collections import defaultdict

class WireAnalyzer:
    def __init__(self):
        pass
    
    def find_connection_points(self, components, wires_img, original_img=None):
        connection_points = []
        
        junction_points = self._detect_junctions(wires_img)
        
        for comp in components:
            x, y, w, h = comp['x'], comp['y'], comp['width'], comp['height']
            
            left_points = self._find_edge_points(wires_img, x, y, x, y + h)
            right_points = self._find_edge_points(wires_img, x + w, y, x + w, y + h)
            top_points = self._find_edge_points(wires_img, x, y, x + w, y)
            bottom_points = self._find_edge_points(wires_img, x, y + h, x + w, y + h)
            
            all_points = left_points + right_points + top_points + bottom_points
            for pt in all_points:
                connection_points.append({
                    'component_id': comp['id'],
                    'position': pt,
                    'side': self._get_side(pt, x, y, w, h),
                    'is_junction': False
                })
        
        for jp in junction_points:
            connection_points.append({
                'component_id': None,
                'position': jp['position'],
                'side': 'junction',
                'is_junction': True,
                'junction_type': jp['type']
            })
        
        return connection_points
    
    def _detect_junctions(self, wires_img):
        junctions = []
        
        skeleton = self._skeletonize(wires_img)
        
        crossing_points = self._detect_crossing_points(skeleton)
        t_junctions = self._detect_t_junctions(skeleton)
        
        for pt in crossing_points:
            if self._has_junction_dot(wires_img, pt):
                junctions.append({'position': pt, 'type': 'crossing'})
        
        for pt in t_junctions:
            junctions.append({'position': pt, 'type': 't_junction'})
        
        return junctions
    
    def _skeletonize(self, img):
        size = np.size(img)
        skel = np.zeros(img.shape, np.uint8)
        
        _, img = cv2.threshold(img, 127, 255, 0)
        element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
        done = False
        
        while not done:
            eroded = cv2.erode(img, element)
            temp = cv2.dilate(eroded, element)
            temp = cv2.subtract(img, temp)
            skel = cv2.bitwise_or(skel, temp)
            img = eroded.copy()
            
            zeros = size - cv2.countNonZero(img)
            if zeros == size:
                done = True
        
        return skel
    
    def _detect_crossing_points(self, skeleton):
        points = []
        h, w = skeleton.shape
        
        for y in range(2, h-2):
            for x in range(2, w-2):
                if skeleton[y, x] > 0:
                    neighbors = self._count_neighbors(skeleton, x, y)
                    
                    if neighbors >= 4:
                        points.append((x, y))
        
        return self._cluster_points(points, distance=5)
    
    def _detect_t_junctions(self, skeleton):
        points = []
        h, w = skeleton.shape
        
        for y in range(2, h-2):
            for x in range(2, w-2):
                if skeleton[y, x] > 0:
                    neighbors = self._count_neighbors(skeleton, x, y)
                    
                    if neighbors == 3:
                        points.append((x, y))
        
        return self._cluster_points(points, distance=5)
    
    def _count_neighbors(self, img, x, y):
        count = 0
        for dy in [-1, 0, 1]:
            for dx in [-1, 0, 1]:
                if dx == 0 and dy == 0:
                    continue
                if img[y + dy, x + dx] > 0:
                    count += 1
        return count
    
    def _cluster_points(self, points, distance=5):
        if not points:
            return []
        
        clusters = []
        used = set()
        
        for i, p1 in enumerate(points):
            if i in used:
                continue
            
            cluster = [p1]
            used.add(i)
            
            for j, p2 in enumerate(points[i+1:], start=i+1):
                if j in used:
                    continue
                
                d = np.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)
                if d <= distance:
                    cluster.append(p2)
                    used.add(j)
            
            center_x = int(np.mean([p[0] for p in cluster]))
            center_y = int(np.mean([p[1] for p in cluster]))
            clusters.append((center_x, center_y))
        
        return clusters
    
    def _has_junction_dot(self, wires_img, point, radius=5):
        x, y = point
        h, w = wires_img.shape
        
        x1, y1 = max(0, x - radius), max(0, y - radius)
        x2, y2 = min(w, x + radius + 1), min(h, y + radius + 1)
        
        region = wires_img[y1:y2, x1:x2]
        if region.size == 0:
            return False
        
        filled_ratio = np.sum(region > 127) / region.size
        
        return filled_ratio > 0.6
    
    def _find_edge_points(self, wires_img, x1, y1, x2, y2):
        points = []
        if x1 == x2:
            for y in range(int(y1), int(y2)):
                if 0 <= y < wires_img.shape[0] and 0 <= x1 < wires_img.shape[1]:
                    if wires_img[y, x1] > 127:
                        points.append((x1, y))
        else:
            for x in range(int(x1), int(x2)):
                if 0 <= y1 < wires_img.shape[0] and 0 <= x < wires_img.shape[1]:
                    if wires_img[y1, x] > 127:
                        points.append((x, y1))
        return points
    
    def _get_side(self, pt, x, y, w, h):
        px, py = pt
        if abs(px - x) < 5:
            return 'left'
        elif abs(px - (x + w)) < 5:
            return 'right'
        elif abs(py - y) < 5:
            return 'top'
        else:
            return 'bottom'
    
    def trace_wire_paths(self, wires_img, start_points):
        paths = []
        visited = set()
        
        junction_points = [cp for cp in start_points if cp.get('is_junction', False)]
        component_points = [cp for cp in start_points if not cp.get('is_junction', False)]
        
        all_points = component_points + junction_points
        
        for start_pt in all_points:
            if (start_pt['position'][0], start_pt['position'][1]) in visited:
                continue
            
            path = self._trace_single_path(wires_img, start_pt['position'], visited, junction_points)
            if path:
                paths.append({
                    'start_component': start_pt.get('component_id'),
                    'start_side': start_pt.get('side'),
                    'path': path,
                    'is_junction_path': start_pt.get('is_junction', False)
                })
        
        return paths
    
    def _trace_single_path(self, wires_img, start, visited, junction_points, max_steps=1000):
        path = []
        current = start
        steps = 0
        
        junction_positions = set([(jp['position'][0], jp['position'][1]) for jp in junction_points])
        
        while steps < max_steps:
            cx, cy = int(current[0]), int(current[1])
            if (cx, cy) in visited:
                break
            
            if 0 <= cy < wires_img.shape[0] and 0 <= cx < wires_img.shape[1]:
                if wires_img[cy, cx] < 127:
                    break
            
            visited.add((cx, cy))
            path.append((cx, cy))
            
            if (cx, cy) in junction_positions and steps > 5:
                break
            
            neighbors = [
                (cx + 1, cy), (cx - 1, cy),
                (cx, cy + 1), (cx, cy - 1),
                (cx + 1, cy + 1), (cx - 1, cy - 1),
                (cx + 1, cy - 1), (cx - 1, cy + 1)
            ]
            
            found = False
            for nx, ny in neighbors:
                if (nx, ny) not in visited:
                    if 0 <= ny < wires_img.shape[0] and 0 <= nx < wires_img.shape[1]:
                        if wires_img[ny, nx] > 127:
                            current = (nx, ny)
                            found = True
                            break
            
            if not found:
                break
            steps += 1
        
        return path
    
    def check_connection(self, wires_img, point1, point2, junction_points):
        start_x, start_y = point1
        end_x, end_y = point2
        
        dist = np.sqrt((end_x - start_x)**2 + (end_y - start_y)**2)
        if dist < 10:
            return True
        
        junction_positions = set([(jp[0], jp[1]) for jp in junction_points])
        
        path_points = self._breadth_first_search(wires_img, (start_x, start_y), (end_x, end_y), junction_positions)
        
        return path_points is not None
    
    def _breadth_first_search(self, wires_img, start, end, junction_positions, max_distance=500):
        from collections import deque
        
        h, w = wires_img.shape
        start_x, start_y = start
        end_x, end_y = end
        
        queue = deque()
        queue.append((start_x, start_y, 0))
        visited = set()
        visited.add((start_x, start_y))
        
        directions = [
            (1, 0), (-1, 0), (0, 1), (0, -1),
            (1, 1), (-1, -1), (1, -1), (-1, 1)
        ]
        
        while queue:
            x, y, dist = queue.popleft()
            
            if dist > max_distance:
                continue
            
            if abs(x - end_x) <= 5 and abs(y - end_y) <= 5:
                return True
            
            for dx, dy in directions:
                nx, ny = x + dx, y + dy
                
                if (nx, ny) in visited:
                    continue
                
                if 0 <= nx < w and 0 <= ny < h:
                    if wires_img[ny, nx] > 127:
                        visited.add((nx, ny))
                        queue.append((nx, ny, dist + 1))
        
        return False
