import type { UWBDataPoint, Statistics } from '../../shared/types';

function calculateBasicStats(values: number[]): {
  mean: number;
  variance: number;
  stdDev: number;
  min: number;
  max: number;
} {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return { mean, variance, stdDev, min, max };
}

export function calculateStatistics(
  originalData: UWBDataPoint[],
  filteredData: UWBDataPoint[]
): Statistics {
  const originalDistances = originalData.map((d) => d.distance);
  const filteredDistances = filteredData.map((d) => d.distance);

  const originalStats = calculateBasicStats(originalDistances);
  const filteredStats = calculateBasicStats(filteredDistances);

  const stdDevReduction = originalStats.stdDev > 0
    ? ((originalStats.stdDev - filteredStats.stdDev) / originalStats.stdDev) * 100
    : 0;

  const varianceReduction = originalStats.variance > 0
    ? ((originalStats.variance - filteredStats.variance) / originalStats.variance) * 100
    : 0;

  return {
    original: originalStats,
    filtered: filteredStats,
    improvement: {
      stdDevReduction: Math.round(stdDevReduction * 100) / 100,
      varianceReduction: Math.round(varianceReduction * 100) / 100,
    },
  };
}
