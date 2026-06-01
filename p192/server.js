import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { batchConvert, batchConvertStream, MIN_ASN, MAX_2BYTE_ASN, MAX_4BYTE_ASN, AS_TRANS } from './asnConverter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/info', (req, res) => {
  res.json({
    name: 'ASN Converter API',
    version: '2.0.0',
    description: 'Convert between 2-byte/4-byte ASN and ASdot notation with AS_TRANS support',
    ranges: {
      minAsn: MIN_ASN,
      max2byteAsn: MAX_2BYTE_ASN,
      max4byteAsn: MAX_4BYTE_ASN,
      asTrans: AS_TRANS
    },
    endpoints: {
      convert: {
        method: 'POST',
        path: '/api/convert',
        description: 'Batch convert (JSON response)',
        body: {
          direction: 'asn-to-asdot | asdot-to-asn',
          inputs: 'string[] - Array of values to convert'
        }
      },
      convertStream: {
        method: 'POST',
        path: '/api/convert/stream',
        description: 'Batch convert with SSE streaming response',
        body: {
          direction: 'asn-to-asdot | asdot-to-asn',
          inputs: 'string[] - Array of values to convert'
        }
      }
    }
  });
});

function validateRequest(direction, inputs) {
  if (!direction) {
    return { valid: false, error: '缺少 direction 参数' };
  }
  if (!['asn-to-asdot', 'asdot-to-asn'].includes(direction)) {
    return { valid: false, error: 'direction 必须是 "asn-to-asdot" 或 "asdot-to-asn"' };
  }
  if (!inputs || !Array.isArray(inputs)) {
    return { valid: false, error: 'inputs 必须是数组' };
  }
  if (inputs.length === 0) {
    return { valid: false, error: 'inputs 数组不能为空' };
  }
  return { valid: true };
}

app.post('/api/convert', (req, res) => {
  try {
    const { direction, inputs } = req.body;
    const validation = validateRequest(direction, inputs);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    const results = batchConvert(inputs, direction);
    res.json({ success: true, results });
  } catch (error) {
    console.error('转换错误:', error);
    res.status(500).json({ success: false, error: '服务器内部错误: ' + error.message });
  }
});

app.post('/api/convert/stream', (req, res) => {
  try {
    const { direction, inputs } = req.body;
    const validation = validateRequest(direction, inputs);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let total = 0;
    let valid = 0;
    let closed = false;

    req.on('close', () => {
      closed = true;
    });

    const generator = batchConvertStream(inputs, direction);

    function processNext() {
      if (closed) return;

      try {
        const { value, done } = generator.next();
        if (done) {
          res.write(`event: done\ndata: ${JSON.stringify({ total, valid, failed: total - valid })}\n\n`);
          res.end();
          return;
        }

        total++;
        if (value.isValid) valid++;

        res.write(`event: result\ndata: ${JSON.stringify(value)}\n\n`);

        if (total % 10 === 0) {
          setTimeout(processNext, 0);
        } else {
          processNext();
        }
      } catch (err) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    }

    processNext();
  } catch (error) {
    console.error('流式转换错误:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: '服务器内部错误: ' + error.message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: '未找到该路由' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 ASN 转换服务已启动 (v2.0)`);
  console.log(`📍 服务地址:  http://localhost:${PORT}`);
  console.log(`📡 JSON API:  http://localhost:${PORT}/api/convert`);
  console.log(`📡 SSE API:   http://localhost:${PORT}/api/convert/stream`);
  console.log(`📋 API 信息:  http://localhost:${PORT}/api/info`);
  console.log(`\n💡 支持的转换:`);
  console.log(`   • 2字节 ASN (${MIN_ASN}-${MAX_2BYTE_ASN}) → ASdot`);
  console.log(`   • 4字节 ASN → ASdot (含 AS_TRANS ${AS_TRANS} 占位符)`);
  console.log(`   • ASdot → 2字节/4字节 ASN`);
  console.log(`\n🔢 批量转换: SSE 流式处理，逐条返回结果\n`);
});
