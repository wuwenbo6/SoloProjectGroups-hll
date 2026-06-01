const UBX_SYNC_1 = 0xb5;
const UBX_SYNC_2 = 0x62;
const UBX_CLASS_RAWX = 0x02;
const UBX_ID_RAWX = 0x15;

const GNSS_SYSTEM_MAP: Record<number, string> = {
  0: "G",
  1: "S",
  2: "E",
  3: "C",
  4: "I",
  5: "J",
  6: "R",
};

const RINEX_SIGNAL_MAP: Record<number, Record<number, string>> = {
  0: { 0: "C1C", 3: "L1C", 4: "S1C", 6: "C2W" },
  2: { 0: "C1C", 5: "C5Q" },
  3: { 0: "C2I", 3: "C6I", 4: "C7I" },
  6: { 0: "C1C", 2: "C2C" },
};

export interface RawxMeasurement {
  prMes: number;
  cpMes: number;
  doMes: number;
  gnssId: number;
  svId: number;
  sigId: number;
  freqId: number;
  cno: number;
  locktime: number;
  trkStat: number;
  system: string;
  rinexSignal: string;
}

export interface RawxEpoch {
  time: string;
  rcvTow: number;
  week: number;
  measurements: RawxMeasurement[];
}

export interface ParsedUbxFile {
  epochs: RawxEpoch[];
  stats: {
    epochCount: number;
    satelliteCount: number;
    signalTypes: string[];
    timeRange: { start: string; end: string } | null;
    satellites: { svId: number; system: string; signalType: string; avgSnr: number }[];
  };
}

function computeChecksum(buffer: Buffer, offset: number, length: number): [number, number] {
  let ckA = 0;
  let ckB = 0;
  for (let i = 0; i < length; i++) {
    ckA = (ckA + buffer[offset + i]) & 0xff;
    ckB = (ckB + ckA) & 0xff;
  }
  return [ckA, ckB];
}

function gpsToIso(rcvTow: number, week: number): string {
  const gpsEpoch = new Date("1980-01-06T00:00:00Z");
  const msSinceEpoch = week * 7 * 24 * 3600 * 1000 + rcvTow * 1000 - 18 * 1000;
  return new Date(gpsEpoch.getTime() + msSinceEpoch).toISOString();
}

function parseMeasurement(buffer: Buffer, offset: number): RawxMeasurement {
  const prMes = buffer.readDoubleLE(offset);
  const cpMes = buffer.readDoubleLE(offset + 8);
  const doMes = buffer.readDoubleLE(offset + 16);
  const gnssId = buffer.readUInt8(offset + 24);
  const svId = buffer.readUInt8(offset + 25);
  const sigId = buffer.readUInt8(offset + 26);
  const freqId = buffer.readUInt8(offset + 27);
  const locktime = buffer.readUInt16LE(offset + 28);
  const cno = buffer.readUInt8(offset + 30);
  const trkStat = buffer.readUInt8(offset + 31);
  const system = GNSS_SYSTEM_MAP[gnssId] ?? "X";
  const rinexSignal = RINEX_SIGNAL_MAP[gnssId]?.[sigId] ?? "XXX";
  return { prMes, cpMes, doMes, gnssId, svId, sigId, freqId, cno, locktime, trkStat, system, rinexSignal };
}

function parseRawxPayload(payload: Buffer): RawxEpoch | null {
  if (payload.length < 16) return null;
  const rcvTow = payload.readDoubleLE(0);
  const week = payload.readUInt16LE(8);
  const numMeas = payload.readUInt8(11);
  const measurements: RawxMeasurement[] = [];
  for (let i = 0; i < numMeas; i++) {
    const measOffset = 16 + i * 32;
    if (measOffset + 32 > payload.length) break;
    measurements.push(parseMeasurement(payload, measOffset));
  }
  return { time: gpsToIso(rcvTow, week), rcvTow, week, measurements };
}

export function parseUbxBuffer(buffer: Buffer): ParsedUbxFile {
  const epochMap = new Map<string, RawxEpoch>();
  const signalSet = new Set<string>();
  const satelliteSet = new Set<string>();
  const snrMap = new Map<string, { total: number; count: number }>();
  let pos = 0;

  while (pos < buffer.length - 7) {
    if (buffer[pos] !== UBX_SYNC_1 || buffer[pos + 1] !== UBX_SYNC_2) {
      pos++;
      continue;
    }

    const msgClass = buffer[pos + 2];
    const msgId = buffer[pos + 3];
    const length = buffer.readUInt16LE(pos + 4);
    const payloadEnd = pos + 8 + length;
    const frameEnd = payloadEnd + 2;

    if (frameEnd > buffer.length) break;

    const [ckA, ckB] = computeChecksum(buffer, pos + 2, 4 + length);
    if (buffer[payloadEnd] !== ckA || buffer[payloadEnd + 1] !== ckB) {
      pos += 2;
      continue;
    }

    if (msgClass === UBX_CLASS_RAWX && msgId === UBX_ID_RAWX) {
      const payload = buffer.subarray(pos + 8, payloadEnd);
      const epoch = parseRawxPayload(payload);
      if (epoch) {
        const key = `${epoch.rcvTow}:${epoch.week}`;
        const existing = epochMap.get(key);
        if (existing) {
          existing.measurements.push(...epoch.measurements);
        } else {
          epochMap.set(key, epoch);
        }
        for (const m of epoch.measurements) {
          signalSet.add(m.rinexSignal);
          satelliteSet.add(`${m.system}${String(m.svId).padStart(2, "0")}`);
          const snrKey = `${m.system}_${m.svId}_${m.rinexSignal}`;
          const entry = snrMap.get(snrKey) ?? { total: 0, count: 0 };
          entry.total += m.cno;
          entry.count += 1;
          snrMap.set(snrKey, entry);
        }
      }
    }

    pos = frameEnd;
  }

  const epochs = Array.from(epochMap.values());
  const signalTypes = Array.from(signalSet).sort();
  const satellitesList: ParsedUbxFile["stats"]["satellites"] = [];
  for (const [key, entry] of snrMap) {
    const [system, svIdStr, signalType] = key.split("_");
    satellitesList.push({ svId: parseInt(svIdStr), system, signalType, avgSnr: entry.total / entry.count });
  }
  satellitesList.sort((a, b) => a.system.localeCompare(b.system) || a.svId - b.svId);

  let timeRange: ParsedUbxFile["stats"]["timeRange"] = null;
  if (epochs.length > 0) {
    epochs.sort((a, b) => a.rcvTow - b.rcvTow || a.week - b.week);
    timeRange = { start: epochs[0].time, end: epochs[epochs.length - 1].time };
  }

  return {
    epochs,
    stats: {
      epochCount: epochs.length,
      satelliteCount: satelliteSet.size,
      signalTypes,
      timeRange,
      satellites: satellitesList,
    },
  };
}
