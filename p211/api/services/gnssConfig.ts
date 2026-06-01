export interface SignalConfig {
  frequency: number;
  wavelength: number;
  band: string;
  obsCode: string;
}

export interface SystemConfig {
  name: string;
  rinexId: string;
  signals: Record<number, SignalConfig>;
}

const C = 299792458;
const F1 = 1575.42e6;
const F2 = 1227.60e6;
const F5 = 1176.45e6;
const L1 = C / F1;
const L2 = C / F2;
const L5 = C / F5;

export const GNSS_SYSTEMS: Record<number, SystemConfig> = {
  0: {
    name: 'GPS',
    rinexId: 'G',
    signals: {
      0: { frequency: F1, wavelength: L1, band: 'L1', obsCode: 'C1C' },
      1: { frequency: F1, wavelength: L1, band: 'L1', obsCode: 'C1P' },
      2: { frequency: F1, wavelength: L1, band: 'L1', obsCode: 'C1Y' },
      3: { frequency: F2, wavelength: L2, band: 'L2', obsCode: 'C2W' },
      4: { frequency: F2, wavelength: L2, band: 'L2', obsCode: 'C2P' },
      5: { frequency: F2, wavelength: L2, band: 'L2', obsCode: 'C2Y' },
      6: { frequency: F5, wavelength: L5, band: 'L5', obsCode: 'C5Q' },
      7: { frequency: F5, wavelength: L5, band: 'L5', obsCode: 'C5X' },
    },
  },
  1: {
    name: 'SBAS',
    rinexId: 'S',
    signals: {
      0: { frequency: F1, wavelength: L1, band: 'L1', obsCode: 'C1C' },
    },
  },
  2: {
    name: 'Galileo',
    rinexId: 'E',
    signals: {
      0: { frequency: F1, wavelength: L1, band: 'L1', obsCode: 'C1C' },
      1: { frequency: F1, wavelength: L1, band: 'L1', obsCode: 'C1A' },
      2: { frequency: F1, wavelength: L1, band: 'L1', obsCode: 'C1B' },
      3: { frequency: F1, wavelength: L1, band: 'L1', obsCode: 'C1X' },
      5: { frequency: F5, wavelength: L5, band: 'E5a', obsCode: 'C5Q' },
      6: { frequency: F5, wavelength: L5, band: 'E5a', obsCode: 'C5X' },
      7: { frequency: 1207.14e6, wavelength: C / 1207.14e6, band: 'E5b', obsCode: 'C7Q' },
      8: { frequency: 1207.14e6, wavelength: C / 1207.14e6, band: 'E5b', obsCode: 'C7X' },
      9: { frequency: 1191.795e6, wavelength: C / 1191.795e6, band: 'E5ab', obsCode: 'C8Q' },
      10: { frequency: 1191.795e6, wavelength: C / 1191.795e6, band: 'E5ab', obsCode: 'C8X' },
      11: { frequency: 1278.75e6, wavelength: C / 1278.75e6, band: 'E6', obsCode: 'C6A' },
      12: { frequency: 1278.75e6, wavelength: C / 1278.75e6, band: 'E6', obsCode: 'C6C' },
      13: { frequency: 1278.75e6, wavelength: C / 1278.75e6, band: 'E6', obsCode: 'C6X' },
    },
  },
  3: {
    name: 'BeiDou',
    rinexId: 'C',
    signals: {
      0: { frequency: 1561.098e6, wavelength: C / 1561.098e6, band: 'B1', obsCode: 'C2I' },
      1: { frequency: 1561.098e6, wavelength: C / 1561.098e6, band: 'B1', obsCode: 'C2Q' },
      2: { frequency: 1561.098e6, wavelength: C / 1561.098e6, band: 'B1', obsCode: 'C2X' },
      3: { frequency: 1207.14e6, wavelength: C / 1207.14e6, band: 'B2', obsCode: 'C7I' },
      4: { frequency: 1207.14e6, wavelength: C / 1207.14e6, band: 'B2', obsCode: 'C7Q' },
      5: { frequency: 1207.14e6, wavelength: C / 1207.14e6, band: 'B2', obsCode: 'C7X' },
      6: { frequency: 1268.52e6, wavelength: C / 1268.52e6, band: 'B3', obsCode: 'C6I' },
      7: { frequency: 1268.52e6, wavelength: C / 1268.52e6, band: 'B3', obsCode: 'C6Q' },
      8: { frequency: 1268.52e6, wavelength: C / 1268.52e6, band: 'B3', obsCode: 'C6X' },
    },
  },
  5: {
    name: 'QZSS',
    rinexId: 'J',
    signals: {
      0: { frequency: F1, wavelength: L1, band: 'L1', obsCode: 'C1C' },
      1: { frequency: F1, wavelength: L1, band: 'L1', obsCode: 'C1P' },
      2: { frequency: F2, wavelength: L2, band: 'L2', obsCode: 'C2S' },
      3: { frequency: F2, wavelength: L2, band: 'L2', obsCode: 'C2L' },
      4: { frequency: F5, wavelength: L5, band: 'L5', obsCode: 'C5Q' },
      5: { frequency: F5, wavelength: L5, band: 'L5', obsCode: 'C5X' },
      6: { frequency: 1278.75e6, wavelength: C / 1278.75e6, band: 'LEX', obsCode: 'C6S' },
      7: { frequency: 1278.75e6, wavelength: C / 1278.75e6, band: 'LEX', obsCode: 'C6L' },
      8: { frequency: 1278.75e6, wavelength: C / 1278.75e6, band: 'LEX', obsCode: 'C6X' },
    },
  },
  6: {
    name: 'GLONASS',
    rinexId: 'R',
    signals: {
      0: { frequency: 1602.0e6, wavelength: C / 1602.0e6, band: 'G1', obsCode: 'C1C' },
      1: { frequency: 1602.0e6, wavelength: C / 1602.0e6, band: 'G1', obsCode: 'C1P' },
      2: { frequency: 1246.0e6, wavelength: C / 1246.0e6, band: 'G2', obsCode: 'C2C' },
      3: { frequency: 1246.0e6, wavelength: C / 1246.0e6, band: 'G2', obsCode: 'C2P' },
    },
  },
};

export function getSignalConfig(gnssId: number, sigId: number): SignalConfig | null {
  return GNSS_SYSTEMS[gnssId]?.signals[sigId] ?? null;
}

export function getSystemName(gnssId: number): string {
  return GNSS_SYSTEMS[gnssId]?.name ?? 'Unknown';
}

export function getRinexId(gnssId: number): string {
  return GNSS_SYSTEMS[gnssId]?.rinexId ?? 'X';
}

export function getObservationCode(gnssId: number, sigId: number, type: 'C' | 'L' | 'D' | 'S'): string {
  const config = getSignalConfig(gnssId, sigId);
  if (!config) return 'XXX';
  return type + config.obsCode.slice(1);
}

export const GLONASS_FREQ_STEP = 0.5625e6;
export const GLONASS_FREQ_BASE1 = 1602.0e6;
export const GLONASS_FREQ_BASE2 = 1246.0e6;

export function getGlonassFrequency(freqId: number, band: 'G1' | 'G2'): number {
  const base = band === 'G1' ? GLONASS_FREQ_BASE1 : GLONASS_FREQ_BASE2;
  const offset = band === 'G1' ? freqId * GLONASS_FREQ_STEP : freqId * GLONASS_FREQ_STEP * (1246/1602);
  return base + offset;
}
