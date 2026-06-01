from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Topology(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    nodes = db.relationship('Node', backref='topology', lazy=True, cascade='all, delete-orphan')
    links = db.relationship('Link', backref='topology', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'nodes': [node.to_dict() for node in self.nodes],
            'links': [link.to_dict() for link in self.links]
        }

class Node(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    topology_id = db.Column(db.Integer, db.ForeignKey('topology.id'), nullable=False)
    node_id = db.Column(db.String(50), nullable=False)
    type = db.Column(db.String(20), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    x = db.Column(db.Float, default=0)
    y = db.Column(db.Float, default=0)
    ip = db.Column(db.String(20))
    mac = db.Column(db.String(20))
    dpid = db.Column(db.String(30))

    def to_dict(self):
        return {
            'id': self.node_id,
            'type': self.type,
            'name': self.name,
            'x': self.x,
            'y': self.y,
            'ip': self.ip,
            'mac': self.mac,
            'dpid': self.dpid
        }

class Link(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    topology_id = db.Column(db.Integer, db.ForeignKey('topology.id'), nullable=False)
    link_id = db.Column(db.String(50), nullable=False)
    source_id = db.Column(db.String(50), nullable=False)
    target_id = db.Column(db.String(50), nullable=False)
    port1 = db.Column(db.Integer)
    port2 = db.Column(db.Integer)

    def to_dict(self):
        return {
            'id': self.link_id,
            'source': self.source_id,
            'target': self.target_id,
            'port1': self.port1,
            'port2': self.port2
        }

class FlowRule(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    rule_id = db.Column(db.String(50), nullable=False)
    switch_id = db.Column(db.String(50), nullable=False)
    priority = db.Column(db.Integer, default=100)
    match_fields = db.Column(db.Text, nullable=False)
    actions = db.Column(db.Text, nullable=False)
    meter_id = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        import json
        return {
            'id': self.rule_id,
            'switchId': self.switch_id,
            'priority': self.priority,
            'match': json.loads(self.match_fields),
            'actions': json.loads(self.actions),
            'meterId': self.meter_id
        }

class MeterTable(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    meter_id = db.Column(db.String(50), nullable=False)
    switch_id = db.Column(db.String(50), nullable=False)
    rate = db.Column(db.Integer, nullable=False, default=1000)
    burst_size = db.Column(db.Integer, nullable=False, default=100)
    meter_type = db.Column(db.String(20), nullable=False, default='kbps')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.meter_id,
            'switchId': self.switch_id,
            'rate': self.rate,
            'burstSize': self.burst_size,
            'type': self.meter_type
        }

class GroupTable(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.String(50), nullable=False)
    switch_id = db.Column(db.String(50), nullable=False)
    group_type = db.Column(db.String(20), nullable=False, default='ALL')
    buckets = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        import json
        return {
            'id': self.group_id,
            'switchId': self.switch_id,
            'type': self.group_type,
            'buckets': json.loads(self.buckets)
        }

class TrafficStats(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    switch_id = db.Column(db.String(50), nullable=False)
    port = db.Column(db.Integer, nullable=False)
    rx_packets = db.Column(db.Integer, default=0)
    tx_packets = db.Column(db.Integer, default=0)
    rx_bytes = db.Column(db.Integer, default=0)
    tx_bytes = db.Column(db.Integer, default=0)
    rx_errors = db.Column(db.Integer, default=0)
    tx_errors = db.Column(db.Integer, default=0)
    flow_id = db.Column(db.String(50), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'switchId': self.switch_id,
            'port': self.port,
            'rx_packets': self.rx_packets,
            'tx_packets': self.tx_packets,
            'rx_bytes': self.rx_bytes,
            'tx_bytes': self.tx_bytes,
            'rx_errors': self.rx_errors,
            'tx_errors': self.tx_errors,
            'flowId': self.flow_id
        }
