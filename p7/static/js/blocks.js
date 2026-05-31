Blockly.defineBlocksWithJsonArray([
    {
        "type": "logic_rung",
        "message0": "Rung: condition %1 %2",
        "args0": [
            {
                "type": "input_statement",
                "name": "CONDITION"
            },
            {
                "type": "input_end_row"
            }
        ],
        "message1": "action %1",
        "args1": [
            {
                "type": "input_statement",
                "name": "ACTION"
            }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 210,
        "tooltip": "Ladder logic rung with condition and action",
        "helpUrl": ""
    },
    {
        "type": "contact_normal",
        "message0": "contact %1",
        "args0": [
            {
                "type": "field_variable",
                "name": "VAR",
                "variable": "input1"
            }
        ],
        "output": "Boolean",
        "colour": 120,
        "tooltip": "Normally open contact",
        "helpUrl": ""
    },
    {
        "type": "contact_negate",
        "message0": "contact NOT %1",
        "args0": [
            {
                "type": "field_variable",
                "name": "VAR",
                "variable": "input1"
            }
        ],
        "output": "Boolean",
        "colour": 120,
        "tooltip": "Normally closed contact",
        "helpUrl": ""
    },
    {
        "type": "coil_normal",
        "message0": "coil %1",
        "args0": [
            {
                "type": "field_variable",
                "name": "VAR",
                "variable": "output1"
            }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 160,
        "tooltip": "Output coil",
        "helpUrl": ""
    },
    {
        "type": "coil_negate",
        "message0": "coil NOT %1",
        "args0": [
            {
                "type": "field_variable",
                "name": "VAR",
                "variable": "output1"
            }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 160,
        "tooltip": "Negated output coil",
        "helpUrl": ""
    },
    {
        "type": "timer_ton",
        "message0": "TON %1 PT %2",
        "args0": [
            {
                "type": "field_input",
                "name": "NAME",
                "text": "T1"
            },
            {
                "type": "input_value",
                "name": "PT",
                "check": "Number"
            }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 290,
        "tooltip": "On-delay timer",
        "helpUrl": ""
    },
    {
        "type": "timer_tof",
        "message0": "TOF %1 PT %2",
        "args0": [
            {
                "type": "field_input",
                "name": "NAME",
                "text": "T2"
            },
            {
                "type": "input_value",
                "name": "PT",
                "check": "Number"
            }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 290,
        "tooltip": "Off-delay timer",
        "helpUrl": ""
    },
    {
        "type": "timer_tp",
        "message0": "TP %1 PT %2",
        "args0": [
            {
                "type": "field_input",
                "name": "NAME",
                "text": "T3"
            },
            {
                "type": "input_value",
                "name": "PT",
                "check": "Number"
            }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 290,
        "tooltip": "Pulse timer",
        "helpUrl": ""
    },
    {
        "type": "counter_ctu",
        "message0": "CTU %1 PV %2",
        "args0": [
            {
                "type": "field_input",
                "name": "NAME",
                "text": "C1"
            },
            {
                "type": "input_value",
                "name": "PV",
                "check": "Number"
            }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 330,
        "tooltip": "Up counter",
        "helpUrl": ""
    },
    {
        "type": "counter_ctd",
        "message0": "CTD %1 PV %2",
        "args0": [
            {
                "type": "field_input",
                "name": "NAME",
                "text": "C2"
            },
            {
                "type": "input_value",
                "name": "PV",
                "check": "Number"
            }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 330,
        "tooltip": "Down counter",
        "helpUrl": ""
    },
    {
        "type": "counter_ctud",
        "message0": "CTUD %1 PV %2",
        "args0": [
            {
                "type": "field_input",
                "name": "NAME",
                "text": "C3"
            },
            {
                "type": "input_value",
                "name": "PV",
                "check": "Number"
            }
        ],
        "previousStatement": null,
        "nextStatement": null,
        "colour": 330,
        "tooltip": "Up/Down counter",
        "helpUrl": ""
    }
]);

function setBlockColour(blockType, colour) {
    if (Blockly.Blocks[blockType] && Blockly.Blocks[blockType].init) {
        const originalInit = Blockly.Blocks[blockType].init;
        Blockly.Blocks[blockType].init = function() {
            originalInit.call(this);
            this.setColour(colour);
        };
    }
}

setBlockColour('logic_compare', 210);
setBlockColour('logic_operation', 210);
setBlockColour('logic_negate', 210);
setBlockColour('logic_boolean', 210);
setBlockColour('math_number', 230);
setBlockColour('math_arithmetic', 230);
setBlockColour('variables_get', 330);
setBlockColour('variables_set', 330);
