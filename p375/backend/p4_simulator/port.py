from enum import Enum
from dataclasses import dataclass, field
from typing import Optional
import time


class PortType(str, Enum):
    NORMAL = 'normal'
    MONITOR = 'monitor'


class PortStatus(str, Enum):
    UP = 'up'
    DOWN = 'down'


@dataclass
class Port:
    id: int
    name: str
    type: PortType = PortType.NORMAL
    status: PortStatus = PortStatus.DOWN
    mac_address: Optional[str] = None
    rx_packets: int = 0
    tx_packets: int = 0
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type.value,
            'status': self.status.value,
            'macAddress': self.mac_address,
            'rxPackets': self.rx_packets,
            'txPackets': self.tx_packets,
        }

    def increment_rx(self) -> None:
        self.rx_packets += 1

    def increment_tx(self) -> None:
        self.tx_packets += 1

    def set_status(self, status: PortStatus) -> None:
        self.status = status

    def set_mac_address(self, mac: str) -> None:
        self.mac_address = mac
