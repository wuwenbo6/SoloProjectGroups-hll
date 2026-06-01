import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'pollution_simulation.db')}")

API_V1_STR = "/api/v1"
PROJECT_NAME = "Pollution Diffusion Simulation API"

GRID_RESOLUTION = 0.001
SIMULATION_DURATION_HOURS = 24
TIME_STEP_MINUTES = 15
