import { levenbergMarquardt } from 'ml-levenberg-marquardt';
import { DataPoint, MOSFETParameters, FitStatistics, FitResult } from '../../shared/types';

function calculateRSquared(measured: number[], predicted: number[]): number {
  const n = measured.length;
  const meanMeasured = measured.reduce((a, b) => a + b, 0) / n;
  const ssTotal = measured.reduce((acc, val) => acc + Math.pow(val - meanMeasured, 2), 0);
  const ssResidual = measured.reduce((acc, val, idx) => acc + Math.pow(val - predicted[idx], 2), 0);
  return 1 - ssResidual / ssTotal;
}

function calculateRMSE(measured: number[], predicted: number[]): number {
  const n = measured.length;
  const sumSquared = measured.reduce((acc, val, idx) => acc + Math.pow(val - predicted[idx], 2), 0);
  return Math.sqrt(sumSquared / n);
}

function estimateInitialMOSFET(data: DataPoint[]): { KP: number; VTO: number; LAMBDA: number } {
  const n = data.length;
  const voltages = data.map(d => d.v);
  const currents = data.map(d => d.i);

  let sqrtI: number[] = [];
  let vgsArr: number[] = [];
  for (let i = 0; i < n; i++) {
    if (currents[i] > 0) {
      sqrtI.push(Math.sqrt(currents[i]));
      vgsArr.push(voltages[i]);
    }
  }

  if (sqrtI.length < 3) {
    return { KP: 0.02, VTO: 1.0, LAMBDA: 0.02 };
  }

  const xMean = vgsArr.reduce((a, b) => a + b, 0) / vgsArr.length;
  const yMean = sqrtI.reduce((a, b) => a + b, 0) / sqrtI.length;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < vgsArr.length; i++) {
    numerator += (vgsArr[i] - xMean) * (sqrtI[i] - yMean);
    denominator += Math.pow(vgsArr[i] - xMean, 2);
  }

  if (denominator === 0) {
    return { KP: 0.02, VTO: 1.0, LAMBDA: 0.02 };
  }

  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;
  const KP_est = Math.max(1e-6, Math.min(1, 2 * slope * slope));
  const VTO_est = Math.max(-5, Math.min(5, -intercept / slope));

  return { KP: KP_est, VTO: VTO_est, LAMBDA: 0.02 };
}

export function fitMOSFETModel(data: DataPoint[]): FitResult {
  const voltages = data.map(d => d.v);
  const currents = data.map(d => d.i);
  const initialGuess = estimateInitialMOSFET(data);

  function mosfetModel(params: number[]) {
    const [KP, VTO, LAMBDA] = params;
    return (vgs: number) => {
      const vov = vgs - VTO;
      if (vov <= 0) return 0;
      return KP / 2 * vov * vov * (1 + LAMBDA * Math.max(vgs, 0));
    };
  }

  const options = {
    initialValues: [initialGuess.KP, initialGuess.VTO, initialGuess.LAMBDA],
    minValues: [1e-6, -5, 1e-4],
    maxValues: [1, 5, 1],
    damping: 1.5,
    maxIterations: 200,
    errorTolerance: 1e-12,
    gradientDifference: [1e-6, 1e-4, 1e-4],
    centralDifference: true,
  };

  const result = levenbergMarquardt({ x: voltages, y: currents }, mosfetModel, options);
  const [KP, VTO, LAMBDA] = result.parameterValues;

  const parameters: MOSFETParameters = {
    KP,
    VTO,
    LAMBDA,
    W: 1e-4,
    L: 1e-6,
  };

  const predictedCurrents = voltages.map(v => {
    const vov = v - VTO;
    if (vov <= 0) return 0;
    return KP / 2 * vov * vov * (1 + LAMBDA * Math.max(v, 0));
  });
  const fittedData = voltages.map((v, i) => ({ v, i: predictedCurrents[i] }));

  const statistics: FitStatistics = {
    rSquared: calculateRSquared(currents, predictedCurrents),
    rmse: calculateRMSE(currents, predictedCurrents),
  };

  return { modelType: 'mosfet', parameters, fittedCurve: fittedData, statistics, spiceStatement: '' };
}
