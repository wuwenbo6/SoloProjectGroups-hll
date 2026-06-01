import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from datetime import datetime


class QualityCalculator:
    def __init__(self, obs_data=None, nav_data=None):
        self.obs_data = obs_data
        self.nav_data = nav_data
        self.L1_FREQ = 1575.42e6
        self.L2_FREQ = 1227.60e6
        self.LAMBDA_L1 = 0.1903
        self.LAMBDA_L2 = 0.2442
        self.GAMMA = (self.L1_FREQ / self.L2_FREQ) ** 2

    def _get_satellite_elevations(self, satellite: str, receiver_pos: Tuple[float, float, float]) -> np.ndarray:
        """获取卫星仰角序列用于多路径校正"""
        if self.nav_data is None:
            return None

        try:
            import pymap3d as pm

            elevations = []
            for time_idx in range(len(self.obs_data.time)):
                try:
                    time = self.obs_data.time.values[time_idx]
                    sat_ephem = self.nav_data.sel(sv=satellite).interp(time=time, method="nearest")

                    if np.isnan(sat_ephem.SqrtA.values):
                        elevations.append(np.nan)
                        continue

                    t = (pd.Timestamp(time) - pd.Timestamp(time).normalize()).total_seconds()
                    x, y, z = self._calculate_sat_position(t, sat_ephem)

                    if x is None:
                        elevations.append(np.nan)
                        continue

                    _, el, _ = pm.ecef2aer(x, y, z, receiver_pos[0], receiver_pos[1], receiver_pos[2])
                    elevations.append(float(el))
                except:
                    elevations.append(np.nan)

            return np.array(elevations)
        except:
            return None

    def _calculate_sat_position(self, t, ephem):
        """计算卫星位置"""
        try:
            sqrtA = ephem.SqrtA.values
            e = ephem.Eccentricity.values
            omega = ephem.omega.values
            Omega0 = ephem.Omega0.values
            i0 = ephem.Io.values
            M0 = ephem.M0.values
            delta_n = ephem.DeltaN.values
            i_dot = ephem.IDOT.values
            omega_dot = ephem.OmegaDot.values
            Cuc = ephem.Cuc.values
            Cus = ephem.Cus.values
            Crc = ephem.Crc.values
            Crs = ephem.Crs.values
            Cic = ephem.Cic.values
            Cis = ephem.Cis.values
            toe = ephem.Toe.values

            GM = 3.986005e14
            OMEGA_E_DOT = 7.2921151467e-5

            A = sqrtA * sqrtA
            n0 = np.sqrt(GM / (A * A * A))
            t_k = t - toe

            if t_k > 302400:
                t_k -= 604800
            elif t_k < -302400:
                t_k += 604800

            n = n0 + delta_n
            M_k = M0 + n * t_k

            E_k = M_k
            for _ in range(10):
                E_k_new = M_k + e * np.sin(E_k)
                if abs(E_k_new - E_k) < 1e-12:
                    break
                E_k = E_k_new

            nu_k = np.arctan2(np.sqrt(1 - e * e) * np.sin(E_k), np.cos(E_k) - e)
            phi_k = nu_k + omega

            delta_u_k = Cus * np.sin(2 * phi_k) + Cuc * np.cos(2 * phi_k)
            delta_r_k = Crs * np.sin(2 * phi_k) + Crc * np.cos(2 * phi_k)
            delta_i_k = Cis * np.sin(2 * phi_k) + Cic * np.cos(2 * phi_k)

            u_k = phi_k + delta_u_k
            r_k = A * (1 - e * np.cos(E_k)) + delta_r_k
            i_k = i0 + delta_i_k + i_dot * t_k

            x_k_prime = r_k * np.cos(u_k)
            y_k_prime = r_k * np.sin(u_k)

            Omega_k = Omega0 + (omega_dot - OMEGA_E_DOT) * t_k - OMEGA_E_DOT * toe

            x_k = x_k_prime * np.cos(Omega_k) - y_k_prime * np.cos(i_k) * np.sin(Omega_k)
            y_k = x_k_prime * np.sin(Omega_k) + y_k_prime * np.cos(i_k) * np.cos(Omega_k)
            z_k = y_k_prime * np.sin(i_k)

            return x_k, y_k, z_k
        except:
            return None, None, None

    def _elevation_correction_factor(self, elevation_deg: float) -> float:
        """
        仰角校正因子
        基于经验模型：低仰角时多路径误差本身就大，需要校正
        使用指数衰减模型模拟多路径随仰角的变化
        """
        if np.isnan(elevation_deg) or elevation_deg <= 0:
            return 1.0

        el_rad = np.deg2rad(elevation_deg)
        sin_el = np.sin(el_rad)

        if sin_el <= 0:
            return 1.0

        mp_model = 0.5 / sin_el
        correction = 1.0 / (1.0 + mp_model * 0.3)

        return max(0.3, min(1.0, correction))

    def calculate_multipath(self, satellite: str, receiver_pos: Tuple[float, float, float] = None) -> Dict:
        if self.obs_data is None:
            return {"mp1": [], "mp2": [], "avg_mp1": 0, "avg_mp2": 0, "max_mp1": 0, "max_mp2": 0}

        try:
            sat_data = self.obs_data.sel(sv=satellite)

            c1 = sat_data.C1.values if "C1" in sat_data else None
            p1 = sat_data.P1.values if "P1" in sat_data else None
            p2 = sat_data.P2.values if "P2" in sat_data else None
            l1 = sat_data.L1.values if "L1" in sat_data else None
            l2 = sat_data.L2.values if "L2" in sat_data else None

            mp1_series = []
            mp2_series = []
            mp1_raw_series = []
            mp2_raw_series = []

            elevations = None
            if receiver_pos is not None and self.nav_data is not None:
                elevations = self._get_satellite_elevations(satellite, receiver_pos)

            if c1 is not None and l1 is not None and l2 is not None:
                valid_mask = ~np.isnan(c1) & ~np.isnan(l1) & ~np.isnan(l2)

                if np.any(valid_mask):
                    c1_valid = c1[valid_mask]
                    l1_valid = l1[valid_mask]
                    l2_valid = l2[valid_mask]

                    mp1 = c1_valid - (
                        (self.L2_FREQ**2 * l1_valid * self.LAMBDA_L1 - self.L1_FREQ**2 * l2_valid * self.LAMBDA_L2)
                        / (self.L2_FREQ**2 - self.L1_FREQ**2)
                    )
                    mp1 = mp1 - np.nanmean(mp1)
                    mp1_raw_series = mp1.tolist()

                    if elevations is not None:
                        el_valid = elevations[valid_mask]
                        correction_factors = np.array([self._elevation_correction_factor(el) for el in el_valid])
                        mp1_corrected = mp1 * correction_factors
                        mp1_series = mp1_corrected.tolist()
                    else:
                        mp1_series = mp1_raw_series

            if p2 is not None and l1 is not None and l2 is not None:
                valid_mask = ~np.isnan(p2) & ~np.isnan(l1) & ~np.isnan(l2)

                if np.any(valid_mask):
                    p2_valid = p2[valid_mask]
                    l1_valid = l1[valid_mask]
                    l2_valid = l2[valid_mask]

                    mp2 = p2_valid - (
                        (self.L2_FREQ**2 * l1_valid * self.LAMBDA_L1 - self.L1_FREQ**2 * l2_valid * self.LAMBDA_L2)
                        / (self.L2_FREQ**2 - self.L1_FREQ**2)
                    )
                    mp2 = mp2 - np.nanmean(mp2)
                    mp2_raw_series = mp2.tolist()

                    if elevations is not None:
                        el_valid = elevations[valid_mask]
                        correction_factors = np.array([self._elevation_correction_factor(el) for el in el_valid])
                        mp2_corrected = mp2 * correction_factors
                        mp2_series = mp2_corrected.tolist()
                    else:
                        mp2_series = mp2_raw_series

            avg_mp1 = np.nanmean(np.abs(mp1_series)) if mp1_series else 0
            avg_mp2 = np.nanmean(np.abs(mp2_series)) if mp2_series else 0
            max_mp1 = np.nanmax(np.abs(mp1_series)) if mp1_series else 0
            max_mp2 = np.nanmax(np.abs(mp2_series)) if mp2_series else 0

            return {
                "mp1_series": mp1_series,
                "mp2_series": mp2_series,
                "mp1_raw_series": mp1_raw_series,
                "mp2_raw_series": mp2_raw_series,
                "avg_mp1": float(avg_mp1),
                "avg_mp2": float(avg_mp2),
                "max_mp1": float(max_mp1),
                "max_mp2": float(max_mp2),
                "avg_multipath": float(max(avg_mp1, avg_mp2)),
                "max_multipath": float(max(max_mp1, max_mp2)),
                "elevation_corrected": elevations is not None,
            }

        except Exception as e:
            print(f"计算多路径误差失败 {satellite}: {e}")
            return {"mp1_series": [], "mp2_series": [], "avg_mp1": 0, "avg_mp2": 0, "max_mp1": 0, "max_mp2": 0}

    def calculate_snr(self, satellite: str) -> Dict:
        if self.obs_data is None:
            return {"snr1": [], "snr2": [], "avg_snr1": 0, "avg_snr2": 0, "min_snr1": 0, "min_snr2": 0}

        try:
            sat_data = self.obs_data.sel(sv=satellite)

            snr1 = sat_data.S1.values if "S1" in sat_data else None
            snr2 = sat_data.S2.values if "S2" in sat_data else None

            snr1_series = []
            snr2_series = []

            if snr1 is not None:
                valid_mask = ~np.isnan(snr1)
                if np.any(valid_mask):
                    snr1_series = snr1[valid_mask].tolist()

            if snr2 is not None:
                valid_mask = ~np.isnan(snr2)
                if np.any(valid_mask):
                    snr2_series = snr2[valid_mask].tolist()

            avg_snr1 = np.nanmean(snr1_series) if snr1_series else 0
            avg_snr2 = np.nanmean(snr2_series) if snr2_series else 0
            min_snr1 = np.nanmin(snr1_series) if snr1_series else 0
            min_snr2 = np.nanmin(snr2_series) if snr2_series else 0

            return {
                "snr1_series": snr1_series,
                "snr2_series": snr2_series,
                "avg_snr1": float(avg_snr1),
                "avg_snr2": float(avg_snr2),
                "min_snr1": float(min_snr1),
                "min_snr2": float(min_snr2),
                "avg_snr": float(max(avg_snr1, avg_snr2)),
                "min_snr": float(min(min_snr1, min_snr2)),
            }

        except Exception as e:
            print(f"计算信噪比失败 {satellite}: {e}")
            return {"snr1_series": [], "snr2_series": [], "avg_snr1": 0, "avg_snr2": 0, "min_snr1": 0, "min_snr2": 0}

    def _detect_cycle_slips_gf(self, l1: np.ndarray, l2: np.ndarray, threshold: float = 0.05) -> List[int]:
        """几何无关组合检测法 (对大周跳敏感)"""
        gf = l1 * self.LAMBDA_L1 - l2 * self.LAMBDA_L2
        gf_diff = np.diff(gf)

        slips = []
        for i in range(len(gf_diff)):
            if abs(gf_diff[i]) > threshold:
                slips.append(i + 1)

        return slips

    def _detect_cycle_slips_phase_code(self, c1: np.ndarray, l1: np.ndarray, threshold: float = 0.15) -> List[int]:
        """相位-码组合检测法 (对小周跳敏感)"""
        if c1 is None or l1 is None:
            return []

        valid_mask = ~np.isnan(c1) & ~np.isnan(l1)
        if not np.any(valid_mask):
            return []

        c1_valid = c1[valid_mask]
        l1_valid = l1[valid_mask]

        phase_code = c1_valid - l1_valid * self.LAMBDA_L1
        phase_code_diff = np.diff(phase_code)

        slips = []
        for i in range(len(phase_code_diff)):
            if abs(phase_code_diff[i]) > threshold:
                valid_indices = np.where(valid_mask)[0]
                if i + 1 < len(valid_indices):
                    slips.append(valid_indices[i + 1])

        return slips

    def _detect_cycle_slips_doppler(self, l1: np.ndarray, d1: np.ndarray, interval: float = 30.0) -> List[int]:
        """多普勒积分检测法 (对小周跳非常敏感)"""
        if l1 is None or d1 is None:
            return []

        valid_mask = ~np.isnan(l1) & ~np.isnan(d1)
        if not np.any(valid_mask):
            return []

        l1_valid = l1[valid_mask]
        d1_valid = d1[valid_mask]

        slips = []
        for i in range(1, len(l1_valid)):
            phase_change = (l1_valid[i] - l1_valid[i - 1]) * self.LAMBDA_L1
            doppler_integral = -d1_valid[i] * interval * 1e-3

            if abs(phase_change - doppler_integral) > 0.1:
                valid_indices = np.where(valid_mask)[0]
                slips.append(valid_indices[i])

        return slips

    def _detect_cycle_slips_polynomial(self, l1: np.ndarray, window_size: int = 10, threshold: float = 0.08) -> List[int]:
        """多项式拟合检测法 (对小周跳敏感)"""
        if l1 is None or len(l1) < window_size * 2:
            return []

        valid_mask = ~np.isnan(l1)
        valid_indices = np.where(valid_mask)[0]

        if len(valid_indices) < window_size * 2:
            return []

        l1_valid = l1[valid_indices]

        slips = []
        for i in range(window_size, len(l1_valid) - window_size):
            left_window = l1_valid[i - window_size : i]
            right_window = l1_valid[i + 1 : i + window_size + 1]

            if len(left_window) < 3 or len(right_window) < 3:
                continue

            left_mean = np.mean(left_window)
            right_mean = np.mean(right_window)

            left_slope = np.polyfit(range(window_size), left_window, 1)[0]
            right_slope = np.polyfit(range(window_size), right_window, 1)[0]

            predicted = left_window[-1] + left_slope
            actual = right_window[0]
            jump = actual - predicted

            if abs(jump) > threshold and abs(left_slope - right_slope) > threshold * 0.5:
                slips.append(valid_indices[i])

        return slips

    def _merge_cycle_slips(self, slip_lists: List[List[int]], min_votes: int = 2) -> Tuple[List[int], Dict[int, int]]:
        """融合多种检测方法的结果，投票机制"""
        slip_votes = {}
        for slips in slip_lists:
            for slip in slips:
                for offset in [-1, 0, 1]:
                    key = slip + offset
                    slip_votes[key] = slip_votes.get(key, 0) + 1

        merged = []
        last_slip = -10
        for slip in sorted(slip_votes.keys()):
            if slip_votes[slip] >= min_votes and slip - last_slip > 3:
                merged.append(slip)
                last_slip = slip

        return merged, slip_votes

    def detect_cycle_slips(self, satellite: str, interval: float = 30.0) -> Dict:
        """增强型周跳检测 - 多方法融合"""
        if self.obs_data is None:
            return {"cycle_slips": [], "cycle_slip_count": 0, "gf_series": []}

        try:
            sat_data = self.obs_data.sel(sv=satellite)

            l1 = sat_data.L1.values if "L1" in sat_data else None
            l2 = sat_data.L2.values if "L2" in sat_data else None
            c1 = sat_data.C1.values if "C1" in sat_data else None
            d1 = sat_data.D1.values if "D1" in sat_data else None

            if l1 is None or l2 is None:
                return {"cycle_slips": [], "cycle_slip_count": 0, "gf_series": []}

            valid_mask = ~np.isnan(l1) & ~np.isnan(l2)

            if not np.any(valid_mask):
                return {"cycle_slips": [], "cycle_slip_count": 0, "gf_series": []}

            l1_valid = l1[valid_mask]
            l2_valid = l2[valid_mask]

            gf = l1_valid * self.LAMBDA_L1 - l2_valid * self.LAMBDA_L2
            gf_diff = np.diff(gf)

            slip_lists = []

            gf_slips = self._detect_cycle_slips_gf(l1_valid, l2_valid, threshold=0.08)
            slip_lists.append(gf_slips)

            pc_slips = self._detect_cycle_slips_phase_code(c1, l1, threshold=0.12)
            slip_lists.append(pc_slips)

            if d1 is not None:
                doppler_slips = self._detect_cycle_slips_doppler(l1, d1, interval)
                slip_lists.append(doppler_slips)

            poly_slips = self._detect_cycle_slips_polynomial(l1, window_size=8, threshold=0.06)
            slip_lists.append(poly_slips)

            min_votes = 2 if len(slip_lists) >= 3 else 1
            merged_slips, slip_votes = self._merge_cycle_slips(slip_lists, min_votes=min_votes)

            cycle_slips = []
            for slip_idx in merged_slips:
                if slip_idx < len(self.obs_data.time.values):
                    gf_idx = np.searchsorted(np.where(valid_mask)[0], slip_idx)
                    gf_value = gf_diff[gf_idx - 1] if 0 < gf_idx <= len(gf_diff) else 0

                    cycle_slips.append(
                        {
                            "index": int(slip_idx),
                            "value": float(gf_value),
                            "timestamp": str(pd.Timestamp(self.obs_data.time.values[slip_idx])),
                            "detection_methods": slip_votes.get(slip_idx, min_votes),
                        }
                    )

            detection_methods = {
                "geometry_free": len(gf_slips),
                "phase_code": len(pc_slips),
                "doppler": len(slip_lists[2]) if len(slip_lists) > 2 else 0,
                "polynomial": len(poly_slips),
            }

            return {
                "cycle_slips": cycle_slips,
                "cycle_slip_count": len(cycle_slips),
                "gf_series": gf.tolist(),
                "gf_diff_series": gf_diff.tolist(),
                "detection_methods": detection_methods,
                "all_detections": {
                    "gf_slips": gf_slips,
                    "pc_slips": pc_slips,
                    "poly_slips": poly_slips,
                },
            }

        except Exception as e:
            print(f"周跳检测失败 {satellite}: {e}")
            import traceback

            traceback.print_exc()
            return {"cycle_slips": [], "cycle_slip_count": 0, "gf_series": []}

    def calculate_data_availability(self, satellite: str) -> float:
        if self.obs_data is None:
            return 0.0

        try:
            sat_data = self.obs_data.sel(sv=satellite)
            c1 = sat_data.C1.values if "C1" in sat_data else None

            if c1 is None:
                return 0.0

            total_epochs = len(c1)
            valid_epochs = np.sum(~np.isnan(c1))

            return float(valid_epochs / total_epochs) if total_epochs > 0 else 0.0

        except Exception as e:
            print(f"计算数据可用性失败 {satellite}: {e}")
            return 0.0

    def calculate_satellite_elevation_azimuth(
        self, satellite: str, receiver_pos: Tuple[float, float, float]
    ) -> Dict:
        if self.nav_data is None:
            return {"elevation": [], "azimuth": [], "elevation_series": [], "azimuth_series": []}

        try:
            import pymap3d as pm

            sat_positions = []
            times = []

            for time_idx in range(len(self.obs_data.time)):
                try:
                    time = self.obs_data.time.values[time_idx]
                    sat_ephem = self.nav_data.sel(sv=satellite).interp(time=time, method="nearest")

                    if np.isnan(sat_ephem.SqrtA.values):
                        continue

                    t = (pd.Timestamp(time) - pd.Timestamp(time).normalize()).total_seconds()
                    x, y, z = self._calculate_sat_position(t, sat_ephem)

                    if x is not None:
                        sat_positions.append([x, y, z])
                        times.append(time)
                except:
                    continue

            if not sat_positions:
                return {"elevation": [], "azimuth": [], "elevation_series": [], "azimuth_series": []}

            sat_positions = np.array(sat_positions)
            receiver_pos = np.array(receiver_pos)

            elevations = []
            azimuths = []

            for sat_pos in sat_positions:
                az, el, _ = pm.ecef2aer(
                    sat_pos[0], sat_pos[1], sat_pos[2], receiver_pos[0], receiver_pos[1], receiver_pos[2]
                )
                elevations.append(float(el))
                azimuths.append(float(az))

            return {
                "elevation": float(np.nanmean(elevations)) if elevations else 0,
                "azimuth": float(np.nanmean(azimuths)) if azimuths else 0,
                "elevation_series": elevations,
                "azimuth_series": azimuths,
            }

        except Exception as e:
            print(f"计算卫星方位角/仰角失败 {satellite}: {e}")
            return {"elevation": [], "azimuth": [], "elevation_series": [], "azimuth_series": []}

    def calculate_all_metrics(self, satellites: List[str], receiver_pos: Tuple[float, float, float]) -> Dict:
        all_metrics = {}

        for sat in satellites:
            multipath = self.calculate_multipath(sat, receiver_pos)
            snr = self.calculate_snr(sat)
            cycle_slips = self.detect_cycle_slips(sat)
            availability = self.calculate_data_availability(sat)

            all_metrics[sat] = {
                "multipath": multipath,
                "snr": snr,
                "cycle_slips": cycle_slips,
                "data_availability": availability,
            }

        return all_metrics

    def calculate_quality_score(self, metrics: Dict) -> float:
        try:
            mp_score = max(0, 100 - metrics.get("avg_multipath", 0) * 25)
            snr_score = min(100, metrics.get("avg_snr", 0) * 1.8)
            cs_count = metrics.get("cycle_slip_count", 0)
            cs_score = max(0, 100 - cs_count * 8)
            avail_score = metrics.get("data_availability", 0) * 100

            total_score = 0.3 * mp_score + 0.3 * snr_score + 0.25 * cs_score + 0.15 * avail_score
            return float(total_score)

        except:
            return 0.0
