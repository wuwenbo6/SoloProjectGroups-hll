from lxml import etree

class CIDGenerator:
    def __init__(self, xml_content):
        parser = etree.XMLParser(remove_blank_text=True)
        self.root = etree.fromstring(xml_content.encode('utf-8'), parser)
        self.ns = {
            'scl': 'http://www.iec.ch/61850/2003/SCL'
        }
        NSMAP = {None: 'http://www.iec.ch/61850/2003/SCL'}
        if self.root.nsmap:
            for prefix, uri in self.root.nsmap.items():
                if prefix:
                    etree.register_namespace(prefix, uri)
    
    def update_dai_value(self, ap_name, ld_inst, ln_class, ln_inst, do_name, da_name, new_value):
        xpath = (
            f"//scl:AccessPoint[@name='{ap_name}']"
            f"/scl:LDevice[@inst='{ld_inst}']"
            f"/scl:LN[@lnClass='{ln_class}'][@inst='{ln_inst}']"
            f"/scl:DOI[@name='{do_name}']"
            f"/scl:DAI[@name='{da_name}']"
            f"/scl:Val"
        )
        val_elem = self.root.xpath(xpath, namespaces=self.ns)
        if val_elem:
            val_elem[0].text = new_value
            return True
        return False
    
    def update_doi_desc(self, ap_name, ld_inst, ln_class, ln_inst, do_name, new_desc):
        xpath = (
            f"//scl:AccessPoint[@name='{ap_name}']"
            f"/scl:LDevice[@inst='{ld_inst}']"
            f"/scl:LN[@lnClass='{ln_class}'][@inst='{ln_inst}']"
            f"/scl:DOI[@name='{do_name}']"
        )
        doi_elem = self.root.xpath(xpath, namespaces=self.ns)
        if doi_elem:
            doi_elem[0].set('desc', new_desc)
            return True
        return False
    
    def update_ied_name(self, new_name):
        ied = self.root.find('scl:IED', self.ns)
        if ied is not None:
            old_name = ied.get('name')
            ied.set('name', new_name)
            
            for connected_ap in self.root.xpath('//scl:ConnectedAP', namespaces=self.ns):
                if connected_ap.get('iedName') == old_name:
                    connected_ap.set('iedName', new_name)
            
            return True
        return False
    
    def update_ied_desc(self, new_desc):
        ied = self.root.find('scl:IED', self.ns)
        if ied is not None:
            ied.set('desc', new_desc)
            return True
        return False
    
    def to_string(self, pretty_print=True):
        return etree.tostring(
            self.root,
            encoding='UTF-8',
            xml_declaration=True,
            pretty_print=pretty_print
        ).decode('utf-8')
    
    def apply_changes(self, changes):
        results = []
        for change in changes:
            change_type = change.get('type')
            try:
                if change_type == 'dai_value':
                    success = self.update_dai_value(
                        change['ap_name'],
                        change['ld_inst'],
                        change['ln_class'],
                        change['ln_inst'],
                        change['do_name'],
                        change['da_name'],
                        change['new_value']
                    )
                    results.append({'change': change, 'success': success})
                elif change_type == 'doi_desc':
                    success = self.update_doi_desc(
                        change['ap_name'],
                        change['ld_inst'],
                        change['ln_class'],
                        change['ln_inst'],
                        change['do_name'],
                        change['new_desc']
                    )
                    results.append({'change': change, 'success': success})
                elif change_type == 'ied_name':
                    success = self.update_ied_name(change['new_name'])
                    results.append({'change': change, 'success': success})
                elif change_type == 'ied_desc':
                    success = self.update_ied_desc(change['new_desc'])
                    results.append({'change': change, 'success': success})
            except Exception as e:
                results.append({'change': change, 'success': False, 'error': str(e)})
        return results
    
    def fix_duplicate_goose_appid(self):
        goose_appids = {}
        duplicates = []
        
        gse_elements = self.root.xpath('//scl:GSE', namespaces=self.ns)
        
        for gse in gse_elements:
            addr = gse.find('scl:Address', self.ns)
            if addr is not None:
                appid_elem = addr.xpath("scl:P[@type='APPID']", namespaces=self.ns)
                if appid_elem:
                    appid = appid_elem[0].text
                    if appid:
                        if appid in goose_appids:
                            duplicates.append((gse, appid_elem[0]))
                        else:
                            goose_appids[appid] = gse
        
        gse_controls = self.root.xpath('//scl:GSEControl', namespaces=self.ns)
        for gse in gse_controls:
            appid = gse.get('appID')
            if appid:
                if appid in goose_appids:
                    duplicates.append(('control', gse))
                else:
                    goose_appids[appid] = gse
        
        results = []
        for item in duplicates:
            if isinstance(item, tuple) and len(item) == 2:
                gse, appid_elem = item
                old_appid = appid_elem.text
                new_appid = self._generate_unique_appid(goose_appids)
                appid_elem.text = new_appid
                goose_appids[new_appid] = gse
                results.append({
                    'element': gse.get('cbName'),
                    'old_appid': old_appid,
                    'new_appid': new_appid
                })
            elif item[0] == 'control':
                gse = item[1]
                old_appid = gse.get('appID')
                new_appid = self._generate_unique_appid(goose_appids)
                gse.set('appID', new_appid)
                goose_appids[new_appid] = gse
                results.append({
                    'element': gse.get('name'),
                    'old_appid': old_appid,
                    'new_appid': new_appid
                })
        
        return results
    
    def _generate_unique_appid(self, existing_appids):
        base = 0x0001
        while True:
            candidate = '0x{:04X}'.format(base)
            if candidate not in existing_appids:
                return candidate
            base += 1
    
    def update_goose_appid(self, gse_name, new_appid):
        gse = self.root.xpath(f"//scl:GSEControl[@name='{gse_name}']", namespaces=self.ns)
        if gse:
            gse[0].set('appID', new_appid)
            return True
        return False
    
    def get_goose_configs(self):
        goose_configs = []
        
        gse_elements = self.root.xpath('//scl:GSE', namespaces=self.ns)
        for gse in gse_elements:
            appid = ''
            mac = ''
            addr = gse.find('scl:Address', self.ns)
            if addr is not None:
                appid_elem = addr.xpath("scl:P[@type='APPID']", namespaces=self.ns)
                if appid_elem:
                    appid = appid_elem[0].text
                mac_elem = addr.xpath("scl:P[@type='MAC']", namespaces=self.ns)
                if mac_elem:
                    mac = mac_elem[0].text
            
            goose_configs.append({
                'type': 'GSE',
                'name': gse.get('cbName'),
                'appID': appid,
                'mac': mac,
                'iedName': gse.get('iedName'),
                'apName': gse.get('apName'),
                'ldInst': gse.get('ldInst'),
                'lnClass': gse.get('lnClass'),
                'lnInst': gse.get('lnInst')
            })
        
        gse_controls = self.root.xpath('//scl:GSEControl', namespaces=self.ns)
        for gse in gse_controls:
            ln = gse.getparent()
            ld = ln.getparent() if ln is not None else None
            ap = ld.getparent() if ld is not None else None
            
            goose_configs.append({
                'type': 'GSEControl',
                'name': gse.get('name'),
                'appID': gse.get('appID'),
                'datSet': gse.get('datSet'),
                'confRev': gse.get('confRev'),
                'ln_class': ln.get('lnClass') if ln is not None else '',
                'ln_inst': ln.get('inst') if ln is not None else '',
                'ld_inst': ld.get('inst') if ld is not None else '',
                'ap_name': ap.get('name') if ap is not None else ''
            })
        
        return goose_configs
