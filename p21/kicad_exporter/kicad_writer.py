import os
import uuid
from datetime import datetime

class KiCadExporter:
    def __init__(self):
        self.component_libs = {
            'RESISTOR': 'Device:R',
            'CAPACITOR': 'Device:C',
            'IC': 'Package_SO:SOIC-8'
        }
        
        self.footprint_mm_to_nm = 1000000
    
    def export_schematic(self, components, connections, output_path):
        eeschema_content = self._generate_eeschema(components, connections)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(eeschema_content)
        
        return output_path
    
    def export_pcb(self, components, routing_suggestions, output_path):
        pcb_content = self._generate_pcbnew(components, routing_suggestions)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(pcb_content)
        
        return output_path
    
    def export_netlist(self, components, connections, output_path):
        netlist_content = self._generate_spice_netlist(components, connections)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(netlist_content)
        
        return output_path
    
    def export_full_project(self, components, connections, routing_suggestions, output_dir):
        project_name = f"circuit_{uuid.uuid4().hex[:8]}"
        project_dir = os.path.join(output_dir, project_name)
        os.makedirs(project_dir, exist_ok=True)
        
        sch_path = os.path.join(project_dir, f"{project_name}.kicad_sch")
        pcb_path = os.path.join(project_dir, f"{project_name}.kicad_pcb")
        net_path = os.path.join(project_dir, f"{project_name}.net")
        pro_path = os.path.join(project_dir, f"{project_name}.kicad_pro")
        
        self.export_schematic(components, connections, sch_path)
        self.export_pcb(components, routing_suggestions, pcb_path)
        self.export_netlist(components, connections, net_path)
        self._generate_project_file(project_name, pro_path)
        
        return {
            'project_name': project_name,
            'project_dir': project_dir,
            'schematic_path': sch_path,
            'pcb_path': pcb_path,
            'netlist_path': net_path,
            'project_path': pro_path
        }
    
    def _generate_eeschema(self, components, connections):
        lines = []
        
        lines.append("(kicad_sch")
        lines.append(f"  (version 20211123)")
        lines.append(f"  (generator \"Circuit OCR\")")
        lines.append(f"  (uuid \"{uuid.uuid4()}\")")
        lines.append("  (paper \"A4\")")
        lines.append("")
        
        lib_symbols = self._generate_lib_symbols(components)
        lines.extend(lib_symbols)
        lines.append("")
        
        for i, comp in enumerate(components):
            symbol = self._generate_symbol_instance(comp, i)
            lines.extend(symbol)
            lines.append("")
        
        lines = self._generate_wires(connections)
        lines.append("")
        
        lines.append(")")
        
        return "\n".join(lines)
    
    def _generate_lib_symbols(self, components):
        lines = ["  (lib_symbols"]
        
        comp_types = set([c.get('type', 'UNKNOWN') for c in components])
        
        for ctype in comp_types:
            if ctype == 'RESISTOR':
                lines.extend([
                    "    (symbol \"Device:R\"",
                    "      (pin_numbers \"hide\")",
                    "      (in_bom yes)",
                    "      (on_board yes)",
                    "      (property \"Reference\" \"R\"",
                    "        (at 0 1.27 0)",
                    "        (effects (font (size 1.27 1.27))",
                    "      )",
                    "      (polyline",
                    "        (pts (xy -1.27 0) (xy -0.635 0))",
                    "        (stroke (width 0)))",
                    "      (polyline",
                    "        (pts (xy 1.27 0) (xy 0.635 0))",
                    "        (stroke (width 0)))",
                    "      (pin passive line",
                    "        (at -2.54 0 0)",
                    "        (length 1.27)",
                    "        (name \"~\" (effects (font (size 1.27 1.27))))",
                    "        (number \"1\" (effects (font (size 1.27 1.27))))",
                    "      )",
                    "      (pin passive line",
                    "        (at 2.54 0 180)",
                    "        (length 1.27)",
                    "        (name \"~\" (effects (font (size 1.27 1.27))))",
                    "        (number \"2\" (effects (font (size 1.27 1.27))))",
                    "      )",
                    "    )"
                ])
            elif ctype == 'CAPACITOR':
                lines.extend([
                    "    (symbol \"Device:C\"",
                    "      (pin_numbers \"hide\")",
                    "      (in_bom yes)",
                    "      (on_board yes)",
                    "      (property \"Reference\" \"C\"",
                    "        (at 0 1.905 0)",
                    "        (effects (font (size 1.27 1.27))",
                    "      )",
                    "      (polyline",
                    "        (pts (xy -1.27 0) (xy -0.635 0))",
                    "        (stroke (width 0)))",
                    "      (polyline",
                    "        (pts (xy 1.27 0) (xy 0.635 0))",
                    "        (stroke (width 0)))",
                    "      (pin passive line",
                    "        (at -2.54 0 0)",
                    "        (length 1.27)",
                    "        (name \"~\" (effects (font (size 1.27 1.27))))",
                    "        (number \"1\" (effects (font (size 1.27 1.27))))",
                    "      )",
                    "      (pin passive line",
                    "        (at 2.54 0 180)",
                    "        (length 1.27)",
                    "        (name \"~\" (effects (font (size 1.27 1.27))))",
                    "        (number \"2\" (effects (font (size 1.27 1.27))))",
                    "      )",
                    "    )"
                ])
            elif ctype == 'IC':
                lines.extend([
                    "    (symbol \"Package_SO:SOIC-8\"",
                    "      (pin_numbers \"show\")",
                    "      (in_bom yes)",
                    "      (on_board yes)",
                    "      (property \"Reference\" \"U\"",
                    "        (at -5.08 5.08 0)",
                    "        (effects (font (size 1.27 1.27))",
                    "      )",
                    "      (rectangle",
                    "        (start -5.08 -5.08) (end 5.08 5.08)",
                    "        (stroke (width 0.254))",
                    "        (fill (type background))",
                    "      )",
                    "    )"
                ])
        
        lines.append("  )")
        return lines
    
    def _generate_symbol_instance(self, comp, index):
        comp_type = comp.get('type', 'UNKNOWN')
        ref_prefix = {'RESISTOR': 'R', 'CAPACITOR': 'C', 'IC': 'U'}.get(comp_type, 'X')
        lib_name = {'RESISTOR': 'Device:R', 'CAPACITOR': 'Device:C', 'IC': 'Package_SO:SOIC-8'}.get(comp_type, 'Device:R')
        
        x = comp.get('x', 100) + index * 50
        y = comp.get('y', 100)
        
        lines = [
            f"  (symbol",
            f"    (lib_id \"{lib_name}\")",
            f"    (at {x / 10:.2f} {y / 10:.2f} 0)",
            f"    (unit 1)",
            f"    (convert 1)",
            f"    (reference \"{ref_prefix}{index + 1}\")",
            f"    (in_bom yes)",
            f"    (on_board yes)",
            f"    (uuid \"{uuid.uuid4()}\")",
            f"  )"
        ]
        
        return lines
    
    def _generate_wires(self, connections):
        lines = []
        
        for i, conn in enumerate(connections):
            x1 = 100 + i * 10
            y1 = 100
            x2 = 200 + i * 10
            y2 = 100
            
            lines.extend([
                f"  (wire",
                f"    (pts",
                f"      (xy {x1 / 10:.2f} {y1 / 10:.2f})",
                f"      (xy {x2 / 10:.2f} {y2 / 10:.2f})",
                f"    )",
                f"    (stroke (width 0) (type default))",
                f"  )"
            ])
        
        return lines
    
    def _generate_pcbnew(self, components, routing_suggestions):
        lines = []
        
        lines.append("(kicad_pcb")
        lines.append(f"  (version 20211014)")
        lines.append(f"  (generator \"Circuit OCR\")")
        lines.append("")
        
        lines.append("  (setup")
        lines.append("    (pad_to_mask_clearance 0)")
        lines.append("    (pcbplotparams")
        lines.append("      (layerselection 0x00010_80000001)")
        lines.append("    )")
        lines.append("  )")
        lines.append("")
        
        lines.append("  (layers")
        lines.append("    (0 \"F.Cu\" signal)")
        lines.append("    (31 \"B.Cu\" signal)")
        lines.append("    (32 \"B.Adhes\" user)")
        lines.append("    (33 \"F.Adhes\" user)")
        lines.append("  )")
        lines.append("")
        
        for i, comp in enumerate(components):
            footprint = self._generate_footprint(comp, i)
            lines.extend(footprint)
            lines.append("")
        
        for route in routing_suggestions.get('suggestions', []):
            track = self._generate_track(route)
            lines.extend(track)
            lines.append("")
        
        lines.append(")")
        
        return "\n".join(lines)
    
    def _generate_footprint(self, comp, index):
        comp_type = comp.get('type', 'UNKNOWN')
        ref_prefix = {'RESISTOR': 'R', 'CAPACITOR': 'C', 'IC': 'U'}.get(comp_type, 'X')
        fp_type = {'RESISTOR': 'Resistor_SMD:R_0805_2012Metric', 
                    'CAPACITOR': 'Capacitor_SMD:C_0805_2012Metric', 
                    'IC': 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'}.get(comp_type, 'Resistor_SMD:R_0805_2012Metric')
        
        x = comp.get('x', 100) * 1000000
        y = comp.get('y', 100) * 1000000
        
        lines = [
            f"  (footprint \"{fp_type}\"",
            f"    (layer \"F.Cu\")",
            f"    (tedit {uuid.uuid4().hex[:8]})",
            f"    (at {x / 1000000:.6f} {y / 1000000:.6f})",
            f"    (descr \"{comp_type}\")",
            f"    (tags \"{comp_type}\")",
            f"    (property \"Reference\" \"{ref_prefix}{index + 1}\"",
            f"      (at 0 -1.27 0)",
            f"      (layer \"F.SilkS\")",
            f"      (effects (font (size 1 1) (thickness 0.15)))",
            f"    )",
            f"  )"
        ]
        
        return lines
    
    def _generate_track(self, route):
        lines = []
        
        path = route.get('path', [])
        if len(path) >= 2:
            for i in range(len(path) - 1):
                x1, y1 = path[i]
                x2, y2 = path[i + 1]
                
                lines.extend([
                    f"  (segment",
                    f"    (start {x1 / 10:.6f} {y1 / 10:.6f})",
                    f"    (end {x2 / 10:.6f} {y2 / 10:.6f})",
                    f"    (width 0.2)",
                    f"    (layer \"F.Cu\")",
                    f"    (net 0)",
                    f"  )"
                ])
        
        return lines
    
    def _generate_spice_netlist(self, components, connections):
        from spice_generator.netlist_generator import NetlistGenerator
        generator = NetlistGenerator()
        
        from graph_builder.circuit_graph import CircuitGraph
        graph = CircuitGraph()
        for comp in components:
            graph.add_component(comp['id'], comp.get('type', 'UNKNOWN'))
        
        comp_data = {c['id']: c for c in components}
        
        return generator.generate_detailed_netlist(graph, comp_data)
    
    def _generate_project_file(self, project_name, output_path):
        import json
        project_data = {
            "board": {
                "3d_viewer": {
                    "opacity": 1.0,
                    "show_footprints": True
                }
            },
            "schematic": {
                "page_layout": {
                    "paper_size": "A4"
                }
            },
            "meta": {
                "filename": f"{project_name}.kicad_pro",
                "version": 1
            }
        }
        
        with open(output_path, 'w') as f:
            json.dump(project_data, f, indent=2)
