from __future__ import annotations
import asyncio
import hashlib
import json
import logging
import os
import socket
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional
from uuid import uuid4

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from models import (
    EngineIdDiscoveryRequest,
    EngineIdDiscoveryResponse,
    ForwardTarget,
    MessageResponse,
    ServiceStatus,
    SnmpConfig,
    SnmpTrap,
    TrapListResponse,
    VarBind,
)
from trap_store import trap_store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_ws_clients: list[WebSocket] = []
_current_config = SnmpConfig(listen_port=1162)
_snmp_engine = None
_transport = None
_snmp_dispatcher_task = None
_start_time = __import__("time").time()
_forward_queue: asyncio.Queue | None = None
_forward_task: asyncio.Task | None = None


def _get_oid_name(oid: str) -> str:
    if not _current_config.oid_mappings:
        return oid
    for mapping in _current_config.oid_mappings:
        if oid == mapping.oid or oid.startswith(mapping.oid + "."):
            return mapping.name
    return oid


def _format_syslog_message(trap: SnmpTrap, facility: int = 16, severity: int = 6) -> str:
    priority = (facility * 8) + severity
    timestamp = datetime.now().strftime("%b %d %H:%M:%S")
    hostname = trap.source_ip
    msg_parts = [f"SNMP_TRAP version={trap.snmp_version}"]
    if trap.community:
        msg_parts.append(f"community={trap.community}")
    msg_parts.append(f"trap_oid={_get_oid_name(trap.trap_oid)}")
    msg_parts.append(f"source={trap.source_ip}:{trap.source_port}")
    for vb in trap.variable_bindings:
        name = _get_oid_name(vb.oid)
        msg_parts.append(f"{name}={vb.value}")
    message = " ".join(msg_parts)
    return f"<{priority}>{timestamp} {hostname} {message}"


def _format_json_message(trap: SnmpTrap) -> str:
    data = {
        "timestamp": trap.timestamp,
        "source_ip": trap.source_ip,
        "source_port": trap.source_port,
        "snmp_version": trap.snmp_version,
        "community": trap.community,
        "trap_oid": trap.trap_oid,
        "trap_oid_name": _get_oid_name(trap.trap_oid),
        "variable_bindings": [
            {
                "oid": vb.oid,
                "oid_name": _get_oid_name(vb.oid),
                "value_type": vb.value_type,
                "value": vb.value,
            }
            for vb in trap.variable_bindings
        ],
    }
    return json.dumps(data, ensure_ascii=False)


async def _send_syslog(target: ForwardTarget, message: str):
    try:
        host = target.host or "127.0.0.1"
        port = target.port or 514
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.sendto(message.encode("utf-8"), (host, port))
        sock.close()
    except Exception as e:
        logger.warning(f"Failed to send syslog to {target.host}:{target.port}: {e}")


async def _send_http(target: ForwardTarget, message: str):
    try:
        if not target.url:
            return
        import aiohttp

        async with aiohttp.ClientSession() as session:
            if target.method == "POST":
                headers = {"Content-Type": "application/json" if target.format == "json" else "text/plain"}
                async with session.post(target.url, data=message, headers=headers, timeout=5) as resp:
                    await resp.text()
    except ImportError:
        logger.warning("aiohttp not installed, HTTP forwarding disabled")
    except Exception as e:
        logger.warning(f"Failed to send HTTP to {target.url}: {e}")


async def _forward_worker():
    while True:
        try:
            trap = await _forward_queue.get()
            for target in _current_config.forward_targets:
                if not target.enabled:
                    continue
                if target.format == "json":
                    message = _format_json_message(trap)
                else:
                    message = _format_syslog_message(trap, target.facility, target.severity)
                if target.type == "syslog":
                    await _send_syslog(target, message)
                elif target.type == "http":
                    await _send_http(target, message)
            _forward_queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Forward worker error: {e}")


def _format_value(val) -> str:
    try:
        if hasattr(val, "prettyPrint"):
            return val.prettyPrint()
        return str(val)
    except Exception:
        return repr(val)


def _get_value_type(val) -> str:
    type_name = val.__class__.__name__
    type_map = {
        "Integer": "INTEGER",
        "Integer32": "Integer32",
        "Unsigned32": "Unsigned32",
        "Counter32": "Counter32",
        "Counter64": "Counter64",
        "Gauge32": "Gauge32",
        "TimeTicks": "TimeTicks",
        "IpAddress": "IpAddress",
        "OctetString": "OCTET STRING",
        "ObjectIdentifier": "OBJECT IDENTIFIER",
        "Null": "NULL",
        "Bits": "BITS",
    }
    return type_map.get(type_name, type_name)


def _generate_trap_id(source_ip: str, trap_oid: str, var_binds: list[VarBind]) -> str:
    raw = f"{source_ip}|{trap_oid}|"
    for vb in var_binds[:5]:
        raw += f"{vb.oid}={vb.value}|"
    return hashlib.md5(raw.encode()).hexdigest()[:16]


def _parse_trap_cb(msg, transport_domain, transport_address):
    try:
        source_ip = str(transport_address[0]) if transport_address else "0.0.0.0"
        source_port = int(transport_address[1]) if transport_address and len(transport_address) > 1 else 0

        var_binds = msg.getVarBinds()

        snmp_version = "v2c"
        community = None
        version_val = msg.getVersion()
        if version_val == 3:
            snmp_version = "v3"
        elif version_val == 0:
            snmp_version = "v1"

        if hasattr(msg, "getCommunity"):
            try:
                community = str(msg.getCommunity())
            except Exception:
                pass

        trap_oid = ""
        vb_list: list[VarBind] = []

        for idx, (oid, val) in enumerate(var_binds):
            oid_str = str(oid)
            val_type = _get_value_type(val)
            val_str = _format_value(val)

            if idx == 1 and snmp_version in ("v2c", "v3"):
                trap_oid = val_str
            elif idx == 0 and snmp_version == "v1":
                trap_oid = val_str

            vb_list.append(VarBind(oid=oid_str, value_type=val_type, value=val_str))

        if not trap_oid and vb_list:
            for vb in vb_list:
                if "snmpTrap" in vb.oid or vb.oid.startswith("1.3.6.1.6"):
                    trap_oid = vb.value
                    break
            if not trap_oid:
                trap_oid = vb_list[0].oid if vb_list else "unknown"

        trap_id = _generate_trap_id(source_ip, trap_oid, vb_list)

        raw_pdu = ""
        try:
            raw_bytes = msg.getAsBytes()
            raw_pdu = raw_bytes.hex() if raw_bytes else ""
        except Exception:
            pass

        trap = SnmpTrap(
            id=str(uuid4()),
            trap_id=trap_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            source_ip=source_ip,
            source_port=source_port,
            snmp_version=snmp_version,
            community=community,
            trap_oid=trap_oid,
            variable_bindings=vb_list,
            raw_pdu=raw_pdu,
        )

        if trap_store.add_trap(trap):
            asyncio.get_event_loop().create_task(_broadcast_trap(trap))
            if _forward_queue:
                _forward_queue.put_nowait(trap)

    except Exception as e:
        logger.error(f"Error parsing trap: {e}", exc_info=True)


async def _broadcast_trap(trap: SnmpTrap):
    trap_json = trap.model_dump_json()
    disconnected = []
    for ws in _ws_clients:
        try:
            await ws.send_text(trap_json)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        _ws_clients.remove(ws)


async def _start_snmp_listener(config: SnmpConfig):
    global _snmp_engine, _transport, _snmp_dispatcher_task, _current_config
    _current_config = config

    try:
        import warnings
        warnings.filterwarnings('ignore', category=RuntimeWarning)

        from pysnmp.entity import engine as snmp_engine_mod
        from pysnmp.entity import config as snmp_config_mod
        from pysnmp.carrier.asyncio.dgram import udp

        snmpEngine = snmp_engine_mod.SnmpEngine()

        for idx, community in enumerate(config.v2c_communities):
            if community:
                snmp_config_mod.addV1System(snmpEngine, f"c{idx}", community)

        snmp_config_mod.addVacmUser(snmpEngine, 1, "no-auth-no-priv", "noAuthNoPriv")
        snmp_config_mod.addVacmUser(snmpEngine, 2, "no-auth-no-priv", "noAuthNoPriv")
        snmp_config_mod.addVacmUser(snmpEngine, 3, "no-auth-no-priv", "noAuthNoPriv")

        for user in config.v3_users:
            try:
                auth_proto = snmp_config_mod.usmHMACMD5AuthProtocol if user.auth_protocol == "MD5" else \
                             snmp_config_mod.usmHMACSHAAuthProtocol if user.auth_protocol == "SHA" else \
                             snmp_config_mod.usmNoAuthProtocol
                priv_proto = snmp_config_mod.usmDESPrivProtocol if user.priv_protocol == "DES" else \
                             snmp_config_mod.usmAesCfb128Protocol if user.priv_protocol == "AES" else \
                             snmp_config_mod.usmNoPrivProtocol
                auth_key = user.auth_key if user.auth_key else None
                priv_key = user.priv_key if user.priv_key else None
                if auth_proto == snmp_config_mod.usmNoAuthProtocol:
                    auth_key = None
                if priv_proto == snmp_config_mod.usmNoPrivProtocol:
                    priv_key = None
                snmp_config_mod.addV3User(
                    snmpEngine,
                    user.username,
                    auth_proto,
                    auth_key,
                    priv_proto,
                    priv_key,
                )
            except Exception as e:
                logger.warning(f"Could not add v3 user {user.username}: {e}")

        transport = udp.UdpTransport()
        transport.openServerMode(("0.0.0.0", config.listen_port))

        snmp_config_mod.addSocketTransport(snmpEngine, transport.domainName, transport)

        snmpEngine.observer.registerObserver(
            _parse_trap_cb, "rfc3412.receiveMessage:request"
        )

        snmpEngine.openDispatcher()

        _snmp_engine = snmpEngine
        _transport = transport

        logger.info(f"SNMP Trap listener started on UDP port {config.listen_port}")

    except ImportError:
        logger.warning("pysnmp not available, running in demo mode")
    except Exception as e:
        logger.error(f"Failed to start SNMP listener: {e}", exc_info=True)


async def _stop_snmp_listener():
    global _snmp_engine, _transport, _snmp_dispatcher_task

    if _snmp_engine:
        try:
            _snmp_engine.closeDispatcher()
        except Exception:
            pass
        _snmp_engine = None

    if _transport:
        try:
            await _transport.close()
        except Exception:
            pass
        _transport = None

    _snmp_dispatcher_task = None
    logger.info("SNMP Trap listener stopped")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    global _forward_queue, _forward_task
    _forward_queue = asyncio.Queue()
    _forward_task = asyncio.create_task(_forward_worker())
    await _start_snmp_listener(_current_config)
    yield
    await _stop_snmp_listener()
    if _forward_task:
        _forward_task.cancel()
        try:
            await _forward_task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="SNMP Trap Monitor", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/status", response_model=ServiceStatus)
async def get_status():
    return ServiceStatus(
        listening=_snmp_engine is not None,
        listen_port=_current_config.listen_port,
        trap_count=trap_store.count(),
        duplicate_count=trap_store.duplicate_count,
        uptime=__import__("time").time() - _start_time,
    )


@app.get("/api/traps", response_model=TrapListResponse)
async def get_traps(
    version: Optional[str] = Query(None, description="Filter by SNMP version: v2c, v3"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    traps, total = trap_store.get_traps(version=version, limit=limit, offset=offset)
    return TrapListResponse(traps=traps, total=total)


@app.get("/api/traps/{trap_id}", response_model=SnmpTrap)
async def get_trap(trap_id: str):
    trap = trap_store.get_trap_by_id(trap_id)
    if not trap:
        return JSONResponse(status_code=404, content={"detail": "Trap not found"})
    return trap


@app.delete("/api/traps", response_model=MessageResponse)
async def clear_traps():
    trap_store.clear()
    return MessageResponse(message="All traps cleared")


@app.get("/api/traps/export")
async def export_traps():
    traps, _ = trap_store.get_traps(limit=1000)
    return JSONResponse(
        content=[t.model_dump() for t in traps],
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=snmp_traps.json"},
    )


@app.get("/api/config", response_model=SnmpConfig)
async def get_config():
    return _current_config


@app.put("/api/config", response_model=MessageResponse)
async def update_config(config: SnmpConfig):
    await _stop_snmp_listener()
    await _start_snmp_listener(config)
    return MessageResponse(message="Configuration updated and listener restarted")


@app.post("/api/demo-trap", response_model=MessageResponse)
async def send_demo_trap():
    import random

    source_ip = f"192.168.{random.randint(1, 254)}.{random.randint(1, 254)}"
    trap_oid = "1.3.6.1.4.1.20408.4.1.1.2"
    vb_list = [
        VarBind(
            oid="1.3.6.1.2.1.1.3.0",
            value_type="TimeTicks",
            value=str(random.randint(100, 999999)),
        ),
        VarBind(
            oid="1.3.6.1.6.3.1.1.4.1.0",
            value_type="OBJECT IDENTIFIER",
            value="1.3.6.1.4.1.20408.4.1.1.2",
        ),
        VarBind(
            oid="1.3.6.1.2.1.1.1.0",
            value_type="OCTET STRING",
            value=f"Demo Device {random.randint(1, 100)}",
        ),
        VarBind(
            oid="1.3.6.1.2.1.1.5.0",
            value_type="OCTET STRING",
            value=f"switch-{random.randint(1, 50)}.example.com",
        ),
        VarBind(
            oid="1.3.6.1.2.1.2.2.1.1.1",
            value_type="INTEGER",
            value=str(random.randint(1, 48)),
        ),
        VarBind(
            oid="1.3.6.1.2.1.2.2.1.8.1",
            value_type="INTEGER",
            value=str(random.choice([1, 2])),
        ),
    ]

    trap_id = _generate_trap_id(source_ip, trap_oid, vb_list)

    demo_trap = SnmpTrap(
        id=str(uuid4()),
        trap_id=trap_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        source_ip=source_ip,
        source_port=random.randint(40000, 60000),
        snmp_version=random.choice(["v2c", "v3"]),
        community="public",
        trap_oid=trap_oid,
        variable_bindings=vb_list,
        raw_pdu="308201830201010430" + uuid4().hex[:24] + "0c" * 50,
    )

    if trap_store.add_trap(demo_trap):
        await _broadcast_trap(demo_trap)
        if _forward_queue:
            _forward_queue.put_nowait(demo_trap)
        return MessageResponse(message="Demo trap added")
    return MessageResponse(message="Demo trap ignored (duplicate)")


@app.post("/api/v3/discover", response_model=EngineIdDiscoveryResponse)
async def discover_engine_id(req: EngineIdDiscoveryRequest):
    try:
        import asyncio
        from pysnmp.entity import engine as snmp_engine_mod
        from pysnmp.entity import config as snmp_config_mod
        from pysnmp.carrier.asyncio.dgram import udp
        from pysnmp.proto.api import v2c
        from pysnmp.proto.secmod.rfc3414 import service as usm_mod
        from pysnmp import debug

        snmp_engine = snmp_engine_mod.SnmpEngine()

        engine_id = None
        engine_id_hex = None

        class EngineIdCaptured(Exception):
            pass

        def capture_engine_id(snmp_engine, state_reference, security_engine_id,
                               message_processing_model, security_level,
                               context_engine_id, context_name, pdu_version,
                               pdu_type, pdu, orig_pdu):
            nonlocal engine_id, engine_id_hex
            if security_engine_id:
                try:
                    if hasattr(security_engine_id, 'asOctets'):
                        engine_id_bytes = security_engine_id.asOctets()
                    elif isinstance(security_engine_id, bytes):
                        engine_id_bytes = security_engine_id
                    else:
                        engine_id_bytes = bytes(security_engine_id)
                    engine_id_hex = engine_id_bytes.hex()
                    engine_id = ':'.join(engine_id_bytes[i:i+2].hex()
                                         for i in range(0, len(engine_id_bytes), 2))
                except Exception:
                    engine_id_hex = str(security_engine_id)
                    engine_id = engine_id_hex

        snmp_engine.observer.registerObserver(
            capture_engine_id, 'rfc3412.prepareDataElements:internal'
        )

        transport = udp.UdpTransport()
        try:
            transport.openClientMode()
        except AttributeError:
            await transport.openClientMode()

        snmp_config_mod.addSocketTransport(snmp_engine, transport.domainName, transport)

        snmp_config_mod.addV3User(snmp_engine, 'discovery')

        req_id = 12345
        get_request = v2c.GetRequestPDU()
        v2c.apiPDU.setDefaults(get_request)
        v2c.apiPDU.setRequestID(get_request, req_id)
        v2c.apiPDU.setVarBinds(get_request, [])

        msg = snmp_engine.msg_and_pdu_ver_3.message()
        msg.setComponentByPosition(0, v2c.Version(3))

        global_data = msg.setComponentByPosition(3)
        global_data.setComponentByPosition(0, v2c.Integer(0))
        global_data.setComponentByPosition(1, v2c.Integer(0))
        global_data.setComponentByPosition(2, v2c.OctetString(''))

        security_params = msg.setComponentByPosition(4)
        security_params.setComponentByPosition(0, v2c.OctetString(''))
        security_params.setComponentByPosition(1, v2c.Integer(0))
        security_params.setComponentByPosition(2, v2c.OctetString('discovery'))
        security_params.setComponentByPosition(3, v2c.OctetString(''))
        security_params.setComponentByPosition(4, v2c.OctetString(''))
        security_params.setComponentByPosition(5, v2c.OctetString(''))

        scoped_pdu = msg.setComponentByPosition(5)
        scoped_pdu.setComponentByPosition(0, v2c.OctetString(''))
        scoped_pdu.setComponentByPosition(1, v2c.OctetString(''))
        scoped_pdu.setComponentByPosition(2, get_request)

        snmp_engine.transport_dispatcher.sendMessage(
            snmp_engine, msg, transport.domainName,
            (req.target_ip, req.target_port)
        )

        timeout = 3
        start = __import__("time").time()
        while __import__("time").time() - start < timeout:
            snmp_engine.openDispatcher()
            if engine_id_hex:
                break
            await asyncio.sleep(0.1)

        try:
            snmp_engine.closeDispatcher()
        except Exception:
            pass

        if engine_id_hex:
            return EngineIdDiscoveryResponse(
                success=True,
                engine_id=engine_id,
                engine_id_hex=engine_id_hex,
            )
        else:
            return EngineIdDiscoveryResponse(
                success=False,
                error="Timeout: No response from target"
            )

    except ImportError as e:
        return EngineIdDiscoveryResponse(
            success=False,
            error=f"pysnmp not available: {e}"
        )
    except Exception as e:
        logger.error(f"Engine ID discovery failed: {e}", exc_info=True)
        return EngineIdDiscoveryResponse(
            success=False,
            error=str(e)
        )


@app.websocket("/ws/traps")
async def websocket_traps(websocket: WebSocket):
    await websocket.accept()
    _ws_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
