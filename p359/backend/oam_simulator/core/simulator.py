import asyncio
import json
import csv
import io
from typing import Optional, Callable, Any, List, Dict
from dataclasses import dataclass, field
from datetime import datetime

from .state_machine import OAMState, OAMStateMachine
from .pdu import (
    OAMPDU,
    OAMPDUType,
    LoopbackMode,
    CriticalEventCause,
    DyingGaspCause,
    create_discovery_pdu,
    create_information_pdu,
    create_critical_event_pdu,
    create_dying_gasp_pdu,
    pdu_to_data_dict,
    is_oam_frame,
)
from .events import EventManager, EventType, EventSeverity


@dataclass
class DataFrame:
    id: str
    timestamp: float
    source_mac: str
    dest_mac: str
    eth_type: int
    payload: bytes


@dataclass
class Node:
    id: str
    name: str
    mac_address: str
    mode: str = "active"
    loopback_mode: LoopbackMode = LoopbackMode.NONE
    state_machine: OAMStateMachine = field(init=False)

    def __post_init__(self):
        self.state_machine = OAMStateMachine(self._on_state_change)

    def _on_state_change(
        self,
        event_type: EventType,
        severity: EventSeverity,
        message: str,
        details: Optional[dict[str, Any]] = None,
    ):
        pass


class OAMSimulator:
    def __init__(self):
        self.node_a = Node(
            id="node-a",
            name="Node A",
            mac_address="00:11:22:33:44:55",
            mode="active",
        )
        self.node_b = Node(
            id="node-b",
            name="Node B",
            mac_address="AA:BB:CC:DD:EE:FF",
            mode="passive",
        )

        self.event_manager = EventManager()
        self.pdu_history: List[dict[str, Any]] = []
        self.max_pdu_history = 500

        self.simulation_running = False
        self.link_fault = False
        self._info_task: Optional[asyncio.Task] = None
        self._fault_monitor_task: Optional[asyncio.Task] = None
        self._last_pdu_time: float = 0
        self._fault_timeout = 5.0

        self._pdu_callbacks: List[Callable[[dict[str, Any]], None]] = []
        self._state_callbacks: List[Callable[[dict[str, Any]], None]] = []

        self.node_a.state_machine.event_callback = self._on_node_event
        self.node_b.state_machine.event_callback = self._on_node_event

    def subscribe_pdu(self, callback: Callable[[dict[str, Any]], None]):
        self._pdu_callbacks.append(callback)

    def unsubscribe_pdu(self, callback: Callable[[dict[str, Any]], None]):
        if callback in self._pdu_callbacks:
            self._pdu_callbacks.remove(callback)

    def subscribe_state(self, callback: Callable[[dict[str, Any]], None]):
        self._state_callbacks.append(callback)

    def unsubscribe_state(self, callback: Callable[[dict[str, Any]], None]):
        if callback in self._state_callbacks:
            self._state_callbacks.remove(callback)

    def _notify_pdu(self, pdu_data: dict[str, Any]):
        for callback in self._pdu_callbacks:
            try:
                callback(pdu_data)
            except Exception:
                pass

    def _notify_state(self):
        state = self.get_state()
        for callback in self._state_callbacks:
            try:
                callback(state)
            except Exception:
                pass

    def _on_node_event(
        self,
        event_type: EventType,
        severity: EventSeverity,
        message: str,
        details: Optional[dict[str, Any]] = None,
    ):
        self.event_manager.add_event(event_type, severity, message, details)
        self._notify_state()

    def configure_node(
        self,
        node_id: str,
        name: Optional[str] = None,
        mac_address: Optional[str] = None,
        mode: Optional[str] = None,
        loopback_mode: Optional[str] = None,
    ) -> bool:
        node = self._get_node(node_id)
        if not node:
            return False

        if name:
            node.name = name
        if mac_address:
            node.mac_address = mac_address
        if mode:
            node.mode = mode
        if loopback_mode:
            try:
                node.loopback_mode = LoopbackMode[loopback_mode.upper()]
            except KeyError:
                pass

        self.event_manager.add_event(
            EventType.INFO,
            EventSeverity.INFO,
            f"Node {node.name} configured: mode={node.mode}, loopback={node.loopback_mode.name}, mac={node.mac_address}",
            {"node_id": node_id, "mode": mode, "loopback_mode": loopback_mode, "mac_address": mac_address},
        )
        self._notify_state()
        return True

    def set_loopback_mode(self, node_id: str, loopback_mode: str) -> bool:
        node = self._get_node(node_id)
        if not node:
            return False

        try:
            node.loopback_mode = LoopbackMode[loopback_mode.upper()]
        except KeyError:
            return False

        self.event_manager.add_event(
            EventType.INFO,
            EventSeverity.INFO,
            f"Node {node.name} loopback mode set to {loopback_mode}",
            {"node_id": node_id, "loopback_mode": loopback_mode},
        )
        self._notify_state()
        return True

    def _get_node(self, node_id: str) -> Optional[Node]:
        if node_id == self.node_a.id:
            return self.node_a
        if node_id == self.node_b.id:
            return self.node_b
        return None

    def get_state(self) -> dict[str, Any]:
        discovery_state = self._get_discovery_state()
        link_status = self._get_link_status()

        return {
            "simulation_running": self.simulation_running,
            "discovery_state": discovery_state,
            "link_status": link_status,
            "nodes": [
                {
                    "id": self.node_a.id,
                    "name": self.node_a.name,
                    "mac_address": self.node_a.mac_address,
                    "mode": self.node_a.mode,
                    "loopback_mode": self.node_a.loopback_mode.name.lower(),
                },
                {
                    "id": self.node_b.id,
                    "name": self.node_b.name,
                    "mac_address": self.node_b.mac_address,
                    "mode": self.node_b.mode,
                    "loopback_mode": self.node_b.loopback_mode.name.lower(),
                },
            ],
            "local_state": self.node_a.state_machine.get_state().value,
            "remote_state": self.node_b.state_machine.get_state().value,
            "local_mac": self.node_a.mac_address,
            "remote_mac": self.node_b.mac_address,
        }

    def _get_discovery_state(self) -> str:
        state_a = self.node_a.state_machine.get_state()
        state_b = self.node_b.state_machine.get_state()

        if state_a == OAMState.IDLE and state_b == OAMState.IDLE:
            return "idle"
        if state_a == OAMState.DISCOVERY_COMPLETE and state_b == OAMState.DISCOVERY_COMPLETE:
            return "completed"
        if state_a == OAMState.FAULT_DETECTED or state_b == OAMState.FAULT_DETECTED:
            return "failed"
        return "in_progress"

    def _get_link_status(self) -> str:
        if self.link_fault:
            return "fault"
        if self._get_discovery_state() == "completed":
            return "up"
        return "down"

    async def start(self):
        if self.simulation_running:
            return

        self.simulation_running = True
        self.link_fault = False
        self.node_a.state_machine.reset()
        self.node_b.state_machine.reset()
        self.pdu_history.clear()

        self.event_manager.add_event(
            EventType.INFO,
            EventSeverity.INFO,
            "OAM simulation started",
            {"mode_a": self.node_a.mode, "mode_b": self.node_b.mode},
        )

        self._notify_state()
        await self._start_discovery()
        self._info_task = asyncio.create_task(self._periodic_info_pdu())
        self._fault_monitor_task = asyncio.create_task(self._fault_monitor())

    async def stop(self):
        if not self.simulation_running:
            return

        self.simulation_running = False

        if self._info_task:
            self._info_task.cancel()
            self._info_task = None

        if self._fault_monitor_task:
            self._fault_monitor_task.cancel()
            self._fault_monitor_task = None

        self.node_a.state_machine.transition("stop")
        self.node_b.state_machine.transition("stop")

        self.event_manager.add_event(
            EventType.INFO,
            EventSeverity.INFO,
            "OAM simulation stopped",
        )
        self._notify_state()

    async def _start_discovery(self):
        self.event_manager.add_event(
            EventType.DISCOVERY,
            EventSeverity.INFO,
            "Discovery phase started",
        )

        self.node_a.state_machine.transition("start")
        self.node_b.state_machine.transition("start")
        self._notify_state()
        await asyncio.sleep(0.5)

        if self.node_a.mode == "active":
            self.node_a.state_machine.transition("active_mode")
        else:
            self.node_a.state_machine.transition("passive_mode")

        if self.node_b.mode == "active":
            self.node_b.state_machine.transition("active_mode")
        else:
            self.node_b.state_machine.transition("passive_mode")
        self._notify_state()
        await asyncio.sleep(0.5)

        active_node = self.node_a if self.node_a.mode == "active" else self.node_b
        passive_node = self.node_b if self.node_a.mode == "active" else self.node_a

        if active_node.state_machine.get_state() == OAMState.SEND_DISCOVERY:
            discovery_pdu = create_discovery_pdu(
                source_mac=active_node.mac_address,
                dest_mac=passive_node.mac_address,
                mode=active_node.mode,
            )
            await self._send_pdu(discovery_pdu, active_node, passive_node)
            self._notify_state()
            await asyncio.sleep(0.5)

            if passive_node.state_machine.get_state() == OAMState.WAIT_DISCOVERY:
                passive_node.state_machine.transition("receive_discovery")
                self.event_manager.add_event(
                    EventType.DISCOVERY,
                    EventSeverity.INFO,
                    f"{passive_node.name} received Discovery PDU from {active_node.name}",
                )
                self._notify_state()
                await asyncio.sleep(0.5)

                response_pdu = create_discovery_pdu(
                    source_mac=passive_node.mac_address,
                    dest_mac=active_node.mac_address,
                    mode=passive_node.mode,
                )
                await self._send_pdu(response_pdu, passive_node, active_node)
                passive_node.state_machine.transition("sent")
                self._notify_state()
                await asyncio.sleep(0.5)

                active_node.state_machine.transition("receive_response")
                self.event_manager.add_event(
                    EventType.DISCOVERY,
                    EventSeverity.INFO,
                    f"{active_node.name} received Discovery Response from {passive_node.name}",
                )
                self._notify_state()
                await asyncio.sleep(0.3)

                active_node.state_machine.transition("stable")
                passive_node.state_machine.transition("stable")

                self.event_manager.add_event(
                    EventType.DISCOVERY,
                    EventSeverity.INFO,
                    "Discovery completed successfully",
                    {
                        "local_mac": active_node.mac_address,
                        "remote_mac": passive_node.mac_address,
                    },
                )
                self._last_pdu_time = asyncio.get_event_loop().time()
                self._notify_state()

    async def _send_pdu(
        self,
        pdu: OAMPDU,
        sender: Node,
        receiver: Node,
    ):
        if self.link_fault:
            self.event_manager.add_event(
                EventType.PDU,
                EventSeverity.WARNING,
                f"PDU dropped due to link fault: {pdu.pdu_type.value}",
            )
            return

        if sender.state_machine.get_state() in [OAMState.SEND_DISCOVERY, OAMState.SEND_RESPONSE, OAMState.SEND_INFO]:
            sender.state_machine.transition("sent")

        pdu_data = pdu_to_data_dict(pdu, direction="sent")
        pdu_data["source_node"] = sender.name
        pdu_data["dest_node"] = receiver.name
        self.pdu_history.append(pdu_data)
        if len(self.pdu_history) > self.max_pdu_history:
            self.pdu_history = self.pdu_history[-self.max_pdu_history :]

        self.event_manager.add_event(
            EventType.PDU,
            EventSeverity.INFO,
            f"{sender.name} sent {pdu.pdu_type.value.upper()} PDU to {receiver.name}",
            {"pdu_id": pdu.id, "pdu_type": pdu.pdu_type.value},
        )
        self._notify_pdu(pdu_data)

        if sender.loopback_mode != LoopbackMode.NONE:
            if sender.loopback_mode == LoopbackMode.LOCAL_LOOPBACK:
                self.event_manager.add_event(
                    EventType.PDU,
                    EventSeverity.INFO,
                    f"{sender.name} in local loopback mode: OAM frame processed locally",
                    {"pdu_id": pdu.id, "loopback_mode": sender.loopback_mode.name},
                )
                loopback_data = pdu_data.copy()
                loopback_data["direction"] = "loopback"
                loopback_data["id"] = pdu.id + "-loopback"
                self.pdu_history.append(loopback_data)
                self._notify_pdu(loopback_data)
            elif sender.loopback_mode == LoopbackMode.REMOTE_LOOPBACK:
                self.event_manager.add_event(
                    EventType.PDU,
                    EventSeverity.INFO,
                    f"{sender.name} in remote loopback mode: data frames will be looped back",
                    {"pdu_id": pdu.id, "loopback_mode": sender.loopback_mode.name},
                )
        else:
            receive_data = pdu_data.copy()
            receive_data["direction"] = "received"
            receive_data["id"] = pdu.id + "-rx"
            self.pdu_history.append(receive_data)
            self._notify_pdu(receive_data)

        self._last_pdu_time = asyncio.get_event_loop().time()

    async def send_data_frame(
        self,
        sender: Node,
        receiver: Node,
        payload: bytes = b"test_data",
    ) -> bool:
        if sender.loopback_mode == LoopbackMode.LOCAL_LOOPBACK:
            self.event_manager.add_event(
                EventType.PDU,
                EventSeverity.INFO,
                f"{sender.name} local loopback: data frame looped back locally",
                {"frame_type": "data", "payload_len": len(payload)},
            )
            return True
        elif sender.loopback_mode == LoopbackMode.REMOTE_LOOPBACK:
            self.event_manager.add_event(
                EventType.PDU,
                EventSeverity.INFO,
                f"{sender.name} remote loopback: data frame looped back from remote",
                {"frame_type": "data", "payload_len": len(payload)},
            )
            return True
        else:
            self.event_manager.add_event(
                EventType.PDU,
                EventSeverity.INFO,
                f"{sender.name} sent data frame to {receiver.name}",
                {"frame_type": "data", "payload_len": len(payload)},
            )
            return True

    async def send_critical_event(
        self,
        sender_id: str,
        cause: str = "UNKNOWN",
        cause_text: str = "",
    ) -> bool:
        if not self.simulation_running:
            return False

        sender = self._get_node(sender_id)
        if not sender:
            return False

        receiver = self.node_b if sender_id == self.node_a.id else self.node_a

        try:
            cause_enum = CriticalEventCause[cause.upper()]
        except KeyError:
            cause_enum = CriticalEventCause.UNKNOWN

        event_pdu = create_critical_event_pdu(
            source_mac=sender.mac_address,
            dest_mac=receiver.mac_address,
            sequence=0,
            cause=cause_enum,
            cause_text=cause_text,
        )

        await self._send_pdu(event_pdu, sender, receiver)

        self.event_manager.add_event(
            EventType.FAULT,
            EventSeverity.ERROR,
            f"{sender.name} sent Critical Event: {cause} - {cause_text}",
            {
                "cause": cause,
                "cause_code": cause_enum.value,
                "cause_text": cause_text,
                "tlvs": event_pdu.payload.get("tlvs", []),
            },
        )
        return True

    async def send_dying_gasp(
        self,
        sender_id: str,
        cause: str = "UNKNOWN",
        cause_text: str = "",
    ) -> bool:
        if not self.simulation_running:
            return False

        sender = self._get_node(sender_id)
        if not sender:
            return False

        receiver = self.node_b if sender_id == self.node_a.id else self.node_a

        try:
            cause_enum = DyingGaspCause[cause.upper()]
        except KeyError:
            cause_enum = DyingGaspCause.UNKNOWN

        dying_gasp_pdu = create_dying_gasp_pdu(
            source_mac=sender.mac_address,
            dest_mac=receiver.mac_address,
            sequence=0,
            cause=cause_enum,
            cause_text=cause_text,
        )

        await self._send_pdu(dying_gasp_pdu, sender, receiver)

        self.event_manager.add_event(
            EventType.FAULT,
            EventSeverity.ERROR,
            f"{sender.name} sent Dying Gasp: {cause} - {cause_text}",
            {
                "cause": cause,
                "cause_code": cause_enum.value,
                "cause_text": cause_text,
                "tlvs": dying_gasp_pdu.payload.get("tlvs", []),
                "is_dying_gasp": True,
            },
        )

        self.link_fault = True
        self.node_a.state_machine.transition("fault_detected")
        self.node_b.state_machine.transition("fault_detected")
        self._notify_state()

        return True

    def export_events_json(self, limit: Optional[int] = None) -> str:
        events = self.get_events(limit=limit)
        export_data = {
            "export_time": datetime.now().isoformat(),
            "total_events": len(events),
            "events": events,
        }
        return json.dumps(export_data, indent=2, ensure_ascii=False)

    def export_events_csv(self, limit: Optional[int] = None) -> str:
        events = self.get_events(limit=limit)
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            "ID",
            "Timestamp",
            "Time (Local)",
            "Type",
            "Severity",
            "Message",
            "Details",
        ])

        for event in events:
            timestamp = event.get("timestamp", 0)
            local_time = datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M:%S")
            details = json.dumps(event.get("details", {}), ensure_ascii=False) if event.get("details") else ""

            writer.writerow([
                event.get("id", ""),
                timestamp,
                local_time,
                event.get("type", ""),
                event.get("severity", ""),
                event.get("message", ""),
                details,
            ])

        return output.getvalue()

    async def _periodic_info_pdu(self):
        try:
            while self.simulation_running:
                await asyncio.sleep(2.0)
                if not self.simulation_running:
                    break

                if self._get_discovery_state() != "completed":
                    continue

                if self.link_fault:
                    continue

                self.node_a.state_machine.transition("send_info")
                self.node_b.state_machine.transition("send_info")
                self._notify_state()
                await asyncio.sleep(0.2)

                info_pdu_a = create_information_pdu(
                    source_mac=self.node_a.mac_address,
                    dest_mac=self.node_b.mac_address,
                    mode=self.node_a.mode,
                )
                await self._send_pdu(info_pdu_a, self.node_a, self.node_b)

                await asyncio.sleep(0.3)

                info_pdu_b = create_information_pdu(
                    source_mac=self.node_b.mac_address,
                    dest_mac=self.node_a.mac_address,
                    mode=self.node_b.mode,
                )
                await self._send_pdu(info_pdu_b, self.node_b, self.node_a)
                self._notify_state()

        except asyncio.CancelledError:
            pass

    async def _fault_monitor(self):
        try:
            while self.simulation_running:
                await asyncio.sleep(1.0)
                if not self.simulation_running:
                    break

                if self.link_fault:
                    continue

                current_time = asyncio.get_event_loop().time()
                time_since_last_pdu = current_time - self._last_pdu_time

                if time_since_last_pdu > self._fault_timeout and self._get_discovery_state() == "completed":
                    await self._detect_fault(
                        "Loss of OAM PDU",
                        f"No OAM PDU received for {time_since_last_pdu:.1f} seconds",
                    )

        except asyncio.CancelledError:
            pass

    async def trigger_fault(self, fault_type: str = "manual", description: str = "Manual fault injection"):
        if not self.simulation_running:
            return False

        await self._detect_fault(fault_type, description)
        return True

    async def _detect_fault(self, fault_type: str, description: str):
        self.link_fault = True

        self.node_a.state_machine.transition("fault_detected")
        self.node_b.state_machine.transition("fault_detected")

        self.event_manager.add_event(
            EventType.FAULT,
            EventSeverity.ERROR,
            f"Link fault detected: {fault_type}",
            {"fault_type": fault_type, "description": description},
        )
        self._notify_state()

    async def clear_fault(self):
        if not self.simulation_running or not self.link_fault:
            return False

        self.link_fault = False
        self._last_pdu_time = asyncio.get_event_loop().time()

        self.node_a.state_machine.transition("fault_cleared")
        self.node_b.state_machine.transition("fault_cleared")

        self.event_manager.add_event(
            EventType.FAULT,
            EventSeverity.INFO,
            "Link fault cleared",
        )

        await self._restart_discovery()
        return True

    async def _restart_discovery(self):
        self.node_a.state_machine.reset()
        self.node_b.state_machine.reset()
        self._notify_state()
        await asyncio.sleep(0.5)
        await self._start_discovery()

    def get_events(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        events = self.event_manager.get_events(limit=limit)
        return [e.to_dict() for e in events]

    def get_pdus(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        pdus = self.pdu_history
        if limit:
            pdus = pdus[-limit:]
        return pdus
