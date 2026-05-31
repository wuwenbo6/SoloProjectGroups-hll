import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Tuple
from collections import defaultdict
from scipy import stats
from .holidays_cn import holiday_calendar


class PassengerPredictor:
    def __init__(self):
        self.historical_data: Dict[str, List[Tuple[datetime, float]]] = defaultdict(list)
        self.weekday_profiles: Dict[str, Dict[int, List[float]]] = defaultdict(
            lambda: defaultdict(list)
        )
        self.holiday_profiles: Dict[str, Dict[str, List[float]]] = defaultdict(
            lambda: defaultdict(list)
        )

    def add_historical_data(self, zone: str, timestamp: datetime, count: float):
        self.historical_data[zone].append((timestamp, count))

        weekday = timestamp.weekday()
        hour = timestamp.hour
        day_key = f"{weekday}_{hour}"
        self.weekday_profiles[zone][day_key].append(count)

        holiday_type = holiday_calendar.get_holiday_type(timestamp)
        if holiday_type != 'normal':
            holiday_key = f"{holiday_type}_{hour}"
            self.holiday_profiles[zone][holiday_key].append(count)

    def _extract_time_features(self, timestamps: List[datetime]) -> np.ndarray:
        features = []
        for ts in timestamps:
            hour = ts.hour
            minute = ts.minute
            day_of_week = ts.weekday()
            hour_sin = np.sin(2 * np.pi * hour / 24)
            hour_cos = np.cos(2 * np.pi * hour / 24)

            is_holiday = 1.0 if holiday_calendar.is_holiday(ts) else 0.0
            day_factor = holiday_calendar.get_day_factor(ts)
            season_factor = holiday_calendar.get_season_factor(ts)

            features.append([
                hour, minute, day_of_week,
                hour_sin, hour_cos,
                is_holiday, day_factor, season_factor
            ])
        return np.array(features)

    def _moving_average(self, values: np.ndarray, window: int = 5) -> np.ndarray:
        if len(values) < window:
            return values
        weights = np.exp(np.linspace(-1., 0., window))
        weights /= weights.sum()
        return np.convolve(values, weights, mode='same')

    def _get_weekday_profile(self, zone: str, timestamp: datetime) -> float:
        weekday = timestamp.weekday()
        hour = timestamp.hour
        day_key = f"{weekday}_{hour}"

        profile_data = self.weekday_profiles[zone].get(day_key, [])
        if profile_data:
            return np.mean(profile_data)
        return 0.0

    def _get_holiday_profile(self, zone: str, timestamp: datetime) -> float:
        holiday_type = holiday_calendar.get_holiday_type(timestamp)
        if holiday_type == 'normal':
            return 0.0

        hour = timestamp.hour
        holiday_key = f"{holiday_type}_{hour}"

        profile_data = self.holiday_profiles[zone].get(holiday_key, [])
        if profile_data:
            return np.mean(profile_data)
        return 0.0

    def predict_trend(
        self,
        zone: str,
        steps: int = 12,
        interval_minutes: int = 5
    ) -> List[Tuple[datetime, float]]:
        data = self.historical_data.get(zone, [])
        if len(data) < 10:
            return self._simple_prediction(data, steps, interval_minutes)

        timestamps = [d[0] for d in data]
        counts = np.array([d[1] for d in data])

        smoothed = self._moving_average(counts, window=5)

        last_count = smoothed[-1]
        recent_trend = 0
        if len(smoothed) >= 6:
            recent_trend = (smoothed[-1] - smoothed[-6]) / 5

        predictions = []
        current_time = timestamps[-1] if timestamps else datetime.utcnow()

        last_hour_avg = self._calculate_hour_average(zone, current_time)

        for i in range(steps):
            current_time = current_time + timedelta(minutes=interval_minutes)

            hour_factor = self._get_hour_factor(current_time)
            day_factor = holiday_calendar.get_day_factor(current_time)
            season_factor = holiday_calendar.get_season_factor(current_time)

            weekday_profile = self._get_weekday_profile(zone, current_time)
            holiday_profile = self._get_holiday_profile(zone, current_time)

            is_holiday = holiday_calendar.is_holiday(current_time)

            if holiday_profile > 0 and is_holiday:
                profile_weight = 0.6
                base_prediction = (last_hour_avg * (1 - profile_weight) +
                                   holiday_profile * profile_weight)
            elif weekday_profile > 0:
                profile_weight = 0.4
                base_prediction = (last_hour_avg * (1 - profile_weight) +
                                   weekday_profile * profile_weight)
            else:
                base_prediction = last_count

            trend_component = recent_trend * (i + 1) * 0.2
            predicted = base_prediction + trend_component

            combined_factor = hour_factor * day_factor * season_factor
            predicted = predicted * combined_factor

            predicted = max(0, predicted)

            noise = np.random.normal(0, max(last_count, 1) * 0.03) if last_count > 0 else 0
            predicted = predicted + noise

            predictions.append((current_time, round(predicted, 2)))

        return predictions

    def _calculate_hour_average(self, zone: str, current_time: datetime) -> float:
        data = self.historical_data.get(zone, [])
        if not data:
            return 0.0

        current_hour = current_time.hour
        recent_hour_data = [
            count for ts, count in data[-50:]
            if ts.hour == current_hour
        ]

        if recent_hour_data:
            return np.mean(recent_hour_data)
        return data[-1][1] if data else 0.0

    def _simple_prediction(
        self,
        data: List[Tuple[datetime, float]],
        steps: int,
        interval_minutes: int
    ) -> List[Tuple[datetime, float]]:
        if not data:
            base_time = datetime.utcnow()
            base_count = 0
        else:
            base_time = data[-1][0]
            base_count = data[-1][1]

        predictions = []
        for i in range(steps):
            pred_time = base_time + timedelta(minutes=interval_minutes * (i + 1))
            hour_factor = self._get_hour_factor(pred_time)
            day_factor = holiday_calendar.get_day_factor(pred_time)
            season_factor = holiday_calendar.get_season_factor(pred_time)

            predicted = base_count * hour_factor * day_factor * season_factor
            predictions.append((pred_time, round(predicted, 2)))

        return predictions

    def _get_hour_factor(self, hour: int) -> float:
        peak_hours = [7, 8, 9, 17, 18, 19]
        mid_hours = [6, 10, 11, 12, 16, 20, 21]
        off_peak_hours = [0, 1, 2, 3, 4, 5, 22, 23]

        if hour in peak_hours:
            return 1.4
        elif hour in mid_hours:
            return 1.1
        elif hour in off_peak_hours:
            return 0.5
        else:
            return 1.0

    def get_historical_series(
        self,
        zone: str,
        start_time: datetime,
        end_time: datetime
    ) -> List[Tuple[datetime, float]]:
        data = self.historical_data.get(zone, [])
        return [
            (ts, count) for ts, count in data
            if start_time <= ts <= end_time
        ]

    def get_confidence_interval(
        self,
        predictions: List[Tuple[datetime, float]],
        confidence: float = 0.95
    ) -> List[Tuple[datetime, float, float]]:
        if not predictions:
            return []

        counts = [p[1] for p in predictions]
        std_dev = np.std(counts) if len(counts) > 1 else 0.1

        z_score = stats.norm.ppf((1 + confidence) / 2)
        margin = z_score * std_dev * 0.3

        return [
            (ts, max(0, count - margin), count + margin)
            for ts, count in predictions
        ]

    def get_forecast_metadata(self, zone: str, timestamp: datetime) -> Dict:
        return {
            'is_holiday': holiday_calendar.is_holiday(timestamp),
            'holiday_type': holiday_calendar.get_holiday_type(timestamp),
            'day_factor': holiday_calendar.get_day_factor(timestamp),
            'season_factor': holiday_calendar.get_season_factor(timestamp),
            'is_weekend': holiday_calendar.is_weekend(timestamp),
            'weekday': timestamp.weekday()
        }


global_predictor = PassengerPredictor()
