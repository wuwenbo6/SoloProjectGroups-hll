import asyncio
import json
import time
from datetime import datetime, timedelta
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from contextlib import asynccontextmanager

from ekf import ExtendedKalmanFilter
from simulator import TrajectorySimulator
from magnetometer import MagnetometerCalibrator
from models import TrajectoryMessage, IMUData, MagData, RTKData, EKFState, MagCalibration, ControlCommand

simulator = TrajectorySimulator()
ekf = ExtendedKalmanFilter()
mag_calibrator = MagnetometerCalibrator()
history = []
running = False
first_rtk = True
start_time = time.time()
calibration_interval = 50
step_count = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="IMU-RTK EKF Trajectory System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/history")
async def get_history(start: int = 0, end: int = -1):
    if end == -1:
        data = history[start:]
    else:
        data = history[start:end]
    return data


@app.post("/api/control")
async def control(cmd: ControlCommand):
    global running, first_rtk, simulator, ekf, mag_calibrator, history, start_time, step_count
    if cmd.action == "start":
        running = True
    elif cmd.action == "stop":
        running = False
    elif cmd.action == "reset":
        running = False
        first_rtk = True
        step_count = 0
        simulator.reset()
        ekf.reset()
        mag_calibrator.reset()
        history.clear()
        start_time = time.time()
    return {"status": "ok", "running": running}


def generate_kml(history_data):
    if not history_data:
        return ""

    base_time = datetime.now()
    ekf_coords = []
    rtk_coords = []

    for msg in history_data:
        t = base_time + timedelta(seconds=msg["timestamp"])
        when = t.strftime("%Y-%m-%dT%H:%M:%SZ")

        ekf_coords.append(
            f'{msg["ekf"]["lon"]:.8f},{msg["ekf"]["lat"]:.8f},{msg["ekf"]["alt"]:.2f}'
        )

        if not msg["rtk"]["is_lost"]:
            rtk_coords.append(
                f'{msg["rtk"]["lon"]:.8f},{msg["rtk"]["lat"]:.8f},{msg["rtk"]["alt"]:.2f}'
            )

    kml_template = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>EKF Trajectory Export</name>
    <description>IMU-RTK EKF Sensor Fusion Trajectory</description>

    <Style id="ekf_style">
      <LineStyle>
        <color>ffc8ff00</color>
        <width>4</width>
      </LineStyle>
      <PolyStyle>
        <color>40c8ff00</color>
      </PolyStyle>
    </Style>

    <Style id="rtk_style">
      <LineStyle>
        <color>ff356bff</color>
        <width>2</width>
      </LineStyle>
    </Style>

    <Placemark>
      <name>EKF Fusion Path</name>
      <styleUrl>#ekf_style</styleUrl>
      <LineString>
        <extrude>0</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
          {ekf_coordinates}
        </coordinates>
      </LineString>
    </Placemark>

    <Placemark>
      <name>RTK Measured Path</name>
      <styleUrl>#rtk_style</styleUrl>
      <LineString>
        <extrude>0</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
          {rtk_coordinates}
        </coordinates>
      </LineString>
    </Placemark>

  </Document>
</kml>"""

    return kml_template.format(
        ekf_coordinates="\n".join(ekf_coords),
        rtk_coordinates="\n".join(rtk_coords),
    )


@app.get("/api/export/kml")
async def export_kml():
    kml_content = generate_kml(history)
    if not kml_content:
        return {"error": "No data to export"}

    filename = f"trajectory_{datetime.now().strftime('%Y%m%d_%H%M%S')}.kml"
    return Response(
        content=kml_content,
        media_type="application/vnd.google-earth.kml+xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.websocket("/ws/trajectory")
async def ws_trajectory(websocket: WebSocket):
    global running, first_rtk, start_time, step_count
    await websocket.accept()
    running = True
    first_rtk = True
    start_time = time.time()
    step_count = 0
    dt = 0.05

    try:
        while True:
            if not running:
                await asyncio.sleep(0.1)
                continue

            sim_data = simulator.step(dt)
            step_count += 1

            imu_accel = sim_data["imu"]["accel"]
            imu_gyro = sim_data["imu"]["gyro"]
            rtk_data = sim_data["rtk"]
            mag_data = sim_data["mag"]

            mag_calibrator.add_sample(mag_data["raw"])
            if step_count % calibration_interval == 0 and len(mag_calibrator.samples) >= 20:
                mag_calibrator.calibrate()

            mag_corrected = mag_calibrator.correct(mag_data["data"])

            rtk_lost = rtk_data["is_lost"]

            if first_rtk and not rtk_lost:
                ekf.initialize_with_rtk(rtk_data["lat"], rtk_data["lon"], rtk_data["alt"])
                first_rtk = False
            elif not first_rtk:
                ekf.predict(imu_accel, imu_gyro, dt)

                ekf.set_rtk_lost(rtk_lost)

                if mag_calibrator.is_calibrated:
                    ekf.update_magnetometer(mag_corrected.tolist())

                if not rtk_lost:
                    ekf.update_rtk(
                        rtk_data["lat"],
                        rtk_data["lon"],
                        rtk_data["alt"],
                        rtk_data["accuracy"],
                    )

            ekf_state = ekf.get_state()
            timestamp = time.time() - start_time

            mag_cal = mag_calibrator.get_calibration_params()

            msg = TrajectoryMessage(
                timestamp=round(timestamp, 3),
                imu=IMUData(accel=imu_accel, gyro=imu_gyro),
                mag=MagData(data=mag_data["data"], raw=mag_data["raw"]),
                rtk=RTKData(
                    lat=rtk_data["lat"] if not rtk_lost else 0.0,
                    lon=rtk_data["lon"] if not rtk_lost else 0.0,
                    alt=rtk_data["alt"] if not rtk_lost else 0.0,
                    accuracy=rtk_data["accuracy"],
                    is_lost=rtk_lost,
                ),
                ekf=EKFState(
                    lat=ekf_state["lat"],
                    lon=ekf_state["lon"],
                    alt=ekf_state["alt"],
                    vel_n=ekf_state["vel_n"],
                    vel_e=ekf_state["vel_e"],
                    vel_d=ekf_state["vel_d"],
                    roll=ekf_state["roll"],
                    pitch=ekf_state["pitch"],
                    yaw=ekf_state["yaw"],
                    pos_covariance=ekf_state["pos_covariance"],
                    rtk_lost=ekf_state["rtk_lost"],
                    rtk_lost_duration=ekf_state["rtk_lost_duration"],
                    confidence=ekf_state["confidence"],
                    confidence_level=ekf_state["confidence_level"],
                ),
                mag_calibration=MagCalibration(
                    hard_iron=mag_cal["hard_iron"],
                    soft_iron=mag_cal["soft_iron"],
                    is_calibrated=mag_cal["is_calibrated"],
                    sample_count=mag_cal["sample_count"],
                    calibration_count=mag_cal["calibration_count"],
                ),
            )

            msg_dict = msg.model_dump()
            history.append(msg_dict)
            if len(history) > 100000:
                history.pop(0)

            await websocket.send_text(json.dumps(msg_dict))
            await asyncio.sleep(dt)

    except WebSocketDisconnect:
        running = False
    except Exception as e:
        print(f"WebSocket error: {e}")
        running = False


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
