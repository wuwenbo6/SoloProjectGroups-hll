import { Router, Request, Response } from 'express';
import { configService } from '../services/ConfigService';
import { SystemConfig } from '../../shared/types';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const config = configService.getConfig();
    res.json({ success: true, data: config });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.put('/', (req: Request, res: Response) => {
  try {
    const config = req.body as Partial<SystemConfig>;
    
    if (config.opcuaPort !== undefined && (config.opcuaPort < 1 || config.opcuaPort > 65535)) {
      res.status(400).json({ success: false, error: '端口号必须在1-65535之间' });
      return;
    }

    configService.updateConfig(config);
    res.json({ success: true, data: { message: '配置已更新' } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get('/:key', (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const value = configService.getValue(key);
    if (value === null) {
      res.status(404).json({ success: false, error: '配置项不存在' });
      return;
    }
    res.json({ success: true, data: { key, value } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.put('/:key', (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (value === undefined) {
      res.status(400).json({ success: false, error: '缺少value字段' });
      return;
    }

    configService.setValue(key, String(value));
    res.json({ success: true, data: { key, value } });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
