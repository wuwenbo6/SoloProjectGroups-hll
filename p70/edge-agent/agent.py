#!/usr/bin/env python3
import os
import sys
import time
import json
import socket
import psutil
import requests
import argparse
import uuid
from datetime import datetime

class EdgeAgent:
    def __init__(self, manager_url, node_name=None, role="worker", labels=None, interval=60, fast_interval=None):
        self.manager_url = manager_url.rstrip('/')
        self.node_id = None
        self.node_name = node_name or socket.gethostname()
        self.hostname = socket.gethostname()
        self.role = role
        self.labels = labels or {}
        self.interval = interval
        self.fast_interval = fast_interval or max(15, interval // 4)
        self.current_interval = interval
        self.consecutive_failures = 0
        self.failure_threshold = 3
        
    def get_gpu_info(self):
        gpu_count = 0
        gpu_type = ""
        gpu_used = 0.0
        gpu_memory_used = 0
        gpu_memory_total = 0
        
        try:
            import subprocess
            result = subprocess.run(
                ['nvidia-smi', '--query-gpu=count,name,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')
                if lines and lines[0]:
                    parts = [p.strip() for p in lines[0].split(',')]
                    if len(parts) >= 5:
                        gpu_count = int(parts[0])
                        gpu_type = parts[1]
                        gpu_used = float(parts[2].replace('%', ''))
                        gpu_memory_used = int(parts[3])
                        gpu_memory_total = int(parts[4])
        except Exception as e:
            pass
        
        return {
            "gpu_count": gpu_count,
            "gpu_type": gpu_type,
            "gpu_used": gpu_used,
            "gpu_memory_used": gpu_memory_used,
            "gpu_memory_total": gpu_memory_total
        }

    def get_system_info(self):
        cpu_cores = psutil.cpu_count(logical=False) or psutil.cpu_count() or 4
        memory_mb = psutil.virtual_memory().total // (1024 * 1024)
        cpu_used = psutil.cpu_percent(interval=1)
        memory_used = psutil.virtual_memory().used // (1024 * 1024)
        
        try:
            ip_address = socket.gethostbyname(socket.gethostname())
        except:
            ip_address = self.get_external_ip()
        
        gpu_info = self.get_gpu_info()
        
        return {
            "name": self.node_name,
            "hostname": self.hostname,
            "ip_address": ip_address,
            "role": self.role,
            "cpu_cores": cpu_cores,
            "memory_mb": memory_mb,
            "cpu_used": cpu_used,
            "memory_used": memory_used,
            "gpu_count": gpu_info["gpu_count"],
            "gpu_type": gpu_info["gpu_type"],
            "gpu_used": gpu_info["gpu_used"],
            "gpu_memory_used": gpu_info["gpu_memory_used"],
            "gpu_memory_total": gpu_info["gpu_memory_total"],
            "labels": self.labels
        }
    
    def get_external_ip(self):
        try:
            response = requests.get('https://api.ipify.org', timeout=5)
            return response.text
        except:
            return '127.0.0.1'
    
    def register(self):
        info = self.get_system_info()
        info["id"] = self.node_id or str(uuid.uuid4())
        
        try:
            response = requests.post(
                f"{self.manager_url}/api/v1/nodes/register",
                json=info,
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            self.node_id = data.get("node_id", info["id"])
            print(f"[{datetime.now()}] Node registered successfully: {self.node_id}")
            return True
        except Exception as e:
            print(f"[{datetime.now()}] Failed to register node: {e}")
            return False
    
    def send_heartbeat(self):
        if not self.node_id:
            return self.register()
        
        info = self.get_system_info()
        
        try:
            response = requests.post(
                f"{self.manager_url}/api/v1/nodes/heartbeat",
                json={
                    "node_id": self.node_id,
                    "cpu_used": info["cpu_used"],
                    "memory_used": info["memory_used"]
                },
                timeout=10
            )
            response.raise_for_status()
            
            self.consecutive_failures = 0
            self.current_interval = self.interval
            
            print(f"[{datetime.now()}] Heartbeat sent - CPU: {info['cpu_used']:.1f}%, Mem: {info['memory_used']}MB, Interval: {self.current_interval}s")
            return True
        except Exception as e:
            self.consecutive_failures += 1
            print(f"[{datetime.now()}] Failed to send heartbeat (attempt {self.consecutive_failures}): {e}")
            
            if self.consecutive_failures >= self.failure_threshold:
                self.current_interval = self.fast_interval
                print(f"[{datetime.now()}] Switching to fast interval: {self.current_interval}s")
            
            return False
    
    def run(self):
        print(f"Starting Edge Agent for node: {self.node_name}")
        print(f"Manager URL: {self.manager_url}")
        print(f"Node role: {self.role}")
        print(f"Normal interval: {self.interval}s")
        print(f"Fast interval: {self.fast_interval}s")
        print("-" * 50)
        
        if not self.register():
            print("Warning: Initial registration failed, will retry...")
        
        while True:
            try:
                if not self.send_heartbeat():
                    if self.consecutive_failures >= self.failure_threshold:
                        self.register()
                time.sleep(self.current_interval)
            except KeyboardInterrupt:
                print("\nShutting down agent...")
                sys.exit(0)
            except Exception as e:
                print(f"[{datetime.now()}] Error in main loop: {e}")
                time.sleep(self.current_interval)

def main():
    parser = argparse.ArgumentParser(description='Edge Node Agent for Swarm Cluster Manager')
    parser.add_argument('--manager', required=True, help='Manager URL (e.g., http://localhost:8080)')
    parser.add_argument('--name', help='Node name (default: hostname)')
    parser.add_argument('--role', default='worker', choices=['worker', 'manager'], help='Node role')
    parser.add_argument('--labels', nargs='*', help='Node labels in format key=value')
    parser.add_argument('--interval', type=int, default=60, help='Normal heartbeat interval in seconds (default: 60)')
    parser.add_argument('--fast-interval', type=int, help='Fast heartbeat interval on failures (default: interval/4, min 15)')
    parser.add_argument('--failure-threshold', type=int, default=3, help='Consecutive failures before switching to fast mode')
    
    args = parser.parse_args()
    
    labels = {}
    if args.labels:
        for label in args.labels:
            if '=' in label:
                key, value = label.split('=', 1)
                labels[key] = value
    
    agent = EdgeAgent(
        manager_url=args.manager,
        node_name=args.name,
        role=args.role,
        labels=labels,
        interval=args.interval,
        fast_interval=args.fast_interval
    )
    agent.failure_threshold = args.failure_threshold
    agent.run()

if __name__ == '__main__':
    main()
