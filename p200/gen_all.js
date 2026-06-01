const fs = require("fs");

// ==================== idw.ts ====================
const idwContent = `import type { DataPoint, InterpolationParams, MetricStats } from "../../shared/types.js";

const EARTH_RADIUS = 6371000;

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
