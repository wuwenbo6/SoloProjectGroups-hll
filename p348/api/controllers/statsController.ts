import { Request, Response } from 'express';
import { getDashboardStats } from '../services/database/repositories';

export async function getDashboardStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    const stats = getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('[API] Error getting dashboard stats:', error);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
}
