import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from datetime import datetime


class SiteDisplacementMonitor:
    def __init__(self, obs_data=None, nav_data=None):
        self.obs_data = obs_data
        self.nav_data = nav_data
        self.L1_FREQ = 1575.42e6
        self.LAMBDA_L1 = 0.1903
        self.c = 299792458

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

            return np.array([x_k, y_k, z_k])
        except:
            return None

    def _point_positioning(
        self,
        sat_positions: np.ndarray,
        pseudoranges: np.ndarray,
        initial_pos: np.ndarray,
        iono_corrections: Optional[np.ndarray] = None,
        tropo_corrections: Optional[np.ndarray] = None,
    ) -> Tuple[np.ndarray, float]:
        """
        单点定位（最小二乘）
        解算接收机位置和钟差
        """
        try:
            n_sats = len(sat_positions)
            if n_sats < 4:
                return None, None

            pos = initial_pos.copy()
            clk_bias = 0.0
            max_iter = 10
            convergence_threshold = 1e-6

            for iteration in range(max_iter):
                geometric_ranges = np.linalg.norm(sat_positions - pos, axis=1)

                pred_ranges = geometric_ranges + clk_bias
                if iono_corrections is not None:
                    pred_ranges += iono_corrections
                if tropo_corrections is not None:
                    pred_ranges += tropo_corrections

                residuals = pseudoranges - pred_ranges

                line_of_sight = (sat_positions - pos) / geometric_ranges[:, np.newaxis]

                H = np.column_stack([-line_of_sight, np.ones(n_sats)])

                try:
                    delta = np.linalg.lstsq(H, residuals, rcond=None)[0]
                except:
                    return None, None

                pos = pos + delta[:3]
                clk_bias = clk_bias + delta[3]

                if np.linalg.norm(delta[:3]) < convergence_threshold:
                    break

            dop = self._calculate_dop(sat_positions, pos)

            return pos, dop

        except Exception as e:
            print(f"单点定位失败: {e}")
            return None, None

    def _calculate_dop(self, sat_positions: np.ndarray, receiver_pos: np.ndarray) -> Dict:
        """计算DOP值"""
        try:
            n = len(sat_positions)
            if n < 4:
                return {"gdop": 999, "pdop": 999, "hdop": 999, "vdop": 999}

            line_of_sight = (sat_positions - receiver_pos) / np.linalg.norm(
                sat_positions - receiver_pos, axis=1
            )[:, np.newaxis]

            H = np.column_stack([line_of_sight, np.ones(n)])
            Q = np.linalg.inv(H.T @ H)

            gdop = np.sqrt(np.trace(Q))
            pdop = np.sqrt(Q[0, 0] + Q[1, 1] + Q[2, 2])
            hdop = np.sqrt(Q[0, 0] + Q[1, 1])
            vdop = np.sqrt(Q[2, 2])

            return {
                "gdop": float(gdop),
                "pdop": float(pdop),
                "hdop": float(hdop),
                "vdop": float(vdop),
                "num_sats": n,
            }

        except Exception as e:
            print(f"计算DOP失败: {e}")
            return {"gdop": 999, "pdop": 999, "hdop": 999, "vdop": 999}

    def _tropospheric_correction(self, elevation_deg: float, height: float = 0.0) -> float:
        """
        对流层延迟校正（Saastamoinen模型）
        """
        try:
            if elevation_deg <= 0:
                return 10.0

            el_rad = np.deg2rad(elevation_deg)
            sin_el = np.sin(el_rad)

            P = 1013.25 * (1 - 2.2557e-5 * height) ** 5.2568
            T = 288.15 - 6.5e-3 * height
            RH = 0.5
            e = 6.108 * RH * np.exp((17.15 * (T - 273.15)) / (T - 38.45))

            tropo = 0.002277 / sin_el * (P + (1255.0 / T + 0.05) * e)

            return float(tropo)

        except:
            return 2.0

    def monitor_displacement(
        self,
        satellites: List[str],
        reference_pos: Tuple[float, float, float],
        reference_date: Optional[str] = None,
    ) -> Dict:
        """
        监测站点位移
        逐历元进行单点定位，与参考位置比较
        """
        if self.obs_data is None or self.nav_data is None:
            return {"displacements": [], "stats": {}}

        try:
            import pymap3d as pm

            timestamps = []
            positions = []
            displacements = []
            dop_values = []
            n_sats_list = []

            ref_pos = np.array(reference_pos)
            ref_llh = np.array(pm.ecef2geodetic(ref_pos[0], ref_pos[1], ref_pos[2]))

            for time_idx in range(len(self.obs_data.time)):
                try:
                    time = self.obs_data.time.values[time_idx]

                    sat_positions = []
                    pseudoranges = []
                    iono_corrs = []
                    tropo_corrs = []
                    valid_sats = []

                    for sat in satellites:
                        try:
                            sat_data = self.obs_data.sel(sv=satellite)
                            c1 = sat_data.C1.values[time_idx] if "C1" in sat_data else None

                            if c1 is None or np.isnan(c1):
                                continue

                            sat_ephem = self.nav_data.sel(sv=sat).interp(time=time, method="nearest")

                            if np.isnan(sat_ephem.SqrtA.values):
                                continue

                            t = (pd.Timestamp(time) - pd.Timestamp(time).normalize()).total_seconds()
                            sat_pos = self._calculate_sat_position(t, sat_ephem)

                            if sat_pos is None:
                                continue

                            sat_positions.append(sat_pos)
                            pseudoranges.append(c1)
                            valid_sats.append(sat)

                            az, el, _ = pm.ecef2aer(
                                sat_pos[0], sat_pos[1], sat_pos[2], ref_pos[0], ref_pos[1], ref_pos[2]
                            )

                            iono_corrs.append(0.0)
                            tropo_corrs.append(self._tropospheric_correction(el, ref_llh[2]))

                        except:
                            continue

                    if len(sat_positions) < 4:
                        continue

                    sat_positions = np.array(sat_positions)
                    pseudoranges = np.array(pseudoranges)
                    iono_corrs = np.array(iono_corrs)
                    tropo_corrs = np.array(tropo_corrs)

                    pos, dop = self._point_positioning(
                        sat_positions, pseudoranges, ref_pos, iono_corrs, tropo_corrs
                    )

                    if pos is None:
                        continue

                    displacement_ecef = pos - ref_pos
                    displacement_3d = np.linalg.norm(displacement_ecef)

                    pos_llh = pm.ecef2geodetic(pos[0], pos[1], pos[2])
                    disp_enu = pm.ecef2enu(
                        pos[0], pos[1], pos[2], ref_pos[0], ref_pos[1], ref_pos[2]
                    )

                    timestamps.append(str(pd.Timestamp(time)))
                    positions.append(pos.tolist())
                    displacements.append(
                        {
                            "time": str(pd.Timestamp(time)),
                            "dx_m": float(displacement_ecef[0]),
                            "dy_m": float(displacement_ecef[1]),
                            "dz_m": float(displacement_ecef[2]),
                            "east_m": float(disp_enu[0]),
                            "north_m": float(disp_enu[1]),
                            "up_m": float(disp_enu[2]),
                            "displacement_3d_m": float(displacement_3d),
                            "lat_deg": float(pos_llh[0]),
                            "lon_deg": float(pos_llh[1]),
                            "height_m": float(pos_llh[2]),
                        }
                    )
                    dop_values.append(dop)
                    n_sats_list.append(len(valid_sats))

                except Exception as e:
                    print(f"历元 {time_idx} 处理失败: {e}")
                    continue

            if not displacements:
                return {"displacements": [], "stats": {}}

            east_vals = [d["east_m"] for d in displacements]
            north_vals = [d["north_m"] for d in displacements]
            up_vals = [d["up_m"] for d in displacements]
            disp_3d_vals = [d["displacement_3d_m"] for d in displacements]

            stats = {
                "num_epochs": len(displacements),
                "mean_east_m": float(np.mean(east_vals)),
                "mean_north_m": float(np.mean(north_vals)),
                "mean_up_m": float(np.mean(up_vals)),
                "std_east_m": float(np.std(east_vals)),
                "std_north_m": float(np.std(north_vals)),
                "std_up_m": float(np.std(up_vals)),
                "max_displacement_3d_m": float(np.max(disp_3d_vals)),
                "mean_displacement_3d_m": float(np.mean(disp_3d_vals)),
                "mean_hdop": float(np.mean([d["hdop"] for d in dop_values])) if dop_values else 0,
                "mean_vdop": float(np.mean([d["vdop"] for d in dop_values])) if dop_values else 0,
                "mean_num_sats": float(np.mean(n_sats_list)) if n_sats_list else 0,
                "stability_classification": self._classify_stability(
                    np.std(east_vals), np.std(north_vals), np.std(up_vals)
                ),
                "movement_detected": float(np.max(disp_3d_vals)) > 0.1,
            }

            return {
                "reference_position": {
                    "x_m": reference_pos[0],
                    "y_m": reference_pos[1],
                    "z_m": reference_pos[2],
                },
                "displacements": displacements,
                "stats": stats,
                "time_series": {
                    "timestamps": timestamps,
                    "east_series": east_vals,
                    "north_series": north_vals,
                    "up_series": up_vals,
                    "displacement_3d_series": disp_3d_vals,
                    "hdop_series": [d["hdop"] for d in dop_values] if dop_values else [],
                    "num_sats_series": n_sats_list,
                },
            }

        except Exception as e:
            print(f"站点位移监测失败: {e}")
            import traceback

            traceback.print_exc()
            return {"displacements": [], "stats": {}}

    def _classify_stability(self, std_e: float, std_n: float, std_u: float) -> str:
        """根据位移标准差分类站点稳定性"""
        std_3d = np.sqrt(std_e**2 + std_n**2 + std_u**2)

        if std_3d < 0.005:
            return "excellent"
        elif std_3d < 0.01:
            return "good"
        elif std_3d < 0.05:
            return "moderate"
        elif std_3d < 0.1:
            return "poor"
        else:
            return "unstable"

    def detect_movement_events(self, displacements: List[Dict], threshold_m: float = 0.05) -> List[Dict]:
        """检测显著的移动事件"""
        events = []

        if len(displacements) < 2:
            return events

        cumulative_e = 0
        cumulative_n = 0
        cumulative_u = 0

        for i in range(1, len(displacements)):
            d_prev = displacements[i - 1]
            d_curr = displacements[i]

            delta_e = d_curr["east_m"] - d_prev["east_m"]
            delta_n = d_curr["north_m"] - d_prev["north_m"]
            delta_u = d_curr["up_m"] - d_prev["up_m"]
            delta_3d = np.sqrt(delta_e**2 + delta_n**2 + delta_u**2)

            cumulative_e += delta_e
            cumulative_n += delta_n
            cumulative_u += delta_u
            cumulative_3d = np.sqrt(cumulative_e**2 + cumulative_n**2 + cumulative_u**2)

            if delta_3d > threshold_m or cumulative_3d > threshold_m:
                events.append(
                    {
                        "index": i,
                        "time": d_curr["time"],
                        "incremental_displacement_m": float(delta_3d),
                        "cumulative_displacement_m": float(cumulative_3d),
                        "direction": {
                            "east_m": float(cumulative_e),
                            "north_m": float(cumulative_n),
                            "up_m": float(cumulative_u),
                        },
                        "severity": "minor" if delta_3d < 0.1 else "major" if delta_3d < 0.5 else "critical",
                    }
                )

        return events

    def generate_displacement_report(
        self, satellites: List[str], reference_pos: Tuple[float, float, float]
    ) -> Dict:
        """生成完整的站点位移监测报告"""
        result = self.monitor_displacement(satellites, reference_pos)

        if not result.get("displacements"):
            return result

        events = self.detect_movement_events(result["displacements"])
        result["movement_events"] = events

        return result
