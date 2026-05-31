import os
import json
import gc
from datetime import datetime
from pyswmm import Simulation, Nodes, Links, Subcatchments
from app import db
from app.models import Simulation as SimModel, NodeResult, LinkResult, NetworkNode, NetworkLink, Subcatchment

class SWMMSimulator:
    BATCH_SIZE = 100
    
    def __init__(self, inp_file_path):
        self.inp_file_path = inp_file_path
        self.simulation_id = None
        self.node_buffer = []
        self.link_buffer = []
        self.batch_counter = 0
        
    def run_simulation(self, simulation_name="Default Simulation"):
        sim_record = SimModel(
            name=simulation_name,
            status='running',
            start_time=datetime.utcnow()
        )
        db.session.add(sim_record)
        db.session.commit()
        self.simulation_id = sim_record.id
        
        self.node_buffer = []
        self.link_buffer = []
        self.batch_counter = 0
        
        try:
            with Simulation(self.inp_file_path) as sim:
                nodes = Nodes(sim)
                links = Links(sim)
                subcatchments = Subcatchments(sim)
                
                self._save_network_info(nodes, links, subcatchments)
                
                for step in sim:
                    current_time = sim.current_time
                    self._buffer_node_results(nodes, current_time)
                    self._buffer_link_results(links, current_time)
                    
                    self.batch_counter += 1
                    if self.batch_counter >= self.BATCH_SIZE:
                        self._flush_buffers()
                        gc.collect()
                
                self._flush_buffers()
                    
            sim_record.status = 'completed'
            sim_record.end_time = datetime.utcnow()
            sim_record.duration = (sim_record.end_time - sim_record.start_time).total_seconds()
            db.session.commit()
            
            return {
                'success': True,
                'simulation_id': self.simulation_id,
                'message': 'Simulation completed successfully'
            }
            
        except Exception as e:
            self._flush_buffers()
            sim_record.status = 'failed'
            db.session.commit()
            return {
                'success': False,
                'error': str(e)
            }
    
    def _save_network_info(self, nodes, links, subcatchments):
        for node in nodes:
            existing = NetworkNode.query.filter_by(node_id=node.nodeid).first()
            if not existing:
                network_node = NetworkNode(
                    node_id=node.nodeid,
                    node_type=node.type,
                    x_coord=node.coordinates[0],
                    y_coord=node.coordinates[1],
                    invert_elev=node.invert_elevation,
                    max_depth=node.max_depth
                )
                db.session.add(network_node)
        
        for link in links:
            existing = NetworkLink.query.filter_by(link_id=link.linkid).first()
            if not existing:
                network_link = NetworkLink(
                    link_id=link.linkid,
                    link_type=link.type,
                    from_node=link.connections[0],
                    to_node=link.connections[1],
                    length=link.length,
                    roughness=link.roughness
                )
                db.session.add(network_link)
        
        for sub in subcatchments:
            existing = Subcatchment.query.filter_by(subcatchment_id=sub.subcatchmentid).first()
            if not existing:
                subcatchment = Subcatchment(
                    subcatchment_id=sub.subcatchmentid,
                    outlet=sub.outlet,
                    area=sub.area,
                    width=sub.width,
                    slope=sub.slope,
                    perc_imperv=sub.percent_impervious,
                    n_imperv=sub.n_imperv,
                    n_perv=sub.n_perv
                )
                db.session.add(subcatchment)
        
        db.session.commit()
    
    def _buffer_node_results(self, nodes, timestamp):
        for node in nodes:
            self.node_buffer.append({
                'simulation_id': self.simulation_id,
                'node_id': node.nodeid,
                'timestamp': timestamp,
                'depth': node.depth,
                'head': node.head,
                'volume': node.volume,
                'lateral_inflow': node.lateral_inflow,
                'total_inflow': node.total_inflow,
                'flooding': node.flooding
            })
    
    def _buffer_link_results(self, links, timestamp):
        for link in links:
            self.link_buffer.append({
                'simulation_id': self.simulation_id,
                'link_id': link.linkid,
                'timestamp': timestamp,
                'flow': link.flow,
                'velocity': link.velocity,
                'depth': link.depth,
                'capacity': link.capacity
            })
    
    def _flush_buffers(self):
        if self.node_buffer:
            db.session.bulk_insert_mappings(NodeResult, self.node_buffer)
            self.node_buffer = []
        
        if self.link_buffer:
            db.session.bulk_insert_mappings(LinkResult, self.link_buffer)
            self.link_buffer = []
        
        db.session.commit()
        self.batch_counter = 0
    
    def get_node_results(self, simulation_id, node_id=None):
        query = NodeResult.query.filter_by(simulation_id=simulation_id)
        if node_id:
            query = query.filter_by(node_id=node_id)
        results = query.all()
        return [self._result_to_dict(r) for r in results]
    
    def get_link_results(self, simulation_id, link_id=None):
        query = LinkResult.query.filter_by(simulation_id=simulation_id)
        if link_id:
            query = query.filter_by(link_id=link_id)
        results = query.all()
        return [self._link_result_to_dict(r) for r in results]
    
    def _result_to_dict(self, result):
        return {
            'node_id': result.node_id,
            'timestamp': result.timestamp.isoformat(),
            'depth': result.depth,
            'head': result.head,
            'volume': result.volume,
            'lateral_inflow': result.lateral_inflow,
            'total_inflow': result.total_inflow,
            'flooding': result.flooding
        }
    
    def _link_result_to_dict(self, result):
        return {
            'link_id': result.link_id,
            'timestamp': result.timestamp.isoformat(),
            'flow': result.flow,
            'velocity': result.velocity,
            'depth': result.depth,
            'capacity': result.capacity
        }

    def get_network_geojson(self):
        nodes = NetworkNode.query.all()
        links = NetworkLink.query.all()
        subcatchments = Subcatchment.query.all()
        
        features = []
        
        for node in nodes:
            features.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [node.x_coord, node.y_coord]
                },
                'properties': {
                    'id': node.node_id,
                    'type': 'node',
                    'node_type': node.node_type,
                    'invert_elev': node.invert_elev,
                    'max_depth': node.max_depth
                }
            })
        
        node_coords = {n.node_id: [n.x_coord, n.y_coord] for n in nodes}
        for link in links:
            if link.from_node in node_coords and link.to_node in node_coords:
                features.append({
                    'type': 'Feature',
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': [
                            node_coords[link.from_node],
                            node_coords[link.to_node]
                        ]
                    },
                    'properties': {
                        'id': link.link_id,
                        'type': 'link',
                        'link_type': link.link_type,
                        'length': link.length,
                        'roughness': link.roughness
                    }
                })
        
        return {
            'type': 'FeatureCollection',
            'features': features
        }

class SWMMParameterEditor:
    def __init__(self, inp_file_path):
        self.inp_file_path = inp_file_path
    
    def modify_subcatchment_area(self, subcatchment_id, new_area):
        return self._modify_inp_file('[SUBCATCHMENTS]', subcatchment_id, 2, new_area)
    
    def modify_roughness(self, link_id, new_roughness):
        return self._modify_inp_file('[CONDUITS]', link_id, 5, new_roughness)
    
    def _modify_inp_file(self, section_name, element_id, column_index, new_value):
        try:
            with open(self.inp_file_path, 'r') as f:
                lines = f.readlines()
            
            in_section = False
            modified = False
            
            for i, line in enumerate(lines):
                if line.strip().startswith(section_name):
                    in_section = True
                    continue
                if in_section and line.strip().startswith('[') and line.strip() != section_name:
                    break
                if in_section and not line.strip().startswith(';') and line.strip():
                    parts = line.split()
                    if len(parts) > column_index and parts[0] == element_id:
                        parts[column_index] = str(new_value)
                        lines[i] = ' '.join(parts) + '\n'
                        modified = True
                        break
            
            if modified:
                with open(self.inp_file_path, 'w') as f:
                    f.writelines(lines)
                return {'success': True, 'message': f'Updated {element_id} in {section_name}'}
            else:
                return {'success': False, 'message': f'Element {element_id} not found in {section_name}'}
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
