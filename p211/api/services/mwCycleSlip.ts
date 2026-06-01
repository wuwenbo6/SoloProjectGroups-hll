import type { RawxEpoch, RawxMeasurement, ParsedUbxFile } from './ubxParser.js'
import { getSignalConfig, getGlonassFrequency } from './gnssConfig.js'

const C = 299792458;

export interface MWEpochValue {
  epochIndex: number;
  time: string;
  mwValue: number;
  phaseDiff: number;
  rangeDiff: number;
  hasHalfCycle: boolean;
  halfCycleF1: boolean;
  halfCycleF2: boolean;
}

export interface CycleSlipEvent {
  epochIndex: number;
  time: string;
  jumpSize: number;
  detectedByMW: boolean;
  detectedByHalfCycle: boolean;
}

export interface SatelliteMWResult {
  system: string;
  svId: number;
  signalType1: string;
  signalType2: string;
  mwData: MWEpochValue[];
  meanMW: number;
  stdMW: number;
  cycleSlips: CycleSlipEvent[];
  halfCycleCount: number;
}

function getWavelength(meas: RawxMeasurement): number | null {
  if (meas.gnssId === 6) {
    const freq = meas.sigId === 0 || meas.sigId === 1
      ? getGlonassFrequency(meas.freqId, 'G1')
      : getGlonassFrequency(meas.freqId, 'G2');
    return C / freq;
  }
  const config = getSignalConfig(meas.gnssId, meas.sigId);
  return config?.wavelength ?? null;
}

function hasHalfCycle(trkStat: number): boolean {
  return (trkStat & 0x01) !== 0;
}

function getFrequencyBand(meas: RawxMeasurement): string | null {
  if (meas.gnssId === 6) {
    return meas.sigId === 0 || meas.sigId === 1 ? 'L1' : 'L2';
  }
  const config = getSignalConfig(meas.gnssId, meas.sigId);
  return config?.band ?? null;
}

function findDualFreqSignals(measurements: RawxMeasurement[]): [RawxMeasurement, RawxMeasurement][] {
  const byBand = new Map<string, RawxMeasurement>();
  
  for (const meas of measurements) {
    const band = getFrequencyBand(meas);
    if (!band) continue;
    if (!byBand.has(band)) {
      byBand.set(band, meas);
    }
  }

  const pairs: [RawxMeasurement, RawxMeasurement][] = [];
  const bands = Array.from(byBand.keys()).sort();
  
  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      const m1 = byBand.get(bands[i])!;
      const m2 = byBand.get(bands[j])!;
      pairs.push([m1, m2]);
    }
  }
  
  return pairs;
}

export function detectCycleSlipsMW(
  mwData: MWEpochValue[],
  threshold: number = 4.0
): CycleSlipEvent[] {
  const slips: CycleSlipEvent[] = [];
  if (mwData.length < 2) return slips;

  for (let i = 1; i < mwData.length; i++) {
    const prev = mwData[i - 1];
    const curr = mwData[i];
    
    const diff = Math.abs(curr.mwValue - prev.mwValue);
    const halfCycleChange = prev.hasHalfCycle !== curr.hasHalfCycle ||
                           prev.halfCycleF1 !== curr.halfCycleF1 ||
                           prev.halfCycleF2 !== curr.halfCycleF2;
    
    if (diff > threshold || halfCycleChange) {
      slips.push({
        epochIndex: curr.epochIndex,
        time: curr.time,
        jumpSize: diff,
        detectedByMW: diff > threshold,
        detectedByHalfCycle: halfCycleChange,
      });
    }
  }
  
  return slips;
}

export function computeMWCombination(
  meas1: RawxMeasurement,
  meas2: RawxMeasurement,
  epochIndex: number,
  time: string
): MWEpochValue | null {
  if (!meas1.prMes || !meas2.prMes || !meas1.cpMes || !meas2.cpMes) {
    return null;
  }

  const lambda1 = getWavelength(meas1);
  const lambda2 = getWavelength(meas2);
  if (!lambda1 || !lambda2) return null;

  const cp1Cycles = meas1.cpMes;
  const cp2Cycles = meas2.cpMes;
  const phaseDiffMeters = (cp1Cycles - cp2Cycles) * lambda1 * lambda2 / (lambda1 - lambda2);
  const rangeDiffMeters = (meas1.prMes + meas2.prMes) / 2;
  
  const mwValue = phaseDiffMeters - rangeDiffMeters;

  return {
    epochIndex,
    time,
    mwValue,
    phaseDiff: phaseDiffMeters,
    rangeDiff: rangeDiffMeters,
    hasHalfCycle: hasHalfCycle(meas1.trkStat) || hasHalfCycle(meas2.trkStat),
    halfCycleF1: hasHalfCycle(meas1.trkStat),
    halfCycleF2: hasHalfCycle(meas2.trkStat),
  };
}

export function analyzeMW(parsedData: ParsedUbxFile): SatelliteMWResult[] {
  const satMWData = new Map<string, {
    system: string;
    svId: number;
    signalType1: string;
    signalType2: string;
    mwValues: MWEpochValue[];
  }>();

  for (let epochIdx = 0; epochIdx < parsedData.epochs.length; epochIdx++) {
    const epoch = parsedData.epochs[epochIdx];
    
    const measBySat = new Map<string, RawxMeasurement[]>();
    for (const meas of epoch.measurements) {
      const key = `${meas.system}_${meas.svId}`;
      const list = measBySat.get(key) ?? [];
      list.push(meas);
      measBySat.set(key, list);
    }

    for (const [satKey, measurements] of measBySat) {
      const pairs = findDualFreqSignals(measurements);
      
      for (const [meas1, meas2] of pairs) {
        const mwKey = `${satKey}_${meas1.rinexSignal}_${meas2.rinexSignal}`;
        
        if (!satMWData.has(mwKey)) {
          satMWData.set(mwKey, {
            system: meas1.system,
            svId: meas1.svId,
            signalType1: meas1.rinexSignal,
            signalType2: meas2.rinexSignal,
            mwValues: [],
          });
        }

        const mwValue = computeMWCombination(meas1, meas2, epochIdx, epoch.time);
        if (mwValue) {
          satMWData.get(mwKey)!.mwValues.push(mwValue);
        }
      }
    }
  }

  const results: SatelliteMWResult[] = [];

  for (const data of satMWData.values()) {
    const mwValues = data.mwValues;
    if (mwValues.length === 0) continue;

    const values = mwValues.map(m => m.mwValue);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);

    const cycleSlips = detectCycleSlipsMW(mwValues, Math.max(4, std * 3));
    const halfCycleCount = mwValues.filter(m => m.hasHalfCycle).length;

    results.push({
      system: data.system,
      svId: data.svId,
      signalType1: data.signalType1,
      signalType2: data.signalType2,
      mwData: mwValues,
      meanMW: mean,
      stdMW: std,
      cycleSlips,
      halfCycleCount,
    });
  }

  results.sort((a, b) => a.system.localeCompare(b.system) || a.svId - b.svId);
  return results;
}

export function hasHalfCycleFlag(trkStat: number): boolean {
  return (trkStat & 0x01) !== 0;
}

export function isLossOfLock(trkStat: number): boolean {
  return (trkStat & 0x02) !== 0;
}

export function isCodeOrPhaseValid(trkStat: number): boolean {
  return (trkStat & 0x04) !== 0;
}
