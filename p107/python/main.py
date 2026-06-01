import sys
import json
import time
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from can_capture import CANCapture
from signal_analyzer import SignalAnalyzer
from dbc_generator import DBCGenerator
from database import Database
from trigger_recorder import TriggerRecorder, Trigger, TriggerType, TriggerCondition
from canoe_integration import CANoeCapture
from excel_exporter import ExcelExporter, DBCMessageForExport, DBCSignalForExport, export_dbc_from_database


class CANAnalyzerServer:
    def __init__(self):
        self.capture = None
        self.canoe_capture = None
        self.analyzer = SignalAnalyzer()
        self.dbc_generator = DBCGenerator()
        self.db = Database()
        self.current_project_id = None
        self.trigger_recorder = TriggerRecorder(max_buffer_size=50000)
        self.trigger_monitor_thread = None
        self.is_trigger_monitoring = False

    def handle_command(self, command: str, data: dict = None) -> dict:
        try:
            if command == 'create_project':
                return self._create_project(data)
            elif command == 'get_projects':
                return self._get_projects()
            elif command == 'delete_project':
                return self._delete_project(data)
            elif command == 'select_project':
                return self._select_project(data)
            elif command == 'start_capture':
                return self._start_capture(data)
            elif command == 'stop_capture':
                return self._stop_capture()
            elif command == 'get_messages':
                return self._get_messages(data)
            elif command == 'analyze_signals':
                return self._analyze_signals(data)
            elif command == 'get_signals':
                return self._get_signals(data)
            elif command == 'add_manual_signal':
                return self._add_manual_signal(data)
            elif command == 'update_signal':
                return self._update_signal(data)
            elif command == 'delete_signal':
                return self._delete_signal(data)
            elif command == 'generate_dbc':
                return self._generate_dbc(data)
            elif command == 'get_dbc_files':
                return self._get_dbc_files()
            elif command == 'get_signal_values':
                return self._get_signal_values(data)
            elif command == 'start_canoe':
                return self._start_canoe(data)
            elif command == 'stop_canoe':
                return self._stop_canoe()
            elif command == 'connect_canoe':
                return self._connect_canoe(data)
            elif command == 'disconnect_canoe':
                return self._disconnect_canoe()
            elif command == 'get_canoe_signals':
                return self._get_canoe_signals()
            elif command == 'add_trigger':
                return self._add_trigger(data)
            elif command == 'remove_trigger':
                return self._remove_trigger(data)
            elif command == 'get_triggers':
                return self._get_triggers()
            elif command == 'start_trigger_recording':
                return self._start_trigger_recording()
            elif command == 'stop_trigger_recording':
                return self._stop_trigger_recording()
            elif command == 'export_excel':
                return self._export_excel(data)
            else:
                return {'success': False, 'error': f'Unknown command: {command}'}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _create_project(self, data: dict) -> dict:
        name = data.get('name', 'Unnamed Project')
        description = data.get('description', '')
        project_id = self.db.create_project(name, description)
        return {'success': True, 'project_id': project_id}

    def _get_projects(self) -> dict:
        projects = self.db.get_all_projects()
        return {'success': True, 'projects': projects}

    def _delete_project(self, data: dict) -> dict:
        project_id = data.get('project_id')
        self.db.delete_project(project_id)
        return {'success': True}

    def _select_project(self, data: dict) -> dict:
        self.current_project_id = data.get('project_id')
        return {'success': True}

    def _start_capture(self, data: dict) -> dict:
        use_virtual = data.get('use_virtual', True)
        channel = data.get('channel', 'PCAN_USBBUS1')
        
        if self.capture:
            self.capture.stop()
        
        self.capture = CANCapture(use_virtual=use_virtual, channel=channel)
        self.capture.start()
        
        return {'success': True}

    def _stop_capture(self) -> dict:
        if self.capture:
            messages = self.capture.get_messages(100000)
            self.capture.stop()
            self.capture = None
            
            if self.current_project_id and messages:
                self.db.insert_messages(self.current_project_id, messages)
            
            return {'success': True, 'message_count': len(messages)}
        
        return {'success': True, 'message_count': 0}

    def _get_messages(self, data: dict) -> dict:
        if not self.current_project_id:
            return {'success': False, 'error': 'No project selected'}
        
        can_id = data.get('can_id')
        limit = data.get('limit', 10000)
        
        messages = self.db.get_messages(self.current_project_id, can_id=can_id, limit=limit)
        can_ids = self.db.get_unique_can_ids(self.current_project_id)
        
        return {
            'success': True,
            'messages': messages,
            'can_ids': can_ids
        }

    def _analyze_signals(self, data: dict) -> dict:
        if not self.current_project_id:
            return {'success': False, 'error': 'No project selected'}
        
        can_id = data.get('can_id')
        limit = data.get('limit', 5000)
        
        messages = self.db.get_messages(self.current_project_id, can_id=can_id, limit=limit)
        
        if not messages:
            return {'success': False, 'error': 'No messages to analyze'}
        
        analysis_results = self.analyzer.analyze_messages(messages)
        
        signals_by_can_id = {}
        for cid, analysis in analysis_results.items():
            signals_by_can_id[cid] = []
            for sig in analysis.signals:
                signals_by_can_id[cid].append({
                    'name': sig.name,
                    'start_bit': sig.start_bit,
                    'bit_length': sig.bit_length,
                    'is_signed': sig.is_signed,
                    'is_big_endian': sig.is_big_endian,
                    'scale': sig.scale,
                    'offset': sig.offset,
                    'unit': sig.unit,
                    'confidence': sig.confidence
                })
        
        self.db.save_signals(self.current_project_id, signals_by_can_id)
        
        return {'success': True, 'signals': signals_by_can_id}

    def _get_signals(self, data: dict) -> dict:
        if not self.current_project_id:
            return {'success': False, 'error': 'No project selected'}
        
        can_id = data.get('can_id')
        signals = self.db.get_signals(self.current_project_id, can_id=can_id)
        
        return {'success': True, 'signals': signals}

    def _add_manual_signal(self, data: dict) -> dict:
        if not self.current_project_id:
            return {'success': False, 'error': 'No project selected'}
        
        can_id = data.get('can_id')
        signal_data = data.get('signal', {})
        
        signal_id = self.db.add_manual_signal(self.current_project_id, can_id, signal_data)
        
        return {'success': True, 'signal_id': signal_id}

    def _update_signal(self, data: dict) -> dict:
        signal_id = data.get('signal_id')
        signal_data = data.get('signal', {})
        
        self.db.update_signal(signal_id, signal_data)
        
        return {'success': True}

    def _delete_signal(self, data: dict) -> dict:
        signal_id = data.get('signal_id')
        
        self.db.delete_signal(signal_id)
        
        return {'success': True}

    def _generate_dbc(self, data: dict) -> dict:
        if not self.current_project_id:
            return {'success': False, 'error': 'No project selected'}
        
        name = data.get('name', 'generated.dbc')
        output_path = data.get('output_path', 'output/generated.dbc')
        
        signals_by_can_id = self.db.get_signals(self.current_project_id)
        can_ids = self.db.get_unique_can_ids(self.current_project_id)
        
        class TempAnalysis:
            def __init__(self, can_id, signals, messages):
                self.can_id = can_id
                self.signals = signals
                self.raw_messages = messages
        
        analysis_results = {}
        for cid in can_ids:
            signals = []
            for sig in signals_by_can_id.get(cid, []):
                from signal_analyzer import Signal
                signals.append(Signal(
                    name=sig['name'],
                    start_bit=sig['start_bit'],
                    bit_length=sig['bit_length'],
                    is_signed=sig['is_signed'],
                    is_big_endian=sig['is_big_endian'],
                    scale=sig['scale'],
                    offset=sig['offset'],
                    unit=sig['unit']
                ))
            
            messages = self.db.get_messages(self.current_project_id, can_id=cid, limit=100)
            analysis_results[cid] = TempAnalysis(cid, signals, messages)
        
        self.dbc_generator = DBCGenerator()
        self.dbc_generator.from_analysis_results(analysis_results)
        
        content = self.dbc_generator.generate(output_path)
        
        self.db.save_dbc_file(self.current_project_id, name, content, output_path)
        
        return {'success': True, 'content': content, 'file_path': output_path}

    def _get_dbc_files(self) -> dict:
        if not self.current_project_id:
            return {'success': False, 'error': 'No project selected'}
        
        dbc_files = self.db.get_dbc_files(self.current_project_id)
        
        return {'success': True, 'dbc_files': dbc_files}

    def _get_signal_values(self, data: dict) -> dict:
        if not self.current_project_id:
            return {'success': False, 'error': 'No project selected'}
        
        signal_id = data.get('signal_id')
        limit = data.get('limit', 1000)
        
        signals = self.db.get_signals(self.current_project_id)
        target_signal = None
        target_can_id = None
        
        for cid, sig_list in signals.items():
            for sig in sig_list:
                if sig['id'] == signal_id:
                    target_signal = sig
                    target_can_id = cid
                    break
            if target_signal:
                break
        
        if not target_signal:
            return {'success': False, 'error': 'Signal not found'}
        
        messages = self.db.get_messages(self.current_project_id, can_id=target_can_id, limit=limit)
        
        values = []
        timestamps = []
        for msg in messages:
            value = self._extract_signal_value(
                msg['data'],
                target_signal['start_bit'],
                target_signal['bit_length'],
                target_signal['is_signed']
            )
            scaled_value = value * target_signal['scale'] + target_signal['offset']
            values.append(scaled_value)
            timestamps.append(msg['timestamp'])
        
        return {
            'success': True,
            'timestamps': timestamps,
            'values': values,
            'signal_name': target_signal['name']
        }

    def _extract_signal_value(self, data: list, start_bit: int, bit_length: int, is_signed: bool) -> float:
        value = 0
        for i in range(bit_length):
            bit_pos = start_bit + i
            byte_idx = bit_pos // 8
            bit_idx = bit_pos % 8
            
            if byte_idx < len(data):
                if data[byte_idx] & (1 << bit_idx):
                    value |= (1 << i)
        
        if is_signed and value & (1 << (bit_length - 1)):
            value = value - (1 << bit_length)
        
        return float(value)

    def _connect_canoe(self, data: dict) -> dict:
        interface_type = data.get('interface_type', 'simulated')
        config_path = data.get('config_path')
        
        if self.canoe_capture:
            self.canoe_capture.disconnect()
        
        self.canoe_capture = CANoeCapture(interface_type)
        success = self.canoe_capture.connect(config_path)
        
        return {'success': success}

    def _disconnect_canoe(self) -> dict:
        if self.canoe_capture:
            self.canoe_capture.disconnect()
            self.canoe_capture = None
        
        return {'success': True}

    def _start_canoe(self, data: dict) -> dict:
        if not self.canoe_capture:
            return {'success': False, 'error': 'CANoe not connected'}
        
        success = self.canoe_capture.start()
        return {'success': success}

    def _stop_canoe(self) -> dict:
        if not self.canoe_capture:
            return {'success': True}
        
        messages = self.canoe_capture.get_messages(100000)
        self.canoe_capture.stop()
        
        if self.current_project_id and messages:
            self.db.insert_messages(self.current_project_id, messages)
        
        return {'success': True, 'message_count': len(messages)}

    def _get_canoe_signals(self) -> dict:
        if not self.canoe_capture:
            return {'success': False, 'error': 'CANoe not connected'}
        
        signals = self.canoe_capture.controller.get_available_signals()
        return {'success': True, 'signals': signals}

    def _add_trigger(self, data: dict) -> dict:
        trigger_type = TriggerType(data.get('trigger_type', 'can_id'))
        trigger = Trigger(
            trigger_type=trigger_type,
            enabled=data.get('enabled', True),
            can_id=data.get('can_id'),
            byte_offset=data.get('byte_offset', 0),
            bit_offset=data.get('bit_offset', 0),
            bit_length=data.get('bit_length', 8),
            condition=TriggerCondition(data.get('condition', '==')),
            value=data.get('value'),
            pre_trigger_samples=data.get('pre_trigger_samples', 100),
            post_trigger_samples=data.get('post_trigger_samples', 100),
            description=data.get('description', '')
        )
        
        self.trigger_recorder.add_trigger(trigger)
        return {'success': True, 'trigger_index': len(self.trigger_recorder.get_triggers()) - 1}

    def _remove_trigger(self, data: dict) -> dict:
        index = data.get('index', 0)
        self.trigger_recorder.remove_trigger(index)
        return {'success': True}

    def _get_triggers(self) -> dict:
        triggers = self.trigger_recorder.get_triggers()
        trigger_list = []
        for i, t in enumerate(triggers):
            trigger_list.append({
                'index': i,
                'trigger_type': t.trigger_type.value,
                'enabled': t.enabled,
                'can_id': t.can_id,
                'description': t.description,
                'pre_trigger_samples': t.pre_trigger_samples,
                'post_trigger_samples': t.post_trigger_samples
            })
        return {'success': True, 'triggers': trigger_list}

    def _start_trigger_recording(self) -> dict:
        self.trigger_recorder.start_recording()
        self.is_trigger_monitoring = True
        self.trigger_monitor_thread = threading.Thread(target=self._trigger_monitor_loop, daemon=True)
        self.trigger_monitor_thread.start()
        return {'success': True}

    def _stop_trigger_recording(self) -> dict:
        self.is_trigger_monitoring = False
        triggered_data = self.trigger_recorder.stop_recording()
        
        if self.current_project_id and triggered_data:
            self.db.insert_messages(self.current_project_id, triggered_data)
        
        return {'success': True, 'message_count': len(triggered_data)}

    def _trigger_monitor_loop(self):
        while self.is_trigger_monitoring:
            if self.capture:
                messages = self.capture.get_messages(1000)
                for msg in messages:
                    self.trigger_recorder.process_message(msg)
            
            if self.canoe_capture and self.canoe_capture.controller.is_running:
                messages = self.canoe_capture.get_messages(1000)
                for msg in messages:
                    self.trigger_recorder.process_message(msg)
            
            time.sleep(0.01)

    def _export_excel(self, data: dict) -> dict:
        if not self.current_project_id:
            return {'success': False, 'error': 'No project selected'}
        
        output_path = data.get('output_path', 'output/dbc_export.xlsx')
        
        try:
            file_path = export_dbc_from_database(self.current_project_id, output_path, self.db)
            return {'success': True, 'file_path': file_path}
        except Exception as e:
            return {'success': False, 'error': str(e)}


def main():
    server = CANAnalyzerServer()
    
    for line in sys.stdin:
        try:
            line = line.strip()
            if not line:
                continue
            
            request = json.loads(line)
            request_id = request.get('_requestId')
            command = request.get('command')
            data = request.get('data', {})
            
            response = server.handle_command(command, data)
            if request_id:
                response['_requestId'] = request_id
            print(json.dumps(response), flush=True)
            
        except json.JSONDecodeError as e:
            error_response = {'success': False, 'error': f'Invalid JSON: {str(e)}'}
            print(json.dumps(error_response), flush=True)
        except Exception as e:
            error_response = {'success': False, 'error': str(e)}
            print(json.dumps(error_response), flush=True)


if __name__ == '__main__':
    main()
