from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from sqlalchemy import Column, String, Integer, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from dataclasses import dataclass
from enum import Enum


class TrainStatus(str, Enum):
    SCHEDULED = "scheduled"
    BOARDING = "boarding"
    DEPARTED = "departed"
    DELAYED = "delayed"
    CANCELLED = "cancelled"
    ARRIVED = "arrived"


@dataclass
class TrainSchedule:
    train_number: str
    departure_station: str
    arrival_station: str
    scheduled_departure: datetime
    scheduled_arrival: datetime
    actual_departure: Optional[datetime] = None
    actual_arrival: Optional[datetime] = None
    status: TrainStatus = TrainStatus.SCHEDULED
    platform: str = ""
    gate: str = ""
    delay_minutes: int = 0


class TrainScheduleManager:
    def __init__(self):
        self.schedules: Dict[str, TrainSchedule] = {}
        self._load_mock_schedules()

    def _load_mock_schedules(self):
        now = datetime.now()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)

        mock_trains = [
            ("G101", "上海虹桥", "北京南", today + timedelta(hours=7, minutes=0), today + timedelta(hours=11, minutes=30), "1", "A1"),
            ("G103", "上海虹桥", "北京南", today + timedelta(hours=8, minutes=0), today + timedelta(hours=12, minutes=30), "2", "A2"),
            ("D301", "上海", "南京", today + timedelta(hours=9, minutes=30), today + timedelta(hours=11, minutes=30), "3", "B1"),
            ("G7001", "上海", "苏州", today + timedelta(hours=10, minutes=0), today + timedelta(hours=10, minutes=30), "4", "B2"),
            ("G105", "上海虹桥", "北京南", today + timedelta(hours=14, minutes=0), today + timedelta(hours=18, minutes=30), "1", "A1"),
            ("D305", "上海", "杭州", today + timedelta(hours=15, minutes=30), today + timedelta(hours=17, minutes=0), "5", "C1"),
            ("G7003", "上海", "无锡", today + timedelta(hours=16, minutes=0), today + timedelta(hours=16, minutes=45), "6", "C2"),
            ("G107", "上海虹桥", "北京南", today + timedelta(hours=18, minutes=0), today + timedelta(hours=22, minutes=30), "2", "A2"),
        ]

        for train_no, dep_station, arr_station, dep_time, arr_time, platform, gate in mock_trains:
            self.schedules[train_no] = TrainSchedule(
                train_number=train_no,
                departure_station=dep_station,
                arrival_station=arr_station,
                scheduled_departure=dep_time,
                scheduled_arrival=arr_time,
                platform=platform,
                gate=gate,
                status=self._calculate_status(dep_time, arr_time)
            )

    def _calculate_status(self, dep_time: datetime, arr_time: datetime) -> TrainStatus:
        now = datetime.now()
        time_to_dep = (dep_time - now).total_seconds() / 60

        if now > arr_time:
            return TrainStatus.DEPARTED
        elif time_to_dep <= 30 and time_to_dep > 0:
            return TrainStatus.BOARDING
        elif time_to_dep > 30:
            return TrainStatus.SCHEDULED
        else:
            return TrainStatus.DEPARTED

    def get_all_schedules(self) -> List[TrainSchedule]:
        self._update_all_status()
        return list(self.schedules.values())

    def get_schedule(self, train_number: str) -> Optional[TrainSchedule]:
        self._update_all_status()
        return self.schedules.get(train_number)

    def get_departing_trains(self, next_minutes: int = 120) -> List[TrainSchedule]:
        self._update_all_status()
        now = datetime.now()
        end_time = now + timedelta(minutes=next_minutes)

        return [
            s for s in self.schedules.values()
            if now <= s.scheduled_departure <= end_time
            and s.status in [TrainStatus.SCHEDULED, TrainStatus.BOARDING, TrainStatus.DELAYED]
        ]

    def get_boarding_trains(self) -> List[TrainSchedule]:
        self._update_all_status()
        return [s for s in self.schedules.values() if s.status == TrainStatus.BOARDING]

    def update_train_status(self, train_number: str, status: TrainStatus, delay_minutes: int = 0):
        if train_number in self.schedules:
            schedule = self.schedules[train_number]
            schedule.status = status
            schedule.delay_minutes = delay_minutes
            return True
        return False

    def _update_all_status(self):
        for schedule in self.schedules.values():
            if schedule.status not in [TrainStatus.DEPARTED, TrainStatus.CANCELLED]:
                schedule.status = self._calculate_status(
                    schedule.scheduled_departure + timedelta(minutes=schedule.delay_minutes),
                    schedule.scheduled_arrival + timedelta(minutes=schedule.delay_minutes)
                )

    def get_passenger_flow_forecast(self, zone: str, minutes_ahead: int = 60) -> Dict:
        departing_trains = self.get_departing_trains(minutes_ahead)
        total_passengers = 0
        peak_load = 0

        for train in departing_trains:
            estimated_passengers = self._estimate_train_passengers(train)
            total_passengers += estimated_passengers

            time_to_departure = (train.scheduled_departure - datetime.now()).total_seconds() / 60
            if 15 <= time_to_departure <= 45:
                peak_load += estimated_passengers

        return {
            'zone': zone,
            'forecast_minutes': minutes_ahead,
            'departing_trains_count': len(departing_trains),
            'estimated_total_passengers': total_passengers,
            'peak_load_estimate': peak_load,
            'boarding_trains_count': len(self.get_boarding_trains()),
            'related_trains': [
                {
                    'train_number': t.train_number,
                    'destination': t.arrival_station,
                    'departure_time': t.scheduled_departure,
                    'status': t.status,
                    'platform': t.platform,
                    'gate': t.gate
                }
                for t in departing_trains[:5]
            ]
        }

    def _estimate_train_passengers(self, train: TrainSchedule) -> int:
        base_capacity = {
            'G': 1200,
            'D': 800,
            'C': 600,
            'K': 1500,
            'T': 1200,
            'Z': 1000
        }

        prefix = train.train_number[0] if train.train_number else 'G'
        capacity = base_capacity.get(prefix, 1000)

        now = datetime.now()
        hour = now.hour

        time_factor = 1.0
        if 7 <= hour <= 9 or 17 <= hour <= 19:
            time_factor = 0.95
        elif 10 <= hour <= 16:
            time_factor = 0.75
        else:
            time_factor = 0.5

        return int(capacity * time_factor * 0.3)

    def get_waiting_time_estimate(self, zone: str) -> Dict:
        boarding_trains = self.get_boarding_trains()
        departing_trains = self.get_departing_trains(60)

        if boarding_trains:
            avg_wait = 10
            status = "high"
        elif departing_trains:
            next_train = min(departing_trains, key=lambda t: t.scheduled_departure)
            minutes_to_board = max(0, (next_train.scheduled_departure - datetime.now()).total_seconds() / 60 - 30)
            avg_wait = minutes_to_board
            status = "medium" if minutes_to_board < 30 else "low"
        else:
            avg_wait = 30
            status = "low"

        return {
            'zone': zone,
            'estimated_wait_minutes': round(avg_wait, 0),
            'crowd_status': status,
            'next_train_departure': departing_trains[0].scheduled_departure if departing_trains else None,
            'next_train_number': departing_trains[0].train_number if departing_trains else None,
            'boarding_active': len(boarding_trains) > 0
        }


global_train_manager = TrainScheduleManager()
