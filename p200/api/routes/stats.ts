import { Router, type Request, type Response } from 'express';
import { getInterpolation, getCSVData, getDataPoints } from '../services/cache.js';
import type { MetricStats } from '../../shared/types.js';

const router = Router();

router.get('/:fileId', (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    
    if (!fileId) {
      res.status(400).json({ success: false, message: 'Missing fileId' });
      return;
    }
    
    const csvData = getCSVData(fileId);
    if (!csvData) {
      res.status(404).json({ success: false, message: 'File not found' });
      return;
    }
    
    const interp = getInterpolation(fileId);
    const dataPoints = getDataPoints(fileId);
    
    const stats: {
      rsrp?: MetricStats;
      sinr?: MetricStats;
    } = {};
    
    if (interp?.stats) {
      stats.rsrp = interp.stats.rsrp;
      stats.sinr = interp.stats.sinr;
    }
    
    res.json({
      success: true,
      fileId,
      rowCount: csvData.rowCount,
      pointCount: dataPoints?.length || 0,
      bounds: interp?.bounds,
      stats,
      coverageStats: interp?.coverageStats,
      params: interp ? {
        power: interp.power,
        searchRadius: interp.searchRadius,
        gridSize: interp.gridSize,
        gridWidth: interp.gridWidth,
        gridHeight: interp.gridHeight,
      } : undefined,
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get stats' });
  }
});

export default router;
