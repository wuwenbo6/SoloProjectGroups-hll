import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import List, Dict, Set, Optional


@dataclass
class Timer:
    name: str
    preset: int
    type: str
    used: bool = False


@dataclass
class Counter:
    name: str
    preset: int
    type: str
    used: bool = False


@dataclass
class PIDController:
    name: str
    kp: float
    ki: float
    kd: float
    setpoint: float = 0.0
    input_var: str = ""
    output_var: str = ""


@dataclass
class Task:
    name: str
    priority: int
    period: int
    type: str = "cyclic"


@dataclass
class Rung:
    name: str
    conditions: List[str] = field(default_factory=list)
    outputs: List[str] = field(default_factory=list)


@dataclass
class CodeGenerationResult:
    success: bool
    code: str = ""
    error: str = ""
    timers: Dict[str, Timer] = field(default_factory=dict)
    counters: Dict[str, Counter] = field(default_factory=dict)
    pids: Dict[str, PIDController] = field(default_factory=dict)
    tasks: Dict[str, Task] = field(default_factory=dict)
    inputs: Set[str] = field(default_factory=set)
    outputs: Set[str] = field(default_factory=set)
    memories: Set[str] = field(default_factory=set)


class LadderToCConverter:
    def __init__(self):
        self.result = CodeGenerationResult(success=True)
        self.edge_vars = set()

    def parse_xml(self, xml_content: str) -> CodeGenerationResult:
        try:
            root = ET.fromstring(xml_content)
            rungs = []
            
            def find_blocks(element):
                if element.tag.endswith('block') or element.tag == 'block':
                    block_type = element.get('type')
                    if block_type == 'ladder_rung':
                        rung = self._parse_rung(element)
                        rungs.append(rung)
                for child in element:
                    find_blocks(child)
            
            find_blocks(root)
            
            self._generate_full_code(rungs)
            return self.result
            
        except Exception as e:
            return CodeGenerationResult(success=False, error=str(e))

    def _parse_rung(self, block) -> Rung:
        rung_name = self._get_field_value(block, 'RUNG_NAME', 'RUNG')
        rung = Rung(name=rung_name)
        
        def find_statement(element, name):
            if element.get('name') == name:
                return element
            for child in element:
                result = find_statement(child, name)
                if result is not None:
                    return result
            return None
        
        conditions_stmt = find_statement(block, 'CONDITIONS')
        if conditions_stmt is not None:
            self._parse_condition_chain(conditions_stmt, rung)
        
        outputs_stmt = find_statement(block, 'OUTPUTS')
        if outputs_stmt is not None:
            self._parse_output_chain(outputs_stmt, rung)
        
        return rung

    def _find_first_block(self, element):
        if element.tag.endswith('block') or element.tag == 'block':
            return element
        for child in element:
            result = self._find_first_block(child)
            if result is not None:
                return result
        return None

    def _find_next_block(self, element):
        for child in element:
            if child.tag.endswith('next') or child.tag == 'next':
                return self._find_first_block(child)
        return None

    def _parse_condition_chain(self, parent, rung: Rung):
        child = self._find_first_block(parent)
        while child is not None:
            block_type = child.get('type')
            condition_code = self._generate_condition_code(child, block_type)
            if condition_code:
                rung.conditions.append(condition_code)
            next_block = self._find_next_block(child)
            child = next_block

    def _parse_output_chain(self, parent, rung: Rung):
        child = self._find_first_block(parent)
        while child is not None:
            block_type = child.get('type')
            output_code = self._generate_output_code(child, block_type)
            if output_code:
                rung.outputs.append(output_code)
            next_block = self._find_next_block(child)
            child = next_block

    def _get_field_value(self, block, field_name: str, default: str = "") -> str:
        def find_field(element, name):
            if element.tag.endswith('field') or element.tag == 'field':
                if element.get('name') == name:
                    return element.text
            for child in element:
                result = find_field(child, name)
                if result is not None:
                    return result
            return None
        
        result = find_field(block, field_name)
        return result if result is not None else default

    def _generate_condition_code(self, block, block_type: str) -> Optional[str]:
        handlers = {
            'ladder_contact_normal_open': self._contact_normal_open,
            'ladder_contact_normal_close': self._contact_normal_close,
            'ladder_contact_positive_edge': self._contact_positive_edge,
            'ladder_contact_negative_edge': self._contact_negative_edge,
            'ladder_variable_input': self._variable_input,
            'ladder_variable_output': self._variable_output,
            'ladder_variable_memory': self._variable_memory,
            'ladder_compare_eq': self._compare_eq,
            'ladder_compare_ne': self._compare_ne,
            'ladder_compare_gt': self._compare_gt,
            'ladder_compare_lt': self._compare_lt,
            'ladder_compare_ge': self._compare_ge,
            'ladder_compare_le': self._compare_le,
        }
        
        handler = handlers.get(block_type)
        if handler:
            return handler(block)
        return None

    def _generate_output_code(self, block, block_type: str) -> Optional[str]:
        handlers = {
            'ladder_coil_output': self._coil_output,
            'ladder_coil_set': self._coil_set,
            'ladder_coil_reset': self._coil_reset,
            'ladder_timer_ton': self._timer_ton,
            'ladder_timer_tof': self._timer_tof,
            'ladder_timer_tp': self._timer_tp,
            'ladder_counter_ctu': self._counter_ctu,
            'ladder_counter_ctd': self._counter_ctd,
            'ladder_counter_ctud': self._counter_ctud,
            'ladder_pid_regular': self._pid_regular,
            'ladder_pid_setpoint': self._pid_setpoint,
            'ladder_pid_input': self._pid_input,
            'ladder_pid_output': self._pid_output,
        }
        
        handler = handlers.get(block_type)
        if handler:
            return handler(block)
        return None

    def _contact_normal_open(self, block) -> str:
        name = self._get_field_value(block, 'CONTACT_NAME', 'I0.0')
        self._register_io(name)
        return f"READ_BIT({self._var_to_hal(name)})"

    def _contact_normal_close(self, block) -> str:
        name = self._get_field_value(block, 'CONTACT_NAME', 'I0.1')
        self._register_io(name)
        return f"!READ_BIT({self._var_to_hal(name)})"

    def _contact_positive_edge(self, block) -> str:
        name = self._get_field_value(block, 'CONTACT_NAME', 'I0.2')
        self._register_io(name)
        edge_var = f"edge_{name.replace('.', '_')}"
        self.edge_vars.add((edge_var, name))
        return f"POSITIVE_EDGE({edge_var}, {self._var_to_hal(name)})"

    def _contact_negative_edge(self, block) -> str:
        name = self._get_field_value(block, 'CONTACT_NAME', 'I0.3')
        self._register_io(name)
        edge_var = f"edge_{name.replace('.', '_')}"
        self.edge_vars.add((edge_var, name))
        return f"NEGATIVE_EDGE({edge_var}, {self._var_to_hal(name)})"

    def _variable_input(self, block) -> str:
        name = self._get_field_value(block, 'VAR_NAME', 'I0.0')
        self._register_io(name)
        return f"READ_BIT({self._var_to_hal(name)})"

    def _variable_output(self, block) -> str:
        name = self._get_field_value(block, 'VAR_NAME', 'Q0.0')
        self.result.outputs.add(name)
        return f"READ_BIT({self._var_to_hal(name)})"

    def _variable_memory(self, block) -> str:
        name = self._get_field_value(block, 'VAR_NAME', 'M0.0')
        self.result.memories.add(name)
        return f"READ_MEM({name})"

    def _compare_eq(self, block) -> str:
        var_a = self._get_field_value(block, 'VAR_A', 'MW0')
        var_b = self._get_field_value(block, 'VAR_B', '0')
        return f"({self._var_to_hal(var_a)} == {var_b})"

    def _compare_ne(self, block) -> str:
        var_a = self._get_field_value(block, 'VAR_A', 'MW0')
        var_b = self._get_field_value(block, 'VAR_B', '0')
        return f"({self._var_to_hal(var_a)} != {var_b})"

    def _compare_gt(self, block) -> str:
        var_a = self._get_field_value(block, 'VAR_A', 'MW0')
        var_b = self._get_field_value(block, 'VAR_B', '0')
        return f"({self._var_to_hal(var_a)} > {var_b})"

    def _compare_lt(self, block) -> str:
        var_a = self._get_field_value(block, 'VAR_A', 'MW0')
        var_b = self._get_field_value(block, 'VAR_B', '0')
        return f"({self._var_to_hal(var_a)} < {var_b})"

    def _compare_ge(self, block) -> str:
        var_a = self._get_field_value(block, 'VAR_A', 'MW0')
        var_b = self._get_field_value(block, 'VAR_B', '0')
        return f"({self._var_to_hal(var_a)} >= {var_b})"

    def _compare_le(self, block) -> str:
        var_a = self._get_field_value(block, 'VAR_A', 'MW0')
        var_b = self._get_field_value(block, 'VAR_B', '0')
        return f"({self._var_to_hal(var_a)} <= {var_b})"

    def _coil_output(self, block) -> str:
        name = self._get_field_value(block, 'COIL_NAME', 'Q0.0')
        self.result.outputs.add(name)
        return f"WRITE_BIT({self._var_to_hal(name, is_output=True)}, rung_state);"

    def _coil_set(self, block) -> str:
        name = self._get_field_value(block, 'COIL_NAME', 'Q0.1')
        self.result.outputs.add(name)
        return f"if(rung_state) SET_BIT({self._var_to_hal(name, is_output=True)});"

    def _coil_reset(self, block) -> str:
        name = self._get_field_value(block, 'COIL_NAME', 'Q0.2')
        self.result.outputs.add(name)
        return f"if(rung_state) RESET_BIT({self._var_to_hal(name, is_output=True)});"

    def _timer_ton(self, block) -> str:
        name = self._get_field_value(block, 'TIMER_NAME', 'T0')
        preset = int(self._get_field_value(block, 'PRESET', '1000'))
        self.result.timers[name] = Timer(name=name, preset=preset, type='TON')
        return f"TIMER_TON({name}, {preset}, rung_state);"

    def _timer_tof(self, block) -> str:
        name = self._get_field_value(block, 'TIMER_NAME', 'T1')
        preset = int(self._get_field_value(block, 'PRESET', '1000'))
        self.result.timers[name] = Timer(name=name, preset=preset, type='TOF')
        return f"TIMER_TOF({name}, {preset}, rung_state);"

    def _timer_tp(self, block) -> str:
        name = self._get_field_value(block, 'TIMER_NAME', 'T2')
        preset = int(self._get_field_value(block, 'PRESET', '1000'))
        self.result.timers[name] = Timer(name=name, preset=preset, type='TP')
        return f"TIMER_TP({name}, {preset}, rung_state);"

    def _counter_ctu(self, block) -> str:
        name = self._get_field_value(block, 'COUNTER_NAME', 'C0')
        preset = int(self._get_field_value(block, 'PRESET', '10'))
        self.result.counters[name] = Counter(name=name, preset=preset, type='CTU')
        return f"COUNTER_CTU({name}, {preset}, rung_state);"

    def _counter_ctd(self, block) -> str:
        name = self._get_field_value(block, 'COUNTER_NAME', 'C1')
        preset = int(self._get_field_value(block, 'PRESET', '10'))
        self.result.counters[name] = Counter(name=name, preset=preset, type='CTD')
        return f"COUNTER_CTD({name}, {preset}, rung_state);"

    def _counter_ctud(self, block) -> str:
        name = self._get_field_value(block, 'COUNTER_NAME', 'C2')
        preset = int(self._get_field_value(block, 'PRESET', '10'))
        self.result.counters[name] = Counter(name=name, preset=preset, type='CTUD')
        return f"COUNTER_CTUD({name}, {preset}, rung_state, 0);"

    def _pid_regular(self, block) -> str:
        name = self._get_field_value(block, 'PID_NAME', 'PID0')
        kp = float(self._get_field_value(block, 'KP', '1.0'))
        ki = float(self._get_field_value(block, 'KI', '0.1'))
        kd = float(self._get_field_value(block, 'KD', '0.05'))
        self.result.pids[name] = PIDController(name=name, kp=kp, ki=ki, kd=kd)
        return f"PID_Compute(&{name});"

    def _pid_setpoint(self, block) -> str:
        name = self._get_field_value(block, 'PID_NAME', 'PID0')
        setpoint = float(self._get_field_value(block, 'SETPOINT', '50'))
        if name not in self.result.pids:
            self.result.pids[name] = PIDController(name=name, kp=1.0, ki=0.1, kd=0.05, setpoint=setpoint)
        else:
            self.result.pids[name].setpoint = setpoint
        return f"{name}.setpoint = {setpoint}f;"

    def _pid_input(self, block) -> str:
        name = self._get_field_value(block, 'PID_NAME', 'PID0')
        source = self._get_field_value(block, 'SOURCE', 'AI0')
        if name not in self.result.pids:
            self.result.pids[name] = PIDController(name=name, kp=1.0, ki=0.1, kd=0.05, input_var=source)
        else:
            self.result.pids[name].input_var = source
        return f"{name}.input = analogRead_{source}();"

    def _pid_output(self, block) -> str:
        name = self._get_field_value(block, 'PID_NAME', 'PID0')
        target = self._get_field_value(block, 'TARGET', 'AQ0')
        if name not in self.result.pids:
            self.result.pids[name] = PIDController(name=name, kp=1.0, ki=0.1, kd=0.05, output_var=target)
        else:
            self.result.pids[name].output_var = target
        return f"analogWrite_{target}({name}.output);"

    def _register_io(self, name: str):
        if name.startswith('I'):
            self.result.inputs.add(name)
        elif name.startswith('Q'):
            self.result.outputs.add(name)
        elif name.startswith('M'):
            self.result.memories.add(name)

    def _var_to_hal(self, name: str, is_output: bool = False) -> str:
        if name.startswith('I'):
            parts = name[1:].split('.')
            port_idx = int(parts[0])
            pin = parts[1] if len(parts) > 1 else '0'
            port_letter = chr(ord('A') + port_idx)
            port_lower = port_letter.lower()
            return f"io_snapshot.gpio{port_lower}_idr, GPIO_PIN_{pin}"
        elif name.startswith('Q'):
            parts = name[1:].split('.')
            port_idx = int(parts[0])
            pin = parts[1] if len(parts) > 1 else '0'
            port_letter = chr(ord('A') + port_idx)
            port_lower = port_letter.lower()
            if is_output:
                return f"output_buffer.gpio{port_lower}_odr, GPIO_PIN_{pin}"
            else:
                return f"output_buffer.gpio{port_lower}_odr, GPIO_PIN_{pin}"
        elif name.startswith('MW'):
            return f"memory_words[{name[2:]}]"
        elif name.startswith('M'):
            parts = name[1:].split('.')
            byte_idx = int(parts[0])
            bit_idx = int(parts[1]) if len(parts) > 1 else 0
            return f"memory_bits[{byte_idx}], {bit_idx}"
        return name

    def _generate_full_code(self, rungs: List[Rung]):
        code_parts = []
        
        code_parts.append(self._generate_header())
        code_parts.append(self._generate_macros())
        code_parts.append(self._generate_type_definitions())
        code_parts.append(self._generate_global_variables())
        code_parts.append(self._generate_function_declarations())
        code_parts.append(self._generate_main_function(rungs))
        code_parts.append(self._generate_helper_functions())
        
        self.result.code = '\n'.join(code_parts)

    def _generate_header(self) -> str:
        return '''
/**
 ******************************************************************************
 * @file           : ladder_logic.c
 * @brief          : Ladder Logic Generated Code for STM32
 ******************************************************************************
 * @attention
 *
 * This file was auto-generated by Ladder Logic Editor
 *
 ******************************************************************************
 */

#include "main.h"
#include "tim.h"
#include "gpio.h"
'''

    def _generate_macros(self) -> str:
        return '''
/* MACROS DEFINITIONS *********************************************************/
#define READ_BIT(port, pin)          (((port) & (pin)) != 0)
#define WRITE_BIT(port, pin, value)  do { if(value) (port) |= (pin); else (port) &= ~(pin); } while(0)
#define SET_BIT(port, pin)           ((port) |= (pin))
#define RESET_BIT(port, pin)         ((port) &= ~(pin))
#define TOGGLE_BIT(port, pin)        ((port) ^= (pin))

#define READ_MEM(byte, bit)          (((byte) & (1 << (bit))) != 0)
#define WRITE_MEM(byte, bit, value)  do { if(value) (byte) |= (1 << (bit)); else (byte) &= ~(1 << (bit)); } while(0)

#define POSITIVE_EDGE(prev, current) ((current) && !(prev))
#define NEGATIVE_EDGE(prev, current) (!(current) && (prev))

#define TIME_DIFF_MS(now, start)     ((uint32_t)((now) >= (start) ? ((now) - (start)) : (UINT32_MAX - (start) + (now) + 1)))
'''

    def _generate_type_definitions(self) -> str:
        return '''
/* TYPE DEFINITIONS ***********************************************************/
typedef struct {
    uint8_t  enable;
    uint32_t preset;
    uint32_t current;
    uint32_t start_time;
    uint8_t  done;
    uint8_t  q;
} Timer_t;

typedef struct {
    uint8_t  cu;
    uint8_t  cd;
    uint8_t  reset;
    uint32_t preset;
    uint32_t current;
    uint8_t  done;
    uint8_t  q;
} Counter_t;

/* PID控制器结构体 - 位置式PID */
typedef struct {
    float    setpoint;      /* 设定值 */
    float    input;         /* 过程变量（输入） */
    float    output;        /* 输出值 */
    float    kp;            /* 比例系数 */
    float    ki;            /* 积分系数 */
    float    kd;            /* 微分系数 */
    float    integral;      /* 积分项 */
    float    last_error;    /* 上次误差 */
    float    last_input;    /* 上次输入 */
    uint32_t last_time;     /* 上次计算时间 */
    float    output_min;    /* 输出最小值 */
    float    output_max;    /* 输出最大值 */
} PID_t;

/* 任务控制块 - 用于多任务调度 */
typedef struct {
    void     (*task_func)(void);  /* 任务函数指针 */
    uint32_t period;              /* 任务周期（ms） */
    uint32_t last_run;            /* 上次运行时间 */
    uint8_t  priority;            /* 优先级（0最高） */
    uint8_t  enabled;             /* 是否启用 */
} Task_t;

/* 输入快照结构体 - 消除竞态条件 */
typedef struct {
    uint16_t gpioa_idr;
    uint16_t gpiob_idr;
    uint16_t gpioc_idr;
} IOSnapshot_t;

/* 输出缓冲区结构体 - 消除竞态条件 */
typedef struct {
    uint16_t gpioa_odr;
    uint16_t gpiob_odr;
    uint16_t gpioc_odr;
} OutputBuffer_t;
'''

    def _generate_global_variables(self) -> str:
        timer_vars = ''
        if self.result.timers:
            timer_lines = []
            for name, timer in self.result.timers.items():
                timer_lines.append(f"Timer_t {name} = {{0, {timer.preset}, 0, 0, 0, 0}};")
            timer_vars = '\n'.join(timer_lines) + '\n'

        counter_vars = ''
        if self.result.counters:
            counter_lines = []
            for name, counter in self.result.counters.items():
                counter_lines.append(f"Counter_t {name} = {{0, 0, 0, {counter.preset}, 0, 0, 0}};")
            counter_vars = '\n'.join(counter_lines) + '\n'

        pid_vars = ''
        if self.result.pids:
            pid_lines = []
            for name, pid in self.result.pids.items():
                pid_lines.append(f"PID_t {name} = {{{pid.setpoint}f, 0, 0, {pid.kp}f, {pid.ki}f, {pid.kd}f, 0, 0, 0, 0, 0, 255.0f}};")
            pid_vars = '\n'.join(pid_lines) + '\n'

        edge_vars_str = ''
        if self.edge_vars:
            edge_lines = []
            for edge_var, _ in self.edge_vars:
                edge_lines.append(f"uint8_t {edge_var} = 0;")
            edge_vars_str = '\n'.join(edge_lines) + '\n'

        return f'''
/* GLOBAL VARIABLES ***********************************************************/
uint8_t  memory_bits[32] = {{0}};
uint16_t memory_words[32] = {{0}};

/* 输入快照 - 用于消除竞态条件 */
IOSnapshot_t io_snapshot = {{0, 0, 0}};

/* 输出缓冲区 - 用于消除竞态条件 */
OutputBuffer_t output_buffer = {{0, 0, 0}};

{timer_vars}
{counter_vars}
{pid_vars}
{edge_vars_str}
'''

    def _generate_function_declarations(self) -> str:
        return '''
/* FUNCTION DECLARATIONS ******************************************************/
void     LadderLogic_Init(void);
void     LadderLogic_Scan(void);
uint32_t GetSysTick_ms(void);

void TIMER_TON(Timer_t *timer, uint32_t preset, uint8_t enable);
void TIMER_TOF(Timer_t *timer, uint32_t preset, uint8_t enable);
void TIMER_TP(Timer_t *timer, uint32_t preset, uint8_t trigger);
void COUNTER_CTU(Counter_t *counter, uint32_t preset, uint8_t cu);
void COUNTER_CTD(Counter_t *counter, uint32_t preset, uint8_t cd);
void COUNTER_CTUD(Counter_t *counter, uint32_t preset, uint8_t cu, uint8_t cd);

/* PID控制器函数 */
void PID_Init(PID_t *pid, float kp, float ki, float kd);
void PID_Reset(PID_t *pid);
void PID_SetOutputLimits(PID_t *pid, float min, float max);
void PID_Compute(PID_t *pid);

/* 多任务调度器函数 */
void TaskScheduler_Init(void);
void TaskScheduler_Run(void);
void Task_Enable(Task_t *task);
void Task_Disable(Task_t *task);
'''

    def _generate_main_function(self, rungs: List[Rung]) -> str:
        rung_code = []
        
        for i, rung in enumerate(rungs):
            if rung.conditions:
                condition_expr = ' && '.join(rung.conditions)
                rung_code.append(f"    /* {rung.name} */")
                rung_code.append(f"    rung_state = ({condition_expr});")
            else:
                rung_code.append(f"    /* {rung.name} */")
                rung_code.append(f"    rung_state = 1;")
            
            for output in rung.outputs:
                rung_code.append(f"    {output}")
            rung_code.append("")

        rung_code_str = '\n'.join(rung_code)

        return f'''
/* LADDER LOGIC SCAN **********************************************************/
/* 扫描周期三步模型：
 * 1. 输入采样：将所有物理输入读取到输入快照
 * 2. 逻辑执行：执行所有梯级逻辑，只修改输出缓冲区
 * 3. 输出更新：将输出缓冲区统一写入物理输出
 * 此模型消除了竞态条件，确保同一扫描周期内逻辑一致性
 */
void LadderLogic_Scan(void)
{{
    uint8_t rung_state = 0;
    
    /* Step 1: 输入采样 - 读取所有物理输入到快照 */
    io_snapshot.gpioa_idr = GPIOA->IDR;
    io_snapshot.gpiob_idr = GPIOB->IDR;
    io_snapshot.gpioc_idr = GPIOC->IDR;
    
    /* Step 2: 逻辑执行 - 基于输入快照执行所有梯级 */
    /* 注意：此阶段只修改输出缓冲区，不直接写物理输出 */

{rung_code_str}

    /* Step 3: 输出更新 - 统一写入所有物理输出 */
    GPIOA->ODR = output_buffer.gpioa_odr;
    GPIOB->ODR = output_buffer.gpiob_odr;
    GPIOC->ODR = output_buffer.gpioc_odr;
}}

void LadderLogic_Init(void)
{{
    /* 初始化输入输出快照 */
    io_snapshot.gpioa_idr = 0;
    io_snapshot.gpiob_idr = 0;
    io_snapshot.gpioc_idr = 0;
    
    /* 初始化输出缓冲区 */
    output_buffer.gpioa_odr = 0;
    output_buffer.gpiob_odr = 0;
    output_buffer.gpioc_odr = 0;
    
    /* Initialize Timers */
''' + ''.join([f"    {name}.current = 0;\n    {name}.done = 0;\n    {name}.q = 0;\n" for name in self.result.timers.keys()]) + '''
    /* Initialize Counters */
''' + ''.join([f"    {name}.current = 0;\n    {name}.done = 0;\n    {name}.q = 0;\n" for name in self.result.counters.keys()]) + '''
}
'''

    def _generate_helper_functions(self) -> str:
        return '''
/* HELPER FUNCTIONS ***********************************************************/
uint32_t GetSysTick_ms(void)
{
    return HAL_GetTick();
}

/* 接通延时定时器 TON - 安全处理时间溢出 */
void TIMER_TON(Timer_t *timer, uint32_t preset, uint8_t enable)
{
    uint32_t current_time;
    uint32_t elapsed;
    
    timer->preset = preset;
    
    if(!enable)
    {
        timer->current = 0;
        timer->done = 0;
        timer->q = 0;
        timer->enable = 0;
        return;
    }
    
    if(!timer->enable)
    {
        timer->start_time = GetSysTick_ms();
        timer->enable = 1;
    }
    
    current_time = GetSysTick_ms();
    /* 使用安全的时间差计算，处理SysTick溢出问题 */
    elapsed = TIME_DIFF_MS(current_time, timer->start_time);
    timer->current = elapsed;
    
    if(elapsed >= timer->preset)
    {
        timer->done = 1;
        timer->q = 1;
    }
}

/* 断开延时定时器 TOF - 安全处理时间溢出 */
void TIMER_TOF(Timer_t *timer, uint32_t preset, uint8_t enable)
{
    uint32_t current_time;
    uint32_t elapsed;
    
    timer->preset = preset;
    
    if(enable)
    {
        timer->current = 0;
        timer->done = 0;
        timer->q = 1;
        timer->enable = 1;
        return;
    }
    
    if(timer->enable)
    {
        timer->start_time = GetSysTick_ms();
        timer->enable = 0;
    }
    
    current_time = GetSysTick_ms();
    /* 使用安全的时间差计算，处理SysTick溢出问题 */
    elapsed = TIME_DIFF_MS(current_time, timer->start_time);
    timer->current = elapsed;
    
    if(elapsed >= timer->preset)
    {
        timer->done = 1;
        timer->q = 0;
    }
}

/* 脉冲定时器 TP - 安全处理时间溢出 */
void TIMER_TP(Timer_t *timer, uint32_t preset, uint8_t trigger)
{
    uint32_t current_time;
    uint32_t elapsed;
    
    timer->preset = preset;
    
    if(trigger && !timer->enable)
    {
        timer->start_time = GetSysTick_ms();
        timer->enable = 1;
        timer->q = 1;
    }
    
    if(timer->enable)
    {
        current_time = GetSysTick_ms();
        /* 使用安全的时间差计算，处理SysTick溢出问题 */
        elapsed = TIME_DIFF_MS(current_time, timer->start_time);
        timer->current = elapsed;
        
        if(elapsed >= timer->preset)
        {
            timer->q = 0;
            if(!trigger)
            {
                timer->enable = 0;
                timer->done = 1;
            }
        }
    }
}

void COUNTER_CTU(Counter_t *counter, uint32_t preset, uint8_t cu)
{
    counter->preset = preset;
    
    if(cu && !counter->cu)
    {
        if(counter->current < counter->preset)
        {
            counter->current++;
        }
    }
    
    counter->cu = cu;
    
    counter->done = (counter->current >= counter->preset);
    counter->q = counter->done;
}

void COUNTER_CTD(Counter_t *counter, uint32_t preset, uint8_t cd)
{
    counter->preset = preset;
    
    if(cd && !counter->cd)
    {
        if(counter->current > 0)
        {
            counter->current--;
        }
    }
    
    counter->cd = cd;
    
    counter->done = (counter->current <= 0);
    counter->q = counter->done;
}

void COUNTER_CTUD(Counter_t *counter, uint32_t preset, uint8_t cu, uint8_t cd)
{
    counter->preset = preset;
    
    if(cu && !counter->cu)
    {
        if(counter->current < counter->preset)
        {
            counter->current++;
        }
    }
    
    if(cd && !counter->cd)
    {
        if(counter->current > 0)
        {
            counter->current--;
        }
    }
    
    counter->cu = cu;
    counter->cd = cd;
    
    counter->done = (counter->current >= counter->preset);
    counter->q = counter->done;
}

/* PID控制器初始化 */
void PID_Init(PID_t *pid, float kp, float ki, float kd)
{
    pid->kp = kp;
    pid->ki = ki;
    pid->kd = kd;
    pid->integral = 0.0f;
    pid->last_error = 0.0f;
    pid->last_input = 0.0f;
    pid->last_time = GetSysTick_ms();
    pid->output_min = 0.0f;
    pid->output_max = 255.0f;
    pid->output = 0.0f;
}

/* PID控制器重置 */
void PID_Reset(PID_t *pid)
{
    pid->integral = 0.0f;
    pid->last_error = 0.0f;
    pid->last_input = pid->input;
    pid->last_time = GetSysTick_ms();
    pid->output = 0.0f;
}

/* 设置PID输出限制 */
void PID_SetOutputLimits(PID_t *pid, float min, float max)
{
    pid->output_min = min;
    pid->output_max = max;
}

/* PID计算（位置式，带微分先行和积分抗饱和） */
void PID_Compute(PID_t *pid)
{
    uint32_t now = GetSysTick_ms();
    float dt = TIME_DIFF_MS(now, pid->last_time) / 1000.0f;
    
    if(dt <= 0) return;
    
    float error = pid->setpoint - pid->input;
    
    float p_term = pid->kp * error;
    
    pid->integral += error * dt;
    pid->integral = pid->integral > pid->output_max / pid->ki ? pid->output_max / pid->ki : pid->integral;
    pid->integral = pid->integral < pid->output_min / pid->ki ? pid->output_min / pid->ki : pid->integral;
    float i_term = pid->ki * pid->integral;
    
    float d_input = (pid->input - pid->last_input) / dt;
    float d_term = -pid->kd * d_input;
    
    pid->output = p_term + i_term + d_term;
    
    if(pid->output > pid->output_max)
        pid->output = pid->output_max;
    else if(pid->output < pid->output_min)
        pid->output = pid->output_min;
    
    pid->last_error = error;
    pid->last_input = pid->input;
    pid->last_time = now;
}

/* 多任务调度器 - 简单的协作式调度器 */
#define MAX_TASKS 8
Task_t task_list[MAX_TASKS];
uint8_t task_count = 0;

void TaskScheduler_Init(void)
{
    task_count = 0;
    for(uint8_t i = 0; i < MAX_TASKS; i++)
    {
        task_list[i].task_func = NULL;
        task_list[i].enabled = 0;
    }
}

void Task_Enable(Task_t *task)
{
    task->enabled = 1;
    task->last_run = GetSysTick_ms();
}

void Task_Disable(Task_t *task)
{
    task->enabled = 0;
}

void TaskScheduler_Run(void)
{
    uint32_t now = GetSysTick_ms();
    
    for(uint8_t i = 0; i < task_count; i++)
    {
        Task_t *task = &task_list[i];
        
        if(!task->enabled || !task->task_func)
            continue;
        
        uint32_t elapsed = TIME_DIFF_MS(now, task->last_run);
        
        if(elapsed >= task->period)
        {
            task->task_func();
            task->last_run = now;
        }
    }
}
'''


def generate_c_code(xml_content: str) -> CodeGenerationResult:
    converter = LadderToCConverter()
    return converter.parse_xml(xml_content)
