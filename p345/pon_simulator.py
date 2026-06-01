import asyncio
import random
import time
import csv
import io
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set
from enum import Enum


class ONUState(Enum):
    INIT = "INIT"
    STANDBY = "STANDBY"
    SERIAL_NUMBER = "SERIAL_NUMBER"
    WAITING = "WAITING"
    RANGING = "RANGING"
    OPERATIONAL = "OPERATIONAL"


@dataclass
class StateTransition:
    state: str
    start_time: float
    end_time: Optional[float] = None


@dataclass
class DBARequest:
    onu_id: int
    requested_bandwidth: int
    timestamp: float


@dataclass
class DBAAllocation:
    onu_id: int
    allocated_bandwidth: int
    allocation_type: str
    timestamp: float


@dataclass
class ONU:
    onu_id: int
    serial_number: str
    distance: float
    state: ONUState = ONUState.INIT
    equalization_delay: int = 0
    measured_rtt: int = 0
    downstream_delay: int = 0
    upstream_delay: int = 0
    last_message_time: float = 0
    assigned_llid: Optional[int] = None
    selected_timeslot: Optional[int] = None
    collision_count: int = 0
    state_history: List[StateTransition] = field(default_factory=list)
    current_bandwidth_request: int = 0
    allocated_bandwidth: int = 0
    bandwidth_allocation_type: str = ""
    queue_occupancy: float = 0.0

    def __post_init__(self):
        self.propagation_delay = int((self.distance / 2e5) * 1e9)

    def record_state_start(self, state: str, timestamp: float):
        if self.state_history and self.state_history[-1].end_time is None:
            self.state_history[-1].end_time = timestamp
        self.state_history.append(StateTransition(state=state, start_time=timestamp))

    def record_state_end(self, timestamp: float):
        if self.state_history and self.state_history[-1].end_time is None:
            self.state_history[-1].end_time = timestamp


@dataclass
class DiscoveryWindow:
    start_time: float
    duration: float
    timeslot_count: int
    timeslot_duration: float
    used_timeslots: Set[int] = field(default_factory=set)
    collision_timeslots: Set[int] = field(default_factory=set)
    active: bool = False


@dataclass
class DBAConfig:
    total_bandwidth: int = 1000000
    fixed_bandwidth_per_onu: int = 50000
    guaranteed_bandwidth_pool: int = 400000
    best_effort_pool: int = 200000
    dba_interval: float = 0.1


@dataclass
class OLT:
    max_eqd: int = 600000
    min_eqd: int = 0
    ranging_time: int = 50000
    onu_list: Dict[int, ONU] = field(default_factory=dict)
    system_start_time: float = field(default_factory=time.time)
    event_log: List[Dict] = field(default_factory=list)
    ranging_complete: bool = False
    discovery_window: DiscoveryWindow = field(default_factory=lambda: DiscoveryWindow(0, 0.2, 8, 0.025))
    discovery_counter: int = 0
    registered_onus: Set[int] = field(default_factory=set)
    dba_config: DBAConfig = field(default_factory=DBAConfig)
    dba_history: List[DBAAllocation] = field(default_factory=list)
    dba_active: bool = False

    def add_onu(self, onu: ONU):
        self.onu_list[onu.onu_id] = onu
        self._log_event("OLT", f"检测到新ONU: ONU-{onu.onu_id} (SN: {onu.serial_number}, 距离: {onu.distance}m)")

    def _log_event(self, source: str, message: str):
        timestamp = time.time() - self.system_start_time
        self.event_log.append({
            "timestamp": round(timestamp, 3),
            "source": source,
            "message": message
        })
        if len(self.event_log) > 200:
            self.event_log.pop(0)

    def get_state_timeline(self) -> List[Dict]:
        timeline = []
        for onu in self.onu_list.values():
            for transition in onu.state_history:
                timeline.append({
                    "onu_id": onu.onu_id,
                    "serial_number": onu.serial_number,
                    "state": transition.state,
                    "start_time": round(transition.start_time, 3),
                    "end_time": round(transition.end_time, 3) if transition.end_time else None,
                    "duration": round(transition.end_time - transition.start_time, 3) if transition.end_time else None
                })
        return timeline

    def export_timeline_csv(self) -> str:
        timeline = self.get_state_timeline()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ONU ID", "序列号", "状态", "开始时间(s)", "结束时间(s)", "持续时间(s)"])
        for entry in timeline:
            writer.writerow([
                entry["onu_id"],
                entry["serial_number"],
                entry["state"],
                entry["start_time"],
                entry["end_time"] if entry["end_time"] else "",
                entry["duration"] if entry["duration"] else ""
            ])
        return output.getvalue()

    def export_dba_csv(self) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ONU ID", "序列号", "分配带宽(Mbps)", "分配类型", "时间戳(s)"])
        for alloc in self.dba_history:
            onu = self.onu_list.get(alloc.onu_id)
            writer.writerow([
                alloc.onu_id,
                onu.serial_number if onu else "",
                round(alloc.allocated_bandwidth / 1000, 2),
                alloc.allocation_type,
                round(alloc.timestamp, 3)
            ])
        return output.getvalue()

    def get_status(self) -> Dict:
        return {
            "onus": [
                {
                    "onu_id": onu.onu_id,
                    "serial_number": onu.serial_number,
                    "distance": onu.distance,
                    "state": onu.state.value,
                    "equalization_delay": onu.equalization_delay,
                    "measured_rtt": onu.measured_rtt,
                    "downstream_delay": onu.downstream_delay,
                    "upstream_delay": onu.upstream_delay,
                    "propagation_delay": onu.propagation_delay,
                    "assigned_llid": onu.assigned_llid,
                    "selected_timeslot": onu.selected_timeslot,
                    "collision_count": onu.collision_count,
                    "current_bandwidth_request": onu.current_bandwidth_request,
                    "allocated_bandwidth": onu.allocated_bandwidth,
                    "bandwidth_allocation_type": onu.bandwidth_allocation_type,
                    "queue_occupancy": round(onu.queue_occupancy, 2)
                }
                for onu in self.onu_list.values()
            ],
            "event_log": self.event_log[-20:],
            "ranging_complete": self.ranging_complete,
            "discovery_window": {
                "active": self.discovery_window.active,
                "timeslot_count": self.discovery_window.timeslot_count,
                "duration": self.discovery_window.duration,
                "discovery_counter": self.discovery_counter
            },
            "dba": {
                "active": self.dba_active,
                "total_bandwidth": self.dba_config.total_bandwidth,
                "allocation_count": len(self.dba_history),
                "interval": self.dba_config.dba_interval
            },
            "timeline": self.get_state_timeline(),
            "dba_history": [
                {
                    "onu_id": h.onu_id,
                    "allocated_bandwidth": h.allocated_bandwidth,
                    "allocation_type": h.allocation_type,
                    "timestamp": round(h.timestamp, 3)
                }
                for h in self.dba_history[-10:]
            ]
        }


class PONSimulator:
    def __init__(self):
        self.olt = OLT()
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._dba_task: Optional[asyncio.Task] = None

    def _get_timestamp(self) -> float:
        return time.time() - self.olt.system_start_time

    async def _simulate_downstream_propagation(self, onu: ONU) -> float:
        base_delay = onu.propagation_delay / 1e9
        jitter = random.uniform(-0.05, 0.05) * base_delay
        return base_delay + jitter

    async def _simulate_upstream_propagation(self, onu: ONU) -> float:
        base_delay = onu.propagation_delay / 1e9
        jitter = random.uniform(-0.05, 0.05) * base_delay
        return base_delay + jitter

    def _set_onu_state(self, onu: ONU, state: ONUState):
        onu.record_state_end(self._get_timestamp())
        onu.state = state
        onu.record_state_start(state.value, self._get_timestamp())

    async def _onu_wait_for_discovery(self, onu: ONU):
        await asyncio.sleep(random.uniform(0.1, 0.5))
        self._set_onu_state(onu, ONUState.STANDBY)
        self.olt._log_event(f"ONU-{onu.onu_id}", "进入待机状态，等待发现窗口")

    async def _onu_select_timeslot(self, onu: ONU) -> int:
        timeslot = random.randint(0, self.olt.discovery_window.timeslot_count - 1)
        onu.selected_timeslot = timeslot
        self.olt._log_event(f"ONU-{onu.onu_id}", f"选择时隙 #{timeslot} 发送序列号")
        return timeslot

    async def _onu_send_serial_number(self, onu: ONU, timeslot: int):
        timeslot_delay = timeslot * self.olt.discovery_window.timeslot_duration
        await asyncio.sleep(timeslot_delay)
        self._set_onu_state(onu, ONUState.SERIAL_NUMBER)
        self.olt._log_event(f"ONU-{onu.onu_id}", f"在时隙 #{timeslot} 发送序列号: {onu.serial_number}")

    async def _olt_process_discovery_window(self):
        self.olt.discovery_window.active = True
        self.olt.discovery_counter += 1
        self.olt._log_event("OLT", f"开启发现窗口 #{self.olt.discovery_counter} (共{self.olt.discovery_window.timeslot_count}个时隙)")
        
        waiting_onus = [onu for onu in self.olt.onu_list.values() 
                       if onu.state == ONUState.STANDBY or onu.state == ONUState.INIT]
        
        if not waiting_onus:
            return
        
        timeslot_allocations: Dict[int, List[ONU]] = {}
        for onu in waiting_onus:
            if onu.state == ONUState.INIT:
                continue
            timeslot = await self._onu_select_timeslot(onu)
            if timeslot not in timeslot_allocations:
                timeslot_allocations[timeslot] = []
            timeslot_allocations[timeslot].append(onu)
        
        for timeslot, onus_in_slot in timeslot_allocations.items():
            if len(onus_in_slot) > 1:
                self.olt._log_event("OLT", f"时隙 #{timeslot} 发生碰撞! ({len(onus_in_slot)}个ONU)")
                for onu in onus_in_slot:
                    onu.collision_count += 1
                    onu.selected_timeslot = None
                    self._set_onu_state(onu, ONUState.STANDBY)
                    self.olt._log_event(f"ONU-{onu.onu_id}", f"碰撞! 等待下一个发现窗口")
            else:
                onu = onus_in_slot[0]
                await asyncio.sleep(await self._simulate_upstream_propagation(onu))
                onu.assigned_llid = onu.onu_id
                self._set_onu_state(onu, ONUState.WAITING)
                self.olt._log_event("OLT", f"时隙 #{timeslot} 成功，分配LLID {onu.assigned_llid} 给 ONU-{onu.onu_id}")
                self.olt.registered_onus.add(onu.onu_id)
        
        await asyncio.sleep(self.olt.discovery_window.duration)
        self.olt.discovery_window.active = False

    async def _ranging_phase(self, onu: ONU):
        self._set_onu_state(onu, ONUState.RANGING)
        self.olt._log_event("OLT", f"向 ONU-{onu.onu_id} 发送测距请求 (下行)")
        
        downstream_time = await self._simulate_downstream_propagation(onu)
        await asyncio.sleep(downstream_time)
        
        onu.downstream_delay = int(downstream_time * 1e9)
        self.olt._log_event(f"ONU-{onu.onu_id}", f"收到测距请求，下行延时: {onu.downstream_delay}ns")
        
        self.olt._log_event(f"ONU-{onu.onu_id}", "发送测距响应 (上行)")
        
        upstream_time = await self._simulate_upstream_propagation(onu)
        await asyncio.sleep(upstream_time)
        
        onu.upstream_delay = int(upstream_time * 1e9)
        onu.measured_rtt = onu.downstream_delay + onu.upstream_delay
        
        self.olt._log_event("OLT", f"收到 ONU-{onu.onu_id} 测距响应，上行延时: {onu.upstream_delay}ns")
        self.olt._log_event("OLT", f"ONU-{onu.onu_id} 完整RTT: {onu.measured_rtt}ns (下行{onu.downstream_delay}ns + 上行{onu.upstream_delay}ns)")
        
        max_distance = max(o.distance for o in self.olt.onu_list.values())
        max_rtt = int((max_distance / 2e5) * 1e9) * 2 + 10000
        
        onu.equalization_delay = max(0, max_rtt - onu.measured_rtt)
        self.olt._log_event("OLT", f"ONU-{onu.onu_id} 均衡延时(EqD)设置为: {onu.equalization_delay}ns")

    async def _operational_phase(self, onu: ONU):
        self._set_onu_state(onu, ONUState.OPERATIONAL)
        self.olt._log_event(f"ONU-{onu.onu_id}", f"进入运行状态，EqD={onu.equalization_delay}ns")

    async def _dba_cycle(self):
        self.olt.dba_active = True
        while self._running:
            operational_onus = [onu for onu in self.olt.onu_list.values() 
                              if onu.state == ONUState.OPERATIONAL]
            
            if not operational_onus:
                await asyncio.sleep(self.olt.dba_config.dba_interval)
                continue
            
            timestamp = self._get_timestamp()
            
            for onu in operational_onus:
                onu.queue_occupancy = random.uniform(0.1, 0.9)
                onu.current_bandwidth_request = int(random.uniform(30000, 150000))
                self.olt._log_event(f"ONU-{onu.onu_id}", 
                    f"请求带宽 {round(onu.current_bandwidth_request/1000, 1)}Mbps, 队列占用 {round(onu.queue_occupancy*100)}%")
            
            fixed_allocations = {}
            guaranteed_allocations = {}
            best_effort_allocations = {}
            
            for onu in operational_onus:
                fixed_allocations[onu.onu_id] = self.olt.dba_config.fixed_bandwidth_per_onu
            
            remaining_guaranteed = self.olt.dba_config.guaranteed_bandwidth_pool
            for onu in operational_onus:
                request = onu.current_bandwidth_request - fixed_allocations[onu.onu_id]
                if request > 0 and remaining_guaranteed > 0:
                    allocation = min(request, remaining_guaranteed)
                    guaranteed_allocations[onu.onu_id] = allocation
                    remaining_guaranteed -= allocation
            
            remaining_best_effort = self.olt.dba_config.best_effort_pool
            if remaining_best_effort > 0 and operational_onus:
                per_onu_be = remaining_best_effort // len(operational_onus)
                for onu in operational_onus:
                    best_effort_allocations[onu.onu_id] = per_onu_be
            
            for onu in operational_onus:
                total = (fixed_allocations.get(onu.onu_id, 0) + 
                        guaranteed_allocations.get(onu.onu_id, 0) + 
                        best_effort_allocations.get(onu.onu_id, 0))
                onu.allocated_bandwidth = total
                
                alloc_types = []
                if onu.onu_id in fixed_allocations:
                    alloc_types.append("固定")
                if onu.onu_id in guaranteed_allocations:
                    alloc_types.append("保证")
                if onu.onu_id in best_effort_allocations:
                    alloc_types.append("尽力")
                onu.bandwidth_allocation_type = "+".join(alloc_types)
                
                allocation = DBAAllocation(
                    onu_id=onu.onu_id,
                    allocated_bandwidth=total,
                    allocation_type=onu.bandwidth_allocation_type,
                    timestamp=timestamp
                )
                self.olt.dba_history.append(allocation)
                
                self.olt._log_event("OLT", 
                    f"DBA分配给 ONU-{onu.onu_id}: {round(total/1000, 1)}Mbps ({onu.bandwidth_allocation_type})")
            
            await asyncio.sleep(self.olt.dba_config.dba_interval)

    async def _simulation_loop(self):
        self.olt._log_event("OLT", "PON系统启动")
        
        for onu in self.olt.onu_list.values():
            onu.record_state_start(onu.state.value, self._get_timestamp())
        
        init_tasks = [self._onu_wait_for_discovery(onu) for onu in self.olt.onu_list.values()]
        await asyncio.gather(*init_tasks)
        
        max_discovery_attempts = 5
        attempt = 0
        
        while attempt < max_discovery_attempts:
            attempt += 1
            await self._olt_process_discovery_window()
            
            unregistered_onus = [onu for onu in self.olt.onu_list.values() 
                                if onu.state != ONUState.WAITING and onu.state != ONUState.OPERATIONAL]
            
            if not unregistered_onus:
                self.olt._log_event("OLT", "所有ONU已在发现窗口注册成功")
                break
            
            if attempt < max_discovery_attempts:
                self.olt._log_event("OLT", f"还有{len(unregistered_onus)}个ONU未注册，准备下一个发现窗口")
                await asyncio.sleep(0.1)
        
        ranging_tasks = []
        for onu in self.olt.onu_list.values():
            if onu.state == ONUState.WAITING:
                ranging_tasks.append(self._ranging_phase(onu))
        
        await asyncio.gather(*ranging_tasks)
        
        op_tasks = []
        for onu in self.olt.onu_list.values():
            if onu.state == ONUState.RANGING:
                op_tasks.append(self._operational_phase(onu))
        
        await asyncio.gather(*op_tasks)
        
        self.olt.ranging_complete = True
        self.olt._log_event("OLT", "所有ONU注册测距完成")
        
        if self.olt.onu_list.values():
            max_eqd = max(onu.equalization_delay for onu in self.olt.onu_list.values())
            min_eqd = min(onu.equalization_delay for onu in self.olt.onu_list.values())
            max_rtt = max(onu.measured_rtt for onu in self.olt.onu_list.values())
            min_rtt = min(onu.measured_rtt for onu in self.olt.onu_list.values())
            self.olt._log_event("OLT", f"RTT范围: {min_rtt}ns ~ {max_rtt}ns")
            self.olt._log_event("OLT", f"EqD范围: {min_eqd}ns ~ {max_eqd}ns")
            self.olt._log_event("OLT", "启动DBA动态带宽分配")
        
        await self._dba_cycle()

    def start(self, onu_count: int = 4):
        self.olt.system_start_time = time.time()
        for i in range(1, onu_count + 1):
            distance = random.uniform(1000, 20000)
            sn = f"PON{random.randint(1000, 9999):04d}ONU{i:02d}"
            onu = ONU(onu_id=i, serial_number=sn, distance=round(distance, 1))
            self.olt.add_onu(onu)
        self._running = True
        self._task = asyncio.create_task(self._simulation_loop())

    def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
        if self._dba_task:
            self._dba_task.cancel()
        self.olt.dba_active = False
        for onu in self.olt.onu_list.values():
            onu.record_state_end(self._get_timestamp())

    def get_status(self) -> Dict:
        return self.olt.get_status()

    def export_timeline_csv(self) -> str:
        return self.olt.export_timeline_csv()

    def export_dba_csv(self) -> str:
        return self.olt.export_dba_csv()

    def reset(self):
        self.stop()
        self.olt = OLT()
