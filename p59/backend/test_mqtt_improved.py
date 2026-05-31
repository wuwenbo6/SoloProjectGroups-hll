import paho.mqtt.client as mqtt
import json
import time

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
    
    print("=== 改进版传感器数据模拟测试 ===\n")
    
    print("测试 1: 正常开盖取药流程")
    print("-" * 40)
    
    hall_topic = f"smart_pillbox/{device_id}/hall"
    ir_topic = f"smart_pillbox/{device_id}/ir"
    
    print("1. 发送开盖信号...")
    client.publish(hall_topic, json.dumps({"value": 1, "timestamp": time.time()}))
    print(f"   [霍尔] {hall_topic}: value=1 (开盖)")
    time.sleep(1)
    
    print("2. 发送两次红外检测（模拟防抖）...")
    for i in range(3):
        client.publish(ir_topic, json.dumps({"value": 0, "timestamp": time.time()}))
        print(f"   [红外] 第{i+1}次检测: value=0 (检测到取药)")
        time.sleep(0.3)
    
    time.sleep(1)
    print("3. 发送关盖信号...")
    client.publish(hall_topic, json.dumps({"value": 0, "timestamp": time.time()}))
    print(f"   [霍尔] {hall_topic}: value=0 (关盖)")
    
    print("\n测试 2: 红外误报测试（单次快速划过）")
    print("-" * 40)
    
    print("1. 发送开盖信号...")
    client.publish(hall_topic, json.dumps({"value": 1, "timestamp": time.time()}))
    time.sleep(1)
    
    print("2. 发送单次红外（应该被防抖过滤，不会标记取药）...")
    client.publish(ir_topic, json.dumps({"value": 0, "timestamp": time.time()}))
    print(f"   [红外] 单次检测: value=0")
    time.sleep(3)
    
    print("3. 发送关盖信号...")
    client.publish(hall_topic, json.dumps({"value": 0, "timestamp": time.time()}))
    
    print("\n测试 3: 未开盖时的红外检测（应该被忽略）")
    print("-" * 40)
    
    for i in range(5):
        client.publish(ir_topic, json.dumps({"value": 0, "timestamp": time.time()}))
        print(f"   [红外] 第{i+1}次检测（未开盖，忽略）")
        time.sleep(0.3)
    
    print("\n=== 模拟完成 ===")
    print("观察后端日志确认:")
    print("- 测试1 应该标记为已服药")
    print("- 测试2 应该不标记服药（红外防抖）")
    print("- 测试3 应该被忽略（状态机检查）")
    
    time.sleep(2)
    client.loop_stop()
    client.disconnect()
        
except KeyboardInterrupt:
    print("\n停止模拟")
    client.loop_stop()
    client.disconnect()
except Exception as e:
    print(f"Error: {e}")
