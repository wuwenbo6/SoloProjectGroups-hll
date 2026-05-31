import { Request, Response } from 'express';
import { dbService } from '../services/DatabaseService';

export const getLogs = (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  try {
    const result = dbService.getLogs(page, limit, userId, startDate, endDate);
    res.json(result);
  } catch (err) {
    console.error('Failed to get logs:', err);
    res.status(500).json({ error: 'Failed to get logs' });
  }
};

export const createLog = (req: Request, res: Response) => {
  const { userId, action, commandJson } = req.body;
  const ipAddress = req.ip;

  try {
    dbService.logOperation(userId, action, commandJson, ipAddress);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to create log:', err);
    res.status(500).json({ error: 'Failed to create log' });
  }
};
