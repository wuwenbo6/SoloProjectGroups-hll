
import { EsiConfig, PdoEntry, ValidationResult, ValidationError, SlaveInfo } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { XMLValidator } from 'fast-xml-parser';
import { generateEsiXml } from './esiGenerator';

const createError = (
  severity: 'error' | 'warning' | 'info',
  code: string,
  message: string,
  suggestion?: string,
  location?: { line?: number; column?: number; xpath?: string }
): ValidationError => ({
  id: uuidv4(),
  severity,
  code,
  message,
  suggestion,
  location,
});

export const validateSlaveInfo = (slaveInfo: SlaveInfo): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!slaveInfo.vendorId || !slaveInfo.vendorId.match(/^0x[0-9A-Fa-f]{8}$/)) {
    errors.push(
      createError(
        'error',
        'VENDOR_ID_INVALID',
        '厂商ID格式无效，应为0x开头的8位十六进制数',
        '例如：0x00000001'
      )
    );
  }

  if (!slaveInfo.productCode || !slaveInfo.productCode.match(/^0x[0-9A-Fa-f]{8}$/)) {
    errors.push(
      createError(
        'error',
        'PRODUCT_CODE_INVALID',
        '产品代码格式无效，应为0x开头的8位十六进制数',
        '例如：0x00000001'
      )
    );
  }

  if (!slaveInfo.revisionNo || !slaveInfo.revisionNo.match(/^0x[0-9A-Fa-f]{8}$/)) {
    errors.push(
      createError(
        'error',
        'REVISION_NO_INVALID',
        '版本号格式无效，应为0x开头的8位十六进制数',
        '例如：0x00010000'
      )
    );
  }

  if (!slaveInfo.slaveName || slaveInfo.slaveName.trim().length === 0) {
    errors.push(
      createError(
        'error',
        'SLAVE_NAME_EMPTY',
        '从站名称不能为空',
        '请输入有效的从站名称'
      )
    );
  }

  if (!slaveInfo.vendorName || slaveInfo.vendorName.trim().length === 0) {
    errors.push(
      createError(
        'warning',
        'VENDOR_NAME_EMPTY',
        '厂商名称为空',
        '建议填写厂商名称'
      )
    );
  }

  if (!slaveInfo.productName || slaveInfo.productName.trim().length === 0) {
    errors.push(
      createError(
        'warning',
        'PRODUCT_NAME_EMPTY',
        '产品名称为空',
        '建议填写产品名称'
      )
    );
  }

  return errors;
};

export const validatePdoEntries = (entries: PdoEntry[], type: 'TxPDO' | 'RxPDO'): ValidationError[] => {
  const errors: ValidationError[] = [];
  const entryMap = new Map<string, PdoEntry>();

  entries.forEach((entry, index) => {
    const key = `${entry.index}:${entry.subIndex}`;

    if (entryMap.has(key)) {
      errors.push(
        createError(
          'error',
          'PDO_DUPLICATE_ENTRY',
          `${type}中存在重复的PDO条目: 索引0x${entry.index.toString(16).padStart(4, '0')}:${entry.subIndex.toString(16).padStart(2, '0')}`,
          '请删除重复的PDO条目',
          { xpath: `//${type}[${index + 1}]` }
        )
      );
    }
    entryMap.set(key, entry);

    if (entry.index < 0x1000 || entry.index > 0xFFFF) {
      errors.push(
        createError(
          'error',
          'PDO_INDEX_INVALID',
          `PDO条目索引无效: 0x${entry.index.toString(16).padStart(4, '0')}`,
          '索引应在0x1000到0xFFFF之间',
          { xpath: `//${type}[${index + 1}]/Index` }
        )
      );
    }

    if (entry.subIndex < 0x00 || entry.subIndex > 0xFF) {
      errors.push(
        createError(
          'error',
          'PDO_SUBINDEX_INVALID',
          `PDO条子索引无效: 0x${entry.subIndex.toString(16).padStart(2, '0')}`,
          '子索引应在0x00到0xFF之间',
          { xpath: `//${type}[${index + 1}]/SubIndex` }
        )
      );
    }

    if (!entry.name || entry.name.trim().length === 0) {
      errors.push(
        createError(
          'error',
          'PDO_NAME_EMPTY',
          'PDO条目名称不能为空',
          '请输入PDO条目名称',
          { xpath: `//${type}[${index + 1}]/Name` }
        )
      );
    }

    if (entry.bitLength <= 0) {
      errors.push(
        createError(
          'error',
          'PDO_BITLENGTH_INVALID',
          `PDO条目位长度无效: ${entry.bitLength}`,
          '位长度必须大于0',
          { xpath: `//${type}[${index + 1}]/BitLength` }
        )
      );
    }

    if (entry.bitLength > 64) {
      errors.push(
        createError(
          'warning',
          'PDO_BITLENGTH_LARGE',
          `PDO条目位长度较大: ${entry.bitLength}位`,
          '考虑是否需要这么大的数据类型',
          { xpath: `//${type}[${index + 1}]/BitLength` }
        )
      );
    }
  });

  const totalBits = entries.reduce((sum, entry) => sum + entry.bitLength, 0);
  const totalBytes = Math.ceil(totalBits / 8);

  if (totalBytes > 128) {
    errors.push(
      createError(
        'error',
        'PDO_SIZE_EXCEEDED',
        `${type}总大小超过限制: ${totalBytes}字节 (最大128字节)`,
        '请减少PDO条目数量或使用更小的数据类型'
      )
    );
  } else if (totalBytes > 100) {
    errors.push(
      createError(
        'warning',
        'PDO_SIZE_LARGE',
        `${type}大小较大: ${totalBytes}字节`,
        '建议保持在100字节以内以确保兼容性'
      )
    );
  }

  return errors;
};

export const validateXmlStructure = (xml: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  try {
    const result = XMLValidator.validate(xml);
    
    if (result !== true) {
      if (result.err) {
        errors.push(
          createError(
            'error',
            'XML_SYNTAX_ERROR',
            `XML语法错误: ${result.err.msg}`,
            '请检查XML语法是否正确',
            { line: result.err.line, column: result.err.col }
          )
        );
      }
    }
  } catch (err) {
    errors.push(
      createError(
        'error',
        'XML_PARSE_ERROR',
        'XML解析失败',
        '请确保XML格式正确'
      )
    );
  }

  if (!xml.includes('<EtherCATInfo')) {
    errors.push(
      createError(
        'error',
        'ESI_ROOT_ELEMENT_MISSING',
        '缺少EtherCATInfo根元素',
        'ESI文件必须以EtherCATInfo为根元素'
      )
    );
  }

  if (!xml.includes('<Vendor>')) {
    errors.push(
      createError(
        'error',
        'ESI_VENDOR_MISSING',
        '缺少Vendor元素',
        'ESI文件必须包含Vendor信息'
      )
    );
  }

  if (!xml.includes('<Descriptions>')) {
    errors.push(
      createError(
        'warning',
        'ESI_DESCRIPTIONS_MISSING',
        '缺少Descriptions元素',
        '建议添加设备描述信息'
      )
    );
  }

  return errors;
};

export const validateEsiConfig = (config: EsiConfig): ValidationResult => {
  const allErrors: ValidationError[] = [];

  allErrors.push(...validateSlaveInfo(config.slaveInfo));

  allErrors.push(...validatePdoEntries(config.txPdO, 'TxPDO'));

  allErrors.push(...validatePdoEntries(config.rxPdO, 'RxPDO'));

  if (config.txPdO.length === 0 && config.rxPdO.length === 0) {
    allErrors.push(
      createError(
        'warning',
        'PDO_EMPTY',
        'TxPDO和RxPDO都为空',
        '建议至少配置一个PDO映射'
      )
    );
  }

  const xml = generateEsiXml(config);
  allErrors.push(...validateXmlStructure(xml));

  const errors = allErrors.filter((e) => e.severity === 'error');
  const warnings = allErrors.filter((e) => e.severity === 'warning' || e.severity === 'info');

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    timestamp: new Date(),
  };
};

export const validateEsiXml = (xml: string): ValidationResult => {
  const xmlErrors = validateXmlStructure(xml);

  const errors = xmlErrors.filter((e) => e.severity === 'error');
  const warnings = xmlErrors.filter((e) => e.severity === 'warning' || e.severity === 'info');

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    timestamp: new Date(),
  };
};
