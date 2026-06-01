import json
from models import db, Topology, Node, Link

class TopologyService:
    @staticmethod
    def get_all_topologies():
        topologies = Topology.query.all()
        return [{'id': t.id, 'name': t.name, 'created_at': t.created_at.isoformat()} for t in topologies]

    @staticmethod
    def get_topology(topology_id):
        topology = Topology.query.get(topology_id)
        return topology.to_dict() if topology else None

    @staticmethod
    def create_topology(name, nodes_data, links_data):
        topology = Topology(name=name)
        db.session.add(topology)
        db.session.flush()

        for node_data in nodes_data:
            node = Node(
                topology_id=topology.id,
                node_id=node_data['id'],
                type=node_data['type'],
                name=node_data.get('name', node_data['id']),
                x=node_data.get('x', 0),
                y=node_data.get('y', 0),
                ip=node_data.get('ip'),
                mac=node_data.get('mac'),
                dpid=node_data.get('dpid')
            )
            db.session.add(node)

        for link_data in links_data:
            link = Link(
                topology_id=topology.id,
                link_id=link_data['id'],
                source_id=link_data['source'],
                target_id=link_data['target'],
                port1=link_data.get('port1'),
                port2=link_data.get('port2')
            )
            db.session.add(link)

        db.session.commit()
        return topology.to_dict()

    @staticmethod
    def update_topology(topology_id, nodes_data, links_data):
        topology = Topology.query.get(topology_id)
        if not topology:
            return None

        Node.query.filter_by(topology_id=topology_id).delete()
        Link.query.filter_by(topology_id=topology_id).delete()

        for node_data in nodes_data:
            node = Node(
                topology_id=topology.id,
                node_id=node_data['id'],
                type=node_data['type'],
                name=node_data.get('name', node_data['id']),
                x=node_data.get('x', 0),
                y=node_data.get('y', 0),
                ip=node_data.get('ip'),
                mac=node_data.get('mac'),
                dpid=node_data.get('dpid')
            )
            db.session.add(node)

        for link_data in links_data:
            link = Link(
                topology_id=topology.id,
                link_id=link_data['id'],
                source_id=link_data['source'],
                target_id=link_data['target'],
                port1=link_data.get('port1'),
                port2=link_data.get('port2')
            )
            db.session.add(link)

        db.session.commit()
        return topology.to_dict()

    @staticmethod
    def delete_topology(topology_id):
        topology = Topology.query.get(topology_id)
        if topology:
            db.session.delete(topology)
            db.session.commit()
            return True
        return False
