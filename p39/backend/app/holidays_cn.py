from datetime import datetime, date
from typing import Dict, Set, Tuple


class ChineseHolidays:
    def __init__(self):
        self.holidays: Dict[int, Set[date]] = {}
        self.workdays: Dict[int, Set[date]] = {}
        self._init_holidays()

    def _init_holidays(self):
        self.holidays[2024] = {
            date(2024, 1, 1),
            date(2024, 2, 10), date(2024, 2, 11), date(2024, 2, 12),
            date(2024, 2, 13), date(2024, 2, 14), date(2024, 2, 15),
            date(2024, 2, 16), date(2024, 2, 17),
            date(2024, 4, 4), date(2024, 4, 5), date(2024, 4, 6),
            date(2024, 5, 1), date(2024, 5, 2), date(2024, 5, 3),
            date(2024, 5, 4), date(2024, 5, 5),
            date(2024, 6, 10),
            date(2024, 9, 15), date(2024, 9, 16), date(2024, 9, 17),
            date(2024, 10, 1), date(2024, 10, 2), date(2024, 10, 3),
            date(2024, 10, 4), date(2024, 10, 5), date(2024, 10, 6),
            date(2024, 10, 7),
        }

        self.workdays[2024] = {
            date(2024, 2, 4), date(2024, 2, 18),
            date(2024, 4, 7),
            date(2024, 4, 28), date(2024, 5, 11),
            date(2024, 9, 14), date(2024, 9, 29),
            date(2024, 10, 12),
        }

        self.holidays[2025] = {
            date(2025, 1, 1),
            date(2025, 1, 28), date(2025, 1, 29), date(2025, 1, 30),
            date(2025, 1, 31), date(2025, 2, 1), date(2025, 2, 2),
            date(2025, 2, 3), date(2025, 2, 4),
            date(2025, 4, 4), date(2025, 4, 5), date(2025, 4, 6),
            date(2025, 5, 1), date(2025, 5, 2), date(2025, 5, 3),
            date(2025, 5, 4), date(2025, 5, 5),
            date(2025, 5, 31),
            date(2025, 10, 1), date(2025, 10, 2), date(2025, 10, 3),
            date(2025, 10, 4), date(2025, 10, 5), date(2025, 10, 6),
            date(2025, 10, 7),
        }

        self.holidays[2026] = {
            date(2026, 1, 1),
            date(2026, 2, 16), date(2026, 2, 17), date(2026, 2, 18),
            date(2026, 2, 19), date(2026, 2, 20), date(2026, 2, 21),
            date(2026, 2, 22), date(2026, 2, 23),
            date(2026, 4, 4), date(2026, 4, 5), date(2026, 4, 6),
            date(2026, 5, 1), date(2026, 5, 2), date(2026, 5, 3),
            date(2026, 5, 4), date(2026, 5, 5),
            date(2026, 6, 19),
            date(2026, 9, 25), date(2026, 9, 26), date(2026, 9, 27),
            date(2026, 10, 1), date(2026, 10, 2), date(2026, 10, 3),
            date(2026, 10, 4), date(2026, 10, 5), date(2026, 10, 6),
            date(2026, 10, 7),
        }

    def is_holiday(self, dt: datetime) -> bool:
        d = dt.date()
        year = d.year

        if year in self.holidays and d in self.holidays[year]:
            return True

        if year in self.workdays and d in self.workdays[year]:
            return False

        return d.weekday() >= 5

    def is_weekend(self, dt: datetime) -> bool:
        return dt.weekday() >= 5

    def get_holiday_type(self, dt: datetime) -> str:
        d = dt.date()
        year = d.year

        if year in self.holidays and d in self.holidays[year]:
            if d.month == 1 and d.day == 1:
                return 'new_year'
            elif d.month == 2:
                return 'spring_festival'
            elif d.month == 4:
                return 'qingming'
            elif d.month == 5 and d.day <= 5:
                return 'labor_day'
            elif d.month == 6:
                return 'dragon_boat'
            elif d.month == 9:
                return 'mid_autumn'
            elif d.month == 10:
                return 'national_day'
            return 'other_holiday'

        return 'normal'

    def get_day_factor(self, dt: datetime) -> float:
        holiday_type = self.get_holiday_type(dt)
        is_weekend = self.is_weekend(dt)

        factors = {
            'spring_festival': 1.8,
            'national_day': 1.6,
            'labor_day': 1.5,
            'qingming': 1.3,
            'dragon_boat': 1.3,
            'mid_autumn': 1.3,
            'new_year': 1.4,
            'other_holiday': 1.2,
            'normal': 1.0
        }

        base_factor = factors.get(holiday_type, 1.0)

        if is_weekend and holiday_type == 'normal':
            base_factor = max(base_factor, 1.3)

        return base_factor

    def get_season_factor(self, dt: datetime) -> float:
        month = dt.month

        season_factors = {
            1: 1.1, 2: 1.2, 3: 0.95,
            4: 1.0, 5: 1.1, 6: 0.95,
            7: 0.9, 8: 0.9, 9: 1.0,
            10: 1.1, 11: 0.95, 12: 1.15
        }

        return season_factors.get(month, 1.0)


holiday_calendar = ChineseHolidays()
