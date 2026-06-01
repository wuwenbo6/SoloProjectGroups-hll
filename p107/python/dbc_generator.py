import os
from typing import List, Dict, Optional
from dataclasses import dataclass


@dataclass
class DBCSignal:
    name: str
    start_bit: int
    bit_length: int
    is_signed: bool = False
    is_big_endian: bool = False
    scale: float = 1.0
    offset: float = 0.0
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    unit: str = ""
    receiver: str = "Vector__XXX"


@dataclass
class DBCMessage:
    can_id: int
    name: str
    dlc: int
    sender: str = "Vector__XXX"
    signals: List[DBCSignal] = None

    def __post_init__(self):
        if self.signals is None:
            self.signals = []


class DBCGenerator:
    def __init__(self, bus_name: str = "CAN"):
        self.bus_name = bus_name
        self.messages: List[DBCMessage] = []
        self.nodes: List[str] = ["Vector__XXX"]

    def add_message(self, msg: DBCMessage):
        self.messages.append(msg)

    def add_messages(self, msgs: List[DBCMessage]):
        self.messages.extend(msgs)

    def from_analysis_results(self, analysis_results: Dict):
        for can_id, analysis in analysis_results.items():
            msg_name = f"Message_0x{can_id:03X}"
            dlc = 8
            if analysis.raw_messages and len(analysis.raw_messages) > 0:
                dlc = analysis.raw_messages[0]['dlc']

            dbc_msg = DBCMessage(
                can_id=can_id,
                name=msg_name,
                dlc=dlc
            )

            for signal in analysis.signals:
                min_val = None
                max_val = None
                if signal.values and len(signal.values) > 0:
                    min_val = min(signal.values) * signal.scale + signal.offset
                    max_val = max(signal.values) * signal.scale + signal.offset

                dbc_signal = DBCSignal(
                    name=signal.name,
                    start_bit=signal.start_bit,
                    bit_length=signal.bit_length,
                    is_signed=signal.is_signed,
                    is_big_endian=signal.is_big_endian,
                    scale=signal.scale,
                    offset=signal.offset,
                    min_value=min_val,
                    max_value=max_val,
                    unit=signal.unit
                )
                dbc_msg.signals.append(dbc_signal)

            self.add_message(dbc_msg)

    def generate(self, filepath: str):
        lines = []

        lines.append(f"VERSION \"\"")
        lines.append("")
        lines.append("NS_ :")
        lines.append("")
        lines.append("BS_:")
        lines.append("")

        nodes_str = ", ".join(self.nodes)
        lines.append(f"BU_: {nodes_str}")
        lines.append("")

        for msg in self.messages:
            lines.append(f"BO_ {msg.can_id} {msg.name}: {msg.dlc} {msg.sender}")
            
            for signal in msg.signals:
                endianess = "1" if signal.is_big_endian else "0"
                signed = "-" if signal.is_signed else "+"
                
                min_str = str(signal.min_value) if signal.min_value is not None else "0"
                max_str = str(signal.max_value) if signal.max_value is not None else "0"
                
                line = (f" SG_ {signal.name} : {signal.start_bit}|{signal.bit_length}@{endianess}{signed} "
                       f"({signal.scale},{signal.offset}) [{min_str}|{max_str}] "
                       f"\"{signal.unit}\" {signal.receiver}")
                lines.append(line)
            
            lines.append("")

        content = "\n".join(lines)
        
        os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

        return content

    def parse_dbc(self, filepath: str) -> List[DBCMessage]:
        messages = []
        
        try:
            import cantools
            db = cantools.database.load_file(filepath)
            
            for msg in db.messages:
                dbc_msg = DBCMessage(
                    can_id=msg.frame_id,
                    name=msg.name,
                    dlc=msg.length
                )
                
                for sig in msg.signals:
                    dbc_signal = DBCSignal(
                        name=sig.name,
                        start_bit=sig.start,
                        bit_length=sig.length,
                        is_signed=sig.is_signed,
                        is_big_endian=sig.byte_order == 'big_endian',
                        scale=sig.scale,
                        offset=sig.offset,
                        min_value=sig.minimum,
                        max_value=sig.maximum,
                        unit=sig.unit if sig.unit else ""
                    )
                    dbc_msg.signals.append(dbc_signal)
                
                messages.append(dbc_msg)
                
        except ImportError:
            messages = self._simple_parse_dbc(filepath)
        
        return messages

    def _simple_parse_dbc(self, filepath: str) -> List[DBCMessage]:
        messages = []
        current_msg = None
        
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                
                if line.startswith("BO_"):
                    parts = line.split()
                    can_id = int(parts[1])
                    name = parts[2].rstrip(':')
                    dlc = int(parts[3])
                    current_msg = DBCMessage(can_id=can_id, name=name, dlc=dlc)
                    messages.append(current_msg)
                
                elif line.startswith("SG_") and current_msg:
                    parts = line.split()
                    name = parts[1]
                    
                    bit_info = parts[3]
                    start_bit, rest = bit_info.split('|')
                    bit_length, endian_signed = rest.split('@')
                    start_bit = int(start_bit)
                    bit_length = int(bit_length)
                    
                    is_big_endian = endian_signed[0] == '1'
                    is_signed = endian_signed[1] == '-'
                    
                    scale_offset = parts[4].strip('()').split(',')
                    scale = float(scale_offset[0])
                    offset = float(scale_offset[1])
                    
                    min_max = parts[5].strip('[]').split('|')
                    min_val = float(min_max[0]) if min_max[0] else None
                    max_val = float(min_max[1]) if min_max[1] else None
                    
                    unit = parts[6].strip('"') if len(parts) > 6 else ""
                    
                    signal = DBCSignal(
                        name=name,
                        start_bit=start_bit,
                        bit_length=bit_length,
                        is_signed=is_signed,
                        is_big_endian=is_big_endian,
                        scale=scale,
                        offset=offset,
                        min_value=min_val,
                        max_value=max_val,
                        unit=unit
                    )
                    current_msg.signals.append(signal)
        
        return messages


if __name__ == '__main__':
    from can_capture import CANCapture
    from signal_analyzer import SignalAnalyzer
    import time

    capture = CANCapture(use_virtual=True)
    capture.start()
    time.sleep(3)
    capture.stop()

    messages = capture.get_messages(1000)
    print(f"Captured {len(messages)} messages")

    analyzer = SignalAnalyzer()
    results = analyzer.analyze_messages(messages)

    generator = DBCGenerator()
    generator.from_analysis_results(results)
    
    output_path = "output/generated.dbc"
    content = generator.generate(output_path)
    print(f"\nDBC file generated: {output_path}")
    print("\nFirst 500 characters of DBC:")
    print(content[:500])
