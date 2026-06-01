import type { DataPoint, InterpolationParams, MetricStats } from '../../shared/types.js';

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

interface GridCell {
  lat: number;
  lon: number;
  value: number | null;
}

export function interpolateIDW(
  points: DataPoint[],
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  params: InterpolationParams,
  metric: 'rsrp' | 'sinr'
): { grid: Float64Array; gridWidth: number; gridHeight: number; stats: MetricStats } {
  const validPoints = points.filter((p) => p[metric] !== undefined && p[metric] !== null);
  if (validPoints.length === 0) {
    return {
      grid: new Float64Array(),
      gridWidth: 0,
      gridHeight: 0,
      stats: { min: 0, max: 0, mean: 0, count: 0 },
    };
  }

  const values = validPoints.map((p) => p[metric] as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  const latRange = bounds.maxLat - bounds.minLat;
  const lonRange = bounds.maxLon - bounds.minLon;

  const metersPerDegreeLat = 111320;
  const avgLat = (bounds.minLat + bounds.maxLat) / 2;
  const metersPerDegreeLon = 111320 * Math.cos((avgLat * Math.PI) / 180);

  const gridHeight = Math.ceil((latRange * metersPerDegreeLat) / params.gridSize);
  const gridWidth = Math.ceil((lonRange * metersPerDegreeLon) / params.gridSize);

  const grid = new Float64Array(gridWidth * gridHeight);

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const lat = bounds.minLat + (y / gridHeight) * latRange;
      const lon = bounds.minLon + (x / gridWidth) * lonRange;

      let weightedSum = 0;
      let weightSum = 0;

      for (const point of validPoints) {
        const distance = haversineDistance(lat, lon, point.lat, point.lon);

        if (distance > params.searchRadius) {
          continue;
        }

        const d = Math.max(distance, 1);
        const weight = 1 / Math.pow(d, params.power);

        weightedSum += weight * (point[metric] as number);
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

  return {
    grid,
    gridWidth,
    gridHeight,
    stats: { min, max, mean, count: validPoints.length },
  };
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
