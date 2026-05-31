import json
import asyncio
from datetime import datetime
from kafka import KafkaConsumer, KafkaProducer
from typing import Callable, Optional
import logging
from .config import settings
from .database import SessionLocal, ProbeData, PassengerCount
from .estimator import global_estimator
from .holidays_cn import holiday_calendar
from .seat_estimator import global_seat_estimator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ProbeDataConsumer:
    def __init__(self):
        self.consumer: Optional[KafkaConsumer] = None
        self.producer: Optional[KafkaProducer] = None
        self.running = False
        self.ap_zone_map = {}

    def _init_kafka(self):
        self.consumer = KafkaConsumer(
            settings.kafka_topic,
            bootstrap_servers=settings.kafka_bootstrap_servers,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            auto_offset_reset='latest',
            enable_auto_commit=True,
            group_id='passenger-flow-group'
        )

        self.producer = KafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode('utf-8')
        )

    def _get_zone_for_ap(self, ap_id: str) -> str:
        return self.ap_zone_map.get(ap_id, "default")

    def _save_probe_data(self, data: dict):
        db = SessionLocal()
        try:
            timestamp = datetime.fromisoformat(data['timestamp']) if data.get('timestamp') else datetime.utcnow()
            zone = data.get('zone') or self._get_zone_for_ap(data.get('ap_id', ''))

            probe = ProbeData(
                mac_address=data['mac_address'],
                rssi=data['rssi'],
                ap_id=data.get('ap_id', ''),
                timestamp=timestamp,
                zone=zone
            )
            db.add(probe)
            db.commit()

            global_estimator.add_probe(
                data['mac_address'],
                timestamp,
                data['rssi'],
                zone
            )

            global_seat_estimator.process_probe(
                data['mac_address'],
                timestamp,
                data['rssi'],
                zone
            )

        except Exception as e:
            logger.error(f"Error saving probe data: {e}")
            db.rollback()
        finally:
            db.close()

    def _update_passenger_count(self, zone: str):
        db = SessionLocal()
        try:
            result = global_estimator.estimate_zone(zone)
            ts = result['timestamp']

            count = PassengerCount(
                zone=zone,
                timestamp=ts,
                raw_count=result['raw_count'],
                adjusted_count=result.get('adjusted_count'),
                estimated_count=result['estimated_count'],
                lower_bound=result['lower_bound'],
                upper_bound=result['upper_bound'],
                confidence=result['confidence'],
                total_probes=result.get('total_probes'),
                random_mac_ratio=result.get('random_mac_ratio'),
                is_holiday=1 if holiday_calendar.is_holiday(ts) else 0,
                holiday_type=holiday_calendar.get_holiday_type(ts)
            )
            db.add(count)
            db.commit()

            if self.producer:
                self.producer.send('passenger_updates', value=result)

        except Exception as e:
            logger.error(f"Error updating passenger count: {e}")
            db.rollback()
        finally:
            db.close()

    async def start(self):
        self.running = True
        self._init_kafka()
        logger.info("Kafka consumer started")

        last_update_time = {}

        try:
            while self.running:
                for message in self.consumer:
                    if not self.running:
                        break

                    data = message.value
                    self._save_probe_data(data)

                    zone = data.get('zone') or self._get_zone_for_ap(data.get('ap_id', ''))
                    now = datetime.utcnow()

                    if zone not in last_update_time or (now - last_update_time[zone]).total_seconds() >= 30:
                        self._update_passenger_count(zone)
                        last_update_time[zone] = now

                await asyncio.sleep(0.1)
        except Exception as e:
            logger.error(f"Consumer error: {e}")
        finally:
            self.stop()

    def stop(self):
        self.running = False
        if self.consumer:
            self.consumer.close()
        if self.producer:
            self.producer.close()
        logger.info("Kafka consumer stopped")


def create_producer():
    return KafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )


if __name__ == "__main__":
    consumer = ProbeDataConsumer()
    asyncio.run(consumer.start())
