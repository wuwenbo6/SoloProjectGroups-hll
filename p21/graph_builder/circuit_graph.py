import networkx as nx
from collections import defaultdict

class CircuitGraph:
    def __init__(self):
        self.graph = nx.Graph()
        self.components = {}
        self.nodes = {}
        self.node_counter = 1
    
    def add_component(self, comp_id, comp_type, properties=None):
        if comp_id not in self.components:
            self.components[comp_id] = {
                'type': comp_type,
                'properties': properties or {},
                'terminals': []
            }
            self.graph.add_node(comp_id, type='component', comp_type=comp_type)
    
    def add_node(self, position=None):
        node_id = f"n{self.node_counter}"
        self.node_counter += 1
        self.nodes[node_id] = {
            'position': position
        }
        self.graph.add_node(node_id, type='node')
        return node_id
    
    def connect(self, comp1_id, terminal1, comp2_id, terminal2):
        self.graph.add_edge(
            comp1_id, comp2_id,
            terminal1=terminal1,
            terminal2=terminal2
        )
    
    def connect_to_node(self, comp_id, terminal, node_id):
        self.graph.add_edge(
            comp_id, node_id,
            terminal=terminal
        )
    
    def get_connected_components(self, comp_id):
        neighbors = list(self.graph.neighbors(comp_id))
        return neighbors
    
    def find_common_nodes(self):
        common_nodes = defaultdict(list)
        
        for node in self.graph.nodes(data=True):
            node_id, data = node
            if data.get('type') == 'node':
                connections = list(self.graph.neighbors(node_id))
                if len(connections) >= 2:
                    common_nodes[node_id] = connections
        
        return dict(common_nodes)
    
    def simplify_graph(self):
        simplified = nx.Graph()
        
        for comp_id, comp_data in self.components.items():
            simplified.add_node(comp_id, type='component', comp_type=comp_data['type'])
        
        for u, v, data in self.graph.edges(data=True):
            u_data = self.graph.nodes[u]
            v_data = self.graph.nodes[v]
            
            if u_data.get('type') == 'component' and v_data.get('type') == 'component':
                simplified.add_edge(u, v, **data)
            elif u_data.get('type') == 'node':
                neighbors = list(self.graph.neighbors(u))
                for i, n1 in enumerate(neighbors):
                    for n2 in neighbors[i+1:]:
                        simplified.add_edge(n1, n2)
            elif v_data.get('type') == 'node':
                neighbors = list(self.graph.neighbors(v))
                for i, n1 in enumerate(neighbors):
                    for n2 in neighbors[i+1:]:
                        simplified.add_edge(n1, n2)
        
        return simplified
    
    def get_component_connections(self, comp_id):
        connections = []
        for neighbor in self.graph.neighbors(comp_id):
            edge_data = self.graph.get_edge_data(comp_id, neighbor)
            connections.append({
                'connected_to': neighbor,
                'edge_data': edge_data
            })
        return connections
