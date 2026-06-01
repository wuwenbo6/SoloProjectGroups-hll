from lxml import etree
import json

class ICDParser:
    def __init__(self, xml_content):
        self.xml_content = xml_content
        self.root = etree.fromstring(xml_content.encode('utf-8'))
        self.ns = {
            'scl': 'http://www.iec.ch/61850/2003/SCL'
        }
    
    def parse(self):
        result = {
            'header': self._parse_header(),
            'ied': self._parse_ied(),
            'communication': self._parse_communication(),
            'data_type_templates': self._parse_data_type_templates()
        }
        return result
    
    def _parse_header(self):
        header = self.root.find('scl:Header', self.ns)
        if header is None:
            return {}
        return {
            'id': header.get('id'),
            'version': header.get('version'),
            'revision': header.get('revision'),
            'nameStructure': header.get('nameStructure')
        }
    
    def _parse_ied(self):
        ied = self.root.find('scl:IED', self.ns)
        if ied is None:
            return {}
        
        result = {
            'name': ied.get('name'),
            'type': ied.get('type'),
            'manufacturer': ied.get('manufacturer'),
            'desc': ied.get('desc'),
            'access_points': []
        }
        
        for ap in ied.findall('scl:AccessPoint', self.ns):
            ap_data = {
                'name': ap.get('name'),
                'ldevices': []
            }
            
            for ld in ap.findall('scl:LDevice', self.ns):
                ld_data = {
                    'inst': ld.get('inst'),
                    'ldName': ld.get('ldName'),
                    'ln0': self._parse_ln0(ld),
                    'logical_nodes': self._parse_logical_nodes(ld)
                }
                ap_data['ldevices'].append(ld_data)
            
            result['access_points'].append(ap_data)
        
        return result
    
    def _parse_ln0(self, ld):
        ln0 = ld.find('scl:LN0', self.ns)
        if ln0 is None:
            return None
        
        return {
            'prefix': ln0.get('prefix', ''),
            'lnClass': ln0.get('lnClass'),
            'inst': ln0.get('inst'),
            'lnType': ln0.get('lnType'),
            'desc': ln0.get('desc'),
            'data_objects': self._parse_data_objects(ln0)
        }
    
    def _parse_logical_nodes(self, ld):
        lns = []
        for ln in ld.findall('scl:LN', self.ns):
            ln_data = {
                'prefix': ln.get('prefix', ''),
                'lnClass': ln.get('lnClass'),
                'inst': ln.get('inst'),
                'lnType': ln.get('lnType'),
                'desc': ln.get('desc'),
                'data_objects': self._parse_data_objects(ln)
            }
            lns.append(ln_data)
        return lns
    
    def _parse_data_objects(self, parent):
        do_list = []
        for doi in parent.findall('scl:DOI', self.ns):
            do_data = {
                'name': doi.get('name'),
                'desc': doi.get('desc'),
                'data_attributes': self._parse_data_attributes(doi)
            }
            do_list.append(do_data)
        return do_list
    
    def _parse_data_attributes(self, doi):
        da_list = []
        for dai in doi.findall('scl:DAI', self.ns):
            da_data = {
                'name': dai.get('name'),
                'value': self._get_dai_value(dai),
                'sAddr': dai.get('sAddr')
            }
            da_list.append(da_data)
        return da_list
    
    def _get_dai_value(self, dai):
        val = dai.find('scl:Val', self.ns)
        if val is not None:
            return val.text
        return None
    
    def _parse_communication(self):
        comm = self.root.find('scl:Communication', self.ns)
        if comm is None:
            return []
        
        subnets = []
        for subnet in comm.findall('scl:SubNetwork', self.ns):
            subnet_data = {
                'name': subnet.get('name'),
                'type': subnet.get('type'),
                'connected_aps': []
            }
            
            for ap in subnet.findall('scl:ConnectedAP', self.ns):
                ap_data = {
                    'iedName': ap.get('iedName'),
                    'apName': ap.get('apName')
                }
                subnet_data['connected_aps'].append(ap_data)
            
            subnets.append(subnet_data)
        
        return subnets
    
    def _parse_data_type_templates(self):
        dtt = self.root.find('scl:DataTypeTemplates', self.ns)
        if dtt is None:
            return {}
        
        return {
            'ln_types': self._parse_ln_types(dtt),
            'do_types': self._parse_do_types(dtt),
            'da_types': self._parse_da_types(dtt),
            'enum_types': self._parse_enum_types(dtt)
        }
    
    def _parse_ln_types(self, dtt):
        ln_types = []
        for lnt in dtt.findall('scl:LNodeType', self.ns):
            ln_type_data = {
                'id': lnt.get('id'),
                'lnClass': lnt.get('lnClass'),
                'data_objects': []
            }
            
            for do in lnt.findall('scl:DO', self.ns):
                do_data = {
                    'name': do.get('name'),
                    'type': do.get('type'),
                    'desc': do.get('desc'),
                    'transient': do.get('transient')
                }
                ln_type_data['data_objects'].append(do_data)
            
            ln_types.append(ln_type_data)
        return ln_types
    
    def _parse_do_types(self, dtt):
        do_types = []
        for dot in dtt.findall('scl:DOType', self.ns):
            do_type_data = {
                'id': dot.get('id'),
                'cdc': dot.get('cdc'),
                'data_attributes': []
            }
            
            for da in dot.findall('scl:DA', self.ns):
                da_data = {
                    'name': da.get('name'),
                    'type': da.get('type'),
                    'bType': da.get('bType'),
                    'fc': da.get('fc'),
                    'desc': da.get('desc')
                }
                do_type_data['data_attributes'].append(da_data)
            
            do_types.append(do_type_data)
        return do_types
    
    def _parse_da_types(self, dtt):
        da_types = []
        for dat in dtt.findall('scl:DAType', self.ns):
            da_type_data = {
                'id': dat.get('id'),
                'attributes': []
            }
            
            for da in dat.findall('scl:BDA', self.ns):
                bda_data = {
                    'name': da.get('name'),
                    'type': da.get('type'),
                    'bType': da.get('bType')
                }
                da_type_data['attributes'].append(bda_data)
            
            da_types.append(da_type_data)
        return da_types
    
    def _parse_enum_types(self, dtt):
        enum_types = []
        for ent in dtt.findall('scl:EnumType', self.ns):
            enum_type_data = {
                'id': ent.get('id'),
                'values': []
            }
            
            for val in ent.findall('scl:EnumVal', self.ns):
                enum_val = {
                    'ord': val.get('ord'),
                    'value': val.text
                }
                enum_type_data['values'].append(enum_val)
            
            enum_types.append(enum_type_data)
        return enum_types


def validate_icd(xml_content):
    try:
        root = etree.fromstring(xml_content.encode('utf-8'))
        
        if root.tag != 'SCL' and 'SCL' not in root.tag:
            return False, 'Root element must be SCL'
        
        ied = root.find('.//{*}IED')
        if ied is None:
            return False, 'No IED element found'
        
        return True, 'Valid ICD file'
    except etree.XMLSyntaxError as e:
        return False, f'XML syntax error: {str(e)}'
    except Exception as e:
        return False, f'Validation error: {str(e)}'
