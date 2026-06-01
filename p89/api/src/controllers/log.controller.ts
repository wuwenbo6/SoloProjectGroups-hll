import { Request, Response } from 'express';
import { logService } from '../services/log.service.js';

export const getLogs = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await logService.getLogs(limit, offset);
    res.json({ success: true, data: result.logs, total: result.total });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get logs' });
  }
};
