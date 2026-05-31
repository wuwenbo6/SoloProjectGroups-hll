from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum
from .disassembler import Instruction, Function


class RiskLevel(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class RiskPattern:
    name: str
    description: str
    level: RiskLevel
    instructions: List[Instruction] = field(default_factory=list)


@dataclass
class RiskAnalysisResult:
    patterns: List[RiskPattern] = field(default_factory=list)
    total_risks: int = 0
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0


class RiskAnalyzer:
    def __init__(self, instructions: List[Instruction], functions: List[Function]):
        self.instructions = instructions
        self.functions = functions
        self.result = RiskAnalysisResult()

    def analyze(self) -> RiskAnalysisResult:
        self._check_wdt_disable()
        self._check_interrupt_disable()
        self._check_stack_operations()
        self._check_eeprom_access()
        self._check_memory_access()
        self._check_unhandled_interrupts()
        self._summarize_risks()
        return self.result

    def _check_wdt_disable(self):
        wdtmc_routines = []
        for func in self.functions:
            has_wdr = False
            has_wdt_config = False
            wdt_instructions = []
            
            for insn in func.instructions:
                if insn.mnemonic == 'wdr':
                    has_wdr = True
                    wdt_instructions.append(insn)
                
                if insn.mnemonic in ('out', 'sts') and len(insn.operands) >= 2:
                    first_op = insn.operands[0].lower()
                    second_op = insn.operands[1].lower() if len(insn.operands) > 1 else ''
                    
                    if 'wdtcsr' in first_op or 'wdtcr' in first_op or '0x34' in first_op or '0x60' in first_op:
                        has_wdt_config = True
                        wdt_instructions.append(insn)
                        
                        if 'r1' in second_op or '0x0' in second_op or '0x00' in second_op:
                            pattern = RiskPattern(
                                name="WDT_DISABLE_DANGEROUS",
                                description="Watchdog timer is being disabled by writing 0 to WDTCSR register. "
                                           "This can lead to system not recovering from unexpected hangs.",
                                level=RiskLevel.CRITICAL,
                                instructions=[insn]
                            )
                            self.result.patterns.append(pattern)

            if has_wdt_config and not has_wdr:
                pattern = RiskPattern(
                    name="WDT_CONFIGURED_BUT_NOT_RESET",
                    description=f"Function {func.name} configures WDT but never issues WDR reset instruction. "
                               f"System may unexpectedly reset if WDT is enabled but not serviced.",
                    level=RiskLevel.HIGH,
                    instructions=wdt_instructions
                )
                self.result.patterns.append(pattern)

    def _check_interrupt_disable(self):
        for func in self.functions:
            cli_found = False
            sei_found = False
            cli_address = None
            cli_insn = None
            
            for insn in func.instructions:
                if insn.mnemonic == 'cli':
                    cli_found = True
                    cli_address = insn.address
                    cli_insn = insn
                elif insn.mnemonic == 'sei' and cli_found:
                    sei_found = True
            
            if cli_found and not sei_found:
                pattern = RiskPattern(
                    name="INTERRUPTS_DISABLED_WITHOUT_REENABLE",
                    description=f"Interrupts disabled at 0x{cli_address:04X} but never re-enabled in function. "
                               f"This can cause missed events and system instability.",
                    level=RiskLevel.HIGH,
                    instructions=[cli_insn] if cli_insn else []
                )
                self.result.patterns.append(pattern)

    def _check_stack_operations(self):
        push_count = 0
        pop_count = 0
        stack_instructions = []
        
        for func in self.functions:
            func_push = 0
            func_pop = 0
            
            for insn in func.instructions:
                if insn.mnemonic == 'push':
                    push_count += 1
                    func_push += 1
                    stack_instructions.append(insn)
                elif insn.mnemonic == 'pop':
                    pop_count += 1
                    func_pop += 1
                    stack_instructions.append(insn)
            
            if func_push != func_pop:
                pattern = RiskPattern(
                    name="STACK_IMBALANCE",
                    description=f"Function {func.name} has {func_push} pushes but {func_pop} pops. "
                               f"Stack imbalance can cause crashes or undefined behavior.",
                    level=RiskLevel.HIGH,
                    instructions=[insn for insn in func.instructions 
                                  if insn.mnemonic in ('push', 'pop')]
                )
                self.result.patterns.append(pattern)

    def _check_eeprom_access(self):
        for func in self.functions:
            eeprom_instructions = []
            has_eeprom_wait = False
            
            for insn in func.instructions:
                if insn.mnemonic in ('out', 'sts', 'in', 'lds'):
                    operand = insn.operands[0].lower() if insn.operands else ''
                    if 'ee' in operand or '0x1f' in operand or '0x20' in operand or '0x21' in operand:
                        eeprom_instructions.append(insn)
                        if 'eere' in insn.op_str.lower() or 'eewe' in insn.op_str.lower():
                            has_eeprom_wait = True
            
            if len(eeprom_instructions) > 0 and not has_eeprom_wait:
                pattern = RiskPattern(
                    name="EEPROM_ACCESS_NO_WAIT",
                    description=f"Function {func.name} accesses EEPROM but does not check EEPROM ready flag. "
                               f"This can cause corrupted EEPROM reads/writes.",
                    level=RiskLevel.MEDIUM,
                    instructions=eeprom_instructions
                )
                self.result.patterns.append(pattern)

    def _check_memory_access(self):
        for insn in self.instructions:
            if insn.mnemonic in ('ld', 'st', 'lds', 'sts'):
                if len(insn.operands) >= 2:
                    dest = insn.operands[0].lower()
                    src = insn.operands[1].lower() if len(insn.operands) > 1 else ''
                    
                    if '0x00' in src or '0x00' in dest:
                        pattern = RiskPattern(
                            name="NULL_POINTER_ACCESS",
                            description=f"Potential null pointer access at 0x{insn.address:04X}: {insn.mnemonic} {insn.op_str}",
                            level=RiskLevel.HIGH,
                            instructions=[insn]
                        )
                        self.result.patterns.append(pattern)

    def _check_unhandled_interrupts(self):
        interrupt_vectors = {
            0x00: "RESET",
            0x02: "INT0",
            0x04: "INT1",
            0x06: "PCINT0",
            0x08: "PCINT1",
            0x0A: "PCINT2",
            0x0C: "WDT",
            0x0E: "TIMER2_COMPA",
            0x10: "TIMER2_COMPB",
            0x12: "TIMER2_OVF",
            0x14: "TIMER1_CAPT",
            0x16: "TIMER1_COMPA",
            0x18: "TIMER1_COMPB",
            0x1A: "TIMER1_OVF",
            0x1C: "TIMER0_COMPA",
            0x1E: "TIMER0_COMPB",
            0x20: "TIMER0_OVF",
            0x22: "SPI_STC",
            0x24: "USART_RX",
            0x26: "USART_UDRE",
            0x28: "USART_TX",
            0x2A: "ADC",
            0x2C: "EE_READY",
            0x2E: "ANALOG_COMP",
            0x30: "TWI",
            0x32: "SPM_READY"
        }
        
        for func in self.functions:
            if func.start_addr in interrupt_vectors:
                if len(func.instructions) <= 2:
                    first_insn = func.instructions[0] if func.instructions else None
                    if first_insn and first_insn.mnemonic in ('reti', 'ret', 'rjmp', 'jmp'):
                        pattern = RiskPattern(
                            name=f"UNHANDLED_{interrupt_vectors[func.start_addr]}_INTERRUPT",
                            description=f"{interrupt_vectors[func.start_addr]} interrupt vector at 0x{func.start_addr:04X} "
                                       f"appears to be unhandled (only contains return or jump).",
                            level=RiskLevel.MEDIUM,
                            instructions=func.instructions[:3]
                        )
                        self.result.patterns.append(pattern)

    def _summarize_risks(self):
        self.result.total_risks = len(self.result.patterns)
        for pattern in self.result.patterns:
            if pattern.level == RiskLevel.CRITICAL:
                self.result.critical_count += 1
            elif pattern.level == RiskLevel.HIGH:
                self.result.high_count += 1
            elif pattern.level == RiskLevel.MEDIUM:
                self.result.medium_count += 1
            elif pattern.level == RiskLevel.LOW:
                self.result.low_count += 1

    def print_report(self):
        print("\n" + "="*60)
        print("RISK ANALYSIS REPORT")
        print("="*60)
        print(f"\nTotal risks found: {self.result.total_risks}")
        print(f"  Critical: {self.result.critical_count}")
        print(f"  High:     {self.result.high_count}")
        print(f"  Medium:   {self.result.medium_count}")
        print(f"  Low:      {self.result.low_count}")
        
        if self.result.patterns:
            print("\n" + "-"*60)
            print("DETAILS:")
            print("-"*60)
            
            for i, pattern in enumerate(self.result.patterns, 1):
                level_color = self._get_level_color(pattern.level)
                print(f"\n[{i}] {level_color}{pattern.name}{self._reset_color()}")
                print(f"    Level: {pattern.level.value.upper()}")
                print(f"    Description: {pattern.description}")
                if pattern.instructions:
                    print(f"    Locations:")
                    for insn in pattern.instructions[:5]:
                        print(f"      0x{insn.address:04X}: {insn.mnemonic} {insn.op_str}")
                    if len(pattern.instructions) > 5:
                        print(f"      ... and {len(pattern.instructions) - 5} more")

    def _get_level_color(self, level: RiskLevel) -> str:
        colors = {
            RiskLevel.CRITICAL: "\033[91m",
            RiskLevel.HIGH: "\033[93m",
            RiskLevel.MEDIUM: "\033[94m",
            RiskLevel.LOW: "\033[92m"
        }
        return colors.get(level, "")

    def _reset_color(self) -> str:
        return "\033[0m"
