#!/usr/bin/env python3

content = '''import { create } from "zustand";
import { Complex } from "@/utils/fft";
import {
  generateBits, ofdmModulate, addCp, addAwgn,
  removeCp, ofdmDemodulate, channelEstimateAndEqualize, extractDataSubcarriersWithPilots,
  calculateBer, computeSpectrum, getBitsPerSymbol, modulate, demodulate, ModulationType,
} from "@/utils/signal";

export interface OfdmParams {
  fftSize: number;
  cpLength: number;
  snrDb: number;
  numSymbols: number;
  pilotInterval: number;
  useEqualization: boolean;
  modulationType: ModulationType;
  numRbs: number;
}

export interface RbGridInfo {
  subcarrier: number;
  symbol: number;
  type: 'data' | 'pilot' | 'unused';
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
  modulationType: ModulationType;
  rbGrid: RbGridInfo[];
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

function buildRbGrid(fftSize: number, pilotInterval: number, numSymbols: number): RbGridInfo[] {
  const grid: RbGridInfo[] = [];
  const half = fftSize / 2;
  const maxData = half - 1;

  for (let sc = 1; sc <= maxData; sc++) {
    for (let sym = 0; sym < numSymbols; sym++) {
      let type: 'data' | 'pilot' | 'unused' = 'unused';
      if (sc % pilotInterval === 1 || sc === 1) {
        type = 'pilot';
      } else if (sym < numSymbols) {
        type = 'data';
      }
      grid.push({ subcarrier: sc, symbol: sym, type });
    }
  }
  return grid;
}

function runOfdm(params: OfdmParams): OfdmResult {
  const bitsPerSymbol = getBitsPerSymbol(params.modulationType);
  const numBits = params.numSymbols * bitsPerSymbol;
  const txBits = generateBits(numBits);
  const txSymbols = modulate(txBits, params.modulationType);

  const { timeDomain, pilotIndices, pilotValues } = ofdmModulate(txSymbols, params.fftSize, params.pilotInterval);
  const withCp = addCp(timeDomain, params.cpLength);
  const withNoise = addAwgn(withCp, params.snrDb);
  const withoutCp = removeCp(withNoise, params.cpLength, params.fftSize);
  const freqDomain = ofdmDemodulate(withoutCp);
  const postEqFreq = params.useEqualization ? channelEstimateAndEqualize(freqDomain, pilotIndices, pilotValues, params.fftSize) : freqDomain;
  const rxSymbols = extractDataSubcarriersWithPilots(postEqFreq, params.numSymbols, params.pilotInterval);
  const rxBits = demodulate(rxSymbols, params.modulationType);

  const spectrum = computeSpectrum(withoutCp);
  const ber = calculateBer(txBits, rxBits);
  const rbGrid = buildRbGrid(params.fftSize, params.pilotInterval, params.numSymbols);

  return {
    txSignal: timeDomain,
    rxSignal: withoutCp,
    txSymbols,
    rxSymbols,
    txBits,
    rxBits,
    spectrum,
    ber,
    pilotIndices,
    freqDomain: postEqFreq,
    modulationType: params.modulationType,
    rbGrid,
  };
}

export const useSignalStore = create<SignalStore>((set, get) => ({
  params: {
    fftSize: 64,
    cpLength: 16,
    snrDb: 20,
    numSymbols: 24,
    pilotInterval: 4,
    useEqualization: true,
    modulationType: 'QPSK',
    numRbs: 4,
  },
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
'''

with open('/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p202/src/store/signalStore.ts', 'w') as f:
    f.write(content)
print('Done')
