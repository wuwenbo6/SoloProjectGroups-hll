export type ModulatorOrder = 1 | 2;

export interface SimulationParams {
  signalFrequency: number;
  signalAmplitude: number;
  oversampleRatio: number;
  numCycles: number;
  samplesPerCycle: number;
  order: ModulatorOrder;
}

export interface SimulationResult {
  inputSignal: Float64Array;
  outputBits: Float64Array;
  integratorState: Float64Array;
  integrator2State: Float64Array;
  quantNoise: Float64Array;
  time: Float64Array;
  sampleRate: number;
  totalSamples: number;
  order: ModulatorOrder;
}

function runFirstOrder(params: SimulationParams): SimulationResult {
  const { signalFrequency, signalAmplitude, oversampleRatio, numCycles, samplesPerCycle } = params;
  const sampleRate = signalFrequency * samplesPerCycle * oversampleRatio;
  const totalSamples = Math.min(numCycles * samplesPerCycle * oversampleRatio, 131072);

  const inputSignal = new Float64Array(totalSamples);
  const outputBits = new Float64Array(totalSamples);
  const integratorState = new Float64Array(totalSamples);
  const integrator2State = new Float64Array(totalSamples);
  const quantNoise = new Float64Array(totalSamples);
  const time = new Float64Array(totalSamples);

  let integrator = 0;
  let prevOutput = 0;

  for (let n = 0; n < totalSamples; n++) {
    time[n] = n / sampleRate;
    inputSignal[n] = signalAmplitude * Math.sin(2 * Math.PI * signalFrequency * time[n]);

    integrator += inputSignal[n] - prevOutput;
    integratorState[n] = integrator;
    integrator2State[n] = 0;

    const quantized = integrator >= 0 ? 1 : -1;
    outputBits[n] = quantized;
    quantNoise[n] = inputSignal[n] - quantized;
    prevOutput = quantized;
  }

  return { inputSignal, outputBits, integratorState, integrator2State, quantNoise, time, sampleRate, totalSamples, order: 1 };
}

function runSecondOrderCRFF(params: SimulationParams): SimulationResult {
  const { signalFrequency, signalAmplitude, oversampleRatio, numCycles, samplesPerCycle } = params;
  const sampleRate = signalFrequency * samplesPerCycle * oversampleRatio;
  const totalSamples = Math.min(numCycles * samplesPerCycle * oversampleRatio, 131072);

  const inputSignal = new Float64Array(totalSamples);
  const outputBits = new Float64Array(totalSamples);
  const integratorState = new Float64Array(totalSamples);
  const integrator2State = new Float64Array(totalSamples);
  const quantNoise = new Float64Array(totalSamples);
  const time = new Float64Array(totalSamples);

  let int1 = 0;
  let int2 = 0;
  let prevOutput = 0;

  const b0 = 1.0;
  const b1 = 2.0;
  const b2 = 1.0;
  const a1 = 2.0;
  const a2 = 1.0;
  const g1 = 0.5;
  const g2 = 0.5;

  for (let n = 0; n < totalSamples; n++) {
    time[n] = n / sampleRate;
    inputSignal[n] = signalAmplitude * Math.sin(2 * Math.PI * signalFrequency * time[n]);

    const v1 = b0 * inputSignal[n] - a1 * prevOutput;
    int1 += g1 * v1;
    integratorState[n] = int1;

    const v2 = b1 * inputSignal[n] + int1 - a2 * prevOutput;
    int2 += g2 * v2;
    integrator2State[n] = int2;

    const v = b2 * inputSignal[n] + int2;
    const quantized = v >= 0 ? 1 : -1;
    outputBits[n] = quantized;
    quantNoise[n] = inputSignal[n] - quantized;
    prevOutput = quantized;
  }

  return { inputSignal, outputBits, integratorState, integrator2State, quantNoise, time, sampleRate, totalSamples, order: 2 };
}

export function runSigmaDelta(params: SimulationParams): SimulationResult {
  if (params.order === 2) {
    return runSecondOrderCRFF(params);
  }
  return runFirstOrder(params);
}
