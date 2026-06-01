from __future__ import annotations
from typing import Optional
from models import RouteEntry, RPFCheckResult


class UnicastRouteManager:
    def __init__(self):
        self._routes: dict[str, list[RouteEntry]] = {}
        self._entry_counter = 0

    def add_route(
        self,
        router_id: str,
        destination: str,
        next_hop: str,
        interface: str,
        metric: int = 1,
        protocol: str = "static",
    ) -> RouteEntry:
        self._entry_counter += 1
        entry_id = f"{router_id}-route-{self._entry_counter}"
        entry = RouteEntry(
            id=entry_id,
            router_id=router_id,
            destination=destination,
            next_hop=next_hop,
            interface=interface,
            metric=metric,
            protocol=protocol,
        )
        if router_id not in self._routes:
            self._routes[router_id] = [entry]
        else:
            self._routes[router_id].append(entry)
        return entry

    def remove_route(self, entry_id: str) -> bool:
        for router_id, entries in self._routes.items():
            for i, entry in enumerate(entries):
                if entry.id == entry_id:
                    entries.pop(i)
                    return True
        return False

    def get_routes(self, router_id: str) -> list[RouteEntry]:
        return self._routes.get(router_id, [])

    def find_best_route(
        self, router_id: str, destination: str
    ) -> Optional[RouteEntry]:
        entries = self._routes.get(router_id, [])
        matching = [e for e in entries if e.destination == destination]
        if not matching:
            return None
        matching.sort(key=lambda e: e.metric)
        return matching[0]

    def find_rpf_interface(
        self, router_id: str, source_addr: str
    ) -> Optional[str]:
        best_route = self.find_best_route(router_id, source_addr)
        if best_route:
            return best_route.interface
        return None

    def check_rpf(
        self,
        router_id: str,
        source_addr: str,
        incoming_if: Optional[str] = None,
    ) -> RPFCheckResult:
        rpf_if = self.find_rpf_interface(router_id, source_addr)
        if rpf_if is None:
            return RPFCheckResult(
                passed=False,
                rpf_interface=None,
                source_addr=source_addr,
                router_id=router_id,
                reason="No unicast route to source",
            )
        if incoming_if is None:
            return RPFCheckResult(
                passed=True,
                rpf_interface=rpf_if,
                source_addr=source_addr,
                router_id=router_id,
            )
        passed = rpf_if == incoming_if
        return RPFCheckResult(
            passed=passed,
            rpf_interface=rpf_if,
            source_addr=source_addr,
            router_id=router_id,
            reason=None if passed else f"RPF interface mismatch",
        )

    def build_from_topology(self, topology_manager) -> None:
        routers = topology_manager.get_all_routers()
        for router in routers:
            for other_router in routers:
                if router.id == other_router.id:
                    continue
                path = topology_manager.find_path(router.id, other_router.id)
                if len(path) >= 2:
                    next_hop_id = path[1]
                    neighbors = topology_manager.get_neighbors(router.id)
                    for neighbor_id, if_id, _ in neighbors:
                        if neighbor_id == next_hop_id:
                            self.add_route(
                                router_id=router.id,
                                destination=other_router.id,
                                next_hop=next_hop_id,
                                interface=if_id,
                                metric=len(path) - 1,
                                protocol="auto",
                            )
                            break

    def clear(self) -> None:
        self._routes.clear()

    def to_dict(self) -> dict:
        return {
            router_id: [e.model_dump() for e in entries]
            for router_id, entries in self._routes.items()
        }

    def load_from_dict(self, data: dict) -> None:
        self.clear()
        for router_id, entries_data in data.items():
            self._routes[router_id] = [
                RouteEntry(**e) for e in entries_data
            ]
