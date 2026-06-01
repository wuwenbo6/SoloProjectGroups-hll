import os

LOG_GAP_THRESHOLD_SECONDS = int(os.getenv("LOG_GAP_THRESHOLD_SECONDS", "5"))
SEQNUM_RESET_THRESHOLD = int(os.getenv("SEQNUM_RESET_THRESHOLD", "0"))
WS_HOST = os.getenv("WS_HOST", "0.0.0.0")
WS_PORT = int(os.getenv("WS_PORT", "8765"))
HTTP_PORT = int(os.getenv("HTTP_PORT", "8080"))
SIMULATOR_TICK_INTERVAL = float(os.getenv("SIMULATOR_TICK_INTERVAL", "1.0"))
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
