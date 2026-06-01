from lxml import etree

class SVConfigManager:
    def __init__(self, xml_content):
        parser = etree.XMLParser(remove_blank_text=True)
        self.root = etree.fromstring(xml_content.encode('utf-8'), parser)
        self.ns = {
            'scl': 'http://www.iec.ch/61850/2003/SCL'
        }
    
    def get_sv_configs(self):
        sv_configs = []
        
        smv_elements = self.root.xpath('//scl:SMV', namespaces=self.ns)
        for smv in smv_elements:
            config = {
                'type': 'SMV',
                'cbName': smv.get('cbName'),
                'iedName': smv.get('iedName'),
                'apName': smv.get('apName'),
                'ldInst': smv.get('ldInst'),
                'lnClass': smv.get('lnClass'),
                'lnInst': smv.get('lnInst'),
                'appID': '',
                'macAddress': '',
                'vlanID': '',
                'vlanPriority': '',
                'smpRate': '',
                'smpMod': ''
            }
            
            addr = smv.find('scl:Address', self.ns)
            if addr is not None:
                appid = addr.xpath("scl:P[@type='APPID']", namespaces=self.ns)
                if appid:
                    config['appID'] = appid[0].text
                
                mac = addr.xpath("scl:P[@type='MAC']", namespaces=self.ns)
                if mac:
                    config['macAddress'] = mac[0].text
                
                vlan = addr.xpath("scl:P[@type='VLAN-ID']", namespaces=self.ns)
                if vlan:
                    config['vlanID'] = vlan[0].text
                
                vlan_prio = addr.xpath("scl:P[@type='VLAN-PRIORITY']", namespaces=self.ns)
                if vlan_prio:
                    config['vlanPriority'] = vlan_prio[0].text
            
            sv_configs.append(config)
        
        smv_controls = self.root.xpath('//scl:SampledValueControl', namespaces=self.ns)
        for svc in smv_controls:
            ln = svc.getparent()
            ld = ln.getparent() if ln is not None else None
            ap = ld.getparent() if ld is not None else None
            
            config = {
                'type': 'SampledValueControl',
                'name': svc.get('name'),
                'datSet': svc.get('datSet'),
                'confRev': svc.get('confRev'),
                'smpRate': svc.get('smpRate', ''),
                'smpMod': svc.get('smpMod', ''),
                'ln_class': ln.get('lnClass') if ln is not None else '',
                'ln_inst': ln.get('inst') if ln is not None else '',
                'ld_inst': ld.get('inst') if ld is not None else '',
                'ap_name': ap.get('name') if ap is not None else ''
            }
            sv_configs.append(config)
        
        return sv_configs
    
    def update_sv_smp_rate(self, svc_name, new_rate):
        svc = self.root.xpath(f"//scl:SampledValueControl[@name='{svc_name}']", namespaces=self.ns)
        if svc:
            svc[0].set('smpRate', str(new_rate))
            return True
        return False
    
    def update_sv_smp_mod(self, svc_name, new_mod):
        svc = self.root.xpath(f"//scl:SampledValueControl[@name='{svc_name}']", namespaces=self.ns)
        if svc:
            svc[0].set('smpMod', new_mod)
            return True
        return False
    
    def update_smv_appid(self, cb_name, new_appid):
        smv = self.root.xpath(f"//scl:SMV[@cbName='{cb_name}']", namespaces=self.ns)
        if smv:
            addr = smv[0].find('scl:Address', self.ns)
            if addr is not None:
                appid = addr.xpath("scl:P[@type='APPID']", namespaces=self.ns)
                if appid:
                    appid[0].text = new_appid
                    return True
        return False
    
    def get_smp_rate_options(self):
        return [
            {'value': '80', 'label': '80 samples/period (4000 Hz)'},
            {'value': '256', 'label': '256 samples/period (12800 Hz)'},
            {'value': '100', 'label': '100 samples/period (5000 Hz)'},
            {'value': '200', 'label': '200 samples/period (10000 Hz)'},
            {'value': '48', 'label': '48 samples/period (2400 Hz)'}
        ]
    
    def get_smp_mod_options(self):
        return [
            {'value': 'SmpPerPeriod', 'label': 'Samples per period'},
            {'value': 'SmpPerSec', 'label': 'Samples per second'},
            {'value': 'SecPerSmp', 'label': 'Seconds per sample'}
        ]
    
    def to_string(self):
        return etree.tostring(
            self.root,
            encoding='UTF-8',
            xml_declaration=True,
            pretty_print=True
        ).decode('utf-8')
