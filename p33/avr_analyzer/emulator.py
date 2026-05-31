from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple, Callable
from enum import Enum
import struct

from .disassembler import Instruction, AVRDisassembler


class TaintSource(Enum):
    NONE = 0
    INPUT = 1
    MEMORY = 2
    USER = 3


@dataclass
class TaintInfo:
    tainted: bool = False
    source: TaintSource = TaintSource.NONE
    origin_address: Optional[int] = None
    propagation_path: List[int] = field(default_factory=list)


@dataclass
class CPURegisters:
    r: List[int] = field(default_factory=lambda: [0] * 32)
    pc: int = 0
    sp: int = 0x08FF
    sreg: int = 0
    rampz: int = 0
    eind: int = 0
    sph: int = 0
    spl: int = 0xFF
    
    @property
    def x(self) -> int:
        return (self.r[27] << 8) | self.r[26]
    
    @x.setter
    def x(self, value: int):
        self.r[26] = value & 0xFF
        self.r[27] = (value >> 8) & 0xFF
    
    @property
    def y(self) -> int:
        return (self.r[29] << 8) | self.r[28]
    
    @y.setter
    def y(self, value: int):
        self.r[28] = value & 0xFF
        self.r[29] = (value >> 8) & 0xFF
    
    @property
    def z(self) -> int:
        return (self.r[31] << 8) | self.r[30]
    
    @z.setter
    def z(self, value: int):
        self.r[30] = value & 0xFF
        self.r[31] = (value >> 8) & 0xFF
    
    def get_flag_c(self) -> bool:
        return bool(self.sreg & 0x01)
    
    def set_flag_c(self, val: bool):
        self.sreg = (self.sreg & ~0x01) | (0x01 if val else 0)
    
    def get_flag_z(self) -> bool:
        return bool(self.sreg & 0x02)
    
    def set_flag_z(self, val: bool):
        self.sreg = (self.sreg & ~0x02) | (0x02 if val else 0)
    
    def get_flag_n(self) -> bool:
        return bool(self.sreg & 0x04)
    
    def set_flag_n(self, val: bool):
        self.sreg = (self.sreg & ~0x04) | (0x04 if val else 0)
    
    def get_flag_v(self) -> bool:
        return bool(self.sreg & 0x08)
    
    def set_flag_v(self, val: bool):
        self.sreg = (self.sreg & ~0x08) | (0x08 if val else 0)
    
    def get_flag_s(self) -> bool:
        return bool(self.sreg & 0x10)
    
    def set_flag_s(self, val: bool):
        self.sreg = (self.sreg & ~0x10) | (0x10 if val else 0)
    
    def get_flag_h(self) -> bool:
        return bool(self.sreg & 0x20)
    
    def set_flag_h(self, val: bool):
        self.sreg = (self.sreg & ~0x20) | (0x20 if val else 0)
    
    def get_flag_t(self) -> bool:
        return bool(self.sreg & 0x40)
    
    def set_flag_t(self, val: bool):
        self.sreg = (self.sreg & ~0x40) | (0x40 if val else 0)
    
    def get_flag_i(self) -> bool:
        return bool(self.sreg & 0x80)
    
    def set_flag_i(self, val: bool):
        self.sreg = (self.sreg & ~0x80) | (0x80 if val else 0)


@dataclass
class EmulationResult:
    success: bool
    error: Optional[str] = None
    instructions_executed: int = 0
    final_pc: int = 0
    final_registers: Optional[CPURegisters] = None
    memory_accesses: List[Tuple[str, int, int]] = field(default_factory=list)
    branch_decisions: List[Tuple[int, bool]] = field(default_factory=list)
    function_calls: List[int] = field(default_factory=list)
    tainted_registers: List[int] = field(default_factory=list)
    tainted_memory: List[int] = field(default_factory=list)
    execution_trace: List[int] = field(default_factory=list)


class AVREmulator:
    def __init__(self, firmware_data: bytes, base_addr: int = 0x0000):
        self.firmware_data = firmware_data
        self.base_addr = base_addr
        self.regs = CPURegisters()
        self.flash_size = 0x8000
        self.sram_size = 0x0900
        self.flash = bytearray(self.flash_size)
        self.sram = bytearray(self.sram_size)
        
        self._init_memory()
        
        self.reg_taint: List[TaintInfo] = [TaintInfo() for _ in range(32)]
        self.mem_taint: Dict[int, TaintInfo] = {}
        
        self.breakpoints: Set[int] = set()
        self.hooks: Dict[int, Callable] = {}
        self.max_instructions = 1000000
        self.instruction_count = 0
        
        self.disassembler = AVRDisassembler.__new__(AVRDisassembler)
        self.disassembler.firmware_data = firmware_data
        self.disassembler.base_addr = base_addr
        self.disassembler.instructions = []
        self.instructions = self.disassembler.disassemble_all()
        self.instruction_map = {insn.address: insn for insn in self.instructions}
        
        self.result = EmulationResult(success=False)

    def _init_memory(self):
        for i, byte in enumerate(self.firmware_data):
            if i < self.flash_size:
                self.flash[i] = byte
        
        self.regs.sp = 0x08FF
        self.regs.pc = self.base_addr

    def taint_register(self, reg_num: int, source: TaintSource = TaintSource.USER, origin: Optional[int] = None):
        self.reg_taint[reg_num] = TaintInfo(
            tainted=True,
            source=source,
            origin_address=origin
        )

    def taint_memory(self, addr: int, source: TaintSource = TaintSource.USER, origin: Optional[int] = None):
        self.mem_taint[addr] = TaintInfo(
            tainted=True,
            source=source,
            origin_address=origin
        )

    def _propagate_taint(self, dest_reg: int, src_regs: List[int]):
        tainted = False
        sources = []
        for src in src_regs:
            if self.reg_taint[src].tainted:
                tainted = True
                sources.append(src)
        
        if tainted:
            self.reg_taint[dest_reg] = TaintInfo(
                tainted=True,
                source=self.reg_taint[sources[0]].source,
                origin_address=self.reg_taint[sources[0]].origin_address,
                propagation_path=sources.copy()
            )
        else:
            self.reg_taint[dest_reg] = TaintInfo()

    def _propagate_taint_mem_to_reg(self, dest_reg: int, mem_addr: int):
        if mem_addr in self.mem_taint and self.mem_taint[mem_addr].tainted:
            self.reg_taint[dest_reg] = TaintInfo(
                tainted=True,
                source=self.mem_taint[mem_addr].source,
                origin_address=mem_addr
            )
        else:
            self.reg_taint[dest_reg] = TaintInfo()

    def _propagate_taint_reg_to_mem(self, mem_addr: int, src_reg: int):
        if self.reg_taint[src_reg].tainted:
            self.mem_taint[mem_addr] = TaintInfo(
                tainted=True,
                source=self.reg_taint[src_reg].source,
                origin_address=self.reg_taint[src_reg].origin_address
            )
        elif mem_addr in self.mem_taint:
            del self.mem_taint[mem_addr]

    def add_breakpoint(self, address: int):
        self.breakpoints.add(address)

    def remove_breakpoint(self, address: int):
        self.breakpoints.discard(address)

    def set_max_instructions(self, count: int):
        self.max_instructions = count

    def read_register(self, reg_num: int) -> int:
        return self.regs.r[reg_num]

    def write_register(self, reg_num: int, value: int):
        self.regs.r[reg_num] = value & 0xFF

    def read_memory(self, addr: int) -> int:
        if addr < 0x20:
            return self.regs.r[addr]
        elif addr < 0x100:
            return self._read_io_register(addr)
        elif addr < 0x0900:
            return self.sram[addr - 0x100]
        return 0

    def write_memory(self, addr: int, value: int):
        if addr < 0x20:
            self.regs.r[addr] = value & 0xFF
        elif addr < 0x100:
            self._write_io_register(addr, value)
        elif addr < 0x0900:
            self.sram[addr - 0x100] = value & 0xFF

    def _read_io_register(self, addr: int) -> int:
        if addr == 0x3D:
            return (self.regs.sp >> 8) & 0xFF
        elif addr == 0x3E:
            return self.regs.sp & 0xFF
        elif addr == 0x3F:
            return self.regs.sreg
        return 0

    def _write_io_register(self, addr: int, value: int):
        if addr == 0x3D:
            self.regs.sp = (self.regs.sp & 0x00FF) | ((value & 0xFF) << 8)
        elif addr == 0x3E:
            self.regs.sp = (self.regs.sp & 0xFF00) | (value & 0xFF)
        elif addr == 0x3F:
            self.regs.sreg = value & 0xFF

    def _push_stack(self, value: int):
        self.regs.sp -= 1
        self.write_memory(self.regs.sp, value)

    def _pop_stack(self) -> int:
        value = self.read_memory(self.regs.sp)
        self.regs.sp += 1
        return value

    def _execute_instruction(self, insn: Instruction) -> bool:
        mnemonic = insn.mnemonic
        ops = insn.operands
        
        try:
            if mnemonic == 'nop':
                pass
            
            elif mnemonic == 'rjmp':
                offset = int(ops[0]) if ops else 0
                self.regs.pc += offset
                return True
            
            elif mnemonic == 'jmp':
                if ops and ops[0].startswith('0x'):
                    self.regs.pc = int(ops[0], 16)
                    return True
            
            elif mnemonic == 'ijmp':
                self.regs.pc = self.regs.z
                return True
            
            elif mnemonic == 'eijmp':
                self.regs.pc = (self.regs.eind << 16) | self.regs.z
                return True
            
            elif mnemonic == 'rcall':
                offset = int(ops[0]) if ops else 0
                self._push_stack((self.regs.pc + 2) >> 8)
                self._push_stack((self.regs.pc + 2) & 0xFF)
                self.regs.pc += offset
                self.result.function_calls.append(self.regs.pc)
                return True
            
            elif mnemonic == 'call':
                if ops and ops[0].startswith('0x'):
                    target = int(ops[0], 16)
                    self._push_stack((self.regs.pc + 4) >> 8)
                    self._push_stack((self.regs.pc + 4) & 0xFF)
                    self.regs.pc = target
                    self.result.function_calls.append(self.regs.pc)
                    return True
            
            elif mnemonic == 'icall':
                target = self.regs.z
                self._push_stack((self.regs.pc + 2) >> 8)
                self._push_stack((self.regs.pc + 2) & 0xFF)
                self.regs.pc = target
                self.result.function_calls.append(self.regs.pc)
                return True
            
            elif mnemonic == 'eicall':
                target = (self.regs.eind << 16) | self.regs.z
                self._push_stack((self.regs.pc + 2) >> 8)
                self._push_stack((self.regs.pc + 2) & 0xFF)
                self.regs.pc = target
                self.result.function_calls.append(self.regs.pc)
                return True
            
            elif mnemonic == 'ret':
                lo = self._pop_stack()
                hi = self._pop_stack()
                self.regs.pc = (hi << 8) | lo
                return True
            
            elif mnemonic == 'reti':
                lo = self._pop_stack()
                hi = self._pop_stack()
                self.regs.pc = (hi << 8) | lo
                self.regs.set_flag_i(True)
                return True
            
            elif mnemonic == 'ldi':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                k = int(ops[1]) if len(ops) > 1 else 0
                self.regs.r[d] = k & 0xFF
            
            elif mnemonic == 'mov':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                self.regs.r[d] = self.regs.r[r]
                self._propagate_taint(d, [r])
            
            elif mnemonic == 'movw':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                self.regs.r[d] = self.regs.r[r]
                self.regs.r[d+1] = self.regs.r[r+1]
                self._propagate_taint(d, [r])
                self._propagate_taint(d+1, [r+1])
            
            elif mnemonic == 'add':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                self._execute_add(d, r)
            
            elif mnemonic == 'adc':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                self._execute_adc(d, r)
            
            elif mnemonic == 'sub':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                self._execute_sub(d, r)
            
            elif mnemonic == 'sbc':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                self._execute_sbc(d, r)
            
            elif mnemonic == 'subi':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                k = int(ops[1]) if len(ops) > 1 else 0
                self._execute_subi(d, k)
            
            elif mnemonic == 'sbci':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                k = int(ops[1]) if len(ops) > 1 else 0
                self._execute_sbci(d, k)
            
            elif mnemonic == 'cpi':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                k = int(ops[1]) if len(ops) > 1 else 0
                self._execute_cpi(d, k)
            
            elif mnemonic == 'cp':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                self._execute_cp(d, r)
            
            elif mnemonic == 'cpc':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                self._execute_cpc(d, r)
            
            elif mnemonic == 'andi':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                k = int(ops[1]) if len(ops) > 1 else 0
                result = self.regs.r[d] & k
                self.regs.r[d] = result & 0xFF
                self._update_flags_logic(result)
                self._propagate_taint(d, [d])
            
            elif mnemonic == 'ori':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                k = int(ops[1]) if len(ops) > 1 else 0
                result = self.regs.r[d] | k
                self.regs.r[d] = result & 0xFF
                self._update_flags_logic(result)
                self._propagate_taint(d, [d])
            
            elif mnemonic == 'eor':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                result = self.regs.r[d] ^ self.regs.r[r]
                self.regs.r[d] = result & 0xFF
                self._update_flags_logic(result)
                self._propagate_taint(d, [d, r])
            
            elif mnemonic == 'or':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                result = self.regs.r[d] | self.regs.r[r]
                self.regs.r[d] = result & 0xFF
                self._update_flags_logic(result)
                self._propagate_taint(d, [d, r])
            
            elif mnemonic == 'and':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                result = self.regs.r[d] & self.regs.r[r]
                self.regs.r[d] = result & 0xFF
                self._update_flags_logic(result)
                self._propagate_taint(d, [d, r])
            
            elif mnemonic == 'inc':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                result = (self.regs.r[d] + 1) & 0xFF
                self.regs.r[d] = result
                self._update_flags_logic(result)
                self._propagate_taint(d, [d])
            
            elif mnemonic == 'dec':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                result = (self.regs.r[d] - 1) & 0xFF
                self.regs.r[d] = result
                self._update_flags_logic(result)
                self._propagate_taint(d, [d])
            
            elif mnemonic == 'clr':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                self.regs.r[d] = 0
                self._update_flags_logic(0)
                self.reg_taint[d] = TaintInfo()
            
            elif mnemonic == 'ser':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                self.regs.r[d] = 0xFF
                self._update_flags_logic(0xFF)
            
            elif mnemonic == 'tst':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                result = self.regs.r[d]
                self._update_flags_logic(result)
            
            elif mnemonic == 'swap':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                val = self.regs.r[d]
                self.regs.r[d] = ((val & 0x0F) << 4) | ((val & 0xF0) >> 4)
                self._propagate_taint(d, [d])
            
            elif mnemonic == 'lsl':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                self._execute_lsl(d)
            
            elif mnemonic == 'lsr':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                self._execute_lsr(d)
            
            elif mnemonic == 'rol':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                self._execute_rol(d)
            
            elif mnemonic == 'ror':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                self._execute_ror(d)
            
            elif mnemonic == 'asr':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                self._execute_asr(d)
            
            elif mnemonic == 'com':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                self.regs.r[d] = (~self.regs.r[d]) & 0xFF
                self.regs.set_flag_c(True)
                self._update_flags_logic(self.regs.r[d])
                self._propagate_taint(d, [d])
            
            elif mnemonic == 'neg':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                val = self.regs.r[d]
                result = (-val) & 0xFF
                self.regs.r[d] = result
                if val != 0:
                    self.regs.set_flag_c(True)
                else:
                    self.regs.set_flag_c(False)
                self._update_flags_logic(result)
                self._propagate_taint(d, [d])
            
            elif mnemonic == 'push':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                self._push_stack(self.regs.r[d])
            
            elif mnemonic == 'pop':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                self.regs.r[d] = self._pop_stack()
                self._propagate_taint_mem_to_reg(d, self.regs.sp)
            
            elif mnemonic == 'ld':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                ptr = ops[1] if len(ops) > 1 else ''
                addr = self._get_load_address(ptr)
                self.regs.r[d] = self.read_memory(addr)
                self.result.memory_accesses.append(('read', addr, self.regs.r[d]))
                self._propagate_taint_mem_to_reg(d, addr)
            
            elif mnemonic == 'st':
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                ptr = ops[0] if ops else ''
                addr = self._get_store_address(ptr)
                self.write_memory(addr, self.regs.r[r])
                self.result.memory_accesses.append(('write', addr, self.regs.r[r]))
                self._propagate_taint_reg_to_mem(addr, r)
            
            elif mnemonic == 'lds':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                addr = int(ops[1], 16) if len(ops) > 1 and ops[1].startswith('0x') else 0
                self.regs.r[d] = self.read_memory(addr)
                self.result.memory_accesses.append(('read', addr, self.regs.r[d]))
                self._propagate_taint_mem_to_reg(d, addr)
            
            elif mnemonic == 'sts':
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                addr = int(ops[0], 16) if ops and ops[0].startswith('0x') else 0
                self.write_memory(addr, self.regs.r[r])
                self.result.memory_accesses.append(('write', addr, self.regs.r[r]))
                self._propagate_taint_reg_to_mem(addr, r)
            
            elif mnemonic == 'in':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                addr = int(ops[1], 16) if len(ops) > 1 and ops[1].startswith('0x') else 0
                self.regs.r[d] = self._read_io_register(addr)
            
            elif mnemonic == 'out':
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                addr = int(ops[0], 16) if ops and ops[0].startswith('0x') else 0
                self._write_io_register(addr, self.regs.r[r])
            
            elif mnemonic == 'adiw':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                k = int(ops[1]) if len(ops) > 1 else 0
                self._execute_adiw(d, k)
            
            elif mnemonic == 'sbiw':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                k = int(ops[1]) if len(ops) > 1 else 0
                self._execute_sbiw(d, k)
            
            elif mnemonic == 'sbi':
                addr = int(ops[0], 16) if ops and ops[0].startswith('0x') else 0
                bit = int(ops[1]) if len(ops) > 1 else 0
                val = self._read_io_register(addr)
                self._write_io_register(addr, val | (1 << bit))
            
            elif mnemonic == 'cbi':
                addr = int(ops[0], 16) if ops and ops[0].startswith('0x') else 0
                bit = int(ops[1]) if len(ops) > 1 else 0
                val = self._read_io_register(addr)
                self._write_io_register(addr, val & ~(1 << bit))
            
            elif mnemonic == 'sbis':
                addr = int(ops[0], 16) if ops and ops[0].startswith('0x') else 0
                bit = int(ops[1]) if len(ops) > 1 else 0
                val = self._read_io_register(addr)
                if val & (1 << bit):
                    self.regs.pc += 2
            
            elif mnemonic == 'sbic':
                addr = int(ops[0], 16) if ops and ops[0].startswith('0x') else 0
                bit = int(ops[1]) if len(ops) > 1 else 0
                val = self._read_io_register(addr)
                if not (val & (1 << bit)):
                    self.regs.pc += 2
            
            elif mnemonic in ('brcs', 'brcc', 'breq', 'brne', 'brmi', 'brpl', 
                             'brvs', 'brvc', 'brlt', 'brge', 'brhs', 'brhc',
                             'brts', 'brtc', 'brie', 'brid'):
                taken = self._check_branch_condition(mnemonic)
                offset = int(ops[0]) if ops else 0
                self.result.branch_decisions.append((insn.address, taken))
                if taken:
                    self.regs.pc += offset
            
            elif mnemonic == 'sei':
                self.regs.set_flag_i(True)
            
            elif mnemonic == 'cli':
                self.regs.set_flag_i(False)
            
            elif mnemonic == 'sec':
                self.regs.set_flag_c(True)
            elif mnemonic == 'clc':
                self.regs.set_flag_c(False)
            elif mnemonic == 'sen':
                self.regs.set_flag_n(True)
            elif mnemonic == 'cln':
                self.regs.set_flag_n(False)
            elif mnemonic == 'sez':
                self.regs.set_flag_z(True)
            elif mnemonic == 'clz':
                self.regs.set_flag_z(False)
            elif mnemonic == 'ses':
                self.regs.set_flag_s(True)
            elif mnemonic == 'cls':
                self.regs.set_flag_s(False)
            elif mnemonic == 'sev':
                self.regs.set_flag_v(True)
            elif mnemonic == 'clv':
                self.regs.set_flag_v(False)
            elif mnemonic == 'set':
                self.regs.set_flag_t(True)
            elif mnemonic == 'clt':
                self.regs.set_flag_t(False)
            elif mnemonic == 'seh':
                self.regs.set_flag_h(True)
            elif mnemonic == 'clh':
                self.regs.set_flag_h(False)
            
            elif mnemonic == 'wdr':
                pass
            
            elif mnemonic == 'sleep':
                pass
            
            elif mnemonic == 'bset':
                bit = int(ops[0]) if ops else 0
                self.regs.sreg |= (1 << bit)
            
            elif mnemonic == 'bclr':
                bit = int(ops[0]) if ops else 0
                self.regs.sreg &= ~(1 << bit)
            
            elif mnemonic == 'bld':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                bit = int(ops[1]) if len(ops) > 1 else 0
                if self.regs.get_flag_t():
                    self.regs.r[d] |= (1 << bit)
                else:
                    self.regs.r[d] &= ~(1 << bit)
            
            elif mnemonic == 'bst':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                bit = int(ops[1]) if len(ops) > 1 else 0
                self.regs.set_flag_t(bool(self.regs.r[d] & (1 << bit)))
            
            elif mnemonic == 'cpse':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                if self.regs.r[d] == self.regs.r[r]:
                    self.regs.pc += 2
            
            elif mnemonic == 'mul':
                d = int(ops[0][1:]) if ops and ops[0].startswith('r') else 0
                r = int(ops[1][1:]) if len(ops) > 1 and ops[1].startswith('r') else 0
                result = self.regs.r[d] * self.regs.r[r]
                self.regs.r[0] = result & 0xFF
                self.regs.r[1] = (result >> 8) & 0xFF
                self.regs.set_flag_c(bool(result & 0x8000))
                self.regs.set_flag_z(result == 0)
                self._propagate_taint(0, [d, r])
                self._propagate_taint(1, [d, r])
            
            elif mnemonic == 'lpm':
                if len(ops) == 1:
                    d = int(ops[0][1:]) if ops[0].startswith('r') else 0
                    flash_addr = self.regs.z
                    if flash_addr + 1 < len(self.flash):
                        self.regs.r[d] = self.flash[flash_addr]
            
            elif mnemonic == 'elpm':
                if len(ops) == 1:
                    d = int(ops[0][1:]) if ops[0].startswith('r') else 0
                    flash_addr = (self.regs.rampz << 16) | self.regs.z
                    if flash_addr + 1 < len(self.flash):
                        self.regs.r[d] = self.flash[flash_addr]
            
            elif mnemonic == 'spm':
                pass
            
            else:
                pass
            
            return False
            
        except Exception as e:
            self.result.error = f"Error executing {mnemonic}: {e}"
            return False

    def _execute_add(self, d: int, r: int):
        a = self.regs.r[d]
        b = self.regs.r[r]
        result = a + b
        
        self.regs.set_flag_h(bool((a & 0x0F) + (b & 0x0F) > 0x0F))
        self.regs.set_flag_v(bool((a & 0x80) == (b & 0x80) and (result & 0x80) != (a & 0x80)))
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z((result & 0xFF) == 0)
        self.regs.set_flag_c(result > 0xFF)
        self.regs.set_flag_s(self.regs.get_flag_n() ^ self.regs.get_flag_v())
        
        self.regs.r[d] = result & 0xFF
        self._propagate_taint(d, [d, r])

    def _execute_adc(self, d: int, r: int):
        a = self.regs.r[d]
        b = self.regs.r[r]
        c = 1 if self.regs.get_flag_c() else 0
        result = a + b + c
        
        self.regs.set_flag_h(bool((a & 0x0F) + (b & 0x0F) + c > 0x0F))
        self.regs.set_flag_v(bool((a & 0x80) == (b & 0x80) and ((result & 0x80) != (a & 0x80))))
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z((result & 0xFF) == 0)
        self.regs.set_flag_c(result > 0xFF)
        self.regs.set_flag_s(self.regs.get_flag_n() ^ self.regs.get_flag_v())
        
        self.regs.r[d] = result & 0xFF
        self._propagate_taint(d, [d, r])

    def _execute_sub(self, d: int, r: int):
        a = self.regs.r[d]
        b = self.regs.r[r]
        result = a - b
        
        self.regs.set_flag_h(bool((a & 0x0F) < (b & 0x0F)))
        self.regs.set_flag_v(bool((a & 0x80) != (b & 0x80) and (result & 0x80) != (a & 0x80)))
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z((result & 0xFF) == 0)
        self.regs.set_flag_c(result < 0)
        self.regs.set_flag_s(self.regs.get_flag_n() ^ self.regs.get_flag_v())
        
        self.regs.r[d] = result & 0xFF
        self._propagate_taint(d, [d, r])

    def _execute_sbc(self, d: int, r: int):
        a = self.regs.r[d]
        b = self.regs.r[r]
        c = 1 if self.regs.get_flag_c() else 0
        result = a - b - c
        
        self.regs.set_flag_h(bool((a & 0x0F) < (b & 0x0F) + c))
        self.regs.set_flag_v(bool((a & 0x80) != (b & 0x80) and ((result & 0x80) != (a & 0x80))))
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z((result & 0xFF) == 0)
        self.regs.set_flag_c(result < 0)
        self.regs.set_flag_s(self.regs.get_flag_n() ^ self.regs.get_flag_v())
        
        self.regs.r[d] = result & 0xFF
        self._propagate_taint(d, [d, r])

    def _execute_subi(self, d: int, k: int):
        a = self.regs.r[d]
        result = a - k
        
        self.regs.set_flag_h(bool((a & 0x0F) < (k & 0x0F)))
        self.regs.set_flag_v(bool((a & 0x80) != (k & 0x80) and (result & 0x80) != (a & 0x80)))
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z((result & 0xFF) == 0)
        self.regs.set_flag_c(result < 0)
        self.regs.set_flag_s(self.regs.get_flag_n() ^ self.regs.get_flag_v())
        
        self.regs.r[d] = result & 0xFF
        self._propagate_taint(d, [d])

    def _execute_sbci(self, d: int, k: int):
        a = self.regs.r[d]
        c = 1 if self.regs.get_flag_c() else 0
        result = a - k - c
        
        self.regs.set_flag_h(bool((a & 0x0F) < (k & 0x0F) + c))
        self.regs.set_flag_v(bool((a & 0x80) != (k & 0x80) and ((result & 0x80) != (a & 0x80))))
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z((result & 0xFF) == 0)
        self.regs.set_flag_c(result < 0)
        self.regs.set_flag_s(self.regs.get_flag_n() ^ self.regs.get_flag_v())
        
        self.regs.r[d] = result & 0xFF
        self._propagate_taint(d, [d])

    def _execute_cpi(self, d: int, k: int):
        a = self.regs.r[d]
        result = a - k
        
        self.regs.set_flag_h(bool((a & 0x0F) < (k & 0x0F)))
        self.regs.set_flag_v(bool((a & 0x80) != (k & 0x80) and (result & 0x80) != (a & 0x80)))
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z((result & 0xFF) == 0)
        self.regs.set_flag_c(result < 0)
        self.regs.set_flag_s(self.regs.get_flag_n() ^ self.regs.get_flag_v())

    def _execute_cp(self, d: int, r: int):
        a = self.regs.r[d]
        b = self.regs.r[r]
        result = a - b
        
        self.regs.set_flag_h(bool((a & 0x0F) < (b & 0x0F)))
        self.regs.set_flag_v(bool((a & 0x80) != (b & 0x80) and (result & 0x80) != (a & 0x80)))
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z((result & 0xFF) == 0)
        self.regs.set_flag_c(result < 0)
        self.regs.set_flag_s(self.regs.get_flag_n() ^ self.regs.get_flag_v())

    def _execute_cpc(self, d: int, r: int):
        a = self.regs.r[d]
        b = self.regs.r[r]
        c = 1 if self.regs.get_flag_c() else 0
        result = a - b - c
        
        self.regs.set_flag_h(bool((a & 0x0F) < (b & 0x0F) + c))
        self.regs.set_flag_v(bool((a & 0x80) != (b & 0x80) and ((result & 0x80) != (a & 0x80))))
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z((result & 0xFF) == 0)
        self.regs.set_flag_c(result < 0)
        self.regs.set_flag_s(self.regs.get_flag_n() ^ self.regs.get_flag_v())

    def _execute_adiw(self, d: int, k: int):
        a = (self.regs.r[d+1] << 8) | self.regs.r[d]
        result = a + k
        
        self.regs.set_flag_v(bool((a & 0x8000) == 0 and (result & 0x8000) != 0))
        self.regs.set_flag_n(bool(result & 0x8000))
        self.regs.set_flag_z((result & 0xFFFF) == 0)
        self.regs.set_flag_c(result > 0xFFFF)
        self.regs.set_flag_s(self.regs.get_flag_n() ^ self.regs.get_flag_v())
        
        self.regs.r[d] = result & 0xFF
        self.regs.r[d+1] = (result >> 8) & 0xFF
        self._propagate_taint(d, [d, d+1])
        self._propagate_taint(d+1, [d, d+1])

    def _execute_sbiw(self, d: int, k: int):
        a = (self.regs.r[d+1] << 8) | self.regs.r[d]
        result = a - k
        
        self.regs.set_flag_v(bool((a & 0x8000) != 0 and (result & 0x8000) == 0))
        self.regs.set_flag_n(bool(result & 0x8000))
        self.regs.set_flag_z((result & 0xFFFF) == 0)
        self.regs.set_flag_c(result < 0)
        self.regs.set_flag_s(self.regs.get_flag_n() ^ self.regs.get_flag_v())
        
        self.regs.r[d] = result & 0xFF
        self.regs.r[d+1] = (result >> 8) & 0xFF
        self._propagate_taint(d, [d, d+1])
        self._propagate_taint(d+1, [d, d+1])

    def _execute_lsl(self, d: int):
        val = self.regs.r[d]
        self.regs.set_flag_c(bool(val & 0x80))
        result = (val << 1) & 0xFF
        self.regs.r[d] = result
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z(result == 0)
        self.regs.set_flag_v(self.regs.get_flag_n() ^ self.regs.get_flag_c())
        self._propagate_taint(d, [d])

    def _execute_lsr(self, d: int):
        val = self.regs.r[d]
        self.regs.set_flag_c(bool(val & 0x01))
        result = val >> 1
        self.regs.r[d] = result
        self.regs.set_flag_n(False)
        self.regs.set_flag_z(result == 0)
        self.regs.set_flag_v(self.regs.get_flag_c())
        self._propagate_taint(d, [d])

    def _execute_rol(self, d: int):
        val = self.regs.r[d]
        c = 1 if self.regs.get_flag_c() else 0
        self.regs.set_flag_c(bool(val & 0x80))
        result = ((val << 1) | c) & 0xFF
        self.regs.r[d] = result
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z(result == 0)
        self.regs.set_flag_v(self.regs.get_flag_n() ^ self.regs.get_flag_c())
        self._propagate_taint(d, [d])

    def _execute_ror(self, d: int):
        val = self.regs.r[d]
        c = 1 if self.regs.get_flag_c() else 0
        self.regs.set_flag_c(bool(val & 0x01))
        result = (val >> 1) | (c << 7)
        self.regs.r[d] = result
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z(result == 0)
        self.regs.set_flag_v(self.regs.get_flag_n() ^ self.regs.get_flag_c())
        self._propagate_taint(d, [d])

    def _execute_asr(self, d: int):
        val = self.regs.r[d]
        self.regs.set_flag_c(bool(val & 0x01))
        sign = val & 0x80
        result = (val >> 1) | sign
        self.regs.r[d] = result
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z(result == 0)
        self.regs.set_flag_v(self.regs.get_flag_n() ^ self.regs.get_flag_c())
        self._propagate_taint(d, [d])

    def _update_flags_logic(self, result: int):
        self.regs.set_flag_n(bool(result & 0x80))
        self.regs.set_flag_z(result == 0)
        self.regs.set_flag_v(False)
        self.regs.set_flag_s(self.regs.get_flag_n())

    def _check_branch_condition(self, mnemonic: str) -> bool:
        conditions = {
            'brcs': lambda: self.regs.get_flag_c(),
            'brcc': lambda: not self.regs.get_flag_c(),
            'breq': lambda: self.regs.get_flag_z(),
            'brne': lambda: not self.regs.get_flag_z(),
            'brmi': lambda: self.regs.get_flag_n(),
            'brpl': lambda: not self.regs.get_flag_n(),
            'brvs': lambda: self.regs.get_flag_v(),
            'brvc': lambda: not self.regs.get_flag_v(),
            'brlt': lambda: self.regs.get_flag_n() != self.regs.get_flag_v(),
            'brge': lambda: self.regs.get_flag_n() == self.regs.get_flag_v(),
            'brhs': lambda: self.regs.get_flag_h(),
            'brhc': lambda: not self.regs.get_flag_h(),
            'brts': lambda: self.regs.get_flag_t(),
            'brtc': lambda: not self.regs.get_flag_t(),
            'brie': lambda: self.regs.get_flag_i(),
            'brid': lambda: not self.regs.get_flag_i(),
        }
        return conditions.get(mnemonic, lambda: False)()

    def _get_load_address(self, ptr: str) -> int:
        if ptr == 'X':
            return self.regs.x
        elif ptr == 'X+':
            addr = self.regs.x
            self.regs.x += 1
            return addr
        elif ptr == '-X':
            self.regs.x -= 1
            return self.regs.x
        elif ptr == 'Y':
            return self.regs.y
        elif ptr == 'Y+':
            addr = self.regs.y
            self.regs.y += 1
            return addr
        elif ptr == '-Y':
            self.regs.y -= 1
            return self.regs.y
        elif ptr == 'Z':
            return self.regs.z
        elif ptr == 'Z+':
            addr = self.regs.z
            self.regs.z += 1
            return addr
        elif ptr == '-Z':
            self.regs.z -= 1
            return self.regs.z
        elif '+' in ptr:
            if 'Y' in ptr:
                offset = int(ptr.split('+')[1]) if '+' in ptr else 0
                return self.regs.y + offset
            elif 'Z' in ptr:
                offset = int(ptr.split('+')[1]) if '+' in ptr else 0
                return self.regs.z + offset
        return 0

    def _get_store_address(self, ptr: str) -> int:
        if ptr == 'X':
            return self.regs.x
        elif ptr == 'X+':
            addr = self.regs.x
            self.regs.x += 1
            return addr
        elif ptr == '-X':
            self.regs.x -= 1
            return self.regs.x
        elif ptr == 'Y':
            return self.regs.y
        elif ptr == 'Y+':
            addr = self.regs.y
            self.regs.y += 1
            return addr
        elif ptr == '-Y':
            self.regs.y -= 1
            return self.regs.y
        elif ptr == 'Z':
            return self.regs.z
        elif ptr == 'Z+':
            addr = self.regs.z
            self.regs.z += 1
            return addr
        elif ptr == '-Z':
            self.regs.z -= 1
            return self.regs.z
        elif '+' in ptr:
            if 'Y' in ptr:
                parts = ptr.split('+')
                offset = int(parts[1]) if len(parts) > 1 else 0
                return self.regs.y + offset
            elif 'Z' in ptr:
                parts = ptr.split('+')
                offset = int(parts[1]) if len(parts) > 1 else 0
                return self.regs.z + offset
        return 0

    def run(self, start_addr: Optional[int] = None, max_steps: Optional[int] = None) -> EmulationResult:
        if start_addr is not None:
            self.regs.pc = start_addr
        
        if max_steps is not None:
            self.max_instructions = max_steps
        
        self.instruction_count = 0
        self.result = EmulationResult(success=False)
        
        while self.instruction_count < self.max_instructions:
            pc = self.regs.pc
            
            if pc in self.breakpoints:
                self.result.error = f"Breakpoint hit at 0x{pc:04X}"
                break
            
            if pc in self.hooks:
                self.hooks[pc](self)
            
            insn = self.instruction_map.get(pc)
            if insn is None:
                self.result.error = f"Invalid PC: 0x{pc:04X}"
                break
            
            self.result.execution_trace.append(pc)
            self.instruction_count += 1
            
            jumped = self._execute_instruction(insn)
            
            if not jumped:
                self.regs.pc += insn.size
            
            if self.regs.pc >= len(self.firmware_data) and pc >= len(self.firmware_data):
                self.result.success = True
                break
        
        self.result.instructions_executed = self.instruction_count
        self.result.final_pc = self.regs.pc
        self.result.final_registers = CPURegisters()
        self.result.final_registers.r = self.regs.r.copy()
        self.result.final_registers.pc = self.regs.pc
        self.result.final_registers.sp = self.regs.sp
        self.result.final_registers.sreg = self.regs.sreg
        
        self.result.tainted_registers = [i for i in range(32) if self.reg_taint[i].tainted]
        self.result.tainted_memory = list(self.mem_taint.keys())
        
        if self.result.error is None:
            self.result.success = True
        
        return self.result

    def get_tainted_registers(self) -> List[int]:
        return [i for i in range(32) if self.reg_taint[i].tainted]

    def get_tainted_memory(self) -> List[int]:
        return list(self.mem_taint.keys())

    def get_taint_info(self, reg_or_addr) -> Optional[TaintInfo]:
        if isinstance(reg_or_addr, int):
            if reg_or_addr < 32:
                return self.reg_taint[reg_or_addr]
            return self.mem_taint.get(reg_or_addr)
        return None

    def print_taint_report(self):
        print("\n" + "="*60)
        print("DYNAMIC TAINT ANALYSIS REPORT")
        print("="*60)
        
        tainted_regs = self.get_tainted_registers()
        if tainted_regs:
            print(f"\nTainted Registers ({len(tainted_regs)}):")
            for reg in tainted_regs:
                info = self.reg_taint[reg]
                print(f"  r{reg}: source={info.source.name}, origin=0x{info.origin_address:04X}" if info.origin_address else 
                      f"  r{reg}: source={info.source.name}")
        else:
            print("\nNo tainted registers.")
        
        tainted_mem = self.get_tainted_memory()
        if tainted_mem:
            print(f"\nTainted Memory Locations ({len(tainted_mem)}):")
            for addr in sorted(tainted_mem)[:20]:
                info = self.mem_taint[addr]
                print(f"  0x{addr:04X}: source={info.source.name}")
            if len(tainted_mem) > 20:
                print(f"  ... and {len(tainted_mem) - 20} more")
        else:
            print("\nNo tainted memory locations.")
