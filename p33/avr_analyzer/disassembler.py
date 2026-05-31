from dataclasses import dataclass, field
from typing import List, Dict, Optional
from .avr_instructions import decode_avr_instruction


@dataclass
class Instruction:
    address: int
    size: int
    mnemonic: str
    op_str: str
    bytes: bytes
    operands: List[str] = field(default_factory=list)


@dataclass
class Function:
    name: str
    start_addr: int
    end_addr: int = 0
    instructions: List[Instruction] = field(default_factory=list)
    calls: List[int] = field(default_factory=list)
    called_by: List[int] = field(default_factory=list)


class AVRDisassembler:
    def __init__(self, firmware_path: str, base_addr: int = 0x0000):
        self.firmware_path = firmware_path
        self.base_addr = base_addr
        self.firmware_data = self._read_firmware()
        self.instructions: List[Instruction] = []
        self.functions: Dict[int, Function] = {}

    def _read_firmware(self) -> bytes:
        with open(self.firmware_path, 'rb') as f:
            return f.read()

    def _parse_operands(self, op_str: str) -> List[str]:
        if not op_str:
            return []
        return [op.strip() for op in op_str.split(',')]

    def disassemble_all(self) -> List[Instruction]:
        self.instructions = []
        offset = 0
        firmware_len = len(self.firmware_data)
        
        while offset < firmware_len:
            if offset + 2 > firmware_len:
                break
                
            opcode = int.from_bytes(self.firmware_data[offset:offset+2], 'little')
            address = self.base_addr + offset
            
            mnemonic, op_str, size = decode_avr_instruction(opcode, address)
            
            if mnemonic == 'jmp' and size == 4 and offset + 4 <= firmware_len:
                target = int.from_bytes(self.firmware_data[offset+2:offset+4], 'little')
                op_str = f"0x{target:04X}"
            
            if mnemonic == 'call' and size == 4 and offset + 4 <= firmware_len:
                target = int.from_bytes(self.firmware_data[offset+2:offset+4], 'little')
                op_str = f"0x{target:04X}"
            
            insn_bytes = self.firmware_data[offset:offset+size]
            instruction = Instruction(
                address=address,
                size=size,
                mnemonic=mnemonic,
                op_str=op_str,
                bytes=insn_bytes,
                operands=self._parse_operands(op_str)
            )
            self.instructions.append(instruction)
            
            offset += size
        
        return self.instructions

    def get_instruction_at(self, address: int) -> Optional[Instruction]:
        for insn in self.instructions:
            if insn.address == address:
                return insn
        return None

    def find_functions(self) -> Dict[int, Function]:
        self.functions = {}
        function_starts = set()

        function_starts.add(self.base_addr)

        for insn in self.instructions:
            if insn.mnemonic in ('call', 'rcall', 'jmp', 'rjmp', 'brne', 'breq',
                                 'brcs', 'brcc', 'brmi', 'brpl', 'brge', 'brlt',
                                 'brhs', 'brhc', 'brts', 'brtc', 'brvs', 'brvc',
                                 'brie', 'brid'):
                if insn.operands:
                    try:
                        target = self._parse_target(insn.operands[0], insn.address)
                        if target is not None:
                            function_starts.add(target)
                    except (ValueError, IndexError):
                        pass

        function_starts = sorted(function_starts)

        for i, start_addr in enumerate(function_starts):
            end_addr = function_starts[i + 1] if i + 1 < len(function_starts) else len(self.firmware_data) * 2
            func = Function(
                name=f"sub_{start_addr:04X}",
                start_addr=start_addr,
                end_addr=end_addr
            )
            self.functions[start_addr] = func

        for insn in self.instructions:
            for start_addr, func in self.functions.items():
                if start_addr <= insn.address < func.end_addr:
                    func.instructions.append(insn)
                    break

        self._analyze_function_calls()

        return self.functions

    def _parse_target(self, operand: str, current_addr: int) -> Optional[int]:
        operand = operand.strip()
        if operand.startswith('.+'):
            try:
                offset = int(operand[2:])
                return current_addr + offset
            except ValueError:
                return None
        elif operand.startswith('.-'):
            try:
                offset = int(operand[1:])
                return current_addr + offset
            except ValueError:
                return None
        elif operand.startswith('0x'):
            try:
                return int(operand, 16)
            except ValueError:
                return None
        elif operand.isdigit():
            return int(operand)
        return None

    def _analyze_function_calls(self):
        for func in self.functions.values():
            for insn in func.instructions:
                if insn.mnemonic in ('call', 'rcall'):
                    if insn.operands:
                        target = self._parse_target(insn.operands[0], insn.address)
                        if target is not None and target in self.functions:
                            func.calls.append(target)
                            self.functions[target].called_by.append(func.start_addr)

    def get_function_at(self, address: int) -> Optional[Function]:
        return self.functions.get(address)

    def print_disassembly(self, limit: Optional[int] = None):
        count = 0
        for insn in self.instructions:
            if limit and count >= limit:
                break
            print(f"0x{insn.address:04X}:  {insn.bytes.hex():<8}  {insn.mnemonic:<8} {insn.op_str}")
            count += 1
