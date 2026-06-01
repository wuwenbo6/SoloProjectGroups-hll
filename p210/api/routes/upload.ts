import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { uploadStore } from '../services/upload-store.js';
import { CoapClient } from '../coap/client.js';
import { TransferPhase } from '../coap/client.js';
import { coapServer } from '../server.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const router = Router();

const activeUploads: Map<string, { client: CoapClient; fileData: Buffer; fileName: string }> = new Map();

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const resumeFromRaw = req.query.resume_from;
  const idRaw = req.query.id;

  if (idRaw && resumeFromRaw !== undefined) {
    const id = String(idRaw);
    const resumeFrom = parseInt(String(resumeFromRaw), 10);

    if (isNaN(resumeFrom) || resumeFrom < 0) {
      res.status(400).json({ success: false, error: 'Invalid resume_from parameter' });
      return;
    }

    const existing = activeUploads.get(id);
    if (!existing) {
      res.status(404).json({ success: false, error: 'Upload session not found for resume' });
      return;
    }

    uploadStore.resumeUpload(id, resumeFrom);

    res.json({
      success: true,
      data: {
        id,
        fileName: existing.fileName,
        fileSize: existing.fileData.length,
        totalBlocks: Math.ceil(existing.fileData.length / 1024),
        blockSize: 1024,
        resumed: true,
        resumeFrom,
      },
    });

    const client = new CoapClient(5683, '127.0.0.1');
    existing.client = client;

    try {
      await client.start();
      await client.uploadFile(existing.fileName, existing.fileData, (info) => {
        uploadStore.updateProgress(id, info);
      }, {
        resumeFrom,
        blockSize: 1024,
      });
      uploadStore.completeUpload(id, true);
    } catch (err) {
      console.error('[Upload Route] Resume error:', err);
      uploadStore.completeUpload(id, false);
    } finally {
      await client.stop();
    }
    return;
  }

  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file provided' });
    return;
  }

  const file = req.file;
  const fileName = file.originalname;
  const fileData = file.buffer;
  const fileSize = fileData.length;
  const blockSize = 1024;
  const totalBlocks = Math.ceil(fileSize / blockSize);
  const id = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  uploadStore.createUpload(id, fileName, fileSize, totalBlocks, blockSize);

  res.json({
    success: true,
    data: {
      id,
      fileName,
      fileSize,
      totalBlocks,
      blockSize,
    },
  });

  const client = new CoapClient(5683, '127.0.0.1');
  activeUploads.set(id, { client, fileData, fileName });

  try {
    await client.start();
    const result = await client.uploadFile(fileName, fileData, (info) => {
      uploadStore.updateProgress(id, info);
    }, {
      blockSize: 1024,
    });

    const success = result.state.phase === TransferPhase.COMPLETE;
    uploadStore.completeUpload(id, success);

    if (!success) {
      console.log(`[Upload Route] Upload ${id} failed at block ${result.state.highestAckedBlock + 1}, available for resume`);
    }
  } catch (err) {
    console.error('[Upload Route] Error:', err);
    uploadStore.completeUpload(id, false);
  } finally {
    await client.stop();
  }
});

router.get('/uploads', (_req: Request, res: Response) => {
  const records = uploadStore.getRecords();
  res.json({ success: true, data: records });
});

router.get('/upload/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const progress = uploadStore.getUpload(id);
  if (!progress) {
    res.status(404).json({ success: false, error: 'Upload not found' });
    return;
  }
  res.json({ success: true, data: progress });
});

router.get('/coap/status', async (_req: Request, res: Response) => {
  try {
    const client = new CoapClient(5683, '127.0.0.1');
    await client.start();
    const data = await client.getResource('status', { blockSize: 512 });
    await client.stop();
    const status = JSON.parse(data.toString());
    res.json({ success: true, data: { ...status, observerCount: coapServer.getObserverCount() } });
  } catch (err) {
    console.error('[Upload Route] CoAP status error:', err);
    res.json({ success: true, data: { pending: [], completed: coapServer.getCompletedFiles(), observerCount: coapServer.getObserverCount() } });
  }
});

router.get('/coap/download/:name', async (req: Request, res: Response) => {
  const { name } = req.params;
  try {
    const client = new CoapClient(5683, '127.0.0.1');
    await client.start();
    const data = await client.getResource(name, { blockSize: 512 });
    await client.stop();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(data);
  } catch (err) {
    console.error('[Upload Route] CoAP download error:', err);
    res.status(404).json({ success: false, error: 'File not found on CoAP server' });
  }
});

router.get('/coap/observe', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      observerCount: coapServer.getObserverCount(),
      completedFiles: coapServer.getCompletedFiles().map(f => ({
        fileName: f.fileName,
        size: f.size,
        completedAt: f.completedAt,
      })),
    },
  });
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'ok', observerCount: coapServer.getObserverCount() });
});

export default router;
