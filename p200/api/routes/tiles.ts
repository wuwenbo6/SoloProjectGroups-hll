import { Router, type Request, type Response } from 'express';
import { getInterpolation, getGrid } from '../services/cache.js';
import { generateTile } from '../services/tiles.js';
import type { MetricType } from '../../shared/types.js';

const router = Router();

router.get('/:fileId/:metric/:z/:x/:y', (req: Request, res: Response) => {
  try {
    const { fileId, metric, z, x, y } = req.params;
    
    if (!fileId || !metric || !z || !x || !y) {
      res.status(400).json({ success: false, message: 'Missing parameters' });
      return;
    }
    
    if (metric !== 'rsrp' && metric !== 'sinr') {
      res.status(400).json({ success: false, message: 'Invalid metric' });
      return;
    }
    
    const interp = getInterpolation(fileId);
    if (!interp) {
      res.status(404).json({ success: false, message: 'Interpolation not found' });
      return;
    }
    
    const grid = getGrid(fileId, metric as MetricType);
    if (!grid) {
      res.status(404).json({ success: false, message: 'Grid not found' });
      return;
    }
    
    const zNum = parseInt(z, 10);
    const xNum = parseInt(x, 10);
    const yNum = parseInt(y, 10);
    
    if (isNaN(zNum) || isNaN(xNum) || isNaN(yNum)) {
      res.status(400).json({ success: false, message: 'Invalid tile coordinates' });
      return;
    }
    
    const pngBuffer = generateTile(grid, interp, metric as MetricType, zNum, xNum, yNum);
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(pngBuffer);
  } catch (error) {
    console.error('Tile generation error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate tile' });
  }
});

export default router;
