from pydantic import BaseModel
from typing import Optional


class IMUData(BaseModel):
    accel: list[float]
    gyro: list[float]


class MagData(BaseModel):
    data: list[float]
    raw: list[float]


class MagCalibration(BaseModel):
    hard_iron: list[float]
    soft_iron: list[list[float]]
    is_calibrated: bool
    sample_count: int
    calibration_count: int


class RTKData(BaseModel):
    lat: float
    lon: float
    alt: float
    accuracy: float
    is_lost: bool = False


class EKFState(BaseModel):
    lat: float
    lon: float
    alt: float
    vel_n: float
    vel_e: float
    vel_d: float
    roll: float
    pitch: float
    yaw: float
    pos_covariance: list[list[float]]
    rtk_lost: bool = False
    rtk_lost_duration: float = 0.0
    confidence: float = 1.0
    confidence_level: str = "unknown"


class TrajectoryMessage(BaseModel):
    timestamp: float
    imu: IMUData
    mag: MagData
    rtk: RTKData
    ekf: EKFState
    mag_calibration: Optional[MagCalibration] = None


class ControlCommand(BaseModel):
    action: str
