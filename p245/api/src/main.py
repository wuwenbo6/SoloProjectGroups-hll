"""FastAPI主服务器 - J1939 TP协议模拟器后端"""

import asyncio
import json
import os
import subprocess
from typing import Optional, List
from pydantic import BaseModel
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from j1939_tp import (
    BamConfig, BamSimulator,
    CmdtConfig, CmdtSimulator,
    MultiNodeBamConfig, MultiNodeBamSimulator, ReceiverNode,
    PcapLogger,
    MODE_BAM, MODE_CMDT, STATE_IDLE
)


MODE_MULTI_NODE_BAM = "multi_node_bam"


class ReceiverNodeConfig(BaseModel):
    """接收节点配置"""
    node_id: int
    name: str
    address: int
    packet_loss_rate: float = 0.0
    out_of_order_rate: float = 0.0


class SimulationConfig(BaseModel):
    """模拟配置"""
    mode: str = MODE_BAM
    messageSize: int = 100
    sourceAddress: int = 1
    destinationAddress: int = 2
    packetLossRate: float = 0.0
    frameInterval: float = 50.0
    outOfOrderRate: float = 0.0
    ctsWindowSize: int = 255
    ctsTimeout: float = 1.0
    ctsLossRate: float = 0.0
    maxRtsRetries: int = 3
    receiverNodes: Optional[List[ReceiverNodeConfig]] = None


class SimulationControl(BaseModel):
    """模拟控制"""
    type: str
    payload: Optional[SimulationConfig] = None


app = FastAPI(title="J1939 TP Protocol Simulator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bam_simulator = BamSimulator()
cmdt_simulator = CmdtSimulator()
multi_node_simulator = MultiNodeBamSimulator()
pcap_logger = PcapLogger()
current_simulator = None
current_mode = MODE_BAM


def create_vcan_interface():
    """创建vcan虚拟接口"""
    try:
        subprocess.run(["sudo", "modprobe", "vcan"], check=False)
        subprocess.run(["sudo", "ip", "link", "add", "dev", "vcan0", "type", "vcan"], check=False)
        subprocess.run(["sudo", "ip", "link", "set", "up", "vcan0"], check=False)
        return {"success": True, "interface": "vcan0"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/config")
async def get_default_config():
    """获取默认配置"""
    default_nodes = [
        {"node_id": 0, "name": "节点A", "address": 16, "packet_loss_rate": 0.0, "out_of_order_rate": 0.0},
        {"node_id": 1, "name": "节点B", "address": 17, "packet_loss_rate": 0.0, "out_of_order_rate": 0.0},
        {"node_id": 2, "name": "节点C", "address": 18, "packet_loss_rate": 0.0, "out_of_order_rate": 0.0},
    ]
    return {
        "mode": MODE_BAM,
        "messageSize": 100,
        "sourceAddress": 1,
        "destinationAddress": 2,
        "packetLossRate": 0.0,
        "frameInterval": 50,
        "outOfOrderRate": 0.0,
        "ctsWindowSize": 255,
        "ctsTimeout": 1.0,
        "ctsLossRate": 0.0,
        "maxRtsRetries": 3,
        "receiverNodes": default_nodes
    }


@app.get("/api/pcap")
async def export_pcap():
    """导出PCAP日志"""
    pcap_data = pcap_logger.build_pcap()
    frame_count = pcap_logger.get_frame_count()
    filename = f"j1939_tp_{int(pcap_logger.start_time)}.pcap"
    return Response(
        content=pcap_data,
        media_type="application/vnd.tcpdump.pcap",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Frame-Count": str(frame_count)
        }
    )


@app.get("/api/pcap/info")
async def get_pcap_info():
    """获取PCAP日志信息"""
    return {
        "frame_count": pcap_logger.get_frame_count(),
        "start_time": pcap_logger.start_time,
        "current_time": pcap_logger.start_time + (len(pcap_logger.logs) * 0.05 if pcap_logger.logs else 0)
    }


@app.post("/api/pcap/reset")
async def reset_pcap():
    """重置PCAP日志"""
    pcap_logger.reset()
    return {"success": True, "message": "PCAP日志已重置"}


@app.post("/api/vcan/setup")
async def setup_vcan():
    """设置vcan接口"""
    return create_vcan_interface()


@app.get("/api/status")
async def get_status():
    """获取模拟器状态"""
    global current_simulator
    sim = current_simulator
    return {
        "mode": current_mode,
        "state": sim.state if sim else STATE_IDLE,
        "running": sim.state != STATE_IDLE if sim else False,
        "has_vcan": os.path.exists("/sys/class/net/vcan0")
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket实时通信"""
    global current_simulator, current_mode
    await websocket.accept()

    def event_callback(event_type: str, payload: dict):
        """事件回调 - 将事件发送到前端并记录PCAP日志"""
        # 记录PCAP日志
        if "can_id" in payload and "data" in payload:
            can_id = payload.get("can_id")
            data = bytes(payload.get("data", []))
            extended = True
            is_rx = event_type in ["frame_received", "node_receive"]
            pcap_logger.log_frame(can_id, data, extended, is_rx)

        async def send():
            try:
                await websocket.send_json({
                    "type": event_type,
                    "payload": payload
                })
            except Exception:
                pass

        asyncio.create_task(send())

    try:
        while True:
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
                msg_type = message.get("type")

                if msg_type == "update_config":
                    config_data = message.get("payload", {})
                    mode = config_data.get("mode", MODE_BAM)
                    current_mode = mode

                    if mode == MODE_MULTI_NODE_BAM:
                        # 多节点BAM模式
                        receiver_nodes_config = config_data.get("receiverNodes", [])
                        nodes = []
                        for node_data in receiver_nodes_config:
                            nodes.append(ReceiverNode(
                                node_id=node_data.get("node_id", 0),
                                name=node_data.get("name", f"节点{node_data.get('node_id', 0) + 1}"),
                                address=node_data.get("address", 0x10 + node_data.get("node_id", 0)),
                                packet_loss_rate=node_data.get("packet_loss_rate", 0.0),
                                out_of_order_rate=node_data.get("out_of_order_rate", 0.0)
                            ))
                        if not nodes:
                            nodes = MultiNodeBamConfig.create_default_nodes(3)

                        config = MultiNodeBamConfig(
                            message_size=config_data.get("messageSize", 100),
                            source_address=config_data.get("sourceAddress", 1),
                            frame_interval=config_data.get("frameInterval", 50) / 1000.0,
                            out_of_order_rate=config_data.get("outOfOrderRate", 0.0),
                            receiver_nodes=nodes
                        )
                        multi_node_simulator.configure(config)
                        current_simulator = multi_node_simulator
                        multi_node_simulator.set_event_callback(event_callback)
                    elif mode == MODE_BAM:
                        config = BamConfig(
                            message_size=config_data.get("messageSize", 100),
                            source_address=config_data.get("sourceAddress", 1),
                            packet_loss_rate=config_data.get("packetLossRate", 0.0),
                            frame_interval=config_data.get("frameInterval", 50) / 1000.0,
                            out_of_order_rate=config_data.get("outOfOrderRate", 0.0)
                        )
                        bam_simulator.configure(config)
                        current_simulator = bam_simulator
                        bam_simulator.set_event_callback(event_callback)
                    else:
                        config = CmdtConfig(
                            message_size=config_data.get("messageSize", 100),
                            source_address=config_data.get("sourceAddress", 1),
                            destination_address=config_data.get("destinationAddress", 2),
                            packet_loss_rate=config_data.get("packetLossRate", 0.0),
                            frame_interval=config_data.get("frameInterval", 30) / 1000.0,
                            cts_window_size=config_data.get("ctsWindowSize", 255),
                            cts_timeout=config_data.get("ctsTimeout", 1.0),
                            cts_loss_rate=config_data.get("ctsLossRate", 0.0),
                            max_rts_retries=config_data.get("maxRtsRetries", 3)
                        )
                        cmdt_simulator.configure(config)
                        current_simulator = cmdt_simulator
                        cmdt_simulator.set_event_callback(event_callback)

                    await websocket.send_json({
                        "type": "config_updated",
                        "payload": {"success": True, "mode": mode}
                    })

                elif msg_type == "start_simulation":
                    if current_simulator:
                        pcap_logger.reset()  # 开始模拟前重置PCAP日志
                        await current_simulator.start_simulation()
                        await websocket.send_json({
                            "type": "simulation_started",
                            "payload": {"success": True}
                        })
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "payload": {"code": "no_config", "message": "请先配置模拟参数"}
                        })

                elif msg_type == "stop_simulation":
                    if current_simulator:
                        await current_simulator.stop_simulation()
                        await websocket.send_json({
                            "type": "simulation_stopped",
                            "payload": {"success": True}
                        })

                elif msg_type == "reset_simulation":
                    if current_simulator:
                        await current_simulator.stop_simulation()
                        current_simulator.reset()
                    current_simulator = None
                    pcap_logger.reset()
                    await websocket.send_json({
                        "type": "simulation_reset",
                        "payload": {"success": True}
                    })

                else:
                    await websocket.send_json({
                        "type": "error",
                        "payload": {"code": "unknown_type", "message": f"未知消息类型: {msg_type}"}
                    })

            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "payload": {"code": "invalid_json", "message": "无效的JSON格式"}
                })
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "payload": {"code": "server_error", "message": str(e)}
                })

    except WebSocketDisconnect:
        if current_simulator:
            await current_simulator.stop_simulation()
        print("WebSocket disconnected")
