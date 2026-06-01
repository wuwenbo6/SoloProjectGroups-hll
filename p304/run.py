import asyncio
import signal
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fix_engine.detector import SeqNumDetector
from fix_engine.simulator import FixSimulator
from fix_engine.ws_server import WSServer
from fix_engine.config import WS_HOST, WS_PORT


async def main():
    detector = SeqNumDetector()
    simulator = FixSimulator(detector)
    server = WSServer(detector, simulator)

    detector.on_attack(lambda session, alert: asyncio.ensure_future(
        server.broadcast_alert(session.session_id, alert)
    ))
    simulator.on_message(lambda sid, msg: asyncio.ensure_future(
        server.broadcast_message(sid, msg)
    ))
    simulator.on_logout(lambda sid, msg: asyncio.ensure_future(
        server.broadcast_logout(sid, msg)
    ))
    simulator.on_resend_request(lambda sid, msg: asyncio.ensure_future(
        server.broadcast_resend_request(sid, msg)
    ))

    print(f"[FIX Engine] Starting WebSocket server on {WS_HOST}:{WS_PORT}")
    runner = await server.start_async()

    print("[FIX Engine] Adding demo sessions...")
    simulator.add_session("SESSION-1", "BROKER-A", "EXCHANGE")
    simulator.add_session("SESSION-2", "HEDGE-FUND-B", "EXCHANGE")
    simulator.add_session("SESSION-3", "MARKET-MAKER-C", "EXCHANGE")

    await simulator.start()

    broadcast_task = asyncio.create_task(periodic_broadcast(detector, server))

    print("[FIX Engine] System ready - open http://localhost:8080 in your browser")
    print("[FIX Engine] Use the frontend controls to inject attack scenarios")

    stop_event = asyncio.Event()
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)

    await stop_event.wait()

    print("\n[FIX Engine] Shutting down...")
    broadcast_task.cancel()
    await simulator.stop()
    await runner.cleanup()


async def periodic_broadcast(detector: SeqNumDetector, server: WSServer):
    try:
        while True:
            await asyncio.sleep(0.5)
            await server._broadcast_state()
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    asyncio.run(main())
