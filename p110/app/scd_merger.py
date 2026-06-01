from lxml import etree
from app.icd_parser import ICDParser

class SCDMerger:
    def __init__(self):
        self.ns = {
            'scl': 'http://www.iec.ch/61850/2003/SCL'
        }
        self.ieds = []
        self.communications = []
        self.data_type_templates = {}
        self.header = None
    
    def add_icd(self, xml_content, ied_name_override=None):
        parser = etree.XMLParser(remove_blank_text=True)
        root = etree.fromstring(xml_content.encode('utf-8'), parser)
        
        if self.header is None:
            header = root.find('scl:Header', self.ns)
            if header is not None:
                self.header = header
        
        ied = root.find('scl:IED', self.ns)
        if ied is not None:
            if ied_name_override:
                ied.set('name', ied_name_override)
            
            old_name = ied.get('name')
            if ied_name_override:
                old_name = ied.get('name')
            
            self.ieds.append(ied)
            
            comm = root.find('scl:Communication', self.ns)
            if comm is not None:
                for subnet in comm.findall('scl:SubNetwork', self.ns):
                    for cap in subnet.findall('scl:ConnectedAP', self.ns):
                        if ied_name_override and cap.get('iedName') == old_name:
                            cap.set('iedName', ied_name_override)
                    self.communications.append(subnet)
            
            dtt = root.find('scl:DataTypeTemplates', self.ns)
            if dtt is not None:
                self._merge_data_type_templates(dtt)
    
    def _merge_data_type_templates(self, dtt):
        for lnt in dtt.findall('scl:LNodeType', self.ns):
            lid = lnt.get('id')
            if lid not in self.data_type_templates:
                self.data_type_templates[('LNodeType', lid)] = lnt
        
        for dot in dtt.findall('scl:DOType', self.ns):
            did = dot.get('id')
            if ('DOType', did) not in self.data_type_templates:
                self.data_type_templates[('DOType', did)] = dot
        
        for dat in dtt.findall('scl:DAType', self.ns):
            did = dat.get('id')
            if ('DAType', did) not in self.data_type_templates:
                self.data_type_templates[('DAType', did)] = dat
        
        for ent in dtt.findall('scl:EnumType', self.ns):
            eid = ent.get('id')
            if ('EnumType', eid) not in self.data_type_templates:
                self.data_type_templates[('EnumType', eid)] = ent
    
    def generate_scd(self, scd_name='Merged_SCD'):
        nsmap = {None: 'http://www.iec.ch/61850/2003/SCL'}
        root = etree.Element('SCL', nsmap=nsmap)
        root.set('version', '2007')
        root.set('revision', 'B')
        root.set('release', '2')
        
        if self.header is not None:
            root.append(etree.ElementTree(self.header).getroot())
        else:
            header = etree.SubElement(root, 'Header')
            header.set('id', scd_name)
            header.set('nameStructure', 'IEC61850_6')
        
        comm_elem = etree.SubElement(root, 'Communication')
        subnets = {}
        for subnet in self.communications:
            name = subnet.get('name')
            if name not in subnets:
                new_subnet = etree.SubElement(comm_elem, 'SubNetwork')
                new_subnet.set('name', name)
                new_subnet.set('type', subnet.get('type', ''))
                subnets[name] = new_subnet
            
            for cap in subnet.findall('scl:ConnectedAP', self.ns):
                subnets[name].append(etree.ElementTree(cap).getroot())
        
        for ied in self.ieds:
            root.append(etree.ElementTree(ied).getroot())
        
        dtt_elem = etree.SubElement(root, 'DataTypeTemplates')
        for key, elem in self.data_type_templates.items():
            dtt_elem.append(etree.ElementTree(elem).getroot())
        
        return etree.tostring(
            root,
            encoding='UTF-8',
            xml_declaration=True,
            pretty_print=True
        ).decode('utf-8')
    
    def get_ied_list(self):
        ied_list = []
        for ied in self.ieds:
            ied_list.append({
                'name': ied.get('name'),
                'type': ied.get('type'),
                'manufacturer': ied.get('manufacturer'),
                'desc': ied.get('desc')
            })
        return ied_list
