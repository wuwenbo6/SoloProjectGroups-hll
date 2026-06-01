import type { KalmanParams, UWBDataPoint } from '../../shared/types';

export function applyAdaptiveKalmanFilter(
  data: UWBDataPoint[],
  params: KalmanParams
): UWBDataPoint[] {
  if (data.length === 0) return [];

  const {
    processNoise: Q,
    measurementNoise: initialR,
    estimationError: P0,
    initialValue,
    adaptiveEnabled,
    forgettingFactor: alpha,
    lagCompensation: lagBeta,
  } = params;

  let x_hat = initialValue !== 0 ? initialValue : data[0].distance;
  let P = P0;
  let R = initialR;

  const windowSize = 10;
  const innovationBuffer: number[] = [];
  const filteredHistory: number[] = [];
  const lagWindow = Math.max(1, Math.round(lagBeta * 10));

  const filteredData: UWBDataPoint[] = data.map((point) => {
    const z = point.distance;

    const x_hat_minus = x_hat;
    const P_minus = P + Q;

    const innovation = z - x_hat_minus;

    if (adaptiveEnabled) {
      innovationBuffer.push(innovation * innovation);
      if (innovationBuffer.length > windowSize) {
        innovationBuffer.shift();
      }

      if (innovationBuffer.length >= 3) {
        const avgInnovation = innovationBuffer.reduce((a, b) => a + b, 0) / innovationBuffer.length;
        const estimatedR = Math.abs(avgInnovation - P_minus);
        R = alpha * R + (1 - alpha) * Math.max(estimatedR, 0.0001);
      }
    }

    const K = P_minus / (P_minus + R);
    x_hat = x_hat_minus + K * innovation;
    P = (1 - K) * P_minus;

    filteredHistory.push(x_hat);

    let compensatedX = x_hat;
    if (lagBeta > 0 && filteredHistory.length > lagWindow) {
      const currentIdx = filteredHistory.length - 1;
      const pastIdx = Math.max(0, currentIdx - lagWindow);
      const derivative = filteredHistory[currentIdx] - filteredHistory[pastIdx];
      const lookAhead = lagBeta * derivative;
      compensatedX = x_hat + lookAhead;
    }

    return {
      timestamp: point.timestamp,
      distance: Math.round(compensatedX * 1000) / 1000,
    };
  });

  return filteredData;
}

export function applyKalmanFilter(
  data: UWBDataPoint[],
  params: KalmanParams
): UWBDataPoint[] {
  return applyAdaptiveKalmanFilter(data, params);
}
