import time
import json
import machine
from collections import deque

HALL_SENSOR_PIN = 4
IR_SENSOR_PIN = 5
DEVICE_ID = "pillbox_001"

IR_DEBOUNCE_COUNT = 2
IR_DEBOUNCE_WINDOW = 500

MAX_CACHE_SIZE = 200
RETRY_INTERVAL = 30

class SensorDataCache:
    def __init__(self, max_size=200):
        self.cache = deque(maxlen=max_size)
        self.max_size = max_size
        
    def add(self, sensor_type, value):
        timestamp = time.time()
        data = {
            "sensor_type": sensor_type,
            "value": value,
            "timestamp": timestamp
        }
        self.cache.append(data)
        return len(self.cache)
    
    def get_batch(self, size=50):
        batch = []
        for _ in range(min(size, len(self.cache))):
            batch.append(self.cache.popleft())
        return batch
    
    def peek_all(self):
        return list(self.cache)
    
    def __len__(self):
        return len(self.cache)

class IRSensorDebounce:
    def __init__(self, min_count=2, window_ms=500):
        self.min_count = min_count
        self.window_ms = window_ms
        self.detections = []
        self.last_sent_value = 1
        
    def check(self, current_value):
        now = time.ticks_ms()
        
        self.detections = [
            t for t in self.detections
            if time.ticks_diff(now, t) <= self.window_ms
        ]
        
        if current_value == 0:
            self.detections.append(now)
            
            if len(self.detections) >= self.min_count and self.last_sent_value == 1:
                self.last_sent_value = 0
                return (True, 0)
        else:
            if self.last_sent_value == 0:
                self.last_sent_value = 1
                self.detections = []
                return (True, 1)
            
        return (False, None)

class PillboxFirmware:
    def __init__(self):
        self.device_id = DEVICE_ID
        self.hall_pin = machine.Pin(HALL_SENSOR_PIN, machine.Pin.IN)
        self.ir_pin = machine.Pin(IR_SENSOR_PIN, machine.Pin.IN)
        
        self.cache = SensorDataCache(max_size=MAX_CACHE_SIZE)
        self.ir_debounce = IRSensorDebounce(
            min_count=IR_DEBOUNCE_COUNT,
            window_ms=IR_DEBOUNCE_WINDOW
        )
        
        self.last_hall_value = None
        self.network_connected = False
        self.last_retry_time = 0
        
    def is_network_available(self):
        return self.network_connected
    
    def send_mqtt_message(self, sensor_type, value, timestamp):
        topic = f"smart_pillbox/{self.device_id}/{sensor_type}"
        payload = {
            "value": value,
            "timestamp": timestamp,
            "device_id": self.device_id
        }
        return self._publish_mqtt(topic, payload)
    
    def send_batch_http(self, batch_data):
        import urequests
        url = "http://your-server:8000/sensor-data/batch"
        payload = {
            "device_id": self.device_id,
            "data": batch_data,
            "is_offline_data": True
        }
        try:
            response = urequests.post(url, json=payload)
            success = response.status_code == 200
            response.close()
            return success
        except Exception as e:
            print(f"HTTP batch send failed: {e}")
            return False
    
    def _publish_mqtt(self, topic, payload):
        print(f"[MQTT] {topic}: {json.dumps(payload)}")
        return True
    
    def sync_cached_data(self):
        now = time.time()
        if len(self.cache) == 0:
            return True
            
        if not self.is_network_available():
            if time.time() - self.last_retry_time > RETRY_INTERVAL:
                self.last_retry_time = now
            return False
            
        print(f"Syncing {len(self.cache)} cached records...")
        
        batch = self.cache.peek_all()
        if self.send_batch_http(batch):
            for _ in range(len(batch)):
                self.cache.get_batch(1)
            print(f"Successfully synced {len(batch)} records")
            return True
        else:
            print("Sync failed, keeping data in cache")
            return False
    
    def process_sensor_data(self, sensor_type, value):
        timestamp = time.time()
        
        if self.is_network_available():
            if self.send_mqtt_message(sensor_type, value, timestamp):
                self.sync_cached_data()
                return True
        
        self.cache.add(sensor_type, value)
        print(f"Cached {sensor_type}={value}, cache size: {len(self.cache)}")
        return False
    
    def read_hall_sensor(self):
        value = self.hall_pin.value()
        
        if value != self.last_hall_value:
            print(f"Hall sensor changed: {self.last_hall_value} -> {value}")
            self.process_sensor_data("hall", value)
            self.last_hall_value = value
            
        return value
    
    def read_ir_sensor(self):
        current_value = self.ir_pin.value()
        
        should_send, value_to_send = self.ir_debounce.check(current_value)
        
        if should_send:
            print(f"IR sensor (debounced): {value_to_send}")
            self.process_sensor_data("ir", value_to_send)
            
        return current_value
    
    def loop(self):
        print(f"Pillbox {self.device_id} started")
        
        while True:
            try:
                self.read_hall_sensor()
                self.read_ir_sensor()
                
                if len(self.cache) > 0 and time.time() % 10 == 0:
                    self.sync_cached_data()
                
                time.sleep_ms(50)
                
            except Exception as e:
                print(f"Error in main loop: {e}")
                time.sleep(1)

if __name__ == "__main__":
    firmware = PillboxFirmware()
    firmware.loop()
