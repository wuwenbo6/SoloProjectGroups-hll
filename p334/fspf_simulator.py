#!/usr/bin/env python3

import heapq
import json
import time
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class LSType(Enum):
    HELLO = 1
    LSU = 2
    LSA = 3
    ACK = 4


class PortState(Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    BYPASSED = "bypassed"


class RDIStatus(Enum):
    DETECTED = "detected"
    ASSIGNING = "assigning"
    ASSIGNED = "assigned"
    FAILED = "failed"


@dataclass
class LinkStateUpdate:
    source_domain: int
    lsu_seq: int
    lsas: list
    timestamp: float = 0.0

    def __post_init__(self):
        if self.timestamp == 0.0:
            self.timestamp = time.monotonic()

    def __str__(self):
        lsa_summary = ", ".join(
            f"LSA(dom=0x{lsa.domain_id:02x},seq={lsa.sequence_number})"
            for lsa in self.lsas
        )
        return (f"LSU(src=0x{self.source_domain:02x}, seq={self.lsu_seq}, "
                f"lsas=[{lsa_summary}])")


@dataclass
class RDIEvent:
    conflicting_domain: int
    old_domain: int
    new_domain: int
    principal_domain: int
    status: RDIStatus
    timestamp: float = 0.0
    reason: str = ""

    def __post_init__(self):
        if self.timestamp == 0.0:
            self.timestamp = time.monotonic()

    def __str__(self):
        return (f"RDI: conflict on 0x{self.conflicting_domain:02x} | "
                f"0x{self.old_domain:02x} -> 0x{self.new_domain:02x} | "
                f"by principal 0x{self.principal_domain:02x} | "
                f"status={self.status.value} | {self.reason}")


@dataclass
class LinkStateAdvertisement:
    domain_id: int
    sequence_number: int
    links: list
    age: int = 0

    def __eq__(self, other):
        if not isinstance(other, LinkStateAdvertisement):
            return False
        return (self.domain_id == other.domain_id
                and self.sequence_number == other.sequence_number)

    def __hash__(self):
        return hash((self.domain_id, self.sequence_number))

    def is_newer_than(self, other: Optional["LinkStateAdvertisement"]) -> bool:
        if other is None:
            return True
        if self.sequence_number > other.sequence_number:
            return True
        if self.sequence_number == other.sequence_number:
            return self.age < other.age
        return False


@dataclass
class ISLink:
    local_domain: int
    local_port: int
    remote_domain: int
    remote_port: int
    cost: int = 1
    state: PortState = PortState.ONLINE

    @property
    def is_active(self) -> bool:
        return self.state == PortState.ONLINE

    def __hash__(self):
        return hash((self.local_domain, self.local_port,
                      self.remote_domain, self.remote_port))


@dataclass
class RoutingTableEntry:
    destination_domain: int
    next_hops: list
    out_ports: list
    total_cost: int
    paths: list

    def __post_init__(self):
        self.next_hops = self.next_hops if isinstance(self.next_hops, list) else [self.next_hops]
        self.out_ports = self.out_ports if isinstance(self.out_ports, list) else [self.out_ports]
        self.paths = self.paths if isinstance(self.paths, list) else [self.paths]

    @property
    def next_hop_domain(self) -> int:
        return self.next_hops[0] if self.next_hops else 0

    @property
    def out_port(self) -> int:
        return self.out_ports[0] if self.out_ports else 0

    @property
    def path(self) -> list:
        return self.paths[0] if self.paths else []

    @property
    def path_count(self) -> int:
        return len(self.paths)

    def __str__(self):
        if self.path_count == 1:
            path_str = " -> ".join(str(d) for d in self.path)
            return (f"  Dest: 0x{self.destination_domain:02x}({self.destination_domain:3d}) | "
                    f"NextHop: 0x{self.next_hop_domain:02x}({self.next_hop_domain:3d}) | "
                    f"Port: {self.out_port} | "
                    f"Cost: {self.total_cost} | "
                    f"Path: {path_str}")
        else:
            paths_str = f" [{self.path_count} paths]"
            return (f"  Dest: 0x{self.destination_domain:02x}({self.destination_domain:3d}) | "
                    f"NextHops: {self.path_count} ECMP | "
                    f"Ports: {len(self.out_ports)} | "
                    f"Cost: {self.total_cost} |"
                    f"{paths_str}")


class Switch:
    def __init__(self, domain_id: int, name: str = ""):
        self.domain_id = domain_id
        self.name = name or f"SW_{domain_id:02x}"
        self.links: list[ISLink] = []
        self.lsdb: dict[int, LinkStateAdvertisement] = {}
        self.routing_table: list[RoutingTableEntry] = []
        self.lsa_seq_counter: int = 1
        self.lsu_seq_counter: int = 1
        self.lsu_history: list[LinkStateUpdate] = []
        self.neighbors: dict[int, ISLink] = {}
        self.ecmp_enabled: bool = True

    def add_link(self, link: ISLink):
        for existing in self.links:
            if (existing.local_domain == link.local_domain
                    and existing.local_port == link.local_port):
                existing.remote_domain = link.remote_domain
                existing.remote_port = link.remote_port
                existing.cost = link.cost
                existing.state = link.state
                self._update_neighbors()
                return
        self.links.append(link)
        self._update_neighbors()

    def remove_link(self, port: int):
        self.links = [l for l in self.links if l.local_port != port]
        self._update_neighbors()

    def _update_neighbors(self):
        self.neighbors = {}
        for link in self.links:
            if link.is_active and link.local_domain == self.domain_id:
                self.neighbors[link.remote_domain] = link

    def generate_lsa(self) -> LinkStateAdvertisement:
        active_links = [
            {
                "neighbor_domain": link.remote_domain,
                "local_port": link.local_port,
                "remote_port": link.remote_port,
                "cost": link.cost,
                "state": link.state.value,
            }
            for link in self.links
            if link.is_active
        ]
        lsa = LinkStateAdvertisement(
            domain_id=self.domain_id,
            sequence_number=self.lsa_seq_counter,
            links=active_links,
        )
        self.lsa_seq_counter += 1
        return lsa

    def generate_lsu(self, lsa: LinkStateAdvertisement) -> LinkStateUpdate:
        lsu = LinkStateUpdate(
            source_domain=self.domain_id,
            lsu_seq=self.lsu_seq_counter,
            lsas=[lsa],
        )
        self.lsu_seq_counter += 1
        self.lsu_history.append(lsu)
        return lsu

    def install_lsa(self, lsa: LinkStateAdvertisement) -> bool:
        existing = self.lsdb.get(lsa.domain_id)
        if lsa.is_newer_than(existing):
            self.lsdb[lsa.domain_id] = lsa
            return True
        return False

    def build_routing_table(self, all_switches: dict[int, "Switch"]):
        dist, prevs, port_maps = self._dijkstra(all_switches)
        self.routing_table = []

        for dest_id in sorted(dist.keys()):
            if dest_id == self.domain_id:
                continue
            if dist[dest_id] == float("inf"):
                continue

            all_paths = self._reconstruct_all_paths(prevs, dest_id)

            next_hops = set()
            out_ports = set()
            for path in all_paths:
                if len(path) > 1:
                    next_hop = path[1]
                    next_hops.add(next_hop)
                    if next_hop in port_maps:
                        out_ports.add(port_maps[next_hop])

            self.routing_table.append(RoutingTableEntry(
                destination_domain=dest_id,
                next_hops=list(next_hops),
                out_ports=list(out_ports),
                total_cost=dist[dest_id],
                paths=all_paths,
            ))

    def _dijkstra(self, all_switches: dict[int, "Switch"]):
        dist = {self.domain_id: 0}
        prevs = defaultdict(list)
        port_maps = {}
        visited = set()
        heap = [(0, self.domain_id)]

        for neighbor_domain, link in self.neighbors.items():
            port_maps[neighbor_domain] = link.local_port

        while heap:
            d, u = heapq.heappop(heap)

            if u in visited:
                continue

            if d > dist.get(u, float("inf")):
                continue

            visited.add(u)

            if u not in all_switches:
                continue
            switch = all_switches[u]

            for neighbor_domain, link in switch.neighbors.items():
                if link.local_domain != u:
                    continue
                new_dist = d + link.cost

                if neighbor_domain not in dist or new_dist < dist[neighbor_domain]:
                    dist[neighbor_domain] = new_dist
                    prevs[neighbor_domain] = [u]
                    heapq.heappush(heap, (new_dist, neighbor_domain))
                    if u == self.domain_id:
                        port_maps[neighbor_domain] = link.local_port
                    elif u in port_maps:
                        port_maps[neighbor_domain] = port_maps[u]
                elif new_dist == dist[neighbor_domain] and self.ecmp_enabled:
                    if u not in prevs[neighbor_domain]:
                        prevs[neighbor_domain].append(u)
                        heapq.heappush(heap, (new_dist, neighbor_domain))
                        if u == self.domain_id and neighbor_domain not in port_maps:
                            port_maps[neighbor_domain] = link.local_port

        all_domains = set(all_switches.keys())
        for domain in all_domains:
            if domain not in dist:
                dist[domain] = float("inf")

        return dist, prevs, port_maps

    def _reconstruct_all_paths(self, prevs: dict, dest: int) -> list:
        paths = []

        def backtrack(node, current_path):
            if node == self.domain_id:
                paths.append([self.domain_id] + list(reversed(current_path)))
                return
            if not prevs.get(node):
                return
            for prev_node in prevs[node]:
                current_path.append(node)
                backtrack(prev_node, current_path)
                current_path.pop()

        if dest != self.domain_id:
            backtrack(dest, [])

        if not paths:
            return []

        unique_paths = []
        seen = set()
        for p in paths:
            path_tuple = tuple(p)
            if path_tuple not in seen:
                seen.add(path_tuple)
                unique_paths.append(p)

        return unique_paths

    def print_routing_table(self, show_all_paths: bool = False):
        ecmp_count = sum(1 for e in self.routing_table if e.path_count > 1)
        ecmp_status = f" (ECMP: {ecmp_count} destinations)" if self.ecmp_enabled and ecmp_count > 0 else ""

        print(f"\n{'=' * 80}")
        print(f"  Routing Table for {self.name} (Domain ID: 0x{self.domain_id:02x} / {self.domain_id}){ecmp_status}")
        print(f"  ECMP Mode: {'ENABLED' if self.ecmp_enabled else 'DISABLED'}")
        print(f"{'=' * 80}")

        if not self.routing_table:
            print("  (no routes)")
            print(f"{'=' * 80}")
            return

        has_ecmp = any(e.path_count > 1 for e in self.routing_table)

        if has_ecmp:
            print(f"  {'Dest Domain':<18} | {'ECMP Hops':<10} | {'Cost':<6} | {'Paths'}")
            print(f"  {'-' * 18} | {'-' * 10} | {'-' * 6} | {'-' * 42}")

            for entry in self.routing_table:
                dest_str = f"0x{entry.destination_domain:02x}({entry.destination_domain:3d})"
                if entry.path_count == 1:
                    path_str = " -> ".join(f"0x{p:02x}" for p in entry.path)
                    print(f"  {dest_str:<18} |    1       | {entry.total_cost:<6} | {path_str}")
                else:
                    print(f"  {dest_str:<18} |   {entry.path_count:<3}      | {entry.total_cost:<6} | ({entry.path_count} equal-cost paths)")
                    if show_all_paths:
                        for i, path in enumerate(entry.paths, 1):
                            path_str = " -> ".join(f"0x{p:02x}" for p in path)
                            print(f"                                                              [{i}] {path_str}")
        else:
            print(f"  {'Dest Domain':<18} | {'Next Hop':<18} | {'Out Port':<8} | {'Cost':<6} | {'Path'}")
            print(f"  {'-' * 18} | {'-' * 18} | {'-' * 8} | {'-' * 6} | {'-' * 30}")

            for entry in self.routing_table:
                dest_str = f"0x{entry.destination_domain:02x}({entry.destination_domain:3d})"
                nh_str = f"0x{entry.next_hop_domain:02x}({entry.next_hop_domain:3d})"
                path_str = " -> ".join(f"0x{p:02x}" for p in entry.path)
                print(f"  {dest_str:<18} | {nh_str:<18} | {entry.out_port:<8} | {entry.total_cost:<6} | {path_str}")

        print(f"{'=' * 80}")

    def print_lsdb(self):
        print(f"\n  LSDB for {self.name} (Domain 0x{self.domain_id:02x}):")
        if not self.lsdb:
            print("    (empty)")
        for domain_id, lsa in sorted(self.lsdb.items()):
            print(f"    LSA from Domain 0x{domain_id:02x} | Seq: {lsa.sequence_number} | Age: {lsa.age} | Links: {len(lsa.links)}")
            for link_info in lsa.links:
                print(f"      -> Neighbor: 0x{link_info['neighbor_domain']:02x} | "
                      f"Port: {link_info['local_port']} -> {link_info['remote_port']} | "
                      f"Cost: {link_info['cost']} | State: {link_info['state']}")

    def print_lsu_history(self):
        print(f"\n  LSU History for {self.name} (Domain 0x{self.domain_id:02x}):")
        if not self.lsu_history:
            print("    (no LSUs sent)")
        for lsu in self.lsu_history:
            print(f"    {lsu}")


class FSPFSimulator:
    DOMAIN_ID_MIN = 1
    DOMAIN_ID_MAX = 239

    def __init__(self):
        self.switches: dict[int, Switch] = {}
        self.isls: list[ISLink] = []
        self.flood_log: list[str] = []
        self.lsu_log: list[LinkStateUpdate] = []
        self.rdi_log: list[RDIEvent] = []
        self.principal_domain: Optional[int] = None
        self.ack_log: list[str] = []

    def add_switch(self, domain_id: int, name: str = "", auto_rdi: bool = True) -> Switch:
        if domain_id in self.switches:
            if auto_rdi:
                new_domain = self._handle_domain_conflict(domain_id, name)
                if new_domain is not None:
                    return self.add_switch(new_domain, name, auto_rdi=False)
            print(f"  [WARN] Switch with Domain ID 0x{domain_id:02x} already exists. Use 'rdi' to resolve.")
            return self.switches[domain_id]

        sw = Switch(domain_id, name)
        self.switches[domain_id] = sw

        if self.principal_domain is None:
            self.principal_domain = domain_id

        lsa = sw.generate_lsa()
        lsu = sw.generate_lsu(lsa)
        sw.install_lsa(lsa)
        self.lsu_log.append(lsu)
        return sw

    def _handle_domain_conflict(self, conflicting_domain: int, new_name: str = "") -> Optional[int]:
        new_domain = self._find_available_domain()
        if new_domain is None:
            rdi_event = RDIEvent(
                conflicting_domain=conflicting_domain,
                old_domain=conflicting_domain,
                new_domain=conflicting_domain,
                principal_domain=self.principal_domain or 0,
                status=RDIStatus.FAILED,
                reason="No available domain IDs",
            )
            self.rdi_log.append(rdi_event)
            return None

        rdi_event = RDIEvent(
            conflicting_domain=conflicting_domain,
            old_domain=conflicting_domain,
            new_domain=new_domain,
            principal_domain=self.principal_domain or 0,
            status=RDIStatus.DETECTED,
            reason=f"Domain ID 0x{conflicting_domain:02x} conflict detected",
        )
        self.rdi_log.append(rdi_event)

        print(f"  [RDI] Domain ID conflict detected: 0x{conflicting_domain:02x} already in use.")
        print(f"  [RDI] Principal switch 0x{self.principal_domain or 0:02x} assigning new Domain ID: 0x{new_domain:02x}")

        rdi_assign = RDIEvent(
            conflicting_domain=conflicting_domain,
            old_domain=conflicting_domain,
            new_domain=new_domain,
            principal_domain=self.principal_domain or 0,
            status=RDIStatus.ASSIGNING,
            reason=f"RDI in progress: 0x{conflicting_domain:02x} -> 0x{new_domain:02x}",
        )
        self.rdi_log.append(rdi_assign)

        return new_domain

    def _find_available_domain(self) -> Optional[int]:
        used = set(self.switches.keys())
        for d in range(self.DOMAIN_ID_MIN, self.DOMAIN_ID_MAX + 1):
            if d not in used:
                return d
        return None

    def trigger_rdi(self, domain_id: int, new_domain: Optional[int] = None):
        if domain_id not in self.switches:
            print(f"  [ERROR] Switch 0x{domain_id:02x} not found.")
            return

        if new_domain is not None and new_domain in self.switches:
            print(f"  [ERROR] Target domain 0x{new_domain:02x} already in use.")
            return

        if new_domain is None:
            new_domain = self._find_available_domain()
            if new_domain is None:
                rdi_event = RDIEvent(
                    conflicting_domain=domain_id,
                    old_domain=domain_id,
                    new_domain=domain_id,
                    principal_domain=self.principal_domain or 0,
                    status=RDIStatus.FAILED,
                    reason="No available domain IDs",
                )
                self.rdi_log.append(rdi_event)
                print(f"  [RDI] Failed: no available domain IDs.")
                return

        sw = self.switches[domain_id]
        old_domain = domain_id
        old_name = sw.name

        rdi_detected = RDIEvent(
            conflicting_domain=domain_id,
            old_domain=old_domain,
            new_domain=new_domain,
            principal_domain=self.principal_domain or 0,
            status=RDIStatus.DETECTED,
            reason=f"Manual RDI triggered for 0x{domain_id:02x}",
        )
        self.rdi_log.append(rdi_detected)

        print(f"  [RDI] Reassigning switch {old_name} from Domain 0x{old_domain:02x} to 0x{new_domain:02x}")

        del self.switches[old_domain]
        sw.domain_id = new_domain
        sw.name = old_name
        sw.lsa_seq_counter = 1
        sw.lsu_seq_counter = 1
        sw.lsu_history.clear()
        sw.lsdb.clear()

        for link in sw.links:
            link.local_domain = new_domain

        self.switches[new_domain] = sw

        for other_sw in self.switches.values():
            for link in other_sw.links:
                if link.remote_domain == old_domain:
                    link.remote_domain = new_domain

        for isl in self.isls:
            if isl.local_domain == old_domain:
                isl.local_domain = new_domain
            if isl.remote_domain == old_domain:
                isl.remote_domain = new_domain

        for other_sw in self.switches.values():
            other_sw._update_neighbors()

        if self.principal_domain == old_domain:
            self.principal_domain = new_domain

        self._reflood_all()

        rdi_assigned = RDIEvent(
            conflicting_domain=domain_id,
            old_domain=old_domain,
            new_domain=new_domain,
            principal_domain=self.principal_domain or 0,
            status=RDIStatus.ASSIGNED,
            reason=f"RDI completed: 0x{old_domain:02x} -> 0x{new_domain:02x}",
        )
        self.rdi_log.append(rdi_assigned)

        print(f"  [RDI] Reassignment complete. Switch is now Domain 0x{new_domain:02x}.")

    def remove_switch(self, domain_id: int):
        if domain_id not in self.switches:
            print(f"  [WARN] Switch 0x{domain_id:02x} not found.")
            return
        self.isls = [isl for isl in self.isls
                     if isl.local_domain != domain_id and isl.remote_domain != domain_id]
        del self.switches[domain_id]
        for sw in self.switches.values():
            sw.links = [l for l in sw.links
                        if l.remote_domain != domain_id]
            sw._update_neighbors()
        self._reflood_all()

    def add_isl(self, domain_a: int, domain_b: int,
                port_a: int, port_b: int, cost: int = 1):
        if domain_a not in self.switches or domain_b not in self.switches:
            print(f"  [ERROR] Both switches must exist before adding ISL.")
            return

        link_a = ISLink(
            local_domain=domain_a, local_port=port_a,
            remote_domain=domain_b, remote_port=port_b, cost=cost,
        )
        link_b = ISLink(
            local_domain=domain_b, local_port=port_b,
            remote_domain=domain_a, remote_port=port_a, cost=cost,
        )

        sw_a = self.switches[domain_a]
        sw_b = self.switches[domain_b]
        sw_a.add_link(link_a)
        sw_b.add_link(link_b)

        self.isls.append(link_a)

        self.flood_log.append(
            f"ISL added: 0x{domain_a:02x}:port{port_a} <-> 0x{domain_b:02x}:port{port_b} (cost={cost})"
        )
        self._flood_lsa_from(domain_a)
        self._flood_lsa_from(domain_b)
        self._recompute_all_routes()

    def remove_isl(self, domain_a: int, port_a: int):
        if domain_a not in self.switches:
            print(f"  [ERROR] Switch 0x{domain_a:02x} not found.")
            return

        sw_a = self.switches[domain_a]
        target_link = None
        for link in sw_a.links:
            if link.local_port == port_a:
                target_link = link
                break

        if target_link is None:
            print(f"  [ERROR] Port {port_a} not found on switch 0x{domain_a:02x}.")
            return

        remote_domain = target_link.remote_domain
        remote_port = target_link.remote_port

        sw_a.remove_link(port_a)

        if remote_domain in self.switches:
            sw_b = self.switches[remote_domain]
            sw_b.remove_link(remote_port)

        self.isls = [isl for isl in self.isls
                     if not (isl.local_domain == domain_a and isl.local_port == port_a)]

        self.flood_log.append(
            f"ISL removed: 0x{domain_a:02x}:port{port_a} <-> 0x{remote_domain:02x}:port{remote_port}"
        )
        self._flood_lsa_from(domain_a)
        if remote_domain in self.switches:
            self._flood_lsa_from(remote_domain)
        self._recompute_all_routes()

    def set_link_state(self, domain_id: int, port: int, state: PortState):
        if domain_id not in self.switches:
            print(f"  [ERROR] Switch 0x{domain_id:02x} not found.")
            return

        sw = self.switches[domain_id]
        link = None
        for l in sw.links:
            if l.local_port == port:
                link = l
                break

        if link is None:
            print(f"  [ERROR] Port {port} not found on switch 0x{domain_id:02x}.")
            return

        old_state = link.state
        link.state = state

        remote_domain = link.remote_domain
        if remote_domain in self.switches:
            sw_b = self.switches[remote_domain]
            for l in sw_b.links:
                if l.local_port == link.remote_port:
                    l.state = state
                    break
            sw_b._update_neighbors()

        sw._update_neighbors()

        self.flood_log.append(
            f"Link state changed: 0x{domain_id:02x}:port{port} {old_state.value} -> {state.value}"
        )
        self._flood_lsa_from(domain_id)
        if remote_domain in self.switches:
            self._flood_lsa_from(remote_domain)
        self._recompute_all_routes()

    def set_link_cost(self, domain_id: int, port: int, cost: int):
        if domain_id not in self.switches:
            print(f"  [ERROR] Switch 0x{domain_id:02x} not found.")
            return

        sw = self.switches[domain_id]
        link = None
        for l in sw.links:
            if l.local_port == port:
                link = l
                break

        if link is None:
            print(f"  [ERROR] Port {port} not found on switch 0x{domain_id:02x}.")
            return

        old_cost = link.cost
        link.cost = cost

        remote_domain = link.remote_domain
        if remote_domain in self.switches:
            sw_b = self.switches[remote_domain]
            for l in sw_b.links:
                if l.local_port == link.remote_port:
                    l.cost = cost
                    break

        self.flood_log.append(
            f"Link cost changed: 0x{domain_id:02x}:port{port} cost {old_cost} -> {cost}"
        )
        self._flood_lsa_from(domain_id)
        if remote_domain in self.switches:
            self._flood_lsa_from(remote_domain)
        self._recompute_all_routes()

    def _flood_lsa_from(self, domain_id: int):
        if domain_id not in self.switches:
            return
        sw = self.switches[domain_id]
        lsa = sw.generate_lsa()
        lsu = sw.generate_lsu(lsa)
        sw.install_lsa(lsa)
        self.lsu_log.append(lsu)

        self.ack_log.append(
            f"LSU seq={lsu.lsu_seq} from 0x{domain_id:02x} "
            f"(LSA dom=0x{lsa.domain_id:02x}, seq={lsa.sequence_number}) "
            f"flooding started"
        )

        changed = {domain_id}
        queue = [domain_id]

        while queue:
            current = queue.pop(0)
            if current not in self.switches:
                continue
            current_sw = self.switches[current]

            for neighbor_domain in current_sw.neighbors:
                if neighbor_domain not in self.switches:
                    continue
                neighbor_sw = self.switches[neighbor_domain]
                if neighbor_sw.install_lsa(lsa):
                    self.ack_log.append(
                        f"  -> 0x{neighbor_domain:02x} installed LSA(dom=0x{lsa.domain_id:02x}, seq={lsa.sequence_number})"
                    )
                    if neighbor_domain not in changed:
                        changed.add(neighbor_domain)
                        queue.append(neighbor_domain)
                else:
                    self.ack_log.append(
                        f"  -> 0x{neighbor_domain:02x} discarded LSA(dom=0x{lsa.domain_id:02x}, seq={lsa.sequence_number}) (stale)"
                    )

    def _reflood_all(self):
        for domain_id in self.switches:
            sw = self.switches[domain_id]
            lsa = sw.generate_lsa()
            sw.install_lsa(lsa)

        for domain_id in self.switches:
            for _, other_sw in self.switches.items():
                if domain_id in other_sw.lsdb:
                    continue
                if domain_id in self.switches:
                    lsa = self.switches[domain_id].lsdb.get(domain_id)
                    if lsa:
                        other_sw.install_lsa(lsa)

        for domain_id in self.switches:
            self._flood_lsa_from(domain_id)
        self._recompute_all_routes()

    def _recompute_all_routes(self):
        for sw in self.switches.values():
            sw.build_routing_table(self.switches)

    def print_topology(self):
        print(f"\n{'#' * 80}")
        print(f"  FSPF Fabric Topology")
        if self.principal_domain is not None and self.principal_domain in self.switches:
            psw = self.switches[self.principal_domain]
            print(f"  Principal Switch: {psw.name} (Domain 0x{self.principal_domain:02x})")
        print(f"{'#' * 80}")
        print(f"\n  Switches ({len(self.switches)}):")
        for domain_id, sw in sorted(self.switches.items()):
            print(f"    {sw.name} - Domain ID: 0x{domain_id:02x} ({domain_id})")
            if sw.links:
                for link in sw.links:
                    state_icon = "●" if link.is_active else "○"
                    print(f"      {state_icon} Port {link.local_port} -> "
                          f"Domain 0x{link.remote_domain:02x} (Port {link.remote_port}) | "
                          f"Cost: {link.cost} | State: {link.state.value}")
            else:
                print(f"      (no ISLs)")

        print(f"\n  ISLs ({len(self.isls)}):")
        for isl in self.isls:
            print(f"    0x{isl.local_domain:02x}:port{isl.local_port} <-> "
                  f"0x{isl.remote_domain:02x}:port{isl.remote_port} | "
                  f"Cost: {isl.cost} | State: {isl.state.value}")

    def print_all_routing_tables(self, show_all_paths: bool = False):
        for domain_id in sorted(self.switches.keys()):
            self.switches[domain_id].print_routing_table(show_all_paths)

    def print_all_lsdb(self):
        for domain_id in sorted(self.switches.keys()):
            self.switches[domain_id].print_lsdb()

    def print_all_lsu_history(self):
        for domain_id in sorted(self.switches.keys()):
            self.switches[domain_id].print_lsu_history()

    def print_lsu_log(self):
        print(f"\n  Global LSU Log ({len(self.lsu_log)} LSUs):")
        if not self.lsu_log:
            print("    (no LSUs)")
        for i, lsu in enumerate(self.lsu_log, 1):
            print(f"    [{i:3d}] {lsu}")

    def print_ack_log(self):
        print(f"\n  Flood/ACK Trace ({len(self.ack_log)} entries):")
        if not self.ack_log:
            print("    (no entries)")
        for i, entry in enumerate(self.ack_log, 1):
            print(f"    [{i:3d}] {entry}")

    def print_rdi_log(self):
        print(f"\n  RDI (Request Domain Identifier) Log ({len(self.rdi_log)} events):")
        if not self.rdi_log:
            print("    (no RDI events)")
        for i, event in enumerate(self.rdi_log, 1):
            print(f"    [{i:3d}] {event}")

    def print_principal(self):
        if self.principal_domain is not None and self.principal_domain in self.switches:
            sw = self.switches[self.principal_domain]
            print(f"\n  Principal Switch: {sw.name} (Domain 0x{self.principal_domain:02x})")
        else:
            print(f"\n  Principal Switch: (none assigned)")

    def print_flood_log(self):
        print(f"\n  Flood Log ({len(self.flood_log)} events):")
        for i, event in enumerate(self.flood_log, 1):
            print(f"    [{i:3d}] {event}")

    def set_ecmp_mode(self, enabled: bool):
        for sw in self.switches.values():
            sw.ecmp_enabled = enabled
        self._recompute_all_routes()
        status = "ENABLED" if enabled else "DISABLED"
        print(f"  ECMP mode {status} for all switches.")

    def export_lsdb(self, filepath: str, domain_id: Optional[int] = None):
        if domain_id is not None:
            if domain_id not in self.switches:
                print(f"  [ERROR] Switch 0x{domain_id:02x} not found.")
                return
            lsdb_data = self._get_switch_lsdb_data(domain_id)
        else:
            lsdb_data = {}
            for did in sorted(self.switches.keys()):
                lsdb_data[f"switch_{did:02x}"] = self._get_switch_lsdb_data(did)

        export_data = {
            "export_timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "principal_domain": self.principal_domain,
            "total_switches": len(self.switches),
            "ecmp_enabled": all(sw.ecmp_enabled for sw in self.switches.values()),
            "lsdb": lsdb_data,
        }

        with open(filepath, "w") as f:
            json.dump(export_data, f, indent=2)

        print(f"  LSDB exported to {filepath}")

    def _get_switch_lsdb_data(self, domain_id: int) -> dict:
        sw = self.switches[domain_id]
        lsdb_entries = {}

        for lsa_domain, lsa in sw.lsdb.items():
            lsdb_entries[f"domain_{lsa_domain:02x}"] = {
                "domain_id": lsa.domain_id,
                "domain_id_hex": f"0x{lsa_domain:02x}",
                "sequence_number": lsa.sequence_number,
                "age": lsa.age,
                "link_count": len(lsa.links),
                "links": lsa.links,
            }

        return {
            "switch_name": sw.name,
            "switch_domain": sw.domain_id,
            "switch_domain_hex": f"0x{sw.domain_id:02x}",
            "lsa_count": len(sw.lsdb),
            "ecmp_enabled": sw.ecmp_enabled,
            "lsdb_entries": lsdb_entries,
        }

    def to_dict(self) -> dict:
        switches_data = {}
        for did, sw in self.switches.items():
            links_data = []
            for link in sw.links:
                links_data.append({
                    "local_port": link.local_port,
                    "remote_domain": link.remote_domain,
                    "remote_port": link.remote_port,
                    "cost": link.cost,
                    "state": link.state.value,
                })
            switches_data[str(did)] = {
                "name": sw.name,
                "domain_id": sw.domain_id,
                "links": links_data,
            }
        return {
            "switches": switches_data,
            "principal_domain": self.principal_domain,
        }

    def save_topology(self, filepath: str):
        data = self.to_dict()
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
        print(f"  Topology saved to {filepath}")

    def load_topology(self, filepath: str):
        with open(filepath, "r") as f:
            data = json.load(f)

        self.switches.clear()
        self.isls.clear()
        self.flood_log.clear()
        self.lsu_log.clear()
        self.rdi_log.clear()
        self.ack_log.clear()
        self.principal_domain = data.get("principal_domain")

        for did_str, sw_data in data["switches"].items():
            domain_id = int(did_str)
            sw = self.add_switch(domain_id, sw_data.get("name", ""))

        for did_str, sw_data in data["switches"].items():
            domain_id = int(did_str)
            sw = self.switches[domain_id]
            for link_data in sw_data.get("links", []):
                link = ISLink(
                    local_domain=domain_id,
                    local_port=link_data["local_port"],
                    remote_domain=link_data["remote_domain"],
                    remote_port=link_data["remote_port"],
                    cost=link_data["cost"],
                    state=PortState(link_data["state"]),
                )
                sw.add_link(link)
                self.isls.append(link)

        self._reflood_all()
        print(f"  Topology loaded from {filepath}")


def create_demo_topology() -> FSPFSimulator:
    sim = FSPFSimulator()

    sim.add_switch(1, "Core_A")
    sim.add_switch(2, "Core_B")
    sim.add_switch(3, "Edge_C")
    sim.add_switch(4, "Edge_D")
    sim.add_switch(5, "Edge_E")
    sim.add_switch(6, "Host_F")

    sim.add_isl(1, 2, port_a=1, port_b=1, cost=10)
    sim.add_isl(1, 3, port_a=2, port_b=1, cost=5)
    sim.add_isl(1, 4, port_a=3, port_b=1, cost=5)
    sim.add_isl(2, 5, port_a=2, port_b=1, cost=5)
    sim.add_isl(2, 6, port_a=3, port_b=1, cost=10)
    sim.add_isl(3, 4, port_a=2, port_b=2, cost=3)
    sim.add_isl(4, 5, port_a=3, port_b=2, cost=3)
    sim.add_isl(5, 6, port_a=3, port_b=2, cost=5)

    return sim


def print_help():
    help_text = """
  FSPF Simulator Commands:
  ──────────────────────────────────────────────────────────────────────
  Topology Management:
    add_switch <domain_id> [name]       Add a switch (domain_id: 1-239)
                                         Auto-RDI if domain ID conflicts
    remove_switch <domain_id>           Remove a switch and its ISLs
    add_isl <dom_a> <dom_b> <p_a> <p_b> [cost]   Add inter-switch link
    remove_isl <domain_id> <port>       Remove an ISL
    set_cost <domain_id> <port> <cost>  Set link cost
    set_state <domain_id> <port> <state> Set link state (online/offline/bypassed)
    demo                                Load demo topology
    save <filepath>                     Save topology to JSON
    load <filepath>                     Load topology from JSON

  Domain ID Management (RDI):
    rdi <domain_id> [new_domain]        Trigger RDI to reassign domain ID
    principal                           Show principal switch

  Load Balancing (ECMP):
    ecmp on|off                         Enable/disable Equal-Cost Multi-Path
    ecmp_detail on|off                  Toggle detailed ECMP path display

  Display:
    topology                            Show fabric topology
    routes                              Show all routing tables
    lsdb                                Show all link state databases
    route <domain_id>                   Show routing table for one switch
    lsu_log                             Show global LSU (Link State Update) log
    lsu_hist                            Show per-switch LSU history
    ack_log                             Show flood/ACK trace
    rdi_log                             Show RDI event log
    log                                 Show topology event log
    path <src_dom> <dst_dom>            Show shortest path between domains

  Export:
    export_lsdb <filepath> [domain_id]  Export LSDB to JSON file
  ──────────────────────────────────────────────────────────────────────
  Other:
    help                                Show this help
    quit / exit                         Exit simulator
  ──────────────────────────────────────────────────────────────────────
"""
    print(help_text)


def run_interactive():
    sim = FSPFSimulator()
    ctx = {"show_ecmp_detail": False}
    print("\n" + "=" * 80)
    print("  FSPF (Fabric Shortest Path First) Simulator")
    print("  Fibre Channel Fabric Routing Protocol Emulator")
    print("=" * 80)
    print("  Type 'help' for available commands, 'demo' to load a sample topology.")
    print()

    while True:
        try:
            cmd = input("fspf> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n  Goodbye!")
            break

        if not cmd:
            continue

        parts = cmd.split()
        action = parts[0].lower()

        if action in ("quit", "exit"):
            print("  Goodbye!")
            break

        elif action == "help":
            print_help()

        elif action == "demo":
            sim = create_demo_topology()
            print("  Demo topology loaded with 6 switches.")
            sim.print_topology()

        elif action == "add_switch":
            if len(parts) < 2:
                print("  Usage: add_switch <domain_id> [name]")
                continue
            try:
                did = int(parts[1])
                if did < 1 or did > 239:
                    print("  [ERROR] Domain ID must be 1-239.")
                    continue
                name = parts[2] if len(parts) > 2 else ""
                sim.add_switch(did, name)
                print(f"  Switch 0x{did:02x} added.")
            except ValueError:
                print("  [ERROR] Invalid domain ID.")

        elif action == "remove_switch":
            if len(parts) < 2:
                print("  Usage: remove_switch <domain_id>")
                continue
            try:
                did = int(parts[1])
                sim.remove_switch(did)
                print(f"  Switch 0x{did:02x} removed.")
            except ValueError:
                print("  [ERROR] Invalid domain ID.")

        elif action == "add_isl":
            if len(parts) < 5:
                print("  Usage: add_isl <dom_a> <dom_b> <port_a> <port_b> [cost]")
                continue
            try:
                da = int(parts[1])
                db = int(parts[2])
                pa = int(parts[3])
                pb = int(parts[4])
                cost = int(parts[5]) if len(parts) > 5 else 1
                sim.add_isl(da, db, pa, pb, cost)
                print(f"  ISL added: 0x{da:02x}:port{pa} <-> 0x{db:02x}:port{pb} (cost={cost})")
            except ValueError:
                print("  [ERROR] Invalid parameters.")

        elif action == "remove_isl":
            if len(parts) < 3:
                print("  Usage: remove_isl <domain_id> <port>")
                continue
            try:
                did = int(parts[1])
                port = int(parts[2])
                sim.remove_isl(did, port)
            except ValueError:
                print("  [ERROR] Invalid parameters.")

        elif action == "set_cost":
            if len(parts) < 4:
                print("  Usage: set_cost <domain_id> <port> <cost>")
                continue
            try:
                did = int(parts[1])
                port = int(parts[2])
                cost = int(parts[3])
                sim.set_link_cost(did, port, cost)
            except ValueError:
                print("  [ERROR] Invalid parameters.")

        elif action == "set_state":
            if len(parts) < 4:
                print("  Usage: set_state <domain_id> <port> <online|offline|bypassed>")
                continue
            try:
                did = int(parts[1])
                port = int(parts[2])
                state_str = parts[3].lower()
                state_map = {
                    "online": PortState.ONLINE,
                    "offline": PortState.OFFLINE,
                    "bypassed": PortState.BYPASSED,
                }
                if state_str not in state_map:
                    print("  [ERROR] State must be: online, offline, or bypassed")
                    continue
                sim.set_link_state(did, port, state_map[state_str])
            except ValueError:
                print("  [ERROR] Invalid parameters.")

        elif action == "topology":
            sim.print_topology()

        elif action == "routes":
            sim.print_all_routing_tables(ctx["show_ecmp_detail"])

        elif action == "lsdb":
            sim.print_all_lsdb()

        elif action == "route":
            if len(parts) < 2:
                print("  Usage: route <domain_id>")
                continue
            try:
                did = int(parts[1])
                if did in sim.switches:
                    sim.switches[did].print_routing_table(ctx["show_ecmp_detail"])
                else:
                    print(f"  [ERROR] Switch 0x{did:02x} not found.")
            except ValueError:
                print("  [ERROR] Invalid domain ID.")

        elif action == "log":
            sim.print_flood_log()

        elif action == "lsu_log":
            sim.print_lsu_log()

        elif action == "lsu_hist":
            sim.print_all_lsu_history()

        elif action == "ack_log":
            sim.print_ack_log()

        elif action == "rdi_log":
            sim.print_rdi_log()

        elif action == "principal":
            sim.print_principal()

        elif action == "ecmp":
            if len(parts) < 2:
                print("  Usage: ecmp on|off")
                continue
            mode = parts[1].lower()
            if mode == "on":
                sim.set_ecmp_mode(True)
            elif mode == "off":
                sim.set_ecmp_mode(False)
            else:
                print("  Usage: ecmp on|off")

        elif action == "ecmp_detail":
            if len(parts) < 2:
                print("  Usage: ecmp_detail on|off")
                continue
            mode = parts[1].lower()
            if mode == "on":
                ctx["show_ecmp_detail"] = True
                print("  ECMP detailed path display ENABLED.")
            elif mode == "off":
                ctx["show_ecmp_detail"] = False
                print("  ECMP detailed path display DISABLED.")
            else:
                print("  Usage: ecmp_detail on|off")

        elif action == "export_lsdb":
            if len(parts) < 2:
                print("  Usage: export_lsdb <filepath> [domain_id]")
                continue
            filepath = parts[1]
            domain_id = None
            if len(parts) > 2:
                try:
                    domain_id = int(parts[2])
                except ValueError:
                    print("  [ERROR] Invalid domain ID.")
                    continue
            sim.export_lsdb(filepath, domain_id)

        elif action == "rdi":
            if len(parts) < 2:
                print("  Usage: rdi <domain_id> [new_domain_id]")
                continue
            try:
                did = int(parts[1])
                new_did = int(parts[2]) if len(parts) > 2 else None
                sim.trigger_rdi(did, new_did)
            except ValueError:
                print("  [ERROR] Invalid domain ID.")

        elif action == "path":
            if len(parts) < 3:
                print("  Usage: path <src_domain> <dst_domain>")
                continue
            try:
                src = int(parts[1])
                dst = int(parts[2])
                if src not in sim.switches:
                    print(f"  [ERROR] Source switch 0x{src:02x} not found.")
                    continue
                if dst not in sim.switches:
                    print(f"  [ERROR] Destination switch 0x{dst:02x} not found.")
                    continue
                sw = sim.switches[src]
                for entry in sw.routing_table:
                    if entry.destination_domain == dst:
                        print(f"\n  Shortest path(s) from 0x{src:02x} to 0x{dst:02x}:")
                        print(f"  Total Cost: {entry.total_cost}")
                        if entry.path_count == 1:
                            path_str = " -> ".join(f"0x{p:02x}" for p in entry.path)
                            print(f"  Path: {path_str}")
                            print(f"  Next Hop: 0x{entry.next_hop_domain:02x} via Port {entry.out_port}")
                        else:
                            print(f"  ECMP: {entry.path_count} equal-cost paths available")
                            print(f"  Next Hops: {', '.join(f'0x{nh:02x}' for nh in entry.next_hops)}")
                            print(f"  Out Ports: {', '.join(str(p) for p in entry.out_ports)}")
                            if ctx["show_ecmp_detail"]:
                                for i, path in enumerate(entry.paths, 1):
                                    path_str = " -> ".join(f"0x{p:02x}" for p in path)
                                    print(f"    [{i}] {path_str}")
                        break
                else:
                    print(f"\n  No path from 0x{src:02x} to 0x{dst:02x} (unreachable).")
            except ValueError:
                print("  [ERROR] Invalid domain IDs.")

        elif action == "save":
            if len(parts) < 2:
                print("  Usage: save <filepath>")
                continue
            sim.save_topology(parts[1])

        elif action == "load":
            if len(parts) < 2:
                print("  Usage: load <filepath>")
                continue
            sim.load_topology(parts[1])

        else:
            print(f"  Unknown command: {action}. Type 'help' for available commands.")


if __name__ == "__main__":
    run_interactive()
