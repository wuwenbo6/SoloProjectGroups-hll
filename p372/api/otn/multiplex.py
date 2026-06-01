from typing import List, Dict, Any, Optional
from .frame import ODUFrame, ODUType, ODU_PARAMS, ClientSignalType, TS_BITRATE_GBPS
from .overhead import ODUOverhead
from .timeslot import TimeslotManager
import uuid

ODU_FRAME_RATE = {
    ODUType.ODU0: 122070.3125,
    ODUType.ODU2: 122070.3125 * 8,
    ODUType.ODU3: 122070.3125 * 32,
}

ODU_BITRATE_BPS = {
    ODUType.ODU0: 1244160000,
    ODUType.ODU2: 10037318000,
    ODUType.ODU3: 40319219000,
}

OPUk_PAYLOAD_BYTES_PER_FRAME = 4 * 3808


class JustificationInfo:
    def __init__(self):
        self.jc: List[int] = [0, 0, 0, 0]
        self.njo: int = 0
        self.pjo: int = 0
        self.just_type: str = "none"
        self.cm: int = 0
        self.cnd: int = 0
        self.client_rate_kbps: float = 0.0
        self.server_ts_rate_kbps: float = 0.0
        self.delta_rate_kbps: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "jc": self.jc,
            "njo": self.njo,
            "pjo": self.pjo,
            "justType": self.just_type,
            "cm": self.cm,
            "cnd": self.cnd,
            "clientRateKbps": round(self.client_rate_kbps, 3),
            "serverTsRateKbps": round(self.server_ts_rate_kbps, 3),
            "deltaRateKbps": round(self.delta_rate_kbps, 3),
        }


class AlarmInfo:
    def __init__(self, alarm_type: str, ts_index: int, signal_id: str, signal_name: str = ""):
        self.alarm_type = alarm_type
        self.ts_index = ts_index
        self.signal_id = signal_id
        self.signal_name = signal_name
        self.active = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "alarmType": self.alarm_type,
            "tsIndex": self.ts_index,
            "signalId": self.signal_id,
            "signalName": self.signal_name,
            "active": self.active,
        }


class ClientSignal:
    def __init__(self, name: str = "ODU0", signal_type: str = ClientSignalType.ODU0.value,
                 bitrate_gbps: Optional[float] = None, ts_count: int = 1):
        self.id: str = str(uuid.uuid4())[:8]
        self.name: str = name
        self.signal_type: str = signal_type
        self.ts_count: int = ts_count
        if signal_type == ClientSignalType.ODUflex.value:
            self.bitrate_gbps: float = bitrate_gbps if bitrate_gbps else TS_BITRATE_GBPS * ts_count
        else:
            self.bitrate_gbps: float = TS_BITRATE_GBPS
        self.overhead: ODUOverhead = ODUOverhead()
        self.frame: ODUFrame = ODUFrame(ODUType.ODU0)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "signalType": self.signal_type,
            "bitrateGbps": round(self.bitrate_gbps, 6),
            "tsCount": self.ts_count,
            "overhead": self.overhead.to_dict(),
        }


class MultiplexEngine:
    def __init__(self, odu_type: ODUType = ODUType.ODU2):
        self.odu_type = odu_type
        self.frame = ODUFrame(odu_type)
        self.overhead = ODUOverhead()
        self.timeslot_mgr = TimeslotManager(odu_type)
        self.signals: Dict[str, ClientSignal] = {}
        self.mapping_type: str = "GMP"
        self.justification_map: Dict[int, JustificationInfo] = {}
        self.alarms: List[AlarmInfo] = []

    def add_signal(self, name: str = "ODU0", signal_type: str = ClientSignalType.ODU0.value,
                   bitrate_gbps: Optional[float] = None, ts_count: int = 1) -> Optional[ClientSignal]:
        if ts_count < 1 or ts_count > self.timeslot_mgr.num_timeslots:
            return None
        free_count = len(self.timeslot_mgr.get_free())
        if free_count < ts_count:
            return None
        signal = ClientSignal(name=name, signal_type=signal_type, bitrate_gbps=bitrate_gbps, ts_count=ts_count)
        self.signals[signal.id] = signal
        return signal

    def add_odu0(self, name: str = "ODU0", bitrate_gbps: float = 1.244160) -> Optional[ClientSignal]:
        return self.add_signal(name=name, signal_type=ClientSignalType.ODU0.value, ts_count=1)

    def remove_signal(self, signal_id: str) -> bool:
        if signal_id not in self.signals:
            return False
        signal = self.signals[signal_id]
        lead_ts = None
        for ts in self.timeslot_mgr.timeslots:
            if ts.odu0_id == signal_id and ts.occupied and ts.is_lead:
                lead_ts = ts
                break
        if lead_ts:
            self._propagate_lck(lead_ts.index, signal_id, signal.name)
            released = self.timeslot_mgr.release(lead_ts.index)
            if released:
                for ts in released:
                    if ts.index in self.justification_map:
                        del self.justification_map[ts.index]
        self._clear_payload_for_signal(signal_id)
        del self.signals[signal_id]
        self.overhead.apply_to_frame(self.frame)
        return True

    def remove_odu0(self, signal_id: str) -> bool:
        return self.remove_signal(signal_id)

    def multiplex(self, signal_id: str, ts_index: Optional[int] = None) -> Optional[Dict[str, Any]]:
        if signal_id not in self.signals:
            return None
        signal = self.signals[signal_id]
        if ts_index is not None:
            tss = self.timeslot_mgr.allocate(ts_index, signal.id, self.mapping_type,
                                             ts_count=signal.ts_count, signal_type=signal.signal_type)
        else:
            tss = self.timeslot_mgr.auto_allocate(signal.id, self.mapping_type,
                                                  ts_count=signal.ts_count, signal_type=signal.signal_type)
        if tss is None:
            return None
        lead_ts = tss[0]
        self._clear_alarms_for_ts(lead_ts.index)
        self._apply_mapping(signal, tss)
        if self.mapping_type == "GMP":
            self._calculate_jc_gmp(signal, lead_ts)
        else:
            self._calculate_jc_amp(signal, lead_ts)
        self._apply_justification_to_overhead(lead_ts.index)
        self._clear_lck_for_ts(lead_ts.index)
        self.overhead.apply_to_frame(self.frame)
        self._write_justification_to_frame(lead_ts.index)
        return self.get_state()

    def demultiplex(self, ts_index: int) -> Optional[Dict[str, Any]]:
        ts = self.timeslot_mgr.timeslots[ts_index - 1] if 1 <= ts_index <= self.timeslot_mgr.num_timeslots else None
        if ts is None or not ts.occupied or ts.odu0_id is None:
            return None
        signal_id = ts.odu0_id
        signal = self.signals.get(signal_id)
        signal_name = signal.name if signal else ""
        if not ts.is_lead:
            for t in self.timeslot_mgr.timeslots:
                if t.odu0_id == signal_id and t.is_lead:
                    ts = t
                    break
        self._propagate_lck(ts.index, signal_id, signal_name)
        released = self.timeslot_mgr.release(ts.index)
        if released:
            for t in released:
                if t.index in self.justification_map:
                    del self.justification_map[t.index]
        self._clear_payload_for_signal(signal_id)
        self.overhead.apply_to_frame(self.frame)
        return self.get_state()

    def simulate_signal_loss(self, ts_index: int) -> Optional[Dict[str, Any]]:
        ts = self.timeslot_mgr.timeslots[ts_index - 1] if 1 <= ts_index <= self.timeslot_mgr.num_timeslots else None
        if ts is None or not ts.occupied or ts.odu0_id is None:
            return None
        signal_id = ts.odu0_id
        signal = self.signals.get(signal_id)
        signal_name = signal.name if signal else ""
        if not ts.is_lead:
            for t in self.timeslot_mgr.timeslots:
                if t.odu0_id == signal_id and t.is_lead:
                    ts = t
                    break
        self._propagate_lck(ts.index, signal_id, signal_name)
        self.overhead.apply_to_frame(self.frame)
        return self.get_state()

    def clear_alarm(self, ts_index: int) -> Optional[Dict[str, Any]]:
        ts = self.timeslot_mgr.timeslots[ts_index - 1] if 1 <= ts_index <= self.timeslot_mgr.num_timeslots else None
        if ts and ts.odu0_id:
            for t in self.timeslot_mgr.timeslots:
                if t.odu0_id == ts.odu0_id:
                    self._clear_alarms_for_ts(t.index)
                    self._clear_lck_for_ts(t.index)
        self.overhead.apply_to_frame(self.frame)
        return self.get_state()

    def _calculate_jc_gmp(self, signal: ClientSignal, ts_info) -> None:
        just = JustificationInfo()
        client_rate_bps = signal.bitrate_gbps * 1e9
        server_rate_bps = ODU_BITRATE_BPS[self.odu_type]
        ts_rate_bps = server_rate_bps / self.timeslot_mgr.num_timeslots
        total_ts_rate_bps = ts_rate_bps * signal.ts_count
        just.client_rate_kbps = client_rate_bps / 1e3
        just.server_ts_rate_kbps = total_ts_rate_bps / 1e3
        just.delta_rate_kbps = (total_ts_rate_bps - client_rate_bps) / 1e3
        frame_rate = 122070.3125
        cm_per_frame = int(client_rate_bps / (frame_rate * 8))
        cm_server_per_frame = (OPUk_PAYLOAD_BYTES_PER_FRAME // self.timeslot_mgr.num_timeslots) * signal.ts_count
        just.cm = cm_per_frame
        cnd = cm_server_per_frame - cm_per_frame
        just.cnd = max(0, cnd)
        if cnd > 0:
            just.just_type = "negative"
            just.njo = 1
            just.pjo = 0
        elif cnd < 0:
            just.just_type = "positive"
            just.njo = 0
            just.pjo = abs(cnd)
        else:
            just.just_type = "none"
            just.njo = 0
            just.pjo = 0
        cnd_m1 = (just.cnd >> 8) & 0xFF
        cnd_m0 = just.cnd & 0xFF
        just.jc = [
            (cnd_m1 & 0x0F),
            cnd_m0,
            ((cm_per_frame >> 8) & 0x0F),
            (cm_per_frame & 0xFF),
        ]
        self.justification_map[ts_info.index] = just

    def _calculate_jc_amp(self, signal: ClientSignal, ts_info) -> None:
        just = JustificationInfo()
        client_rate_bps = signal.bitrate_gbps * 1e9
        server_rate_bps = ODU_BITRATE_BPS[self.odu_type]
        ts_rate_bps = server_rate_bps / self.timeslot_mgr.num_timeslots
        total_ts_rate_bps = ts_rate_bps * signal.ts_count
        just.client_rate_kbps = client_rate_bps / 1e3
        just.server_ts_rate_kbps = total_ts_rate_bps / 1e3
        just.delta_rate_kbps = (total_ts_rate_bps - client_rate_bps) / 1e3
        delta = just.delta_rate_kbps
        if delta > 100:
            just.just_type = "negative"
            just.njo = 1
            just.pjo = 0
            just.jc = [0x01, 0x01, 0x01, 0x01]
        elif delta < -100:
            just.just_type = "positive"
            just.njo = 0
            just.pjo = 1
            just.jc = [0x02, 0x02, 0x02, 0x02]
        else:
            just.just_type = "none"
            just.njo = 0
            just.pjo = 0
            just.jc = [0x00, 0x00, 0x00, 0x00]
        just.cm = 0
        just.cnd = 0
        self.justification_map[ts_info.index] = just

    def _apply_justification_to_overhead(self, ts_index: int) -> None:
        just = self.justification_map.get(ts_index)
        if just is None:
            return
        self.overhead.opuk.jc = list(just.jc)
        self.overhead.opuk.njo = just.njo
        self.overhead.opuk.pjo = just.pjo

    def _write_justification_to_frame(self, ts_index: int) -> None:
        just = self.justification_map.get(ts_index)
        if just is None:
            return
        for i, jc_val in enumerate(just.jc):
            if i < self.frame.rows:
                self.frame.data[i][15] = jc_val & 0xFF

    def _apply_mapping(self, signal: ClientSignal, ts_list) -> None:
        pattern_val = (ord(signal.id[0]) if signal.id else 0xAA) & 0xFF
        for ts_info in ts_list:
            ts_index = ts_info.index
            for row in range(self.frame.rows):
                payload_start = 16
                payload_end = self.frame.payload_columns
                chunk_size = (payload_end - payload_start) // self.timeslot_mgr.num_timeslots
                ts_start = payload_start + (ts_index - 1) * chunk_size
                ts_end = ts_start + chunk_size
                just = self.justification_map.get(ts_list[0].index) if ts_info.is_lead else None
                for col in range(ts_start, min(ts_end, self.frame.columns)):
                    is_njo_pos = (just and just.njo == 1 and ts_info.is_lead and
                                  row == 0 and col == ts_start)
                    is_pjo_pos = (just and just.pjo > 0 and ts_info.is_lead and
                                  row == 0 and col == ts_end - 1)
                    if is_njo_pos:
                        self.frame.data[row][col] = 0xAB
                    elif is_pjo_pos:
                        self.frame.data[row][col] = pattern_val
                    else:
                        self.frame.data[row][col] = pattern_val

    def _propagate_lck(self, ts_index: int, signal_id: str, signal_name: str = "") -> None:
        ts = self.timeslot_mgr.timeslots[ts_index - 1] if 1 <= ts_index <= self.timeslot_mgr.num_timeslots else None
        if ts:
            signal_id = ts.odu0_id
            ts_count = ts.ts_count
            for i in range(ts_count):
                idx = ts_index - 1 + i
                if idx < self.timeslot_mgr.num_timeslots:
                    t = self.timeslot_mgr.timeslots[idx]
                    if t.odu0_id == signal_id:
                        alarm = AlarmInfo("LCK", t.index, signal_id, signal_name)
                        alarm.active = True
                        self.alarms.append(alarm)
                        t.lck = True
            for tcm in self.overhead.tcm:
                tcm.lck = True
            self.overhead.pm.status = 0x05

    def _clear_lck_for_ts(self, ts_index: int) -> None:
        ts = self.timeslot_mgr.timeslots[ts_index - 1] if 1 <= ts_index <= self.timeslot_mgr.num_timeslots else None
        if ts:
            ts.lck = False
        has_other_lck = any(
            a.active and a.ts_index != ts_index
            for a in self.alarms
        )
        if not has_other_lck:
            for tcm in self.overhead.tcm:
                tcm.lck = False
            self.overhead.pm.status = 0x00

    def _clear_alarms_for_ts(self, ts_index: int) -> None:
        for a in self.alarms:
            if a.ts_index == ts_index:
                a.active = False

    def _clear_payload_for_signal(self, signal_id: str) -> None:
        for ts in self.timeslot_mgr.timeslots:
            if ts.odu0_id == signal_id:
                for row in range(self.frame.rows):
                    payload_start = 16
                    payload_end = self.frame.payload_columns
                    chunk_size = (payload_end - payload_start) // self.timeslot_mgr.num_timeslots
                    ts_start = payload_start + (ts.index - 1) * chunk_size
                    ts_end = ts_start + chunk_size
                    for col in range(ts_start, min(ts_end, self.frame.columns)):
                        self.frame.data[row][col] = 0

    def update_overhead(self, overhead_data: Dict[str, Any]) -> List[str]:
        new_overhead = ODUOverhead.from_dict(overhead_data)
        errors = new_overhead.validate()
        if not errors:
            self.overhead = new_overhead
            self.overhead.apply_to_frame(self.frame)
        return errors

    def set_mapping_type(self, mapping_type: str) -> None:
        if mapping_type in ("GMP", "AMP"):
            self.mapping_type = mapping_type
            for ts_index, just in list(self.justification_map.items()):
                ts = self.timeslot_mgr.timeslots[ts_index - 1]
                if ts.occupied and ts.odu0_id:
                    signal = self.signals.get(ts.odu0_id)
                    if signal:
                        if mapping_type == "GMP":
                            self._calculate_jc_gmp(signal, ts)
                        else:
                            self._calculate_jc_amp(signal, ts)

    def set_odu_type(self, odu_type: ODUType) -> None:
        self.odu_type = odu_type
        self.frame = ODUFrame(odu_type)
        self.timeslot_mgr = TimeslotManager(odu_type)
        for signal_id in list(self.signals.keys()):
            del self.signals[signal_id]
        self.overhead = ODUOverhead()
        self.justification_map = {}
        self.alarms = []

    def export_mux_diagram(self, format_type: str = "json") -> Dict[str, Any]:
        signals_info = []
        for signal in self.signals.values():
            lead_ts = None
            ts_indices = []
            for ts in self.timeslot_mgr.timeslots:
                if ts.odu0_id == signal.id and ts.occupied:
                    ts_indices.append(ts.index)
                    if ts.is_lead:
                        lead_ts = ts
            ts_range = ""
            if ts_indices:
                if len(ts_indices) == 1:
                    ts_range = f"TS{ts_indices[0]}"
                else:
                    ts_range = f"TS{ts_indices[0]}-TS{ts_indices[-1]}"
            signals_info.append({
                "id": signal.id,
                "name": signal.name,
                "signalType": signal.signal_type,
                "bitrateGbps": round(signal.bitrate_gbps, 6),
                "tsCount": signal.ts_count,
                "tsRange": ts_range,
                "tsIndices": ts_indices,
                "mapped": lead_ts is not None,
                "justification": self.justification_map[lead_ts.index].to_dict()
                if lead_ts and lead_ts.index in self.justification_map else None,
            })
        diagram = {
            "server": {
                "oduType": self.odu_type.value,
                "bitrateGbps": ODU_PARAMS[self.odu_type]["bitrate_gbps"],
                "totalTimeslots": self.timeslot_mgr.num_timeslots,
                "usedTimeslots": sum(1 for ts in self.timeslot_mgr.timeslots if ts.occupied),
                "mappingType": self.mapping_type,
            },
            "clients": signals_info,
            "timeslots": self.timeslot_mgr.to_dict_list(),
            "alarms": [a.to_dict() for a in self.alarms if a.active],
        }
        if format_type == "mermaid":
            diagram["mermaid"] = self._generate_mermaid_diagram(diagram)
        elif format_type == "svg":
            diagram["mermaid"] = self._generate_mermaid_diagram(diagram)
            diagram["svgText"] = self._generate_svg_diagram(diagram)
        return diagram

    def _generate_mermaid_diagram(self, diagram: Dict[str, Any]) -> str:
        mermaid_lines = [
            "graph TD",
            f"    S[Server<br/>{diagram['server']['oduType']}<br/>{diagram['server']['bitrateGbps']:.3f} Gbps]",
        ]
        ts_per_row = 8
        total_ts = diagram["server"]["totalTimeslots"]
        used_ts = set()
        for s in diagram["clients"]:
            used_ts.update(s["tsIndices"])
        for i in range(1, total_ts + 1):
            is_used = i in used_ts
            color = "#FF6B6B" if is_used else "#2D3748"
            mermaid_lines.append(f"    TS{i}[TS{i}]")
        for s in diagram["clients"]:
            if s["mapped"]:
                node_id = f"SIG_{s['id'].replace('-', '_')}"
                ts_nodes = " & ".join(f"TS{idx}" for idx in s["tsIndices"])
                mermaid_lines.append(f"    {node_id}[{s['name']}<br/>{s['signalType']}<br/>{s['bitrateGbps']:.3f} Gbps]")
                mermaid_lines.append(f"    {node_id} --> |Map| {ts_nodes}")
        mermaid_lines.append(f"    TS1 & TS2 & TS3 & TS4 & TS5 & TS6 & TS7 & TS8 --> S")
        return "\n".join(mermaid_lines)

    def _generate_svg_diagram(self, diagram: Dict[str, Any]) -> str:
        width = 800
        signal_height = 60
        ts_height = 40
        margin = 20
        server_height = 80
        signals = [s for s in diagram["clients"] if s["mapped"]]
        height = margin * 3 + len(signals) * signal_height + ts_height * 2 + server_height
        svg_parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
            '<style>.label { font-family: Arial; font-size: 12px; fill: white; } .title { font-family: Arial; font-size: 14px; font-weight: bold; fill: white; }</style>',
            f'<rect x="0" y="0" width="{width}" height="{height}" fill="#1A202C"/>',
        ]
        y = margin
        color_idx = 0
        colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"]
        signal_centers = []
        for sig in signals:
            sig_color = colors[color_idx % len(colors)]
            color_idx += 1
            cx = 150
            cy = y + signal_height // 2
            signal_centers.append((cx, cy, sig_color, sig))
            svg_parts.append(f'<rect x="30" y="{y}" width="240" height="{signal_height - 10}" rx="8" fill="{sig_color}" stroke="#1A202C" stroke-width="2"/>')
            svg_parts.append(f'<text x="150" y="{y + 22}" text-anchor="middle" class="title">{sig["name"]}</text>')
            svg_parts.append(f'<text x="150" y="{y + 40}" text-anchor="middle" class="label">{sig["signalType"]} | {sig["bitrateGbps"]:.3f} Gbps | {sig["tsRange"]}</text>')
            y += signal_height
        y += margin
        ts_y = y
        ts_width = 70
        ts_spacing = 80
        ts_start_x = 350
        ts_centers = {}
        total_ts = diagram["server"]["totalTimeslots"]
        for i in range(1, total_ts + 1):
            ts_x = ts_start_x + (i - 1) * ts_spacing
            is_used = any(i in s["tsIndices"] for s in signals)
            fill_color = "#FF6B6B" if is_used else "#2D3748"
            ts_centers[i] = (ts_x + ts_width // 2, ts_y + ts_height // 2)
            svg_parts.append(f'<rect x="{ts_x}" y="{ts_y}" width="{ts_width}" height="{ts_height}" rx="4" fill="{fill_color}" stroke="#4A5568" stroke-width="1"/>')
            svg_parts.append(f'<text x="{ts_x + ts_width // 2}" y="{ts_y + ts_height // 2 + 4}" text-anchor="middle" class="label">TS{i}</text>')
        for (cx, cy, color, sig) in signal_centers:
            if sig["tsIndices"]:
                first_ts = sig["tsIndices"][0]
                last_ts = sig["tsIndices"][-1]
                mid_x = (ts_centers[first_ts][0] + ts_centers[last_ts][0]) // 2
                mid_y = (cy + ts_centers[first_ts][1]) // 2
                svg_parts.append(f'<path d="M {cx + 120} {cy} C {cx + 200} {cy}, {mid_x - 50} {mid_y}, {mid_x} {ts_centers[first_ts][1] - 5}" stroke="{color}" stroke-width="2" fill="none" marker-end="url(#arrow)"/>')
        y = ts_y + ts_height + margin
        svg_parts.append(f'<rect x="30" y="{y}" width="{width - 60}" height="{server_height}" rx="8" fill="#4A5568" stroke="#718096" stroke-width="2"/>')
        svg_parts.append(f'<text x="{width // 2}" y="{y + 30}" text-anchor="middle" class="title">{diagram["server"]["oduType"]} Server</text>')
        svg_parts.append(f'<text x="{width // 2}" y="{y + 50}" text-anchor="middle" class="label">{diagram["server"]["bitrateGbps"]:.3f} Gbps | {diagram["server"]["usedTimeslots"]}/{diagram["server"]["totalTimeslots"]} TS used | {diagram["server"]["mappingType"]}</text>')
        svg_parts.append('<defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#FF6B6B"/></marker></defs>')
        svg_parts.append('</svg>')
        return "\n".join(svg_parts)

    def get_state(self) -> Dict[str, Any]:
        return {
            "frame": self.frame.to_dict(),
            "overhead": self.overhead.to_dict(),
            "timeslots": self.timeslot_mgr.to_dict_list(),
            "odu0Signals": [s.to_dict() for s in self.signals.values()],
            "mappingType": self.mapping_type,
            "oduType": self.odu_type.value,
            "justification": {str(k): v.to_dict() for k, v in self.justification_map.items()},
            "alarms": [a.to_dict() for a in self.alarms if a.active],
        }
