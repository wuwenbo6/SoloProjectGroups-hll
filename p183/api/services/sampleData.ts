import { DataPoint, ModelType } from '../../shared/types';

const Vt = 0.02585;

export function generateSampleData(modelType: ModelType = 'diode'): DataPoint[] {
  switch (modelType) {
    case 'diode':
      return generateDiodeSample();
    case 'bjt':
      return generateBJTSample();
    case 'mosfet':
      return generateMOSFETSample();
    default:
      return generateDiodeSample();
  }
}

function generateDiodeSample(): DataPoint[] {
  const IS = 1e-14;
  const N = 1.2;
  const data: DataPoint[] = [];
  const numPoints = 50;

  for (let idx = 0; idx < numPoints; idx++) {
    const v = 0.3 + (idx / (numPoints - 1)) * 0.5;
    const current = IS * (Math.exp(v / (N * Vt)) - 1);
    const noise = current * (Math.random() - 0.5) * 0.05;
    data.push({ v, i: Math.max(current + noise, 1e-15) });
  }
  return data;
}

function generateBJTSample(): DataPoint[] {
  const IS = 1e-15;
  const NF = 1.0;
  const data: DataPoint[] = [];
  const numPoints = 50;

  for (let idx = 0; idx < numPoints; idx++) {
    const v = 0.4 + (idx / (numPoints - 1)) * 0.4;
    const current = IS * (Math.exp(v / (NF * Vt)) - 1);
    const noise = current * (Math.random() - 0.5) * 0.05;
    data.push({ v, i: Math.max(current + noise, 1e-15) });
  }
  return data;
}

function generateMOSFETSample(): DataPoint[] {
  const KP = 0.05;
  const VTO = 1.5;
  const LAMBDA = 0.02;
  const data: DataPoint[] = [];
  const numPoints = 50;

  for (let idx = 0; idx < numPoints; idx++) {
    const v = 1.0 + (idx / (numPoints - 1)) * 3.0;
    const vov = v - VTO;
    let current = 0;
    if (vov > 0) {
      current = KP / 2 * vov * vov * (1 + LAMBDA * v);
    }
    const noise = current * (Math.random() - 0.5) * 0.05;
    data.push({ v, i: Math.max(current + noise, 1e-15) });
  }
  return data;
}
