import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from datetime import datetime
import math


class SatellitePositionCalculator:
    def __init__(self, obs_data=None, nav_data=None):
        self.obs_data = obs_data
        self.nav_data = nav_data
        self.GM = 3.986005e14
        self.OMEGA_E_DOT = 7.2921151467e-5

    def calculate_satellite_position(self, t, ephem):
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
            t_oc = ephem.TimeEph.values

            A = sqrtA * sqrtA
            n0 = math.sqrt(self.GM / (A * A * A))
            t_k = t - toe

            if t_k > 302400:
                t_k -= 604800
            elif t_k < -302400:
                t_k += 604800

            n = n0 + delta_n
            M_k = M0 + n * t_k

            E_k = M_k
            for _ in range(10):
                E_k_new = M_k + e * math.sin(E_k)
                if abs(E_k_new - E_k) < 1e-12:
                    break
                E_k = E_k_new

            nu_k = math.atan2(math.sqrt(1 - e * e) * math.sin(E_k), math.cos(E_k) - e)
            phi_k = nu_k + omega

            delta_u_k = Cus * math.sin(2 * phi_k) + Cuc * math.cos(2 * phi_k)
            delta_r_k = Crs * math.sin(2 * phi_k) + Crc * math.cos(2 * phi_k)
            delta_i_k = Cis * math.sin(2 * phi_k) + Cic * math.cos(2 * phi_k)

            u_k = phi_k + delta_u_k
            r_k = A * (1 - e * math.cos(E_k)) + delta_r_k
            i_k = i0 + delta_i_k + i_dot * t_k

            x_k_prime = r_k * math.cos(u_k)
            y_k_prime = r_k * math.sin(u_k)

            Omega_k = Omega0 + (omega_dot - self.OMEGA_E_DOT) * t_k - self.OMEGA_E_DOT * toe

            x_k = x_k_prime * math.cos(Omega_k) - y_k_prime * math.cos(i_k) * math.sin(Omega_k)
            y_k = x_k_prime * math.sin(Omega_k) + y_k_prime * math.cos(i_k) * math.cos(Omega_k)
            z_k = y_k_prime * math.sin(i_k)

            return x_k, y_k, z_k

        except Exception as e:
            return None, None, None

    def get_azimuth_elevation(self, sat_pos: Tuple[float, float, float], rec_pos: Tuple[float, float, float]) -> Tuple[float, float]:
        try:
            import pymap3d as pm

            az, el, _ = pm.ecef2aer(sat_pos[0], sat_pos[1], sat_pos[2], rec_pos[0], rec_pos[1], rec_pos[2])
            return float(az), float(el)
        except:
            return 0.0, 0.0

    def calculate_skyplot_data(self, receiver_pos: Tuple[float, float, float]) -> Dict:
        if self.obs_data is None or self.nav_data is None:
            return {"satellites": [], "epochs": []}

        satellites = self.obs_data.sv.values.tolist()
        times = self.obs_data.time.values

        skyplot_data = {"satellites": {}, "epochs": []}

        for time_idx, time in enumerate(times):
            epoch_data = {"time": str(pd.Timestamp(time)), "satellites": []}

            for sat in satellites:
                try:
                    if sat not in self.nav_data.sv.values:
                        continue

                    sat_ephem = self.nav_data.sel(sv=sat).interp(time=time, method="nearest")

                    if np.isnan(sat_ephem.SqrtA.values):
                        continue

                    obs_at_epoch = self.obs_data.sel(sv=sat, time=time)
                    if "C1" in obs_at_epoch and np.isnan(obs_at_epoch.C1.values):
                        continue

                    t = (pd.Timestamp(time) - pd.Timestamp(time).normalize()).total_seconds()
                    x, y, z = self.calculate_satellite_position(t, sat_ephem)

                    if x is None:
                        continue

                    az, el = self.get_azimuth_elevation((x, y, z), receiver_pos)

                    if el < 5:
                        continue

                    if sat not in skyplot_data["satellites"]:
                        skyplot_data["satellites"][sat] = {"azimuth": [], "elevation": [], "times": []}

                    skyplot_data["satellites"][sat]["azimuth"].append(az)
                    skyplot_data["satellites"][sat]["elevation"].append(el)
                    skyplot_data["satellites"][sat]["times"].append(str(pd.Timestamp(time)))

                    epoch_data["satellites"].append({"satellite": sat, "azimuth": az, "elevation": el})

                except Exception as e:
                    continue

            skyplot_data["epochs"].append(epoch_data)

        return skyplot_data

    def calculate_visibility_data(self, receiver_pos: Tuple[float, float, float]) -> Dict:
        if self.obs_data is None or self.nav_data is None:
            return {"satellites": [], "visibility": {}}

        satellites = self.obs_data.sv.values.tolist()
        times = self.obs_data.time.values

        visibility_data = {
            "satellites": satellites,
            "times": [str(pd.Timestamp(t)) for t in times],
            "visibility_matrix": [],
            "visibility_periods": {},
        }

        for sat in satellites:
            sat_visibility = []
            periods = []
            current_period = None

            for time_idx, time in enumerate(times):
                try:
                    if sat not in self.nav_data.sv.values:
                        sat_visibility.append(False)
                        continue

                    sat_ephem = self.nav_data.sel(sv=sat).interp(time=time, method="nearest")

                    if np.isnan(sat_ephem.SqrtA.values):
                        sat_visibility.append(False)
                        continue

                    obs_at_epoch = self.obs_data.sel(sv=sat, time=time)
                    if "C1" in obs_at_epoch and np.isnan(obs_at_epoch.C1.values):
                        sat_visibility.append(False)
                        if current_period is not None:
                            periods.append({"start": current_period["start"], "end": str(pd.Timestamp(times[time_idx - 1]))})
                            current_period = None
                        continue

                    t = (pd.Timestamp(time) - pd.Timestamp(time).normalize()).total_seconds()
                    x, y, z = self.calculate_satellite_position(t, sat_ephem)

                    if x is None:
                        sat_visibility.append(False)
                        if current_period is not None:
                            periods.append({"start": current_period["start"], "end": str(pd.Timestamp(times[time_idx - 1]))})
                            current_period = None
                        continue

                    az, el = self.get_azimuth_elevation((x, y, z), receiver_pos)

                    is_visible = el >= 5
                    sat_visibility.append(is_visible)

                    if is_visible and current_period is None:
                        current_period = {"start": str(pd.Timestamp(time))}
                    elif not is_visible and current_period is not None:
                        periods.append({"start": current_period["start"], "end": str(pd.Timestamp(time))})
                        current_period = None

                except Exception as e:
                    sat_visibility.append(False)
                    if current_period is not None:
                        periods.append({"start": current_period["start"], "end": str(pd.Timestamp(times[time_idx - 1]))})
                        current_period = None

            if current_period is not None:
                periods.append({"start": current_period["start"], "end": str(pd.Timestamp(times[-1]))})

            visibility_data["visibility_matrix"].append(sat_visibility)
            visibility_data["visibility_periods"][sat] = periods

        return visibility_data

    def calculate_snr_vs_elevation(self, receiver_pos: Tuple[float, float, float]) -> Dict:
        if self.obs_data is None or self.nav_data is None:
            return {"satellites": {}}

        satellites = self.obs_data.sv.values.tolist()
        times = self.obs_data.time.values

        snr_elevation_data = {"satellites": {}}

        for sat in satellites:
            try:
                sat_data = self.obs_data.sel(sv=sat)
                snr1 = sat_data.S1.values if "S1" in sat_data else None

                if snr1 is None:
                    continue

                elevations = []
                snr_values = []

                for time_idx, time in enumerate(times):
                    try:
                        if np.isnan(snr1[time_idx]):
                            continue

                        if sat not in self.nav_data.sv.values:
                            continue

                        sat_ephem = self.nav_data.sel(sv=sat).interp(time=time, method="nearest")

                        if np.isnan(sat_ephem.SqrtA.values):
                            continue

                        t = (pd.Timestamp(time) - pd.Timestamp(time).normalize()).total_seconds()
                        x, y, z = self.calculate_satellite_position(t, sat_ephem)

                        if x is None:
                            continue

                        az, el = self.get_azimuth_elevation((x, y, z), receiver_pos)

                        if el >= 5:
                            elevations.append(el)
                            snr_values.append(float(snr1[time_idx]))

                    except:
                        continue

                if elevations:
                    snr_elevation_data["satellites"][sat] = {"elevation": elevations, "snr": snr_values}

            except Exception as e:
                print(f"处理卫星 {sat} 的SNR-仰角数据失败: {e}")
                continue

        return snr_elevation_data
