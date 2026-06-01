Blockly.defineBlocksWithJsonArray([
    {
        "type": "ladder_rung",
        "message0": "梯级 %1 条件: %2 输出: %3",
        "args0": [
            {
                "type": "field_input",
                "name": "RUNG_NAME",
                "text": "RUNG_0"
            },
            {
                "type": "input_statement",
                "name": "CONDITIONS",
                "check": "Condition"
            },
            {
                "type": "input_statement",
                "name": "OUTPUTS",
                "check": "Output"
            }
        ],
        "colour": "#1ABC9C",
        "tooltip": "梯形图梯级",
        "helpUrl": ""
    },
    {
        "type": "ladder_contact_normal_open",
        "message0": "常开触点 %1",
        "args0": [
            {
                "type": "field_input",
                "name": "CONTACT_NAME",
                "text": "I0.0"
            }
        ],
        "previousStatement": "Condition",
        "nextStatement": "Condition",
        "colour": "#5C81A6",
        "tooltip": "常开触点 (NO)",
        "helpUrl": ""
    },
    {
        "type": "ladder_contact_normal_close",
        "message0": "常闭触点 %1",
        "args0": [
            {
                "type": "field_input",
                "name": "CONTACT_NAME",
                "text": "I0.1"
            }
        ],
        "previousStatement": "Condition",
        "nextStatement": "Condition",
        "colour": "#5C81A6",
        "tooltip": "常闭触点 (NC)",
        "helpUrl": ""
    },
    {
        "type": "ladder_contact_positive_edge",
        "message0": "上升沿 %1",
        "args0": [
            {
                "type": "field_input",
                "name": "CONTACT_NAME",
                "text": "I0.2"
            }
        ],
        "previousStatement": "Condition",
        "nextStatement": "Condition",
        "colour": "#5C81A6",
        "tooltip": "上升沿检测 (POS)",
        "helpUrl": ""
    },
    {
        "type": "ladder_contact_negative_edge",
        "message0": "下降沿 %1",
        "args0": [
            {
                "type": "field_input",
                "name": "CONTACT_NAME",
                "text": "I0.3"
            }
        ],
        "previousStatement": "Condition",
        "nextStatement": "Condition",
        "colour": "#5C81A6",
        "tooltip": "下降沿检测 (NEG)",
        "helpUrl": ""
    },
    {
        "type": "ladder_coil_output",
        "message0": "输出线圈 %1",
        "args0": [
            {
                "type": "field_input",
                "name": "COIL_NAME",
                "text": "Q0.0"
            }
        ],
        "previousStatement": "Output",
        "nextStatement": "Output",
        "colour": "#7AB366",
        "tooltip": "输出线圈",
        "helpUrl": ""
    },
    {
        "type": "ladder_coil_set",
        "message0": "置位线圈 %1",
        "args0": [
            {
                "type": "field_input",
                "name": "COIL_NAME",
                "text": "Q0.1"
            }
        ],
        "previousStatement": "Output",
        "nextStatement": "Output",
        "colour": "#7AB366",
        "tooltip": "置位线圈 (SET)",
        "helpUrl": ""
    },
    {
        "type": "ladder_coil_reset",
        "message0": "复位线圈 %1",
        "args0": [
            {
                "type": "field_input",
                "name": "COIL_NAME",
                "text": "Q0.2"
            }
        ],
        "previousStatement": "Output",
        "nextStatement": "Output",
        "colour": "#7AB366",
        "tooltip": "复位线圈 (RST)",
        "helpUrl": ""
    },
    {
        "type": "ladder_timer_ton",
        "message0": "TON 定时器 %1 预设值 %2 ms",
        "args0": [
            {
                "type": "field_input",
                "name": "TIMER_NAME",
                "text": "T0"
            },
            {
                "type": "field_number",
                "name": "PRESET",
                "value": 1000,
                "min": 0
            }
        ],
        "previousStatement": "Output",
        "nextStatement": "Output",
        "colour": "#D69E2E",
        "tooltip": "接通延时定时器 (TON)",
        "helpUrl": ""
    },
    {
        "type": "ladder_timer_tof",
        "message0": "TOF 定时器 %1 预设值 %2 ms",
        "args0": [
            {
                "type": "field_input",
                "name": "TIMER_NAME",
                "text": "T1"
            },
            {
                "type": "field_number",
                "name": "PRESET",
                "value": 1000,
                "min": 0
            }
        ],
        "previousStatement": "Output",
        "nextStatement": "Output",
        "colour": "#D69E2E",
        "tooltip": "断开延时定时器 (TOF)",
        "helpUrl": ""
    },
    {
        "type": "ladder_timer_tp",
        "message0": "TP 定时器 %1 预设值 %2 ms",
        "args0": [
            {
                "type": "field_input",
                "name": "TIMER_NAME",
                "text": "T2"
            },
            {
                "type": "field_number",
                "name": "PRESET",
                "value": 1000,
                "min": 0
            }
        ],
        "previousStatement": "Output",
        "nextStatement": "Output",
        "colour": "#D69E2E",
        "tooltip": "脉冲定时器 (TP)",
        "helpUrl": ""
    },
    {
        "type": "ladder_counter_ctu",
        "message0": "CTU 加计数器 %1 预设值 %2",
        "args0": [
            {
                "type": "field_input",
                "name": "COUNTER_NAME",
                "text": "C0"
            },
            {
                "type": "field_number",
                "name": "PRESET",
                "value": 10,
                "min": 0
            }
        ],
        "previousStatement": "Output",
        "nextStatement": "Output",
        "colour": "#9C27B0",
        "tooltip": "加计数器 (CTU)",
        "helpUrl": ""
    },
    {
        "type": "ladder_counter_ctd",
        "message0": "CTD 减计数器 %1 预设值 %2",
        "args0": [
            {
                "type": "field_input",
                "name": "COUNTER_NAME",
                "text": "C1"
            },
            {
                "type": "field_number",
                "name": "PRESET",
                "value": 10,
                "min": 0
            }
        ],
        "previousStatement": "Output",
        "nextStatement": "Output",
        "colour": "#9C27B0",
        "tooltip": "减计数器 (CTD)",
        "helpUrl": ""
    },
    {
        "type": "ladder_counter_ctud",
        "message0": "CTUD 加减计数器 %1 预设值 %2",
        "args0": [
            {
                "type": "field_input",
                "name": "COUNTER_NAME",
                "text": "C2"
            },
            {
                "type": "field_number",
                "name": "PRESET",
                "value": 10,
                "min": 0
            }
        ],
        "previousStatement": "Output",
        "nextStatement": "Output",
        "colour": "#9C27B0",
        "tooltip": "加减计数器 (CTUD)",
        "helpUrl": ""
    },
    {
        "type": "ladder_compare_eq",
        "message0": "%1 == %2",
        "args0": [
            {
                "type": "field_input",
                "name": "VAR_A",
                "text": "MW0"
            },
            {
                "type": "field_number",
                "name": "VAR_B",
                "value": 0
            }
        ],
        "output": "Condition",
        "colour": "#E74C3C",
        "tooltip": "等于比较",
        "helpUrl": ""
    },
    {
        "type": "ladder_compare_ne",
        "message0": "%1 != %2",
        "args0": [
            {
                "type": "field_input",
                "name": "VAR_A",
                "text": "MW0"
            },
            {
                "type": "field_number",
                "name": "VAR_B",
                "value": 0
            }
        ],
        "output": "Condition",
        "colour": "#E74C3C",
        "tooltip": "不等于比较",
        "helpUrl": ""
    },
    {
        "type": "ladder_compare_gt",
        "message0": "%1 > %2",
        "args0": [
            {
                "type": "field_input",
                "name": "VAR_A",
                "text": "MW0"
            },
            {
                "type": "field_number",
                "name": "VAR_B",
                "value": 0
            }
        ],
        "output": "Condition",
        "colour": "#E74C3C",
        "tooltip": "大于比较",
        "helpUrl": ""
    },
    {
        "type": "ladder_compare_lt",
        "message0": "%1 < %2",
        "args0": [
            {
                "type": "field_input",
                "name": "VAR_A",
                "text": "MW0"
            },
            {
                "type": "field_number",
                "name": "VAR_B",
                "value": 0
            }
        ],
        "output": "Condition",
        "colour": "#E74C3C",
        "tooltip": "小于比较",
        "helpUrl": ""
    },
    {
        "type": "ladder_compare_ge",
        "message0": "%1 >= %2",
        "args0": [
            {
                "type": "field_input",
                "name": "VAR_A",
                "text": "MW0"
            },
            {
                "type": "field_number",
                "name": "VAR_B",
                "value": 0
            }
        ],
        "output": "Condition",
        "colour": "#E74C3C",
        "tooltip": "大于等于比较",
        "helpUrl": ""
    },
    {
        "type": "ladder_compare_le",
        "message0": "%1 <= %2",
        "args0": [
            {
                "type": "field_input",
                "name": "VAR_A",
                "text": "MW0"
            },
            {
                "type": "field_number",
                "name": "VAR_B",
                "value": 0
            }
        ],
        "output": "Condition",
        "colour": "#E74C3C",
        "tooltip": "小于等于比较",
        "helpUrl": ""
    },
    {
        "type": "ladder_logic_and",
        "message0": "AND %1 %2",
        "args0": [
            {
                "type": "input_value",
                "name": "A",
                "check": "Condition"
            },
            {
                "type": "input_value",
                "name": "B",
                "check": "Condition"
            }
        ],
        "output": "Condition",
        "colour": "#2ECC71",
        "tooltip": "逻辑与",
        "helpUrl": ""
    },
    {
        "type": "ladder_logic_or",
        "message0": "OR %1 %2",
        "args0": [
            {
                "type": "input_value",
                "name": "A",
                "check": "Condition"
            },
            {
                "type": "input_value",
                "name": "B",
                "check": "Condition"
            }
        ],
        "output": "Condition",
        "colour": "#2ECC71",
        "tooltip": "逻辑或",
        "helpUrl": ""
    },
    {
        "type": "ladder_logic_not",
        "message0": "NOT %1",
        "args0": [
            {
                "type": "input_value",
                "name": "A",
                "check": "Condition"
            }
        ],
        "output": "Condition",
        "colour": "#2ECC71",
        "tooltip": "逻辑非",
        "helpUrl": ""
    },
    {
        "type": "ladder_variable_input",
        "message0": "输入 %1",
        "args0": [
            {
                "type": "field_input",
                "name": "VAR_NAME",
                "text": "I0.0"
            }
        ],
        "output": "Condition",
        "colour": "#3498DB",
        "tooltip": "输入变量",
        "helpUrl": ""
    },
    {
        "type": "ladder_variable_output",
        "message0": "输出 %1",
        "args0": [
            {
                "type": "field_input",
                "name": "VAR_NAME",
                "text": "Q0.0"
            }
        ],
        "output": "Condition",
        "colour": "#3498DB",
        "tooltip": "输出变量",
        "helpUrl": ""
    },
    {
        "type": "ladder_variable_memory",
        "message0": "内存 %1",
        "args0": [
            {
                "type": "field_input",
                "name": "VAR_NAME",
                "text": "M0.0"
            }
        ],
        "output": "Condition",
        "colour": "#3498DB",
        "tooltip": "内存变量",
        "helpUrl": ""
    },
    {
        "type": "ladder_pid_regular",
        "message0": "PID控制器 %1 Kp=%2 Ki=%3 Kd=%4",
        "args0": [
            {
                "type": "field_input",
                "name": "PID_NAME",
                "text": "PID0"
            },
            {
                "type": "field_number",
                "name": "KP",
                "value": 1.0,
                "min": 0
            },
            {
                "type": "field_number",
                "name": "KI",
                "value": 0.1,
                "min": 0
            },
            {
                "type": "field_number",
                "name": "KD",
                "value": 0.05,
                "min": 0
            }
        ],
        "previousStatement": "Output",
        "nextStatement": "Output",
        "colour": "#E67E22",
        "tooltip": "PID控制器（位置式）",
        "helpUrl": ""
    },
    {
        "type": "ladder_pid_setpoint",
        "message0": "设定值 %1 = %2",
        "args0": [
            {
                "type": "field_input",
                "name": "PID_NAME",
                "text": "PID0"
            },
            {
                "type": "field_number",
                "name": "SETPOINT",
                "value": 50
            }
        ],
        "previousStatement": "Output",
        "nextStatement": "Output",
        "colour": "#E67E22",
        "tooltip": "PID设定值",
        "helpUrl": ""
    },
    {
        "type": "ladder_pid_input",
        "message0": "过程值 %1 = %2",
        "args0": [
            {
                "type": "field_input",
                "name": "PID_NAME",
                "text": "PID0"
            },
            {
                "type": "field_input",
                "name": "SOURCE",
                "text": "AI0"
            }
        ],
        "previousStatement": "Output",
        "nextStatement": "Output",
        "colour": "#E67E22",
        "tooltip": "PID过程值输入",
        "helpUrl": ""
    },
    {
        "type": "ladder_pid_output",
        "message0": "输出值 %1 -> %2",
        "args0": [
            {
                "type": "field_input",
                "name": "PID_NAME",
                "text": "PID0"
            },
            {
                "type": "field_input",
                "name": "TARGET",
                "text": "AQ0"
            }
        ],
        "previousStatement": "Output",
        "nextStatement": "Output",
        "colour": "#E67E22",
        "tooltip": "PID输出",
        "helpUrl": ""
    },
    {
        "type": "ladder_task",
        "message0": "任务 %1 优先级 %2 周期 %3 ms",
        "args0": [
            {
                "type": "field_input",
                "name": "TASK_NAME",
                "text": "TASK_FAST"
            },
            {
                "type": "field_number",
                "name": "PRIORITY",
                "value": 1,
                "min": 0,
                "max": 15
            },
            {
                "type": "field_number",
                "name": "PERIOD",
                "value": 10,
                "min": 1
            }
        ],
        "message1": "梯级: %1",
        "args1": [
            {
                "type": "input_statement",
                "name": "RUNGS",
                "check": null
            }
        ],
        "colour": "#34495E",
        "tooltip": "调度任务",
        "helpUrl": ""
    },
    {
        "type": "ladder_task_cyclic",
        "message0": "周期任务 %1 每 %2 ms 执行",
        "args0": [
            {
                "type": "field_input",
                "name": "TASK_NAME",
                "text": "CYCLIC_TASK"
            },
            {
                "type": "field_number",
                "name": "PERIOD",
                "value": 100,
                "min": 1
            }
        ],
        "message1": "梯级: %1",
        "args1": [
            {
                "type": "input_statement",
                "name": "RUNGS",
                "check": null
            }
        ],
        "colour": "#34495E",
        "tooltip": "周期执行任务",
        "helpUrl": ""
    }
]);
