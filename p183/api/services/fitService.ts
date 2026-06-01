import { levenbergMarquardt } from 'ml-levenberg-marquardt';
import { DataPoint, DiodeParameters, FitStatistics, FitResult } from '../../shared/types';

const Vt = 0.02585;

export function diodeCurrent(V: number, params: DiodeParameters): number {
  const { IS, N } = params;
  return IS * (Math.exp(V / (N * Vt)) - 1);
}

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

function estimateInitialParameters(data: DataPoint[]): { IS: number; N: number } {
  const n = data.length;
  const voltages = data.map(d => d.v);
  const currents = data.map(d => d.i);
  
  const logCurrents = currents.map(i => Math.log(Math.max(i, 1e-15)));
  
  const xArr = [];
  const yArr = [];
  
  for (let i = 0; i < n; i++) {
    if (currents[i] > 1e-12 && voltages[i] > 0.1) {
      xArr.push(voltages[i]);
      yArr.push(logCurrents[i]);
    }
  }
  
  if (xArr.length < 3) {
    return { IS: 1e-14, N: 1.5 };
  }
  
  const xMean = xArr.reduce((a, b) => a + b, 0) / xArr.length;
  const yMean = yArr.reduce((a, b) => a + b, 0) / yArr.length;
  
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < xArr.length; i++) {
    numerator += (xArr[i] - xMean) * (yArr[i] - yMean);
    denominator += Math.pow(xArr[i] - xMean, 2);
  }
  
  if (denominator === 0) {
    return { IS: 1e-14, N: 1.5 };
  }
  
  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;
  
  const N_est = Math.max(0.5, Math.min(10, 1 / (slope * Vt)));
  const IS_est = Math.max(1e-20, Math.min(1e-6, Math.exp(intercept)));
  
  return { IS: IS_est, N: N_est };
}

export function fitDiodeModel(data: DataPoint[]): FitResult {
  const voltages = data.map(d => d.v);
  const currents = data.map(d => d.i);
  
  const initialGuess = estimateInitialParameters(data);
  
  function diodeModel(params: number[]) {
    const [IS, N] = params;
    return (x: number) => IS * (Math.exp(x / (N * Vt)) - 1);
  }
  
  const options = {
    initialValues: [initialGuess.IS, initialGuess.N],
    minValues: [1e-20, 0.5],
    maxValues: [1e-6, 10],
    damping: 1.5,
    maxIterations: 200,
    errorTolerance: 1e-12,
    gradientDifference: 1e-6,
    centralDifference: true,
  };
  
  const fitData = {
    x: voltages,
    y: currents
  };
  
  const result = levenbergMarquardt(fitData, diodeModel, options);
  
  const [IS, N] = result.parameterValues;
  const parameters: DiodeParameters = { IS, N };
  
  const predictedCurrents = voltages.map(v => diodeCurrent(v, parameters));
  const fittedData = voltages.map((v, i) => ({ v, i: predictedCurrents[i] }));
  
  const statistics: FitStatistics = {
    rSquared: calculateRSquared(currents, predictedCurrents),
    rmse: calculateRMSE(currents, predictedCurrents)
  };
  
  return {
    modelType: 'diode' as const,
    parameters,
    fittedCurve: fittedData,
    statistics,
    spiceStatement: ''
  };
}
