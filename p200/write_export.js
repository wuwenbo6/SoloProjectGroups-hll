const fs = require('fs');

const content = `import { Router, type Request, type Response } from 'express';
import { getInterpolation, getGrid } from '../services/cache.js';
import { generateKML, getColorScale } from '../services/kml.js';
import { generateGeoTIFF } from '../services/geotiff.js';
import type { MetricType } from '../../shared/types.js';

const router = Router();

router.get('/kml/:fileId/:metric', (req: Request, res: Response) => {
  try {
    const { fileId, metric } = req.params;
    if (!fileId || !metric) {
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
    const colorScale = getColorScale(metric as MetricType);
    const kmlContent = generateKML({
      fileId,
      metric: metric as MetricType,
      grid,
      gridWidth: interp.gridWidth,
      gridHeight: interp.gridHeight,
      bounds: interp.paddedBounds || interp.bounds,
      colorScale,
    });
    const filename = "heatmap_" + fileId.substring(0, 8) + "_" + metric + ".kml";
    res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
    res.setHeader('Content-Disposition', "attachment; filename=\"" + filename + "\"");
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(kmlContent);
  } catch (error) {
    console.error('KML export error:', error);
    res.status(500).json({ success: false, message: 'Failed to export KML' });
  }
});

router.get('/geotiff/:fileId/:metric', (req: Request, res: Response) => {
  try {
    const { fileId, metric } = req.params;
    if (!fileId || !metric) {
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
    const tiffBuffer = generateGeoTIFF({
      fileId,
      metric: metric as MetricType,
      grid,
      gridWidth: interp.gridWidth,
      gridHeight: interp.gridHeight,
      bounds: interp.paddedBounds || interp.bounds,
    });
    const filename = "heatmap_" + fileId.substring(0, 8) + "_" + metric + ".tif";
    res.setHeader('Content-Type', 'image/tiff');
    res.setHeader('Content-Disposition', "attachment; filename=\"" + filename + "\"");
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(tiffBuffer);
  } catch (error) {
    console.error('GeoTIFF export error:', error);
    res.status(500).json({ success: false, message: 'Failed to export GeoTIFF' });
  }
});

export default router;
`;

fs.writeFileSync('/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p200/api/routes/export.ts', content);
console.log('File written successfully');
