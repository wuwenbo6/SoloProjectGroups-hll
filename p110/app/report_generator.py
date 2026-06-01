from lxml import etree
from datetime import datetime

class ReportGenerator:
    def __init__(self, xml_content):
        parser = etree.XMLParser(remove_blank_text=True)
        self.root = etree.fromstring(xml_content.encode('utf-8'), parser)
        self.ns = {
            'scl': 'http://www.iec.ch/61850/2003/SCL'
        }
    
    def generate_html_report(self):
        ied_info = self._get_ied_info()
        ln_list = self._get_logical_nodes()
        do_count = self._get_data_object_count()
        goose_configs = self._get_goose_configs()
        sv_configs = self._get_sv_configs()
        comm_info = self._get_communication_info()
        
        html = f"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>IED配置报告 - {ied_info.get('name', 'Unknown')}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }}
        .container {{ max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        h1 {{ color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }}
        h2 {{ color: #34495e; margin-top: 30px; border-left: 4px solid #3498db; padding-left: 10px; }}
        h3 {{ color: #555; }}
        table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
        th {{ background: #3498db; color: white; }}
        tr:hover {{ background: #f8f9fa; }}
        .info-box {{ background: #e8f4f8; padding: 15px; border-radius: 6px; margin: 10px 0; }}
        .info-label {{ font-weight: bold; color: #2c3e50; min-width: 120px; display: inline-block; }}
        .summary {{ display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }}
        .summary-card {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; min-width: 150px; text-align: center; }}
        .summary-number {{ font-size: 2em; font-weight: bold; }}
        .summary-label {{ font-size: 0.9em; opacity: 0.9; }}
        .footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #7f8c8d; font-size: 0.9em; }}
        .ln-item {{ background: #f8f9fa; margin: 10px 0; padding: 15px; border-radius: 6px; border-left: 4px solid #27ae60; }}
        .ln0 {{ border-left-color: #9b59b6; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>📋 IED 配置报告</h1>
        
        <div class="info-box">
            <h3>基本信息</h3>
            <p><span class="info-label">IED 名称:</span> {ied_info.get('name', '-')}</p>
            <p><span class="info-label">类型:</span> {ied_info.get('type', '-')}</p>
            <p><span class="info-label">制造商:</span> {ied_info.get('manufacturer', '-')}</p>
            <p><span class="info-label">描述:</span> {ied_info.get('desc', '-')}</p>
        </div>
        
        <div class="summary">
            <div class="summary-card">
                <div class="summary-number">{len(ln_list)}</div>
                <div class="summary-label">逻辑节点</div>
            </div>
            <div class="summary-card">
                <div class="summary-number">{do_count}</div>
                <div class="summary-label">数据对象</div>
            </div>
            <div class="summary-card">
                <div class="summary-number">{len(goose_configs)}</div>
                <div class="summary-label">GOOSE配置</div>
            </div>
            <div class="summary-card">
                <div class="summary-number">{len(sv_configs)}</div>
                <div class="summary-label">SV配置</div>
            </div>
        </div>
        
        <h2>🔌 通信配置</h2>
        <table>
            <tr>
                <th>子网名称</th>
                <th>类型</th>
                <th>访问点</th>
                <th>连接信息</th>
            </tr>
            {comm_info}
        </table>
        
        <h2>🧩 逻辑节点列表</h2>
        {ln_list}
        
        <h2>🦢 GOOSE 配置</h2>
        {goose_configs if goose_configs else '<p>暂无GOOSE配置</p>'}
        
        <h2>📊 SV 采样值配置</h2>
        {sv_configs if sv_configs else '<p>暂无SV配置</p>'}
        
        <div class="footer">
            <p>报告生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
            <p>IEC 61850 ICD/CID 配置报告</p>
        </div>
    </div>
</body>
</html>
        """
        return html
    
    def _get_ied_info(self):
        ied = self.root.find('scl:IED', self.ns)
        if ied is None:
            return {}
        return {
            'name': ied.get('name', ''),
            'type': ied.get('type', ''),
            'manufacturer': ied.get('manufacturer', ''),
            'desc': ied.get('desc', '')
        }
    
    def _get_logical_nodes(self):
        ln_html = ''
        ied = self.root.find('scl:IED', self.ns)
        if ied is None:
            return ln_html
        
        for ap in ied.findall('.//scl:AccessPoint', self.ns):
            for ld in ap.findall('.//scl:LDevice', self.ns):
                ln0 = ld.find('scl:LN0', self.ns)
                if ln0 is not None:
                    do_count = len(ln0.findall('scl:DOI', self.ns))
                    ln_class = ln0.get('lnClass', '')
                    ln_inst = ln0.get('inst', '')
                    ln_type = ln0.get('lnType', '')
                    ln_html += f"""
                    <div class="ln-item ln0">
                        <h4>🎯 {ln_class} (LN0)</h4>
                        <p><span class="info-label">实例:</span> {ln_inst}</p>
                        <p><span class="info-label">类型:</span> {ln_type}</p>
                        <p><span class="info-label">数据对象数:</span> {do_count}</p>
                    </div>
                    """
                
                for ln in ld.findall('scl:LN', self.ns):
                    do_count = len(ln.findall('scl:DOI', self.ns))
                    ln_class = ln.get('lnClass', '')
                    ln_inst = ln.get('inst', '')
                    ln_type = ln.get('lnType', '')
                    ln_desc = ln.get('desc', '')
                    ln_html += f"""
                    <div class="ln-item">
                        <h4>🔧 {ln_class}.{ln_inst}</h4>
                        <p><span class="info-label">描述:</span> {ln_desc}</p>
                        <p><span class="info-label">类型:</span> {ln_type}</p>
                        <p><span class="info-label">数据对象数:</span> {do_count}</p>
                    </div>
                    """
        
        return ln_html
    
    def _get_data_object_count(self):
        return len(self.root.findall('.//scl:DOI', self.ns))
    
    def _get_goose_configs(self):
        goose_html = ''
        gse_list = self.root.findall('.//scl:GSE', self.ns)
        
        if not gse_list:
            return goose_html
        
        goose_html += '<table><tr><th>名称</th><th>AppID</th><th>MAC地址</th><th>LN</th></tr>'
        for gse in gse_list:
            name = gse.get('cbName', '-')
            ln_class = gse.get('lnClass', '-')
            ln_inst = gse.get('lnInst', '-')
            
            appid = '-'
            mac = '-'
            addr = gse.find('scl:Address', self.ns)
            if addr is not None:
                appid_elem = addr.xpath("scl:P[@type='APPID']", namespaces=self.ns)
                if appid_elem:
                    appid = appid_elem[0].text
                mac_elem = addr.xpath("scl:P[@type='MAC']", namespaces=self.ns)
                if mac_elem:
                    mac = mac_elem[0].text
            
            goose_html += f'<tr><td>{name}</td><td><code>{appid}</code></td><td><code>{mac}</code></td><td>{ln_class}.{ln_inst}</td></tr>'
        
        goose_html += '</table>'
        return goose_html
    
    def _get_sv_configs(self):
        sv_html = ''
        smv_list = self.root.findall('.//scl:SMV', self.ns)
        
        if not smv_list:
            return sv_html
        
        sv_html += '<table><tr><th>名称</th><th>AppID</th><th>MAC地址</th><th>LN</th></tr>'
        for smv in smv_list:
            name = smv.get('cbName', '-')
            ln_class = smv.get('lnClass', '-')
            ln_inst = smv.get('lnInst', '-')
            
            appid = '-'
            mac = '-'
            addr = smv.find('scl:Address', self.ns)
            if addr is not None:
                appid_elem = addr.xpath("scl:P[@type='APPID']", namespaces=self.ns)
                if appid_elem:
                    appid = appid_elem[0].text
                mac_elem = addr.xpath("scl:P[@type='MAC']", namespaces=self.ns)
                if mac_elem:
                    mac = mac_elem[0].text
            
            sv_html += f'<tr><td>{name}</td><td><code>{appid}</code></td><td><code>{mac}</code></td><td>{ln_class}.{ln_inst}</td></tr>'
        
        sv_html += '</table>'
        return sv_html
    
    def _get_communication_info(self):
        comm_html = ''
        comm = self.root.find('scl:Communication', self.ns)
        if comm is None:
            return '<tr><td colspan="4">暂无通信配置</td></tr>'
        
        for subnet in comm.findall('scl:SubNetwork', self.ns):
            name = subnet.get('name', '-')
            stype = subnet.get('type', '-')
            
            for cap in subnet.findall('scl:ConnectedAP', self.ns):
                ap_name = cap.get('apName', '-')
                ied_name = cap.get('iedName', '-')
                
                addr_info = []
                addr = cap.find('scl:Address', self.ns)
                if addr is not None:
                    for p in addr.findall('scl:P', self.ns):
                        addr_info.append(f"{p.get('type')}: {p.text}")
                
                conn_info = ', '.join(addr_info) if addr_info else '-'
                comm_html += f'<tr><td>{name}</td><td>{stype}</td><td>{ied_name}/{ap_name}</td><td>{conn_info}</td>'
        
        return comm_html
    
    def generate_text_report(self):
        ied_info = self._get_ied_info()
        ln_count = len(self.root.findall('.//scl:LN', self.ns)) + len(self.root.findall('.//scl:LN0', self.ns))
        do_count = self._get_data_object_count()
        
        report = f"""
{'='*60}
           IEC 61850 ICD/CID 配置报告
{'='*60}

生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

【IED基本信息】
  名称:         {ied_info.get('name', '-')}
  类型:         {ied_info.get('type', '-')}
  制造商:       {ied_info.get('manufacturer', '-')}
  描述:         {ied_info.get('desc', '-')}

【统计摘要】
  逻辑节点数:   {ln_count}
  数据对象数:   {do_count}

{'='*60}
"""
        return report
