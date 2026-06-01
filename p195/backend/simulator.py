import numpy as np


class TrajectorySimulator:
    EARTH_RADIUS = 6371000.0

    def __init__(
        self,
        origin_lat=39.9,
        origin_lon=116.4,
        origin_alt=50.0,
        path_radius=500.0,
        angular_rate=0.06,
        accel_noise_std=0.1,
        gyro_noise_std=0.01,
        accel_bias_std=0.01,
        gyro_bias_std=0.001,
        rtk_position_std=0.02,
        rtk_float_std=0.5,
        rtk_float_probability=0.05,
        rtk_loss_probability=0.02,
        rtk_loss_duration_range=(0.5, 3.0),
        mag_noise_std=0.5,
        mag_bias_std=2.0,
        mag_hard_iron_std=5.0,
        mag_soft_iron_scale=0.15,
    ):
        self.origin_lat = origin_lat
        self.origin_lon = origin_lon
        self.origin_alt = origin_alt
        self.R = path_radius
        self.omega = angular_rate
        self.accel_noise_std = accel_noise_std
        self.gyro_noise_std = gyro_noise_std
        self.accel_bias_std = accel_bias_std
        self.gyro_bias_std = gyro_bias_std
        self.rtk_position_std = rtk_position_std
        self.rtk_float_std = rtk_float_std
        self.rtk_float_probability = rtk_float_probability
        self.rtk_loss_probability = rtk_loss_probability
        self.rtk_loss_duration_range = rtk_loss_duration_range
        self.mag_noise_std = mag_noise_std
        self.mag_bias_std = mag_bias_std
        self.mag_hard_iron_std = mag_hard_iron_std
        self.mag_soft_iron_scale = mag_soft_iron_scale
        self.g = 9.8
        self.reference_mag_field = np.array([20.0, -10.0, 40.0])
        self._rtk_lost = False
        self._rtk_loss_remaining = 0.0
        self._init_rtk_loss_check = False
        self.t = 0.0
        self.rng = np.random.default_rng()
        self._draw_biases()
        self._draw_mag_distortion()

    def _draw_biases(self):
        self._accel_bias = self.rng.normal(0, self.accel_bias_std, 3)
        self._gyro_bias = self.rng.normal(0, self.gyro_bias_std, 3)

    def _draw_mag_distortion(self):
        self._mag_hard_iron = self.rng.normal(0, self.mag_hard_iron_std, 3)
        s = 1.0 + self.rng.normal(0, self.mag_soft_iron_scale, (3, 3))
        self._mag_soft_iron = 0.5 * (s + s.T)
        np.fill_diagonal(self._mag_soft_iron, 1.0 + self.rng.normal(0, self.mag_soft_iron_scale, 3))

    def reset(self):
        self.t = 0.0
        self._rtk_lost = False
        self._rtk_loss_remaining = 0.0
        self._init_rtk_loss_check = False
        self.rng = np.random.default_rng()
        self._draw_biases()
        self._draw_mag_distortion()

    def _true_enu(self, t):
        east = self.R * np.sin(self.omega * t)
        north = self.R * np.sin(2.0 * self.omega * t) / 2.0
        up = 0.0
        return np.array([east, north, up])

    def _true_velocity_enu(self, t):
        v_east = self.R * self.omega * np.cos(self.omega * t)
        v_north = self.R * self.omega * np.cos(2.0 * self.omega * t)
        v_up = 0.0
        return np.array([v_east, v_north, v_up])

    def _true_accel_enu(self, t):
        a_east = -self.R * self.omega ** 2 * np.sin(self.omega * t)
        a_north = -2.0 * self.R * self.omega ** 2 * np.sin(2.0 * self.omega * t)
        a_up = 0.0
        return np.array([a_east, a_north, a_up])

    def _heading(self, vel_enu):
        return np.arctan2(vel_enu[0], vel_enu[1])

    def _yaw_rate(self, vel_enu, accel_enu):
        ve, vn = vel_enu[0], vel_enu[1]
        ae, an = accel_enu[0], accel_enu[1]
        speed_sq = ve ** 2 + vn ** 2
        if speed_sq < 1e-12:
            return 0.0
        return (vn * ae - ve * an) / speed_sq

    def _rotation_nav_to_body(self, yaw):
        c, s = np.cos(yaw), np.sin(yaw)
        return np.array([[c, s, 0.0], [-s, c, 0.0], [0.0, 0.0, 1.0]])

    def _enu_to_lla(self, enu):
        lat = self.origin_lat + np.degrees(enu[1] / self.EARTH_RADIUS)
        lon = self.origin_lon + np.degrees(
            enu[0] / (self.EARTH_RADIUS * np.cos(np.radians(self.origin_lat)))
        )
        alt = self.origin_alt + enu[2]
        return lat, lon, alt

    def step(self, dt):
        self.t += dt
        t = self.t

        pos_enu = self._true_enu(t)
        vel_enu = self._true_velocity_enu(t)
        accel_enu = self._true_accel_enu(t)

        yaw = self._heading(vel_enu)
        yaw_rate = self._yaw_rate(vel_enu, accel_enu)

        R_nav_body = self._rotation_nav_to_body(yaw)

        specific_force_nav = np.array(
            [accel_enu[0], accel_enu[1], accel_enu[2] + self.g]
        )
        accel_body = R_nav_body @ specific_force_nav

        gyro_true = np.array([0.0, 0.0, yaw_rate])

        accel_meas = accel_body + self._accel_bias + self.rng.normal(
            0, self.accel_noise_std, 3
        )
        gyro_meas = gyro_true + self._gyro_bias + self.rng.normal(
            0, self.gyro_noise_std, 3
        )

        true_lat, true_lon, true_alt = self._enu_to_lla(pos_enu)

        if not self._init_rtk_loss_check:
            self._init_rtk_loss_check = True
            self._rtk_lost = False
            self._rtk_loss_remaining = 0.0

        if self._rtk_lost:
            self._rtk_loss_remaining -= dt
            if self._rtk_loss_remaining <= 0:
                self._rtk_lost = False
                self._rtk_loss_remaining = 0.0
        else:
            if self.rng.random() < self.rtk_loss_probability * dt:
                self._rtk_lost = True
                low, high = self.rtk_loss_duration_range
                self._rtk_loss_remaining = low + self.rng.random() * (high - low)

        if self._rtk_lost:
            rtk_lat = 0.0
            rtk_lon = 0.0
            rtk_alt = 0.0
            rtk_std = -1.0
            is_float = False
        else:
            is_float = self.rng.random() < self.rtk_float_probability
            rtk_std = self.rtk_float_std if is_float else self.rtk_position_std
            pos_noise_enu = self.rng.normal(0, rtk_std, 3)
            rtk_pos_enu = pos_enu + pos_noise_enu
            rtk_lat, rtk_lon, rtk_alt = self._enu_to_lla(rtk_pos_enu)

        mag_nav = self.reference_mag_field.copy()
        R_nav_body = self._rotation_nav_to_body(yaw)
        mag_body_ideal = R_nav_body @ mag_nav
        mag_body_distorted = self._mag_soft_iron @ mag_body_ideal + self._mag_hard_iron
        mag_meas = mag_body_distorted + self.rng.normal(0, self.mag_noise_std, 3)

        speed = np.linalg.norm(vel_enu[:2])

        return {
            "imu": {
                "accel": accel_meas.tolist(),
                "gyro": gyro_meas.tolist(),
            },
            "mag": {
                "data": mag_meas.tolist(),
                "raw": mag_body_distorted.tolist(),
            },
            "rtk": {
                "lat": rtk_lat,
                "lon": rtk_lon,
                "alt": rtk_alt,
                "accuracy": rtk_std,
                "is_float": is_float,
                "is_lost": self._rtk_lost,
            },
            "true_state": {
                "lat": true_lat,
                "lon": true_lon,
                "alt": true_alt,
                "east": pos_enu[0],
                "north": pos_enu[1],
                "up": pos_enu[2],
                "ve": vel_enu[0],
                "vn": vel_enu[1],
                "vu": vel_enu[2],
                "speed": speed,
                "yaw": yaw,
                "yaw_rate": yaw_rate,
            },
        }
