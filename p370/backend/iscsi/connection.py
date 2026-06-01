import asyncio
import uuid
import threading
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple

from .types import ConnectionState, ConnectionInfo, ISCSIPDU


class ConnectionManager:
    _VALID_TRANSITIONS: Dict[ConnectionState, Set[ConnectionState]] = {
        ConnectionState.FREE: {ConnectionState.XPT_WAIT},
        ConnectionState.XPT_WAIT: {ConnectionState.IN_LOGIN},
        ConnectionState.IN_LOGIN: {ConnectionState.LOGGED_IN},
        ConnectionState.LOGGED_IN: {ConnectionState.IN_LOGOUT, ConnectionState.ERROR_RECOVERY},
        ConnectionState.IN_LOGOUT: {ConnectionState.LOGOUT_REQUESTED},
        ConnectionState.LOGOUT_REQUESTED: {ConnectionState.CLEANUP_WAIT},
        ConnectionState.CLEANUP_WAIT: {ConnectionState.FREE},
        ConnectionState.ERROR_RECOVERY: {ConnectionState.LOGGED_IN},
    }

    def __init__(self) -> None:
        self.connections: Dict[str, ConnectionInfo] = {}
        self.receive_queues: Dict[str, asyncio.Queue] = {}
        self.send_queues: Dict[str, asyncio.Queue] = {}
        self._lock: threading.Lock = threading.Lock()

    def _validate_state_transition(self, current: ConnectionState, target: ConnectionState) -> bool:
        if current == target:
            return True
        valid_next = self._VALID_TRANSITIONS.get(current, set())
        return target in valid_next

    def create_connection(
        self,
        address: str,
        cid: int,
        session_id: Optional[str] = None,
    ) -> ConnectionInfo:
        if not isinstance(cid, int) or cid < 0 or cid > 65535:
            raise ValueError("Connection ID (cid) must be an integer between 0 and 65535")

        with self._lock:
            connection_id = uuid.uuid4().hex

            connection_info = ConnectionInfo(
                connection_id=connection_id,
                address=address,
                cid=cid,
                state=ConnectionState.FREE,
                session_id=session_id,
            )

            self.connections[connection_id] = connection_info
            self.receive_queues[connection_id] = asyncio.Queue()
            self.send_queues[connection_id] = asyncio.Queue()

            return connection_info

    def remove_connection(self, connection_id: str) -> bool:
        with self._lock:
            if connection_id not in self.connections:
                return False

            del self.connections[connection_id]
            self.receive_queues.pop(connection_id, None)
            self.send_queues.pop(connection_id, None)

            return True

    def get_connection(self, connection_id: str) -> Optional[ConnectionInfo]:
        with self._lock:
            return self.connections.get(connection_id)

    def update_connection_state(
        self,
        connection_id: str,
        state: ConnectionState,
    ) -> bool:
        with self._lock:
            connection = self.connections.get(connection_id)
            if connection is None:
                return False

            if not self._validate_state_transition(connection.state, state):
                return False

            connection.state = state
            connection.last_activity = datetime.now()

            return True

    def get_connections_by_session(self, session_id: str) -> List[ConnectionInfo]:
        with self._lock:
            return [
                conn
                for conn in self.connections.values()
                if conn.session_id == session_id
            ]

    def get_all_connections(self) -> List[ConnectionInfo]:
        with self._lock:
            return list(self.connections.values())

    async def send_pdu(self, connection_id: str, pdu: ISCSIPDU) -> bool:
        with self._lock:
            connection = self.connections.get(connection_id)
            if connection is None:
                return False
            if connection.is_faulty:
                return False
            if connection.state == ConnectionState.FREE:
                return False

            queue = self.send_queues.get(connection_id)
            if queue is None:
                return False

        connection.last_activity = datetime.now()
        if "pdus_sent" not in connection.stats:
            connection.stats["pdus_sent"] = 0
        connection.stats["pdus_sent"] += 1

        await queue.put(pdu)
        return True

    async def receive_pdu(self, connection_id: str) -> Optional[ISCSIPDU]:
        with self._lock:
            connection = self.connections.get(connection_id)
            if connection is None:
                return None
            if connection.is_faulty:
                return None

            queue = self.receive_queues.get(connection_id)
            if queue is None:
                return None

        try:
            pdu = queue.get_nowait()
            connection.last_activity = datetime.now()
            if "pdus_received" not in connection.stats:
                connection.stats["pdus_received"] = 0
            connection.stats["pdus_received"] += 1
            return pdu
        except asyncio.QueueEmpty:
            return None

    async def enqueue_received_pdu(self, connection_id: str, pdu: ISCSIPDU) -> bool:
        with self._lock:
            connection = self.connections.get(connection_id)
            if connection is None:
                return False
            if connection.is_faulty:
                return False

            queue = self.receive_queues.get(connection_id)
            if queue is None:
                return False

        await queue.put(pdu)
        return True

    async def dequeue_send_pdu(self, connection_id: str) -> Optional[ISCSIPDU]:
        with self._lock:
            connection = self.connections.get(connection_id)
            if connection is None:
                return None

            queue = self.send_queues.get(connection_id)
            if queue is None:
                return None

        try:
            return queue.get_nowait()
        except asyncio.QueueEmpty:
            return None

    def simulate_fault(self, connection_id: str) -> bool:
        with self._lock:
            connection = self.connections.get(connection_id)
            if connection is None:
                return False

            connection.is_faulty = True
            connection.last_activity = datetime.now()

            return True

    def recover_connection(self, connection_id: str) -> bool:
        with self._lock:
            connection = self.connections.get(connection_id)
            if connection is None:
                return False

            connection.is_faulty = False
            connection.last_activity = datetime.now()

            return True
