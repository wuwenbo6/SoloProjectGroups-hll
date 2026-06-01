import { Router, Request, Response } from 'express';
import { syncService } from '../services/SyncService';

const router = Router();

router.get('/status', (req: Request, res: Response) => {
  try {
    const status = syncService.getSyncStatus();
    res.json({ success: true, data: status });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/start', (req: Request, res: Response) => {
  try {
    const result = syncService.startSync();
    if (!result.success) {
      res.status(400).json({ success: false, error: result.message });
      return;
    }
    res.json({ success: true, data: { message: result.message } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/stop', (req: Request, res: Response) => {
  try {
    const result = syncService.stopSync();
    if (!result.success) {
      res.status(400).json({ success: false, error: result.message });
      return;
    }
    res.json({ success: true, data: { message: result.message } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/modbus-to-ua', (req: Request, res: Response) => {
  try {
    const result = syncService.syncFromModbusToUa();
    res.json({ success: result.success, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/ua-to-modbus/:nodeId', (req: Request, res: Response) => {
  try {
    const nodeId = decodeURIComponent(req.params.nodeId);
    const { value } = req.body;
    
    if (value === undefined || value === null) {
      res.status(400).json({ success: false, error: '必须提供值' });
      return;
    }

    const result = syncService.syncFromUaToModbus(nodeId, value);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.message });
      return;
    }
    res.json({ success: true, data: { nodeId, value } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/logs', (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const status = req.query.status as string | undefined;
    const logs = syncService.getSyncLogs(limit, status);
    res.json({ success: true, data: logs });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/retry', (req: Request, res: Response) => {
  try {
    const result = syncService.retryFailedSyncs();
    res.json({ success: result.success, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.delete('/cleanup', (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
    const deletedCount = syncService.cleanupOldLogs(days);
    res.json({ success: true, data: { deletedCount } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
