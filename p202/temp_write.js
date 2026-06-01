const fs = require('fs');
const content = `import { create } from "zustand";
import { Complex } from "@/utils/fft";
import {
  generateBits, qpskModulate, ofdmModulate, addCp, addAwgn,
  removeCp, ofdmDemodulate, channelEstimateAndEqualize, extractDataSubcarriersWithPilots, qpskDemodulate,
  calculateBer, computeSpectrum,
} from "@/utils/signal";

export interface OfdmParams {
  fftSize: number;
  cpLength: number;
  snrDb: number;
  numSymbols: number;
  pilotInterval: number;
  useEqualization: boolean;
}

export interface OfdmResult {
  txSignal: Complex[];
  rxSignal: Complex[];
  txSymbols: Complex[];
  rxSymbols: Complex[];
  txBits: number[];
  rxBits: number[];
  spectrum: Float64Array;
  ber: number;
  pilotIndices: number[];
  freqDomain: Complex[];
}

interface SignalStore {
  params: OfdmParams;
  result: OfdmResult | null;
  waterfallHistory: Float64Array[];
  isRunning: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
  setParams: (params: Partial<OfdmParams>) => void;
  generate: () => void;
  startContinuous: () => void;
  stopContinuous: () => void;
}

function runOfdm(params: OfdmParams): OfdmResult {
  const numBits = params.numSymbols * 2;
  const txBits = generateBits(numBits);
  const txSymbols = qpskModulate(txBits);
  const { timeDomain, pilotIndices, pilotValues } = ofdmModulate(txSymbols, params.fftSize, params.pilotInterval);
  const withCp = addCp(timeDomain, params.cpLength);
  const withNoise = addAwgn(withCp, params.snrDb);
  const withoutCp = removeCp(withNoise, params.cpLength, params.fftSize);
  const freqDomain = ofdmDemodulate(withoutCp);
  const postEqFreq = params.useEqualization ? channelEstimateAndEqualize(freqDomain, pilotIndices, pilotValues, params.fftSize) : freqDomain;
  const rxSymbols = extractDataSubcarriersWithPilots(postEqFreq, params.numSymbols, params.pilotInterval);
  const rxBits = qpskDemodulate(rxSymbols);
  const ber = calculateBer(txBits, rxBits);
  const spectrum = computeSpectrum(withoutCp);
  return {
    txSignal: timeDomain, rxSignal: withoutCp,
    txSymbols, rxSymbols, txBits, rxBits, spectrum, ber,
    pilotIndices, freqDomain: postEqFreq,
  };
}

export const useSignalStore = create<SignalStore>((set, get) => ({
  params: { fftSize: 64, cpLength: 16, snrDb: 20, numSymbols: 24, pilotInterval: 4, useEqualization: true },
  result: null,
  waterfallHistory: [],
  isRunning: false,
  intervalId: null,
  setParams: (params) => set((state) => ({ params: { ...state.params, ...params } })),
  generate: () => {
    const result = runOfdm(get().params);
    set((state) => ({
      result,
      waterfallHistory: [...state.waterfallHistory.slice(-49), result.spectrum],
    }));
  },
  startContinuous: () => {
    const { isRunning } = get();
    if (isRunning) return;
    get().generate();
    const id = setInterval(() => get().generate(), 300);
    set({ isRunning: true, intervalId: id });
  },
  stopContinuous: () => {
    const { intervalId } = get();
    if (intervalId) clearInterval(intervalId);
    set({ isRunning: false, intervalId: null });
  },
}));
`;
fs.writeFileSync('/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p202/src/store/signalStore.ts', content);
console.log('File written successfully');
