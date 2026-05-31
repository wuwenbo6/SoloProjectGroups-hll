import paho.mqtt.client as mqtt
import json
from datetime import datetime
from typing import Dict, Callable
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MQTTClient:
    def __init__(self, broker: str, port: int, topic: str):
        self.broker = broker
        self.port = port
        self.topic = topic
        self.client = mqtt.Client()
        self.message_handlers: Dict[str, Callable] = {}
        self._setup_callbacks()
        
    def _setup_callbacks(self):
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect
        
    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info(f"Connected to MQTT broker at {self.broker}:{self.port}")
            client.subscribe(self.topic)
            logger.info(f"Subscribed to topic: {self.topic}")
        else:
            logger.error(f"Failed to connect to MQTT broker, code: {rc}")
            
    def _on_disconnect(self, client, userdata, rc):
        if rc != 0:
            logger.warning("Unexpected disconnection from MQTT broker")
            
    def _on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode())
            logger.info(f"Received message on {topic}: {payload}")
            
            device_id = self._extract_device_id(topic)
            sensor_type = self._extract_sensor_type(topic)
            
            for handler in self.message_handlers.values():
                handler(device_id, sensor_type, payload)
                
        except Exception as e:
            logger.error(f"Error processing MQTT message: {e}")
            
    def _extract_device_id(self, topic: str) -> str:
        parts = topic.split('/')
        if len(parts) >= 2:
            return parts[1]
        return "unknown"
        
    def _extract_sensor_type(self, topic: str) -> str:
        parts = topic.split('/')
        if len(parts) >= 3:
            return parts[-1]
        return "unknown"
        
    def register_handler(self, name: str, handler: Callable):
        self.message_handlers[name] = handler
        
    def connect(self):
        try:
            self.client.connect(self.broker, self.port, 60)
            self.client.loop_start()
        except Exception as e:
            logger.error(f"Failed to connect to MQTT: {e}")
            
    def disconnect(self):
        self.client.loop_stop()
        self.client.disconnect()
        
    def publish(self, topic: str, payload: dict):
        self.client.publish(topic, json.dumps(payload))
