import os

ENCLOSURE_DEVICES = os.environ.get('ENCLOSURE_DEVICES', '/dev/sg1').split(',')

SIMULATION_MODE = os.environ.get('SIMULATION_MODE', 'auto').lower()
if SIMULATION_MODE in ['true', '1', 'yes']:
    SIMULATION_MODE = True
elif SIMULATION_MODE in ['false', '0', 'no']:
    SIMULATION_MODE = False

TEMP_WARNING_THRESHOLD = float(os.environ.get('TEMP_WARNING_THRESHOLD', 45))
TEMP_CRITICAL_THRESHOLD = float(os.environ.get('TEMP_CRITICAL_THRESHOLD', 55))

DEFAULT_POLL_INTERVAL = int(os.environ.get('DEFAULT_POLL_INTERVAL', 5))

SIMULATED_SLOT_COUNT = int(os.environ.get('SIMULATED_SLOT_COUNT', 24))

API_HOST = os.environ.get('API_HOST', '0.0.0.0')
API_PORT = int(os.environ.get('API_PORT', 5000))
API_DEBUG = os.environ.get('API_DEBUG', 'False').lower() == 'true'
