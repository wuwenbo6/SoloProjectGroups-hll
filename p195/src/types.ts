export interface IMUData {
  accel: [number, number, number];
  gyro: [number, number, number];
}

export interface MagData {
  data: [number, number, number];
  raw: [number, number, number];
}

export interface MagCalibration {
  hard_iron: [number, number, number];
  soft_iron: number[][];
  is_calibrated: boolean;
  sample_count: number;
  calibration_count: number;
}

export interface RTKData {
  lat: number;
  lon: number;
  alt: number;
  accuracy: number;
  is_lost: boolean;
}

export interface EKFState {
  lat: number;
  lon: number;
  alt: number;
  vel_n: number;
  vel_e: number;
  vel_d: number;
  roll: number;
  pitch: number;
  yaw: number;
  pos_covariance: number[][];
  rtk_lost: boolean;
  rtk_lost_duration: number;
  confidence: number;
  confidence_level: string;
}

export interface TrajectoryMessage {
  timestamp: number;
  imu: IMUData;
  mag: MagData;
  rtk: RTKData;
  ekf: EKFState;
  mag_calibration: MagCalibration | null;
}

export type Point = [number, number];
