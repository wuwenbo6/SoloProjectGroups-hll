import csv
import io
import random
from collections import defaultdict


class SoundWireParser:
    SSC_SYNC_WORD = 0x1E
    BROADCAST_ADDRESS = 0x0F
    
    COMMAND_TYPES = {
        0x00: 'SSC_Ignore',
        0x01: 'SSC_Ping',
        0x02: 'SSC_Read',
        0x03: 'SSC_Write',
        0x04: 'SSC_Read_ACK',
        0x05: 'SSC_Access_Command',
        0x06: 'SSC_Acknowledge',
        0x07: 'SSC_Parity_Error',
        0x08: 'SSC_Bus_Reset',
        0x09: 'SSC_Frame_Sync_Config',
        0x0A: 'SSC_Enumerate',
        0x0B: 'SSC_Enumerate_ACK',
        0x0C: 'SSC_Channel_Prepare',
        0x0D: 'SSC_Channel_Enable',
        0x0E: 'SSC_Channel_Disable',
        0x0F: 'SSC_Clk_Stop_Prepare',
        0x10: 'SSC_Clk_Stop',
        0x11: 'SSC_Wake',
    }
    
    EXTENDED_ADDRESS_CMDS = [0x02, 0x03, 0x04, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E]
    
    REGISTER_NAMES = {
        0x0000: 'DEVICE_ID',
        0x0001: 'DEVICE_REV',
        0x0002: 'SCP_CONTROL',
        0x0003: 'SCP_STATUS',
        0x0004: 'SCP_SYNC_CONFIG',
        0x0005: 'SCP_FRAME_CONTROL',
        0x0006: 'SCP_ENUM_CONTROL',
        0x0007: 'SCP_ENUM_STATUS',
        0x0008: 'SCP_DEV_NUM',
        0x0010: 'SCP_INT_MASK',
        0x0011: 'SCP_INT_STATUS',
        0x0012: 'SCP_INT_FORCE',
        0x0020: 'SCP_DP0_CONTROL',
        0x0021: 'SCP_DP0_CHANNEL_MAP',
        0x0022: 'SCP_DP0_SAMPLE_INTERVAL',
        0x0023: 'SCP_DP0_OFFSET',
        0x0024: 'SCP_DP0_LANES',
        0x0030: 'SCP_DP1_CONTROL',
        0x0031: 'SCP_DP1_CHANNEL_MAP',
        0x0032: 'SCP_DP1_SAMPLE_INTERVAL',
        0x0033: 'SCP_DP1_OFFSET',
        0x0034: 'SCP_DP1_LANES',
        0x0040: 'SCP_DP2_CONTROL',
        0x0041: 'SCP_DP2_CHANNEL_MAP',
        0x0042: 'SCP_DP2_SAMPLE_INTERVAL',
        0x0043: 'SCP_DP2_OFFSET',
        0x0044: 'SCP_DP2_LANES',
        0x4000: 'CODEC_MODE',
        0x4001: 'CODEC_POWER',
        0x4002: 'DAC_GAIN',
        0x4003: 'ADC_GAIN',
        0x4004: 'MIXER_CONTROL',
        0x4005: 'MUTE_CONTROL',
        0x4006: 'SAMPLING_RATE',
    }
    
    def __init__(self):
        self.clear()
    
    def clear(self):
        self.raw_data = []
        self.parsed_commands = []
        self.device_tree = {}
        self.register_operations = []
        self.register_values = defaultdict(dict)
        self.enumerated_devices = []
        self.group_id_map = {}
        self.broadcast_commands = []
        self.crc_errors = []
        self.error_injection_enabled = False
        self.error_injection_rate = 0.0
    
    def parse_csv(self, filepath):
        self.clear()
        
        with open(filepath, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                self.raw_data.append(row)
        
        if not self.raw_data:
            raise ValueError('CSV file is empty')
        
        self._parse_data()
        
        return {
            'total_commands': len(self.parsed_commands),
            'total_register_ops': len(self.register_operations),
            'device_count': len(self.enumerated_devices),
            'commands': self.parsed_commands[:100],
            'crc_errors': len(self.crc_errors)
        }
    
    def enable_error_injection(self, rate=0.1):
        self.error_injection_enabled = True
        self.error_injection_rate = max(0.0, min(1.0, rate))
    
    def disable_error_injection(self):
        self.error_injection_enabled = False
        self.error_injection_rate = 0.0
    
    @staticmethod
    def calculate_parity(data_bytes):
        parity = 0
        for b in data_bytes:
            parity ^= (b & 0xFF)
        return parity & 0xFF
    
    @staticmethod
    def calculate_crc8(data_bytes):
        crc = 0
        for b in data_bytes:
            crc ^= (b & 0xFF)
            for _ in range(8):
                if crc & 0x80:
                    crc = ((crc << 1) ^ 0x07) & 0xFF
                else:
                    crc = (crc << 1) & 0xFF
        return crc & 0xFF
    
    def _inject_error(self, parity_byte):
        if self.error_injection_enabled and random.random() < self.error_injection_rate:
            error_bit = 1 << random.randint(0, 7)
            return (parity_byte ^ error_bit) & 0xFF, True
        return parity_byte, False
    
    def _parse_data(self):
        headers = self.raw_data[0].keys()
        
        data_col = None
        time_col = None
        for h in headers:
            h_low = h.lower()
            if 'data' in h_low or 'byte' in h_low or 'value' in h_low:
                data_col = h
            elif 'time' in h_low or 'timestamp' in h_low:
                time_col = h
        
        if not data_col:
            data_col = list(headers)[1] if len(headers) > 1 else list(headers)[0]
        
        bytes_list = []
        for row in self.raw_data:
            val = row.get(data_col, '')
            if val:
                try:
                    if '0x' in val or 'X' in val:
                        byte_val = int(val, 16)
                    else:
                        byte_val = int(val)
                    bytes_list.append(byte_val & 0xFF)
                except (ValueError, TypeError):
                    continue
        
        self._parse_bytes(bytes_list)
    
    def _parse_bytes(self, bytes_list):
        i = 0
        while i < len(bytes_list):
            if bytes_list[i] == self.SSC_SYNC_WORD:
                frame_start = i
                frame_bytes = [self.SSC_SYNC_WORD]
                i += 1
                
                if i < len(bytes_list):
                    cmd_byte = bytes_list[i]
                    frame_bytes.append(cmd_byte)
                    cmd_type = (cmd_byte >> 4) & 0x0F
                    dev_addr = cmd_byte & 0x0F
                    i += 1
                    
                    is_broadcast = dev_addr == self.BROADCAST_ADDRESS
                    group_id = None
                    full_device_id = None
                    
                    if cmd_type in self.EXTENDED_ADDRESS_CMDS and not is_broadcast:
                        if i < len(bytes_list):
                            ext_byte = bytes_list[i]
                            frame_bytes.append(ext_byte)
                            group_id = (ext_byte >> 4) & 0x0F
                            device_id = ext_byte & 0x0F
                            full_device_id = (group_id << 4) | device_id
                            i += 1
                    
                    command = {
                        'frame_start': frame_start,
                        'cmd_type': cmd_type,
                        'cmd_name': self.COMMAND_TYPES.get(cmd_type, f'Unknown_{cmd_type:02X}'),
                        'device_address': dev_addr,
                        'group_id': group_id,
                        'device_id': full_device_id,
                        'full_device_id': full_device_id,
                        'is_broadcast': is_broadcast,
                        'raw_byte': f'0x{cmd_byte:02X}',
                        'params': [],
                        'parity': None,
                        'parity_calculated': None,
                        'parity_error': False,
                        'crc_error': False,
                        'error_injected': False
                    }
                    
                    if is_broadcast:
                        command['device_name'] = 'Broadcast'
                    elif full_device_id is not None:
                        command['device_name'] = f'Device_{full_device_id:02X}'
                    else:
                        command['device_name'] = f'Device_{dev_addr:02X}'
                    
                    params, consumed = self._parse_command_params(cmd_type, bytes_list, i, has_ext_addr=(full_device_id is not None))
                    command['params'] = params
                    
                    for j in range(consumed):
                        if i + j < len(bytes_list):
                            frame_bytes.append(bytes_list[i + j])
                    i += consumed
                    
                    parity_byte = None
                    if i < len(bytes_list):
                        parity_byte = bytes_list[i]
                        i += 1
                    
                    calculated_parity = self.calculate_parity(frame_bytes)
                    calculated_crc = self.calculate_crc8(frame_bytes)
                    
                    command['parity'] = parity_byte
                    command['parity_calculated'] = calculated_parity
                    command['crc_calculated'] = calculated_crc
                    
                    if parity_byte is not None:
                        parity_error = (parity_byte & 0xFF) != (calculated_parity & 0xFF)
                        crc_error = (parity_byte & 0xFF) != (calculated_crc & 0xFF)
                        
                        if self.error_injection_enabled:
                            modified_parity, was_injected = self._inject_error(parity_byte)
                            if was_injected:
                                command['error_injected'] = True
                                command['original_parity'] = parity_byte
                                parity_byte = modified_parity
                                parity_error = True
                                crc_error = True
                        
                        command['parity_error'] = parity_error
                        command['crc_error'] = crc_error
                        
                        if parity_error or crc_error:
                            error_info = {
                                'frame_start': frame_start,
                                'cmd_name': command['cmd_name'],
                                'device_name': command['device_name'],
                                'received_parity': f'0x{parity_byte:02X}' if parity_byte is not None else None,
                                'calculated_parity': f'0x{calculated_parity:02X}',
                                'calculated_crc': f'0x{calculated_crc:02X}',
                                'parity_error': parity_error,
                                'crc_error': crc_error,
                                'error_injected': command['error_injected']
                            }
                            self.crc_errors.append(error_info)
                    
                    self.parsed_commands.append(command)
                    
                    if not (command['parity_error'] or command['crc_error']):
                        self._process_command(command)
                continue
            i += 1
    
    def _parse_command_params(self, cmd_type, bytes_list, start_idx, has_ext_addr=False):
        params = []
        consumed = 0
        
        if cmd_type in [0x02, 0x03, 0x04]:
            if start_idx + 2 <= len(bytes_list):
                reg_addr = (bytes_list[start_idx] << 8) | bytes_list[start_idx + 1]
                params.append({
                    'name': 'register_address',
                    'value': f'0x{reg_addr:04X}',
                    'register_name': self.REGISTER_NAMES.get(reg_addr, f'REG_{reg_addr:04X}')
                })
                consumed += 2
                
                if cmd_type in [0x03, 0x04] and start_idx + 3 <= len(bytes_list):
                    params.append({
                        'name': 'data',
                        'value': f'0x{bytes_list[start_idx + 2]:02X}',
                        'int_value': bytes_list[start_idx + 2]
                    })
                    consumed += 1
        
        elif cmd_type == 0x0A:
            if start_idx < len(bytes_list):
                unique_id = bytes_list[start_idx]
                params.append({
                    'name': 'unique_device_id',
                    'value': f'0x{unique_id:02X}'
                })
                consumed += 1
        
        elif cmd_type == 0x0B:
            if start_idx < len(bytes_list):
                assigned_addr = bytes_list[start_idx]
                group_id = (assigned_addr >> 4) & 0x0F
                device_id = assigned_addr & 0x0F
                params.append({
                    'name': 'assigned_address',
                    'value': f'0x{assigned_addr:02X}',
                    'group_id': f'0x{group_id:01X}',
                    'device_id': f'0x{device_id:01X}',
                    'full_address': f'0x{assigned_addr:02X}'
                })
                consumed += 1
        
        elif cmd_type in [0x0C, 0x0D, 0x0E]:
            if start_idx < len(bytes_list):
                params.append({
                    'name': 'channel',
                    'value': f'0x{bytes_list[start_idx]:02X}'
                })
                consumed += 1
        
        return params, consumed
    
    def _process_command(self, command):
        cmd_type = command['cmd_type']
        dev_addr = command['device_address']
        full_dev_id = command.get('full_device_id', dev_addr)
        is_broadcast = command.get('is_broadcast', False)
        params = command['params']
        
        if is_broadcast:
            self.broadcast_commands.append(command)
        
        if cmd_type == 0x0B and params:
            for p in params:
                if p['name'] == 'assigned_address':
                    addr = int(p['value'], 16)
                    if addr not in self.enumerated_devices:
                        self.enumerated_devices.append(addr)
                    self.group_id_map[addr] = {
                        'group_id': int(p['group_id'], 16),
                        'device_id': int(p['device_id'], 16),
                        'full_address': addr
                    }
        
        if cmd_type in [0x02, 0x03, 0x04]:
            op_type = 'read' if cmd_type in [0x02, 0x04] else 'write'
            reg_addr = None
            data = None
            
            for p in params:
                if p['name'] == 'register_address':
                    reg_addr = p['value']
                    reg_name = p['register_name']
                elif p['name'] == 'data':
                    data = p['value']
                    data_int = p.get('int_value')
            
            if reg_addr:
                reg_op = {
                    'device_address': dev_addr,
                    'full_device_id': full_dev_id,
                    'group_id': command.get('group_id'),
                    'device_name': command.get('device_name', f'Device_{full_dev_id:02X}'),
                    'is_broadcast': is_broadcast,
                    'operation': op_type,
                    'register_address': reg_addr,
                    'register_name': reg_name,
                    'data': data,
                    'timestamp': len(self.register_operations)
                }
                self.register_operations.append(reg_op)
                
                if not is_broadcast:
                    if op_type == 'write' and data:
                        self.register_values[full_dev_id][reg_addr] = data
                    elif op_type == 'read' and cmd_type == 0x04 and data:
                        self.register_values[full_dev_id][reg_addr] = data
    
    def get_device_tree(self):
        tree = {
            'name': 'SoundWire Bus',
            'type': 'bus',
            'children': []
        }
        
        all_devices = sorted(set(
            [c.get('full_device_id') or c['device_address'] for c in self.parsed_commands] + 
            self.enumerated_devices
        ))
        
        groups = defaultdict(list)
        standalone_devices = []
        
        for dev_addr in all_devices:
            if dev_addr == self.BROADCAST_ADDRESS:
                continue
            
            group_info = self.group_id_map.get(dev_addr, {})
            group_id = group_info.get('group_id')
            
            if group_id is not None and group_id != 0:
                groups[group_id].append(dev_addr)
            else:
                standalone_devices.append(dev_addr)
        
        for group_id in sorted(groups.keys()):
            group_node = {
                'name': f'Group_{group_id:01X}',
                'type': 'group',
                'address': f'0x{group_id:01X}',
                'children': []
            }
            
            for dev_addr in sorted(groups[group_id]):
                device = self._build_device_node(dev_addr)
                group_node['children'].append(device)
            
            tree['children'].append(group_node)
        
        for dev_addr in standalone_devices:
            device = self._build_device_node(dev_addr)
            tree['children'].append(device)
        
        return tree
    
    def _build_device_node(self, dev_addr):
        group_info = self.group_id_map.get(dev_addr, {})
        
        device = {
            'name': f'Device_{dev_addr:02X}',
            'type': 'device',
            'address': f'0x{dev_addr:02X}',
            'group_id': group_info.get('group_id'),
            'device_id': group_info.get('device_id'),
            'children': []
        }
        
        regs = self.register_values.get(dev_addr, {})
        for reg_addr, reg_val in sorted(regs.items()):
            reg_name = self.REGISTER_NAMES.get(int(reg_addr, 16), f'REG_{reg_addr}')
            device['children'].append({
                'name': reg_name,
                'type': 'register',
                'address': reg_addr,
                'value': reg_val
            })
        
        return device
    
    def get_register_operations(self):
        return self.register_operations
    
    def get_parsed_commands(self):
        return self.parsed_commands
    
    def get_broadcast_commands(self):
        return self.broadcast_commands
    
    def get_crc_errors(self):
        return self.crc_errors
    
    def get_statistics(self):
        return {
            'total_commands': len(self.parsed_commands),
            'broadcast_commands': len(self.broadcast_commands),
            'unicast_commands': len(self.parsed_commands) - len(self.broadcast_commands),
            'register_reads': len([op for op in self.register_operations if op['operation'] == 'read']),
            'register_writes': len([op for op in self.register_operations if op['operation'] == 'write']),
            'total_register_ops': len(self.register_operations),
            'device_count': len(self.enumerated_devices),
            'group_count': len(set(g['group_id'] for g in self.group_id_map.values() if g.get('group_id') is not None)),
            'parity_errors': len(self.crc_errors),
            'injected_errors': len([e for e in self.crc_errors if e.get('error_injected')]),
            'error_injection_enabled': self.error_injection_enabled,
            'error_injection_rate': self.error_injection_rate
        }
    
    def export_commands_to_csv(self, filepath=None):
        output = io.StringIO() if filepath is None else open(filepath, 'w', newline='', encoding='utf-8')
        
        writer = csv.writer(output)
        writer.writerow([
            'Index',
            'Frame_Start',
            'Command_Type',
            'Command_Name',
            'Device_Address',
            'Full_Device_ID',
            'Group_ID',
            'Is_Broadcast',
            'Raw_Byte',
            'Parameters',
            'Parity_Received',
            'Parity_Calculated',
            'CRC_Calculated',
            'Parity_Error',
            'CRC_Error',
            'Error_Injected'
        ])
        
        for idx, cmd in enumerate(self.parsed_commands):
            params_str = '; '.join([
                f"{p['name']}={p['value']}" 
                for p in cmd.get('params', [])
            ])
            
            writer.writerow([
                idx + 1,
                cmd.get('frame_start', ''),
                f"0x{cmd.get('cmd_type', 0):02X}",
                cmd.get('cmd_name', ''),
                f"0x{cmd.get('device_address', 0):02X}",
                f"0x{cmd.get('full_device_id', 0):02X}" if cmd.get('full_device_id') is not None else '',
                f"0x{cmd.get('group_id', 0):01X}" if cmd.get('group_id') is not None else '',
                'YES' if cmd.get('is_broadcast', False) else 'NO',
                cmd.get('raw_byte', ''),
                params_str,
                f"0x{cmd.get('parity', 0):02X}" if cmd.get('parity') is not None else '',
                f"0x{cmd.get('parity_calculated', 0):02X}" if cmd.get('parity_calculated') is not None else '',
                f"0x{cmd.get('crc_calculated', 0):02X}" if cmd.get('crc_calculated') is not None else '',
                'YES' if cmd.get('parity_error', False) else 'NO',
                'YES' if cmd.get('crc_error', False) else 'NO',
                'YES' if cmd.get('error_injected', False) else 'NO'
            ])
        
        if filepath is None:
            content = output.getvalue()
            output.close()
            return content
        else:
            output.close()
            return filepath
    
    def export_register_ops_to_csv(self, filepath=None):
        output = io.StringIO() if filepath is None else open(filepath, 'w', newline='', encoding='utf-8')
        
        writer = csv.writer(output)
        writer.writerow([
            'Index',
            'Timestamp',
            'Device_Name',
            'Full_Device_ID',
            'Group_ID',
            'Is_Broadcast',
            'Operation',
            'Register_Address',
            'Register_Name',
            'Data'
        ])
        
        for idx, op in enumerate(self.register_operations):
            writer.writerow([
                idx + 1,
                op.get('timestamp', ''),
                op.get('device_name', ''),
                f"0x{op.get('full_device_id', 0):02X}" if op.get('full_device_id') is not None else '',
                f"0x{op.get('group_id', 0):01X}" if op.get('group_id') is not None else '',
                'YES' if op.get('is_broadcast', False) else 'NO',
                op.get('operation', '').upper(),
                op.get('register_address', ''),
                op.get('register_name', ''),
                op.get('data', '')
            ])
        
        if filepath is None:
            content = output.getvalue()
            output.close()
            return content
        else:
            output.close()
            return filepath
