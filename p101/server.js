const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { parseString } = require('xml2js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const MAC_KEY = Buffer.from('0123456789ABCDEF0123456789ABCDEF', 'hex');

function ansiX99MAC(data, key) {
  const blockSize = 16;
  const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'ascii');
  
  const padded = Buffer.alloc(Math.ceil(dataBuffer.length / blockSize) * blockSize);
  dataBuffer.copy(padded);
  
  let result = Buffer.alloc(16, 0);
  const aesKey = key.slice(0, 16);
  
  for (let i = 0; i < padded.length; i += blockSize) {
    const block = padded.slice(i, i + blockSize);
    for (let j = 0; j < 16; j++) {
      result[j] ^= block[j];
    }
    const iv = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv('aes-128-cbc', aesKey, iv);
    cipher.setAutoPadding(false);
    result = Buffer.concat([cipher.update(result), cipher.final()]);
  }
  
  return result.slice(0, 8).toString('hex').toUpperCase();
}

function verifyAnsiX99MAC(data, receivedMac, key) {
  const calculatedMac = ansiX99MAC(data, key);
  return calculatedMac === receivedMac.toUpperCase();
}

const cardSchemes = [
  { name: '银联 UnionPay', prefixes: ['62', '60'], lengthRange: [16, 19] },
  { name: 'Visa', prefixes: ['4'], lengthRange: [13, 16, 19] },
  { name: 'Mastercard', prefixes: ['51', '52', '53', '54', '55', '22', '23', '24', '25', '26', '27'], lengthRange: [16] },
  { name: 'American Express', prefixes: ['34', '37'], lengthRange: [15] },
  { name: 'JCB', prefixes: ['35'], lengthRange: [16, 19] },
  { name: 'Diners Club', prefixes: ['30', '36', '38', '39'], lengthRange: [14] }
];

function detectCardScheme(cardNumber) {
  if (!cardNumber) return { scheme: '未知', isValid: false };
  
  const pan = cardNumber.replace(/\D/g, '');
  
  for (const scheme of cardSchemes) {
    for (const prefix of scheme.prefixes) {
      if (pan.startsWith(prefix)) {
        const isValid = scheme.lengthRange.includes(pan.length);
        return { scheme: scheme.name, isValid, panLength: pan.length };
      }
    }
  }
  
  return { scheme: '未知', isValid: false, panLength: pan.length };
}

function exportTransactionsToCSV() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT id, mti, card_number, amount, rrn, response_code, status, created_at
      FROM transactions
      ORDER BY created_at DESC
    `, [], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      let csv = 'ID,MTI,卡号,金额(分),检索参考号,响应码,状态,时间\n';
      
      rows.forEach(row => {
        const maskedCard = row.card_number ? 
          row.card_number.substring(0, 6) + '****' + row.card_number.slice(-4) : '';
        csv += `${row.id},${row.mti},${maskedCard},${row.amount},${row.rrn},${row.response_code},${row.status},"${row.created_at}"\n`;
      });
      
      resolve(csv);
    });
  });
}

const fieldSpecs = {
  2: { number: 2, name: '主账号', format: 'LLVAR', length: 19 },
  3: { number: 3, name: '处理码', format: 'FIXED', length: 6 },
  4: { number: 4, name: '交易金额', format: 'FIXED', length: 12 },
  7: { number: 7, name: '传输日期时间', format: 'FIXED', length: 10 },
  11: { number: 11, name: '系统跟踪号', format: 'FIXED', length: 6 },
  12: { number: 12, name: '受卡方所在地时间', format: 'FIXED', length: 6 },
  13: { number: 13, name: '受卡方所在地日期', format: 'FIXED', length: 4 },
  14: { number: 14, name: '卡有效期', format: 'FIXED', length: 4 },
  15: { number: 15, name: '清算日期', format: 'FIXED', length: 4 },
  18: { number: 18, name: '商户类型', format: 'FIXED', length: 4 },
  22: { number: 22, name: '服务点输入方式码', format: 'FIXED', length: 3 },
  23: { number: 23, name: '卡序列号', format: 'FIXED', length: 3 },
  25: { number: 25, name: '服务点条件码', format: 'FIXED', length: 2 },
  26: { number: 26, name: '服务点PIN获取码', format: 'FIXED', length: 2 },
  28: { number: 28, name: '交易费', format: 'FIXED', length: 8 },
  32: { number: 32, name: '受理方标识码', format: 'LLVAR', length: 11 },
  33: { number: 33, name: '发送方标识码', format: 'LLVAR', length: 11 },
  35: { number: 35, name: '磁条2数据', format: 'LLVAR', length: 37 },
  36: { number: 36, name: '磁条3数据', format: 'LLLVAR', length: 104 },
  37: { number: 37, name: '检索参考号', format: 'FIXED', length: 12 },
  38: { number: 38, name: '授权标识应答码', format: 'FIXED', length: 6 },
  39: { number: 39, name: '应答码', format: 'FIXED', length: 2 },
  41: { number: 41, name: '受卡机终端标识码', format: 'FIXED', length: 8 },
  42: { number: 42, name: '受卡方标识码', format: 'FIXED', length: 15 },
  43: { number: 43, name: '商户名称地址', format: 'FIXED', length: 40 },
  44: { number: 44, name: '附加响应数据', format: 'LLVAR', length: 25 },
  48: { number: 48, name: '附加数据', format: 'LLLVAR', length: 255 },
  49: { number: 49, name: '交易货币代码', format: 'FIXED', length: 3 },
  50: { number: 50, name: '结算货币代码', format: 'FIXED', length: 3 },
  52: { number: 52, name: 'PIN数据', format: 'FIXED', length: 16 },
  53: { number: 53, name: '安全控制信息', format: 'FIXED', length: 16 },
  54: { number: 54, name: '附加金额', format: 'LLLVAR', length: 120 },
  55: { number: 55, name: 'IC卡数据', format: 'LLLVAR', length: 255 },
  59: { number: 59, name: '自定义域', format: 'LLLVAR', length: 255 },
  60: { number: 60, name: '自定义域', format: 'LLLVAR', length: 255 },
  61: { number: 61, name: '自定义域', format: 'LLLVAR', length: 255 },
  62: { number: 62, name: '自定义域', format: 'LLLVAR', length: 255 },
  63: { number: 63, name: '自定义域', format: 'LLLVAR', length: 255 },
  64: { number: 64, name: 'MAC', format: 'FIXED', length: 16 },
};

function hexToBytes(hexStr) {
  hexStr = hexStr.replace(/\s/g, '').replace(/\n/g, '').replace(/\t/g, '');
  const bytes = [];
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes.push(parseInt(hexStr.substr(i, 2), 16));
  }
  return new Uint8Array(bytes);
}

function bytesToHex(data) {
  return Array.from(data)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function bcdToStr(data) {
  let str = '';
  for (let i = 0; i < data.length; i++) {
    str += (data[i] >> 4).toString(16);
    str += (data[i] & 0x0F).toString(16);
  }
  return str.toUpperCase();
}

function parseBitmap(data) {
  if (data.length < 8) {
    throw new Error('invalid bitmap length');
  }
  
  const bitmap = new Array(64).fill(false);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const bitIndex = i * 8 + j;
      const mask = 1 << (7 - j);
      bitmap[bitIndex] = (data[i] & mask) !== 0;
    }
  }
  return bitmap;
}

function parseHexISO8583(hexStr) {
  hexStr = hexStr.replace(/\s/g, '').replace(/\n/g, '').replace(/\t/g, '');
  
  if (hexStr.length < 8) {
    throw new Error('message too short');
  }

  const result = {
    fields: {}
  };

  result.mti = hexStr.substring(0, 4);
  let offset = 4;

  const primaryBitmapHex = hexStr.substring(offset, offset + 16);
  const primaryBitmap = hexToBytes(primaryBitmapHex);
  offset += 16;

  const bitmap = parseBitmap(primaryBitmap);
  result.bitmap = bitmap;
  result.bitmapHex = primaryBitmapHex.toUpperCase();

  result.hasSecondaryBitmap = bitmap[0];

  if (result.hasSecondaryBitmap) {
    if (hexStr.length < offset + 16) {
      throw new Error('secondary bitmap data missing');
    }
    const secondaryBitmapHex = hexStr.substring(offset, offset + 16);
    const secondaryBitmapData = hexToBytes(secondaryBitmapHex);
    offset += 16;

    const secondaryBitmap = parseBitmap(secondaryBitmapData);
    result.secondaryBitmap = secondaryBitmap;
    result.secondaryBitmapHex = secondaryBitmapHex.toUpperCase();
  }

  const allFields = new Array(128).fill(false);
  for (let i = 0; i < 64 && i < result.bitmap.length; i++) {
    allFields[i] = result.bitmap[i];
  }
  if (result.hasSecondaryBitmap && result.secondaryBitmap) {
    for (let i = 0; i < 64 && i < result.secondaryBitmap.length; i++) {
      allFields[64 + i] = result.secondaryBitmap[i];
    }
  }

  for (let fieldNum = 2; fieldNum <= 128; fieldNum++) {
    if (!allFields[fieldNum - 1]) continue;

    const spec = fieldSpecs[fieldNum];
    if (!spec) continue;

    let fieldLen;
    let value;

    switch (spec.format) {
      case 'FIXED':
        fieldLen = spec.length * 2;
        if (offset + fieldLen > hexStr.length) {
          throw new Error(`field ${fieldNum} data truncated, offset=${offset}, need=${fieldLen}, remaining=${hexStr.length - offset}`);
        }
        value = hexToStr(hexStr.substring(offset, offset + fieldLen));
        offset += fieldLen;
        break;

      case 'LLVAR':
        if (offset + 4 > hexStr.length) {
          throw new Error(`field ${fieldNum} length indicator missing, need 4 hex chars for LL`);
        }
        const lenStr2 = hexToStr(hexStr.substring(offset, offset + 4));
        offset += 4;
        fieldLen = parseInt(lenStr2, 10);
        if (isNaN(fieldLen)) {
          throw new Error(`field ${fieldNum} invalid length: ${lenStr2}`);
        }
        const fieldHexLen = fieldLen * 2;
        if (offset + fieldHexLen > hexStr.length) {
          throw new Error(`field ${fieldNum} data truncated, offset=${offset}, need=${fieldHexLen}, remaining=${hexStr.length - offset}, lenIndicator=${lenStr2}`);
        }
        value = hexToStr(hexStr.substring(offset, offset + fieldHexLen));
        offset += fieldHexLen;
        break;

      case 'LLLVAR':
        if (offset + 6 > hexStr.length) {
          throw new Error(`field ${fieldNum} length indicator missing, need 6 hex chars for LLL`);
        }
        const lenStr3 = hexToStr(hexStr.substring(offset, offset + 6));
        offset += 6;
        fieldLen = parseInt(lenStr3, 10);
        if (isNaN(fieldLen)) {
          throw new Error(`field ${fieldNum} invalid length: ${lenStr3}`);
        }
        const fieldHexLen3 = fieldLen * 2;
        if (offset + fieldHexLen3 > hexStr.length) {
          throw new Error(`field ${fieldNum} data truncated`);
        }
        value = hexToStr(hexStr.substring(offset, offset + fieldHexLen3));
        offset += fieldHexLen3;
        break;
    }

    result.fields[fieldNum.toString()] = value;
  }

  return result;
}

function hexToStr(hexStr) {
  let str = '';
  for (let i = 0; i < hexStr.length; i += 2) {
    const code = parseInt(hexStr.substr(i, 2), 16);
    str += String.fromCharCode(code);
  }
  return str;
}

function parseXMLISO8583(xmlData) {
  return new Promise((resolve, reject) => {
    parseString(xmlData, (err, msg) => {
      if (err) {
        reject(new Error(`invalid XML: ${err.message}`));
        return;
      }

      const result = {
        mti: msg.iso8583.mti[0],
        fields: {},
        bitmap: new Array(64).fill(false)
      };

      const fieldSet = {};
      if (msg.iso8583.field) {
        msg.iso8583.field.forEach(field => {
          const id = field.$.id;
          const num = parseInt(id, 10);
          if (num >= 2 && num <= 128) {
            fieldSet[num] = field._ || '';
          }
        });
      }

      let hasSecondary = false;
      for (const num of Object.keys(fieldSet)) {
        if (parseInt(num) > 64) {
          hasSecondary = true;
          break;
        }
      }
      result.hasSecondaryBitmap = hasSecondary;
      result.bitmap[0] = hasSecondary;

      for (const numStr of Object.keys(fieldSet)) {
        const num = parseInt(numStr);
        if (num <= 64) {
          result.bitmap[num - 1] = true;
        }
      }

      if (hasSecondary) {
        result.secondaryBitmap = new Array(64).fill(false);
        for (const numStr of Object.keys(fieldSet)) {
          const num = parseInt(numStr);
          if (num > 64 && num <= 128) {
            result.secondaryBitmap[num - 65] = true;
          }
        }
      }

      for (const [num, value] of Object.entries(fieldSet)) {
        result.fields[num] = value;
      }

      const bitmapBytes = new Uint8Array(8);
      for (let i = 0; i < 64; i++) {
        if (result.bitmap[i]) {
          const byteIdx = Math.floor(i / 8);
          const bitIdx = 7 - (i % 8);
          bitmapBytes[byteIdx] |= 1 << bitIdx;
        }
      }
      result.bitmapHex = bytesToHex(bitmapBytes);

      if (hasSecondary) {
        const secBitmapBytes = new Uint8Array(8);
        for (let i = 0; i < 64; i++) {
          if (result.secondaryBitmap[i]) {
            const byteIdx = Math.floor(i / 8);
            const bitIdx = 7 - (i % 8);
            secBitmapBytes[byteIdx] |= 1 << bitIdx;
          }
        }
        result.secondaryBitmapHex = bytesToHex(secBitmapBytes);
      }

      resolve(result);
    });
  });
}

function buildResponseMessage(requestMsg) {
  const response = {
    mti: '0210',
    fields: {},
    bitmap: new Array(64).fill(false),
    hasSecondaryBitmap: false
  };

  const bitmap = new Array(64).fill(false);
  
  bitmap[2] = true;
  response.fields['3'] = requestMsg.fields['3'] || '000000';
  
  bitmap[3] = true;
  response.fields['4'] = requestMsg.fields['4'] || '000000000000';
  
  bitmap[10] = true;
  response.fields['11'] = requestMsg.fields['11'] || '000001';
  
  bitmap[11] = true;
  response.fields['12'] = requestMsg.fields['12'] || new Date().toTimeString().slice(0, 8).replace(/:/g, '');
  
  bitmap[12] = true;
  response.fields['13'] = requestMsg.fields['13'] || new Date().toISOString().slice(5, 10).replace(/-/g, '');
  
  bitmap[36] = true;
  let rrn = requestMsg.fields['37'];
  if (!rrn) {
    rrn = Date.now().toString().padStart(12, '0').slice(-12);
  }
  response.fields['37'] = rrn;
  
  bitmap[37] = true;
  response.fields['38'] = (Date.now() % 1000000).toString().padStart(6, '0');
  
  bitmap[38] = true;
  response.fields['39'] = '00';
  
  if (requestMsg.fields['41']) {
    bitmap[40] = true;
    response.fields['41'] = requestMsg.fields['41'];
  }
  if (requestMsg.fields['42']) {
    bitmap[41] = true;
    response.fields['42'] = requestMsg.fields['42'];
  }
  
  bitmap[43] = true;
  response.fields['44'] = 'A000000';

  const bitmapBytes = new Uint8Array(8);
  for (let i = 0; i < 64; i++) {
    if (bitmap[i]) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = 7 - (i % 8);
      bitmapBytes[byteIdx] |= 1 << bitIdx;
    }
  }
  response.bitmap = bitmap;
  response.bitmapHex = bytesToHex(bitmapBytes);

  return response;
}

const db = new sqlite3.Database('./transactions.db', (err) => {
  if (err) {
    console.error('Database opening error:', err);
  } else {
    console.log('Database connected');
  }
});

db.run(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mti TEXT,
    card_number TEXT,
    amount TEXT,
    rrn TEXT UNIQUE,
    response_code TEXT,
    status TEXT,
    raw_request TEXT,
    raw_response TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Table creation error:', err);
  } else {
    console.log('Table ready');
  }
});

function findTransactionByRRN(rrn) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT id, mti, card_number, amount, rrn, response_code, status, raw_request, raw_response, created_at
      FROM transactions
      WHERE rrn = ?
    `, [rrn], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function saveTransaction(mti, cardNumber, amount, rrn, responseCode, status, rawRequest, rawResponse) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO transactions (mti, card_number, amount, rrn, response_code, status, raw_request, raw_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(mti, cardNumber, amount, rrn, responseCode, status, rawRequest, rawResponse, function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
    stmt.finalize();
  });
}

function getTransactions(limit) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT id, mti, card_number, amount, rrn, response_code, status, raw_request, raw_response, created_at
      FROM transactions
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/parse', async (req, res) => {
  try {
    const { data, format } = req.body;
    
    let result;
    if (format === 'xml') {
      result = await parseXMLISO8583(data);
    } else {
      result = parseHexISO8583(data);
    }
    
    const cardNumber = result.fields['2'] || '';
    result.cardScheme = detectCardScheme(cardNumber);
    
    const field64 = result.fields['64'];
    if (field64) {
      const macData = buildMacData(result);
      const calculatedMac = ansiX99MAC(macData, MAC_KEY);
      result.macVerification = {
        received: field64,
        calculated: calculatedMac,
        valid: calculatedMac === field64.toUpperCase()
      };
    }
    
    res.json(result);
  } catch (err) {
    console.error('Parse error:', err);
    res.status(400).json({ error: err.message });
  }
});

function buildMacData(parsedMsg) {
  let data = '';
  const macFields = [2, 3, 4, 7, 11, 12, 13, 37, 41, 42, 49];
  macFields.forEach(num => {
    if (parsedMsg.fields[num]) {
      data += parsedMsg.fields[num];
    }
  });
  return data;
}

app.post('/api/mac/generate', (req, res) => {
  try {
    const { message } = req.body;
    const macData = buildMacData(message);
    const mac = ansiX99MAC(macData, MAC_KEY);
    res.json({ mac, macData: macData.substring(0, 100) + '...' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/card/detect/:pan', (req, res) => {
  const result = detectCardScheme(req.params.pan);
  res.json(result);
});

app.get('/api/transactions/export', async (req, res) => {
  try {
    const csv = await exportTransactionsToCSV();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transactions_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/send', async (req, res) => {
  try {
    const { message } = req.body;
    
    const cardNumber = message.fields['2'] || '';
    const amount = message.fields['4'] || '';
    
    const rrn = message.fields['37'] || generateRRN();
    
    const existingTx = await findTransactionByRRN(rrn);
    
    if (existingTx) {
      console.log('Idempotent request: returning existing transaction for RRN:', rrn);
      let parsedResponse = null;
      try {
        parsedResponse = JSON.parse(existingTx.raw_response);
      } catch (e) {
        parsedResponse = null;
      }
      
      res.json({
        success: true,
        responseCode: existingTx.response_code,
        responseMessage: '重复报文-幂等返回',
        rrn: rrn,
        parsedResponse: parsedResponse,
        isIdempotent: true,
        originalTime: existingTx.created_at
      });
      return;
    }
    
    const responseMsg = buildResponseMessage(message);
    responseMsg.fields['37'] = rrn;
    
    await saveTransaction(
      message.mti,
      cardNumber,
      amount,
      rrn,
      '00',
      'success',
      JSON.stringify(message),
      JSON.stringify(responseMsg)
    );
    
    res.json({
      success: true,
      responseCode: '00',
      responseMessage: '交易成功',
      rrn: rrn,
      parsedResponse: responseMsg,
      isIdempotent: false
    });
  } catch (err) {
    console.error('Send error:', err);
    res.status(500).json({ error: err.message });
  }
});

function generateRRN() {
  return Date.now().toString().padStart(12, '0').slice(-12);
}

app.get('/api/transactions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const transactions = await getTransactions(limit);
    res.json({ transactions });
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`ISO 8583 Backend Server running on port ${PORT}`);
});
