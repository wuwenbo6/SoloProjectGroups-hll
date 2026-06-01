from __future__ import annotations
from collections import deque
from models import Router, Link, Interface, RouterType


class TopologyManager:
    def __init__(self):
        self._routers: dict[str, Router] = {}
        self._links: dict[str, Link] = {}
        self._interfaces: dict[str, Interface] = {}
        self._adjacency: dict[str, list[tuple[str, str, str]]] = {}

    def add_router(self, router: Router) -> Router:
        self._routers[router.id] = router
        if router.id not in self._adjacency:
            self._adjacency[router.id] = []
        return router

    def remove_router(self, router_id: str) -> bool:
        if router_id not in self._routers:
            return False
        links_to_remove = [
            lid for lid, link in self._links.items()
            if link.router_a_id == router_id or link.router_b_id == router_id
        ]
        for lid in links_to_remove:
            self.remove_link(lid)
        del self._routers[router_id]
        self._adjacency.pop(router_id, None)
        return True

    def add_link(self, link: Link) -> Link:
        self._links[link.id] = link
        if_a = Interface(
            id=link.interface_a_id,
            name=f"eth{len(self._interfaces)}",
            router_id=link.router_a_id,
            neighbor_router_id=link.router_b_id,
            neighbor_if_id=link.interface_b_id,
            cost=link.cost,
        )
        if_b = Interface(
            id=link.interface_b_id,
            name=f"eth{len(self._interfaces) + 1}",
            router_id=link.router_b_id,
            neighbor_router_id=link.router_a_id,
            neighbor_if_id=link.interface_a_id,
            cost=link.cost,
        )
        self._interfaces[if_a.id] = if_a
        self._interfaces[if_b.id] = if_b
        if link.router_a_id not in self._adjacency:
            self._adjacency[link.router_a_id] = []
        if link.router_b_id not in self._adjacency:
            self._adjacency[link.router_b_id] = []
        self._adjacency[link.router_a_id].append(
            (link.router_b_id, link.interface_a_id, link.interface_b_id)
        )
        self._adjacency[link.router_b_id].append(
            (link.router_a_id, link.interface_b_id, link.interface_a_id)
        )
        return link

    def remove_link(self, link_id: str) -> bool:
        if link_id not in self._links:
            return False
        link = self._links[link_id]
        if_id_a = link.interface_a_id
        if_id_b = link.interface_b_id
        self._interfaces.pop(if_id_a, None)
        self._interfaces.pop(if_id_b, None)
        self._adjacency[link.router_a_id] = [
            entry for entry in self._adjacency.get(link.router_a_id, [])
            if entry[1] != if_id_a
        ]
        self._adjacency[link.router_b_id] = [
            entry for entry in self._adjacency.get(link.router_b_id, [])
            if entry[1] != if_id_b
        ]
        del self._links[link_id]
        return True

    def get_router(self, router_id: str) -> Router | None:
        return self._routers.get(router_id)

    def get_interface(self, interface_id: str) -> Interface | None:
        return self._interfaces.get(interface_id)

    def get_neighbors(self, router_id: str) -> list[tuple[str, str, str]]:
        return self._adjacency.get(router_id, [])

    def find_path(self, start_id: str, end_id: str) -> list[str]:
        if start_id == end_id:
            return [start_id]
        if start_id not in self._adjacency or end_id not in self._adjacency:
            return []
        visited = {start_id}
        queue = deque([(start_id, [start_id])])
        while queue:
            current, path = queue.popleft()
            for neighbor, _, _ in self._adjacency.get(current, []):
                if neighbor in visited:
                    continue
                new_path = path + [neighbor]
                if neighbor == end_id:
                    return new_path
                visited.add(neighbor)
                queue.append((neighbor, new_path))
        return []

    def get_all_routers(self) -> list[Router]:
        return list(self._routers.values())

    def get_all_links(self) -> list[Link]:
        return list(self._links.values())

    def get_all_interfaces(self) -> list[Interface]:
        return list(self._interfaces.values())

    def find_rp(self) -> Router | None:
        for r in self._routers.values():
            if r.is_rp:
                return r
        return None

    def find_routers_by_type(self, router_type: RouterType) -> list[Router]:
        return [r for r in self._routers.values() if r.type == router_type]

    def clear(self):
        self._routers.clear()
        self._links.clear()
        self._interfaces.clear()
        self._adjacency.clear()

    def to_dict(self) -> dict:
        return {
            "routers": [r.model_dump() for r in self._routers.values()],
            "links": [l.model_dump() for l in self._links.values()],
            "interfaces": [i.model_dump() for i in self._interfaces.values()],
        }

    def load_from_dict(self, data: dict):
        self.clear()
        for r_data in data.get("routers", []):
            self.add_router(Router(**r_data))
        for l_data in data.get("links", []):
            self.add_link(Link(**l_data))
