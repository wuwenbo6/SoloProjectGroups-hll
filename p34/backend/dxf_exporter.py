from typing import List, Dict, Tuple
import math


class DXFExporter:
    def __init__(self, config: Dict = None):
        self.config = config or {
            'layer_cutting': 'CUTTING',
            'layer_common_edge': 'COMMON_EDGE',
            'layer_travel': 'TRAVEL',
            'layer_text': 'TEXT',
            'color_cutting': 1,
            'color_common_edge': 2,
            'color_travel': 3,
            'units': 'mm'
        }
    
    def format_dxf_code(self, code: int, value: str) -> str:
        return f"{code}\n{value}\n"
    
    def create_header(self) -> str:
        header = ""
        header += self.format_dxf_code(0, "SECTION")
        header += self.format_dxf_code(2, "HEADER")
        
        header += self.format_dxf_code(9, "$INSUNITS")
        header += self.format_dxf_code(70, "4")
        
        header += self.format_dxf_code(9, "$LIMMIN")
        header += self.format_dxf_code(10, "0.0")
        header += self.format_dxf_code(20, "0.0")
        
        header += self.format_dxf_code(9, "$LIMMAX")
        header += self.format_dxf_code(10, "2000.0")
        header += self.format_dxf_code(20, "2000.0")
        
        header += self.format_dxf_code(0, "ENDSEC")
        return header
    
    def create_tables(self) -> str:
        tables = ""
        tables += self.format_dxf_code(0, "SECTION")
        tables += self.format_dxf_code(2, "TABLES")
        
        tables += self.format_dxf_code(0, "TABLE")
        tables += self.format_dxf_code(2, "LAYER")
        tables += self.format_dxf_code(70, "3")
        
        for layer_name, color in [
            (self.config['layer_cutting'], self.config['color_cutting']),
            (self.config['layer_common_edge'], self.config['color_common_edge']),
            (self.config['layer_travel'], self.config['color_travel']),
            (self.config['layer_text'], self.config['color_cutting'])
        ]:
            tables += self.format_dxf_code(0, "LAYER")
            tables += self.format_dxf_code(2, layer_name)
            tables += self.format_dxf_code(70, "64")
            tables += self.format_dxf_code(62, str(color))
            tables += self.format_dxf_code(6, "CONTINUOUS")
        
        tables += self.format_dxf_code(0, "ENDTAB")
        
        tables += self.format_dxf_code(0, "TABLE")
        tables += self.format_dxf_code(2, "LTYPE")
        tables += self.format_dxf_code(70, "1")
        
        tables += self.format_dxf_code(0, "LTYPE")
        tables += self.format_dxf_code(2, "CONTINUOUS")
        tables += self.format_dxf_code(70, "0")
        tables += self.format_dxf_code(3, "Solid line")
        tables += self.format_dxf_code(72, "65")
        tables += self.format_dxf_code(73, "0")
        tables += self.format_dxf_code(40, "0.0")
        
        tables += self.format_dxf_code(0, "ENDTAB")
        tables += self.format_dxf_code(0, "ENDSEC")
        return tables
    
    def create_polyline(self, points: List[Tuple[float, float]], layer: str, closed: bool = True) -> str:
        if len(points) < 2:
            return ""
        
        entity = ""
        entity += self.format_dxf_code(0, "LWPOLYLINE")
        entity += self.format_dxf_code(8, layer)
        entity += self.format_dxf_code(90, str(len(points)))
        entity += self.format_dxf_code(70, "1" if closed else "0")
        
        for x, y in points:
            entity += self.format_dxf_code(10, f"{x:.4f}")
            entity += self.format_dxf_code(20, f"{y:.4f}")
        
        return entity
    
    def create_line(self, x1: float, y1: float, x2: float, y2: float, layer: str) -> str:
        entity = ""
        entity += self.format_dxf_code(0, "LINE")
        entity += self.format_dxf_code(8, layer)
        entity += self.format_dxf_code(10, f"{x1:.4f}")
        entity += self.format_dxf_code(20, f"{y1:.4f}")
        entity += self.format_dxf_code(11, f"{x2:.4f}")
        entity += self.format_dxf_code(21, f"{y2:.4f}")
        return entity
    
    def create_text(self, x: float, y: float, text: str, height: float = 10.0, layer: str = None) -> str:
        if layer is None:
            layer = self.config['layer_text']
        
        entity = ""
        entity += self.format_dxf_code(0, "TEXT")
        entity += self.format_dxf_code(8, layer)
        entity += self.format_dxf_code(10, f"{x:.4f}")
        entity += self.format_dxf_code(20, f"{y:.4f}")
        entity += self.format_dxf_code(40, f"{height:.4f}")
        entity += self.format_dxf_code(1, text)
        entity += self.format_dxf_code(72, "1")
        entity += self.format_dxf_code(73, "2")
        return entity
    
    def create_sheet_outline(self, width: float, height: float) -> str:
        points = [
            (0, 0),
            (width, 0),
            (width, height),
            (0, height)
        ]
        return self.create_polyline(points, self.config['layer_travel'], closed=True)
    
    def export(self, placements: List[Dict], sheet_width: float, sheet_height: float, 
               common_edge_data: Dict = None, travel_path: List[Tuple[float, float]] = None) -> str:
        dxf_content = ""
        
        dxf_content += self.format_dxf_code(999, "DXF generated by Nesting Optimizer")
        dxf_content += self.format_dxf_code(999, f"Sheet: {sheet_width} x {sheet_height} {self.config['units']}")
        
        dxf_content += self.create_header()
        dxf_content += self.create_tables()
        
        dxf_content += self.format_dxf_code(0, "SECTION")
        dxf_content += self.format_dxf_code(2, "ENTITIES")
        
        dxf_content += self.create_sheet_outline(sheet_width, sheet_height)
        
        sorted_placements = sorted(placements, key=lambda p: p.get('cutting_order', 0))
        
        for idx, placement in enumerate(sorted_placements):
            points = placement.get('points', [])
            part_id = placement.get('part_id', f'Part_{idx}')
            order = placement.get('cutting_order', idx)
            
            if len(points) >= 3:
                dxf_content += self.format_dxf_code(999, f"Part: {part_id}, Order: {order + 1}")
                dxf_content += self.create_polyline(points, self.config['layer_cutting'], closed=True)
                
                centroid_x = sum(p[0] for p in points) / len(points)
                centroid_y = sum(p[1] for p in points) / len(points)
                dxf_content += self.create_text(centroid_x, centroid_y, str(order + 1), height=8.0)
        
        if common_edge_data:
            for ce in common_edge_data.get('common_edges', []):
                edge_coords = ce.get('edge_coords', [])
                if len(edge_coords) >= 2:
                    (x1, y1), (x2, y2) = edge_coords
                    dxf_content += self.create_line(x1, y1, x2, y2, self.config['layer_common_edge'])
        
        if travel_path:
            for i in range(len(travel_path) - 1):
                (x1, y1), (x2, y2) = travel_path[i], travel_path[i + 1]
                dxf_content += self.create_line(x1, y1, x2, y2, self.config['layer_travel'])
        
        dxf_content += self.format_dxf_code(0, "ENDSEC")
        
        dxf_content += self.format_dxf_code(0, "EOF")
        
        return dxf_content


def export_dxf(placements: List[Dict], sheet_width: float, sheet_height: float, **kwargs) -> str:
    exporter = DXFExporter()
    return exporter.export(placements, sheet_width, sheet_height, **kwargs)
