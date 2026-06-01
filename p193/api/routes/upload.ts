import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseIrig106File, parseIrig106FileWithOptions } from '../utils/irig106/parser.js';
import { getIndexCacheStats, clearIndexCache } from '../utils/irig106/fileIndex.js';
import type { ParseResult, ParseOptions, TimeReferenceConfig, PcmDeinterleaveConfig } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

function serializeBigInt(obj: unknown): unknown {
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

function sendJsonResponse(res: express.Response, data: unknown) {
  const serialized = serializeBigInt(data);
  res.json(serialized);
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024
  }
});

function parseJsonField(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function parseOptions(body: Record<string, unknown>): ParseOptions {
  const options: ParseOptions = {};

  const timeReferenceRaw = parseJsonField(body.timeReference);
  if (timeReferenceRaw && typeof timeReferenceRaw === 'object') {
    const tr = timeReferenceRaw as Record<string, unknown>;
    options.timeReference = {
      enabled: tr.enabled === true,
      autoDetectFromTmats: tr.autoDetectFromTmats === true
    } as TimeReferenceConfig;

    if (typeof tr.referenceEpochNs === 'string' && /^-?\d+$/.test(tr.referenceEpochNs)) {
      options.timeReference.referenceEpochNs = BigInt(tr.referenceEpochNs);
    }
    if (typeof tr.referenceTime === 'string') {
      options.timeReference.referenceTime = tr.referenceTime;
    }
  }

  const pcmDeinterleaveRaw = parseJsonField(body.pcmDeinterleave);
  if (pcmDeinterleaveRaw && typeof pcmDeinterleaveRaw === 'object') {
    const pcm = pcmDeinterleaveRaw as Record<string, unknown>;
    options.pcmDeinterleave = {
      enabled: pcm.enabled === true,
      channelCount: parseInt(pcm.channelCount as string) || 1,
      frameSize: parseInt(pcm.frameSize as string) || 2
    } as PcmDeinterleaveConfig;

    if (Array.isArray(pcm.channelNames)) {
      options.pcmDeinterleave.channelNames = pcm.channelNames as string[];
    }
    if (Array.isArray(pcm.syncPattern)) {
      options.pcmDeinterleave.syncPattern = pcm.syncPattern as number[];
    }
  }

  const useIndexCacheRaw = parseJsonField(body.useIndexCache);
  if (useIndexCacheRaw === true || useIndexCacheRaw === 'true') {
    options.useIndexCache = true;
  }

  return options;
}

router.post('/', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
        code: 'NO_FILE'
      });
      return;
    }

    const allowedExtensions = ['.ch10', '.irig', '.bin', '.dat'];
    const ext = path.extname(req.file.originalname).toLowerCase();
    
    if (!allowedExtensions.includes(ext)) {
      res.status(400).json({
        success: false,
        error: `Invalid file type. Allowed: ${allowedExtensions.join(', ')}`,
        code: 'INVALID_FILE_TYPE'
      });
      return;
    }

    const options = parseOptions(req.body || {});
    const hasOptions = Object.keys(options).length > 0;
    const result = hasOptions 
      ? parseIrig106FileWithOptions(req.file.buffer, req.file.originalname, options)
      : parseIrig106File(req.file.buffer, req.file.originalname);

    if (!result.success) {
      sendJsonResponse(res.status(400), result);
      return;
    }

    sendJsonResponse(res, result);

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'SERVER_ERROR'
    });
  }
});

router.get('/sample', (req, res) => {
  const sampleData = generateSampleData();
  sendJsonResponse(res, sampleData);
});

function generateSampleData(): ParseResult {
  return {
    success: true,
    fileName: 'sample_data.ch10',
    fileSize: 65536,
    fileHeader: {
      syncPattern: 'IRIG106',
      versionMajor: 10,
      versionMinor: 0,
      fileSize: 65536n,
      creationTime: new Date(),
      packetCount: 15
    },
    totalPackets: 15,
    stats: {
      1: 1,
      2: 10,
      7: 4
    },
    errors: [],
    packets: [
      {
        index: 0,
        type: 1,
        typeName: 'TMATS',
        timestamp: '0.000000000',
        timestampNs: 0n,
        packetLength: 1024,
        dataLength: 1000,
        sequenceNumber: 0,
        offset: 24,
        preview: 'BEGIN TMATS\n\\ID: RECORDER-001\\\n\\COMMENT: Sample Data...'
      },
      {
        index: 1,
        type: 2,
        typeName: 'PCM',
        timestamp: '0.010000000',
        timestampNs: 10000000n,
        packetLength: 2064,
        dataLength: 2048,
        sequenceNumber: 1,
        offset: 1048,
        preview: 'PCM Data: 1024 samples, first 8: [1250, -340, 5678, -901, 2345, -6789, 456, -7890, ...]'
      },
      {
        index: 2,
        type: 2,
        typeName: 'PCM',
        timestamp: '0.020000000',
        timestampNs: 20000000n,
        packetLength: 2064,
        dataLength: 2048,
        sequenceNumber: 2,
        offset: 3112,
        preview: 'PCM Data: 1024 samples, first 8: [1300, -290, 5700, -850, 2400, -6700, 500, -7800, ...]'
      },
      {
        index: 3,
        type: 7,
        typeName: 'MIL-STD-1553',
        timestamp: '0.030000000',
        timestampNs: 30000000n,
        packetLength: 512,
        dataLength: 496,
        sequenceNumber: 3,
        offset: 5176,
        preview: '1553 Bus: 12 messages (RT5 RX SA1 WC4, RT3 TX SA2 WC8, RT1 RX SA3 WC2, ...)'
      },
      {
        index: 4,
        type: 2,
        typeName: 'PCM',
        timestamp: '0.040000000',
        timestampNs: 40000000n,
        packetLength: 2064,
        dataLength: 2048,
        sequenceNumber: 4,
        offset: 5688,
        preview: 'PCM Data: 1024 samples, first 8: [1200, -380, 5750, -950, 2290, -6870, 410, -7980, ...]'
      },
      {
        index: 5,
        type: 2,
        typeName: 'PCM',
        timestamp: '0.050000000',
        timestampNs: 50000000n,
        packetLength: 2064,
        dataLength: 2048,
        sequenceNumber: 5,
        offset: 7752,
        preview: 'PCM Data: 1024 samples, first 8: [1180, -420, 5800, -1000, 2250, -6950, 380, -8050, ...]'
      },
      {
        index: 6,
        type: 7,
        typeName: 'MIL-STD-1553',
        timestamp: '0.060000000',
        timestampNs: 60000000n,
        packetLength: 512,
        dataLength: 496,
        sequenceNumber: 6,
        offset: 9816,
        preview: '1553 Bus: 15 messages (RT2 RX SA4 WC6, RT7 TX SA1 WC10, RT4 RX SA5 WC3, ...)'
      },
      {
        index: 7,
        type: 2,
        typeName: 'PCM',
        timestamp: '0.070000000',
        timestampNs: 70000000n,
        packetLength: 2064,
        dataLength: 2048,
        sequenceNumber: 7,
        offset: 10328,
        preview: 'PCM Data: 1024 samples, first 8: [1320, -310, 5600, -870, 2450, -6650, 530, -7700, ...]'
      },
      {
        index: 8,
        type: 2,
        typeName: 'PCM',
        timestamp: '0.080000000',
        timestampNs: 80000000n,
        packetLength: 2064,
        dataLength: 2048,
        sequenceNumber: 8,
        offset: 12392,
        preview: 'PCM Data: 1024 samples, first 8: [1280, -350, 5720, -910, 2380, -6730, 470, -7850, ...]'
      },
      {
        index: 9,
        type: 2,
        typeName: 'PCM',
        timestamp: '0.090000000',
        timestampNs: 90000000n,
        packetLength: 2064,
        dataLength: 2048,
        sequenceNumber: 9,
        offset: 14456,
        preview: 'PCM Data: 1024 samples, first 8: [1260, -370, 5690, -930, 2350, -6760, 440, -7870, ...]'
      },
      {
        index: 10,
        type: 2,
        typeName: 'PCM',
        timestamp: '0.100000000',
        timestampNs: 100000000n,
        packetLength: 2064,
        dataLength: 2048,
        sequenceNumber: 10,
        offset: 16520,
        preview: 'PCM Data: 1024 samples, first 8: [1240, -390, 5660, -950, 2320, -6790, 410, -7890, ...]'
      },
      {
        index: 11,
        type: 7,
        typeName: 'MIL-STD-1553',
        timestamp: '0.110000000',
        timestampNs: 110000000n,
        packetLength: 512,
        dataLength: 496,
        sequenceNumber: 11,
        offset: 18584,
        preview: '1553 Bus: 18 messages (RT6 RX SA2 WC5, RT4 TX SA6 WC7, RT2 RX SA1 WC4, ...)'
      },
      {
        index: 12,
        type: 2,
        typeName: 'PCM',
        timestamp: '0.120000000',
        timestampNs: 120000000n,
        packetLength: 2064,
        dataLength: 2048,
        sequenceNumber: 12,
        offset: 19096,
        preview: 'PCM Data: 1024 samples, first 8: [1310, -320, 5630, -890, 2410, -6680, 500, -7730, ...]'
      },
      {
        index: 13,
        type: 2,
        typeName: 'PCM',
        timestamp: '0.130000000',
        timestampNs: 130000000n,
        packetLength: 2064,
        dataLength: 2048,
        sequenceNumber: 13,
        offset: 21160,
        preview: 'PCM Data: 1024 samples, first 8: [1270, -360, 5710, -920, 2360, -6720, 460, -7860, ...]'
      },
      {
        index: 14,
        type: 7,
        typeName: 'MIL-STD-1553',
        timestamp: '0.140000000',
        timestampNs: 140000000n,
        packetLength: 512,
        dataLength: 496,
        sequenceNumber: 14,
        offset: 23224,
        preview: '1553 Bus: 10 messages (RT3 RX SA3 WC8, RT5 TX SA4 WC6, RT1 RX SA2 WC4, ...)'
      }
    ],
    packetDetails: {}
  };
}

router.get('/cache/stats', (req, res) => {
  try {
    const stats = getIndexCacheStats();
    sendJsonResponse(res, {
      success: true,
      count: stats.count,
      totalSize: stats.totalSize
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.delete('/cache', (req, res) => {
  try {
    clearIndexCache();
    sendJsonResponse(res, {
      success: true,
      message: 'Index cache cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
