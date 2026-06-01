from typing import List, Dict, Any, Optional, Tuple
from .frame import ODUFrame, ODUType, ODU_PARAMS, ClientSignalType


class TimeslotInfo:
    def __init__(self, index: int, total_ts: int = 8):
        self.index = index
        self.occupied: bool = False
        self.odu0_id: Optional[str] = None
        self.mapping_type: Optional[str] = None
        self.total_ts = total_ts
        self.lck: bool = False
        self.signal_type: str = ClientSignalType.ODU0.value
        self.ts_count: int = 1
        self.is_lead: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "index": self.index,
            "occupied": self.occupied,
            "odu0Id": self.odu0_id,
            "mappingType": self.mapping_type,
            "lck": self.lck,
            "signalType": self.signal_type,
            "tsCount": self.ts_count,
            "isLead": self.is_lead,
        }


class TimeslotManager:
    def __init__(self, odu_type: ODUType):
        self.odu_type = odu_type
        params = ODU_PARAMS[odu_type]
        self.num_timeslots = params["timeslots"]
        self.timeslots: List[TimeslotInfo] = [
            TimeslotInfo(index=i + 1, total_ts=self.num_timeslots)
            for i in range(self.num_timeslots)
        ]

    def get_all(self) -> List[TimeslotInfo]:
        return self.timeslots

    def get_free(self) -> List[TimeslotInfo]:
        return [ts for ts in self.timeslots if not ts.occupied]

    def get_occupied(self) -> List[TimeslotInfo]:
        return [ts for ts in self.timeslots if ts.occupied]

    def find_contiguous_free(self, ts_count: int) -> Optional[int]:
        for start in range(self.num_timeslots - ts_count + 1):
            if all(not self.timeslots[start + i].occupied for i in range(ts_count)):
                return start + 1
        return None

    def allocate(self, ts_index: int, odu0_id: str, mapping_type: str = "GMP",
                 ts_count: int = 1, signal_type: str = ClientSignalType.ODU0.value) -> Optional[List[TimeslotInfo]]:
        if ts_index < 1 or ts_index + ts_count - 1 > self.num_timeslots:
            return None
        start_idx = ts_index - 1
        for i in range(ts_count):
            if self.timeslots[start_idx + i].occupied:
                return None
        allocated = []
        for i in range(ts_count):
            ts = self.timeslots[start_idx + i]
            ts.occupied = True
            ts.odu0_id = odu0_id
            ts.mapping_type = mapping_type
            ts.lck = False
            ts.signal_type = signal_type
            ts.ts_count = ts_count
            ts.is_lead = (i == 0)
            allocated.append(ts)
        return allocated

    def release(self, ts_index: int) -> Optional[List[TimeslotInfo]]:
        if 1 <= ts_index <= self.num_timeslots:
            ts = self.timeslots[ts_index - 1]
            if not ts.occupied:
                return None
            signal_id = ts.odu0_id
            ts_count = ts.ts_count
            released = []
            start_idx = ts_index - 1
            for i in range(ts_count):
                idx = start_idx + i
                if idx < self.num_timeslots and self.timeslots[idx].odu0_id == signal_id:
                    self.timeslots[idx].occupied = False
                    self.timeslots[idx].odu0_id = None
                    self.timeslots[idx].mapping_type = None
                    self.timeslots[idx].signal_type = ClientSignalType.ODU0.value
                    self.timeslots[idx].ts_count = 1
                    self.timeslots[idx].is_lead = False
                    released.append(self.timeslots[idx])
            return released
        return None

    def auto_allocate(self, odu0_id: str, mapping_type: str = "GMP",
                      ts_count: int = 1, signal_type: str = ClientSignalType.ODU0.value) -> Optional[List[TimeslotInfo]]:
        start = self.find_contiguous_free(ts_count)
        if start is not None:
            return self.allocate(start, odu0_id, mapping_type, ts_count, signal_type)
        return None

    def get_occupancy_rate(self) -> float:
        occupied = sum(1 for ts in self.timeslots if ts.occupied)
        return occupied / self.num_timeslots if self.num_timeslots > 0 else 0.0

    def to_dict_list(self) -> List[Dict[str, Any]]:
        return [ts.to_dict() for ts in self.timeslots]
