import subprocess
import shutil
import random
import logging
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple, Union

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import (
    ENCLOSURE_DEVICES,
    SIMULATION_MODE,
    SIMULATED_SLOT_COUNT,
    TEMP_WARNING_THRESHOLD,
    TEMP_CRITICAL_THRESHOLD,
)
from .parser import parse_ses_status, parse_ses_temperature

logger = logging.getLogger(__name__)


LED_MODE_OFF = 'off'
LED_MODE_ON = 'on'
LED_MODE_BLINK = 'blink'
LED_MODE_FLASH = 'flash'

LED_VALID_MODES = [LED_MODE_OFF, LED_MODE_ON, LED_MODE_BLINK, LED_MODE_FLASH]

LED_SG_SES_VALUES = {
    LED_MODE_OFF: '0',
    LED_MODE_ON: '1',
    LED_MODE_BLINK: '2',
    LED_MODE_FLASH: '3',
}


class SesCli:
    def __init__(self, device: str, simulation_mode: Optional[bool] = None):
        self.device = device
        self._simulation_mode = simulation_mode
        self._simulated_led_state: Dict[int, Dict[str, str]] = {}
        self._init_simulated_state()

    def _init_simulated_state(self):
        for slot in range(1, SIMULATED_SLOT_COUNT + 1):
            self._simulated_led_state[slot] = {
                'locate': LED_MODE_OFF,
                'fault': LED_MODE_OFF,
                'active': random.choice([LED_MODE_ON, LED_MODE_OFF]),
            }

    @property
    def is_simulation_mode(self) -> bool:
        if self._simulation_mode is not None:
            return self._simulation_mode
        if isinstance(SIMULATION_MODE, bool):
            return SIMULATION_MODE
        return not self._has_sg_ses() or not self._can_access_device()

    def _has_sg_ses(self) -> bool:
        return shutil.which('sg_ses') is not None

    def _can_access_device(self) -> bool:
        try:
            result = self._run_command(['test', '-r', self.device], check=False, use_sudo=False)
            return result.returncode == 0
        except Exception:
            return False

    def _run_command(
        self,
        cmd: List[str],
        check: bool = True,
        use_sudo: bool = True,
    ) -> subprocess.CompletedProcess:
        full_cmd = ['sudo'] + cmd if use_sudo else cmd
        logger.debug(f"Running command: {' '.join(full_cmd)}")
        try:
            result = subprocess.run(
                full_cmd,
                capture_output=True,
                text=True,
                timeout=30,
            )
            if check and result.returncode != 0:
                raise RuntimeError(
                    f"Command failed (exit {result.returncode}): {result.stderr}"
                )
            return result
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"Command timed out: {' '.join(full_cmd)}")

    def _run_ses_command(self, args: List[str]) -> str:
        cmd = ['sg_ses'] + args + [self.device]
        result = self._run_command(cmd)
        return result.stdout

    def scan_enclosures(self) -> List[str]:
        if self.is_simulation_mode:
            return [self.device]
        try:
            result = self._run_command(['sg_ses', '--scan'], use_sudo=False)
            devices = []
            for line in result.stdout.strip().split('\n'):
                line = line.strip()
                if line.startswith('/dev/'):
                    devices.append(line.split()[0])
            return devices if devices else ENCLOSURE_DEVICES
        except Exception as e:
            logger.warning(f"Failed to scan enclosures: {e}")
            return ENCLOSURE_DEVICES

    def get_slot_status(self) -> List[Dict]:
        if self.is_simulation_mode:
            return self._simulate_slot_status()
        try:
            output = self._run_ses_command(['--status'])
            return parse_ses_status(output)
        except Exception as e:
            logger.error(f"Failed to get slot status: {e}")
            return self._simulate_slot_status()

    def get_temperature(self) -> List[Dict]:
        if self.is_simulation_mode:
            return self._simulate_temperature()
        try:
            output = self._run_ses_command(['--page=ec'])
            return parse_ses_temperature(output)
        except Exception as e:
            logger.error(f"Failed to get temperature: {e}")
            return self._simulate_temperature()

    def set_led(self, slot: int, led_type: str, action: str) -> bool:
        return self.set_led_mode(slot, led_type, LED_MODE_ON if action == 'on' else LED_MODE_OFF)

    def set_led_mode(self, slot: int, led_type: str, mode: str) -> bool:
        """
        设置LED灯模式。
        
        Args:
            slot: 槽位号
            led_type: LED类型 - 'locate', 'fault', 'active'
            mode: LED模式 - 'off', 'on', 'blink', 'flash'
        
        Returns:
            bool: 设置是否成功
        """
        led_type = led_type.lower()
        mode = mode.lower()

        if led_type not in ['locate', 'fault', 'active']:
            raise ValueError(f"Invalid LED type: {led_type}. Must be 'locate', 'fault', or 'active'")
        if mode not in LED_VALID_MODES:
            raise ValueError(f"Invalid LED mode: {mode}. Must be one of {LED_VALID_MODES}")

        if self.is_simulation_mode:
            return self._simulate_set_led_mode(slot, led_type, mode)

        try:
            slots = self.get_slot_status()
            valid_slots = [s['slot'] for s in slots]

            if slot not in valid_slots:
                logger.error(
                    f"Slot {slot} not found in enclosure. "
                    f"Valid slots: {valid_slots}"
                )
                return False

            matching_slot = next((s for s in slots if s['slot'] == slot), None)
            if matching_slot is None:
                logger.error(f"No matching slot found for slot {slot}")
                return False

            index = matching_slot['slot']
            logger.info(
                f"Slot {slot} matched, using --index={index} "
                f"(device: {matching_slot.get('device', 'N/A')}, "
                f"present: {matching_slot['present']})"
            )

            value = LED_SG_SES_VALUES[mode]
            self._run_ses_command([
                '--set', f'{led_type}={value}',
                f'--index={index}'
            ])
            logger.info(
                f"Successfully set slot {slot} (index={index}) "
                f"{led_type} LED mode to {mode} (value={value})"
            )
            return True
        except Exception as e:
            logger.error(f"Failed to set LED mode: {e}")
            return False

    def get_single_slot(self, slot: int) -> Optional[Dict]:
        slots = self.get_slot_status()
        for s in slots:
            if s['slot'] == slot:
                return s
        return None

    def _simulate_slot_status(self) -> List[Dict]:
        slots = []
        for slot_num in range(1, SIMULATED_SLOT_COUNT + 1):
            present = random.random() > 0.1
            slot_data = {
                'slot': slot_num,
                'present': present,
                'locate': self._simulated_led_state[slot_num]['locate'],
                'fault': self._simulated_led_state[slot_num]['fault'],
                'active': self._simulated_led_state[slot_num]['active'] if present else LED_MODE_OFF,
            }
            if present:
                slot_data.update({
                    'device': f'/dev/sd{chr(96 + slot_num)}',
                    'model': 'ST8000NM000A',
                    'serial': f'ZA{random.randint(10000000, 99999999)}',
                })
            slots.append(slot_data)
        return slots

    def _simulate_temperature(self) -> List[Dict]:
        sensors = []
        for i in range(6):
            temp = round(random.uniform(28, 52), 1)
            sensor_name = f'Enclosure Temp {i + 1}'
            if i == 0:
                sensor_name = 'Inlet Temp'
            elif i == 1:
                sensor_name = 'Exhaust Temp'
            elif i >= 4:
                sensor_name = f'HBA Temp {i - 3}'

            sensors.append({
                'id': f'temp_{i}',
                'name': sensor_name,
                'current': temp,
                'min': 15.0,
                'max': 60.0,
                'warning': TEMP_WARNING_THRESHOLD,
                'critical': TEMP_CRITICAL_THRESHOLD,
            })
        return sensors

    def _simulate_set_led(self, slot: int, led_type: str, action: str) -> bool:
        return self._simulate_set_led_mode(
            slot, led_type, 
            LED_MODE_ON if action == 'on' else LED_MODE_OFF
        )

    def _simulate_set_led_mode(self, slot: int, led_type: str, mode: str) -> bool:
        if slot not in self._simulated_led_state:
            return False
        self._simulated_led_state[slot][led_type] = mode
        logger.debug(f"[SIMULATION] Set slot {slot} {led_type} to {mode}")
        return True

    def get_diagnostic_logs(self, format: str = 'json') -> Union[str, Dict]:
        """
        导出Enclosure诊断日志。
        
        Args:
            format: 输出格式 - 'json' 或 'text'
        
        Returns:
            str或Dict: 诊断日志内容
        """
        if self.is_simulation_mode:
            logs = self._simulate_diagnostic_logs()
        else:
            logs = self._collect_real_diagnostic_logs()

        if format == 'text':
            return self._format_logs_as_text(logs)
        return logs

    def _collect_real_diagnostic_logs(self) -> Dict:
        """收集真实硬件的诊断日志"""
        logs = {
            'enclosure': {
                'device': self.device,
                'collected_at': datetime.now().isoformat(),
                'simulation_mode': False,
            },
            'raw_outputs': {},
            'slot_status': [],
            'temperature': [],
            'event_log': [],
        }

        try:
            status_output = self._run_ses_command(['--status'])
            logs['raw_outputs']['status'] = status_output
        except Exception as e:
            logs['raw_outputs']['status_error'] = str(e)

        try:
            ec_output = self._run_ses_command(['--page=ec'])
            logs['raw_outputs']['enclosure_control'] = ec_output
        except Exception as e:
            logs['raw_outputs']['ec_error'] = str(e)

        try:
            ed_output = self._run_ses_command(['--page=ed'])
            logs['raw_outputs']['element_descriptor'] = ed_output
        except Exception as e:
            logs['raw_outputs']['ed_error'] = str(e)

        try:
            es_output = self._run_ses_command(['--page=es'])
            logs['raw_outputs']['element_status'] = es_output
        except Exception as e:
            logs['raw_outputs']['es_error'] = str(e)

        try:
            logs['slot_status'] = self.get_slot_status()
            logs['temperature'] = self.get_temperature()
        except Exception as e:
            logger.error(f"Failed to get slot/temp data for diagnostics: {e}")

        try:
            scan_output = self._run_command(['sg_ses', '--scan'], use_sudo=False)
            logs['raw_outputs']['scan'] = scan_output.stdout
        except Exception as e:
            logs['raw_outputs']['scan_error'] = str(e)

        return logs

    def _simulate_diagnostic_logs(self) -> Dict:
        """生成模拟的诊断日志"""
        slots = self.get_slot_status()
        temps = self.get_temperature()

        event_log = []
        now = datetime.now()
        
        for i in range(20):
            event_time = now - timedelta(minutes=random.randint(1, 1440))
            event_types = [
                ('INFO', 'Temperature normal'),
                ('INFO', 'Slot status updated'),
                ('INFO', 'LED status changed'),
                ('WARNING', 'High temperature warning'),
                ('ERROR', 'Slot fault detected'),
                ('INFO', 'Enclosure status polled'),
            ]
            severity, message = random.choice(event_types)
            
            if 'slot' in message.lower() or 'LED' in message:
                slot_num = random.randint(1, len(slots))
                message = f"Slot {slot_num}: {message}"
            
            event_log.append({
                'timestamp': event_time.isoformat(),
                'severity': severity,
                'message': message,
            })

        event_log.sort(key=lambda x: x['timestamp'], reverse=True)

        logs = {
            'enclosure': {
                'device': self.device,
                'vendor': 'Simulated Storage Inc.',
                'model': 'SAS-9300-8e',
                'firmware_version': '15.00.00.00',
                'serial_number': f'SIM{random.randint(100000, 999999)}',
                'collected_at': now.isoformat(),
                'simulation_mode': True,
            },
            'summary': {
                'total_slots': len(slots),
                'present_drives': sum(1 for s in slots if s['present']),
                'fault_slots': sum(1 for s in slots if s['fault'] != LED_MODE_OFF),
                'locate_active': sum(1 for s in slots if s['locate'] != LED_MODE_OFF),
                'temperature_sensors': len(temps),
                'warning_temperatures': sum(
                    1 for t in temps 
                    if t.get('warning') and t['current'] >= t['warning']
                ),
                'critical_temperatures': sum(
                    1 for t in temps 
                    if t.get('critical') and t['current'] >= t['critical']
                ),
            },
            'slot_status': slots,
            'temperature': temps,
            'event_log': event_log,
            'led_configuration': {
                'modes_supported': LED_VALID_MODES,
                'mode_descriptions': {
                    LED_MODE_OFF: 'LED off',
                    LED_MODE_ON: 'LED steady on',
                    LED_MODE_BLINK: 'LED blinking (1Hz)',
                    LED_MODE_FLASH: 'LED flashing (2Hz)',
                },
            },
            'raw_outputs': {
                'note': 'Simulation mode - no real sg_ses output available',
                'simulated_commands': [
                    'sg_ses --scan',
                    'sg_ses --status',
                    'sg_ses --page=ec',
                    'sg_ses --page=ed',
                    'sg_ses --page=es',
                ],
            },
        }

        return logs

    def _format_logs_as_text(self, logs: Dict) -> str:
        """将诊断日志格式化为纯文本"""
        lines = []
        
        lines.append("=" * 70)
        lines.append("SAS ENCLOSURE DIAGNOSTIC REPORT")
        lines.append("=" * 70)
        lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append("")

        enc = logs.get('enclosure', {})
        lines.append("--- ENCLOSURE INFORMATION ---")
        lines.append(f"Device: {enc.get('device', 'N/A')}")
        if 'vendor' in enc:
            lines.append(f"Vendor: {enc['vendor']}")
            lines.append(f"Model: {enc['model']}")
            lines.append(f"Firmware: {enc['firmware_version']}")
            lines.append(f"Serial: {enc['serial_number']}")
        lines.append(f"Simulation Mode: {enc.get('simulation_mode', False)}")
        lines.append("")

        summary = logs.get('summary', {})
        if summary:
            lines.append("--- SYSTEM SUMMARY ---")
            lines.append(f"Total Slots: {summary.get('total_slots', 'N/A')}")
            lines.append(f"Present Drives: {summary.get('present_drives', 'N/A')}")
            lines.append(f"Fault Slots: {summary.get('fault_slots', 'N/A')}")
            lines.append(f"Locate Active: {summary.get('locate_active', 'N/A')}")
            lines.append(f"Temperature Sensors: {summary.get('temperature_sensors', 'N/A')}")
            lines.append(f"Warning Temps: {summary.get('warning_temperatures', 'N/A')}")
            lines.append(f"Critical Temps: {summary.get('critical_temperatures', 'N/A')}")
            lines.append("")

        lines.append("--- SLOT STATUS ---")
        lines.append(f"{'Slot':<6} {'Status':<10} {'Device':<12} {'Locate':<8} {'Fault':<8} {'Active':<8}")
        lines.append("-" * 60)
        for slot in logs.get('slot_status', []):
            status = 'PRESENT' if slot.get('present') else 'EMPTY'
            device = slot.get('device', 'N/A')
            locate = slot.get('locate', 'off')
            fault = slot.get('fault', 'off')
            active = slot.get('active', 'off')
            lines.append(
                f"{slot.get('slot', '?'):<6} {status:<10} {device:<12} {locate:<8} {fault:<8} {active:<8}"
            )
            if slot.get('model'):
                lines.append(f"       Model: {slot['model']}, Serial: {slot.get('serial', 'N/A')}")
        lines.append("")

        lines.append("--- TEMPERATURE SENSORS ---")
        lines.append(f"{'Sensor':<25} {'Current':<10} {'Warning':<10} {'Critical':<10} {'Status':<10}")
        lines.append("-" * 65)
        for temp in logs.get('temperature', []):
            current = temp.get('current', 'N/A')
            warning = temp.get('warning', 'N/A')
            critical = temp.get('critical', 'N/A')
            status = 'NORMAL'
            if isinstance(current, (int, float)):
                if isinstance(critical, (int, float)) and current >= critical:
                    status = 'CRITICAL'
                elif isinstance(warning, (int, float)) and current >= warning:
                    status = 'WARNING'
            lines.append(
                f"{temp.get('name', 'Unknown'):<25} "
                f"{current!s:>7}°C   "
                f"{warning!s:>7}°C   "
                f"{critical!s:>7}°C   "
                f"{status:<10}"
            )
        lines.append("")

        if logs.get('event_log'):
            lines.append("--- EVENT LOG (Last 20 events) ---")
            lines.append(f"{'Timestamp':<25} {'Severity':<10} {'Message'}")
            lines.append("-" * 80)
            for event in logs['event_log'][:20]:
                ts = event.get('timestamp', 'N/A')
                severity = event.get('severity', 'INFO')
                msg = event.get('message', '')
                lines.append(f"{ts:<25} {severity:<10} {msg}")
            lines.append("")

        if logs.get('led_configuration'):
            led_cfg = logs['led_configuration']
            lines.append("--- LED CONFIGURATION ---")
            lines.append(f"Supported modes: {', '.join(led_cfg.get('modes_supported', []))}")
            for mode, desc in led_cfg.get('mode_descriptions', {}).items():
                lines.append(f"  {mode:<8} - {desc}")
            lines.append("")

        if logs.get('raw_outputs'):
            raw = logs['raw_outputs']
            if 'note' in raw:
                lines.append(f"--- RAW OUTPUTS: {raw['note']} ---")
            else:
                lines.append("--- RAW COMMAND OUTPUTS ---")
                for key, value in raw.items():
                    if not key.endswith('_error'):
                        lines.append(f"\n=== {key.upper()} ===")
                        lines.append(value[:500] + ('...' if len(value) > 500 else ''))
            lines.append("")

        lines.append("=" * 70)
        lines.append("END OF DIAGNOSTIC REPORT")
        lines.append("=" * 70)

        return "\n".join(lines)


_ses_cli_instance: Optional[SesCli] = None


def get_ses_cli(device: Optional[str] = None) -> SesCli:
    global _ses_cli_instance
    if device is None:
        device = ENCLOSURE_DEVICES[0]
    if _ses_cli_instance is None or _ses_cli_instance.device != device:
        _ses_cli_instance = SesCli(device)
    return _ses_cli_instance
