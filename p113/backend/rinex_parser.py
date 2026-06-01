import georinex as gr
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, List, Tuple, Optional


class RinexParser:
    def __init__(self):
        self.obs_data = None
        self.nav_data = None
        self.obs_header = None
        self.nav_header = None

    def parse_observation_file(self, file_path: str) -> Dict:
        try:
            self.obs_data = gr.load(file_path)
            self.obs_header = gr.rinexheader(file_path)
            return self._extract_observation_info()
        except Exception as e:
            raise Exception(f"解析观测文件失败: {str(e)}")

    def parse_navigation_file(self, file_path: str) -> Dict:
        try:
            self.nav_data = gr.load(file_path)
            self.nav_header = gr.rinexheader(file_path)
            return self._extract_navigation_info()
        except Exception as e:
            raise Exception(f"解析导航文件失败: {str(e)}")

    def _extract_observation_info(self) -> Dict:
        if self.obs_data is None:
            return {}

        times = self.obs_data.time.values
        satellites = self.obs_data.sv.values.tolist()

        info = {
            "station_name": self.obs_header.get("MARKER NAME", "Unknown"),
            "observer": self.obs_header.get("OBSERVER", "Unknown"),
            "receiver_number": self.obs_header.get("REC # / TYPE / VERS", ["Unknown"])[0]
            if isinstance(self.obs_header.get("REC # / TYPE / VERS"), list)
            else "Unknown",
            "antenna_number": self.obs_header.get("ANT # / TYPE", ["Unknown"])[0]
            if isinstance(self.obs_header.get("ANT # / TYPE"), list)
            else "Unknown",
            "approx_position": self._get_approx_position(),
            "start_time": pd.Timestamp(times[0]).to_pydatetime(),
            "end_time": pd.Timestamp(times[-1]).to_pydatetime(),
            "num_epochs": len(times),
            "satellites": satellites,
            "observation_types": self._get_observation_types(),
            "interval": self._get_interval(),
        }
        return info

    def _extract_navigation_info(self) -> Dict:
        if self.nav_data is None:
            return {}

        satellites = self.nav_data.sv.values.tolist()
        times = self.nav_data.time.values

        info = {
            "navigation_system": self.nav_header.get("PGM / RUN BY / DATE", "Unknown"),
            "ionospheric_correction": self.nav_header.get("ION ALPHA", None),
            "satellites": satellites,
            "num_ephemerides": len(times),
            "start_time": pd.Timestamp(times[0]).to_pydatetime(),
            "end_time": pd.Timestamp(times[-1]).to_pydatetime(),
        }
        return info

    def _get_approx_position(self) -> List[float]:
        pos = self.obs_header.get("APPROX POSITION XYZ", [0, 0, 0])
        if isinstance(pos, (list, tuple, np.ndarray)):
            return [float(x) for x in pos]
        return [0.0, 0.0, 0.0]

    def _get_observation_types(self) -> List[str]:
        types = self.obs_header.get("# / TYPES OF OBSERV", [])
        if isinstance(types, list):
            return [str(t) for t in types[1:] if len(types) > 1]
        return []

    def _get_interval(self) -> float:
        interval = self.obs_header.get("INTERVAL", 30.0)
        return float(interval)

    def get_observation_dataframe(self) -> pd.DataFrame:
        if self.obs_data is None:
            return pd.DataFrame()

        df = self.obs_data.to_dataframe().reset_index()
        return df

    def get_navigation_dataframe(self) -> pd.DataFrame:
        if self.nav_data is None:
            return pd.DataFrame()

        df = self.nav_data.to_dataframe().reset_index()
        return df

    def get_satellite_observations(self, satellite: str) -> pd.DataFrame:
        if self.obs_data is None:
            return pd.DataFrame()

        sat_data = self.obs_data.sel(sv=satellite)
        df = sat_data.to_dataframe().reset_index()
        return df

    def get_epoch_times(self) -> List[datetime]:
        if self.obs_data is None:
            return []

        return [pd.Timestamp(t).to_pydatetime() for t in self.obs_data.time.values]

    def get_visible_satellites_at_epoch(self, epoch_idx: int) -> List[str]:
        if self.obs_data is None:
            return []

        epoch_data = self.obs_data.isel(time=epoch_idx)
        visible = []
        for sv in epoch_data.sv.values:
            sv_data = epoch_data.sel(sv=sv)
            if not np.all(np.isnan(sv_data.values)):
                visible.append(str(sv))
        return visible
