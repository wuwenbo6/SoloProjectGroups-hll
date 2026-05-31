import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class STVariable:
    name: str
    type: str
    value: Optional[str] = None

@dataclass
class STTimer:
    name: str
    type: str
    in_var: str = 'FALSE'
    pt: str = 'T#1000MS'

@dataclass
class STCounter:
    name: str
    type: str
    cu: str = 'FALSE'
    cd: str = 'FALSE'
    pv: str = '10'

@dataclass
class STFunctionBlock:
    name: str
    type: str
    inputs: Dict[str, str]

@dataclass
class STRung:
    condition: Optional[str] = None
    action: Optional[str] = None

class STParser:
    def __init__(self):
        self.variables: List[STVariable] = []
        self.timers: List[STTimer] = []
        self.counters: List[STCounter] = []
        self.function_blocks: List[STFunctionBlock] = []
        self.rungs: List[STRung] = []
        
    def parse(self, st_code: str) -> Dict[str, Any]:
        self.variables = []
        self.timers = []
        self.counters = []
        self.function_blocks = []
        self.rungs = []
        
        var_section = self._extract_section(st_code, 'VAR', 'END_VAR')
        if var_section:
            self._parse_var_section(var_section)
        
        body = st_code[st_code.find('END_VAR') + 7:] if 'END_VAR' in st_code else st_code
        self._parse_body(body)
        
        return {
            'variables': self.variables,
            'timers': self.timers,
            'counters': self.counters,
            'function_blocks': self.function_blocks,
            'rungs': self.rungs
        }
    
    def _extract_section(self, text: str, start_marker: str, end_marker: str) -> Optional[str]:
        start = text.find(start_marker)
        end = text.find(end_marker)
        if start != -1 and end != -1 and end > start:
            return text[start + len(start_marker):end].strip()
        return None
    
    def _parse_var_section(self, section: str):
        lines = section.split('\n')
        for line in lines:
            line = line.strip()
            if not line or line.startswith('(*'):
                continue
            
            match = re.match(r'(\w+)\s*:\s*(\w+)\s*;', line)
            if match:
                name = match.group(1)
                type_name = match.group(2)
                
                if type_name in ['TON', 'TOF', 'TP']:
                    self.timers.append(STTimer(name=name, type=type_name))
                elif type_name in ['CTU', 'CTD', 'CTUD']:
                    self.counters.append(STCounter(name=name, type=type_name))
                elif type_name in ['BOOL', 'INT', 'DINT', 'REAL', 'TIME']:
                    self.variables.append(STVariable(name=name, type=type_name))
                else:
                    self.function_blocks.append(STFunctionBlock(name=name, type=type_name, inputs={}))
    
    def _parse_body(self, body: str):
        lines = body.split('\n')
        current_rung = None
        i = 0
        
        while i < len(lines):
            line = lines[i].strip()
            
            if line.startswith('(* Rung'):
                if current_rung:
                    self.rungs.append(current_rung)
                current_rung = STRung()
                i += 1
                continue
            
            if not line or line.startswith('(*'):
                i += 1
                continue
            
            if line.startswith('IF') and 'THEN' in line:
                condition = line[2:line.find('THEN')].strip()
                current_rung = current_rung or STRung()
                current_rung.condition = condition
                
                i += 1
                while i < len(lines):
                    action_line = lines[i].strip()
                    if action_line == 'END_IF;':
                        break
                    if action_line and not action_line.startswith('(*'):
                        current_rung.action = action_line
                    i += 1
                
                self.rungs.append(current_rung)
                current_rung = None
            
            elif '(' in line and ')' in line and ':=' not in line:
                fb_call_match = re.match(r'(\w+)\((.*)\)\s*;', line)
                if fb_call_match:
                    fb_name = fb_call_match.group(1)
                    params_str = fb_call_match.group(2)
                    params = self._parse_params(params_str)
                    
                    timer = next((t for t in self.timers if t.name == fb_name), None)
                    if timer:
                        timer.in_var = params.get('IN', 'FALSE')
                        timer.pt = params.get('PT', 'T#1000MS')
                        current_rung = current_rung or STRung()
                        current_rung.action = line
                        self.rungs.append(current_rung)
                        current_rung = None
                    else:
                        counter = next((c for c in self.counters if c.name == fb_name), None)
                        if counter:
                            counter.cu = params.get('CU', 'FALSE')
                            counter.cd = params.get('CD', 'FALSE')
                            counter.pv = params.get('PV', '10')
                            current_rung = current_rung or STRung()
                            current_rung.action = line
                            self.rungs.append(current_rung)
                            current_rung = None
                        else:
                            current_rung = current_rung or STRung()
                            current_rung.action = line
                            self.rungs.append(current_rung)
                            current_rung = None
            
            elif ':=' in line:
                current_rung = current_rung or STRung()
                current_rung.action = line
                self.rungs.append(current_rung)
                current_rung = None
            
            i += 1
        
        if current_rung and (current_rung.condition or current_rung.action):
            self.rungs.append(current_rung)
    
    def _parse_params(self, params_str: str) -> Dict[str, str]:
        params = {}
        for param in params_str.split(','):
            param = param.strip()
            if ':=' in param:
                key, value = param.split(':=', 1)
                params[key.strip()] = value.strip()
        return params

class STToBlocklyConverter:
    def __init__(self):
        self.parser = STParser()
        self.block_id_counter = 0
    
    def _next_id(self) -> str:
        self.block_id_counter += 1
        return f"block_{self.block_id_counter}"
    
    def convert(self, st_code: str) -> str:
        ast = self.parser.parse(st_code)
        self.block_id_counter = 0
        
        xml_parts = ['<xml xmlns="https://developers.google.com/blockly/xml">']
        
        xml_parts.append('<variables>')
        for var in ast['variables']:
            var_id = f"var_{var.name}"
            xml_parts.append(f'  <variable id="{var_id}">{var.name}</variable>')
        xml_parts.append('</variables>')
        
        for i, rung in enumerate(ast['rungs']):
            xml_parts.extend(self._rung_to_xml(rung, i, ast))
        
        xml_parts.append('</xml>')
        return '\n'.join(xml_parts)
    
    def _rung_to_xml(self, rung: STRung, index: int, ast: Dict) -> List[str]:
        block_id = self._next_id()
        xml = [f'<block type="logic_rung" id="{block_id}" x="20" y="{20 + index * 200}">']
        
        if rung.condition:
            xml.append('  <statement name="CONDITION">')
            condition_xml = self._condition_to_xml(rung.condition, ast)
            if condition_xml:
                xml.append(f'    {condition_xml}')
            xml.append('  </statement>')
        
        if rung.action:
            action_xml = self._action_to_xml(rung.action, ast)
            if action_xml:
                xml.append('  <next>')
                xml.append(f'    {action_xml}')
                xml.append('  </next>')
        
        xml.append('</block>')
        return xml
    
    def _condition_to_xml(self, condition: str, ast: Dict) -> Optional[str]:
        block_id = self._next_id()
        
        contact_match = re.match(r'^NOT\s+(\w+)$', condition)
        if contact_match:
            var_name = contact_match.group(1)
            var_id = f"var_{var_name}"
            return f'<block type="contact_negate" id="{block_id}"><field name="VAR" id="{var_id}" variabletype="">{var_name}</field></block>'
        
        if ' AND ' in condition or ' OR ' in condition:
            op = 'AND' if ' AND ' in condition else 'OR'
            parts = re.split(r'\s+AND\s+|\s+OR\s+', condition)
            if len(parts) == 2:
                a_xml = self._condition_to_xml(parts[0].strip('() '), ast)
                b_xml = self._condition_to_xml(parts[1].strip('() '), ast)
                if a_xml and b_xml:
                    op_id = 'AND' if op == 'AND' else 'OR'
                    return f'''<block type="logic_operation" id="{block_id}">
  <field name="OP">{op_id}</field>
  <value name="A">
    {a_xml}
  </value>
  <value name="B">
    {b_xml}
  </value>
</block>'''
        
        if re.match(r'^(\w+)$', condition):
            var_name = condition
            var_id = f"var_{var_name}"
            return f'<block type="contact_normal" id="{block_id}"><field name="VAR" id="{var_id}" variabletype="">{var_name}</field></block>'
        
        compare_match = re.match(r'(.+?)\s*(=|<>|<|<=|>|>=)\s*(.+)', condition)
        if compare_match:
            a = compare_match.group(1).strip('() ')
            op = compare_match.group(2)
            b = compare_match.group(3).strip('() ')
            
            op_map = {'=': 'EQ', '<>': 'NEQ', '<': 'LT', '<=': 'LTE', '>': 'GT', '>=': 'GTE'}
            
            return f'''<block type="logic_compare" id="{block_id}">
  <field name="OP">{op_map.get(op, 'EQ')}</field>
  <value name="A">
    <block type="variables_get" id="{self._next_id()}"><field name="VAR" id="var_{a}" variabletype="">{a}</field></block>
  </value>
  <value name="B">
    <block type="variables_get" id="{self._next_id()}"><field name="VAR" id="var_{b}" variabletype="">{b}</field></block>
  </value>
</block>'''
        
        return None
    
    def _action_to_xml(self, action: str, ast: Dict) -> Optional[str]:
        block_id = self._next_id()
        
        coil_match = re.match(r'(\w+)\s*:=\s*TRUE\s*;', action)
        if coil_match:
            var_name = coil_match.group(1)
            var_id = f"var_{var_name}"
            return f'<block type="coil_normal" id="{block_id}"><field name="VAR" id="{var_id}" variabletype="">{var_name}</field></block>'
        
        coil_neg_match = re.match(r'(\w+)\s*:=\s*FALSE\s*;', action)
        if coil_neg_match:
            var_name = coil_neg_match.group(1)
            var_id = f"var_{var_name}"
            return f'<block type="coil_negate" id="{block_id}"><field name="VAR" id="{var_id}" variabletype="">{var_name}</field></block>'
        
        timer_match = re.match(r'(\w+)\(IN:=(.+),\s*PT:=(.+)\)\s*;', action)
        if timer_match:
            timer_name = timer_match.group(1)
            pt = timer_match.group(3)
            
            timer = next((t for t in ast['timers'] if t.name == timer_name), None)
            timer_type = timer.type if timer else 'TON'
            
            type_map = {'TON': 'timer_ton', 'TOF': 'timer_tof', 'TP': 'timer_tp'}
            
            return f'''<block type="{type_map.get(timer_type, 'timer_ton')}" id="{block_id}">
  <field name="NAME">{timer_name}</field>
  <value name="PT">
    <block type="math_number" id="{self._next_id()}"><field name="NUM">{self._time_to_ms(pt)}</field></block>
  </value>
</block>'''
        
        counter_match = re.match(r'(\w+)\((?:CU:=(.+?),?\s*)?(?:CD:=(.+?),?\s*)?PV:=(.+)\)\s*;', action)
        if counter_match:
            counter_name = counter_match.group(1)
            pv = counter_match.group(4)
            
            counter = next((c for c in ast['counters'] if c.name == counter_name), None)
            counter_type = counter.type if counter else 'CTU'
            
            type_map = {'CTU': 'counter_ctu', 'CTD': 'counter_ctd', 'CTUD': 'counter_ctud'}
            
            return f'''<block type="{type_map.get(counter_type, 'counter_ctu')}" id="{block_id}">
  <field name="NAME">{counter_name}</field>
  <value name="PV">
    <block type="math_number" id="{self._next_id()}"><field name="NUM">{pv}</field></block>
  </value>
</block>'''
        
        var_set_match = re.match(r'(\w+)\s*:=\s*(.+)\s*;', action)
        if var_set_match:
            var_name = var_set_match.group(1)
            value = var_set_match.group(2)
            var_id = f"var_{var_name}"
            
            if value.replace('.', '').isdigit():
                return f'''<block type="variables_set" id="{block_id}">
  <field name="VAR" id="{var_id}" variabletype="">{var_name}</field>
  <value name="VALUE">
    <block type="math_number" id="{self._next_id()}"><field name="NUM">{value}</field></block>
  </value>
</block>'''
        
        return None
    
    def _time_to_ms(self, time_str: str) -> str:
        time_str = time_str.strip()
        match = re.match(r'T#(\d+)(MS|S|M|H)?', time_str, re.IGNORECASE)
        if match:
            value = int(match.group(1))
            unit = (match.group(2) or 'MS').upper()
            if unit == 'S':
                value *= 1000
            elif unit == 'M':
                value *= 60000
            elif unit == 'H':
                value *= 3600000
            return str(value)
        return time_str
