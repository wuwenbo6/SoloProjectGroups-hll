from __future__ import annotations
import time
import json
from models import (
    MRouteEntry, MRouteType, MulticastGroup, JoinRequest,
    PruneRequest, RegisterRequest, SwitchSPTRequest, SimEvent, PresetType,
    RPFCheckRequest, RPFCheckResult, RouteEntry,
)
from topology import TopologyManager
from presets import get_preset
from routing import UnicastRouteManager


class PIMSimulator:
    def __init__(self, topology: TopologyManager):
        self.topology = topology
        self.mroute_table: dict[str, list[MRouteEntry]] = {}
        self.groups: dict[str, MulticastGroup] = {}
        self.events: list[SimEvent] = []
        self._ws_clients: list = []
        self._entry_counter = 0
        self.unicast_routes = UnicastRouteManager()

    async def load_preset(self, preset_type: PresetType):
        data = get_preset(preset_type)
        self.topology.load_from_dict(data)
        self.mroute_table.clear()
        self.groups.clear()
        self.events.clear()
        self.unicast_routes.clear()
        self.unicast_routes.build_from_topology(self.topology)
        rp = self.topology.find_rp()
        await self._emit_event("preset_loaded", {
            "preset": preset_type.value,
            "rp_id": rp.id if rp else None,
        })

    async def set_rp(self, router_id: str, group: str):
        router = self.topology.get_router(router_id)
        if not router:
            raise ValueError(f"Router {router_id} not found")
        router.is_rp = True
        if group not in self.groups:
            self.groups[group] = MulticastGroup(group_addr=group, rp_id=router_id)
        else:
            self.groups[group].rp_id = router_id
        await self._emit_event("rp_set", {"router_id": router_id, "group": group})

    def _get_or_create_entry(
        self, router_id: str, entry_type: MRouteType, group: str, source: str | None
    ) -> MRouteEntry:
        if router_id not in self.mroute_table:
            self.mroute_table[router_id] = []
        entries = self.mroute_table[router_id]
        for entry in entries:
            if entry.entry_type == entry_type and entry.group == group and entry.source == source:
                return entry
        self._entry_counter += 1
        entry_id = f"{router_id}-{entry_type.value}-{group}"
        if source:
            entry_id += f"-{source}"
        entry_id += f"-{self._entry_counter}"
        new_entry = MRouteEntry(
            id=entry_id,
            router_id=router_id,
            entry_type=entry_type,
            group=group,
            source=source,
            upstream_if=None,
            downstream_ifs=[],
        )
        entries.append(new_entry)
        return new_entry

    def _find_interface_toward(self, from_router: str, to_router: str) -> str | None:
        neighbors = self.topology.get_neighbors(from_router)
        for neighbor_id, if_id, _ in neighbors:
            if neighbor_id == to_router:
                return if_id
        return None

    def _find_rpf_neighbor(self, router_id: str, target_id: str) -> str | None:
        path = self.topology.find_path(router_id, target_id)
        if len(path) < 2:
            return None
        return path[1]

    def _get_rpf_interface(self, router_id: str, source_addr: str) -> str | None:
        rpf_if = self.unicast_routes.find_rpf_interface(router_id, source_addr)
        if rpf_if:
            return rpf_if
        rpf_neighbor = self._find_rpf_neighbor(router_id, source_addr)
        if rpf_neighbor:
            return self._find_interface_toward(router_id, rpf_neighbor)
        return None

    def perform_rpf_check(self, request: RPFCheckRequest) -> RPFCheckResult:
        result = self.unicast_routes.check_rpf(
            request.router_id,
            request.source_addr,
            request.incoming_if,
        )
        if not result.passed and result.reason == "No unicast route to source":
            rpf_if = self._get_rpf_interface(request.router_id, request.source_addr)
            if rpf_if:
                passed = request.incoming_if is None or rpf_if == request.incoming_if
                return RPFCheckResult(
                    passed=passed,
                    rpf_interface=rpf_if,
                    source_addr=request.source_addr,
                    router_id=request.router_id,
                    reason=None if passed else f"RPF interface mismatch",
                )
        return result

    def _create_event(self, event_type: str, data: dict) -> SimEvent:
        event = SimEvent(type=event_type, timestamp=time.time(), data=data)
        self.events.append(event)
        if len(self.events) > 1000:
            self.events = self.events[-500:]
        return event

    async def _emit_event(self, event_type: str, data: dict) -> SimEvent:
        event = self._create_event(event_type, data)
        message = json.dumps(event.model_dump())
        dead_clients = []
        for ws in self._ws_clients:
            try:
                await ws.send_text(message)
            except Exception:
                dead_clients.append(ws)
        for ws in dead_clients:
            self.remove_ws_client(ws)
        return event

    async def process_join(self, request: JoinRequest) -> list[SimEvent]:
        generated_events: list[SimEvent] = []
        group = request.group

        if group not in self.groups:
            self.groups[group] = MulticastGroup(group_addr=group)

        if request.join_type == "starg":
            rp = self.topology.find_rp()
            if rp:
                rp_id = rp.id
            else:
                rp_id = self.groups[group].rp_id
            if not rp_id:
                evt = await self._emit_event("join_failed", {
                    "reason": "No RP configured",
                    "router_id": request.router_id,
                    "group": group,
                })
                generated_events.append(evt)
                return generated_events
            target_id = rp_id
            entry_type = MRouteType.STARG
            source = None
            rpf_target = rp_id
        else:
            if not request.source:
                evt = await self._emit_event("join_failed", {
                    "reason": "Source required for SG join",
                    "router_id": request.router_id,
                    "group": group,
                })
                generated_events.append(evt)
                return generated_events
            target_id = request.source
            entry_type = MRouteType.SG
            source = request.source
            rpf_target = request.source

        rpf_check_req = RPFCheckRequest(
            router_id=request.router_id,
            source_addr=rpf_target,
        )
        rpf_result = self.perform_rpf_check(rpf_check_req)

        evt = await self._emit_event("rpf_check", {
            "router_id": request.router_id,
            "source_addr": rpf_target,
            "rpf_interface": rpf_result.rpf_interface,
            "passed": rpf_result.passed,
        })
        generated_events.append(evt)

        if request.router_id == target_id:
            entry = self._get_or_create_entry(request.router_id, entry_type, group, source)
            if "local" not in entry.downstream_ifs:
                entry.downstream_ifs.append("local")
            evt = await self._emit_event("join_local", {
                "router_id": request.router_id,
                "group": group,
                "source": source,
                "entry_type": entry_type.value,
            })
            generated_events.append(evt)
            if request.router_id not in self.groups[group].receiver_ids:
                self.groups[group].receiver_ids.append(request.router_id)
            return generated_events

        path = self.topology.find_path(request.router_id, target_id)
        if not path:
            evt = await self._emit_event("join_failed", {
                "reason": "No path found",
                "router_id": request.router_id,
                "target_id": target_id,
                "group": group,
            })
            generated_events.append(evt)
            return generated_events

        for i, rid in enumerate(path):
            entry = self._get_or_create_entry(rid, entry_type, group, source)

            if i == 0:
                if "local" not in entry.downstream_ifs:
                    entry.downstream_ifs.append("local")
            else:
                prev_router = path[i - 1]
                downstream_if = self._find_interface_toward(rid, prev_router)
                if downstream_if and downstream_if not in entry.downstream_ifs:
                    entry.downstream_ifs.append(downstream_if)

            if i < len(path) - 1:
                next_router = path[i + 1]
                hop_rpf_check = RPFCheckRequest(
                    router_id=rid,
                    source_addr=rpf_target,
                )
                hop_rpf_result = self.perform_rpf_check(hop_rpf_check)
                if hop_rpf_result.rpf_interface:
                    entry.upstream_if = hop_rpf_result.rpf_interface
                else:
                    upstream_if = self._find_interface_toward(rid, next_router)
                    entry.upstream_if = upstream_if
            else:
                if entry.upstream_if is None:
                    if entry_type == MRouteType.STARG:
                        entry.upstream_if = "rp_local"
                    else:
                        entry.upstream_if = "source_local"

            evt = await self._emit_event("join_forward", {
                "router_id": rid,
                "group": group,
                "source": source,
                "entry_type": entry_type.value,
                "upstream_if": entry.upstream_if,
                "downstream_ifs": list(entry.downstream_ifs),
                "path_index": i,
                "rpf_interface": entry.upstream_if,
            })
            generated_events.append(evt)

        if request.router_id not in self.groups[group].receiver_ids:
            self.groups[group].receiver_ids.append(request.router_id)

        return generated_events

    async def process_prune(self, request: PruneRequest) -> list[SimEvent]:
        generated_events: list[SimEvent] = []
        group = request.group

        if request.prune_type == "starg":
            entry_type = MRouteType.STARG
            source = None
            rp = self.topology.find_rp()
            if rp:
                target_id = rp.id
            elif group in self.groups and self.groups[group].rp_id:
                target_id = self.groups[group].rp_id
            else:
                evt = await self._emit_event("prune_failed", {
                    "reason": "No RP for prune",
                    "router_id": request.router_id,
                    "group": group,
                })
                generated_events.append(evt)
                return generated_events
        else:
            entry_type = MRouteType.SG
            source = request.source
            target_id = request.source

        path = self.topology.find_path(request.router_id, target_id)
        if not path:
            evt = await self._emit_event("prune_failed", {
                "reason": "No path found",
                "router_id": request.router_id,
                "group": group,
            })
            generated_events.append(evt)
            return generated_events

        for i, rid in enumerate(path):
            if rid not in self.mroute_table:
                continue
            entries = self.mroute_table[rid]
            entry = None
            for e in entries:
                if e.entry_type == entry_type and e.group == group and e.source == source:
                    entry = e
                    break
            if not entry:
                continue

            if i == 0:
                if "local" in entry.downstream_ifs:
                    entry.downstream_ifs.remove("local")
            if i > 0:
                prev_router = path[i - 1]
                downstream_if = self._find_interface_toward(rid, prev_router)
                if downstream_if and downstream_if in entry.downstream_ifs:
                    entry.downstream_ifs.remove(downstream_if)

            evt = await self._emit_event("prune_forward", {
                "router_id": rid,
                "group": group,
                "source": source,
                "entry_type": entry_type.value,
                "remaining_downstream_ifs": list(entry.downstream_ifs),
            })
            generated_events.append(evt)

            if not entry.downstream_ifs:
                entries.remove(entry)
                evt = await self._emit_event("entry_removed", {
                    "router_id": rid,
                    "group": group,
                    "source": source,
                    "entry_type": entry_type.value,
                    "reason": "no_downstream",
                })
                generated_events.append(evt)

        if group in self.groups and request.router_id in self.groups[group].receiver_ids:
            self.groups[group].receiver_ids.remove(request.router_id)

        return generated_events

    async def process_register(self, request: RegisterRequest) -> list[SimEvent]:
        generated_events: list[SimEvent] = []
        source_id = request.source_id
        group = request.group

        source_ip = request.source_ip or source_id
        packet_source_ip = request.packet_source_ip or source_ip

        source_ip_matches = (
            source_ip == packet_source_ip or
            source_ip == source_id or
            packet_source_ip == source_id
        )

        if not source_ip_matches:
            evt = await self._emit_event("register_failed", {
                "reason": "Source IP mismatch",
                "source_id": source_id,
                "source_ip": source_ip,
                "packet_source_ip": packet_source_ip,
                "group": group,
            })
            generated_events.append(evt)
            return generated_events

        if group not in self.groups:
            self.groups[group] = MulticastGroup(group_addr=group)

        if source_id not in self.groups[group].source_ids:
            self.groups[group].source_ids.append(source_id)

        rp = self.topology.find_rp()
        if not rp:
            evt = await self._emit_event("register_failed", {
                "reason": "No RP configured",
                "source_id": source_id,
                "group": group,
            })
            generated_events.append(evt)
            return generated_events

        rp_entry = self._get_or_create_entry(rp.id, MRouteType.STARG, group, None)
        if not rp_entry.upstream_if:
            rp_entry.upstream_if = "register"

        sg_join = JoinRequest(
            router_id=rp.id,
            group=group,
            source=source_id,
            join_type="sg",
        )
        join_events = await self.process_join(sg_join)
        generated_events.extend(join_events)

        evt = await self._emit_event("register", {
            "source_id": source_id,
            "source_ip": source_ip,
            "packet_source_ip": packet_source_ip,
            "rp_id": rp.id,
            "group": group,
        })
        generated_events.append(evt)

        return generated_events

    async def switch_to_spt(self, request: SwitchSPTRequest) -> list[SimEvent]:
        generated_events: list[SimEvent] = []

        rpf_check_req = RPFCheckRequest(
            router_id=request.receiver_id,
            source_addr=request.source_id,
        )
        rpf_result = self.perform_rpf_check(rpf_check_req)

        evt = await self._emit_event("spt_rpf_check", {
            "router_id": request.receiver_id,
            "source_addr": request.source_id,
            "rpf_interface": rpf_result.rpf_interface,
            "passed": rpf_result.passed,
        })
        generated_events.append(evt)

        sg_join = JoinRequest(
            router_id=request.receiver_id,
            group=request.group,
            source=request.source_id,
            join_type="sg",
        )
        join_events = await self.process_join(sg_join)
        generated_events.extend(join_events)

        rp = self.topology.find_rp()
        if rp:
            path_to_rp = self.topology.find_path(request.receiver_id, rp.id)
            path_to_source = self.topology.find_path(request.receiver_id, request.source_id)

            if path_to_rp and path_to_source:
                divergence_router = None
                for rid in path_to_source:
                    if rid in path_to_rp:
                        divergence_router = rid
                    else:
                        break

                if divergence_router:
                    prune_path = self.topology.find_path(divergence_router, rp.id)
                    for rid in prune_path:
                        if rid not in self.mroute_table:
                            continue
                        entries = self.mroute_table[rid]
                        for entry in list(entries):
                            if entry.entry_type == MRouteType.STARG and entry.group == request.group:
                                downstream_to_diverge = self._find_interface_toward(rid, divergence_router)
                                if downstream_to_diverge and downstream_to_diverge in entry.downstream_ifs:
                                    entry.downstream_ifs.remove(downstream_to_diverge)
                                if not entry.downstream_ifs and rid != rp.id:
                                    entries.remove(entry)
                                break

            evt = await self._emit_event("spt_switch", {
                "receiver_id": request.receiver_id,
                "group": request.group,
                "source_id": request.source_id,
                "rp_id": rp.id if rp else None,
            })
            generated_events.append(evt)

        return generated_events

    def get_mroute_table(self, router_id: str) -> list[MRouteEntry]:
        return self.mroute_table.get(router_id, [])

    def get_unicast_routes(self, router_id: str) -> list[RouteEntry]:
        return self.unicast_routes.get_routes(router_id)

    def get_traffic_path(self, group: str, source_id: str | None = None) -> list[dict]:
        edges: list[dict] = []
        visited: set[tuple[str, str, str]] = set()

        if source_id:
            sg_edges = self._collect_tree_edges(group, MRouteType.SG, source_id)
            for edge in sg_edges:
                key = (edge["from"], edge["to"], "spt")
                if key not in visited:
                    visited.add(key)
                    edges.append(edge)

        rpt_edges = self._collect_tree_edges(group, MRouteType.STARG, None)
        for edge in rpt_edges:
            spt_key = (edge["from"], edge["to"], "spt")
            if spt_key not in visited:
                key = (edge["from"], edge["to"], "rpt")
                if key not in visited:
                    visited.add(key)
                    edges.append(edge)

        return edges

    def _collect_tree_edges(
        self, group: str, entry_type: MRouteType, source: str | None
    ) -> list[dict]:
        edges: list[dict] = []
        for router_id, entries in self.mroute_table.items():
            for entry in entries:
                if entry.entry_type != entry_type or entry.group != group or entry.source != source:
                    continue
                if not entry.downstream_ifs:
                    continue
                for down_if in entry.downstream_ifs:
                    if down_if == "local":
                        continue
                    neighbor_id = self._find_neighbor_by_interface(router_id, down_if)
                    if neighbor_id:
                        tree_type = "spt" if entry_type == MRouteType.SG else "rpt"
                        edges.append({
                            "from": router_id,
                            "to": neighbor_id,
                            "tree_type": tree_type,
                        })
        return edges

    def _find_neighbor_by_interface(self, router_id: str, interface_id: str) -> str | None:
        neighbors = self.topology.get_neighbors(router_id)
        for neighbor_id, if_id, _ in neighbors:
            if if_id == interface_id:
                return neighbor_id
        return None

    def add_ws_client(self, ws):
        self._ws_clients.append(ws)

    def remove_ws_client(self, ws):
        if ws in self._ws_clients:
            self._ws_clients.remove(ws)
