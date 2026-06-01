import * as XLSX from 'xlsx';
import { MappingRule, ExcelParseResult } from '../../shared/types';

type ExcelColumn = 'deviceName' | 'registerType' | 'registerAddress' | 'dataType' | 'opcuaNodeId' | 'opcuaBrowseName' | 'description';

const COLUMN_MAPPINGS: Record<string, ExcelColumn> = {
  '设备名称': 'deviceName',
  'device': 'deviceName',
  'deviceName': 'deviceName',
  'device_name': 'deviceName',
  '寄存器类型': 'registerType',
  'registerType': 'registerType',
  'register_type': 'registerType',
  '类型': 'registerType',
  '寄存器地址': 'registerAddress',
  'address': 'registerAddress',
  'registerAddress': 'registerAddress',
  'register_address': 'registerAddress',
  '地址': 'registerAddress',
  '数据类型': 'dataType',
  'dataType': 'dataType',
  'data_type': 'dataType',
  'OPC节点ID': 'opcuaNodeId',
  'nodeId': 'opcuaNodeId',
  'opcuaNodeId': 'opcuaNodeId',
  'node_id': 'opcuaNodeId',
  'OPC浏览名称': 'opcuaBrowseName',
  'browseName': 'opcuaBrowseName',
  'opcuaBrowseName': 'opcuaBrowseName',
  'browse_name': 'opcuaBrowseName',
  '描述': 'description',
  'description': 'description',
  '备注': 'description',
};

const VALID_REGISTER_TYPES = new Set(['Coil', 'DiscreteInput', 'InputRegister', 'HoldingRegister', '线圈', '离散输入', '输入寄存器', '保持寄存器']);
const VALID_DATA_TYPES = new Set(['Boolean', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Float', 'Double', 'bool', 'int16', 'uint16', 'int32', 'uint32', 'float', 'double']);

const REGISTER_TYPE_PROPERTIES: Record<string, { readOnly: boolean; defaultDataType: string; description: string }> = {
  'Coil': { readOnly: false, defaultDataType: 'Boolean', description: '线圈，可读写布尔量' },
  'DiscreteInput': { readOnly: true, defaultDataType: 'Boolean', description: '离散输入，只读布尔量' },
  'InputRegister': { readOnly: true, defaultDataType: 'UInt16', description: '输入寄存器，只读16位数值，用于传感器数据采集' },
  'HoldingRegister': { readOnly: false, defaultDataType: 'UInt16', description: '保持寄存器，可读写16位数值，用于控制参数存储' },
};

const REGISTER_TYPE_CONFLICT_MAP: Record<string, string> = {
  'input': 'InputRegister',
  'holding': 'HoldingRegister',
  'coil': 'Coil',
  'discrete': 'DiscreteInput',
  'hr': 'HoldingRegister',
  'ir': 'InputRegister',
  '保持': 'HoldingRegister',
  '输入': 'InputRegister',
};

class ExcelService {
  public parseBuffer(buffer: Buffer): ExcelParseResult {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<any>(firstSheet, { defval: '' });

      if (jsonData.length === 0) {
        return {
          success: false,
          data: [],
          errors: ['Excel文件为空'],
        };
      }

      const headers = Object.keys(jsonData[0]);
      const columnMap = this.mapColumns(headers);
      const missingColumns = this.getMissingRequiredColumns(columnMap);

      if (missingColumns.length > 0) {
        return {
          success: false,
          data: [],
          errors: [`缺少必要列: ${missingColumns.join(', ')}`],
        };
      }

      const rules: MappingRule[] = [];
      const errors: string[] = [];

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rowNum = i + 2;

        try {
          const rule = this.parseRow(row, columnMap, rowNum);
          rules.push(rule);
        } catch (e) {
          errors.push(`第${rowNum}行: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return {
        success: errors.length === 0,
        data: rules,
        errors,
      };
    } catch (e) {
      return {
        success: false,
        data: [],
        errors: [`解析Excel文件失败: ${e instanceof Error ? e.message : String(e)}`],
      };
    }
  }

  private mapColumns(headers: string[]): Partial<Record<ExcelColumn, string>> {
    const result: Partial<Record<ExcelColumn, string>> = {};
    
    for (const header of headers) {
      const normalizedHeader = header.trim().toLowerCase();
      for (const [key, value] of Object.entries(COLUMN_MAPPINGS)) {
        if (normalizedHeader === key.toLowerCase()) {
          result[value] = header;
          break;
        }
      }
    }
    
    return result;
  }

  private getMissingRequiredColumns(columnMap: Partial<Record<ExcelColumn, string>>): string[] {
    const required: ExcelColumn[] = ['deviceName', 'registerType', 'registerAddress', 'dataType'];
    return required.filter(col => !columnMap[col]);
  }

  private parseRow(row: any, columnMap: Partial<Record<ExcelColumn, string>>, rowNum: number): MappingRule {
    const getValue = (col: ExcelColumn): string => {
      const header = columnMap[col];
      if (!header) return '';
      const value = row[header];
      return value !== undefined && value !== null ? String(value).trim() : '';
    };

    const deviceName = getValue('deviceName');
    if (!deviceName) {
      throw new Error('设备名称不能为空');
    }

    let registerType = this.normalizeRegisterType(getValue('registerType'));
    if (!VALID_REGISTER_TYPES.has(registerType)) {
      throw new Error(`无效的寄存器类型: ${getValue('registerType')}`);
    }

    const registerAddress = parseInt(getValue('registerAddress'), 10);
    if (isNaN(registerAddress) || registerAddress < 0) {
      throw new Error(`无效的寄存器地址: ${getValue('registerAddress')}`);
    }

    let dataType = this.normalizeDataType(getValue('dataType'), registerType);
    if (!VALID_DATA_TYPES.has(dataType)) {
      throw new Error(`无效的数据类型: ${getValue('dataType')}`);
    }

    this.validateRegisterTypeDataType(registerType, dataType);

    const opcuaNodeId = getValue('opcuaNodeId') || this.generateNodeId(deviceName, registerType, registerAddress);
    const opcuaBrowseName = getValue('opcuaBrowseName') || this.generateBrowseName(deviceName, registerType, registerAddress);
    const description = getValue('description');

    return {
      deviceName,
      registerType,
      registerAddress,
      dataType,
      opcuaNodeId,
      opcuaBrowseName,
      description,
    };
  }

  private normalizeRegisterType(type: string): string {
    const trimmedType = type.trim();
    
    const exactMap: Record<string, string> = {
      '线圈': 'Coil',
      '离散输入': 'DiscreteInput',
      '输入寄存器': 'InputRegister',
      '保持寄存器': 'HoldingRegister',
    };
    
    if (exactMap[trimmedType]) {
      return exactMap[trimmedType];
    }
    
    const lowerType = trimmedType.toLowerCase();
    if (REGISTER_TYPE_CONFLICT_MAP[lowerType]) {
      return REGISTER_TYPE_CONFLICT_MAP[lowerType];
    }
    
    if (lowerType.includes('holding') || lowerType.includes('保持')) {
      return 'HoldingRegister';
    }
    if (lowerType.includes('input') && lowerType.includes('register')) {
      return 'InputRegister';
    }
    if (lowerType.includes('input') && lowerType.includes('discrete')) {
      return 'DiscreteInput';
    }
    if (lowerType.includes('coil')) {
      return 'Coil';
    }
    
    return trimmedType;
  }

  private normalizeDataType(type: string, registerType?: string): string {
    const map: Record<string, string> = {
      'bool': 'Boolean',
      'int16': 'Int16',
      'uint16': 'UInt16',
      'int32': 'Int32',
      'uint32': 'UInt32',
      'float': 'Float',
      'double': 'Double',
    };
    
    const normalized = map[type] || type;
    
    if (registerType && REGISTER_TYPE_PROPERTIES[registerType]) {
      const props = REGISTER_TYPE_PROPERTIES[registerType];
      if ((registerType === 'Coil' || registerType === 'DiscreteInput') && normalized !== 'Boolean') {
        console.warn(`警告: ${registerType} 寄存器类型建议使用 Boolean 数据类型，当前使用: ${normalized}`);
      }
      if ((registerType === 'InputRegister' || registerType === 'HoldingRegister') && normalized === 'Boolean') {
        console.warn(`警告: ${registerType} 寄存器类型不建议使用 Boolean 数据类型，建议使用 UInt16/Int16/Float 等`);
      }
    }
    
    return normalized;
  }

  private generateNodeId(deviceName: string, registerType: string, address: number, suffix?: number): string {
    const base = `ns=1;s=${deviceName}.${registerType}.${address}`;
    return suffix ? `${base}_${suffix}` : base;
  }

  private generateBrowseName(deviceName: string, registerType: string, address: number, suffix?: number): string {
    const base = `${deviceName}_${registerType}_${address}`;
    return suffix ? `${base}_${suffix}` : base;
  }

  private validateRegisterTypeDataType(registerType: string, dataType: string): void {
    if (registerType === 'Coil' || registerType === 'DiscreteInput') {
      if (dataType !== 'Boolean') {
        throw new Error(`${REGISTER_TYPE_PROPERTIES[registerType].description}，必须使用 Boolean 数据类型`);
      }
    }
    if (registerType === 'InputRegister' || registerType === 'HoldingRegister') {
      if (dataType === 'Boolean') {
        throw new Error(`${REGISTER_TYPE_PROPERTIES[registerType].description}，不能使用 Boolean 数据类型`);
      }
    }
  }

  public getRegisterTypeInfo(type: string): { readOnly: boolean; defaultDataType: string; description: string } | null {
    const normalized = this.normalizeRegisterType(type);
    return REGISTER_TYPE_PROPERTIES[normalized] || null;
  }

  public generateTemplate(): Buffer {
    const data = [
      {
        '设备名称': 'PLC1',
        '寄存器类型': 'HoldingRegister',
        '寄存器地址': 0,
        '数据类型': 'Int16',
        'OPC节点ID': 'ns=1;s=PLC1.HoldingRegister.0',
        'OPC浏览名称': 'PLC1_HoldingRegister_0',
        '描述': '温度传感器',
      },
      {
        '设备名称': 'PLC1',
        '寄存器类型': 'HoldingRegister',
        '寄存器地址': 1,
        '数据类型': 'Float',
        'OPC节点ID': '',
        'OPC浏览名称': '',
        '描述': '压力传感器',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '映射规则');
    
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}

export const excelService = new ExcelService();
