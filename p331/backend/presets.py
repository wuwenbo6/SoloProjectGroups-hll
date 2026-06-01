from models import PresetType


def _basic_rpt() -> dict:
    routers = [
        {"id": "R1", "name": "R1", "type": "source", "x": 100, "y": 300, "is_rp": False},
        {"id": "R2", "name": "R2", "type": "router", "x": 300, "y": 300, "is_rp": False},
        {"id": "R3", "name": "R3", "type": "router", "x": 500, "y": 300, "is_rp": True},
        {"id": "R4", "name": "R4", "type": "router", "x": 700, "y": 300, "is_rp": False},
        {"id": "R5", "name": "R5", "type": "router", "x": 300, "y": 500, "is_rp": False},
        {"id": "R6", "name": "R6", "type": "receiver", "x": 900, "y": 300, "is_rp": False},
    ]
    links = [
        {"id": "L1", "router_a_id": "R1", "router_b_id": "R2", "interface_a_id": "R1-eth0", "interface_b_id": "R2-eth0", "cost": 1},
        {"id": "L2", "router_a_id": "R2", "router_b_id": "R3", "interface_a_id": "R2-eth1", "interface_b_id": "R3-eth0", "cost": 1},
        {"id": "L3", "router_a_id": "R3", "router_b_id": "R4", "interface_a_id": "R3-eth1", "interface_b_id": "R4-eth0", "cost": 1},
        {"id": "L4", "router_a_id": "R4", "router_b_id": "R6", "interface_a_id": "R4-eth1", "interface_b_id": "R6-eth0", "cost": 1},
        {"id": "L5", "router_a_id": "R2", "router_b_id": "R5", "interface_a_id": "R2-eth2", "interface_b_id": "R5-eth0", "cost": 1},
        {"id": "L6", "router_a_id": "R5", "router_b_id": "R4", "interface_a_id": "R5-eth1", "interface_b_id": "R4-eth2", "cost": 1},
        {"id": "L7", "router_a_id": "R3", "router_b_id": "R5", "interface_a_id": "R3-eth2", "interface_b_id": "R5-eth2", "cost": 1},
    ]
    return {"routers": routers, "links": links}


def _spt_switch() -> dict:
    data = _basic_rpt()
    return data


def _multi_source() -> dict:
    routers = [
        {"id": "R1", "name": "R1", "type": "source", "x": 100, "y": 200, "is_rp": False},
        {"id": "R2", "name": "R2", "type": "router", "x": 300, "y": 200, "is_rp": False},
        {"id": "R3", "name": "R3", "type": "router", "x": 500, "y": 300, "is_rp": True},
        {"id": "R4", "name": "R4", "type": "router", "x": 700, "y": 200, "is_rp": False},
        {"id": "R5", "name": "R5", "type": "router", "x": 300, "y": 500, "is_rp": False},
        {"id": "R6", "name": "R6", "type": "receiver", "x": 900, "y": 200, "is_rp": False},
        {"id": "R7", "name": "R7", "type": "source", "x": 100, "y": 500, "is_rp": False},
        {"id": "R8", "name": "R8", "type": "receiver", "x": 900, "y": 500, "is_rp": False},
        {"id": "R9", "name": "R9", "type": "router", "x": 700, "y": 500, "is_rp": False},
    ]
    links = [
        {"id": "L1", "router_a_id": "R1", "router_b_id": "R2", "interface_a_id": "R1-eth0", "interface_b_id": "R2-eth0", "cost": 1},
        {"id": "L2", "router_a_id": "R2", "router_b_id": "R3", "interface_a_id": "R2-eth1", "interface_b_id": "R3-eth0", "cost": 1},
        {"id": "L3", "router_a_id": "R3", "router_b_id": "R4", "interface_a_id": "R3-eth1", "interface_b_id": "R4-eth0", "cost": 1},
        {"id": "L4", "router_a_id": "R4", "router_b_id": "R6", "interface_a_id": "R4-eth1", "interface_b_id": "R6-eth0", "cost": 1},
        {"id": "L5", "router_a_id": "R2", "router_b_id": "R5", "interface_a_id": "R2-eth2", "interface_b_id": "R5-eth0", "cost": 1},
        {"id": "L6", "router_a_id": "R5", "router_b_id": "R9", "interface_a_id": "R5-eth1", "interface_b_id": "R9-eth0", "cost": 1},
        {"id": "L7", "router_a_id": "R3", "router_b_id": "R5", "interface_a_id": "R3-eth2", "interface_b_id": "R5-eth2", "cost": 1},
        {"id": "L8", "router_a_id": "R7", "router_b_id": "R5", "interface_a_id": "R7-eth0", "interface_b_id": "R5-eth3", "cost": 1},
        {"id": "L9", "router_a_id": "R9", "router_b_id": "R8", "interface_a_id": "R9-eth1", "interface_b_id": "R8-eth0", "cost": 1},
        {"id": "L10", "router_a_id": "R4", "router_b_id": "R9", "interface_a_id": "R4-eth2", "interface_b_id": "R9-eth2", "cost": 1},
    ]
    return {"routers": routers, "links": links}


def _prune_leave() -> dict:
    routers = [
        {"id": "R1", "name": "R1", "type": "source", "x": 100, "y": 300, "is_rp": False},
        {"id": "R2", "name": "R2", "type": "router", "x": 300, "y": 300, "is_rp": False},
        {"id": "R3", "name": "R3", "type": "router", "x": 500, "y": 300, "is_rp": True},
        {"id": "R4", "name": "R4", "type": "router", "x": 700, "y": 200, "is_rp": False},
        {"id": "R5", "name": "R5", "type": "router", "x": 700, "y": 400, "is_rp": False},
        {"id": "R6", "name": "R6", "type": "receiver", "x": 900, "y": 200, "is_rp": False},
        {"id": "R7", "name": "R7", "type": "receiver", "x": 900, "y": 400, "is_rp": False},
    ]
    links = [
        {"id": "L1", "router_a_id": "R1", "router_b_id": "R2", "interface_a_id": "R1-eth0", "interface_b_id": "R2-eth0", "cost": 1},
        {"id": "L2", "router_a_id": "R2", "router_b_id": "R3", "interface_a_id": "R2-eth1", "interface_b_id": "R3-eth0", "cost": 1},
        {"id": "L3", "router_a_id": "R3", "router_b_id": "R4", "interface_a_id": "R3-eth1", "interface_b_id": "R4-eth0", "cost": 1},
        {"id": "L4", "router_a_id": "R3", "router_b_id": "R5", "interface_a_id": "R3-eth2", "interface_b_id": "R5-eth0", "cost": 1},
        {"id": "L5", "router_a_id": "R4", "router_b_id": "R6", "interface_a_id": "R4-eth1", "interface_b_id": "R6-eth0", "cost": 1},
        {"id": "L6", "router_a_id": "R5", "router_b_id": "R7", "interface_a_id": "R5-eth1", "interface_b_id": "R7-eth0", "cost": 1},
    ]
    return {"routers": routers, "links": links}


_PRESETS = {
    PresetType.BASIC_RPT: _basic_rpt,
    PresetType.SPT_SWITCH: _spt_switch,
    PresetType.MULTI_SOURCE: _multi_source,
    PresetType.PRUNE_LEAVE: _prune_leave,
}


def get_preset(preset_type: PresetType) -> dict:
    factory = _PRESETS.get(preset_type)
    if factory is None:
        raise ValueError(f"Unknown preset type: {preset_type}")
    return factory()
