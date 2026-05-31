from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime

from app.models.sensor import SensorData, LevelCalculationResult
from app.models.tank import TankStatus
from app.services.tank_service import TankService, get_tank_service
from app.services.alert_service import AlertService, get_alert_service
from app.services.calibration_service import CalibrationService, get_calibration_service
from app.database.influxdb import InfluxDBManager, get_influx_db
from app.utils.temperature_compensation import calculate_liquid_level, TemperatureCompensatedUltrasonic

router = APIRouter(prefix="/api/sensor", tags=["sensor"])


@router.post("/data", response_model=LevelCalculationResult)
async def receive_sensor_data(
    sensor_data: SensorData,
    tank_service: TankService = Depends(get_tank_service),
    alert_service: AlertService = Depends(get_alert_service),
    calib_service: CalibrationService = Depends(get_calibration_service),
    influx_db: InfluxDBManager = Depends(get_influx_db)
):
    tank = tank_service.get_tank(sensor_data.tank_id)
    if not tank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tank with id {sensor_data.tank_id} not found"
        )
    
    result = calculate_liquid_level(
        echo_time=sensor_data.echo_time,
        temperature=sensor_data.temperature,
        sensor_height=tank.sensor_height,
        tank_max_height=tank.max_height
    )
    
    calibrated_level = calib_service.apply_calibration_to_level(
        result["level"],
        tank.calibration_offset,
        tank.calibration_scale
    )
    calibrated_level = max(0.0, min(calibrated_level, tank.max_height))
    
    result["raw_level"] = result["level"]
    result["level"] = round(calibrated_level, 4)
    result["percentage"] = round((calibrated_level / tank.max_height) * 100, 2)
    
    updated_tank = tank_service.update_tank_level(
        tank_id=sensor_data.tank_id,
        level=result["level"],
        temperature=sensor_data.temperature
    )
    
    if updated_tank and updated_tank.status == TankStatus.ALARM:
        await alert_service.send_alert(
            tank_name=tank.name,
            tank_id=tank.id,
            level=result["level"],
            status=updated_tank.status,
            temperature=sensor_data.temperature
        )
    
    try:
        influx_db.write_liquid_level(
            tank_id=sensor_data.tank_id,
            level=result["level"],
            temperature=sensor_data.temperature,
            echo_time=sensor_data.echo_time
        )
        
        if sensor_data.waveform:
            influx_db.write_echo_waveform(
                tank_id=sensor_data.tank_id,
                waveform=sensor_data.waveform
            )
    except Exception as e:
        print(f"Error writing to InfluxDB: {e}")
    
    return LevelCalculationResult(
        tank_id=sensor_data.tank_id,
        echo_time=sensor_data.echo_time,
        temperature=sensor_data.temperature,
        sound_speed=result["sound_speed"],
        distance=result["distance"],
        level=result["level"],
        percentage=result["percentage"],
        timestamp=datetime.utcnow()
    )


@router.get("/waveform/{tank_id}")
def get_latest_waveform(
    tank_id: str,
    tank_service: TankService = Depends(get_tank_service),
    influx_db: InfluxDBManager = Depends(get_influx_db)
):
    tank = tank_service.get_tank(tank_id)
    if not tank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tank with id {tank_id} not found"
        )
    
    waveform_data = influx_db.query_latest_waveform(tank_id)
    if not waveform_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No waveform data found"
        )
    
    return {
        "tank_id": tank_id,
        "waveform": waveform_data["waveform"],
        "timestamp": waveform_data["time"]
    }


@router.get("/simulate/{tank_id}")
async def simulate_sensor_data(
    tank_id: str,
    tank_service: TankService = Depends(get_tank_service),
    alert_service: AlertService = Depends(get_alert_service),
    influx_db: InfluxDBManager = Depends(get_influx_db)
):
    import random
    import math
    
    tank = tank_service.get_tank(tank_id)
    if not tank:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tank with id {tank_id} not found"
        )
    
    target_level = tank.max_height * 0.6
    current_level = tank.current_level or target_level
    
    level_change = random.uniform(-0.05, 0.05)
    new_level = current_level + level_change
    new_level = max(tank.min_level * 0.5, min(new_level, tank.max_level * 1.1))
    
    distance = tank.sensor_height - new_level
    temperature = random.uniform(20.0, 30.0)
    sound_speed = TemperatureCompensatedUltrasonic.calculate_sound_speed(temperature)
    echo_time = (2 * distance) / sound_speed
    
    waveform = []
    for i in range(100):
        if i < 20:
            val = random.uniform(0, 0.1)
        elif i < 30:
            val = math.sin((i - 20) * math.pi / 10) * 0.8 + random.uniform(-0.1, 0.1)
        else:
            val = math.exp(-(i - 30) / 20) * 0.5 + random.uniform(-0.05, 0.05)
        waveform.append(max(0, val))
    
    sensor_data = SensorData(
        tank_id=tank_id,
        echo_time=echo_time,
        temperature=temperature,
        waveform=waveform
    )
    
    return await receive_sensor_data(sensor_data, tank_service, alert_service, influx_db)
