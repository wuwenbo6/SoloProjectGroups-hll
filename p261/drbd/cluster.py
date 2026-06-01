from .bitmap import Bitmap
from .node import DRBDNode, STATE_CONNECTED, STATE_SPLIT_BRAIN, STATE_RECOVERED
from .recovery import SplitBrainDetector, NodeSelector, RecoveryOrchestrator
from .protocol import make_message
import threading
import time


class Cluster:
    def __init__(self, event_callback=None):
        self.nodes = {}
        self.links = {}
        self.partitioned = False
        self._event_callback = event_callback
        self._node_callbacks = {}
        self._lock = threading.Lock()

    def _cluster_event(self, event_type, **kwargs):
        if self._event_callback:
            self._event_callback(event_type, **kwargs)

    def add_node(self, node_id, port, priority=1, bitmap_size=256):
        node = DRBDNode(node_id, port, priority=priority, bitmap_size=bitmap_size)

        def on_node_event(nid, etype, **ekwargs):
            self._cluster_event(
                "node_event", node_id=nid, event=etype, **ekwargs
            )

        node.set_event_callback(on_node_event)
        self.nodes[node_id] = node
        node.start_server()
        self._cluster_event("node_added", node_id=node_id, port=port, priority=priority)
        return node

    def connect(self, node_a_id, node_b_id):
        node_a = self.nodes[node_a_id]
        node_b = self.nodes[node_b_id]

        node_a.connect_to_peer(node_b.port)
        time.sleep(0.5)

        self.links[frozenset([node_a_id, node_b_id])] = True
        self.partitioned = False
        self._cluster_event("connected", node_a=node_a_id, node_b=node_b_id)

    def partition(self, node_a_id, node_b_id):
        node_a = self.nodes[node_a_id]
        node_b = self.nodes[node_b_id]

        node_a.disconnect_peer()
        node_b.disconnect_peer()

        self.links[frozenset([node_a_id, node_b_id])] = False
        self.partitioned = True
        self._cluster_event("partitioned", node_a=node_a_id, node_b=node_b_id)

    def reconnect(self, node_a_id, node_b_id):
        self.partitioned = False
        node_a = self.nodes[node_a_id]
        node_b = self.nodes[node_b_id]

        node_a.connect_to_peer(node_b.port)
        time.sleep(0.5)

        self.links[frozenset([node_a_id, node_b_id])] = True
        self._cluster_event("reconnected", node_a=node_a_id, node_b=node_b_id)

    def write_to_node(self, node_id, block_id, data=None):
        node = self.nodes[node_id]
        return node.write_block(block_id, data)

    def get_status(self):
        status = {}
        for nid, node in self.nodes.items():
            status[nid] = node.get_status()
        return {
            "nodes": status,
            "partitioned": self.partitioned,
            "links": {
                "-".join(sorted(k)): v for k, v in self.links.items()
            },
        }

    def stop_all(self):
        for node in self.nodes.values():
            node.stop()
        self._cluster_event("cluster_stopped")
