import { Router, type Request, type Response } from 'express';
import { store } from '../services/MemoryStore.js';
import { getChunkStats, getPendingChunks } from '../services/UdpServer.js';
import type { GelfMessage } from '../types.js';

const router = Router();

router.get('/logs', (req: Request, res: Response) => {
  const q = (req.query.q as string) || '';
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
  const mapped = req.query.mapped === 'true';

  const result = store.search(q, page, limit);

  if (mapped) {
    res.json({
      ...result,
      data: result.data.map((log) => store.applyFieldMappings(log)),
    });
  } else {
    res.json(result);
  }
});

router.get('/logs/mapped', (req: Request, res: Response) => {
  const q = (req.query.q as string) || '';
  const includeRaw = req.query.include_raw !== 'false';
  const result = store.getMappedLogs(q, includeRaw);
  res.json(result);
});

router.get('/logs/export/jsonl', (req: Request, res: Response) => {
  const q = (req.query.q as string) || '';
  const includeRaw = req.query.include_raw !== 'false';
  const mapped = req.query.mapped === 'true' || req.query.mapped === undefined;
  const rawOnly = req.query.raw_only === 'true';

  let content: string;
  let filename: string;

  if (rawOnly) {
    content = store.exportRawJsonl(q);
    filename = `gelf-logs-raw-${Date.now()}.jsonl`;
  } else {
    content = store.exportJsonl(q, includeRaw, mapped);
    filename = `gelf-logs${mapped ? '-mapped' : ''}-${Date.now()}.jsonl`;
  }

  res.setHeader('Content-Type', 'application/jsonl; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Total-Count', String(content.split('\n').filter(Boolean).length));
  res.send(content);
});

router.get('/logs/stats', (_req: Request, res: Response) => {
  res.json(store.stats());
});

router.get('/logs/chunk-stats', (_req: Request, res: Response) => {
  res.json(getChunkStats());
});

router.get('/logs/pending-chunks', (_req: Request, res: Response) => {
  res.json(getPendingChunks());
});

router.post('/logs/test', (req: Request, res: Response) => {
  const { host, short_message, full_message } = req.body;
  if (!host || !short_message) {
    res.status(400).json({ success: false, error: 'host and short_message are required' });
    return;
  }
  const gelf: GelfMessage = {
    version: '1.1',
    host,
    short_message,
    full_message: full_message || undefined,
    timestamp: Date.now() / 1000,
    level: 6,
  };
  const raw = JSON.stringify(gelf);
  store.insert(raw, gelf);
  res.json({ success: true });
});

export default router;
