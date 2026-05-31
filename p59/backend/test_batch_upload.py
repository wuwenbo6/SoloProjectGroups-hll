import requests
import json
from datetime import datetime, timedelta

API_URL = "http://localhost:8000/sensor-data/batch"

def test_batch_upload():
    device_id = "pillbox_001"
    base_time = datetime.now() - timedelta(minutes=30)
    
    print("=== 批量数据上传测试（模拟离线数据补发） ===\n")
    
    test_data = []
    
    test_data.append({
        "sensor_type": "hall",
        "value": 1,
        "timestamp": (base_time + timedelta(seconds=0)).isoformat()
    })
    
    for i in range(3):
        test_data.append({
            "sensor_type": "ir",
            "value": 0,
            "timestamp": (base_time + timedelta(seconds=2 + i*0.5)).isoformat()
        })
    
    test_data.append({
        "sensor_type": "hall",
        "value": 0,
        "timestamp": (base_time + timedelta(seconds=10)).isoformat()
    })
    
    test_data.append({
        "sensor_type": "hall",
        "value": 1,
        "timestamp": (base_time + timedelta(minutes=10)).isoformat()
    })
    
    test_data.append({
        "sensor_type": "ir",
        "value": 0,
        "timestamp": (base_time + timedelta(minutes=10, seconds=3)).isoformat()
    })
    
    test_data.append({
        "sensor_type": "hall",
        "value": 0,
        "timestamp": (base_time + timedelta(minutes=10, seconds=15)).isoformat()
    })
    
    print(f"准备上传 {len(test_data)} 条离线数据:")
    for item in test_data:
        t = item['timestamp'].replace('T', ' ').split('.')[0]
        print(f"  {t} - {item['sensor_type']}={item['value']}")
    
    print("\n发送批量上传请求...")
    
    payload = {
        "device_id": device_id,
        "data": test_data,
        "is_offline_data": True
    }
    
    try:
        response = requests.post(API_URL, json=payload, timeout=10)
        
        print(f"\n响应状态码: {response.status_code}")
        print(f"响应内容: {json.dumps(response.json(), ensure_ascii=False, indent=2)}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                print(f"\n✅ 上传成功！")
                print(f"   - 处理记录数: {result.get('processed_count')}")
                print(f"   - 是否检测到服药: {'是' if result.get('medication_taken') else '否'}")
            else:
                print(f"\n❌ 上传失败: {result.get('message')}")
    except Exception as e:
        print(f"\n❌ 请求失败: {e}")
        print("请确保后端服务正在运行 (http://localhost:8000)")

if __name__ == "__main__":
    test_batch_upload()
