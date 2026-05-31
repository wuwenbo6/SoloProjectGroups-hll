import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from scipy.optimize import least_squares


@dataclass
class Station:
    name: str
    latitude: float
    longitude: float
    elevation: float


@dataclass
class Event:
    id: int
    latitude: float
    longitude: float
    depth: float
    origin_time: float
    detections: Dict[str, float]


@dataclass
class RelocatedEvent:
    id: int
    latitude: float
    longitude: float
    depth: float
    origin_time: float
    latitude_uncertainty: float
    longitude_uncertainty: float
    depth_uncertainty: float


class DoubleDifferenceLocator:
    def __init__(
        self,
        stations: List[Station],
        velocity_model: Dict[str, float] = None,
        max_iterations: int = 50,
        convergence_threshold: float = 1e-6,
    ):
        self.stations = {s.name: s for s in stations}
        self.velocity_model = velocity_model or {"vp": 6.0, "vs": 3.46}
        self.max_iterations = max_iterations
        self.convergence_threshold = convergence_threshold

    def _calculate_travel_time(
        self,
        event_lat: float,
        event_lon: float,
        event_depth: float,
        station: Station,
        phase: str = "P",
    ) -> float:
        vp = self.velocity_model["vp"]
        vs = self.velocity_model["vs"]
        velocity = vp if phase == "P" else vs

        dist_lat = (event_lat - station.latitude) * 111.0
        dist_lon = (event_lon - station.longitude) * 111.0 * np.cos(np.radians(event_lat))
        dist_horizontal = np.sqrt(dist_lat ** 2 + dist_lon ** 2)
        dist_total = np.sqrt(dist_horizontal ** 2 + event_depth ** 2)

        return dist_total / velocity

    def _residuals_single(
        self,
        params: np.ndarray,
        arrival_times: Dict[str, float],
        phase: str = "P",
    ) -> np.ndarray:
        lat, lon, depth, origin_time = params
        residuals = []

        for station_name, arrival_time in arrival_times.items():
            if station_name in self.stations:
                station = self.stations[station_name]
                tt_predicted = self._calculate_travel_time(
                    lat, lon, depth, station, phase
                )
                residuals.append(arrival_time - (origin_time + tt_predicted))

        return np.array(residuals)

    def _double_difference_residuals(
        self,
        params: np.ndarray,
        events: List[Event],
        phase: str = "P",
    ) -> np.ndarray:
        n_events = len(events)
        residuals = []

        for i in range(n_events):
            lat_i = params[i * 4]
            lon_i = params[i * 4 + 1]
            depth_i = params[i * 4 + 2]
            origin_time_i = params[i * 4 + 3]

            for station_name, arrival_time in events[i].detections.items():
                if station_name in self.stations:
                    station = self.stations[station_name]
                    tt_predicted = self._calculate_travel_time(
                        lat_i, lon_i, depth_i, station, phase
                    )
                    residuals.append(arrival_time - (origin_time_i + tt_predicted))

        for i in range(n_events):
            for j in range(i + 1, n_events):
                for station_name in set(events[i].detections.keys()) & set(
                    events[j].detections.keys()
                ):
                    if station_name in self.stations:
                        station = self.stations[station_name]

                        tt_i = self._calculate_travel_time(
                            params[i * 4], params[i * 4 + 1], params[i * 4 + 2], station, phase
                        )
                        tt_j = self._calculate_travel_time(
                            params[j * 4], params[j * 4 + 1], params[j * 4 + 2], station, phase
                        )

                        obs_dt = events[i].detections[station_name] - events[j].detections[station_name]
                        pred_dt = tt_i - tt_j + (params[i * 4 + 3] - params[j * 4 + 3])

                        residuals.append((obs_dt - pred_dt) * 2.0)

        return np.array(residuals)

    def locate_single_event(
        self,
        arrival_times: Dict[str, float],
        initial_location: Optional[Tuple[float, float, float, float]] = None,
        phase: str = "P",
    ) -> Optional[RelocatedEvent]:
        if len(arrival_times) < 3:
            return None

        if initial_location is None:
            stations_with_arrivals = [
                self.stations[name] for name in arrival_times.keys() if name in self.stations
            ]
            if not stations_with_arrivals:
                return None
            mean_lat = np.mean([s.latitude for s in stations_with_arrivals])
            mean_lon = np.mean([s.longitude for s in stations_with_arrivals])
            initial_location = (mean_lat, mean_lon, 10.0, min(arrival_times.values()) - 5.0)

        try:
            result = least_squares(
                self._residuals_single,
                initial_location,
                args=(arrival_times, phase),
                max_nfev=self.max_iterations,
                ftol=self.convergence_threshold,
            )

            lat, lon, depth, origin_time = result.x
            residuals = result.fun

            if len(residuals) >= 4:
                try:
                    jac = result.jac
                    cov = np.linalg.inv(jac.T @ jac)
                    lat_err = np.sqrt(cov[0, 0]) if cov[0, 0] > 0 else 0.1
                    lon_err = np.sqrt(cov[1, 1]) if cov[1, 1] > 0 else 0.1
                    depth_err = np.sqrt(cov[2, 2]) if cov[2, 2] > 0 else 1.0
                except:
                    lat_err, lon_err, depth_err = 0.1, 0.1, 1.0
            else:
                lat_err, lon_err, depth_err = 0.1, 0.1, 1.0

            return RelocatedEvent(
                id=0,
                latitude=lat,
                longitude=lon,
                depth=depth,
                origin_time=origin_time,
                latitude_uncertainty=lat_err,
                longitude_uncertainty=lon_err,
                depth_uncertainty=depth_err,
            )
        except Exception as e:
            print(f"定位失败: {e}")
            return None

    def relocate_events(
        self,
        events: List[Event],
        phase: str = "P",
    ) -> List[Optional[RelocatedEvent]]:
        if len(events) < 2:
            return [
                self.locate_single_event(e.detections, (e.latitude, e.longitude, e.depth, e.origin_time), phase)
                for e in events
            ]

        initial_params = []
        for event in events:
            initial_params.extend([event.latitude, event.longitude, event.depth, event.origin_time])

        try:
            result = least_squares(
                self._double_difference_residuals,
                initial_params,
                args=(events, phase),
                max_nfev=self.max_iterations,
                ftol=self.convergence_threshold,
            )

            relocated = []
            for i in range(len(events)):
                lat = result.x[i * 4]
                lon = result.x[i * 4 + 1]
                depth = result.x[i * 4 + 2]
                origin_time = result.x[i * 4 + 3]

                relocated.append(
                    RelocatedEvent(
                        id=events[i].id,
                        latitude=lat,
                        longitude=lon,
                        depth=depth,
                        origin_time=origin_time,
                        latitude_uncertainty=0.05,
                        longitude_uncertainty=0.05,
                        depth_uncertainty=0.5,
                    )
                )

            return relocated
        except Exception as e:
            print(f"双差定位失败: {e}")
            return [None] * len(events)


def create_stations_from_coordinates(
    station_coords: Dict[str, Tuple[float, float, float]]
) -> List[Station]:
    return [
        Station(name=name, latitude=lat, longitude=lon, elevation=elev)
        for name, (lat, lon, elev) in station_coords.items()
    ]
