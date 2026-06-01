#!/usr/bin/env python3
import json
import time
import requests
import random
import uuid

OTLP_ENDPOINT = "http://localhost:8080/v1/traces"

NAMESPACES = [
    "production",
    "staging",
    "development"
]

SERVICES = [
    "api-gateway",
    "user-service",
    "order-service",
    "payment-service",
    "inventory-service",
    "notification-service"
]

OPERATIONS = {
    "api-gateway": ["HTTP GET /api/users", "HTTP POST /api/orders", "HTTP GET /api/orders"],
    "user-service": ["GetUser", "CreateUser", "UpdateUser"],
    "order-service": ["CreateOrder", "GetOrder", "ListOrders"],
    "payment-service": ["ProcessPayment", "RefundPayment", "GetPaymentStatus"],
    "inventory-service": ["CheckStock", "UpdateStock", "ReserveStock"],
    "notification-service": ["SendEmail", "SendSMS", "SendPushNotification"]
}

def generate_span_id():
    return uuid.uuid4().hex[:16]

def generate_trace_id():
    return uuid.uuid4().hex

def create_otlp_span(trace_id, span_id, parent_span_id, service_name, operation_name, start_time, duration):
    return {
        "traceId": trace_id,
        "spanId": span_id,
        "parentSpanId": parent_span_id,
        "name": operation_name,
        "kind": random.randint(1, 3),
        "startTimeUnixNano": str(int(start_time * 1e9)),
        "endTimeUnixNano": str(int((start_time + duration) * 1e9)),
        "attributes": [
            {
                "key": "http.method",
                "value": {"stringValue": random.choice(["GET", "POST", "PUT", "DELETE"])}
            },
            {
                "key": "http.url",
                "value": {"stringValue": f"/api/{service_name}/{operation_name}"}
            },
            {
                "key": "service.name",
                "value": {"stringValue": service_name}
            }
        ],
        "status": {
            "code": random.choice([1, 2]) if random.random() > 0.9 else 1,
            "message": "OK" if random.random() > 0.9 else ""
        }
    }

def generate_trace():
    trace_id = generate_trace_id()
    spans = []
    
    base_time = time.time() - random.uniform(0, 3600)
    
    namespace = random.choice(NAMESPACES)
    
    service_order = ["api-gateway"]
    remaining = [s for s in SERVICES if s != "api-gateway"]
    service_order.extend(random.sample(remaining, random.randint(2, 4)))
    
    parent_span_id = ""
    for i, service in enumerate(service_order):
        span_id = generate_span_id()
        operation = random.choice(OPERATIONS[service])
        duration = random.uniform(0.01, 0.5)
        
        spans.append(create_otlp_span(
            trace_id,
            span_id,
            parent_span_id,
            service,
            operation,
            base_time,
            duration
        ))
        
        if i == 0:
            base_time += random.uniform(0.001, 0.01)
        
        if random.random() > 0.5:
            for _ in range(random.randint(1, 3)):
                child_span_id = generate_span_id()
                child_duration = random.uniform(0.005, 0.1)
                spans.append(create_otlp_span(
                    trace_id,
                    child_span_id,
                    span_id,
                    service,
                    f"{operation}.child",
                    base_time + random.uniform(0, duration * 0.5),
                    child_duration
                ))
        
        base_time += duration
        parent_span_id = span_id
    
    resource_spans = []
    for service in SERVICES:
        service_spans = [s for s in spans if s["attributes"][2]["value"]["stringValue"] == service]
        if service_spans:
            resource_spans.append({
                "resource": {
                    "attributes": [
                        {
                            "key": "service.name",
                            "value": {"stringValue": service}
                        },
                        {
                            "key": "service.namespace",
                            "value": {"stringValue": namespace}
                        },
                        {
                            "key": "service.version",
                            "value": {"stringValue": "1.0.0"}
                        }
                    ]
                },
                "scopeSpans": [
                    {
                        "scope": {
                            "name": "opentelemetry",
                            "version": "1.0.0"
                        },
                        "spans": service_spans
                    }
                ]
            })
    
    return {
        "resourceSpans": resource_spans
    }

def send_trace(trace_data):
    try {
        response = requests.post(OTLP_ENDPOINT, json=trace_data, timeout=5)
        result = response.json()
        rejected = result.get("partialSuccess", {}).get("rejectedSpans", 0)
        if rejected > 0:
            print(f"Sent trace: {response.status_code} (rejected: {rejected})")
        else:
            print(f"Sent trace: {response.status_code}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error sending trace: {e}")
        return False

def send_high_load_traces(count=100):
    print(f"Sending {count} traces in high load mode...")
    for i in range(count):
        trace_data = generate_trace()
        send_trace(trace_data)
    print(f"Finished sending {count} traces")

def main():
    print(f"Sending test traces to {OTLP_ENDPOINT}")
    print("Commands:")
    print("  Press Enter to send a single trace")
    print("  Type 'high' to send 100 traces (high load test)")
    print("  Type 'continuous' to continuously send traces")
    print("  Type 'quit' to exit")
    
    while True:
        try:
            cmd = input("> ").strip().lower()
            
            if cmd == "quit":
                break
            elif cmd == "high":
                send_high_load_traces(100)
            elif cmd == "continuous":
                count = 0
                try:
                    while True:
                        trace_data = generate_trace()
                        if send_trace(trace_data):
                            count += 1
                            if count % 10 == 0:
                                print(f"Total traces sent: {count}")
                        time.sleep(random.uniform(0.1, 0.5))
                except KeyboardInterrupt:
                    print(f"\nStopped. Total traces sent: {count}")
            else:
                trace_data = generate_trace()
                send_trace(trace_data)
                
        except KeyboardInterrupt:
            print("\nExiting...")
            break
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    main()
