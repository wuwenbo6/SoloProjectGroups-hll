import paho.mqtt.client as mqtt
import json
import time
import random

MQTT_BROKER = "localhost"
MQTT_PORT = 1883

def on_connect(client, userdata, flags, rc):
    print(f"Connected with result code {rc}")

client = mqtt.Client()
client.on_connect = on_connect

try:
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_start()
    
    device_id = "pillbox_001"
    
    print("开始模拟传感器数据...")
    print(f"设备ID: {device_id}")
    print("按 Ctrl+C 停止\n")
    
    while True:
        hall_topic = f"smart_pillbox/{device_id}/hall"
        hall_value = random.choice([0, 1])
        client.publish(hall_topic, json.dumps({"value": hall_value, "timestamp": time.time()}))
        print(f"[霍尔传感器] {hall_topic}: value={hall_value} {'(开盖)' if hall_value == 1 else '(关盖)'}")
        
        time.sleep(2)
        
        if hall_value == 1:
            ir_topic = f"smart_pillbox/{device_id}/ir"
            ir_value = random.choice([0, 1])
            client.publish(ir_topic, json.dumps({"value": ir_value, "timestamp": time.time()}))
            print(f"[红外传感器] {ir_topic}: value={ir_value} {'(取药)' if ir_value == 0 else '(未取药)'}")
        
        time.sleep(3)
        
except KeyboardInterrupt:
    print("\n停止模拟")
    client.loop_stop()
    client.disconnect()
except Exception as e:
    print(f"Error: {e}")
