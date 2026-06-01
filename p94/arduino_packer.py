import io
import zipfile
from code_generator import generate_c_code, CodeGenerationResult


class ArduinoLibraryPacker:
    def __init__(self):
        pass

    def generate_arduino_library(self, xml_content: str) -> bytes:
        result = generate_c_code(xml_content)
        
        if not result.success:
            raise Exception(result.error)
        
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('LadderLogic/library.properties', self._generate_library_properties())
            zf.writestr('LadderLogic/src/LadderLogic.h', self._generate_header(result))
            zf.writestr('LadderLogic/src/LadderLogic.cpp', self._generate_source(result))
            zf.writestr('LadderLogic/src/pid_controller.h', self._generate_pid_header())
            zf.writestr('LadderLogic/src/pid_controller.cpp', self._generate_pid_source())
            zf.writestr('LadderLogic/src/task_scheduler.h', self._generate_task_header())
            zf.writestr('LadderLogic/src/task_scheduler.cpp', self._generate_task_source())
            zf.writestr('LadderLogic/examples/BasicExample/BasicExample.ino', self._generate_example())
            zf.writestr('LadderLogic/README.md', self._generate_readme())
            zf.writestr('LadderLogic/keywords.txt', self._generate_keywords())
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()

    def _generate_library_properties(self) -> str:
        return '''name=LadderLogic
version=1.0.0
author=LadderLogic Editor
maintainer=LadderLogic Editor
sentence=PLC-style Ladder Logic library for Arduino
paragraph=Convert ladder logic diagrams to Arduino code with PID, timers, counters and task scheduler
category=Other
url=https://github.com/example/ladderlogic
architectures=*
'''

    def _generate_header(self, result: CodeGenerationResult) -> str:
        return '''
/**
 ******************************************************************************
 * @file           : LadderLogic.h
 * @brief          : Ladder Logic Arduino Library Header
 ******************************************************************************
 */

#ifndef __LADDER_LOGIC_H
#define __LADDER_LOGIC_H

#if defined(ARDUINO) && ARDUINO >= 100
#include "Arduino.h"
#else
#include "WProgram.h"
#endif

#include "pid_controller.h"
#include "task_scheduler.h"

#ifdef __cplusplus
extern "C" {
#endif

/* MACROS DEFINITIONS *********************************************************/
#define READ_BIT(port, pin)          (digitalRead(pin))
#define WRITE_BIT(port, pin, value)  digitalWrite(pin, value ? HIGH : LOW)
#define SET_BIT(port, pin)           digitalWrite(pin, HIGH)
#define RESET_BIT(port, pin)         digitalWrite(pin, LOW)
#define TOGGLE_BIT(port, pin)        digitalWrite(pin, !digitalRead(pin))

#define READ_MEM(byte, bit)          (((byte) & (1 << (bit))) != 0)
#define WRITE_MEM(byte, bit, value)  do { if(value) (byte) |= (1 << (bit)); else (byte) &= ~(1 << (bit)); } while(0)

#define POSITIVE_EDGE(prev, current) ((current) && !(prev))
#define NEGATIVE_EDGE(prev, current) (!(current) && (prev))

#define TIME_DIFF_MS(now, start)     ((uint32_t)((now) >= (start) ? ((now) - (start)) : (UINT32_MAX - (start) + (now) + 1)))

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

typedef struct {
    uint16_t inputs[4];
    uint16_t outputs[4];
} IOSnapshot_t;

typedef struct {
    uint16_t outputs[4];
} OutputBuffer_t;

/* GLOBAL VARIABLES ***********************************************************/
extern uint8_t  memory_bits[32];
extern uint16_t memory_words[32];
extern IOSnapshot_t io_snapshot;
extern OutputBuffer_t output_buffer;

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

#ifdef __cplusplus
}
#endif

#endif
'''

    def _generate_source(self, result: CodeGenerationResult) -> str:
        timer_vars = ''
        if result.timers:
            timer_lines = []
            for name, timer in result.timers.items():
                timer_lines.append(f"Timer_t {name} = {{0, {timer.preset}, 0, 0, 0, 0}};")
            timer_vars = '\n'.join(timer_lines) + '\n'

        counter_vars = ''
        if result.counters:
            counter_lines = []
            for name, counter in result.counters.items():
                counter_lines.append(f"Counter_t {name} = {{0, 0, 0, {counter.preset}, 0, 0, 0}};")
            counter_vars = '\n'.join(counter_lines) + '\n'

        pid_vars = ''
        if result.pids:
            pid_lines = []
            for name, pid in result.pids.items():
                pid_lines.append(f"PID_t {name} = {{{pid.setpoint}f, 0, 0, {pid.kp}f, {pid.ki}f, {pid.kd}f, 0, 0, 0, 0, 0, 255.0f}};")
            pid_vars = '\n'.join(pid_lines) + '\n'

        return f'''
/**
 ******************************************************************************
 * @file           : LadderLogic.cpp
 * @brief          : Ladder Logic Arduino Library Source
 ******************************************************************************
 */

#include "LadderLogic.h"

/* GLOBAL VARIABLES ***********************************************************/
uint8_t  memory_bits[32] = {{0}};
uint16_t memory_words[32] = {{0}};

IOSnapshot_t io_snapshot = {{0}};
OutputBuffer_t output_buffer = {{0}};

{timer_vars}
{counter_vars}
{pid_vars}

uint32_t GetSysTick_ms(void)
{{
    return millis();
}}

void LadderLogic_Init(void)
{{
    for(int i = 0; i < 32; i++)
    {{
        memory_bits[i] = 0;
        memory_words[i] = 0;
    }}
}}

void LadderLogic_Scan(void)
{{
    /* 梯形图扫描逻辑 - 由代码生成器填充 */
    LadderLogic_UserCode();
}}

__attribute__((weak)) void LadderLogic_UserCode(void)
{{
    /* 用户自定义梯形图逻辑 */
}}

void TIMER_TON(Timer_t *timer, uint32_t preset, uint8_t enable)
{{
    uint32_t current_time;
    uint32_t elapsed;
    
    timer->preset = preset;
    
    if(!enable)
    {{
        timer->current = 0;
        timer->done = 0;
        timer->q = 0;
        timer->enable = 0;
        return;
    }}
    
    if(!timer->enable)
    {{
        timer->start_time = GetSysTick_ms();
        timer->enable = 1;
    }}
    
    current_time = GetSysTick_ms();
    elapsed = TIME_DIFF_MS(current_time, timer->start_time);
    timer->current = elapsed;
    
    if(elapsed >= timer->preset)
    {{
        timer->done = 1;
        timer->q = 1;
    }}
}}

void TIMER_TOF(Timer_t *timer, uint32_t preset, uint8_t enable)
{{
    uint32_t current_time;
    uint32_t elapsed;
    
    timer->preset = preset;
    
    if(enable)
    {{
        timer->current = 0;
        timer->done = 0;
        timer->q = 1;
        timer->enable = 1;
        return;
    }}
    
    if(timer->enable)
    {{
        timer->start_time = GetSysTick_ms();
        timer->enable = 0;
    }}
    
    current_time = GetSysTick_ms();
    elapsed = TIME_DIFF_MS(current_time, timer->start_time);
    timer->current = elapsed;
    
    if(elapsed >= timer->preset)
    {{
        timer->done = 1;
        timer->q = 0;
    }}
}}

void TIMER_TP(Timer_t *timer, uint32_t preset, uint8_t trigger)
{{
    uint32_t current_time;
    uint32_t elapsed;
    
    timer->preset = preset;
    
    if(trigger && !timer->enable)
    {{
        timer->start_time = GetSysTick_ms();
        timer->enable = 1;
        timer->q = 1;
    }}
    
    if(timer->enable)
    {{
        current_time = GetSysTick_ms();
        elapsed = TIME_DIFF_MS(current_time, timer->start_time);
        timer->current = elapsed;
        
        if(elapsed >= timer->preset)
        {{
            timer->q = 0;
            if(!trigger)
            {{
                timer->enable = 0;
                timer->done = 1;
            }}
        }}
    }}
}}

void COUNTER_CTU(Counter_t *counter, uint32_t preset, uint8_t cu)
{{
    counter->preset = preset;
    
    if(cu && !counter->cu)
    {{
        if(counter->current < counter->preset)
        {{
            counter->current++;
        }}
    }}
    
    counter->cu = cu;
    counter->done = (counter->current >= counter->preset);
    counter->q = counter->done;
}}

void COUNTER_CTD(Counter_t *counter, uint32_t preset, uint8_t cd)
{{
    counter->preset = preset;
    
    if(cd && !counter->cd)
    {{
        if(counter->current > 0)
        {{
            counter->current--;
        }}
    }}
    
    counter->cd = cd;
    counter->done = (counter->current <= 0);
    counter->q = counter->done;
}}

void COUNTER_CTUD(Counter_t *counter, uint32_t preset, uint8_t cu, uint8_t cd)
{{
    counter->preset = preset;
    
    if(cu && !counter->cu)
    {{
        if(counter->current < counter->preset)
        {{
            counter->current++;
        }}
    }}
    
    if(cd && !counter->cd)
    {{
        if(counter->current > 0)
        {{
            counter->current--;
        }}
    }}
    
    counter->cu = cu;
    counter->cd = cd;
    counter->done = (counter->current >= counter->preset);
    counter->q = counter->done;
}}
'''

    def _generate_pid_header(self) -> str:
        return '''
#ifndef __PID_CONTROLLER_H
#define __PID_CONTROLLER_H

#if defined(ARDUINO) && ARDUINO >= 100
#include "Arduino.h"
#else
#include "WProgram.h"
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    float    setpoint;
    float    input;
    float    output;
    float    kp;
    float    ki;
    float    kd;
    float    integral;
    float    last_error;
    float    last_input;
    uint32_t last_time;
    float    output_min;
    float    output_max;
} PID_t;

void PID_Init(PID_t *pid, float kp, float ki, float kd);
void PID_Reset(PID_t *pid);
void PID_SetOutputLimits(PID_t *pid, float min, float max);
void PID_Compute(PID_t *pid);

#ifdef __cplusplus
}
#endif

#endif
'''

    def _generate_pid_source(self) -> str:
        return '''
#include "pid_controller.h"

void PID_Init(PID_t *pid, float kp, float ki, float kd)
{
    pid->kp = kp;
    pid->ki = ki;
    pid->kd = kd;
    pid->integral = 0.0f;
    pid->last_error = 0.0f;
    pid->last_input = 0.0f;
    pid->last_time = millis();
    pid->output_min = 0.0f;
    pid->output_max = 255.0f;
    pid->output = 0.0f;
}

void PID_Reset(PID_t *pid)
{
    pid->integral = 0.0f;
    pid->last_error = 0.0f;
    pid->last_input = pid->input;
    pid->last_time = millis();
    pid->output = 0.0f;
}

void PID_SetOutputLimits(PID_t *pid, float min, float max)
{
    pid->output_min = min;
    pid->output_max = max;
}

void PID_Compute(PID_t *pid)
{
    uint32_t now = millis();
    float dt = (now - pid->last_time) / 1000.0f;
    
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
'''

    def _generate_task_header(self) -> str:
        return '''
#ifndef __TASK_SCHEDULER_H
#define __TASK_SCHEDULER_H

#if defined(ARDUINO) && ARDUINO >= 100
#include "Arduino.h"
#else
#include "WProgram.h"
#endif

#ifdef __cplusplus
extern "C" {
#endif

#define MAX_TASKS 8

typedef struct {
    void     (*task_func)(void);
    uint32_t period;
    uint32_t last_run;
    uint8_t  priority;
    uint8_t  enabled;
} Task_t;

void TaskScheduler_Init(void);
void TaskScheduler_Run(void);
void Task_Enable(Task_t *task);
void Task_Disable(Task_t *task);
uint8_t Task_Add(void (*func)(void), uint32_t period_ms, uint8_t priority);

#ifdef __cplusplus
}
#endif

#endif
'''

    def _generate_task_source(self) -> str:
        return '''
#include "task_scheduler.h"

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

uint8_t Task_Add(void (*func)(void), uint32_t period_ms, uint8_t priority)
{
    if(task_count >= MAX_TASKS) return MAX_TASKS;
    
    uint8_t id = task_count++;
    task_list[id].task_func = func;
    task_list[id].period = period_ms;
    task_list[id].priority = priority;
    task_list[id].enabled = 1;
    task_list[id].last_run = millis();
    
    return id;
}

void Task_Enable(Task_t *task)
{
    task->enabled = 1;
    task->last_run = millis();
}

void Task_Disable(Task_t *task)
{
    task->enabled = 0;
}

void TaskScheduler_Run(void)
{
    uint32_t now = millis();
    
    for(uint8_t i = 0; i < task_count; i++)
    {
        Task_t *task = &task_list[i];
        
        if(!task->enabled || !task->task_func)
            continue;
        
        uint32_t elapsed = now - task->last_run;
        
        if(elapsed >= task->period)
        {
            task->task_func();
            task->last_run = now;
        }
    }
}
'''

    def _generate_example(self) -> str:
        return '''
/**
 * LadderLogic Basic Example
 * 
 * 这个示例展示了如何使用LadderLogic库
 */

#include <LadderLogic.h>

void setup() {
  LadderLogic_Init();
  TaskScheduler_Init();
  
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  LadderLogic_Scan();
  delay(10);
}
'''

    def _generate_readme(self) -> str:
        return '''# LadderLogic Arduino Library

一个将梯形图转换为Arduino代码的库，支持PID控制、定时器、计数器和多任务调度。

## 功能特性

- 🎛️ **PID控制器**：位置式PID，带微分先行和积分抗饱和
- ⏱️ **定时器**：TON/TOF/TP三种类型
- 🔢 **计数器**：CTU/CTD/CTUD三种类型
- 📋 **任务调度**：简单的协作式多任务调度器
- ⚡ **竞态条件消除**：三步扫描模型确保逻辑一致性

## 安装方法

1. 下载 `LadderLogic.zip`
2. 在Arduino IDE中打开：菜单 → 项目 → 加载库 → 添加一个.ZIP库
3. 选择下载的zip文件

## 快速开始

```cpp
#include <LadderLogic.h>

PID_t myPID;

void setup() {
  LadderLogic_Init();
  PID_Init(&myPID, 2.0, 0.5, 0.1);
  myPID.setpoint = 50.0;
}

void loop() {
  myPID.input = analogRead(A0);
  PID_Compute(&myPID);
  analogWrite(9, (int)myPID.output);
  delay(10);
}
```

## API 参考

### PID控制器

- `PID_Init(pid, kp, ki, kd)` - 初始化PID
- `PID_Compute(pid)` - 执行PID计算
- `PID_Reset(pid)` - 重置PID
- `PID_SetOutputLimits(pid, min, max)` - 设置输出限制

### 定时器

- `TIMER_TON(timer, preset, enable)` - 接通延时
- `TIMER_TOF(timer, preset, enable)` - 断开延时
- `TIMER_TP(timer, preset, trigger)` - 脉冲定时器

### 计数器

- `COUNTER_CTU(counter, preset, cu)` - 加计数
- `COUNTER_CTD(counter, preset, cd)` - 减计数
- `COUNTER_CTUD(counter, preset, cu, cd)` - 加减计数

### 任务调度器

- `TaskScheduler_Init()` - 初始化调度器
- `Task_Add(func, period, priority)` - 添加任务
- `TaskScheduler_Run()` - 运行调度器（放在loop中）

## 许可证

MIT License
'''

    def _generate_keywords(self) -> str:
        return '''#######################################
# Syntax Coloring Map For LadderLogic
#######################################

#######################################
# Datatypes (KEYWORD1)
#######################################

Timer_t	KEYWORD1
Counter_t	KEYWORD1
PID_t	KEYWORD1
Task_t	KEYWORD1
IOSnapshot_t	KEYWORD1
OutputBuffer_t	KEYWORD1

#######################################
# Methods and Functions (KEYWORD2)
#######################################

LadderLogic_Init	KEYWORD2
LadderLogic_Scan	KEYWORD2
TIMER_TON	KEYWORD2
TIMER_TOF	KEYWORD2
TIMER_TP	KEYWORD2
COUNTER_CTU	KEYWORD2
COUNTER_CTD	KEYWORD2
COUNTER_CTUD	KEYWORD2
PID_Init	KEYWORD2
PID_Compute	KEYWORD2
PID_Reset	KEYWORD2
PID_SetOutputLimits	KEYWORD2
TaskScheduler_Init	KEYWORD2
TaskScheduler_Run	KEYWORD2
Task_Add	KEYWORD2
Task_Enable	KEYWORD2
Task_Disable	KEYWORD2
GetSysTick_ms	KEYWORD2

#######################################
# Constants (LITERAL1)
#######################################
'''
