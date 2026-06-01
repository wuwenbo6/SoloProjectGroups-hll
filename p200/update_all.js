const fs = require('fs');
const path = require('path');

const basePath = '/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p200';

// 1. Update shared/types.ts
const typesContent = `export interface CSVData {
  fileId: string;
  columns: string[];
  rows: Array<Record<string, string>>;
  rowCount: number;
}

export interface FieldMapping {
  latitude: string;
  longitude: string;
  rsrp?: string;
  sinr?: string;
}

export interface MetricStats {
  min: number;
  max: number;
  mean: number;
  count: number;
}

export interface CoverageStats {
  totalCells: number;
  validCells: number;
  coverageCells: number;
  coveragePercentage: number;
  coverageAreaSqKm: number;
  threshold: number;
}

export interface InterpolationResult {
  fileId: string;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  paddedBounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  stats: {
    rsrp?: MetricStats;
    sinr?: MetricStats;
  };
  coverageStats?: {
    rsrp?: CoverageStats;
  };
  power: number;
  searchRadius: number;
  gridSize: number;
  gridWidth: number;
  gridHeight: number;
  grids?: {
    rsrp?: Float64Array;
    sinr?: Float64Array;
  };
}

export interface DataPoint {
  lat: number;
  lon: number;
  rsrp?: number;
  sinr?: number;
}

export interface InterpolationParams {
  power: number;
  searchRadius: number;
  gridSize: number;
  padding?: number;
}

export type MetricType = 'rsrp' | 'sinr';

export interface UploadResponse {
  fileId: string;
  columns: string[];
  preview: Array<Record<string, string>>;
  rowCount: number;
  detectedFields: {
    latitude?: string;
    longitude?: string;
    rsrp?: string;
    sinr?: string;
  };
}

export interface InterpolateRequest {
  fileId: string;
  fieldMapping: FieldMapping;
  params: InterpolationParams;
}

export interface InterpolateResponse {
  fileId: string;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  stats: {
    rsrp?: MetricStats;
    sinr?: MetricStats;
  };
  coverageStats?: {
    rsrp?: CoverageStats;
  };
}

export interface StatsResponse {
  fileId: string;
  rowCount: number;
  stats: {
    rsrp?: MetricStats;
    sinr?: MetricStats;
  };
  coverageStats?: {
    rsrp?: CoverageStats;
  };
}

export type ColorRGB = [number, number, number];

export interface ColorStop {
  value: number;
  color: ColorRGB;
}

export const RSRP_COLOR_SCALE: ColorStop[] = [
  { value: -140, color: [255, 0, 0] },
  { value: -120, color: [255, 100, 0] },
  { value: -110, color: [255, 200, 0] },
  { value: -100, color: [255, 255, 0] },
  { value: -90, color: [150, 255, 0] },
  { value: -80, color: [0, 255, 100] },
  { value: -70, color: [0, 200, 200] },
  { value: -50, color: [0, 100, 255] },
];

export const SINR_COLOR_SCALE: ColorStop[] = [
  { value: -20, color: [255, 0, 0] },
  { value: -10, color: [255, 100, 0] },
  { value: 0, color: [255, 255, 0] },
  { value: 5, color: [200, 255, 0] },
  { value: 10, color: [0, 255, 100] },
  { value: 20, color: [0, 200, 200] },
  { value: 30, color: [0, 100, 255] },
];
`;

fs.writeFileSync(path.join(basePath, 'shared/types.ts'), typesContent);
console.log('1. shared/types.ts updated');

// 2. Update api/services/idw.ts
const idwContent = `import type { DataPoint, InterpolationParams, MetricStats, CoverageStats } from '../../shared/types.js';

const EARTH_RADIUS = 6371000;
const EARTH_RADIUS_MERCATOR = 6378137;
const MERCATOR_MAX_LAT = 85.0511287798;

export function lonLatToMercator(lon: number, lat: number): { x: number; y: number } {
  const clampedLat = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));
  const x = (lon * Math.PI / 180) * EARTH_RADIUS_MERCATOR;
  const y = Math.log(Math.tan(Math.PI / 4 + clampedLat * Math.PI / 360)) * EARTH_RADIUS_MERCATOR;
  return { x, y };
}

export function mercatorToLonLat(x: number, y: number): { lon: number; lat: number } {
  const lon = (x / EARTH_RADIUS_MERCATOR) * 180 / Math.PI;
  const lat = (Math.atan(Math.sinh(y / EARTH_RADIUS_MERCATOR)) * 180 / Math.PI);
  return { lon, lat };
}

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

export function calculateCoverage(
  grid: Float64Array,
  gridWidth: number,
  gridHeight: number,
  gridSize: number,
  threshold: number = -110
): CoverageStats {
  let validCells = 0;
  let coverageCells = 0;
  const totalCells = gridWidth * gridHeight;

  for (let i = 0; i < grid.length; i++) {
    const value = grid[i];
    if (!isNaN(value)) {
      validCells++;
      if (value > threshold) {
        coverageCells++;
      }
    }
  }

  const cellAreaSqM = gridSize * gridSize;
  const coverageAreaSqM = coverageCells * cellAreaSqM;
  const coverageAreaSqKm = coverageAreaSqM / 1000000;
  const coveragePercentage = validCells > 0 ? (coverageCells / validCells) * 100 : 0;

  return {
    totalCells,
    validCells,
    coverageCells,
    coveragePercentage,
    coverageAreaSqKm,
    threshold,
  };
}

interface GridCell {
  lat: number;
  lon: number;
  value: number | null;
}

export function interpolateIDW(
  points: DataPoint[],
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  params: { power: number; searchRadius: number; gridSize: number; padding?: number },
  metric: 'rsrp' | 'sinr'
): { grid: Float64Array; gridWidth: number; gridHeight: number; stats: MetricStats; paddedBounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }; coverageStats?: CoverageStats } {
  const validPoints = points.filter((p) => p[metric] !== undefined && p[metric] !== null);
  if (validPoints.length === 0) {
    return {
      grid: new Float64Array(),
      gridWidth: 0,
      gridHeight: 0,
      stats: { min: 0, max: 0, mean: 0, count: 0 },
      paddedBounds: bounds,
    };
  }

  const values = validPoints.map((p) => p[metric] as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  const padding = params.padding ?? 0.1;
  const searchRadius = Math.max(params.searchRadius, 1000);

  const mercatorPoints = validPoints.map(p => ({
    ...lonLatToMercator(p.lon, p.lat),
    value: p[metric] as number,
  }));

  const boundsMin = lonLatToMercator(bounds.minLon, bounds.minLat);
  const boundsMax = lonLatToMercator(bounds.maxLon, bounds.maxLat);

  const xRange = boundsMax.x - boundsMin.x;
  const yRange = boundsMax.y - boundsMin.y;

  const paddingX = xRange * padding;
  const paddingY = yRange * padding;

  const paddedBoundsMercator = {
    minX: boundsMin.x - paddingX,
    maxX: boundsMax.x + paddingX,
    minY: boundsMin.y - paddingY,
    maxY: boundsMax.y + paddingY,
  };

  const paddedMinLonLat = mercatorToLonLat(paddedBoundsMercator.minX, paddedBoundsMercator.minY);
  const paddedMaxLonLat = mercatorToLonLat(paddedBoundsMercator.maxX, paddedBoundsMercator.maxY);

  const paddedBounds = {
    minLat: Math.min(paddedMinLonLat.lat, paddedMaxLonLat.lat),
    maxLat: Math.max(paddedMinLonLat.lat, paddedMaxLonLat.lat),
    minLon: Math.min(paddedMinLonLat.lon, paddedMaxLonLat.lon),
    maxLon: Math.max(paddedMinLonLat.lon, paddedMaxLonLat.lon),
  };

  const paddedXRange = paddedBoundsMercator.maxX - paddedBoundsMercator.minX;
  const paddedYRange = paddedBoundsMercator.maxY - paddedBoundsMercator.minY;

  const gridHeight = Math.ceil(paddedYRange / params.gridSize);
  const gridWidth = Math.ceil(paddedXRange / params.gridSize);

  const grid = new Float64Array(gridWidth * gridHeight);

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const mercatorX = paddedBoundsMercator.minX + (x / gridWidth) * paddedXRange;
      const mercatorY = paddedBoundsMercator.minY + (y / gridHeight) * paddedYRange;

      let weightedSum = 0;
      let weightSum = 0;

      for (const point of mercatorPoints) {
        const dx = mercatorX - point.x;
        const dy = mercatorY - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > searchRadius) {
          continue;
        }

        const d = Math.max(distance, 1);
        const weight = 1 / Math.pow(d, params.power);

        weightedSum += weight * point.value;
        weightSum += weight;
      }

      const idx = y * gridWidth + x;
      if (weightSum > 0) {
        grid[idx] = weightedSum / weightSum;
      } else {
        grid[idx] = NaN;
      }
    }
  }

  const result: { grid: Float64Array; gridWidth: number; gridHeight: number; stats: MetricStats; paddedBounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }; coverageStats?: CoverageStats } = {
    grid,
    gridWidth,
    gridHeight,
    stats: { min, max, mean, count: validPoints.length },
    paddedBounds,
  };

  if (metric === 'rsrp') {
    result.coverageStats = calculateCoverage(grid, gridWidth, gridHeight, params.gridSize, -110);
  }

  return result;
}

export function generateGrid(
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  gridSize: number
): GridCell[] {
  const latRange = bounds.maxLat - bounds.minLat;
  const lonRange = bounds.maxLon - bounds.minLon;

  const metersPerDegreeLat = 111320;
  const avgLat = (bounds.minLat + bounds.maxLat) / 2;
  const metersPerDegreeLon = 111320 * Math.cos((avgLat * Math.PI) / 180);

  const gridHeight = Math.ceil((latRange * metersPerDegreeLat) / gridSize);
  const gridWidth = Math.ceil((lonRange * metersPerDegreeLon) / gridSize);

  const cells: GridCell[] = [];

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const lat = bounds.minLat + (y / gridHeight) * latRange;
      const lon = bounds.minLon + (x / gridWidth) * lonRange;
      cells.push({ lat, lon, value: null });
    }
  }

  return cells;
}
`;

fs.writeFileSync(path.join(basePath, 'api/services/idw.ts'), idwContent);
console.log('2. api/services/idw.ts updated');

// 3. Update api/routes/interpolate.ts
const interpolateContent = `import { Router, type Request, type Response } from 'express';
import { getCSVData, setFieldMapping, setInterpolation, setDataPoints, setGrid } from '../services/cache.js';
import { interpolateIDW } from '../services/idw.js';
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
    const allGrids: Record<string, Float64Array> = {};
    const allCoverageStats: InterpolationResult['coverageStats'] = {};
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
      
      if (metric === 'rsrp' && result.coverageStats) {
        allCoverageStats.rsrp = result.coverageStats;
      }
    }
    
    const interpResult: InterpolationResult = {
      fileId,
      bounds,
      paddedBounds,
      stats: allStats,
      coverageStats: Object.keys(allCoverageStats).length > 0 ? allCoverageStats : undefined,
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
      coverageStats: Object.keys(allCoverageStats).length > 0 ? allCoverageStats : undefined,
      pointCount: dataPoints.length,
    });
  } catch (error) {
    console.error('Interpolate error:', error);
    res.status(500).json({ success: false, message: 'Failed to interpolate data' });
  }
});

export default router;
`;

fs.writeFileSync(path.join(basePath, 'api/routes/interpolate.ts'), interpolateContent);
console.log('3. api/routes/interpolate.ts updated');

// 4. Update api/routes/stats.ts
const statsContent = `import { Router, type Request, type Response } from 'express';
import { getInterpolation, getCSVData, getDataPoints } from '../services/cache.js';
import type { MetricStats, CoverageStats } from '../../shared/types.js';

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
    
    const coverageStats: {
      rsrp?: CoverageStats;
    } = {};
    
    if (interp?.stats) {
      stats.rsrp = interp.stats.rsrp;
      stats.sinr = interp.stats.sinr;
    }
    
    if (interp?.coverageStats) {
      coverageStats.rsrp = interp.coverageStats.rsrp;
    }
    
    res.json({
      success: true,
      fileId,
      rowCount: csvData.rowCount,
      pointCount: dataPoints?.length || 0,
      bounds: interp?.bounds,
      stats,
      coverageStats: Object.keys(coverageStats).length > 0 ? coverageStats : undefined,
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
`;

fs.writeFileSync(path.join(basePath, 'api/routes/stats.ts'), statsContent);
console.log('4. api/routes/stats.ts updated');

// 5. Create api/services/geotiff.ts
const geotiffContent = `import type { MetricType } from '../../shared/types.js';

export interface GeoTIFFExportParams {
  fileId: string;
  metric: MetricType;
  grid: Float64Array;
  gridWidth: number;
  gridHeight: number;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
}

function writeDoubleLE(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeDoubleLE(value, 0);
  return buf;
}

function writeUInt16LE(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value, 0);
  return buf;
}

function writeUInt32LE(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

export function generateGeoTIFF(params: GeoTIFFExportParams): Buffer {
  const { grid, gridWidth, gridHeight, bounds } = params;
  
  const pixelWidth = (bounds.maxLon - bounds.minLon) / gridWidth;
  const pixelHeight = (bounds.maxLat - bounds.minLat) / gridHeight;
  
  const tiepointLon = bounds.minLon;
  const tiepointLat = bounds.maxLat;
  
  const strips: Buffer[] = [];
  const stripOffsets: number[] = [];
  const stripByteCounts: number[] = [];
  
  for (let y = 0; y < gridHeight; y++) {
    const stripBuf = Buffer.alloc(gridWidth * 4);
    for (let x = 0; x < gridWidth; x++) {
      const idx = y * gridWidth + x;
      const value = grid[idx];
      const floatValue = isNaN(value) ? -9999 : value;
      stripBuf.writeFloatLE(floatValue, x * 4);
    }
    strips.push(stripBuf);
    stripByteCounts.push(gridWidth * 4);
  }
  
  const header = Buffer.alloc(8);
  header.write('II', 0);
  header.writeUInt16LE(42, 2);
  
  let offset = 8;
  
  const ifdEntries: Buffer[] = [];
  
  const geoKeyDirectory = Buffer.alloc(4 * 4);
  geoKeyDirectory.writeUInt16LE(1, 0);
  geoKeyDirectory.writeUInt16LE(1, 2);
  geoKeyDirectory.writeUInt16LE(0, 4);
  geoKeyDirectory.writeUInt16LE(1, 6);
  
  const geoDoubleParams = Buffer.alloc(0);
  const geoAsciiParams = Buffer.from('\\\\x00');
  
  const modelTiepoint = Buffer.alloc(48);
  modelTiepoint.writeDoubleLE(0, 0);
  modelTiepoint.writeDoubleLE(0, 8);
  modelTiepoint.writeDoubleLE(0, 16);
  modelTiepoint.writeDoubleLE(tiepointLon, 24);
  modelTiepoint.writeDoubleLE(tiepointLat, 32);
  modelTiepoint.writeDoubleLE(0, 40);
  
  const modelPixelScale = Buffer.alloc(24);
  modelPixelScale.writeDoubleLE(pixelWidth, 0);
  modelPixelScale.writeDoubleLE(pixelHeight, 8);
  modelPixelScale.writeDoubleLE(0, 16);
  
  const allGeoData = Buffer.concat([
    geoKeyDirectory,
    geoDoubleParams,
    geoAsciiParams,
    modelTiepoint,
    modelPixelScale,
  ]);
  
  const imageDataOffset = offset + 8 + 2 + 12 * 14 + 4;
  let currentOffset = imageDataOffset;
  
  for (let i = 0; i < strips.length; i++) {
    stripOffsets.push(currentOffset);
    currentOffset += strips[i].length;
  }
  
  function addIFDEntry(
    tag: number,
    type: number,
    count: number,
    values: number[] | Buffer,
    dataOffset: number
  ): { entry: Buffer; data: Buffer; newOffset: number } {
    const entry = Buffer.alloc(12);
    entry.writeUInt16LE(tag, 0);
    entry.writeUInt16LE(type, 2);
    entry.writeUInt32LE(count, 4);
    
    let extraData = Buffer.alloc(0);
    let valueOffset = dataOffset;
    
    if (type === 3 && count === 1 && typeof values === 'object' && !Buffer.isBuffer(values)) {
      entry.writeUInt16LE(values[0], 8);
    } else if (type === 4 && count === 1 && typeof values === 'object' && !Buffer.isBuffer(values)) {
      entry.writeUInt32LE(values[0], 8);
    } else if (type === 5 && count === 1 && typeof values === 'object' && !Buffer.isBuffer(values)) {
      entry.writeUInt32LE(values[0], 8);
    } else if (Buffer.isBuffer(values)) {
      entry.writeUInt32LE(dataOffset, 8);
      extraData = values;
      valueOffset = dataOffset + values.length;
    } else {
      entry.writeUInt32LE(dataOffset, 8);
      const buf = Buffer.alloc(count * (type === 3 ? 2 : type === 4 ? 4 : 8));
      for (let i = 0; i < count; i++) {
        if (type === 3) buf.writeUInt16LE(values[i], i * 2);
        else if (type === 4) buf.writeUInt32LE(values[i], i * 4);
        else if (type === 12) buf.writeDoubleLE(values[i], i * 8);
      }
      extraData = buf;
      valueOffset = dataOffset + buf.length;
    }
    
    return { entry, data: extraData, newOffset: valueOffset };
  }
  
  const ifdData: Buffer[] = [];
  let ifdDataOffset = currentOffset;
  
  function createEntry(tag: number, type: number, count: number, values: number[] | Buffer) {
    const { entry, data, newOffset } = addIFDEntry(tag, type, count, values, ifdDataOffset);
    ifdEntries.push(entry);
    if (data.length > 0) {
      ifdData.push(data);
      ifdDataOffset = newOffset;
    }
  }
  
  createEntry(256, 4, 1, [gridWidth]);
  createEntry(257, 4, 1, [gridHeight]);
  createEntry(258, 3, 1, [32]);
  createEntry(339, 3, 1, [3]);
  createEntry(262, 3, 1, [1]);
  createEntry(278, 4, 1, [1]);
  createEntry(282, 5, 1, [1]);
  createEntry(283, 5, 1, [1]);
  createEntry(296, 3, 1, [1]);
  
  const stripOffsetsBuf = Buffer.alloc(stripOffsets.length * 4);
  for (let i = 0; i < stripOffsets.length; i++) {
    stripOffsetsBuf.writeUInt32LE(stripOffsets[i], i * 4);
  }
  createEntry(273, 4, stripOffsets.length, stripOffsetsBuf);
  
  const stripByteCountsBuf = Buffer.alloc(stripByteCounts.length * 4);
  for (let i = 0; i < stripByteCounts.length; i++) {
    stripByteCountsBuf.writeUInt32LE(stripByteCounts[i], i * 4);
  }
  createEntry(279, 4, stripByteCounts.length, stripByteCountsBuf);
  
  createEntry(33922, 12, 6, modelTiepoint);
  createEntry(33550, 12, 3, modelPixelScale);
  
  const geoKeyDirOffset = ifdDataOffset;
  ifdData.push(geoKeyDirectory);
  ifdDataOffset += geoKeyDirectory.length;
  const geoKeyEntry = Buffer.alloc(12);
  geoKeyEntry.writeUInt16LE(34735, 0);
  geoKeyEntry.writeUInt16LE(3, 2);
  geoKeyEntry.writeUInt32LE(geoKeyDirectory.length / 2, 4);
  geoKeyEntry.writeUInt32LE(geoKeyDirOffset, 8);
  ifdEntries.push(geoKeyEntry);
  
  header.writeUInt32LE(imageDataOffset, 4);
  
  const ifdCount = Buffer.alloc(2);
  ifdCount.writeUInt16LE(ifdEntries.length, 0);
  
  const nextIFDOffset = Buffer.alloc(4);
  nextIFDOffset.writeUInt32LE(0, 0);
  
  const allParts: Buffer[] = [
    header,
    ...strips,
    ifdCount,
    ...ifdEntries,
    nextIFDOffset,
    ...ifdData,
  ];
  
  return Buffer.concat(allParts);
}
`;

fs.writeFileSync(path.join(basePath, 'api/services/geotiff.ts'), geotiffContent);
console.log('5. api/services/geotiff.ts created');

// 6. Update api/routes/export.ts
const exportContent = `import { Router, type Request, type Response } from 'express';
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
      bounds: interp.bounds,
      colorScale,
    });
    
    const filename = \`heatmap_\${fileId.substring(0, 8)}_\${metric}.kml\`;
    
    res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
    res.setHeader('Content-Disposition', \`attachment; filename="\${filename}"\`);
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
      bounds: interp.bounds,
    });
    
    const filename = \`heatmap_\${fileId.substring(0, 8)}_\${metric}.tif\`;
    
    res.setHeader('Content-Type', 'image/tiff');
    res.setHeader('Content-Disposition', \`attachment; filename="\${filename}"\`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    res.send(tiffBuffer);
  } catch (error) {
    console.error('GeoTIFF export error:', error);
    res.status(500).json({ success: false, message: 'Failed to export GeoTIFF' });
  }
});

export default router;
`;

fs.writeFileSync(path.join(basePath, 'api/routes/export.ts'), exportContent);
console.log('6. api/routes/export.ts updated');

// 7. Update src/store/useAppStore.ts
const storeContent = `import { create } from 'zustand';
import type { FieldMapping, InterpolationParams, InterpolateResponse, MetricType, CoverageStats } from '../../shared/types';

interface AppState {
  fileId: string | null;
  columns: string[];
  preview: Array<Record<string, string>>;
  rowCount: number;
  detectedFields: {
    latitude?: string;
    longitude?: string;
    rsrp?: string;
    sinr?: string;
  };
  fieldMapping: FieldMapping;
  params: InterpolationParams;
  interpolationResult: InterpolateResponse | null;
  currentMetric: MetricType;
  showMarkers: boolean;
  isUploading: boolean;
  isInterpolating: boolean;
  error: string | null;

  setFileUpload: (data: {
    fileId: string;
    columns: string[];
    preview: Array<Record<string, string>>;
    rowCount: number;
    detectedFields: {
      latitude?: string;
      longitude?: string;
      rsrp?: string;
      sinr?: string;
    };
  }) => void;
  setFieldMapping: (mapping: Partial<FieldMapping>) => void;
  setParams: (params: Partial<InterpolationParams>) => void;
  setInterpolationResult: (result: InterpolateResponse) => void;
  setCurrentMetric: (metric: MetricType) => void;
  setShowMarkers: (show: boolean) => void;
  setIsUploading: (isUploading: boolean) => void;
  setIsInterpolating: (isInterpolating: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  fileId: null,
  columns: [],
  preview: [],
  rowCount: 0,
  detectedFields: {},
  fieldMapping: {
    latitude: '',
    longitude: '',
    rsrp: '',
    sinr: '',
  },
  params: {
    power: 2,
    searchRadius: 500,
    gridSize: 20,
  },
  interpolationResult: null,
  currentMetric: 'rsrp',
  showMarkers: false,
  isUploading: false,
  isInterpolating: false,
  error: null,

  setFileUpload: (data) =>
    set({
      fileId: data.fileId,
      columns: data.columns,
      preview: data.preview,
      rowCount: data.rowCount,
      detectedFields: data.detectedFields,
      fieldMapping: {
        latitude: data.detectedFields.latitude || '',
        longitude: data.detectedFields.longitude || '',
        rsrp: data.detectedFields.rsrp || '',
        sinr: data.detectedFields.sinr || '',
      },
    }),

  setFieldMapping: (mapping) =>
    set((state) => ({
      fieldMapping: { ...state.fieldMapping, ...mapping },
    })),

  setParams: (params) =>
    set((state) => ({
      params: { ...state.params, ...params },
    })),

  setInterpolationResult: (result) =>
    set({
      interpolationResult: result,
    }),

  setCurrentMetric: (metric) =>
    set({
      currentMetric: metric,
    }),

  setShowMarkers: (show) =>
    set({
      showMarkers: show,
    }),

  setIsUploading: (isUploading) =>
    set({
      isUploading,
    }),

  setIsInterpolating: (isInterpolating) =>
    set({
      isInterpolating,
    }),

  setError: (error) =>
    set({
      error,
    }),

  reset: () =>
    set({
      fileId: null,
      columns: [],
      preview: [],
      rowCount: 0,
      detectedFields: {},
      fieldMapping: {
        latitude: '',
        longitude: '',
        rsrp: '',
        sinr: '',
      },
      params: {
        power: 2,
        searchRadius: 500,
        gridSize: 20,
      },
      interpolationResult: null,
      currentMetric: 'rsrp',
      showMarkers: false,
      isUploading: false,
      isInterpolating: false,
      error: null,
    }),
}));
`;

fs.writeFileSync(path.join(basePath, 'src/store/useAppStore.ts'), storeContent);
console.log('7. src/store/useAppStore.ts updated');

// 8. Update src/pages/Heatmap.tsx
const heatmapContent = fs.readFileSync(path.join(basePath, 'src/pages/Heatmap.tsx'), 'utf8');

let updatedHeatmapContent = heatmapContent;

// Update StatsPanel props and content
const oldStatsPanel = `const StatsPanel: React.FC<{
  metric: MetricType;
  stats?: { min: number; max: number; mean: number; count: number };
  pointCount: number;
}> = ({ metric, stats, pointCount }) => {
  if (!stats) return null;

  const unit = metric === 'rsrp' ? 'dBm' : 'dB';

  return (
    <div className="absolute top-4 left-4 z-[1000] card p-4 min-w-[240px]">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="text-accent w-4 h-4" />
        <span className="text-white font-medium text-sm">统计信息</span>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">数据点数量</span>
          <span className="text-white font-mono">{pointCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">最小值</span>
          <span className="text-red-400 font-mono">{stats.min.toFixed(1)} {unit}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">最大值</span>
          <span className="text-green-400 font-mono">{stats.max.toFixed(1)} {unit}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">平均值</span>
          <span className="text-accent font-mono">{stats.mean.toFixed(1)} {unit}</span>
        </div>
      </div>
    </div>
  );
};`;

const newStatsPanel = `const StatsPanel: React.FC<{
  metric: MetricType;
  stats?: { min: number; max: number; mean: number; count: number };
  coverageStats?: { coveragePercentage: number; coverageAreaSqKm: number; threshold: number };
  pointCount: number;
}> = ({ metric, stats, coverageStats, pointCount }) => {
  if (!stats) return null;

  const unit = metric === 'rsrp' ? 'dBm' : 'dB';

  return (
    <div className="absolute top-4 left-4 z-[1000] card p-4 min-w-[260px]">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="text-accent w-4 h-4" />
        <span className="text-white font-medium text-sm">统计信息</span>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">数据点数量</span>
          <span className="text-white font-mono">{pointCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">最小值</span>
          <span className="text-red-400 font-mono">{stats.min.toFixed(1)} {unit}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">最大值</span>
          <span className="text-green-400 font-mono">{stats.max.toFixed(1)} {unit}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">平均值</span>
          <span className="text-accent font-mono">{stats.mean.toFixed(1)} {unit}</span>
        </div>
        {coverageStats && (
          <>
            <div className="h-px bg-gray-700 my-3" />
            <div className="flex items-center gap-2 mb-2">
              <Signal className="text-accent w-4 h-4" />
              <span className="text-white font-medium text-sm">RSRP 覆盖统计</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">覆盖阈值</span>
              <span className="text-white font-mono">{coverageStats.threshold} dBm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">覆盖百分比</span>
              <span className="text-green-400 font-mono">{coverageStats.coveragePercentage.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">覆盖面积</span>
              <span className="text-accent font-mono">{coverageStats.coverageAreaSqKm.toFixed(2)} km²</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};`;

updatedHeatmapContent = updatedHeatmapContent.replace(oldStatsPanel, newStatsPanel);

// Update StatsPanel usage
const oldStatsPanelUsage = `        <StatsPanel
          metric={effectiveMetric}
          stats={interpolationResult.stats[effectiveMetric]}
          pointCount={dataPoints.length}
        />`;

const newStatsPanelUsage = `        <StatsPanel
          metric={effectiveMetric}
          stats={interpolationResult.stats[effectiveMetric]}
          coverageStats={interpolationResult.coverageStats?.rsrp}
          pointCount={dataPoints.length}
        />`;

updatedHeatmapContent = updatedHeatmapContent.replace(oldStatsPanelUsage, newStatsPanelUsage);

fs.writeFileSync(path.join(basePath, 'src/pages/Heatmap.tsx'), updatedHeatmapContent);
console.log('8. src/pages/Heatmap.tsx updated');

console.log('\\nAll files updated successfully!');
