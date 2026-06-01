from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Any
import time

from ..p4_simulator import (
    VirtualSwitch,
    PortStatus,
    MirrorDirection,
)

router = APIRouter(prefix="/api/switch", tags=["switch"])

_switch: Optional[VirtualSwitch] = None


def set_switch(switch: VirtualSwitch) -> None:
    global _switch
    _switch = switch


def get_switch() -> VirtualSwitch:
    if _switch is None:
        raise HTTPException(status_code=500, detail="Switch not initialized")
    return _switch


class PortConfig(BaseModel):
    name: str
    type: str = 'normal'
    status: Optional[str] = None
    macAddress: Optional[str] = None


class MirrorMatchConfig(BaseModel):
    protocol: Optional[str] = None
    srcPort: Optional[int] = None
    dstPort: Optional[int] = None
    srcIp: Optional[str] = None
    dstIp: Optional[str] = None
    srcMac: Optional[str] = None
    dstMac: Optional[str] = None

    def to_mirror_match(self):
        from ..p4_simulator import MirrorMatch
        return MirrorMatch(
            protocol=self.protocol,
            src_port=self.srcPort,
            dst_port=self.dstPort,
            src_ip=self.srcIp,
            dst_ip=self.dstIp,
            src_mac=self.srcMac,
            dst_mac=self.dstMac,
        )


class MirrorRuleConfig(BaseModel):
    sourcePort: int
    monitorPort: int
    direction: str = 'ingress'
    enabled: Optional[bool] = True
    match: Optional[MirrorMatchConfig] = None


class TestPacketConfig(BaseModel):
    srcMac: str
    dstMac: str
    srcIp: str
    dstIp: str
    srcPort: int
    dstPort: int
    inPort: int
    protocol: str = 'tcp'
    payload: str = ''


@router.get("/status")
async def get_status() -> dict[str, Any]:
    switch = get_switch()
    return switch.get_status()


@router.get("/ports")
async def get_ports() -> List[dict[str, Any]]:
    switch = get_switch()
    return [port.to_dict() for port in switch.get_all_ports()]


@router.post("/ports")
async def create_port(config: PortConfig) -> dict[str, Any]:
    switch = get_switch()
    from ..p4_simulator import PortType
    port_type = PortType.MONITOR if config.type == 'monitor' else PortType.NORMAL
    port = switch.add_port(config.name, port_type, config.macAddress)
    
    if config.status:
        status = PortStatus.UP if config.status == 'up' else PortStatus.DOWN
        switch.set_port_status(port.id, status)
    
    return port.to_dict()


@router.put("/ports/{port_id}/status")
async def set_port_status(port_id: int, status: str) -> dict[str, Any]:
    switch = get_switch()
    port_status = PortStatus.UP if status == 'up' else PortStatus.DOWN
    port = switch.set_port_status(port_id, port_status)
    if not port:
        raise HTTPException(status_code=404, detail=f"Port {port_id} not found")
    return port.to_dict()


@router.get("/mac-table")
async def get_mac_table() -> List[dict[str, Any]]:
    switch = get_switch()
    return switch.mac_table.to_dict()


@router.delete("/mac-table")
async def clear_mac_table() -> dict[str, str]:
    switch = get_switch()
    switch.clear_mac_table()
    return {"message": "MAC table cleared"}


@router.get("/mirror")
async def get_mirror_rules() -> List[dict[str, Any]]:
    switch = get_switch()
    return [rule.to_dict() for rule in switch.get_mirror_rules()]


@router.post("/mirror")
async def create_mirror_rule(config: MirrorRuleConfig) -> dict[str, Any]:
    switch = get_switch()
    direction = MirrorDirection.INGRESS
    if config.direction == 'egress':
        direction = MirrorDirection.EGRESS
    elif config.direction == 'both':
        direction = MirrorDirection.BOTH

    match = config.match.to_mirror_match() if config.match else None

    rule = switch.add_mirror_rule(config.sourcePort, config.monitorPort, direction, match)
    if not rule:
        raise HTTPException(status_code=400, detail="Failed to create mirror rule")

    if config.enabled is False:
        switch.mirror_engine.toggle_rule(rule.id)

    return rule.to_dict()


@router.delete("/mirror/{rule_id}")
async def delete_mirror_rule(rule_id: int) -> dict[str, str]:
    switch = get_switch()
    if not switch.remove_mirror_rule(rule_id):
        raise HTTPException(status_code=404, detail=f"Mirror rule {rule_id} not found")
    return {"message": f"Mirror rule {rule_id} deleted"}


@router.post("/start")
async def start_switch() -> dict[str, Any]:
    switch = get_switch()
    switch.start()
    return switch.get_status()


@router.post("/stop")
async def stop_switch() -> dict[str, Any]:
    switch = get_switch()
    switch.stop()
    return switch.get_status()


@router.post("/reset")
async def reset_switch() -> dict[str, Any]:
    switch = get_switch()
    switch.reset()
    return switch.get_status()


@router.post("/send-packet")
async def send_test_packet(config: TestPacketConfig) -> dict[str, Any]:
    switch = get_switch()
    if not switch.status.running:
        raise HTTPException(status_code=400, detail="Switch is not running")
    
    result = switch.send_test_packet(
        src_mac=config.srcMac,
        dst_mac=config.dstMac,
        src_ip=config.srcIp,
        dst_ip=config.dstIp,
        src_port=config.srcPort,
        dst_port=config.dstPort,
        in_port_id=config.inPort,
        protocol=config.protocol,
        payload=config.payload
    )
    
    if not result:
        raise HTTPException(status_code=400, detail="Failed to send packet")
    
    return {
        "action": result.action.value,
        "outPorts": result.out_ports,
        "mirrorPorts": result.mirror_ports,
        "macLearned": result.mac_learned,
        "packet": result.packet_info.to_dict()
    }


@router.get("/packets")
async def get_packets(
    type: Optional[str] = Query(None, description="Filter by packet type: original, mirror"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of packets to return")
) -> List[dict[str, Any]]:
    switch = get_switch()
    packets = switch.get_packets(packet_type=type, limit=limit)
    return [p.to_dict() for p in packets]


@router.get("/packets/export")
async def export_packets(type: Optional[str] = None) -> dict[str, Any]:
    switch = get_switch()
    packets = switch.get_packets(packet_type=type, limit=0)
    return {
        "count": len(packets),
        "exportedAt": switch.status.start_time,
        "packets": [p.to_dict() for p in packets]
    }


class MirrorRateConfig(BaseModel):
    rateMbps: float


@router.get("/mirror/stats")
async def get_mirror_stats() -> dict[str, Any]:
    switch = get_switch()
    return switch.get_mirror_engine_stats()


@router.post("/mirror/rate-limit")
async def set_mirror_rate_limit(config: MirrorRateConfig) -> dict[str, Any]:
    switch = get_switch()
    if config.rateMbps <= 0:
        raise HTTPException(status_code=400, detail="Rate limit must be positive")
    switch.set_mirror_rate_limit(config.rateMbps)
    return switch.get_mirror_engine_stats()


@router.post("/mirror/reset-stats")
async def reset_mirror_stats() -> dict[str, Any]:
    switch = get_switch()
    switch.reset_mirror_stats()
    return switch.get_mirror_engine_stats()


@router.get("/mirror/stats/detailed")
async def get_detailed_mirror_stats(
    includeEntries: bool = Query(True, description="Include detailed entries"),
    limit: int = Query(1000, ge=1, le=10000, description="Maximum number of entries to return")
) -> dict[str, Any]:
    switch = get_switch()
    return switch.get_detailed_mirror_stats(include_entries=includeEntries, limit=limit)


@router.get("/mirror/export/json")
async def export_mirror_stats_json(
    includeEntries: bool = Query(True, description="Include detailed entries"),
    limit: int = Query(1000, ge=1, le=10000, description="Maximum number of entries to return")
):
    from fastapi.responses import Response
    switch = get_switch()
    json_str = switch.export_mirror_stats_json(include_entries=includeEntries, limit=limit)
    return Response(
        content=json_str,
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=mirror_stats_{int(time.time())}.json"
        }
    )


@router.get("/mirror/export/csv")
async def export_mirror_stats_csv(
    includeEntries: bool = Query(True, description="Include detailed entries"),
    limit: int = Query(1000, ge=1, le=10000, description="Maximum number of entries to return")
):
    from fastapi.responses import Response
    switch = get_switch()
    csv_str = switch.export_mirror_stats_csv(include_entries=includeEntries, limit=limit)
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=mirror_stats_{int(time.time())}.csv"
        }
    )
