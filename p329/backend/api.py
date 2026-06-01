from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
import uuid
import csv
import io
import datetime
import asyncio
import dataclasses

from .s7comm_parser import (
    parse_s7comm,
    build_s7comm_read_packet,
    build_s7comm_write_packet,
    build_s7comm_setup_packet,
    build_s7comm_setup_comm_packet,
    bytes_to_hex_display,
    AREA_TYPE_NAMES,
    TRANSPORT_SIZE_NAMES,
    ROSCTR_NAMES,
    FUNCTION_CODE_NAMES,
)

app = FastAPI(title="S7comm Protocol Analyzer", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

parse_history: list = []
simulation_sessions: dict = {}


def dataclass_to_dict(obj):
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {k: dataclass_to_dict(v) for k, v in dataclasses.asdict(obj).items()}
    elif isinstance(obj, list):
        return [dataclass_to_dict(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: dataclass_to_dict(v) for k, v in obj.items()}
    elif isinstance(obj, bytes):
        return bytes_to_hex_display(obj)
    return obj


class ParseRequest(BaseModel):
    hex_data: str
    include_tpkt: bool = True


class ConnectRequest(BaseModel):
    ip: str = "192.168.0.1"
    rack: int = 0
    slot: int = 1


class ReadRequest(BaseModel):
    session_id: str
    area: str = "DB"
    db_number: int = 1
    offset: int = 0
    type: str = "BYTE"
    count: int = 10


class WriteRequest(BaseModel):
    session_id: str
    area: str = "DB"
    db_number: int = 1
    offset: int = 0
    type: str = "BYTE"
    data: list = [0]


AREA_MAP = {
    "PE": 0x81,
    "PA": 0x82,
    "MK": 0x83,
    "DB": 0x84,
    "CT": 0x1C,
    "TM": 0x1D,
}

SIZE_MAP = {
    "BIT": 0x01,
    "BYTE": 0x02,
    "CHAR": 0x03,
    "WORD": 0x04,
    "INT": 0x05,
    "DWORD": 0x06,
    "DINT": 0x07,
    "REAL": 0x08,
    "COUNTER": 0x1C,
    "TIMER": 0x1D,
}


@app.post("/api/parse")
async def api_parse(request: ParseRequest):
    result = parse_s7comm(request.hex_data, include_tpkt=request.include_tpkt)
    result_dict = dataclass_to_dict(result)

    if result.error is None:
        record = {
            "id": len(parse_history) + 1,
            "timestamp": datetime.datetime.now().isoformat(),
            "hex_data": request.hex_data,
            "parse_result": result_dict,
            "source": "manual",
        }
        parse_history.append(record)

    return result_dict


@app.get("/api/history")
async def api_get_history():
    return list(reversed(parse_history))


@app.delete("/api/history/{record_id}")
async def api_delete_history(record_id: int):
    global parse_history
    parse_history = [r for r in parse_history if r["id"] != record_id]
    return {"success": True}


@app.delete("/api/history")
async def api_clear_history():
    global parse_history
    parse_history = []
    return {"success": True}


@app.post("/api/simulate/connect")
async def api_simulate_connect(request: ConnectRequest):
    session_id = str(uuid.uuid4())[:8]

    setup_cr_raw = build_s7comm_setup_packet()
    setup_cr_parsed = parse_s7comm(bytes_to_hex_display(setup_cr_raw))

    setup_comm_raw = build_s7comm_setup_comm_packet()
    setup_comm_parsed = parse_s7comm(bytes_to_hex_display(setup_comm_raw))

    session = {
        "session_id": session_id,
        "ip": request.ip,
        "rack": request.rack,
        "slot": request.slot,
        "pdu_size": 960,
        "created_at": datetime.datetime.now().isoformat(),
        "operations": [],
    }
    simulation_sessions[session_id] = session

    return {
        "success": True,
        "session_id": session_id,
        "pdu_size": 960,
        "connection_request": {
            "raw": bytes_to_hex_display(setup_cr_raw),
            "parsed": dataclass_to_dict(setup_cr_parsed),
        },
        "setup_communication": {
            "raw": bytes_to_hex_display(setup_comm_raw),
            "parsed": dataclass_to_dict(setup_comm_parsed),
        },
    }


@app.post("/api/simulate/read")
async def api_simulate_read(request: ReadRequest):
    if request.session_id not in simulation_sessions:
        return {"success": False, "error": "Session not found"}

    area_code = AREA_MAP.get(request.area, 0x84)
    size_code = SIZE_MAP.get(request.type, 0x02)

    request_raw = build_s7comm_read_packet(
        db_number=request.db_number,
        area=area_code,
        offset=request.offset,
        transport_size=size_code,
        length=request.count,
    )
    request_parsed = parse_s7comm(bytes_to_hex_display(request_raw))

    import random
    simulated_data = bytes([random.randint(0, 255) for _ in range(request.count)])

    resp_data_item = bytes([
        0xFF,
        size_code,
        ((request.count * 8) >> 8) & 0xFF, (request.count * 8) & 0xFF,
    ]) + simulated_data
    if len(resp_data_item) % 2 != 0:
        resp_data_item += b"\x00"

    cotp_dt = bytes([0x02, 0xF0, 0x80])
    resp_param = bytes([0x04, 0x00, 0x01])
    param_length = len(resp_param)
    data_length = len(resp_data_item)
    s7_resp_header = bytes([
        0x32,
        0x02,
        0x00, 0x00,
        0x00, 0x01,
        (param_length >> 8) & 0xFF, param_length & 0xFF,
        (data_length >> 8) & 0xFF, data_length & 0xFF,
    ])

    resp_payload = cotp_dt + s7_resp_header + resp_param + resp_data_item
    resp_total_length = 4 + len(resp_payload)
    response_raw = bytes([0x03, 0x00, (resp_total_length >> 8) & 0xFF, resp_total_length & 0xFF]) + resp_payload
    response_parsed = parse_s7comm(bytes_to_hex_display(response_raw))

    operation = {
        "type": "read",
        "timestamp": datetime.datetime.now().isoformat(),
        "area": request.area,
        "db_number": request.db_number,
        "offset": request.offset,
        "data_type": request.type,
        "count": request.count,
        "request_raw": bytes_to_hex_display(request_raw),
        "request_parsed": dataclass_to_dict(request_parsed),
        "response_raw": bytes_to_hex_display(response_raw),
        "response_parsed": dataclass_to_dict(response_parsed),
        "data": list(simulated_data),
    }
    simulation_sessions[request.session_id]["operations"].append(operation)

    record = {
        "id": len(parse_history) + 1,
        "timestamp": datetime.datetime.now().isoformat(),
        "hex_data": bytes_to_hex_display(request_raw),
        "parse_result": dataclass_to_dict(request_parsed),
        "source": f"simulator-read-{request.session_id}",
    }
    parse_history.append(record)

    return {
        "success": True,
        "data": list(simulated_data),
        "request": {
            "raw": bytes_to_hex_display(request_raw),
            "parsed": dataclass_to_dict(request_parsed),
        },
        "response": {
            "raw": bytes_to_hex_display(response_raw),
            "parsed": dataclass_to_dict(response_parsed),
        },
    }


@app.post("/api/simulate/write")
async def api_simulate_write(request: WriteRequest):
    if request.session_id not in simulation_sessions:
        return {"success": False, "error": "Session not found"}

    area_code = AREA_MAP.get(request.area, 0x84)
    size_code = SIZE_MAP.get(request.type, 0x02)
    write_data = bytes(request.data)

    request_raw = build_s7comm_write_packet(
        db_number=request.db_number,
        area=area_code,
        offset=request.offset,
        transport_size=size_code,
        length=len(request.data),
        write_data=write_data,
    )
    request_parsed = parse_s7comm(bytes_to_hex_display(request_raw))

    cotp_dt = bytes([0x02, 0xF0, 0x80])
    resp_param = bytes([0x05, 0x00, 0x01])
    resp_data = bytes([0x00, 0x01, 0xFF])
    param_length = len(resp_param)
    data_length = len(resp_data)
    s7_resp_header = bytes([
        0x32,
        0x02,
        0x00, 0x00,
        0x00, 0x01,
        (param_length >> 8) & 0xFF, param_length & 0xFF,
        (data_length >> 8) & 0xFF, data_length & 0xFF,
    ])

    resp_payload = cotp_dt + s7_resp_header + resp_param + resp_data
    resp_total_length = 4 + len(resp_payload)
    response_raw = bytes([0x03, 0x00, (resp_total_length >> 8) & 0xFF, resp_total_length & 0xFF]) + resp_payload
    response_parsed = parse_s7comm(bytes_to_hex_display(response_raw))

    operation = {
        "type": "write",
        "timestamp": datetime.datetime.now().isoformat(),
        "area": request.area,
        "db_number": request.db_number,
        "offset": request.offset,
        "data_type": request.type,
        "write_data": list(write_data),
        "request_raw": bytes_to_hex_display(request_raw),
        "request_parsed": dataclass_to_dict(request_parsed),
        "response_raw": bytes_to_hex_display(response_raw),
        "response_parsed": dataclass_to_dict(response_parsed),
    }
    simulation_sessions[request.session_id]["operations"].append(operation)

    record = {
        "id": len(parse_history) + 1,
        "timestamp": datetime.datetime.now().isoformat(),
        "hex_data": bytes_to_hex_display(request_raw),
        "parse_result": dataclass_to_dict(request_parsed),
        "source": f"simulator-write-{request.session_id}",
    }
    parse_history.append(record)

    return {
        "success": True,
        "request": {
            "raw": bytes_to_hex_display(request_raw),
            "parsed": dataclass_to_dict(request_parsed),
        },
        "response": {
            "raw": bytes_to_hex_display(response_raw),
            "parsed": dataclass_to_dict(response_parsed),
        },
    }


@app.websocket("/ws/simulate/{session_id}")
async def websocket_simulate(websocket: WebSocket, session_id: str):
    await websocket.accept()

    if session_id not in simulation_sessions:
        await websocket.send_json({"event": "error", "message": "Session not found"})
        await websocket.close()
        return

    try:
        while True:
            msg = await websocket.receive_text()
            data = json.loads(msg)
            action = data.get("action")

            if action == "read":
                area_code = AREA_MAP.get(data.get("area", "DB"), 0x84)
                size_code = SIZE_MAP.get(data.get("type", "BYTE"), 0x02)
                count = data.get("count", 10)
                db_number = data.get("db_number", 1)
                offset = data.get("offset", 0)

                await websocket.send_json({
                    "event": "status",
                    "message": "Building Read request packet...",
                })

                await asyncio.sleep(0.3)

                request_raw = build_s7comm_read_packet(
                    db_number=db_number,
                    area=area_code,
                    offset=offset,
                    transport_size=size_code,
                    length=count,
                )
                request_parsed = parse_s7comm(bytes_to_hex_display(request_raw))

                await websocket.send_json({
                    "event": "request_built",
                    "raw": bytes_to_hex_display(request_raw),
                    "parsed": dataclass_to_dict(request_parsed),
                })

                await asyncio.sleep(0.5)

                await websocket.send_json({
                    "event": "status",
                    "message": "Receiving response from PLC...",
                })

                await asyncio.sleep(0.5)

                import random
                simulated_data = bytes([random.randint(0, 255) for _ in range(count)])

                resp_data_item = bytes([
                    0xFF,
                    size_code,
                    ((count * 8) >> 8) & 0xFF, (count * 8) & 0xFF,
                ]) + simulated_data
                if len(resp_data_item) % 2 != 0:
                    resp_data_item += b"\x00"

                cotp_dt = bytes([0x02, 0xF0, 0x80])
                resp_param = bytes([0x04, 0x00, 0x01])
                param_length = len(resp_param)
                data_length = len(resp_data_item)
                s7_resp_header = bytes([
                    0x32,
                    0x02,
                    0x00, 0x00,
                    0x00, 0x01,
                    (param_length >> 8) & 0xFF, param_length & 0xFF,
                    (data_length >> 8) & 0xFF, data_length & 0xFF,
                ])
                resp_payload = cotp_dt + s7_resp_header + resp_param + resp_data_item
                resp_total_length = 4 + len(resp_payload)
                response_raw = bytes([0x03, 0x00, (resp_total_length >> 8) & 0xFF, resp_total_length & 0xFF]) + resp_payload
                response_parsed = parse_s7comm(bytes_to_hex_display(response_raw))

                await websocket.send_json({
                    "event": "response_received",
                    "raw": bytes_to_hex_display(response_raw),
                    "parsed": dataclass_to_dict(response_parsed),
                })

                await websocket.send_json({
                    "event": "complete",
                    "data": list(simulated_data),
                })

            elif action == "write":
                area_code = AREA_MAP.get(data.get("area", "DB"), 0x84)
                size_code = SIZE_MAP.get(data.get("type", "BYTE"), 0x02)
                write_data = bytes(data.get("data", [0]))
                db_number = data.get("db_number", 1)
                offset = data.get("offset", 0)

                await websocket.send_json({
                    "event": "status",
                    "message": "Building Write request packet...",
                })

                await asyncio.sleep(0.3)

                request_raw = build_s7comm_write_packet(
                    db_number=db_number,
                    area=area_code,
                    offset=offset,
                    transport_size=size_code,
                    length=len(data.get("data", [0])),
                    write_data=write_data,
                )
                request_parsed = parse_s7comm(bytes_to_hex_display(request_raw))

                await websocket.send_json({
                    "event": "request_built",
                    "raw": bytes_to_hex_display(request_raw),
                    "parsed": dataclass_to_dict(request_parsed),
                })

                await asyncio.sleep(0.5)

                await websocket.send_json({
                    "event": "status",
                    "message": "Sending write request to PLC...",
                })

                await asyncio.sleep(0.5)

                cotp_dt = bytes([0x02, 0xF0, 0x80])
                resp_param = bytes([0x05, 0x00, 0x01])
                resp_data = bytes([0x00, 0x01, 0xFF])
                param_length = len(resp_param)
                data_length = len(resp_data)
                s7_resp_header = bytes([
                    0x32,
                    0x02,
                    0x00, 0x00,
                    0x00, 0x01,
                    (param_length >> 8) & 0xFF, param_length & 0xFF,
                    (data_length >> 8) & 0xFF, data_length & 0xFF,
                ])
                resp_payload = cotp_dt + s7_resp_header + resp_param + resp_data
                resp_total_length = 4 + len(resp_payload)
                response_raw = bytes([0x03, 0x00, (resp_total_length >> 8) & 0xFF, resp_total_length & 0xFF]) + resp_payload
                response_parsed = parse_s7comm(bytes_to_hex_display(response_raw))

                await websocket.send_json({
                    "event": "response_received",
                    "raw": bytes_to_hex_display(response_raw),
                    "parsed": dataclass_to_dict(response_parsed),
                })

                await websocket.send_json({
                    "event": "complete",
                    "success": True,
                })

            elif action == "ping":
                await websocket.send_json({"event": "pong"})

    except WebSocketDisconnect:
        pass


@app.get("/api/sample-packets")
async def api_sample_packets():
    cr_raw = build_s7comm_setup_packet()
    sc_raw = build_s7comm_setup_comm_packet()
    read_raw = build_s7comm_read_packet(db_number=1, area=0x84, offset=0, transport_size=0x02, length=10)
    write_raw = build_s7comm_write_packet(db_number=1, area=0x84, offset=0, transport_size=0x02, length=1, write_data=b"\xff")

    import random
    random.seed(42)
    simulated_data = bytes([random.randint(0, 255) for _ in range(10)])
    resp_data_item = bytes([0xFF, 0x02, 0x00, 0x50]) + simulated_data
    if len(resp_data_item) % 2 != 0:
        resp_data_item += b"\x00"
    cotp_dt = bytes([0x02, 0xF0, 0x80])
    resp_param = bytes([0x04, 0x00, 0x01])
    param_length = len(resp_param)
    data_length = len(resp_data_item)
    s7_resp_header = bytes([
        0x32, 0x02, 0x00, 0x00, 0x00, 0x01,
        (param_length >> 8) & 0xFF, param_length & 0xFF,
        (data_length >> 8) & 0xFF, data_length & 0xFF,
    ])
    resp_payload = cotp_dt + s7_resp_header + resp_param + resp_data_item
    resp_total_length = 4 + len(resp_payload)
    read_resp_raw = bytes([0x03, 0x00, (resp_total_length >> 8) & 0xFF, resp_total_length & 0xFF]) + resp_payload

    return {
        "samples": [
            {
                "name": "COTP Connection Request",
                "hex": bytes_to_hex_display(cr_raw),
                "description": "ISO on TCP连接请求，包含TPKT和COTP CR报文",
            },
            {
                "name": "S7 Setup Communication",
                "hex": bytes_to_hex_display(sc_raw),
                "description": "S7通信设置请求，协商PDU大小",
            },
            {
                "name": "S7 Read DB1.DBB0-9",
                "hex": bytes_to_hex_display(read_raw),
                "description": "从DB1读取10个字节（偏移0开始）",
            },
            {
                "name": "S7 Read Response (10 bytes)",
                "hex": bytes_to_hex_display(read_resp_raw),
                "description": "读取响应，返回10字节数据",
            },
            {
                "name": "S7 Write DB1.DBB0 = 0xFF",
                "hex": bytes_to_hex_display(write_raw),
                "description": "向DB1偏移0写入1个字节(0xFF)",
            },
        ]
    }


class ExportRequest(BaseModel):
    parse_result: Optional[dict] = None
    record_id: Optional[int] = None
    include_headers: bool = True


@app.post("/api/export/csv")
async def api_export_csv(request: ExportRequest):
    parse_result = request.parse_result
    if request.record_id is not None:
        for record in parse_history:
            if record["id"] == request.record_id:
                parse_result = record["parse_result"]
                break

    if parse_result is None:
        return Response(content="No data to export", media_type="text/plain", status_code=400)

    output = io.StringIO()
    writer = csv.writer(output)

    if request.include_headers:
        writer.writerow([
            "Item Index",
            "Area",
            "DB Number",
            "Offset",
            "Bit Offset",
            "Data Type",
            "Data Length (bytes)",
            "Data Length (bits)",
            "Hex Data",
            "Decimal Values",
            "Return Code",
            "Return Code Name",
        ])

    items = []
    if parse_result.get("data") and parse_result["data"].get("items"):
        items = parse_result["data"]["items"]

    params = parse_result.get("parameters", {})
    param_items = []
    if params.get("read_items"):
        param_items = params["read_items"]
    elif params.get("write_items"):
        param_items = params["write_items"]

    for i, item in enumerate(items):
        area_name = ""
        db_number = ""
        offset = ""
        bit_offset = ""
        type_name = ""

        if i < len(param_items):
            pi = param_items[i]
            area_name = pi.get("area_name", "")
            db_number = pi.get("db_number", "")
            offset = pi.get("offset", "")
            bit_offset = pi.get("bit_offset", "")
            type_name = pi.get("type_name", "")

        writer.writerow([
            i,
            area_name,
            db_number,
            offset,
            bit_offset,
            type_name,
            item.get("data_length", ""),
            item.get("data_length_bits", ""),
            item.get("data", ""),
            ", ".join(str(v) for v in item.get("data_values", [])),
            f"0x{item.get('return_code', 0):02X}",
            item.get("return_code_name", ""),
        ])

    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=s7comm_data_export.csv"
        }
    )


@app.get("/api/simulate/{session_id}/export/csv")
async def api_simulate_export_csv(session_id: str):
    if session_id not in simulation_sessions:
        return Response(content="Session not found", media_type="text/plain", status_code=404)

    session = simulation_sessions[session_id]
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Timestamp",
        "Operation",
        "Area",
        "DB Number",
        "Offset",
        "Data Type",
        "Count",
        "Data (Hex)",
        "Data (Decimal)",
        "Request Hex",
    ])

    for op in session.get("operations", []):
        data_hex = ""
        data_decimal = ""
        if op.get("data"):
            data_hex = " ".join(f"{b:02X}" for b in op["data"])
            data_decimal = ", ".join(str(b) for b in op["data"])
        elif op.get("write_data"):
            data_hex = " ".join(f"{b:02X}" for b in op["write_data"])
            data_decimal = ", ".join(str(b) for b in op["write_data"])

        writer.writerow([
            op.get("timestamp", ""),
            op.get("type", "").upper(),
            op.get("area", ""),
            op.get("db_number", ""),
            op.get("offset", ""),
            op.get("data_type", ""),
            op.get("count", len(op.get("write_data", []))),
            data_hex,
            data_decimal,
            op.get("request_raw", ""),
        ])

    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=plc_session_{session_id}_export.csv"
        }
    )
