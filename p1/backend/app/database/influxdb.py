from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
from typing import List, Dict, Any, Optional
from datetime import datetime
import json

from app.config import settings


class InfluxDBManager:
    def __init__(self):
        self.client = InfluxDBClient(
            url=settings.influxdb_url,
            token=settings.influxdb_token,
            org=settings.influxdb_org
        )
        self.bucket = settings.influxdb_bucket
        self.org = settings.influxdb_org
        self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
        self.query_api = self.client.query_api()

    def write_liquid_level(self, tank_id: str, level: float, temperature: float, echo_time: float):
        point = Point("liquid_level") \
            .tag("tank_id", tank_id) \
            .field("level", level) \
            .field("temperature", temperature) \
            .field("echo_time", echo_time) \
            .time(datetime.utcnow(), WritePrecision.NS)
        self.write_api.write(bucket=self.bucket, org=self.org, record=point)

    def write_echo_waveform(self, tank_id: str, waveform: List[float]):
        point = Point("echo_waveform") \
            .tag("tank_id", tank_id) \
            .field("waveform", json.dumps(waveform)) \
            .time(datetime.utcnow(), WritePrecision.NS)
        self.write_api.write(bucket=self.bucket, org=self.org, record=point)

    def query_recent_levels(self, tank_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        query = f'''
        from(bucket: "{self.bucket}")
            |> range(start: -1h)
            |> filter(fn: (r) => r["_measurement"] == "liquid_level")
            |> filter(fn: (r) => r["tank_id"] == "{tank_id}")
            |> filter(fn: (r) => r["_field"] == "level" or r["_field"] == "temperature")
            |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
            |> sort(columns: ["_time"], desc: true)
            |> limit(n: {limit})
        '''
        result = self.query_api.query(query, org=self.org)
        
        data = []
        for table in result:
            for record in table.records:
                data.append({
                    "time": record.get_time().isoformat(),
                    "level": record.values.get("level", 0),
                    "temperature": record.values.get("temperature", 0)
                })
        return data

    def query_level_history(self, tank_id: str, start_time: str, end_time: str, aggregate: str = "1m") -> List[Dict[str, Any]]:
        query = f'''
        from(bucket: "{self.bucket}")
            |> range(start: {start_time}, stop: {end_time})
            |> filter(fn: (r) => r["_measurement"] == "liquid_level")
            |> filter(fn: (r) => r["tank_id"] == "{tank_id}")
            |> filter(fn: (r) => r["_field"] == "level" or r["_field"] == "temperature")
            |> aggregateWindow(every: {aggregate}, fn: mean, createEmpty: false)
            |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
            |> sort(columns: ["_time"])
        '''
        result = self.query_api.query(query, org=self.org)
        
        data = []
        for table in result:
            for record in table.records:
                data.append({
                    "time": record.get_time().isoformat(),
                    "level": round(record.values.get("level", 0), 2),
                    "temperature": round(record.values.get("temperature", 0), 2)
                })
        return data

    def query_latest_waveform(self, tank_id: str) -> Optional[Dict[str, Any]]:
        query = f'''
        from(bucket: "{self.bucket}")
            |> range(start: -5m)
            |> filter(fn: (r) => r["_measurement"] == "echo_waveform")
            |> filter(fn: (r) => r["tank_id"] == "{tank_id}")
            |> filter(fn: (r) => r["_field"] == "waveform")
            |> sort(columns: ["_time"], desc: true)
            |> limit(n: 1)
        '''
        result = self.query_api.query(query, org=self.org)
        
        for table in result:
            for record in table.records:
                return {
                    "time": record.get_time().isoformat(),
                    "waveform": json.loads(record.get_value())
                }
        return None

    def close(self):
        self.client.close()


influx_db = InfluxDBManager()


def get_influx_db():
    try:
        yield influx_db
    finally:
        pass
