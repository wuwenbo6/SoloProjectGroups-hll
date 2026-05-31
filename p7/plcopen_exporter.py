import xml.etree.ElementTree as ET
from xml.dom import minidom
from typing import Dict, Any, List
import uuid

class PLCopenExporter:
    def __init__(self):
        self.namespaces = {
            'http://www.plcopen.org/xml/tc6_0200': None
        }
    
    def export_to_xml(self, project_data: Dict[str, Any]) -> str:
        root = ET.Element('project', {
            'xmlns': 'http://www.plcopen.org/xml/tc6_0200',
            'xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
            'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            'name': project_data.get('name', 'LadderLogicProject')
        })
        
        file_header = ET.SubElement(root, 'fileHeader')
        file_header.set('companyName', 'Custom')
        file_header.set('productName', 'LadderLogicConverter')
        file_header.set('productVersion', '1.0')
        file_header.set('creationDateTime', project_data.get('created_at', ''))
        
        content_header = ET.SubElement(root, 'contentHeader')
        content_header.set('name', project_data.get('name', 'Project'))
        
        types = ET.SubElement(root, 'types')
        pous = ET.SubElement(types, 'pous')
        
        pou = ET.SubElement(pous, 'pou')
        pou.set('name', 'Main')
        pou.set('pouType', 'program')
        
        body = ET.SubElement(pou, 'body')
        st_body = ET.SubElement(body, 'ST')
        
        st_body.text = self._cdata(project_data.get('st_code', ''))
        
        instances = ET.SubElement(root, 'instances')
        
        self._add_configuration(root, project_data)
        
        return self._pretty_xml(root)
    
    def _cdata(self, text: str) -> str:
        return f'<![CDATA[{text}]]>' if text else ''
    
    def _add_configuration(self, root: ET.Element, project_data: Dict[str, Any]):
        configs = ET.SubElement(root, 'configurations')
        config = ET.SubElement(configs, 'configuration')
        config.set('name', 'Config1')
        
        resource = ET.SubElement(config, 'resource')
        resource.set('name', 'Resource1')
        
        task = ET.SubElement(resource, 'task')
        task.set('name', 'MainTask')
        task.set('interval', 'T#100MS')
        task.set('priority', '0')
        
        pou_instance = ET.SubElement(task, 'pouInstance')
        pou_instance.set('name', 'Main')
        pou_instance.set('typeName', 'Main')
    
    def _pretty_xml(self, element: ET.Element) -> str:
        rough_string = ET.tostring(element, 'utf-8')
        reparsed = minidom.parseString(rough_string)
        return reparsed.toprettyxml(indent='  ')

class FunctionBlockManager:
    def __init__(self):
        self.function_blocks = {
            'TON': {
                'name': 'TON',
                'inputs': [
                    {'name': 'IN', 'type': 'BOOL', 'default': 'FALSE'},
                    {'name': 'PT', 'type': 'TIME', 'default': 'T#0MS'}
                ],
                'outputs': [
                    {'name': 'Q', 'type': 'BOOL'},
                    {'name': 'ET', 'type': 'TIME'}
                ]
            },
            'TOF': {
                'name': 'TOF',
                'inputs': [
                    {'name': 'IN', 'type': 'BOOL', 'default': 'FALSE'},
                    {'name': 'PT', 'type': 'TIME', 'default': 'T#0MS'}
                ],
                'outputs': [
                    {'name': 'Q', 'type': 'BOOL'},
                    {'name': 'ET', 'type': 'TIME'}
                ]
            },
            'TP': {
                'name': 'TP',
                'inputs': [
                    {'name': 'IN', 'type': 'BOOL', 'default': 'FALSE'},
                    {'name': 'PT', 'type': 'TIME', 'default': 'T#0MS'}
                ],
                'outputs': [
                    {'name': 'Q', 'type': 'BOOL'},
                    {'name': 'ET', 'type': 'TIME'}
                ]
            },
            'CTU': {
                'name': 'CTU',
                'inputs': [
                    {'name': 'CU', 'type': 'BOOL', 'default': 'FALSE'},
                    {'name': 'R', 'type': 'BOOL', 'default': 'FALSE'},
                    {'name': 'PV', 'type': 'INT', 'default': '0'}
                ],
                'outputs': [
                    {'name': 'Q', 'type': 'BOOL'},
                    {'name': 'CV', 'type': 'INT'}
                ]
            },
            'CTD': {
                'name': 'CTD',
                'inputs': [
                    {'name': 'CD', 'type': 'BOOL', 'default': 'FALSE'},
                    {'name': 'LD', 'type': 'BOOL', 'default': 'FALSE'},
                    {'name': 'PV', 'type': 'INT', 'default': '0'}
                ],
                'outputs': [
                    {'name': 'Q', 'type': 'BOOL'},
                    {'name': 'CV', 'type': 'INT'}
                ]
            },
            'CTUD': {
                'name': 'CTUD',
                'inputs': [
                    {'name': 'CU', 'type': 'BOOL', 'default': 'FALSE'},
                    {'name': 'CD', 'type': 'BOOL', 'default': 'FALSE'},
                    {'name': 'R', 'type': 'BOOL', 'default': 'FALSE'},
                    {'name': 'LD', 'type': 'BOOL', 'default': 'FALSE'},
                    {'name': 'PV', 'type': 'INT', 'default': '0'}
                ],
                'outputs': [
                    {'name': 'QU', 'type': 'BOOL'},
                    {'name': 'QD', 'type': 'BOOL'},
                    {'name': 'CV', 'type': 'INT'}
                ]
            },
            'RS': {
                'name': 'RS',
                'inputs': [
                    {'name': 'SET', 'type': 'BOOL', 'default': 'FALSE'},
                    {'name': 'RESET', 'type': 'BOOL', 'default': 'FALSE'}
                ],
                'outputs': [
                    {'name': 'Q1', 'type': 'BOOL'}
                ]
            },
            'SR': {
                'name': 'SR',
                'inputs': [
                    {'name': 'SET', 'type': 'BOOL', 'default': 'FALSE'},
                    {'name': 'RESET', 'type': 'BOOL', 'default': 'FALSE'}
                ],
                'outputs': [
                    {'name': 'Q1', 'type': 'BOOL'}
                ]
            }
        }
        
        self.instances: Dict[str, Dict[str, Any]] = {}
    
    def get_function_block(self, fb_type: str) -> Dict[str, Any]:
        return self.function_blocks.get(fb_type)
    
    def list_function_blocks(self) -> List[str]:
        return list(self.function_blocks.keys())
    
    def create_instance(self, fb_type: str, instance_name: str) -> bool:
        if fb_type in self.function_blocks:
            self.instances[instance_name] = {
                'type': fb_type,
                'inputs': {},
                'outputs': {}
            }
            return True
        return False
    
    def get_instance(self, instance_name: str) -> Dict[str, Any]:
        return self.instances.get(instance_name)
    
    def generate_instance_declaration(self, instance_name: str) -> str:
        instance = self.instances.get(instance_name)
        if instance:
            return f"{instance_name}: {instance['type']};"
        return ''
    
    def generate_fb_call(self, instance_name: str, inputs: Dict[str, str]) -> str:
        instance = self.instances.get(instance_name)
        if not instance:
            return ''
        
        fb_def = self.function_blocks.get(instance['type'])
        if not fb_def:
            return ''
        
        params = []
        for input_def in fb_def['inputs']:
            name = input_def['name']
            value = inputs.get(name, input_def['default'])
            params.append(f"{name}:={value}")
        
        return f"{instance_name}({', '.join(params)});"
