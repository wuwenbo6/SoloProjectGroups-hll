from dataclasses import dataclass, field
from typing import Dict, Optional, List
import time


@dataclass
class MacTableEntry:
    mac_address: str
    port_id: int
    timestamp: float = field(default_factory=time.time)
    age: int = 300

    def to_dict(self) -> dict:
        current_time = time.time()
        return {
            'macAddress': self.mac_address,
            'portId': self.port_id,
            'timestamp': self.timestamp,
            'age': max(0, int(self.age - (current_time - self.timestamp))),
        }

    def is_expired(self) -> bool:
        return time.time() - self.timestamp > self.age

    def refresh(self) -> None:
        self.timestamp = time.time()


class MacTable:
    def __init__(self, aging_time: int = 300):
        self._entries: Dict[str, MacTableEntry] = {}
        self.aging_time = aging_time

    def learn(self, mac_address: str, port_id: int) -> bool:
        normalized_mac = mac_address.lower()
        is_new = normalized_mac not in self._entries
        
        if is_new:
            self._entries[normalized_mac] = MacTableEntry(
                mac_address=normalized_mac,
                port_id=port_id,
                age=self.aging_time
            )
        else:
            entry = self._entries[normalized_mac]
            if entry.port_id != port_id:
                entry.port_id = port_id
                is_new = True
            entry.refresh()
        
        self._clean_expired()
        return is_new

    def lookup(self, mac_address: str) -> Optional[int]:
        normalized_mac = mac_address.lower()
        entry = self._entries.get(normalized_mac)
        
        if entry and not entry.is_expired():
            entry.refresh()
            return entry.port_id
        
        if entry and entry.is_expired():
            del self._entries[normalized_mac]
        
        return None

    def remove(self, mac_address: str) -> bool:
        normalized_mac = mac_address.lower()
        if normalized_mac in self._entries:
            del self._entries[normalized_mac]
            return True
        return False

    def clear(self) -> None:
        self._entries.clear()

    def get_all_entries(self) -> List[MacTableEntry]:
        self._clean_expired()
        return list(self._entries.values())

    def size(self) -> int:
        self._clean_expired()
        return len(self._entries)

    def _clean_expired(self) -> None:
        expired = [mac for mac, entry in self._entries.items() if entry.is_expired()]
        for mac in expired:
            del self._entries[mac]

    def to_dict(self) -> List[dict]:
        return [entry.to_dict() for entry in self.get_all_entries()]
