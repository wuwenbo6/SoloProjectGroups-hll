import { Router, Request, Response } from 'express';
import { historyService } from '../services/HistoryService';
import { HistoryQuery } from '../../shared/types';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const query: HistoryQuery = {
      nodeId: req.query.nodeId as string | undefined,
      startTime: req.query.startTime as string | undefined,
      endTime: req.query.endTime as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const history = historyService.queryHistory(query);
    res.json({ success: true, data: history });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/stats', (req: Request, res: Response) => {
  try {
    const nodeId = req.query.nodeId as string | undefined;
    const stats = historyService.getStats(nodeId);
    res.json({ success: true, data: stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/latest/:nodeId', (req: Request, res: Response) => {
  try {
    const nodeId = decodeURIComponent(req.params.nodeId);
    const history = historyService.getLatestValue(nodeId);
    if (!history) {
      res.status(404).json({ success: false, error: '没有找到该节点的历史数据' });
      return;
    }
    res.json({ success: true, data: history });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.delete('/cleanup', (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
    const deletedCount = historyService.cleanupOldRecords(days);
    res.json({ success: true, data: { deletedCount } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.delete('/:nodeId', (req: Request, res: Response) => {
  try {
    const nodeId = decodeURIComponent(req.params.nodeId);
    const deletedCount = historyService.deleteByNodeId(nodeId);
    res.json({ success: true, data: { deletedCount } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.delete('/', (req: Request, res: Response) => {
  try {
    const deletedCount = historyService.deleteAll();
    res.json({ success: true, data: { deletedCount } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
