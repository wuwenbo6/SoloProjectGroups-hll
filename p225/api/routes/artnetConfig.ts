import express, { type Request, type Response } from 'express';
import { getConfig, updateConfig } from '../services/configService.js';
import type { ArtNetConfig } from '../../shared/types.js';

const router = express.Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const config = await getConfig();
    res.json({
      success: true,
      data: config,
    });
  } catch (err) {
    console.error('Get config error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get configuration',
    });
  }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const { ip, port, net, switch_, universe } = req.body as {
      ip?: string;
      port?: number;
      net?: number;
      switch_?: number;
      universe?: number;
    };

    const updates: Partial<ArtNetConfig> = {};

    if (ip !== undefined) {
      if (typeof ip !== 'string' || !ip.match(/^\d{1,3}(\.\d{1,3}){3}$/)) {
        res.status(400).json({
          success: false,
          error: 'Invalid IP address format',
        });
        return;
      }
      updates.targetIp = ip;
    }

    if (port !== undefined) {
      if (typeof port !== 'number' || port < 1 || port > 65535) {
        res.status(400).json({
          success: false,
          error: 'Invalid port number (must be 1-65535)',
        });
        return;
      }
      updates.targetPort = port;
    }

    if (net !== undefined) {
      if (typeof net !== 'number' || net < 0 || net > 127) {
        res.status(400).json({
          success: false,
          error: 'Invalid Net value (must be 0-127)',
        });
        return;
      }
      updates.net = net;
    }

    if (switch_ !== undefined) {
      if (typeof switch_ !== 'number' || switch_ < 0 || switch_ > 15) {
        res.status(400).json({
          success: false,
          error: 'Invalid Switch value (must be 0-15)',
        });
        return;
      }
      updates.switch_ = switch_;
    }

    if (universe !== undefined) {
      if (typeof universe !== 'number' || universe < 0 || universe > 15) {
        res.status(400).json({
          success: false,
          error: 'Invalid Universe value (must be 0-15)',
        });
        return;
      }
      updates.universe = universe;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid configuration fields provided',
      });
      return;
    }

    const config = await updateConfig(updates);

    res.json({
      success: true,
      data: config,
    });
  } catch (err) {
    console.error('Update config error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update configuration',
    });
  }
});

export default router;
