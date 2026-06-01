import numpy as np

EARTH_RADIUS = 6371000.0
GRAVITY = 9.8


def lla_to_local(lat, lon, alt, ref_lat, ref_lon, ref_alt):
    dn = (lat - ref_lat) * np.pi / 180.0 * EARTH_RADIUS
    de = (lon - ref_lon) * np.pi / 180.0 * EARTH_RADIUS * np.cos(ref_lat * np.pi / 180.0)
    dd = -(alt - ref_alt)
    return np.array([dn, de, dd])


def local_to_lla(local_pos, ref_lat, ref_lon, ref_alt):
    dn, de, dd = local_pos[0], local_pos[1], local_pos[2]
    lat = ref_lat + dn / (EARTH_RADIUS * np.pi / 180.0)
    lon = ref_lon + de / (EARTH_RADIUS * np.cos(ref_lat * np.pi / 180.0) * np.pi / 180.0)
    alt = ref_alt - dd
    return lat, lon, alt


class ExtendedKalmanFilter:
    def __init__(self, ref_lat=39.9, ref_lon=116.4, ref_alt=50.0):
        self.ref_lat = ref_lat
        self.ref_lon = ref_lon
        self.ref_alt = ref_alt
        self.n = 15
        self.x = np.zeros(self.n)
        self.x[2] = ref_alt
        self.P = np.eye(self.n) * 1.0
        self.P[0, 0] = (10.0 / EARTH_RADIUS * 180.0 / np.pi) ** 2
        self.P[1, 1] = (10.0 / EARTH_RADIUS * 180.0 / np.pi) ** 2
        self.P[2, 2] = 10.0 ** 2
        self.P[3, 3] = 1.0 ** 2
        self.P[4, 4] = 1.0 ** 2
        self.P[5, 5] = 1.0 ** 2
        self.P[6, 6] = 0.1 ** 2
        self.P[7, 7] = 0.1 ** 2
        self.P[8, 8] = 0.1 ** 2
        self.P[9, 9] = 0.01 ** 2
        self.P[10, 10] = 0.01 ** 2
        self.P[11, 11] = 0.01 ** 2
        self.P[12, 12] = 0.001 ** 2
        self.P[13, 13] = 0.001 ** 2
        self.P[14, 14] = 0.001 ** 2
        self._Q_accel = 0.1 ** 2
        self._Q_gyro = 0.01 ** 2
        self._Q_accel_bias = (0.001) ** 2
        self._Q_gyro_bias = (0.0001) ** 2
        self._initialized = False
        self._rtk_lost = False
        self._rtk_lost_duration = 0.0
        self._max_rtk_lost_duration = 10.0
        self._inertial_only_Q_scale = 10.0

    def reset(self, lat=None, lon=None, alt=None):
        if lat is not None:
            self.ref_lat = lat
        if lon is not None:
            self.ref_lon = lon
        if alt is not None:
            self.ref_alt = alt
        self.x = np.zeros(self.n)
        self.x[0] = self.ref_lat
        self.x[1] = self.ref_lon
        self.x[2] = self.ref_alt
        self.P = np.eye(self.n) * 1.0
        self.P[0, 0] = (10.0 / EARTH_RADIUS * 180.0 / np.pi) ** 2
        self.P[1, 1] = (10.0 / EARTH_RADIUS * 180.0 / np.pi) ** 2
        self.P[2, 2] = 10.0 ** 2
        self.P[3, 3] = 1.0 ** 2
        self.P[4, 4] = 1.0 ** 2
        self.P[5, 5] = 1.0 ** 2
        self.P[6, 6] = 0.1 ** 2
        self.P[7, 7] = 0.1 ** 2
        self.P[8, 8] = 0.1 ** 2
        self.P[9, 9] = 0.01 ** 2
        self.P[10, 10] = 0.01 ** 2
        self.P[11, 11] = 0.01 ** 2
        self.P[12, 12] = 0.001 ** 2
        self.P[13, 13] = 0.001 ** 2
        self.P[14, 14] = 0.001 ** 2
        self._initialized = False

    def _rotation_body_to_nav(self, roll, pitch, yaw):
        cr, sr = np.cos(roll), np.sin(roll)
        cp, sp = np.cos(pitch), np.sin(pitch)
        cy, sy = np.cos(yaw), np.sin(yaw)
        R = np.array([
            [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
            [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
            [-sp, cp * sr, cp * cr],
        ])
        return R

    def predict(self, imu_accel, imu_gyro, dt):
        if not self._initialized:
            self._initialized = True
            return

        ax_b, ay_b, az_b = imu_accel[0] - self.x[9], imu_accel[1] - self.x[10], imu_accel[2] - self.x[11]
        wx_b, wy_b, wz_b = imu_gyro[0] - self.x[12], imu_gyro[1] - self.x[13], imu_gyro[2] - self.x[14]

        roll = self.x[6]
        pitch = self.x[7]
        yaw = self.x[8]

        R_bn = self._rotation_body_to_nav(roll, pitch, yaw)
        accel_nav = R_bn @ np.array([ax_b, ay_b, az_b])
        accel_nav[2] -= GRAVITY

        vn, ve, vd = self.x[3], self.x[4], self.x[5]
        lat_rad = self.x[0] * np.pi / 180.0
        rn = EARTH_RADIUS
        re = EARTH_RADIUS * np.cos(lat_rad)

        dlat = vn / rn * 180.0 / np.pi * dt
        dlon = ve / re * 180.0 / np.pi * dt
        dalt = -vd * dt

        self.x[0] += dlat
        self.x[1] += dlon
        self.x[2] += dalt
        self.x[3] += accel_nav[0] * dt
        self.x[4] += accel_nav[1] * dt
        self.x[5] += accel_nav[2] * dt

        roll_new = roll + (wx_b + wy_b * np.sin(roll) * np.tan(pitch) + wz_b * np.cos(roll) * np.tan(pitch)) * dt
        pitch_new = pitch + (wy_b * np.cos(roll) - wz_b * np.sin(roll)) * dt
        yaw_new = yaw + (wy_b * np.sin(roll) / np.cos(pitch) + wz_b * np.cos(roll) / np.cos(pitch)) * dt

        self.x[6] = roll_new
        self.x[7] = pitch_new
        self.x[8] = yaw_new

        F = np.eye(self.n)
        F[0, 3] = dt / rn * 180.0 / np.pi
        F[1, 4] = dt / re * 180.0 / np.pi
        F[2, 5] = -dt
        F[3, 6] = 0.0
        F[3, 7] = 0.0
        F[3, 8] = 0.0
        F[4, 6] = 0.0
        F[4, 7] = 0.0
        F[4, 8] = 0.0
        F[5, 6] = 0.0
        F[5, 7] = 0.0
        F[5, 8] = 0.0

        F[3, 9] = -R_bn[0, 0] * dt
        F[3, 10] = -R_bn[0, 1] * dt
        F[3, 11] = -R_bn[0, 2] * dt
        F[4, 9] = -R_bn[1, 0] * dt
        F[4, 10] = -R_bn[1, 1] * dt
        F[4, 11] = -R_bn[1, 2] * dt
        F[5, 9] = -R_bn[2, 0] * dt
        F[5, 10] = -R_bn[2, 1] * dt
        F[5, 11] = -R_bn[2, 2] * dt

        cp = np.cos(pitch)
        sp_val = np.sin(pitch)
        cr_val = np.cos(roll)
        sr_val = np.sin(roll)
        if abs(cp) > 1e-6:
            F[6, 12] = dt
            F[6, 13] = sr_val * np.tan(pitch) * dt
            F[6, 14] = cr_val * np.tan(pitch) * dt
            F[7, 13] = cr_val * dt
            F[7, 14] = -sr_val * dt
            F[8, 13] = sr_val / cp * dt
            F[8, 14] = cr_val / cp * dt

        Q = np.zeros((self.n, self.n))
        Q[3, 3] = self._Q_accel * dt ** 2
        Q[4, 4] = self._Q_accel * dt ** 2
        Q[5, 5] = self._Q_accel * dt ** 2
        Q[6, 6] = self._Q_gyro * dt ** 2
        Q[7, 7] = self._Q_gyro * dt ** 2
        Q[8, 8] = self._Q_gyro * dt ** 2
        Q[9, 9] = self._Q_accel_bias * dt
        Q[10, 10] = self._Q_accel_bias * dt
        Q[11, 11] = self._Q_accel_bias * dt
        Q[12, 12] = self._Q_gyro_bias * dt
        Q[13, 13] = self._Q_gyro_bias * dt
        Q[14, 14] = self._Q_gyro_bias * dt

        if self._rtk_lost:
            self._rtk_lost_duration += dt
            decay = min(self._inertial_only_Q_scale, 1.0 + self._rtk_lost_duration * 2.0)
            Q *= decay
            Q[0, 0] = (0.5 * decay / EARTH_RADIUS * 180.0 / np.pi) ** 2 * dt ** 2
            Q[1, 1] = (0.5 * decay / EARTH_RADIUS * 180.0 / np.pi) ** 2 * dt ** 2
            Q[2, 2] = (0.5 * decay) ** 2 * dt ** 2

        self.P = F @ self.P @ F.T + Q

    def update_rtk(self, rtk_lat, rtk_lon, rtk_alt, rtk_accuracy=0.02):
        H = np.zeros((3, self.n))
        H[0, 0] = 1.0
        H[1, 1] = 1.0
        H[2, 2] = 1.0

        z = np.array([rtk_lat, rtk_lon, rtk_alt])
        z_pred = np.array([self.x[0], self.x[1], self.x[2]])
        y = z - z_pred

        R = np.eye(3)
        lat_scale = EARTH_RADIUS * np.pi / 180.0
        lon_scale = EARTH_RADIUS * np.cos(self.x[0] * np.pi / 180.0) * np.pi / 180.0
        R[0, 0] = (rtk_accuracy / lat_scale) ** 2
        R[1, 1] = (rtk_accuracy / lon_scale) ** 2
        R[2, 2] = rtk_accuracy ** 2

        S = H @ self.P @ H.T + R
        K = self.P @ H.T @ np.linalg.inv(S)

        self.x = self.x + K @ y

        I_KH = np.eye(self.n) - K @ H
        self.P = I_KH @ self.P @ I_KH.T + K @ R @ K.T

        self._rtk_lost = False
        self._rtk_lost_duration = 0.0

    def set_rtk_lost(self, lost):
        if lost and not self._rtk_lost:
            self._rtk_lost = True
            self._rtk_lost_duration = 0.0
        elif not lost:
            self._rtk_lost = False
            self._rtk_lost_duration = 0.0

    def update_magnetometer(self, mag_corrected, reference_field=None):
        if reference_field is None:
            reference_field = np.array([20.0, -10.0, 40.0])

        roll = self.x[6]
        pitch = self.x[7]
        yaw = self.x[8]

        mag_pred_yaw = np.arctan2(
            mag_corrected[0] * np.cos(roll) + mag_corrected[1] * np.sin(roll) * np.sin(pitch) - mag_corrected[2] * np.sin(roll) * np.cos(pitch),
            mag_corrected[1] * np.cos(pitch) + mag_corrected[2] * np.sin(pitch),
        )

        yaw_diff = mag_pred_yaw - yaw
        while yaw_diff > np.pi:
            yaw_diff -= 2 * np.pi
        while yaw_diff < -np.pi:
            yaw_diff += 2 * np.pi

        H = np.zeros((1, self.n))
        H[0, 8] = 1.0

        R_mag = np.eye(1) * (0.1 ** 2)

        S = H @ self.P @ H.T + R_mag
        K = self.P @ H.T @ np.linalg.inv(S)

        self.x = self.x + (K @ np.array([yaw_diff])).flatten()

        I_KH = np.eye(self.n) - K @ H
        self.P = I_KH @ self.P @ I_KH.T + K @ R_mag @ K.T

    def get_confidence(self):
        if not self._initialized:
            return 1.0, "unknown"
        if self._rtk_lost:
            if self._rtk_lost_duration < 2.0:
                return 0.5, "degraded"
            elif self._rtk_lost_duration < 5.0:
                return 0.2, "low"
            else:
                return 0.05, "critical"
        lat_std = np.sqrt(max(0, self.P[0, 0]))
        lon_std = np.sqrt(max(0, self.P[1, 1]))
        h_std_m = np.sqrt(lat_std ** 2 + lon_std ** 2) * EARTH_RADIUS * np.pi / 180.0
        if h_std_m < 0.05:
            return 1.0, "high"
        elif h_std_m < 0.5:
            return 0.8, "good"
        elif h_std_m < 2.0:
            return 0.5, "moderate"
        else:
            return 0.2, "low"

    def get_state(self):
        pos_cov_3x3 = self.P[0:3, 0:3].tolist()
        confidence, confidence_level = self.get_confidence()
        return {
            "lat": float(self.x[0]),
            "lon": float(self.x[1]),
            "alt": float(self.x[2]),
            "vel_n": float(self.x[3]),
            "vel_e": float(self.x[4]),
            "vel_d": float(self.x[5]),
            "roll": float(self.x[6]),
            "pitch": float(self.x[7]),
            "yaw": float(self.x[8]),
            "pos_covariance": pos_cov_3x3,
            "rtk_lost": self._rtk_lost,
            "rtk_lost_duration": float(self._rtk_lost_duration),
            "confidence": float(confidence),
            "confidence_level": confidence_level,
        }

    def initialize_with_rtk(self, lat, lon, alt):
        self.x[0] = lat
        self.x[1] = lon
        self.x[2] = alt
        self.x[3] = 0.0
        self.x[4] = 0.0
        self.x[5] = 0.0
        self.x[6] = 0.0
        self.x[7] = 0.0
        self.x[8] = 0.0
        self._initialized = True
        self.P[0, 0] = (0.5 / EARTH_RADIUS * 180.0 / np.pi) ** 2
        self.P[1, 1] = (0.5 / EARTH_RADIUS * 180.0 / np.pi) ** 2
        self.P[2, 2] = 0.5 ** 2
