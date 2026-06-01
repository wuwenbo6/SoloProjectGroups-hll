import { create } from 'zustand';
import { runSigmaDelta, type SimulationParams, type SimulationResult, type ModulatorOrder } from '@/utils/sigmaDelta';
import { computeFFT, magnitudeToDb, type FFTResult } from '@/utils/fft';

interface SimulationState {
  params: SimulationParams;
  result: SimulationResult | null;
  fftResult: FFTResult | null;
  dbSpectrum: Float64Array | null;
  isRunning: boolean;
  amplitudeWarning: boolean;
  effectiveAmplitude: number;
  setParams: (params: Partial<SimulationParams>) => void;
  run: () => void;
  reset: () => void;
}

const MAX_SAFE_AMPLITUDE = 0.7;

export const useSimulationStore = create<SimulationState>((set, get) => ({
  params: {
    signalFrequency: 1000,
    signalAmplitude: 0.5,
    oversampleRatio: 64,
    numCycles: 64,
    samplesPerCycle: 128,
    order: 1 as ModulatorOrder,
  },
  result: null,
  fftResult: null,
  dbSpectrum: null,
  isRunning: false,
  amplitudeWarning: false,
  effectiveAmplitude: 0.5,

  setParams: (newParams) =>
    set((state) => ({
      params: { ...state.params, ...newParams },
    })),

  run: () => {
    const { params } = get();
    set({ isRunning: true });

    requestAnimationFrame(() => {
      const amplitudeWarning = params.signalAmplitude > MAX_SAFE_AMPLITUDE;
      const effectiveAmplitude = amplitudeWarning
        ? MAX_SAFE_AMPLITUDE
        : params.signalAmplitude;

      const adjustedParams = {
        ...params,
        signalAmplitude: effectiveAmplitude,
      };

      const result = runSigmaDelta(adjustedParams);
      const fftResult = computeFFT(result.outputBits, result.sampleRate, params.oversampleRatio);
      const dbSpectrum = magnitudeToDb(fftResult.magnitude);

      set({ result, fftResult, dbSpectrum, isRunning: false, amplitudeWarning, effectiveAmplitude });
    });
  },

  reset: () =>
    set({ result: null, fftResult: null, dbSpectrum: null, isRunning: false, amplitudeWarning: false, effectiveAmplitude: 0.5 }),
}));
