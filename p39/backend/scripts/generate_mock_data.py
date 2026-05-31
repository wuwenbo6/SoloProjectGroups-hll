import json
import random
import time
from datetime import datetime
from kafka import KafkaProducer
import threading

KAFKA_TOPIC = "probe_data"
KAFKA_SERVERS = "localhost:9092"

MOCK_MACS = [
    "00:1A:2B:3C:4D:5E", "02:1A:2B:3C:4D:5F", "06:1A:2B:3C:4D:60",
    "11:22:33:44:55:66", "12:22:33:44:55:67", "22:33:44:55:66:77",
    "2A:33:44:55:66:78", "33:44:55:66:77:88", "36:44:55:66:77:89",
    "44:55:66:77:88:99", "4A:55:66:77:88:9A", "55:66:77:88:99:AA",
    "66:77:88:99:AA:BB", "62:77:88:99:AA:BC", "77:88:99:AA:BB:CC",
    "88:99:AA:BB:CC:DD", "8E:99:AA:BB:CC:DE", "99:AA:BB:CC:DD:EE",
    "AA:BB:CC:DD:EE:FF", "A2:BB:CC:DD:EE:F0"
]

MOCK_APS = [
    {"ap_id": "AP-001", "zone": "waiting_area_1"},
    {"ap_id": "AP-002", "zone": "waiting_area_1"},
    {"ap_id": "AP-003", "zone": "waiting_area_2"},
    {"ap_id": "AP-004", "zone": "boarding_gate"},
    {"ap_id": "AP-005", "zone": "entrance"},
]


def generate_probe_data():
    ap = random.choice(MOCK_APS)
    mac = random.choice(MOCK_MACS)
    rssi = random.randint(-85, -45)

    return {
        "mac_address": mac,
        "rssi": rssi,
        "ap_id": ap["ap_id"],
        "timestamp": datetime.utcnow().isoformat(),
        "zone": ap["zone"]
    }


def send_mock_data(rate_per_second=5):
    producer = KafkaProducer(
        bootstrap_servers=KAFKA_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )

    print(f"Starting mock data generation at {rate_per_second} messages/second...")

    try:
        while True:
            for _ in range(rate_per_second):
                data = generate_probe_data()
                producer.send(KAFKA_TOPIC, value=data)
                print(f"Sent: {data['mac_address']} -> {data['zone']} RSSI:{data['rssi']}")
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping mock data generation...")
    finally:
        producer.close()


def send_burst_data(count=100):
    producer = KafkaProducer(
        bootstrap_servers=KAFKA_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )

    print(f"Sending burst of {count} messages...")
    for i in range(count):
        data = generate_probe_data()
        producer.send(KAFKA_TOPIC, value=data)
        if i % 10 == 0:
            print(f"Sent {i + 1}/{count}")

    producer.flush()
    producer.close()
    print("Done!")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "burst":
        count = int(sys.argv[2]) if len(sys.argv) > 2 else 100
        send_burst_data(count)
    else:
        rate = int(sys.argv[1]) if len(sys.argv) > 1 else 5
        send_mock_data(rate)
