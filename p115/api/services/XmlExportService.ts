import { mappingService } from './MappingService';
import { configService } from './ConfigService';
import { MappingRule, XmlExportConfig } from '../../shared/types';

class XmlExportService {
  public exportXml(includeDescription: boolean = true): string {
    const rules = mappingService.getAllRules();
    const config = configService.getConfig();
    const devices = this.groupByDevice(rules);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<?xml-stylesheet type="text/xsl" href="modbus_opcua_config.xsl"?>\n';
    xml += '<ModbusOpcuaConfig xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n';
    xml += '    xsi:noNamespaceSchemaLocation="modbus_opcua_config.xsd">\n';
    
    xml += this.buildServerConfigXml(config);
    xml += this.buildDevicesXml(devices, includeDescription);
    
    xml += '</ModbusOpcuaConfig>';
    
    return xml;
  }

  public exportCsv(includeDescription: boolean = true): string {
    const rules = mappingService.getAllRules();
    const headers = ['设备名称', '寄存器类型', '寄存器地址', '数据类型', 'OPC节点ID', 'OPC浏览名称'];
    if (includeDescription) {
      headers.push('描述');
    }

    const lines = [headers.join(',')];

    for (const rule of rules) {
      const row = [
        this.escapeCsv(rule.deviceName),
        this.escapeCsv(rule.registerType),
        rule.registerAddress.toString(),
        this.escapeCsv(rule.dataType),
        this.escapeCsv(rule.opcuaNodeId),
        this.escapeCsv(rule.opcuaBrowseName),
      ];
      if (includeDescription) {
        row.push(this.escapeCsv(rule.description || ''));
      }
      lines.push(row.join(','));
    }

    return lines.join('\n');
  }

  public exportJson(): string {
    const rules = mappingService.getAllRules();
    const config = configService.getConfig();
    
    const exportData = {
      exportTime: new Date().toISOString(),
      version: '1.0.0',
      server: {
        opcuaPort: config.opcuaPort,
        opcuaEndpoint: config.opcuaEndpoint,
      },
      mappingRules: rules.map(rule => ({
        id: rule.id,
        deviceName: rule.deviceName,
        registerType: rule.registerType,
        registerAddress: rule.registerAddress,
        dataType: rule.dataType,
        opcuaNodeId: rule.opcuaNodeId,
        opcuaBrowseName: rule.opcuaBrowseName,
        description: rule.description,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  }

  public exportToFormat(format: 'xml' | 'csv' | 'json', config?: XmlExportConfig): { content: string; filename: string; mimeType: string } {
    switch (format) {
      case 'xml':
        return {
          content: this.exportXml(config?.includeDescription ?? true),
          filename: `modbus_opcua_config_${Date.now()}.xml`,
          mimeType: 'application/xml',
        };
      case 'csv':
        return {
          content: this.exportCsv(config?.includeDescription ?? true),
          filename: `modbus_opcua_config_${Date.now()}.csv`,
          mimeType: 'text/csv',
        };
      case 'json':
        return {
          content: this.exportJson(),
          filename: `modbus_opcua_config_${Date.now()}.json`,
          mimeType: 'application/json',
        };
      default:
        throw new Error(`不支持的格式: ${format}`);
    }
  }

  private buildServerConfigXml(config: ReturnType<typeof configService.getConfig>): string {
    let xml = '  <ServerConfig>\n';
    xml += `    <OpcuaPort>${config.opcuaPort}</OpcuaPort>\n`;
    xml += `    <OpcuaEndpoint>${config.opcuaEndpoint}</OpcuaEndpoint>\n`;
    xml += `    <AutoStart>${config.autoStart}</AutoStart>\n`;
    xml += '  </ServerConfig>\n';
    return xml;
  }

  private buildDevicesXml(devices: Map<string, MappingRule[]>, includeDescription: boolean): string {
    let xml = '  <Devices>\n';

    for (const [deviceName, rules] of devices) {
      xml += `    <Device name="${deviceName}">\n`;
      
      const registerTypes = this.groupByRegisterType(rules);
      
      for (const [registerType, typeRules] of registerTypes) {
        xml += `      <RegisterType type="${registerType}">\n`;
        
        for (const rule of typeRules) {
          xml += `        <Variable`;
          xml += ` address="${rule.registerAddress}"`;
          xml += ` dataType="${rule.dataType}"`;
          xml += ` nodeId="${rule.opcuaNodeId}"`;
          xml += ` browseName="${rule.opcuaBrowseName}"`;
          if (includeDescription && rule.description) {
            xml += ` description="${this.escapeXml(rule.description)}"`;
          }
          xml += ' />\n';
        }
        
        xml += '      </RegisterType>\n';
      }
      
      xml += '    </Device>\n';
    }

    xml += '  </Devices>\n';
    return xml;
  }

  private groupByDevice(rules: MappingRule[]): Map<string, MappingRule[]> {
    const deviceMap = new Map<string, MappingRule[]>();
    
    for (const rule of rules) {
      if (!deviceMap.has(rule.deviceName)) {
        deviceMap.set(rule.deviceName, []);
      }
      deviceMap.get(rule.deviceName)!.push(rule);
    }
    
    return deviceMap;
  }

  private groupByRegisterType(rules: MappingRule[]): Map<string, MappingRule[]> {
    const typeMap = new Map<string, MappingRule[]>();
    
    for (const rule of rules) {
      if (!typeMap.has(rule.registerType)) {
        typeMap.set(rule.registerType, []);
      }
      typeMap.get(rule.registerType)!.push(rule);
    }
    
    return typeMap;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private escapeCsv(str: string): string {
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
}

export const xmlExportService = new XmlExportService();
