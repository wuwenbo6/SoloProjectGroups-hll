import asyncio
import websockets
import json
import logging
from typing import Dict
from emmc_parser import EMMCParser

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class EMMCWebSocketServer:
    def __init__(self, host: str = "localhost", port: int = 8765):
        self.host = host
        self.port = port
        self.connected_clients = set()
        self._parsers: Dict[str, EMMCParser] = {}

    def _get_parser(self, device: str) -> EMMCParser:
        if device not in self._parsers:
            self._parsers[device] = EMMCParser(device)
        return self._parsers[device]

    async def handle_client(self, websocket, path):
        logger.info(f"New client connected: {websocket.remote_address}")
        self.connected_clients.add(websocket)
        
        try:
            await websocket.send(json.dumps({
                "type": "connection",
                "status": "connected",
                "message": "Welcome to eMMC Info Server"
            }))

            async for message in websocket:
                try:
                    data = json.loads(message)
                    response = await self.handle_message(data)
                    await websocket.send(json.dumps(response))
                except json.JSONDecodeError:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Invalid JSON format"
                    }))
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": str(e)
                    }))
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client disconnected: {websocket.remote_address}")
        finally:
            self.connected_clients.remove(websocket)

    async def handle_message(self, data: dict) -> dict:
        action = data.get("action")
        device = data.get("device", "/dev/mmcblk0")
        
        parser = self._get_parser(device)
        
        if action == "get_all_info":
            result = parser.get_all_info()
            return {
                "type": "emmc_info",
                "data": result
            }
        elif action == "get_cid":
            result = parser.read_cid()
            return {
                "type": "cid_info",
                "data": result
            }
        elif action == "get_csd":
            result = parser.read_csd()
            return {
                "type": "csd_info",
                "data": result
            }
        elif action == "get_boot_config":
            result = parser.read_boot_config()
            return {
                "type": "boot_config",
                "data": result
            }
        elif action == "bootpart_enable":
            boot_part = data.get("boot_part", 1)
            boot_ack = data.get("boot_ack", True)
            result = parser.bootpart_enable(boot_part, boot_ack)
            if "error" in result:
                return {
                    "type": "error",
                    "message": result["error"]
                }
            return {
                "type": "bootpart_result",
                "data": result
            }
        elif action == "get_rpmb_info":
            result = parser.get_rpmb_info()
            return {
                "type": "rpmb_info",
                "data": result
            }
        elif action == "rpmb_write":
            data_str = data.get("data", "")
            use_reliable = data.get("use_reliable", True)
            result = parser.rpmb_write(data_str, use_reliable)
            if "error" in result:
                return {
                    "type": "error",
                    "message": result["error"]
                }
            return {
                "type": "rpmb_result",
                "data": result
            }
        elif action == "rpmb_read":
            offset = data.get("offset", 0)
            count = data.get("count", 1)
            result = parser.rpmb_read(offset, count)
            return {
                "type": "rpmb_result",
                "data": result
            }
        elif action == "get_health_report":
            result = parser.get_health_report()
            return {
                "type": "health_report",
                "data": result
            }
        elif action == "list_devices":
            devices = self._list_emmc_devices()
            return {
                "type": "device_list",
                "data": devices
            }
        elif action == "ping":
            return {
                "type": "pong",
                "timestamp": asyncio.get_event_loop().time()
            }
        else:
            return {
                "type": "error",
                "message": f"Unknown action: {action}"
            }

    def _list_emmc_devices(self) -> list:
        import glob
        devices = []
        for dev in glob.glob("/dev/mmcblk*"):
            if "boot" not in dev and "rpmb" not in dev and "p" not in dev:
                devices.append(dev)
        return devices

    async def broadcast(self, message: dict):
        if self.connected_clients:
            message_json = json.dumps(message)
            await asyncio.gather(
                *[client.send(message_json) for client in self.connected_clients]
            )

    async def start(self):
        logger.info(f"Starting eMMC WebSocket Server on {self.host}:{self.port}")
        server = await websockets.serve(
            self.handle_client,
            self.host,
            self.port
        )
        logger.info("Server started. Waiting for connections...")
        await server.wait_closed()


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="eMMC WebSocket Server")
    parser.add_argument("--host", default="localhost", help="Server host")
    parser.add_argument("--port", type=int, default=8765, help="Server port")
    
    args = parser.parse_args()
    
    server = EMMCWebSocketServer(host=args.host, port=args.port)
    asyncio.run(server.start())


if __name__ == "__main__":
    main()
