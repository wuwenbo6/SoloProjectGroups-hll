import os
import shutil
from app import db
from app.models import Simulation, LIDScenario

class LIDManager:
    LID_TYPES = {
        'permeable_pavement': {
            'name': '透水铺装',
            'params': ['surface', 'pavement', 'soil', 'storage', 'drain']
        }
    }
    
    def __init__(self, base_inp_file):
        self.base_inp_file = base_inp_file
    
    def add_permeable_pavement(self, subcatchment_id, area_ratio=0.3, 
                                pavement_thickness=150, void_ratio=0.4,
                                permeability=100, clogging_factor=1.0):
        temp_inp = self._create_temp_inp()
        
        with open(temp_inp, 'r') as f:
            lines = f.readlines()
        
        lid_usage_content = self._generate_lid_usage(subcatchment_id, area_ratio)
        lid_control_content = self._generate_lid_control(pavement_thickness, void_ratio, 
                                                          permeability, clogging_factor)
        
        lines = self._insert_section(lines, '[LID_USAGE]', lid_usage_content)
        lines = self._insert_section(lines, '[LID_CONTROLS]', lid_control_content)
        
        with open(temp_inp, 'w') as f:
            f.writelines(lines)
        
        return temp_inp
    
    def _create_temp_inp(self):
        temp_file = self.base_inp_file.replace('.inp', '_lid_temp.inp')
        shutil.copy2(self.base_inp_file, temp_file)
        return temp_file
    
    def _insert_section(self, lines, section_name, content):
        in_section = False
        section_start = -1
        section_end = -1
        
        for i, line in enumerate(lines):
            if line.strip().startswith(section_name):
                in_section = True
                section_start = i
            elif in_section and line.strip().startswith('[') and line.strip() != section_name:
                section_end = i
                break
        
        if section_start == -1:
            lines.append('\n' + section_name + '\n')
            lines.append(content + '\n')
        else:
            insert_pos = section_end if section_end > 0 else len(lines)
            lines.insert(insert_pos, content + '\n')
        
        return lines
    
    def _generate_lid_usage(self, subcatchment_id, area_ratio):
        return f"""{subcatchment_id} PERMEABLE_PAVEMENT {area_ratio} 0 0 0 0"""
    
    def _generate_lid_control(self, pavement_thickness, void_ratio, 
                                permeability, clogging_factor):
        return f"""PERMEABLE_PAVEMENT PAVEMENT
PERMEABLE_PAVEMENT SURFACE 0.05 0.01 0.0 0.0 0.0
PERMEABLE_PAVEMENT PAVEMENT {pavement_thickness} {void_ratio} {permeability} 5.0 {clogging_factor}
PERMEABLE_PAVEMENT STORAGE 0 0.4 0.5 0 0
PERMEABLE_PAVEMENT DRAIN 0 0 0 0"""
    
    def run_lid_comparison(self, sim_name_base, subcatchment_id, lid_params=None):
        from app.simulator import SWMMSimulator
        
        sim_base = SWMMSimulator(self.base_inp_file)
        result_base = sim_base.run_simulation(f"{sim_name_base}_无LID")
        
        if lid_params is None:
            lid_params = {}
        
        lid_inp = self.add_permeable_pavement(subcatchment_id, **lid_params)
        sim_lid = SWMMSimulator(lid_inp)
        result_lid = sim_lid.run_simulation(f"{sim_name_base}_透水铺装")
        
        if os.path.exists(lid_inp):
            os.remove(lid_inp)
        
        comparison = self._compare_results(result_base['simulation_id'], result_lid['simulation_id'])
        
        return {
            'success': True,
            'baseline_id': result_base['simulation_id'],
            'lid_id': result_lid['simulation_id'],
            'comparison': comparison
        }
    
    def _compare_results(self, baseline_id, lid_id):
        from app.models import NodeResult, LinkResult
        
        baseline_nodes = NodeResult.query.filter_by(simulation_id=baseline_id).all()
        lid_nodes = NodeResult.query.filter_by(simulation_id=lid_id).all()
        
        baseline_total_flooding = sum(r.flooding for r in baseline_nodes)
        lid_total_flooding = sum(r.flooding for r in lid_nodes)
        
        baseline_max_depth = max(r.depth for r in baseline_nodes) if baseline_nodes else 0
        lid_max_depth = max(r.depth for r in lid_nodes) if lid_nodes else 0
        
        baseline_links = LinkResult.query.filter_by(simulation_id=baseline_id).all()
        lid_links = LinkResult.query.filter_by(simulation_id=lid_id).all()
        
        baseline_max_flow = max(r.flow for r in baseline_links) if baseline_links else 0
        lid_max_flow = max(r.flow for r in lid_links) if lid_links else 0
        
        return {
            'flooding_reduction': (baseline_total_flooding - lid_total_flooding) / max(baseline_total_flooding, 0.001) * 100,
            'baseline_total_flooding': baseline_total_flooding,
            'lid_total_flooding': lid_total_flooding,
            'baseline_max_depth': baseline_max_depth,
            'lid_max_depth': lid_max_depth,
            'baseline_max_flow': baseline_max_flow,
            'lid_max_flow': lid_max_flow,
            'flow_reduction': (baseline_max_flow - lid_max_flow) / max(baseline_max_flow, 0.001) * 100
        }
