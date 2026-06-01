const fs = require("fs");

const idwContent = `import type { DataPoint, InterpolationParams, MetricStats } from "../../shared/types.js";

const EARTH_RADIUS = 6371000;

export function haversineDistance(
