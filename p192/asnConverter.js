const MIN_ASN = 1;
const MAX_2BYTE_ASN = 64511;
const MAX_16BIT = 65535;
const MAX_4BYTE_ASN = 4294967295;
const AS_TRANS = 23456;

const ASN_RANGES = [
  { name: 'AS_TRANS', nameZh: 'AS_TRANS 占位符', min: 23456, max: 23456, type: '2-byte', color: 'as-trans', priority: 1 },
  { name: 'Documentation (2-byte)', nameZh: '文档示例 (2字节)', min: 64496, max: 64511, type: '2-byte', color: 'doc', priority: 2 },
  { name: 'Documentation (4-byte)', nameZh: '文档示例 (4字节)', min: 65536, max: 65551, type: '4-byte', color: 'doc', priority: 2 },
  { name: 'IANA Reserved', nameZh: 'IANA 保留', min: 64512, max: 65534, type: '2-byte', color: 'reserved', priority: 3 },
  { name: '2-Byte Last', nameZh: '2字节最后', min: 65535, max: 65535, type: '2-byte', color: 'last', priority: 3 },
  { name: '4-Byte Private', nameZh: '4字节私网', min: 4200000000, max: 4294967294, type: '4-byte', color: 'private-4', priority: 2 },
  { name: '4-Byte Last', nameZh: '4字节最后', min: 4294967295, max: 4294967295, type: '4-byte', color: 'last-4', priority: 3 },
  { name: 'Well-Known Public', nameZh: '公网 ASN', min: 1, max: 64511, type: '2-byte', color: 'public', priority: 10 },
  { name: '4-Byte Public', nameZh: '4字节公网', min: 65536, max: 4199999999, type: '4-byte', color: 'public-4', priority: 10 }
];

function classifyAsn(asn) {
  if (asn === AS_TRANS) {
    return { category: 'AS_TRANS', categoryZh: 'AS_TRANS 占位符', type: '2-byte', color: 'as-trans' };
  }

  const sorted = [...ASN_RANGES]
    .filter(r => r.name !== 'AS_TRANS')
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));

  for (const range of sorted) {
    if (asn >= range.min && asn <= range.max) {
      if (range.name.startsWith('Documentation')) {
        return { category: 'Documentation', categoryZh: range.nameZh, type: range.type, color: 'doc' };
      }
      return { category: range.name, categoryZh: range.nameZh, type: range.type, color: range.color };
    }
  }

  return { category: 'Unknown', categoryZh: '未知', type: 'unknown', color: 'unknown' };
}

function validateAsn(input) {
  const trimmed = String(input).trim();
  if (!trimmed) {
    return { valid: false, error: '输入不能为空' };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, error: 'ASN 必须是正整数' };
  }
  const asn = parseInt(trimmed, 10);
  if (asn < MIN_ASN || asn > MAX_4BYTE_ASN) {
    return { valid: false, error: `ASN 必须在 ${MIN_ASN} - ${MAX_4BYTE_ASN} 范围内` };
  }
  const classification = classifyAsn(asn);
  const is4byte = classification.type === '4-byte';
  return { valid: true, value: asn, is4byte, classification };
}

function validateAsdot(input) {
  const trimmed = String(input).trim();
  if (!trimmed) {
    return { valid: false, error: '输入不能为空' };
  }
  const parts = trimmed.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'ASdot 格式必须是 a.b，如 1.2' };
  }
  if (!/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) {
    return { valid: false, error: 'ASdot 的两部分都必须是非负整数' };
  }
  const high = parseInt(parts[0], 10);
  const low = parseInt(parts[1], 10);
  if (high < 0 || high > MAX_16BIT || low < 0 || low > MAX_16BIT) {
    return { valid: false, error: `ASdot 的每部分必须在 0 - ${MAX_16BIT} 范围内` };
  }
  const asn = high * (MAX_16BIT + 1) + low;
  const classification = classifyAsn(asn);
  const is4byte = classification.type === '4-byte';
  return { valid: true, high, low, asn, is4byte, classification };
}

function asnToAsdot(asn) {
  const validation = validateAsn(asn);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  const value = validation.value;
  const high = Math.floor(value / (MAX_16BIT + 1));
  const low = value % (MAX_16BIT + 1);
  const result = `${high}.${low}`;
  const is4byte = validation.is4byte;
  const response = {
    success: true,
    result,
    is4byte,
    classification: validation.classification
  };
  if (value === AS_TRANS) {
    response.isAsTrans = true;
    response.note = 'AS_TRANS 占位符：用于 2 字节 BGP 发言者表示无法识别的 4 字节 ASN';
  } else if (is4byte) {
    response.asTrans = AS_TRANS;
    response.note = `4 字节 ASN，2 字节 BGP 发言者将使用 AS_TRANS (${AS_TRANS}) 作为占位符`;
  }
  return response;
}

function asdotToAsn(asdot) {
  const validation = validateAsdot(asdot);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  const asn = validation.asn;
  if (asn < MIN_ASN || asn > MAX_4BYTE_ASN) {
    return { success: false, error: `转换结果 ${asn} 超出有效范围 ${MIN_ASN} - ${MAX_4BYTE_ASN}` };
  }
  const is4byte = validation.is4byte;
  const response = {
    success: true,
    result: asn,
    is4byte,
    classification: validation.classification
  };
  if (is4byte) {
    response.asTrans = AS_TRANS;
    response.note = `4 字节 ASN，2 字节 BGP 发言者将使用 AS_TRANS (${AS_TRANS}) 作为占位符`;
  }
  return response;
}

function* batchConvertStream(inputs, direction) {
  const lines = Array.isArray(inputs) ? inputs : String(inputs).split('\n');
  let index = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      yield { index: index++, input: trimmed, output: '', isValid: false, error: '空行' };
      continue;
    }

    let conversion;
    if (direction === 'asn-to-asdot') {
      conversion = asnToAsdot(trimmed);
    } else if (direction === 'asdot-to-asn') {
      conversion = asdotToAsn(trimmed);
    } else {
      yield { index: index++, input: trimmed, output: '', isValid: false, error: '无效的转换方向' };
      continue;
    }

    if (conversion.success) {
      const item = {
        index: index++,
        input: trimmed,
        output: String(conversion.result),
        isValid: true,
        is4byte: conversion.is4byte || false,
        classification: conversion.classification
      };
      if (conversion.isAsTrans) {
        item.isAsTrans = true;
      }
      if (conversion.asTrans !== undefined) {
        item.asTrans = conversion.asTrans;
      }
      if (conversion.note) {
        item.note = conversion.note;
      }
      yield item;
    } else {
      yield { index: index++, input: trimmed, output: '', isValid: false, error: conversion.error };
    }
  }
}

function batchConvert(inputs, direction) {
  return Array.from(batchConvertStream(inputs, direction));
}

export {
  validateAsn,
  validateAsdot,
  asnToAsdot,
  asdotToAsn,
  batchConvert,
  batchConvertStream,
  classifyAsn,
  ASN_RANGES,
  MIN_ASN,
  MAX_2BYTE_ASN,
  MAX_16BIT,
  MAX_4BYTE_ASN,
  AS_TRANS
};
