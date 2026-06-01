import re
import logging
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


def parse_ses_status(output: str) -> List[Dict]:
    slots = []
    current_slot = None
    slot_data = {}

    for line in output.split('\n'):
        line = line.strip()

        slot_match = re.match(r'^Element index:?\s*(\d+)', line, re.IGNORECASE)
        if slot_match:
            if current_slot is not None:
                slots.append(_finalize_slot(slot_data))
            current_slot = int(slot_match.group(1))
            slot_data = {
                'slot': current_slot,
                'present': False,
                'locate': False,
                'fault': False,
                'active': False,
            }
            continue

        if current_slot is None:
            continue

        if 'Slot' in line and 'device' in line.lower():
            dev_match = re.search(r'/dev/[a-z]+\d*', line)
            if dev_match:
                slot_data['device'] = dev_match.group(0)

        if re.search(r'(inserted|installed|present)', line, re.IGNORECASE):
            slot_data['present'] = True
        elif re.search(r'(not inserted|not installed|not present)', line, re.IGNORECASE):
            slot_data['present'] = False

        if re.search(r'locate.*on', line, re.IGNORECASE):
            slot_data['locate'] = True
        elif re.search(r'locate.*off', line, re.IGNORECASE):
            slot_data['locate'] = False

        if re.search(r'(fault|error|fail).*on', line, re.IGNORECASE):
            slot_data['fault'] = True
        elif re.search(r'(fault|error|fail).*off', line, re.IGNORECASE):
            slot_data['fault'] = False

        if re.search(r'(active|ident).*on', line, re.IGNORECASE):
            slot_data['active'] = True
        elif re.search(r'(active|ident).*off', line, re.IGNORECASE):
            slot_data['active'] = False

        if 'Model:' in line or 'Product:' in line:
            model_match = re.search(r'(?:Model|Product):\s*([\w-]+)', line, re.IGNORECASE)
            if model_match:
                slot_data['model'] = model_match.group(1)

        if 'Serial:' in line:
            serial_match = re.search(r'Serial:\s*([\w-]+)', line, re.IGNORECASE)
            if serial_match:
                slot_data['serial'] = serial_match.group(1)

    if current_slot is not None:
        slots.append(_finalize_slot(slot_data))

    if not slots:
        slots = _parse_status_legacy(output)

    return slots


def _finalize_slot(slot_data: Dict) -> Dict:
    required = ['slot', 'present', 'locate', 'fault', 'active']
    for key in required:
        if key not in slot_data:
            slot_data[key] = False if key != 'slot' else 0
    return slot_data


def _parse_status_legacy(output: str) -> List[Dict]:
    slots = []
    lines = output.split('\n')

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        slot_match = re.search(r'Slot\s+(\d+)', line, re.IGNORECASE)
        if slot_match:
            slot_num = int(slot_match.group(1))
            slot_data = {
                'slot': slot_num,
                'present': False,
                'locate': False,
                'fault': False,
                'active': False,
            }

            j = i + 1
            while j < len(lines) and j < i + 15:
                sub_line = lines[j].strip()
                if re.search(r'Slot\s+\d+', sub_line, re.IGNORECASE):
                    break

                if 'OK' in sub_line or 'Inserted' in sub_line:
                    slot_data['present'] = True
                if 'Locate' in sub_line and 'On' in sub_line:
                    slot_data['locate'] = True
                if 'Fault' in sub_line and 'On' in sub_line:
                    slot_data['fault'] = True
                if 'Active' in sub_line and 'On' in sub_line:
                    slot_data['active'] = True

                dev_match = re.search(r'/dev/[a-z]+\d*', sub_line)
                if dev_match:
                    slot_data['device'] = dev_match.group(0)

                j += 1

            slots.append(slot_data)
            i = j - 1
        i += 1

    return slots


def _parse_ses_hex_page(output: str) -> List[Dict]:
    """
    解析SES诊断页的16进制原始数据。
    
    SES诊断页（Diagnostic Page, 0x00 或 Enclosure Control page）
    通常包含按16进制格式输出的温度传感器数据。
    
    格式示例：
      00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f
      1a 00 1c 40 1b 80 28 00 19 00 1e 20 ...
      
      或带标签的格式：
      Temperature: 0x1a2b
      Current temp: 1a2bh
    """
    sensors = []
    
    hex_lines = []
    for line in output.split('\n'):
        line = line.strip()
        if re.match(r'^[0-9a-fA-F\s]+$', line) and len(line) > 10:
            hex_bytes = line.split()
            if len(hex_bytes) >= 8 and all(len(b) == 2 for b in hex_bytes):
                if hex_bytes[0] == '00' and hex_bytes[1] == '01' and hex_bytes[2] == '02':
                    logger.debug("Skipping offset line in hex dump")
                    continue
                hex_lines.append(line)
    
    if hex_lines:
        all_hex = ''.join(hex_lines).replace(' ', '')
        
        valid_temps = []
        for i in range(0, len(all_hex) // 4):
            hex_pair = all_hex[i * 4:(i + 1) * 4]
            if len(hex_pair) == 4:
                temp = parse_hex_temperature(hex_pair)
                if temp is not None and 15 <= temp <= 70:
                    valid_temps.append((i, hex_pair, temp))
        
        sensor_names = ['Inlet Temp', 'Exhaust Temp', 'CPU Temp', 'HBA Temp', 
                        'Midplane Temp', 'PSU Temp', 'Battery Temp']
        
        for idx, (offset, hex_pair, temp) in enumerate(valid_temps[:12]):
            sensor_name = sensor_names[idx] if idx < len(sensor_names) else f'Temperature Sensor {idx + 1}'
            
            sensors.append({
                'id': f'temp_{idx}',
                'name': sensor_name,
                'current': temp,
                'min': 0.0,
                'max': 60.0,
                'warning': 45.0,
                'critical': 55.0,
            })
            
            logger.debug(f"Parsed hex temp at offset {offset}: {hex_pair} -> {temp}°C ({sensor_name})")
    
    return sensors


def parse_ses_temperature(output: str) -> List[Dict]:
    sensors = []

    temp_block_pattern = re.compile(
        r'Temperature sensor.*?Element index:?\s*(\d+)(.*?)(?=Temperature sensor|Element type|$)',
        re.DOTALL | re.IGNORECASE,
    )

    for match in temp_block_pattern.finditer(output):
        idx = match.group(1)
        block = match.group(2)

        sensor = {
            'id': f'temp_{idx}',
            'name': f'Temperature Sensor {idx}',
            'current': None,
            'min': None,
            'max': None,
            'warning': None,
            'critical': None,
        }

        for line in block.split('\n'):
            line = line.strip()

            if re.search(r'(current|actual|reading)', line, re.IGNORECASE):
                temp = _extract_temperature(line)
                if temp is not None:
                    sensor['current'] = temp

            if 'Minimum' in line:
                temp = _extract_temperature(line)
                if temp is not None:
                    sensor['min'] = temp

            if 'Maximum' in line:
                temp = _extract_temperature(line)
                if temp is not None:
                    sensor['max'] = temp

            if re.search(r'(warning|high|warn)', line, re.IGNORECASE):
                temp = _extract_temperature(line)
                if temp is not None:
                    sensor['warning'] = temp

            if re.search(r'(critical|danger|fault)', line, re.IGNORECASE):
                temp = _extract_temperature(line)
                if temp is not None:
                    sensor['critical'] = temp

            if 'descriptor' in line.lower() or 'name' in line.lower():
                name_match = re.search(r'(?:descriptor|name):\s*(.+)', line, re.IGNORECASE)
                if name_match:
                    sensor['name'] = name_match.group(1).strip()

            if re.search(r'hex|raw|value', line, re.IGNORECASE):
                hex_match = re.search(
                    r'(?:hex|raw|value)\s*[:=]\s*(0x[0-9a-fA-F]+|[0-9a-fA-F]+h?)',
                    line,
                    re.IGNORECASE
                )
                if hex_match and sensor['current'] is None:
                    hex_str = hex_match.group(1)
                    temp = parse_hex_temperature(hex_str)
                    if temp is not None:
                        sensor['current'] = temp
                        logger.debug(f"Parsed temperature from hex field: {hex_str} -> {temp}°C")

        if sensor['current'] is not None:
            sensors.append(sensor)

    if not sensors:
        sensors = _parse_ses_hex_page(output)
    
    if not sensors:
        sensors = _parse_temperature_legacy(output)

    return sensors


def _parse_temperature_legacy(output: str) -> List[Dict]:
    sensors = []

    for line in output.split('\n'):
        line = line.strip()

        temp_match = re.search(r'(?:Temperature|Temp).*?(\d+\.?\d*)\s*[Cc]', line)
        if temp_match and 'Slot' not in line:
            try:
                temp = float(temp_match.group(1))
                sensor_id = len(sensors)
                sensors.append({
                    'id': f'temp_{sensor_id}',
                    'name': f'Temperature {sensor_id + 1}',
                    'current': temp,
                    'min': None,
                    'max': None,
                    'warning': 45,
                    'critical': 55,
                })
            except ValueError:
                continue

    return sensors


def parse_hex_temperature(hex_str: str) -> Optional[float]:
    """
    按SES规范解析16进制温度值。
    
    SES (SCSI Enclosure Services) 规范中温度数据格式：
    - 2字节 (16位) 格式：高字节为整数部分，低字节为小数部分 (1/256度增量)
    - 1字节 (8位) 格式：直接表示整数温度
    - 支持带符号整数（两字节补码形式）
    
    支持的16进制格式：
    - 0x1a2b, 0X1A2B
    - 1a2bh, 1A2BH
    - 1a2b, 1A2B
    - 0x1a, 1ah, 1a
    
    Args:
        hex_str: 16进制温度字符串
        
    Returns:
        转换后的摄氏温度值，解析失败返回None
    """
    hex_str = hex_str.strip()
    
    hex_clean = re.sub(r'^(0x|0X)', '', hex_str)
    hex_clean = re.sub(r'[hH]$', '', hex_clean)
    
    if not re.match(r'^[0-9a-fA-F]+$', hex_clean):
        return None
    
    try:
        hex_len = len(hex_clean)
        int_value = int(hex_clean, 16)
        
        if hex_len <= 2:
            return float(int_value)
        elif hex_len <= 4:
            if int_value >= 0x8000:
                int_value = int_value - 0x10000
            
            integer_part = (int_value >> 8) & 0xFF
            fractional_part = int_value & 0xFF
            
            if int_value < 0:
                integer_part = integer_part - 256
            
            temperature = integer_part + (fractional_part / 256.0)
            return temperature
        else:
            logger.warning(f"Hex string too long for temperature: {hex_str}")
            return None
            
    except ValueError:
        logger.debug(f"Failed to parse hex temperature: {hex_str}")
        return None


def _extract_temperature(line: str) -> Optional[float]:
    """
    从文本行中提取温度值。
    优先尝试解析SES规范的16进制格式，失败则尝试十进制格式。
    """
    hex_patterns = [
        r'\b(?:temperature|temp|curr(?:ent)?|reading)\s*[:=]\s*(0x[0-9a-fA-F]{1,4}|[0-9a-fA-F]{3,4}h)\b',
        r'0x[0-9a-fA-F]{3,4}[hH]?',
        r'[0-9a-fA-F]{3,4}[hH]',
        r'(?:hex|raw|value)\s*[:=]\s*(0x[0-9a-fA-F]{1,4}|[0-9a-fA-F]{1,4}h?)',
    ]
    
    for pattern in hex_patterns:
        hex_match = re.search(pattern, line, re.IGNORECASE)
        if hex_match:
            hex_str = hex_match.group(1) if hex_match.lastindex else hex_match.group(0)
            if 'hex:' in hex_str.lower() or 'raw:' in hex_str.lower() or 'value:' in hex_str.lower():
                hex_str = re.sub(r'^(hex|raw|value)\s*[:=]\s*', '', hex_str, flags=re.IGNORECASE).strip()
            
            temp = parse_hex_temperature(hex_str)
            if temp is not None:
                logger.debug(f"Parsed SES hex temperature: {hex_str} -> {temp}°C")
                return temp
    
    dec_match = re.search(r'(-?\d+\.?\d*)\s*[Cc°]', line)
    if dec_match:
        try:
            temp = float(dec_match.group(1))
            logger.debug(f"Parsed decimal temperature: {temp}°C")
            return temp
        except ValueError:
            pass
    
    return None
