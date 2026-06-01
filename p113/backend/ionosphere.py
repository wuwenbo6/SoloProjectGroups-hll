import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from datetime import datetime


class IonosphereCalculator:
    def __init__(self, obs_data=None, nav_data=None):
        self.obs_data = obs_data
        self.nav_data = nav_data
        self.L1_FREQ = 1575.42e6
        self.L2_FREQ = 1227.60e6
        self.LAMBDA_L1 = 0.1903
        self.LAMBDA_L2 = 0.2442
        self.GAMMA = (self.L1_FREQ / self.L2_FREQ) ** 2
        self.c = 299792458

    def calculate_stec_dual_freq(self, satellite: str) -> Dict:
        """
        双频载波相位组合计算斜向总电子含量（STEC）
        STEC = (f1^2 * f2^2) / (40.3 * (f1^2 - f2^2)) * (L1*λ1 - L2*λ2)
        """
        if self.obs_data is None:
            return {"stec_series": [], "avg_stec": 0, "max_stec": 0, "min_stec": 0}

        try:
            sat_data = self.obs_data.sel(sv=satellite)

            l1 = sat_data.L1.values if "L1" in sat_data else None
            l2 = sat_data.L2.values if "L2" in sat_data else None

            if l1 is None or l2 is None:
                return {"stec_series": [], "avg_stec": 0, "max_stec": 0, "min_stec": 0}

            valid_mask = ~np.isnan(l1) & ~np.isnan(l2)

            if not np.any(valid_mask):
                return {"stec_series": [], "avg_stec": 0, "max_stec": 0, "min_stec": 0}

            l1_valid = l1[valid_mask]
            l2_valid = l2[valid_mask]

            gf = l1_valid * self.LAMBDA_L1 - l2_valid * self.LAMBDA_L2

            constant = (self.L1_FREQ**2 * self.L2_FREQ**2) / (
                40.3 * (self.L1_FREQ**2 - self.L2_FREQ**2)
            )
            stec = constant * gf

            stec_series = stec.tolist()
            avg_stec = float(np.nanmean(stec)) if len(stec) > 0 else 0
            max_stec = float(np.nanmax(stec)) if len(stec) > 0 else 0
            min_stec = float(np.nanmin(stec)) if len(stec) > 0 else 0
            std_stec = float(np.nanstd(stec)) if len(stec) > 0 else 0

            return {
                "stec_series": stec_series,
                "gf_series": gf.tolist(),
                "avg_stec": avg_stec,
                "max_stec": max_stec,
                "min_stec": min_stec,
                "std_stec": std_stec,
                "unit": "TECU",
            }

        except Exception as e:
            print(f"计算STEC失败 {satellite}: {e}")
            return {"stec_series": [], "avg_stec": 0, "max_stec": 0, "min_stec": 0}

    def _calculate_ionospheric_delay_l1(self, stec: float, frequency: float = None) -> float:
        """
        由STEC计算L1频率的电离层延迟
        I = 40.3 * STEC / f^2
        """
        if frequency is None:
            frequency = self.L1_FREQ
        return 40.3 * stec / (frequency**2)

    def _klobuchar_model(
        self,
        time_gps: float,
        receiver_lat: float,
        receiver_lon: float,
        azimuth: float,
        elevation: float,
        alpha: np.ndarray,
        beta: np.ndarray,
    ) -> float:
        """
        Klobuchar电离层模型（用于单频接收机）
        """
        try:
            pi = np.pi

            elevation = elevation / 180.0
            azimuth = azimuth / 180.0

            psi = 0.0137 / (elevation + 0.11) - 0.022

            i_lat = receiver_lat + psi * np.cos(azimuth * pi)
            if i_lat > 0.416:
                i_lat = 0.416
            elif i_lat < -0.416:
                i_lat = -0.416

            i_lon = receiver_lon + psi * np.sin(azimuth * pi) / np.cos(i_lat * pi)

            geomagnetic_lat = i_lat + 0.064 * np.cos((i_lon - 1.617) * pi)

            t = 43200 * i_lon + time_gps
            if t >= 86400:
                t -= 86400
            elif t < 0:
                t += 86400

            amp = (
                alpha[0]
                + alpha[1] * geomagnetic_lat
                + alpha[2] * geomagnetic_lat**2
                + alpha[3] * geomagnetic_lat**3
            )
            if amp < 0:
                amp = 0

            per = (
                beta[0]
                + beta[1] * geomagnetic_lat
                + beta[2] * geomagnetic_lat**2
                + beta[3] * geomagnetic_lat**3
            )
            if per < 72000:
                per = 72000

            x = 2 * pi * (t - 50400) / per

            slant_factor = 1.0 + 16.0 * (0.53 - elevation) ** 3

            if abs(x) < 1.57:
                delay = (
                    5e-9 + amp * (1 - x**2 / 2 + x**4 / 24)
                ) * slant_factor
            else:
                delay = 5e-9 * slant_factor

            return delay * self.c

        except Exception as e:
            print(f"Klobuchar模型计算失败: {e}")
            return 0.0

    def calculate_ionospheric_delay(
        self,
        satellite: str,
        receiver_pos: Tuple[float, float, float] = None,
        alpha: np.ndarray = None,
        beta: np.ndarray = None,
    ) -> Dict:
        """
        综合计算电离层延迟
        - 有双频数据：使用双频组合法
        - 无双频数据但有星历：使用Klobuchar模型
        """
        if self.obs_data is None:
            return {"delay_series": [], "avg_delay": 0, "method": "none"}

        if receiver_pos is None:
            receiver_pos = (0.0, 0.0, 0.0)

        if alpha is None:
            alpha = np.array([0.1510e-07, 0.7451e-08, -0.1192e-06, -0.4840e-07])
        if beta is None:
            beta = np.array([0.1290e6, 0.1638e6, -0.2621e6, 0.3565e6])

        try:
            stec_result = self.calculate_stec_dual_freq(satellite)

            if stec_result["stec_series"]:
                method = "dual_frequency"
                delay_series = [
                    self._calculate_ionospheric_delay_l1(stec) for stec in stec_result["stec_series"]
                ]
            else:
                method = "klobuchar"
                delay_series = []

                try:
                    sat_data = self.obs_data.sel(sv=satellite)

                    from quality_calculator import QualityCalculator

                    qc = QualityCalculator(self.obs_data, self.nav_data)
                    pos_result = qc.calculate_satellite_elevation_azimuth(satellite, receiver_pos)

                    elevations = pos_result.get("elevation_series", [])
                    azimuths = pos_result.get("azimuth_series", [])

                    for i in range(len(elevations)):
                        t = (i + 1) * 30.0
                        delay = self._klobuchar_model(
                            t,
                            receiver_pos[0],
                            receiver_pos[1],
                            azimuths[i],
                            elevations[i],
                            alpha,
                            beta,
                        )
                        delay_series.append(delay)
                except:
                    pass

            avg_delay = float(np.nanmean(delay_series)) if delay_series else 0
            max_delay = float(np.nanmax(delay_series)) if delay_series else 0
            min_delay = float(np.nanmin(delay_series)) if delay_series else 0
            std_delay = float(np.nanstd(delay_series)) if delay_series else 0

            return {
                "delay_series": delay_series,
                "stec_series": stec_result["stec_series"],
                "avg_delay": avg_delay,
                "max_delay": max_delay,
                "min_delay": min_delay,
                "std_delay": std_delay,
                "avg_stec": stec_result["avg_stec"],
                "method": method,
                "unit": "meters",
            }

        except Exception as e:
            print(f"计算电离层延迟失败 {satellite}: {e}")
            import traceback

            traceback.print_exc()
            return {"delay_series": [], "avg_delay": 0, "method": "error"}

    def calculate_vtec(self, stec: float, elevation: float) -> float:
        """
        由STEC计算垂直总电子含量（VTEC）
        VTEC = STEC * cos(zenith_angle)
        """
        if elevation <= 0:
            return stec
        zenith = 90.0 - elevation
        zenith_rad = np.deg2rad(zenith)
        return stec * np.cos(zenith_rad)

    def analyze_ionosphere_activity(
        self, satellites: List[str], receiver_pos: Tuple[float, float, float] = None
    ) -> Dict:
        """
        综合分析电离层活动
        """
        results = {}

        for sat in satellites:
            iono_delay = self.calculate_ionospheric_delay(sat, receiver_pos)
            stec = self.calculate_stec_dual_freq(sat)

            results[sat] = {
                "ionospheric_delay": iono_delay,
                "stec": stec,
            }

        stec_values = []
        delay_values = []

        for sat, res in results.items():
            if res["stec"]["avg_stec"] > 0:
                stec_values.append(res["stec"]["avg_stec"])
            if res["ionospheric_delay"]["avg_delay"] > 0:
                delay_values.append(res["ionospheric_delay"]["avg_delay"])

        overall = {
            "avg_stec": float(np.nanmean(stec_values)) if stec_values else 0,
            "max_stec": float(np.nanmax(stec_values)) if stec_values else 0,
            "avg_delay": float(np.nanmean(delay_values)) if delay_values else 0,
            "max_delay": float(np.nanmax(delay_values)) if delay_values else 0,
            "activity_level": "normal",
        }

        if overall["avg_stec"] > 100 or overall["avg_delay"] > 0.5:
            overall["activity_level"] = "medium"
        if overall["avg_stec"] > 200 or overall["avg_delay"] > 1.0:
            overall["activity_level"] = "high"

        return {"per_satellite": results, "overall": overall}
