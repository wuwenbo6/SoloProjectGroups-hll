import numpy as np
import heapq
from io import BytesIO
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.pdfgen import canvas


class PropertyDamageAssessor:
    def __init__(self):
        self.building_types = {
            'residential': {'name': '住宅', 'base_value': 8000, 'damage_curve': self.residential_damage},
            'commercial': {'name': '商业', 'base_value': 15000, 'damage_curve': self.commercial_damage},
            'industrial': {'name': '工业', 'base_value': 10000, 'damage_curve': self.industrial_damage},
            'public': {'name': '公共设施', 'base_value': 12000, 'damage_curve': self.public_damage}
        }
        
        self.building_data = self._generate_building_data()
    
    def _generate_building_data(self):
        buildings = []
        base_lon, base_lat = 116.400, 39.900
        
        building_configs = [
            {'type': 'residential', 'count': 15},
            {'type': 'commercial', 'count': 8},
            {'type': 'industrial', 'count': 5},
            {'type': 'public', 'count': 3}
        ]
        
        bid = 0
        for config in building_configs:
            for i in range(config['count']):
                lon = base_lon + np.random.uniform(-0.012, 0.012)
                lat = base_lat + np.random.uniform(-0.015, 0.015)
                area = np.random.uniform(500, 3000)
                floors = np.random.randint(1, 7)
                
                buildings.append({
                    'id': f'B{bid:03d}',
                    'type': config['type'],
                    'name': f'{self.building_types[config["type"]]["name"]}{bid + 1}',
                    'lon': lon,
                    'lat': lat,
                    'area': area,
                    'floors': floors,
                    'value': area * self.building_types[config['type']]['base_value']
                })
                bid += 1
        
        return buildings
    
    def residential_damage(self, depth):
        if depth < 0.1:
            return 0.0
        elif depth < 0.5:
            return 0.05 + 0.25 * (depth - 0.1) / 0.4
        elif depth < 1.5:
            return 0.30 + 0.35 * (depth - 0.5) / 1.0
        else:
            return min(0.95, 0.65 + 0.30 * min(depth - 1.5, 1.0) / 1.0)
    
    def commercial_damage(self, depth):
        if depth < 0.1:
            return 0.0
        elif depth < 0.5:
            return 0.10 + 0.30 * (depth - 0.1) / 0.4
        elif depth < 1.5:
            return 0.40 + 0.35 * (depth - 0.5) / 1.0
        else:
            return min(0.95, 0.75 + 0.20 * min(depth - 1.5, 1.0) / 1.0)
    
    def industrial_damage(self, depth):
        if depth < 0.3:
            return 0.0
        elif depth < 1.0:
            return 0.05 + 0.20 * (depth - 0.3) / 0.7
        elif depth < 2.0:
            return 0.25 + 0.30 * (depth - 1.0) / 1.0
        else:
            return min(0.90, 0.55 + 0.35 * min(depth - 2.0, 1.0) / 1.0)
    
    def public_damage(self, depth):
        if depth < 0.2:
            return 0.0
        elif depth < 0.8:
            return 0.08 + 0.22 * (depth - 0.2) / 0.6
        elif depth < 1.8:
            return 0.30 + 0.35 * (depth - 0.8) / 1.0
        else:
            return min(0.95, 0.65 + 0.30 * min(depth - 1.8, 1.0) / 1.0)
    
    def get_depth_at_location(self, lon, lat, depth_points):
        if not depth_points:
            return 0.0
        
        distances = []
        weights = []
        
        for dp in depth_points:
            dx = lon - dp['lon']
            dy = lat - dp['lat']
            dist = np.sqrt(dx * dx + dy * dy)
            
            if dist < 0.00001:
                return dp['depth']
            
            distances.append(dist)
            weights.append(1.0 / (dist ** 2 + 0.00001))
        
        total_weight = sum(weights)
        if total_weight == 0:
            return 0.0
        
        weighted_depth = sum(w * dp['depth'] for w, dp in zip(weights, depth_points)) / total_weight
        min_dist = min(distances)
        distance_decay = np.exp(-min_dist * 500)
        
        return weighted_depth * distance_decay
    
    def assess_damage(self, depth_points):
        results = []
        total_loss = 0.0
        
        for building in self.building_data:
            depth = self.get_depth_at_location(building['lon'], building['lat'], depth_points)
            damage_ratio = self.building_types[building['type']]['damage_curve'](depth)
            loss = building['value'] * damage_ratio
            total_loss += loss
            
            results.append({
                'building_id': building['id'],
                'building_name': building['name'],
                'building_type': building['type'],
                'building_type_name': self.building_types[building['type']]['name'],
                'lon': building['lon'],
                'lat': building['lat'],
                'area': building['area'],
                'floors': building['floors'],
                'property_value': building['value'],
                'water_depth': depth,
                'damage_ratio': damage_ratio,
                'economic_loss': loss
            })
        
        return {
            'buildings': results,
            'total_loss': total_loss,
            'building_count': len(self.building_data),
            'affected_count': sum(1 for r in results if r['damage_ratio'] > 0),
            'severely_affected': sum(1 for r in results if r['damage_ratio'] > 0.5)
        }


class EvacuationRouter:
    def __init__(self):
        self.safe_zones = [
            {'id': 'SZ01', 'name': '市民广场', 'lon': 116.390, 'lat': 39.908, 'capacity': 5000},
            {'id': 'SZ02', 'name': '中心公园', 'lon': 116.410, 'lat': 39.900, 'capacity': 3000},
            {'id': 'SZ03', 'name': '北部高地', 'lon': 116.400, 'lat': 39.915, 'capacity': 8000},
            {'id': 'SZ04', 'name': '体育中心', 'lon': 116.385, 'lat': 39.892, 'capacity': 6000}
        ]
        
        self.road_network = self._generate_road_network()
    
    def _generate_road_network(self):
        nodes = {}
        edges = {}
        
        for i in range(15):
            for j in range(15):
                node_id = f'N{i:02d}{j:02d}'
                lon = 116.387 + i * 0.002
                lat = 39.885 + j * 0.002
                nodes[node_id] = {'lon': lon, 'lat': lat}
        
        for i in range(15):
            for j in range(15):
                node_id = f'N{i:02d}{j:02d}'
                edges[node_id] = []
                
                if i < 14:
                    neighbor = f'N{i+1:02d}{j:02d}'
                    edges[node_id].append({'node': neighbor, 'distance': 0.002})
                if i > 0:
                    neighbor = f'N{i-1:02d}{j:02d}'
                    edges[node_id].append({'node': neighbor, 'distance': 0.002})
                if j < 14:
                    neighbor = f'N{i:02d}{j+1:02d}'
                    edges[node_id].append({'node': neighbor, 'distance': 0.002})
                if j > 0:
                    neighbor = f'N{i:02d}{j-1:02d}'
                    edges[node_id].append({'node': neighbor, 'distance': 0.002})
        
        return {'nodes': nodes, 'edges': edges}
    
    def calculate_flood_risk(self, lon, lat, depth_points):
        if not depth_points:
            return 1.0
        
        min_dist = float('inf')
        nearest_depth = 0
        
        for dp in depth_points:
            dx = lon - dp['lon']
            dy = lat - dp['lat']
            dist = np.sqrt(dx * dx + dy * dy)
            
            if dist < min_dist:
                min_dist = dist
                nearest_depth = dp['depth']
        
        risk_factor = nearest_depth * np.exp(-min_dist * 300)
        return max(1.0, 1.0 + risk_factor * 10)
    
    def find_nearest_node(self, lon, lat):
        min_dist = float('inf')
        nearest_node = None
        
        for node_id, node_data in self.road_network['nodes'].items():
            dx = lon - node_data['lon']
            dy = lat - node_data['lat']
            dist = np.sqrt(dx * dx + dy * dy)
            
            if dist < min_dist:
                min_dist = dist
                nearest_node = node_id
        
        return nearest_node
    
    def dijkstra_with_risk(self, start_lon, start_lat, depth_points):
        start_node = self.find_nearest_node(start_lon, start_lat)
        if not start_node:
            return None
        
        nodes = self.road_network['nodes']
        edges = self.road_network['edges']
        
        distances = {node: float('inf') for node in nodes}
        distances[start_node] = 0
        previous = {node: None for node in nodes}
        
        pq = [(0, start_node)]
        visited = set()
        
        while pq:
            current_dist, current_node = heapq.heappop(pq)
            
            if current_node in visited:
                continue
            visited.add(current_node)
            
            current_data = nodes[current_node]
            current_risk = self.calculate_flood_risk(
                current_data['lon'], current_data['lat'], depth_points
            )
            
            for edge in edges[current_node]:
                if edge['node'] in visited:
                    continue
                
                neighbor_data = nodes[edge['node']]
                neighbor_risk = self.calculate_flood_risk(
                    neighbor_data['lon'], neighbor_data['lat'], depth_points
                )
                
                avg_risk = (current_risk + neighbor_risk) / 2
                weighted_distance = edge['distance'] * avg_risk
                new_dist = current_dist + weighted_distance
                
                if new_dist < distances[edge['node']]:
                    distances[edge['node']] = new_dist
                    previous[edge['node']] = current_node
                    heapq.heappush(pq, (new_dist, edge['node']))
        
        return {'start_node': start_node, 'distances': distances, 'previous': previous}
    
    def reconstruct_path(self, previous, start_node, end_node):
        path = []
        current = end_node
        
        while current is not None:
            path.append(current)
            current = previous[current]
        
        path.reverse()
        return path
    
    def find_evacuation_routes(self, start_lon, start_lat, depth_points):
        routing_result = self.dijkstra_with_risk(start_lon, start_lat, depth_points)
        if not routing_result:
            return None
        
        nodes = self.road_network['nodes']
        routes = []
        
        for safe_zone in self.safe_zones:
            end_node = self.find_nearest_node(safe_zone['lon'], safe_zone['lat'])
            if not end_node:
                continue
            
            path = self.reconstruct_path(routing_result['previous'], routing_result['start_node'], end_node)
            
            if len(path) < 2:
                continue
            
            path_coords = []
            total_distance = 0
            
            for i, node_id in enumerate(path):
                node_data = nodes[node_id]
                path_coords.append({
                    'node_id': node_id,
                    'lon': node_data['lon'],
                    'lat': node_data['lat']
                })
                
                if i > 0:
                    prev_data = nodes[path[i-1]]
                    dx = node_data['lon'] - prev_data['lon']
                    dy = node_data['lat'] - prev_data['lat']
                    total_distance += np.sqrt(dx * dx + dy * dy)
            
            distance_km = total_distance * 111
            walking_time = distance_km / 4 * 60
            
            routes.append({
                'safe_zone_id': safe_zone['id'],
                'safe_zone_name': safe_zone['name'],
                'safe_zone_lon': safe_zone['lon'],
                'safe_zone_lat': safe_zone['lat'],
                'capacity': safe_zone['capacity'],
                'path': path_coords,
                'path_length': distance_km,
                'estimated_time_min': walking_time,
                'risk_weighted_cost': routing_result['distances'][end_node]
            })
        
        routes.sort(key=lambda r: r['risk_weighted_cost'])
        
        return {
            'safe_zones': self.safe_zones,
            'routes': routes,
            'recommended_route': routes[0] if routes else None
        }


class RiskMapExporter:
    def __init__(self):
        pass
    
    def create_pdf_report(self, simulation_data, damage_assessment, return_period):
        buffer = BytesIO()
        
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=2*cm,
            leftMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )
        
        styles = getSampleStyleSheet()
        elements = []
        
        title_style = styles['Title']
        title_style.alignment = 1
        elements.append(Paragraph('城市内涝风险评估报告', title_style))
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph(f'模拟场景：{return_period}年一遇降雨', styles['Heading2']))
        elements.append(Spacer(1, 0.3*cm))
        
        summary_data = [
            ['评估指标', '数值'],
            ['受影响建筑数量', f"{damage_assessment['affected_count']} / {damage_assessment['building_count']}"],
            ['严重受影响（损失>50%）', str(damage_assessment['severely_affected'])],
            ['总经济损失', f"¥ {damage_assessment['total_loss']:,.0f}"],
            ['平均损失率', f"{damage_assessment['total_loss']/sum(b['property_value'] for b in damage_assessment['buildings'])*100:.1f}%"]
        ]
        
        summary_table = Table(summary_data, colWidths=[8*cm, 6*cm])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3c72')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.whitesmoke),
            ('GRID', (0, 0), (-1, -1), 1, colors.gray)
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph('建筑损失明细', styles['Heading2']))
        elements.append(Spacer(1, 0.3*cm))
        
        building_data = [['建筑ID', '名称', '类型', '水深(m)', '损失率', '经济损失(¥)']]
        for b in sorted(damage_assessment['buildings'], key=lambda x: -x['economic_loss'])[:10]:
            building_data.append([
                b['building_id'],
                b['building_name'],
                b['building_type_name'],
                f"{b['water_depth']:.2f}",
                f"{b['damage_ratio']*100:.1f}%",
                f"{b['economic_loss']:,.0f}"
            ])
        
        building_table = Table(building_data, colWidths=[2*cm, 3*cm, 2*cm, 2*cm, 2*cm, 3*cm])
        building_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2a5298')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.gray)
        ]))
        elements.append(building_table)
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph('图例说明', styles['Heading2']))
        legend_data = [
            ['水深等级', '颜色'],
            ['0.1 - 0.3m', '浅黄色'],
            ['0.3 - 0.5m', '浅绿色'],
            ['0.5 - 1.0m', '蓝绿色'],
            ['1.0 - 2.0m', '蓝色'],
            ['> 2.0m', '深蓝色']
        ]
        legend_table = Table(legend_data, colWidths=[4*cm, 4*cm])
        legend_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.gray),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 1, colors.gray)
        ]))
        elements.append(legend_table)
        
        doc.build(elements)
        buffer.seek(0)
        
        return buffer
