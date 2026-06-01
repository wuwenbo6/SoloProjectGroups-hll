import { Router, type Request, type Response } from 'express';
import { getCSVData, setFieldMapping, setInterpolation, setDataPoints, setGrid } from '../services/cache.js';
import { interpolateIDW, generateGrid } from '../services/idw.js';
import type { InterpolateRequest, DataPoint, InterpolationResult } from '../../shared/types.js';

const router = Router();

function parseCSVToPoints(
  csvData: Array<Record<string, string>>,
  fieldMapping: { latitude: string; longitude: string; rsrp?: string; sinr?: string }
): DataPoint[] {
  const points: DataPoint[] = [];
  
  for (const row of csvData) {
    const lat = parseFloat(row[fieldMapping.latitude]);
    const lon = parseFloat(row[fieldMapping.longitude]);
    
    if (isNaN(lat) || isNaN(lon)) continue;
    
    const point: DataPoint = { lat, lon };
    
    if (fieldMapping.rsrp) {
      const rsrp = parseFloat(row[fieldMapping.rsrp]);
      if (!isNaN(rsrp)) point.rsrp = rsrp;
    }
    
    if (fieldMapping.sinr) {
      const sinr = parseFloat(row[fieldMapping.sinr]);
      if (!isNaN(sinr)) point.sinr = sinr;
    }
    
    if (point.rsrp !== undefined || point.sinr !== undefined) {
      points.push(point);
    }
  }
  
  return points;
}

router.post('/', (req: Request, res: Response) => {
  try {
    const body = req.body as InterpolateRequest;
    const { fileId, fieldMapping, params } = body;
    
    if (!fileId || !fieldMapping || !params) {
      res.status(400).json({ success: false, message: 'Missing required fields' });
      return;
    }
    
    const csvData = getCSVData(fileId);
    if (!csvData) {
      res.status(404).json({ success: false, message: 'File not found' });
      return;
    }
    
    setFieldMapping(fileId, fieldMapping);
    
    const dataPoints = parseCSVToPoints(csvData.rows, fieldMapping);
    setDataPoints(fileId, dataPoints);
    
    if (dataPoints.length === 0) {
      res.status(400).json({ success: false, message: 'No valid data points found' });
      return;
    }
    
    const lats = dataPoints.map(p => p.lat);
    const lons = dataPoints.map(p => p.lon);
    const bounds = {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLon: Math.min(...lons),
      maxLon: Math.max(...lons),
    };
    
    const metrics: ('rsrp' | 'sinr')[] = [];
    if (fieldMapping.rsrp) metrics.push('rsrp');
    if (fieldMapping.sinr) metrics.push('sinr');
    
    const allStats: InterpolationResult['stats'] = {};
    const allCoverageStats: InterpolationResult['coverageStats'] = {};
    const allGrids: Record<string, Float64Array> = {};
    let gridWidth = 0;
    let gridHeight = 0;
    let paddedBounds;
    
    for (const metric of metrics) {
      const result = interpolateIDW(dataPoints, bounds, { ...params, padding: 0.1 }, metric);
      allStats[metric] = result.stats;
      allGrids[metric] = result.grid;
      gridWidth = result.gridWidth;
      gridHeight = result.gridHeight;
      setGrid(fileId, metric, result.grid);
      paddedBounds = result.paddedBounds;
      if (result.coverageStats) {
        allCoverageStats[metric] = result.coverageStats;
      }
    }
    
    const interpResult: InterpolationResult = {
      fileId,
      bounds,
      paddedBounds,
      stats: allStats,
      coverageStats: allCoverageStats,
      power: params.power,
      searchRadius: params.searchRadius,
      gridSize: params.gridSize,
      gridWidth,
      gridHeight,
      grids: allGrids,
    };
    
    setInterpolation(fileId, interpResult);
    
    res.json({
      success: true,
      fileId,
      bounds,
      paddedBounds,
      stats: allStats,
      pointCount: dataPoints.length,
    });
  } catch (error) {
    console.error('Interpolate error:', error);
    res.status(500).json({ success: false, message: 'Failed to interpolate data' });
  }
});

export default router;
