import uuid
from typing import List, Optional
from datetime import datetime

from app.models.tank import Tank, TankCreate, TankUpdate, TankStatus
from app.database.sqlite_db import TankDatabase, get_tank_db


class TankService:
    def __init__(self, db: TankDatabase):
        self.db = db
        self._init_sample_tanks_if_empty()

    def _init_sample_tanks_if_empty(self):
        if self.db.has_any_tank():
            return
        
        sample_tanks = [
            {
                "name": "1号储罐 - 原油",
                "description": "主存储原油储罐",
                "max_height": 10.0,
                "sensor_height": 10.5,
                "min_level": 1.0,
                "max_level": 9.0,
                "location": "A区-01"
            },
            {
                "name": "2号储罐 - 柴油",
                "description": "柴油中间储罐",
                "max_height": 8.0,
                "sensor_height": 8.5,
                "min_level": 0.8,
                "max_level": 7.2,
                "location": "A区-02"
            }
        ]
        
        for tank_data in sample_tanks:
            self.create_tank(TankCreate(**tank_data))

    def _to_tank_model(self, data: dict) -> Tank:
        return Tank(
            id=data['id'],
            name=data['name'],
            description=data.get('description'),
            max_height=data['max_height'],
            sensor_height=data['sensor_height'],
            min_level=data.get('min_level', 0),
            max_level=data['max_level'],
            location=data.get('location'),
            status=TankStatus(data.get('status', 'offline')),
            current_level=data.get('current_level'),
            current_temperature=data.get('current_temperature'),
            last_update=data.get('last_update'),
            calibration_offset=data.get('calibration_offset', 0.0),
            calibration_scale=data.get('calibration_scale', 1.0),
            created_at=data['created_at'],
            updated_at=data['updated_at']
        )

    def create_tank(self, tank_create: TankCreate) -> Tank:
        tank_id = str(uuid.uuid4())
        now = datetime.utcnow()
        
        tank_data = tank_create.model_dump()
        tank_data.update({
            'id': tank_id,
            'status': TankStatus.OFFLINE.value,
            'created_at': now,
            'updated_at': now
        })
        
        self.db.create_tank(tank_data)
        return self._to_tank_model(tank_data)

    def get_tank(self, tank_id: str) -> Optional[Tank]:
        data = self.db.get_tank(tank_id)
        return self._to_tank_model(data) if data else None

    def get_all_tanks(self) -> List[Tank]:
        tanks_data = self.db.get_all_tanks()
        return [self._to_tank_model(data) for data in tanks_data]

    def update_tank(self, tank_id: str, tank_update: TankUpdate) -> Optional[Tank]:
        update_data = tank_update.model_dump(exclude_unset=True)
        
        if 'status' in update_data:
            update_data['status'] = update_data['status'].value
        
        if not self.db.update_tank(tank_id, update_data):
            return None
        
        return self.get_tank(tank_id)

    def delete_tank(self, tank_id: str) -> bool:
        return self.db.delete_tank(tank_id)

    def update_tank_level(self, tank_id: str, level: float, temperature: float) -> Optional[Tank]:
        tank = self.get_tank(tank_id)
        if not tank:
            return None
        
        if level >= tank.max_level or level <= tank.min_level:
            status = TankStatus.ALARM
        elif level >= tank.max_level * 0.9 or level <= tank.min_level * 1.2:
            status = TankStatus.WARNING
        else:
            status = TankStatus.NORMAL
        
        self.db.update_runtime(tank_id, level, temperature, status.value)
        
        return self.get_tank(tank_id)


_tank_service_instance: Optional[TankService] = None


def get_tank_service() -> TankService:
    global _tank_service_instance
    if _tank_service_instance is None:
        _tank_service_instance = TankService(get_tank_db())
    return _tank_service_instance
