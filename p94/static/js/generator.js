Blockly.JavaScript['ladder_rung'] = function(block) {
    const rungName = block.getFieldValue('RUNG_NAME');
    const conditions = Blockly.JavaScript.statementToCode(block, 'CONDITIONS');
    const outputs = Blockly.JavaScript.statementToCode(block, 'OUTPUTS');
    return `// ${rungName}\n${conditions}${outputs}\n`;
};

Blockly.JavaScript['ladder_contact_normal_open'] = function(block) {
    const name = block.getFieldValue('CONTACT_NAME');
    return `readContact("${name}");\n`;
};

Blockly.JavaScript['ladder_contact_normal_close'] = function(block) {
    const name = block.getFieldValue('CONTACT_NAME');
    return `readContactNC("${name}");\n`;
};

Blockly.JavaScript['ladder_contact_positive_edge'] = function(block) {
    const name = block.getFieldValue('CONTACT_NAME');
    return `readPositiveEdge("${name}");\n`;
};

Blockly.JavaScript['ladder_contact_negative_edge'] = function(block) {
    const name = block.getFieldValue('CONTACT_NAME');
    return `readNegativeEdge("${name}");\n`;
};

Blockly.JavaScript['ladder_coil_output'] = function(block) {
    const name = block.getFieldValue('COIL_NAME');
    return `writeCoil("${name}", state);\n`;
};

Blockly.JavaScript['ladder_coil_set'] = function(block) {
    const name = block.getFieldValue('COIL_NAME');
    return `setCoil("${name}");\n`;
};

Blockly.JavaScript['ladder_coil_reset'] = function(block) {
    const name = block.getFieldValue('COIL_NAME');
    return `resetCoil("${name}");\n`;
};

Blockly.JavaScript['ladder_timer_ton'] = function(block) {
    const name = block.getFieldValue('TIMER_NAME');
    const preset = block.getFieldValue('PRESET');
    return `timerTON("${name}", ${preset}, condition);\n`;
};

Blockly.JavaScript['ladder_timer_tof'] = function(block) {
    const name = block.getFieldValue('TIMER_NAME');
    const preset = block.getFieldValue('PRESET');
    return `timerTOF("${name}", ${preset}, condition);\n`;
};

Blockly.JavaScript['ladder_timer_tp'] = function(block) {
    const name = block.getFieldValue('TIMER_NAME');
    const preset = block.getFieldValue('PRESET');
    return `timerTP("${name}", ${preset}, condition);\n`;
};

Blockly.JavaScript['ladder_counter_ctu'] = function(block) {
    const name = block.getFieldValue('COUNTER_NAME');
    const preset = block.getFieldValue('PRESET');
    return `counterCTU("${name}", ${preset}, condition);\n`;
};

Blockly.JavaScript['ladder_counter_ctd'] = function(block) {
    const name = block.getFieldValue('COUNTER_NAME');
    const preset = block.getFieldValue('PRESET');
    return `counterCTD("${name}", ${preset}, condition);\n`;
};

Blockly.JavaScript['ladder_counter_ctud'] = function(block) {
    const name = block.getFieldValue('COUNTER_NAME');
    const preset = block.getFieldValue('PRESET');
    return `counterCTUD("${name}", ${preset}, condition_up, condition_down);\n`;
};

Blockly.JavaScript['ladder_compare_eq'] = function(block) {
    const varA = block.getFieldValue('VAR_A');
    const varB = block.getFieldValue('VAR_B');
    return [`(${varA} == ${varB})`, Blockly.JavaScript.ORDER_ATOMIC];
};

Blockly.JavaScript['ladder_compare_ne'] = function(block) {
    const varA = block.getFieldValue('VAR_A');
    const varB = block.getFieldValue('VAR_B');
    return [`(${varA} != ${varB})`, Blockly.JavaScript.ORDER_ATOMIC];
};

Blockly.JavaScript['ladder_compare_gt'] = function(block) {
    const varA = block.getFieldValue('VAR_A');
    const varB = block.getFieldValue('VAR_B');
    return [`(${varA} > ${varB})`, Blockly.JavaScript.ORDER_ATOMIC];
};

Blockly.JavaScript['ladder_compare_lt'] = function(block) {
    const varA = block.getFieldValue('VAR_A');
    const varB = block.getFieldValue('VAR_B');
    return [`(${varA} < ${varB})`, Blockly.JavaScript.ORDER_ATOMIC];
};

Blockly.JavaScript['ladder_compare_ge'] = function(block) {
    const varA = block.getFieldValue('VAR_A');
    const varB = block.getFieldValue('VAR_B');
    return [`(${varA} >= ${varB})`, Blockly.JavaScript.ORDER_ATOMIC];
};

Blockly.JavaScript['ladder_compare_le'] = function(block) {
    const varA = block.getFieldValue('VAR_A');
    const varB = block.getFieldValue('VAR_B');
    return [`(${varA} <= ${varB})`, Blockly.JavaScript.ORDER_ATOMIC];
};

Blockly.JavaScript['ladder_logic_and'] = function(block) {
    const a = Blockly.JavaScript.valueToCode(block, 'A', Blockly.JavaScript.ORDER_LOGICAL_AND) || 'false';
    const b = Blockly.JavaScript.valueToCode(block, 'B', Blockly.JavaScript.ORDER_LOGICAL_AND) || 'false';
    return [`(${a} && ${b})`, Blockly.JavaScript.ORDER_LOGICAL_AND];
};

Blockly.JavaScript['ladder_logic_or'] = function(block) {
    const a = Blockly.JavaScript.valueToCode(block, 'A', Blockly.JavaScript.ORDER_LOGICAL_OR) || 'false';
    const b = Blockly.JavaScript.valueToCode(block, 'B', Blockly.JavaScript.ORDER_LOGICAL_OR) || 'false';
    return [`(${a} || ${b})`, Blockly.JavaScript.ORDER_LOGICAL_OR];
};

Blockly.JavaScript['ladder_logic_not'] = function(block) {
    const a = Blockly.JavaScript.valueToCode(block, 'A', Blockly.JavaScript.ORDER_LOGICAL_NOT) || 'false';
    return [`(!${a})`, Blockly.JavaScript.ORDER_LOGICAL_NOT];
};

Blockly.JavaScript['ladder_variable_input'] = function(block) {
    const name = block.getFieldValue('VAR_NAME');
    return [`readInput("${name}")`, Blockly.JavaScript.ORDER_ATOMIC];
};

Blockly.JavaScript['ladder_variable_output'] = function(block) {
    const name = block.getFieldValue('VAR_NAME');
    return [`readOutput("${name}")`, Blockly.JavaScript.ORDER_ATOMIC];
};

Blockly.JavaScript['ladder_variable_memory'] = function(block) {
    const name = block.getFieldValue('VAR_NAME');
    return [`readMemory("${name}")`, Blockly.JavaScript.ORDER_ATOMIC];
};
