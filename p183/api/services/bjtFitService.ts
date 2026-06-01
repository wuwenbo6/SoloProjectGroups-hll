import { levenbergMarquardt } from 'ml-levenberg-marquardt';
import { DataPoint, BJTParameters, FitStatistics, FitResult } from '../../shared/types';

const Vt = 0.02585;

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

function estimateInitialBJT(data: DataPoint[]): { IS: number; BF: number; NF: number } {
  const n = data.length;
  const voltages = data.map(d => d.v);
  const currents = data.map(d => d.i);

  const logCurrents = currents.map(i => Math.log(Math.max(i, 1e-15)));
  const xArr: number[] = [];
  const yArr: number[] = [];

  for (let i = 0; i < n; i++) {
    if (currents[i] > 1e-12 && voltages[i] > 0.2) {
      xArr.push(voltages[i]);
      yArr.push(logCurrents[i]);
    }
  }

  if (xArr.length < 3) {
    return { IS: 1e-15, BF: 100, NF: 1.0 };
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
    return { IS: 1e-15, BF: 100, NF: 1.0 };
  }

  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;
  const NF_est = Math.max(0.5, Math.min(5, 1 / (slope * Vt)));
  const IS_est = Math.max(1e-20, Math.min(1e-6, Math.exp(intercept)));

  return { IS: IS_est, BF: 100, NF: NF_est };
}

export function fitBJTModel(data: DataPoint[]): FitResult {
  const voltages = data.map(d => d.v);
  const currents = data.map(d => d.i);
  const initialGuess = estimateInitialBJT(data);

  function bjtModel(params: number[]) {
    const [IS, NF] = params;
    return (vbe: number) => IS * (Math.exp(vbe / (NF * Vt)) - 1);
  }

  const options = {
    initialValues: [initialGuess.IS, initialGuess.NF],
    minValues: [1e-20, 0.5],
    maxValues: [1e-6, 5],
    damping: 1.5,
    maxIterations: 200,
    errorTolerance: 1e-12,
    gradientDifference: 1e-6,
    centralDifference: true,
  };

  const result = levenbergMarquardt({ x: voltages, y: currents }, bjtModel, options);
  const [IS, NF] = result.parameterValues;
  const BF = Math.max(1, currents.length > 0 ? Math.max(...currents) / (IS * (Math.exp(Math.max(...voltages) / (NF * Vt)) - 1)) : 100);

  const parameters: BJTParameters = {
    IS,
    BF: Math.max(Math.min(BF, 1000), 1),
    NF,
    VAF: 100,
  };

  const predictedCurrents = voltages.map(v => IS * (Math.exp(v / (NF * Vt)) - 1));
  const fittedData = voltages.map((v, i) => ({ v, i: predictedCurrents[i] }));

  const statistics: FitStatistics = {
    rSquared: calculateRSquared(currents, predictedCurrents),
    rmse: calculateRMSE(currents, predictedCurrents),
  };

  return { modelType: 'bjt', parameters, fittedCurve: fittedData, statistics, spiceStatement: '' };
}
