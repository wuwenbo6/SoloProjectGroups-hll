from enum import Enum
from typing import List, Optional


class ClientSignalType(str, Enum):
    ODU0 = "ODU0"
    ODUflex = "ODUflex"


class ODUType(str, Enum):
    ODU0 = "ODU0"
    ODU2 = "ODU2"
    ODU3 = "ODU3"


ODU_PARAMS = {
    ODUType.ODU0: {"rows": 4, "columns": 3824, "payload_columns": 3808, "timeslots": 1, "bitrate_gbps": 1.244160},
    ODUType.ODU2: {"rows": 4, "columns": 3824, "payload_columns": 3808, "timeslots": 8, "bitrate_gbps": 10.037318},
    ODUType.ODU3: {"rows": 4, "columns": 3824, "payload_columns": 3808, "timeslots": 32, "bitrate_gbps": 40.319219},
}

TS_BITRATE_GBPS = 1.244160

FRAME_ZONES = [
    {"name": "FAS", "start_col": 1, "end_col": 7, "rows": [1, 2, 3, 4], "color": "#FF4444"},
    {"name": "MFAS", "start_col": 8, "end_col": 8, "rows": [1, 2, 3, 4], "color": "#FF8844"},
    {"name": "ODUk OH", "start_col": 9, "end_col": 14, "rows": [1, 2, 3, 4], "color": "#4488FF"},
    {"name": "OPUk OH", "start_col": 15, "end_col": 16, "rows": [1, 2, 3, 4], "color": "#44CC88"},
    {"name": "Payload", "start_col": 17, "end_col": 3808, "rows": [1, 2, 3, 4], "color": "#1A3A5C"},
    {"name": "FEC", "start_col": 3809, "end_col": 3824, "rows": [1, 2, 3, 4], "color": "#8844CC"},
]


class ODUFrame:
    def __init__(self, odu_type: ODUType):
        self.odu_type = odu_type
        params = ODU_PARAMS[odu_type]
        self.rows = params["rows"]
        self.columns = params["columns"]
        self.payload_columns = params["payload_columns"]
        self.num_timeslots = params["timeslots"]
        self.bitrate_gbps = params["bitrate_gbps"]
        self.data = [[0] * self.columns for _ in range(self.rows)]
        self._init_fas()
        self._init_overhead_area()

    def _init_fas(self):
        fas_pattern = [0xF6, 0xF6, 0xF6, 0x28, 0x28, 0x28]
        for row in range(self.rows):
            for i, val in enumerate(fas_pattern):
                self.data[row][i] = val

    def _init_overhead_area(self):
        self.data[0][7] = 0x00

    def set_byte(self, row: int, col: int, value: int):
        if 0 <= row < self.rows and 0 <= col < self.columns:
            self.data[row][col] = value & 0xFF

    def get_byte(self, row: int, col: int) -> int:
        if 0 <= row < self.rows and 0 <= col < self.columns:
            return self.data[row][col]
        return 0

    def get_zone_for_position(self, row: int, col: int) -> Optional[str]:
        for zone in FRAME_ZONES:
            if (row + 1) in zone["rows"] and zone["start_col"] <= (col + 1) <= zone["end_col"]:
                return zone["name"]
        return None

    def get_zone_color(self, zone_name: str) -> str:
        for zone in FRAME_ZONES:
            if zone["name"] == zone_name:
                return zone["color"]
        return "#333333"

    def to_dict(self) -> dict:
        return {
            "oduType": self.odu_type.value,
            "rows": self.rows,
            "columns": self.columns,
            "payloadColumns": self.payload_columns,
            "numTimeslots": self.num_timeslots,
            "bitrateGbps": self.bitrate_gbps,
            "data": self.data,
            "zones": FRAME_ZONES,
        }
