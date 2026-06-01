import { Router, Request, Response } from 'express';
import { opcuaService } from '../services/OpcuaService';

const router = Router();

router.get('/server/status', (req: Request, res: Response) => {
  try {
    const status = opcuaService.getStatus();
    res.json({ success: true, data: status });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/server/start', async (req: Request, res: Response) => {
  try {
    const result = await opcuaService.start();
    if (!result.success) {
      res.status(400).json({ success: false, error: result.message });
      return;
    }
    res.json({ success: true, data: { message: result.message } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/server/stop', async (req: Request, res: Response) => {
  try {
    const result = await opcuaService.stop();
    if (!result.success) {
      res.status(400).json({ success: false, error: result.message });
      return;
    }
    res.json({ success: true, data: { message: result.message } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/server/restart', async (req: Request, res: Response) => {
  try {
    const result = await opcuaService.restart();
    if (!result.success) {
      res.status(400).json({ success: false, error: result.message });
      return;
    }
    res.json({ success: true, data: { message: result.message } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/nodes', (req: Request, res: Response) => {
  try {
    const tree = opcuaService.getNodeTree();
    res.json({ success: true, data: tree });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/nodes/browse', (req: Request, res: Response) => {
  try {
    const nodeId = req.query.nodeId as string | undefined;
    const node = opcuaService.browse(nodeId);
    if (!node) {
      res.status(404).json({ success: false, error: '节点不存在' });
      return;
    }
    res.json({ success: true, data: node });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/nodes/:nodeId', (req: Request, res: Response) => {
  try {
    const nodeId = decodeURIComponent(req.params.nodeId);
    const node = opcuaService.getNodeDetails(nodeId);
    if (!node) {
      res.status(404).json({ success: false, error: '节点不存在' });
      return;
    }
    res.json({ success: true, data: node });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/nodes/:nodeId/value', (req: Request, res: Response) => {
  try {
    const nodeId = decodeURIComponent(req.params.nodeId);
    const value = opcuaService.getNodeValue(nodeId);
    res.json({ success: true, data: { nodeId, value, timestamp: new Date().toISOString() } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post('/nodes/:nodeId/value', (req: Request, res: Response) => {
  try {
    const nodeId = decodeURIComponent(req.params.nodeId);
    const { value } = req.body;
    
    const result = opcuaService.setNodeValue(nodeId, value);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.message || '写入失败' });
      return;
    }
    res.json({ success: true, data: { nodeId, value } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
