import time
import threading
from typing import List, Dict, Optional, Callable
from dataclasses import dataclass
from enum import Enum


class CANoeInterfaceType(Enum):
    COM = "com"
    REST_API = "rest"
    SIMULATED = "simulated"


@dataclass
class CANoeSignal:
    name: str
    full_name: str
    value: float = 0.0
    raw_value: int = 0
    unit: str = ""
    min_value: Optional[float] = None
    max_value: Optional[float] = None


@dataclass
class CANoeMessage:
    name: str
    can_id: int
    dlc: int
    signals: List[CANoeSignal] = None
    
    def __post_init__(self):
        if self.signals is None:
            self.signals = []


@dataclass
class CANoeBus:
    name: str
    bus_type: str
    messages: List[CANoeMessage] = None
    
    def __post_init__(self):
        if self.messages is None:
            self.messages = []


class CANoeController:
    def __init__(self, interface_type: CANoeInterfaceType = CANoeInterfaceType.SIMULATED):
        self.interface_type = interface_type
        self.application = None
        self.measurement = None
        self.bus = None
        self.signals: Dict[str, CANoeSignal] = {}
        self.message_callbacks: List[Callable[[Dict], None]] = []
        self.is_connected = False
        self.is_running = False
        self.simulation_thread = None
        self._simulated_signals: Dict[str, float] = {}
        self._simulation_interval = 0.01

    def connect(self, config_path: Optional[str] = None) -> bool:
        try:
            if self.interface_type == CANoeInterfaceType.COM:
                return self._connect_com(config_path)
            elif self.interface_type == CANoeInterfaceType.REST_API:
                return self._connect_rest(config_path)
            else:
                return self._connect_simulated(config_path)
        except Exception as e:
            print(f"CANoe connection error: {e}")
            return False

    def _connect_com(self, config_path: Optional[str]) -> bool:
        try:
            import win32com.client
            
            self.application = win32com.client.Dispatch("CANoe.Application")
            
            if config_path:
                self.application.Open(config_path)
            
            self.measurement = self.application.Measurement
            self.is_connected = True
            return True
        except ImportError:
            print("pywin32 not available, falling back to simulated mode")
            return self._connect_simulated(config_path)
        except Exception as e:
            print(f"CANoe COM connection failed: {e}")
            return False

    def _connect_rest(self, config_path: Optional[str]) -> bool:
        try:
            import requests
            
            self.base_url = "http://localhost:5000"
            response = requests.get(f"{self.base_url}/api/v1/health")
            if response.status_code == 200:
                self.is_connected = True
                return True
        except Exception as e:
            print(f"CANoe REST connection failed: {e}")
        return False

    def _connect_simulated(self, config_path: Optional[str]) -> bool:
        self._init_simulated_signals()
        self.is_connected = True
        return True

    def _init_simulated_signals(self):
        self._simulated_signals = {
            "EngineSpeed": 800.0,
            "EngineTemp": 85.0,
            "VehicleSpeed": 0.0,
            "ThrottlePosition": 0.0,
            "BrakePressure": 0.0,
            "BatteryVoltage": 12.5,
            "FuelLevel": 75.0,
            "OilPressure": 3.5,
            "SteeringAngle": 0.0,
            "WheelSpeed_FL": 0.0,
            "WheelSpeed_FR": 0.0,
            "WheelSpeed_RL": 0.0,
            "WheelSpeed_RR": 0.0,
        }

    def disconnect(self):
        if self.is_running:
            self.stop_measurement()
        
        if self.interface_type == CANoeInterfaceType.COM and self.application:
            try:
                self.application.Quit()
            except:
                pass
        
        self.application = None
        self.measurement = None
        self.is_connected = False

    def start_measurement(self) -> bool:
        if not self.is_connected:
            return False
        
        if self.interface_type == CANoeInterfaceType.COM and self.measurement:
            self.measurement.Start()
            self.is_running = True
            self._start_message_monitor()
            return True
        elif self.interface_type == CANoeInterfaceType.SIMULATED:
            self.is_running = True
            self._start_simulation()
            return True
        
        return False

    def stop_measurement(self) -> bool:
        self.is_running = False
        
        if self.simulation_thread:
            self.simulation_thread.join(timeout=1.0)
            self.simulation_thread = None
        
        if self.interface_type == CANoeInterfaceType.COM and self.measurement:
            self.measurement.Stop()
        
        return True

    def _start_simulation(self):
        self.simulation_thread = threading.Thread(target=self._simulation_loop, daemon=True)
        self.simulation_thread.start()

    def _simulation_loop(self):
        time_step = 0.0
        while self.is_running:
            time_step += self._simulation_interval
            
            for name in self._simulated_signals:
                self._update_simulated_signal(name, time_step)
            
            msg = self._create_simulated_message(time_step)
            for callback in self.message_callbacks:
                callback(msg)
            
            time.sleep(self._simulation_interval)

    def _update_simulated_signal(self, signal_name: str, time_step: float):
        if signal_name == "EngineSpeed":
            base = 800 + 4000 * (1 + abs(hash(time_step) % 100) / 100) * 0.5
            self._simulated_signals[signal_name] = base
        elif signal_name == "VehicleSpeed":
            self._simulated_signals[signal_name] = 50 + 50 * abs(hash(time_step * 0.5) % 100) / 100
        elif signal_name == "EngineTemp":
            self._simulated_signals[signal_name] = 85 + 10 * abs(hash(time_step * 0.1) % 100) / 100
        elif signal_name == "ThrottlePosition":
            self._simulated_signals[signal_name] = 30 * abs(hash(time_step * 0.8) % 100) / 100
        elif signal_name == "BatteryVoltage":
            self._simulated_signals[signal_name] = 12.5 + 0.5 * abs(hash(time_step * 0.3) % 100) / 100
        else:
            self._simulated_signals[signal_name] = abs(hash(time_step * float(hash(signal_name) % 10)) % 100) / 10

    def _create_simulated_message(self, timestamp: float) -> Dict:
        can_id = 0x100 + int(hash(timestamp) % 5)
        data = [0] * 8
        
        if can_id == 0x100:
            speed = int(self._simulated_signals["EngineSpeed"])
            data[0] = (speed >> 8) & 0xFF
            data[1] = speed & 0xFF
            temp = int(self._simulated_signals["EngineTemp"] + 40)
            data[2] = temp & 0xFF
        elif can_id == 0x200:
            speed = int(self._simulated_signals["VehicleSpeed"] * 100)
            data[0] = (speed >> 8) & 0xFF
            data[1] = speed & 0xFF
        elif can_id == 0x300:
            throttle = int(self._simulated_signals["ThrottlePosition"])
            data[0] = throttle & 0xFF
        elif can_id == 0x400:
            voltage = int(self._simulated_signals["BatteryVoltage"] * 1000)
            data[0] = (voltage >> 8) & 0xFF
            data[1] = voltage & 0xFF
        
        return {
            'timestamp': timestamp,
            'can_id': can_id,
            'data': data,
            'dlc': 8,
            'is_extended': False,
            'source': 'canoe'
        }

    def _start_message_monitor(self):
        if self.interface_type == CANoeInterfaceType.COM:
            monitor_thread = threading.Thread(target=self._com_monitor_loop, daemon=True)
            monitor_thread.start()

    def _com_monitor_loop(self):
        while self.is_running:
            try:
                time.sleep(0.01)
            except:
                break

    def add_message_callback(self, callback: Callable[[Dict], None]):
        self.message_callbacks.append(callback)

    def remove_message_callback(self, callback: Callable[[Dict], None]):
        if callback in self.message_callbacks:
            self.message_callbacks.remove(callback)

    def get_signal_value(self, signal_name: str) -> Optional[float]:
        if not self.is_connected:
            return None
        
        if self.interface_type == CANoeInterfaceType.SIMULATED:
            return self._simulated_signals.get(signal_name)
        
        if self.interface_type == CANoeInterfaceType.COM and self.application:
            try:
                bus = self.application.Bus("CAN")
                return bus.GetSignal(signal_name).Value
            except:
                return None
        
        return None

    def set_signal_value(self, signal_name: str, value: float) -> bool:
        if not self.is_connected:
            return False
        
        if self.interface_type == CANoeInterfaceType.SIMULATED:
            if signal_name in self._simulated_signals:
                self._simulated_signals[signal_name] = value
                return True
            return False
        
        if self.interface_type == CANoeInterfaceType.COM and self.application:
            try:
                bus = self.application.Bus("CAN")
                bus.GetSignal(signal_name).Value = value
                return True
            except:
                return False
        
        return False

    def get_available_signals(self) -> List[str]:
        if not self.is_connected:
            return []
        
        if self.interface_type == CANoeInterfaceType.SIMULATED:
            return list(self._simulated_signals.keys())
        
        return []

    def load_configuration(self, config_path: str) -> bool:
        if not self.is_connected:
            return False
        
        if self.interface_type == CANoeInterfaceType.COM and self.application:
            try:
                self.application.Open(config_path)
                return True
            except:
                return False
        
        return False

    def get_bus_statistics(self) -> Dict:
        return {
            'is_connected': self.is_connected,
            'is_running': self.is_running,
            'interface_type': self.interface_type.value,
            'signal_count': len(self._simulated_signals) if self.interface_type == CANoeInterfaceType.SIMULATED else 0
        }


class CANoeCapture:
    def __init__(self, interface_type: str = "simulated"):
        type_map = {
            'com': CANoeInterfaceType.COM,
            'rest': CANoeInterfaceType.REST_API,
            'simulated': CANoeInterfaceType.SIMULATED
        }
        self.controller = CANoeController(type_map.get(interface_type, CANoeInterfaceType.SIMULATED))
        self.messages: List[Dict] = []
        self.max_messages = 10000

    def start(self) -> bool:
        self.messages.clear()
        self.controller.add_message_callback(self._on_message)
        return self.controller.start_measurement()

    def stop(self):
        self.controller.stop_measurement()
        self.controller.remove_message_callback(self._on_message)

    def _on_message(self, msg: Dict):
        self.messages.append(msg)
        if len(self.messages) > self.max_messages:
            self.messages = self.messages[-self.max_messages:]

    def get_messages(self, max_count: int = 1000) -> List[Dict]:
        count = min(max_count, len(self.messages))
        return self.messages[-count:]

    def connect(self, config_path: str = None) -> bool:
        return self.controller.connect(config_path)

    def disconnect(self):
        self.controller.disconnect()


if __name__ == '__main__':
    print("Testing CANoe integration (simulated mode)...")
    
    capture = CANoeCapture('simulated')
    capture.connect()
    
    print("Starting simulated measurement...")
    capture.start()
    time.sleep(2)
    capture.stop()
    
    messages = capture.get_messages(100)
    print(f"Captured {len(messages)} messages from CANoe simulation")
    
    if messages:
        for msg in messages[:5]:
            print(f"  ID: 0x{msg['can_id']:03X}, Data: {msg['data']}")
    
    capture.disconnect()
    print("Test completed")
