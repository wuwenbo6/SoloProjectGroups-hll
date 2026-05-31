import xml.etree.ElementTree as ET
from typing import List, Dict, Any

class BlocklyToSTConverter:
    def __init__(self):
        self.variables: Dict[str, str] = {}
        self.timers: List[Dict[str, str]] = []
        self.counters: List[Dict[str, str]] = []
        
    def convert(self, blockly_xml: str) -> str:
        if not blockly_xml or blockly_xml.strip() == '':
            return self._generate_empty_program()
        
        try:
            root = ET.fromstring(blockly_xml)
        except ET.ParseError:
            return self._generate_empty_program()
        
        self.variables = {}
        self.timers = []
        self.counters = []
        
        statements = []
        variables_block = root.find('.//variables')
        if variables_block is not None:
            self._parse_variables(variables_block)
        
        for block in root.findall('.//block'):
            if block.get('type') == 'logic_rung':
                stmt = self._parse_rung(block)
                if stmt:
                    statements.append(stmt)
        
        return self._generate_program(statements)
    
    def _parse_variables(self, variables_element: ET.Element):
        for var in variables_element.findall('variable'):
            var_name = var.text
            var_id = var.get('id')
            self.variables[var_id] = var_name
    
    def _parse_rung(self, block: ET.Element) -> str:
        condition = ''
        action = ''
        
        statement = block.find('statement[@name="CONDITION"]')
        if statement is not None:
            condition_block = statement.find('block')
            if condition_block is not None:
                condition = self._parse_block(condition_block)
        
        next_stmt = block.find('next')
        if next_stmt is not None:
            action_block = next_stmt.find('block')
            if action_block is not None:
                action = self._parse_block(action_block)
        
        if condition and action:
            return f"IF {condition} THEN\n    {action}\nEND_IF;"
        elif action:
            return action
        return ''
    
    def _parse_block(self, block: ET.Element) -> str:
        block_type = block.get('type')
        
        parsers = {
            'logic_compare': self._parse_compare,
            'logic_operation': self._parse_operation,
            'logic_negate': self._parse_negate,
            'logic_boolean': self._parse_boolean,
            'math_number': self._parse_number,
            'variables_get': self._parse_variable_get,
            'variables_set': self._parse_variable_set,
            'coil_normal': self._parse_coil,
            'coil_negate': self._parse_coil_negate,
            'contact_normal': self._parse_contact,
            'contact_negate': self._parse_contact_negate,
            'timer_ton': self._parse_timer_ton,
            'timer_tof': self._parse_timer_tof,
            'timer_tp': self._parse_timer_tp,
            'counter_ctu': self._parse_counter_ctu,
            'counter_ctd': self._parse_counter_ctd,
            'counter_ctud': self._parse_counter_ctud,
            'math_arithmetic': self._parse_arithmetic,
        }
        
        parser = parsers.get(block_type, self._parse_unknown)
        return parser(block)
    
    def _parse_compare(self, block: ET.Element) -> str:
        op = block.find('field[@name="OP"]')
        operator = op.text if op is not None else 'EQ'
        
        op_map = {
            'EQ': '=',
            'NEQ': '<>',
            'LT': '<',
            'LTE': '<=',
            'GT': '>',
            'GTE': '>='
        }
        
        a = self._parse_value(block, 'A')
        b = self._parse_value(block, 'B')
        
        return f"({a} {op_map.get(operator, '=')} {b})"
    
    def _parse_operation(self, block: ET.Element) -> str:
        op = block.find('field[@name="OP"]')
        operator = op.text if op is not None else 'AND'
        
        op_map = {
            'AND': 'AND',
            'OR': 'OR'
        }
        
        a = self._parse_value(block, 'A')
        b = self._parse_value(block, 'B')
        
        return f"({a} {op_map.get(operator, 'AND')} {b})"
    
    def _parse_negate(self, block: ET.Element) -> str:
        bool_val = self._parse_value(block, 'BOOL')
        return f"(NOT {bool_val})"
    
    def _parse_boolean(self, block: ET.Element) -> str:
        bool_field = block.find('field[@name="BOOL"]')
        return bool_field.text.upper() if bool_field is not None else 'FALSE'
    
    def _parse_number(self, block: ET.Element) -> str:
        num_field = block.find('field[@name="NUM"]')
        return num_field.text if num_field is not None else '0'
    
    def _parse_variable_get(self, block: ET.Element) -> str:
        var_field = block.find('field[@name="VAR"]')
        if var_field is not None:
            var_id = var_field.get('id')
            return self.variables.get(var_id, var_field.text)
        return 'UNKNOWN_VAR'
    
    def _parse_variable_set(self, block: ET.Element) -> str:
        var_field = block.find('field[@name="VAR"]')
        var_name = 'UNKNOWN_VAR'
        if var_field is not None:
            var_id = var_field.get('id')
            var_name = self.variables.get(var_id, var_field.text)
        
        value = self._parse_value(block, 'VALUE')
        return f"{var_name} := {value};"
    
    def _parse_coil(self, block: ET.Element) -> str:
        var_field = block.find('field[@name="VAR"]')
        var_name = 'UNKNOWN_VAR'
        if var_field is not None:
            var_id = var_field.get('id')
            var_name = self.variables.get(var_id, var_field.text)
        return f"{var_name} := TRUE;"
    
    def _parse_coil_negate(self, block: ET.Element) -> str:
        var_field = block.find('field[@name="VAR"]')
        var_name = 'UNKNOWN_VAR'
        if var_field is not None:
            var_id = var_field.get('id')
            var_name = self.variables.get(var_id, var_field.text)
        return f"{var_name} := FALSE;"
    
    def _parse_contact(self, block: ET.Element) -> str:
        var_field = block.find('field[@name="VAR"]')
        if var_field is not None:
            var_id = var_field.get('id')
            return self.variables.get(var_id, var_field.text)
        return 'UNKNOWN_VAR'
    
    def _parse_contact_negate(self, block: ET.Element) -> str:
        var_field = block.find('field[@name="VAR"]')
        if var_field is not None:
            var_id = var_field.get('id')
            var_name = self.variables.get(var_id, var_field.text)
            return f"NOT {var_name}"
        return 'UNKNOWN_VAR'
    
    def _parse_timer_ton(self, block: ET.Element) -> str:
        name_field = block.find('field[@name="NAME"]')
        timer_name = name_field.text if name_field is not None else 'T1'
        
        if not any(t['name'] == timer_name for t in self.timers):
            self.timers.append({'name': timer_name, 'type': 'TON'})
        
        pt = self._parse_value(block, 'PT')
        return f"{timer_name}(IN:=TRUE, PT:={pt});"
    
    def _parse_timer_tof(self, block: ET.Element) -> str:
        name_field = block.find('field[@name="NAME"]')
        timer_name = name_field.text if name_field is not None else 'T1'
        
        if not any(t['name'] == timer_name for t in self.timers):
            self.timers.append({'name': timer_name, 'type': 'TOF'})
        
        pt = self._parse_value(block, 'PT')
        return f"{timer_name}(IN:=TRUE, PT:={pt});"
    
    def _parse_timer_tp(self, block: ET.Element) -> str:
        name_field = block.find('field[@name="NAME"]')
        timer_name = name_field.text if name_field is not None else 'T1'
        
        if not any(t['name'] == timer_name for t in self.timers):
            self.timers.append({'name': timer_name, 'type': 'TP'})
        
        pt = self._parse_value(block, 'PT')
        return f"{timer_name}(IN:=TRUE, PT:={pt});"
    
    def _parse_counter_ctu(self, block: ET.Element) -> str:
        name_field = block.find('field[@name="NAME"]')
        counter_name = name_field.text if name_field is not None else 'C1'
        
        if not any(c['name'] == counter_name for c in self.counters):
            self.counters.append({'name': counter_name, 'type': 'CTU'})
        
        pv = self._parse_value(block, 'PV')
        return f"{counter_name}(CU:=TRUE, PV:={pv});"
    
    def _parse_counter_ctd(self, block: ET.Element) -> str:
        name_field = block.find('field[@name="NAME"]')
        counter_name = name_field.text if name_field is not None else 'C1'
        
        if not any(c['name'] == counter_name for c in self.counters):
            self.counters.append({'name': counter_name, 'type': 'CTD'})
        
        pv = self._parse_value(block, 'PV')
        return f"{counter_name}(CD:=TRUE, PV:={pv});"
    
    def _parse_counter_ctud(self, block: ET.Element) -> str:
        name_field = block.find('field[@name="NAME"]')
        counter_name = name_field.text if name_field is not None else 'C1'
        
        if not any(c['name'] == counter_name for c in self.counters):
            self.counters.append({'name': counter_name, 'type': 'CTUD'})
        
        pv = self._parse_value(block, 'PV')
        return f"{counter_name}(CU:=TRUE, CD:=TRUE, PV:={pv});"
    
    def _parse_arithmetic(self, block: ET.Element) -> str:
        op = block.find('field[@name="OP"]')
        operator = op.text if op is not None else 'ADD'
        
        op_map = {
            'ADD': '+',
            'MINUS': '-',
            'MULTIPLY': '*',
            'DIVIDE': '/'
        }
        
        a = self._parse_value(block, 'A')
        b = self._parse_value(block, 'B')
        
        return f"({a} {op_map.get(operator, '+')} {b})"
    
    def _parse_value(self, block: ET.Element, name: str) -> str:
        value_element = block.find(f'value[@name="{name}"]')
        if value_element is not None:
            inner_block = value_element.find('block')
            if inner_block is not None:
                return self._parse_block(inner_block)
        return '0'
    
    def _parse_unknown(self, block: ET.Element) -> str:
        return f"(* Unknown block type: {block.get('type', 'unknown')} *)"
    
    def _generate_empty_program(self) -> str:
        return """PROGRAM Main
VAR
    (* Variables *)
END_VAR

(* Ladder Logic Program *)
(* No logic defined yet *)
"""
    
    def _generate_program(self, statements: List[str]) -> str:
        program_lines = [
            "PROGRAM Main",
            "VAR"
        ]
        
        if self.variables:
            for var_name in self.variables.values():
                program_lines.append(f"    {var_name}: BOOL;")
        
        if self.timers:
            program_lines.append("")
            program_lines.append("    (* Timers *)")
            for timer in self.timers:
                program_lines.append(f"    {timer['name']}: {timer['type']};")
        
        if self.counters:
            program_lines.append("")
            program_lines.append("    (* Counters *)")
            for counter in self.counters:
                program_lines.append(f"    {counter['name']}: {counter['type']};")
        
        program_lines.extend([
            "END_VAR",
            "",
            "(* Ladder Logic Program *)",
            ""
        ])
        
        for i, stmt in enumerate(statements, 1):
            program_lines.append(f"(* Rung {i} *)")
            program_lines.append(stmt)
            program_lines.append("")
        
        return '\n'.join(program_lines)
