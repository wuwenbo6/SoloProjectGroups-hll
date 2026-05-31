import time
import json
import random
import threading
import struct
from collections import deque
from datetime import datetime
from flask import Flask
from flask_socketio import SocketIO, emit
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
import pandas as pd
import numpy as np
import os

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

class PDCRC:
    CRC32_POLY = 0xEDB88320
    CRC5_POLY = 0x05
    
    @staticmethod
    def crc32(data):
        crc = 0xFFFFFFFF
        for byte in data:
            crc ^= byte
            for _ in range(8):
                if crc & 1:
                    crc = (crc >> 1) ^ PDCRC.CRC32_POLY
                else:
                    crc >>= 1
        return crc ^ 0xFFFFFFFF
    
    @staticmethod
    def crc5(data):
        crc = 0x1F
        for byte in data:
            crc ^= byte
            for _ in range(8):
                if crc & 0x01:
                    crc = (crc >> 1) ^ PDCRC.CRC5_POLY
                else:
                    crc >>= 1
        return crc & 0x1F

class MovingAverageFilter:
    def __init__(self, window_size=5):
        self.window_size = window_size
        self.voltage_window = deque(maxlen=window_size)
        self.current_window = deque(maxlen=window_size)
    
    def reset(self):
        self.voltage_window.clear()
        self.current_window.clear()
    
    def apply(self, voltage, current):
        self.voltage_window.append(voltage)
        self.current_window.append(current)
        
        filtered_voltage = sum(self.voltage_window) / len(self.voltage_window)
        filtered_current = sum(self.current_window) / len(self.current_window)
        
        return filtered_voltage, filtered_current

class USBIFComplianceTest:
    TEST_ITEMS = [
        {"id": "TD.1.1", "name": "源能力消息检测", "category": "协议层"},
        {"id": "TD.1.2", "name": "请求消息格式验证", "category": "协议层"},
        {"id": "TD.1.3", "name": "接受消息时序检测", "category": "协议层"},
        {"id": "TD.1.4", "name": "PS_RDY消息超时检测", "category": "协议层"},
        {"id": "TD.2.1", "name": "5V电压精度测试", "category": "电气层"},
        {"id": "TD.2.2", "name": "9V电压精度测试", "category": "电气层"},
        {"id": "TD.2.3", "name": "15V电压精度测试", "category": "电气层"},
        {"id": "TD.2.4", "name": "20V电压精度测试", "category": "电气层"},
        {"id": "TD.3.1", "name": "PPS电压范围验证", "category": "PPS测试"},
        {"id": "TD.3.2", "name": "PPS电压步进测试", "category": "PPS测试"},
        {"id": "TD.3.3", "name": "PPS电流限制测试", "category": "PPS测试"},
        {"id": "TD.4.1", "name": "CRC校验完整性", "category": "数据完整性"},
        {"id": "TD.4.2", "name": "消息ID连续性", "category": "数据完整性"},
        {"id": "TD.4.3", "name": "数据包丢失率", "category": "数据完整性"},
        {"id": "TD.5.1", "name": "电压上升时间", "category": "时序测试"},
        {"id": "TD.5.2", "name": "电压下降时间", "category": "时序测试"},
        {"id": "TD.5.3", "name": "PDO切换响应时间", "category": "时序测试"}
    ]
    
    def __init__(self):
        self.test_results = {}
        self.is_running = False
        self.current_test_index = 0
    
    def reset(self):
        self.test_results = {}
        self.current_test_index = 0
    
    def run_test(self, test_id, analyzer_data):
        test_item = next((t for t in self.TEST_ITEMS if t["id"] == test_id), None)
        if not test_item:
            return None
        
        result = {
            "id": test_id,
            "name": test_item["name"],
            "category": test_item["category"],
            "passed": True,
            "details": "",
            "timestamp": time.time() * 1000
        }
        
        if test_id == "TD.1.1":
            result["passed"] = analyzer_data.get("has_source_cap", True)
            result["details"] = "源能力消息已检测" if result["passed"] else "未检测到源能力消息"
        
        elif test_id == "TD.1.2":
            result["passed"] = analyzer_data.get("request_format_valid", True)
            result["details"] = "请求消息格式正确" if result["passed"] else "请求消息格式错误"
        
        elif test_id == "TD.1.3":
            result["passed"] = random.random() > 0.05
            result["details"] = "接受消息时序正常" if result["passed"] else "接受消息时序异常"
        
        elif test_id == "TD.1.4":
            ps_rdy_time = analyzer_data.get("ps_rdy_time", 25)
            result["passed"] = ps_rdy_time < 100
            result["details"] = f"PS_RDY响应时间: {ps_rdy_time}ms" if result["passed"] else f"PS_RDY超时: {ps_rdy_time}ms > 100ms"
        
        elif test_id in ["TD.2.1", "TD.2.2", "TD.2.3", "TD.2.4"]:
            target_voltages = {"TD.2.1": 5.0, "TD.2.2": 9.0, "TD.2.3": 15.0, "TD.2.4": 20.0}
            target = target_voltages[test_id]
            actual = analyzer_data.get("voltage", target)
            accuracy = abs(actual - target) / target * 100
            result["passed"] = accuracy <= 5.0
            result["details"] = f"目标: {target}V, 实际: {actual:.2f}V, 误差: {accuracy:.2f}%"
        
        elif test_id == "TD.3.1":
            min_v = analyzer_data.get("pps_min_v", 3.0)
            max_v = analyzer_data.get("pps_max_v", 21.0)
            result["passed"] = min_v <= 3.3 and max_v >= 16.0
            result["details"] = f"PPS范围: {min_v}-{max_v}V"
        
        elif test_id == "TD.3.2":
            step_size = analyzer_data.get("pps_step", 20)
            result["passed"] = step_size <= 50
            result["details"] = f"电压步进: {step_size}mV"
        
        elif test_id == "TD.3.3":
            current_limit = analyzer_data.get("current_limit", 5.0)
            result["passed"] = current_limit >= 3.0
            result["details"] = f"电流限制: {current_limit}A"
        
        elif test_id == "TD.4.1":
            crc_errors = analyzer_data.get("crc_errors", 0)
            result["passed"] = crc_errors == 0
            result["details"] = f"CRC错误数: {crc_errors}"
        
        elif test_id == "TD.4.2":
            msg_gaps = analyzer_data.get("msg_gaps", 0)
            result["passed"] = msg_gaps == 0
            result["details"] = f"消息ID断档数: {msg_gaps}"
        
        elif test_id == "TD.4.3":
            loss_rate = analyzer_data.get("loss_rate", 0.0)
            result["passed"] = loss_rate < 1.0
            result["details"] = f"丢包率: {loss_rate:.2f}%"
        
        elif test_id == "TD.5.1":
            rise_time = analyzer_data.get("rise_time", 2.5)
            result["passed"] = rise_time < 15
            result["details"] = f"电压上升时间: {rise_time}ms"
        
        elif test_id == "TD.5.2":
            fall_time = analyzer_data.get("fall_time", 3.0)
            result["passed"] = fall_time < 20
            result["details"] = f"电压下降时间: {fall_time}ms"
        
        elif test_id == "TD.5.3":
            switch_time = analyzer_data.get("switch_time", 30)
            result["passed"] = switch_time < 100
            result["details"] = f"PDO切换时间: {switch_time}ms"
        
        self.test_results[test_id] = result
        return result
    
    def get_summary(self):
        total = len(self.test_results)
        passed = sum(1 for r in self.test_results.values() if r["passed"])
        categories = {}
        for r in self.test_results.values():
            cat = r["category"]
            if cat not in categories:
                categories[cat] = {"total": 0, "passed": 0}
            categories[cat]["total"] += 1
            if r["passed"]:
                categories[cat]["passed"] += 1
        
        return {
            "total_tests": total,
            "passed_tests": passed,
            "failed_tests": total - passed,
            "pass_rate": (passed / total * 100) if total > 0 else 0,
            "categories": categories,
            "results": list(self.test_results.values())
        }

class PDPort:
    def __init__(self, port_id, name):
        self.port_id = port_id
        self.name = name
        self.is_connected = False
        self.is_capturing = False
        self.data_history = []
        self.current_voltage = 5.0
        self.current_current = 0.5
        self.target_voltage = 5.0
    
    def reset(self):
        self.data_history = []
        self.current_voltage = 5.0
        self.current_current = 0.5
        self.target_voltage = 5.0

class PDAnalyzer:
    def __init__(self):
        self.is_capturing = False
        self.is_connected = False
        self.capture_thread = None
        self.data_history = []
        self.raw_data_history = []
        self.current_voltage = 5.0
        self.current_current = 0.5
        self.target_voltage = 5.0
        self.pps_min_voltage = 3.0
        self.pps_max_voltage = 21.0
        self.pps_max_current = 5.0
        self.pdos = [
            {"type": "Fixed", "voltage": 5.0, "current": 3.0, "pdos_index": 0},
            {"type": "Fixed", "voltage": 9.0, "current": 3.0, "pdos_index": 1},
            {"type": "Fixed", "voltage": 12.0, "current": 2.5, "pdos_index": 2},
            {"type": "Fixed", "voltage": 15.0, "current": 2.0, "pdos_index": 3},
            {"type": "Fixed", "voltage": 20.0, "current": 1.5, "pdos_index": 4},
            {"type": "PPS", "voltage_min": 3.0, "voltage_max": 21.0, "current": 5.0, "pdos_index": 5}
        ]
        self.capture_start_time = None
        
        self.crc_error_count = 0
        self.packet_loss_count = 0
        self.total_packets = 0
        self.last_message_id = 0
        
        self.filter = MovingAverageFilter(window_size=5)
        self.enable_filter = True
        
        self.ports = [
            PDPort(0, "Port 1 - CC1"),
            PDPort(1, "Port 2 - CC2"),
            PDPort(2, "Port 3 - SBU1"),
            PDPort(3, "Port 4 - SBU2")
        ]
        self.current_port_index = 0
        self.polling_enabled = False
        self.polling_interval = 1.0
        self.last_poll_time = 0
        
        self.compliance_test = USBIFComplianceTest()
        self.test_thread = None

    def connect_device(self):
        self.is_connected = True
        return True

    def start_capture(self):
        if not self.is_connected:
            return False
        self.is_capturing = True
        self.capture_start_time = time.time()
        self.data_history = []
        self.raw_data_history = []
        self.filter.reset()
        self.crc_error_count = 0
        self.packet_loss_count = 0
        self.total_packets = 0
        self.last_message_id = 0
        self.capture_thread = threading.Thread(target=self._capture_loop)
        self.capture_thread.daemon = True
        self.capture_thread.start()
        return True

    def stop_capture(self):
        self.is_capturing = False
        if self.capture_thread:
            self.capture_thread.join(timeout=1.0)
        return True

    def _capture_loop(self):
        message_types = [
            "Source Capabilities",
            "Request",
            "Accept",
            "PS_RDY",
            "GoodCRC",
            "Vendor Defined"
        ]
        
        while self.is_capturing:
            timestamp = time.time() * 1000
            self.total_packets += 1
            
            if self.polling_enabled and time.time() - self.last_poll_time > self.polling_interval:
                self._poll_next_port()
                self.last_poll_time = time.time()
            
            current_port = self.ports[self.current_port_index] if self.ports else None
            
            voltage_noise = random.uniform(-0.05, 0.05)
            current_noise = random.uniform(-0.02, 0.02)
            
            spike_chance = 0.02 if abs(self.current_voltage - self.target_voltage) > 0.5 else 0.005
            if random.random() < spike_chance:
                voltage_noise *= 10
                current_noise *= 5
            
            if abs(self.current_voltage - self.target_voltage) > 0.01:
                voltage_step = (self.target_voltage - self.current_voltage) * 0.1
                self.current_voltage += voltage_step
            
            raw_voltage = max(0, self.current_voltage + voltage_noise)
            raw_current = max(0.1, 0.5 + (self.current_voltage - 5.0) * 0.05 + current_noise)
            
            self.raw_data_history.append({
                "timestamp": timestamp,
                "raw_voltage": round(raw_voltage, 3),
                "raw_current": round(raw_current, 3)
            })
            
            if self.enable_filter:
                filtered_voltage, filtered_current = self.filter.apply(raw_voltage, raw_current)
            else:
                filtered_voltage, filtered_current = raw_voltage, raw_current
            
            data_point = {
                "timestamp": timestamp,
                "voltage": round(filtered_voltage, 3),
                "current": round(filtered_current, 3),
                "power": round(filtered_voltage * filtered_current, 3),
                "raw_voltage": round(raw_voltage, 3),
                "raw_current": round(raw_current, 3),
                "filtered": self.enable_filter,
                "port_index": self.current_port_index,
                "port_name": current_port.name if current_port else "Default"
            }
            self.data_history.append(data_point)
            
            if current_port:
                current_port.data_history.append({
                    "timestamp": timestamp,
                    "voltage": round(filtered_voltage, 3),
                    "current": round(filtered_current, 3)
                })
                current_port.current_voltage = filtered_voltage
                current_port.current_current = filtered_current
            
            socketio.emit("pd_data", data_point)
            
            if random.random() < 0.15:
                msg_type = random.choice(message_types)
                direction = random.choice(["Host → Device", "Device → Host"])
                message_id = self.last_message_id + 1
                
                msg_content = self._generate_message_content(msg_type)
                msg_bytes = msg_content.encode('utf-8')
                expected_crc = PDCRC.crc32(msg_bytes)
                
                crc_error = random.random() < 0.03
                if crc_error:
                    self.crc_error_count += 1
                    actual_crc = expected_crc ^ 0xFFFFFFFF
                else:
                    actual_crc = expected_crc
                
                packet_loss = random.random() < 0.02
                if packet_loss:
                    self.packet_loss_count += 1
                    message_id += 1
                
                self.last_message_id = message_id
                
                socketio.emit("pd_data", {
                    "timestamp": timestamp,
                    "voltage": round(filtered_voltage, 3),
                    "current": round(filtered_current, 3),
                    "direction": direction,
                    "message_type": msg_type,
                    "message": msg_content,
                    "message_id": message_id,
                    "crc_valid": not crc_error,
                    "expected_crc": hex(expected_crc),
                    "actual_crc": hex(actual_crc),
                    "crc_error_count": self.crc_error_count,
                    "packet_loss_count": self.packet_loss_count,
                    "total_packets": self.total_packets,
                    "port_index": self.current_port_index,
                    "port_name": current_port.name if current_port else "Default"
                })
            
            if len(self.data_history) % 10 == 0:
                analysis = self.analyze_pps_compliance()
                analysis["crc_error_count"] = self.crc_error_count
                analysis["packet_loss_count"] = self.packet_loss_count
                analysis["total_packets"] = self.total_packets
                analysis["current_port"] = self.current_port_index
                analysis["port_name"] = current_port.name if current_port else "Default"
                analysis["polling_enabled"] = self.polling_enabled
                socketio.emit("pps_analysis", analysis)
            
            time.sleep(0.1)
    
    def _poll_next_port(self):
        self.current_port_index = (self.current_port_index + 1) % len(self.ports)
        current_port = self.ports[self.current_port_index]
        current_port.is_connected = True
        socketio.emit("port_changed", {
            "port_index": self.current_port_index,
            "port_name": current_port.name,
            "port_voltage": current_port.current_voltage,
            "port_current": current_port.current_current
        })
    
    def select_port(self, port_index):
        if 0 <= port_index < len(self.ports):
            self.current_port_index = port_index
            return True
        return False
    
    def set_polling(self, enabled, interval=1.0):
        self.polling_enabled = enabled
        self.polling_interval = interval
        self.last_poll_time = time.time()
        return True
    
    def get_ports_status(self):
        return [
            {
                "index": p.port_id,
                "name": p.name,
                "connected": p.is_connected,
                "capturing": p.is_capturing,
                "voltage": round(p.current_voltage, 2),
                "current": round(p.current_current, 2)
            }
            for p in self.ports
        ]
    
    def start_compliance_test(self):
        if self.compliance_test.is_running:
            return False
        self.compliance_test.reset()
        self.compliance_test.is_running = True
        self.test_thread = threading.Thread(target=self._compliance_test_loop)
        self.test_thread.daemon = True
        self.test_thread.start()
        return True
    
    def _compliance_test_loop(self):
        test_data = {
            "voltage": self.current_voltage,
            "crc_errors": self.crc_error_count,
            "loss_rate": (self.packet_loss_count / self.total_packets * 100) if self.total_packets > 0 else 0,
            "pps_min_v": self.pps_min_voltage,
            "pps_max_v": self.pps_max_voltage,
            "ps_rdy_time": random.uniform(20, 80),
            "rise_time": random.uniform(1.5, 4.5),
            "fall_time": random.uniform(2.0, 5.0),
            "switch_time": random.uniform(20, 50)
        }
        
        for i, test_item in enumerate(USBIFComplianceTest.TEST_ITEMS):
            if not self.compliance_test.is_running:
                break
            
            result = self.compliance_test.run_test(test_item["id"], test_data)
            
            socketio.emit("test_progress", {
                "current": i + 1,
                "total": len(USBIFComplianceTest.TEST_ITEMS),
                "result": result
            })
            
            time.sleep(0.3)
        
        summary = self.compliance_test.get_summary()
        socketio.emit("test_complete", {"summary": summary})
        self.compliance_test.is_running = False
    
    def stop_compliance_test(self):
        self.compliance_test.is_running = False
        return True
    
    def get_test_summary(self):
        return self.compliance_test.get_summary()
    
    def export_waveform_csv(self):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"pd_waveform_{timestamp}.csv"
        filepath = os.path.join(os.path.expanduser("~"), "Documents", filename)
        
        df = pd.DataFrame(self.data_history)
        
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            df = df.rename(columns={'timestamp': 'time'})
        
        columns_order = ['time', 'voltage', 'current', 'power', 'raw_voltage', 'raw_current']
        for col in columns_order:
            if col not in df.columns and col != 'time':
                df[col] = None
        
        if 'time' in df.columns:
            columns_order = ['time'] + [c for c in columns_order if c != 'time']
            df = df[columns_order]
        
        df.to_csv(filepath, index=False, float_format='%.3f')
        return {"success": True, "path": filepath, "filename": filename, "rows": len(df)}

    def _generate_message_content(self, msg_type):
        if msg_type == "Source Capabilities":
            return f"PDOs: 5V/3A, 9V/3A, 12V/2.5A, 15V/2A, 20V/1.5A, PPS 3-21V/5A"
        elif msg_type == "Request":
            return f"Requesting {self.target_voltage}V"
        elif msg_type == "Accept":
            return "Request accepted"
        elif msg_type == "PS_RDY":
            return "Power supply ready"
        elif msg_type == "GoodCRC":
            return "CRC check passed"
        else:
            return "Vendor defined message"

    def set_voltage(self, voltage):
        if not self.is_connected:
            return False
        self.target_voltage = max(self.pps_min_voltage, min(voltage, self.pps_max_voltage))
        return True

    def analyze_pps_compliance(self):
        if len(self.data_history) < 10:
            return {
                "compliant": True,
                "voltage_accuracy": 0.0,
                "current_accuracy": 0.0,
                "ripple_noise": 0.0,
                "response_time": 0.0,
                "voltage_pass": True,
                "current_pass": True,
                "ripple_pass": True,
                "response_pass": True,
                "pps_supported": True,
                "issues": []
            }
        
        recent_data = self.data_history[-50:]
        voltages = [d["voltage"] for d in recent_data]
        currents = [d["current"] for d in recent_data]
        
        voltage_mean = np.mean(voltages)
        voltage_std = np.std(voltages)
        current_mean = np.mean(currents)
        current_std = np.std(currents)
        
        voltage_accuracy = abs((voltage_mean - self.target_voltage) / self.target_voltage * 100) if self.target_voltage > 0 else 0
        current_accuracy = abs((current_mean - 0.5) / 0.5 * 100) if 0.5 > 0 else 0
        
        ripple_noise = voltage_std * 1000
        response_time = round(random.uniform(15, 30), 1)
        
        voltage_pass = voltage_accuracy <= 5.0
        current_pass = current_accuracy <= 5.0
        ripple_pass = ripple_noise <= 100
        response_pass = response_time <= 100
        
        issues = []
        compliant = True
        
        if voltage_accuracy > 5.0:
            issues.append(f"电压精度超标: {voltage_accuracy:.2f}% > 5%")
            compliant = False
        
        if ripple_noise > 100:
            issues.append(f"纹波噪声超标: {ripple_noise:.1f}mV > 100mV")
            compliant = False
        
        if self.target_voltage < self.pps_min_voltage or self.target_voltage > self.pps_max_voltage:
            issues.append(f"电压超出PPS范围: {self.target_voltage}V (允许范围: {self.pps_min_voltage}-{self.pps_max_voltage}V)")
            compliant = False
        
        return {
            "compliant": compliant,
            "voltage_accuracy": round(voltage_accuracy, 2),
            "current_accuracy": round(current_accuracy, 2),
            "ripple_noise": round(ripple_noise, 1),
            "response_time": response_time,
            "voltage_pass": voltage_pass,
            "current_pass": current_pass,
            "ripple_pass": ripple_pass,
            "response_pass": response_pass,
            "pps_supported": True,
            "issues": issues,
            "target_voltage": self.target_voltage,
            "actual_voltage": round(voltage_mean, 3),
            "min_voltage": self.pps_min_voltage,
            "max_voltage": self.pps_max_voltage
        }

    def export_report(self, format_type="pdf"):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"pd_analyzer_report_{timestamp}.{format_type}"
        filepath = os.path.join(os.path.expanduser("~"), "Documents", filename)
        
        analysis = self.analyze_pps_compliance()
        analysis["crc_error_count"] = self.crc_error_count
        analysis["packet_loss_count"] = self.packet_loss_count
        analysis["total_packets"] = self.total_packets
        analysis["filter_enabled"] = self.enable_filter
        
        if format_type == "pdf":
            self._export_pdf(filepath, analysis)
        elif format_type == "csv":
            self._export_csv(filepath)
        
        return {"success": True, "path": filepath, "filename": filename}

    def _export_pdf(self, filepath, analysis):
        c = canvas.Canvas(filepath, pagesize=letter)
        width, height = letter
        
        c.setFont("Helvetica-Bold", 20)
        c.drawString(50, height - 50, "USB PD Analyzer Test Report")
        
        c.setFont("Helvetica", 12)
        c.drawString(50, height - 80, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        c.setFont("Helvetica-Bold", 14)
        c.drawString(50, height - 120, "1. PPS Compliance Analysis")
        
        c.setFont("Helvetica", 12)
        y = height - 150
        c.drawString(70, y, f"Compliance Status: {'PASS' if analysis['compliant'] else 'FAIL'}")
        y -= 25
        c.drawString(70, y, f"Voltage Accuracy: {analysis['voltage_accuracy']}%")
        y -= 25
        c.drawString(70, y, f"Current Accuracy: {analysis['current_accuracy']}%")
        y -= 25
        c.drawString(70, y, f"Ripple Noise: {analysis['ripple_noise']} mV")
        y -= 25
        c.drawString(70, y, f"Response Time: {analysis['response_time']} ms")
        y -= 25
        c.drawString(70, y, f"PPS Supported: {'Yes' if analysis['pps_supported'] else 'No'}")
        
        y -= 40
        c.setFont("Helvetica-Bold", 14)
        c.drawString(50, y, "2. Data Integrity Analysis")
        
        c.setFont("Helvetica", 12)
        y -= 30
        c.drawString(70, y, f"CRC Errors: {analysis.get('crc_error_count', 0)}")
        y -= 25
        c.drawString(70, y, f"Packet Loss: {analysis.get('packet_loss_count', 0)}")
        y -= 25
        c.drawString(70, y, f"Total Packets: {analysis.get('total_packets', 0)}")
        y -= 25
        c.drawString(70, y, f"Filter Enabled: {'Yes (Moving Average)' if analysis.get('filter_enabled', False) else 'No'}")
        
        if analysis['issues']:
            y -= 40
            c.setFont("Helvetica-Bold", 12)
            c.drawString(50, y, "Issues Found:")
            c.setFillColor(colors.red)
            for i, issue in enumerate(analysis['issues']):
                y -= 25
                c.setFont("Helvetica", 10)
                c.drawString(70, y, f"• {issue}")
            c.setFillColor(colors.black)
        
        y -= 40
        c.setFont("Helvetica-Bold", 14)
        c.drawString(50, y, "3. Test Summary")
        
        c.setFont("Helvetica", 12)
        y -= 30
        c.drawString(70, y, f"Total Data Points: {len(self.data_history)}")
        y -= 25
        c.drawString(70, y, f"Target Voltage: {self.target_voltage} V")
        y -= 25
        c.drawString(70, y, f"PPS Voltage Range: {self.pps_min_voltage} - {self.pps_max_voltage} V")
        
        c.save()

    def _export_csv(self, filepath):
        df = pd.DataFrame(self.data_history)
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.to_csv(filepath, index=False)

analyzer = PDAnalyzer()

@socketio.on('connect')
def handle_connect():
    print("Client connected")
    emit("device_status", {"status": "Ready", "connected": analyzer.is_connected})

@socketio.on('disconnect')
def handle_disconnect():
    print("Client disconnected")
    analyzer.stop_capture()

@socketio.on('start_capture')
def handle_start_capture():
    success = analyzer.start_capture()
    emit("device_status", {"status": "Capturing" if success else "Failed to start", "connected": analyzer.is_connected})

@socketio.on('stop_capture')
def handle_stop_capture():
    success = analyzer.stop_capture()
    emit("device_status", {"status": "Stopped", "connected": analyzer.is_connected})

@socketio.on('connect_device')
def handle_connect_device():
    success = analyzer.connect_device()
    emit("device_status", {"status": "Connected" if success else "Failed to connect", "connected": success})

@socketio.on('set_voltage')
def handle_set_voltage(data):
    voltage = data.get('voltage', 5.0)
    success = analyzer.set_voltage(voltage)
    return {"success": success}

@socketio.on('get_pdos')
def handle_get_pdos():
    return {"success": True, "pdos": analyzer.pdos}

@socketio.on('export_report')
def handle_export_report(data):
    format_type = data.get('format', 'pdf')
    result = analyzer.export_report(format_type)
    emit("report_exported", result)

@socketio.on('select_port')
def handle_select_port(data):
    port_index = data.get('port_index', 0)
    success = analyzer.select_port(port_index)
    emit("select_port_response", {"success": success, "ports": analyzer.get_ports_status()})

@socketio.on('set_polling')
def handle_set_polling(data):
    enabled = data.get('enabled', False)
    interval = data.get('interval', 1.0)
    success = analyzer.set_polling(enabled, interval)
    emit("set_polling_response", {"success": success, "polling_enabled": enabled, "interval": interval})

@socketio.on('get_ports_status')
def handle_get_ports_status():
    emit("get_ports_status_response", {"success": True, "ports": analyzer.get_ports_status()})

@socketio.on('start_compliance_test')
def handle_start_compliance_test():
    success = analyzer.start_compliance_test()
    emit("start_compliance_test_response", {"success": success})

@socketio.on('stop_compliance_test')
def handle_stop_compliance_test():
    success = analyzer.stop_compliance_test()
    emit("stop_compliance_test_response", {"success": success})

@socketio.on('get_test_summary')
def handle_get_test_summary():
    emit("get_test_summary_response", analyzer.get_test_summary())

@socketio.on('export_waveform_csv')
def handle_export_waveform_csv():
    result = analyzer.export_waveform_csv()
    emit("waveform_exported", result)

if __name__ == "__main__":
    print("Starting PD Analyzer Backend Server on port 5000...")
    socketio.run(app, host='127.0.0.1', port=5000, debug=False)
