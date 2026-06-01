import type {
  TSPacketHeader,
  PIDInfo,
  PIDType,
  PMTEntry,
  PATInfo,
  PMTInfo,
  AnalysisResult,
  PIDBitrateHistory,
  BitratePoint,
} from "../../shared/types.js";

const TS_PACKET_SIZE = 188;
const SYNC_BYTE = 0x47;
const PAT_PID = 0x0000;
const NULL_PID = 0x1fff;
const BITRATE_WINDOW_MS = 500;
const ASSUMED_BITRATE_BPS = 10000000;

const CRC32_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer, offset: number, length: number): number {
  let crc = 0xffffffff;
  for (let i = 0; i < length; i++) {
    const byte = buffer[offset + i];
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const STREAM_TYPE_MAP: Record<number, string> = {
  0x01: "MPEG-1 Video",
  0x02: "MPEG-2 Video",
  0x03: "MPEG-1 Audio",
  0x04: "MPEG-2 Audio",
  0x05: "Private Sections",
  0x06: "Private Data (PES)",
  0x07: "MHEG",
  0x08: "DSM-CC",
  0x09: "H.222.1",
  0x0a: "ISO 13818-6 Type A",
  0x0b: "ISO 13818-6 Type B",
  0x0c: "ISO 13818-6 Type C",
  0x0d: "ISO 13818-6 Type D",
  0x0e: "ITU-T Rec. H.222.0 auxiliary",
  0x0f: "AAC Audio",
  0x10: "MPEG-4 Visual",
  0x11: "AAC Audio (LATM)",
  0x12: "MPEG-4 Generic (PES)",
  0x13: "ISO 14496-1 SL-packetized",
  0x14: "ISO 14496-1 FlexMux",
  0x15: "Metadata in PES",
  0x16: "Metadata in Sections",
  0x17: "DCII Video",
  0x1b: "H.264/AVC Video",
  0x1c: "MPEG-4 AAC (SBR/PS)",
  0x1d: "MPEG-2 AAC (SBR/PS)",
  0x20: "MPEG-4 HEVC Video",
  0x21: "HEVC Video (H.265)",
  0x24: "H.265/HEVC Video",
  0x25: "H.265/HEVC Video (Temporal Video Sub-layer)",
  0x2f: "IPMP Stream",
  0x80: "DigiCipher II Video",
  0x81: "ATSC AC-3 Audio",
  0x82: "ATSC SCTE-27 Subtitling",
  0x83: "ATSC SCTE-25 Data",
  0x84: "ATSC Reserved",
  0x85: "ATSC SCTE-57 Data",
  0x86: "ATSC SCTE-21 Data",
  0x87: "ATSC E-AC-3 Audio",
  0x90: "DVB PES Data (DVB subtitles/teletext)",
  0x91: "DVB PES Data",
  0x95: "DVB PES Data",
};

function getStreamTypeDesc(streamType: number): string {
  return STREAM_TYPE_MAP[streamType] || `Unknown (0x${streamType.toString(16).padStart(2, "0")})`;
}

function classifyPIDType(pid: number, pmtPIDs: Set<number>, pesMap: Map<number, number>): PIDType {
  if (pid === PAT_PID) return "PAT";
  if (pid === NULL_PID) return "Null";
  if (pmtPIDs.has(pid)) return "PMT";
  const streamType = pesMap.get(pid);
  if (streamType !== undefined) {
    if (isVideoStream(streamType)) return "PES-Video";
    if (isAudioStream(streamType)) return "PES-Audio";
    return "PES-Data";
  }
  return "Other";
}

function isVideoStream(streamType: number): boolean {
  return [0x01, 0x02, 0x10, 0x1b, 0x20, 0x21, 0x24, 0x25, 0x80].includes(streamType);
}

function isAudioStream(streamType: number): boolean {
  return [0x03, 0x04, 0x0f, 0x11, 0x1c, 0x1d, 0x81, 0x87].includes(streamType);
}

function parsePacketHeader(buffer: Buffer, offset: number): TSPacketHeader | null {
  if (buffer[offset] !== SYNC_BYTE) return null;

  const byte1 = buffer[offset + 1];
  const byte2 = buffer[offset + 2];
  const byte3 = buffer[offset + 3];

  const transportErrorIndicator = (byte1 & 0x80) !== 0;
  const payloadUnitStartIndicator = (byte1 & 0x40) !== 0;
  const pid = ((byte1 & 0x1f) << 8) | byte2;
  const adaptationFieldControl = (byte3 & 0x30) >> 4;
  const continuityCounter = byte3 & 0x0f;

  return {
    syncByte: SYNC_BYTE,
    transportErrorIndicator,
    payloadUnitStartIndicator,
    pid,
    adaptationFieldControl,
    continuityCounter,
  };
}

function parsePAT(buffer: Buffer, packetOffset: number): PATInfo | null {
  const byte3 = buffer[packetOffset + 3];
  const adaptationFieldControl = (byte3 & 0x30) >> 4;

  let pointerField = 0;
  let dataOffset: number;

  if (adaptationFieldControl === 0x03) {
    const adaptationFieldLength = buffer[packetOffset + 4];
    dataOffset = packetOffset + 5 + adaptationFieldLength;
  } else if (adaptationFieldControl === 0x01) {
    dataOffset = packetOffset + 4;
  } else {
    return null;
  }

  if (dataOffset >= buffer.length) return null;

  pointerField = buffer[dataOffset];
  dataOffset += 1 + pointerField;

  if (dataOffset + 8 > buffer.length) return null;

  const tableId = buffer[dataOffset];
  if (tableId !== 0x00) return null;

  const sectionLength = ((buffer[dataOffset + 1] & 0x0f) << 8) | buffer[dataOffset + 2];
  const transportStreamId = (buffer[dataOffset + 3] << 8) | buffer[dataOffset + 4];
  const versionNumber = (buffer[dataOffset + 5] & 0x3e) >> 1;

  const pmtEntries: { programNumber: number; pmtPID: number }[] = [];
  const endOffset = dataOffset + 3 + sectionLength - 4;

  let entryOffset = dataOffset + 8;
  while (entryOffset + 4 <= endOffset && entryOffset + 4 <= buffer.length) {
    const programNumber = (buffer[entryOffset] << 8) | buffer[entryOffset + 1];
    const pmtPID = ((buffer[entryOffset + 2] & 0x1f) << 8) | buffer[entryOffset + 3];

    if (programNumber !== 0) {
      pmtEntries.push({ programNumber, pmtPID });
    }
    entryOffset += 4;
  }

  return { transportStreamId, versionNumber, pmtEntries };
}

function parsePMT(buffer: Buffer, packetOffset: number, pmtPID: number): PMTInfo | null {
  const byte3 = buffer[packetOffset + 3];
  const adaptationFieldControl = (byte3 & 0x30) >> 4;

  let dataOffset: number;

  if (adaptationFieldControl === 0x03) {
    const adaptationFieldLength = buffer[packetOffset + 4];
    dataOffset = packetOffset + 5 + adaptationFieldLength;
  } else if (adaptationFieldControl === 0x01) {
    dataOffset = packetOffset + 4;
  } else {
    return null;
  }

  if (dataOffset >= buffer.length) return null;

  const pointerField = buffer[dataOffset];
  dataOffset += 1 + pointerField;

  if (dataOffset + 9 > buffer.length) return null;

  const tableId = buffer[dataOffset];
  if (tableId !== 0x02) return null;

  const sectionLength = ((buffer[dataOffset + 1] & 0x0f) << 8) | buffer[dataOffset + 2];
  const programNumber = (buffer[dataOffset + 3] << 8) | buffer[dataOffset + 4];

  const programInfoLength = ((buffer[dataOffset + 10] & 0x0f) << 8) | buffer[dataOffset + 11];

  const entries: PMTEntry[] = [];
  let entryOffset = dataOffset + 12 + programInfoLength;
  const endOffset = dataOffset + 3 + sectionLength - 4;

  while (entryOffset + 5 <= endOffset && entryOffset + 5 <= buffer.length) {
    const streamType = buffer[entryOffset];
    const elementaryPID = ((buffer[entryOffset + 1] & 0x1f) << 8) | buffer[entryOffset + 2];
    const esInfoLength = ((buffer[entryOffset + 3] & 0x0f) << 8) | buffer[entryOffset + 4];

    entries.push({
      streamType,
      elementaryPID,
      esInfoLength,
      streamTypeDesc: getStreamTypeDesc(streamType),
      programNumber,
    });

    entryOffset += 5 + esInfoLength;
  }

  return { pmtPID, programNumber, entries };
}

function getDescription(pid: number, type: PIDType, pesMap: Map<number, number>, pmtPIDs: Set<number>): string {
  if (type === "PAT") return "Program Association Table";
  if (type === "PMT") return `Program Map Table (PID 0x${pid.toString(16).padStart(4, "0")})`;
  if (type === "Null") return "Null Packets (Stuffing)";

  const streamType = pesMap.get(pid);
  if (streamType !== undefined) {
    return getStreamTypeDesc(streamType);
  }

  return `PID 0x${pid.toString(16).padStart(4, "0")}`;
}

export function parseTSFile(buffer: Buffer, fileName: string): AnalysisResult {
  const totalBytes = buffer.length;
  const totalPackets = Math.floor(totalBytes / TS_PACKET_SIZE);

  const pidByteCount = new Map<number, number>();
  const pidPacketCount = new Map<number, number>();

  let patInfo: PATInfo | null = null;
  const pmtInfos: PMTInfo[] = [];
  const pmtPIDs = new Set<number>();
  const pesMap = new Map<number, number>();
  const pidToProgramMap = new Map<number, number>();
  const parsedPmtPids = new Set<number>();

  const totalBitrate = totalPackets * TS_PACKET_SIZE * 8 / (totalPackets * TS_PACKET_SIZE / (ASSUMED_BITRATE_BPS / 8)) || ASSUMED_BITRATE_BPS;
  const bitrateWindowPackets = Math.floor((BITRATE_WINDOW_MS / 1000) * (totalBitrate / 8) / TS_PACKET_SIZE) || 100;

  const pidWindowBytes = new Map<number, number>();
  const pidWindowPackets = new Map<number, number>();
  const pidBitrateHistory = new Map<number, { bytes: number; packets: number }[]>();

  for (let i = 0; i <= totalBytes - TS_PACKET_SIZE; i += TS_PACKET_SIZE) {
    const header = parsePacketHeader(buffer, i);
    if (!header) continue;

    const payloadSize = getPayloadSize(buffer, i, header);
    pidByteCount.set(header.pid, (pidByteCount.get(header.pid) || 0) + payloadSize);
    pidPacketCount.set(header.pid, (pidPacketCount.get(header.pid) || 0) + 1);

    const packetIndex = i / TS_PACKET_SIZE;
    if (!pidBitrateHistory.has(header.pid)) {
      pidBitrateHistory.set(header.pid, []);
    }

    pidWindowBytes.set(header.pid, (pidWindowBytes.get(header.pid) || 0) + payloadSize);
    pidWindowPackets.set(header.pid, (pidWindowPackets.get(header.pid) || 0) + 1);

    if (packetIndex > 0 && packetIndex % bitrateWindowPackets === 0) {
      for (const [pid, bytes] of pidWindowBytes) {
        const history = pidBitrateHistory.get(pid)!;
        const packets = pidWindowPackets.get(pid) || 0;
        const timeMs = (packetIndex * TS_PACKET_SIZE) / (totalBitrate / 8) * 1000;
        const bitrate = (bytes * 8) / (BITRATE_WINDOW_MS / 1000);
        history.push({ time: Math.round(timeMs), bitrate, byteCount: bytes, packetCount: packets });
      }
      pidWindowBytes.clear();
      pidWindowPackets.clear();
    }

    if (header.pid === PAT_PID && header.payloadUnitStartIndicator && !patInfo) {
      patInfo = parsePAT(buffer, i);
      if (patInfo) {
        for (const entry of patInfo.pmtEntries) {
          pmtPIDs.add(entry.pmtPID);
        }
      }
    }

    if (pmtPIDs.has(header.pid) && header.payloadUnitStartIndicator && !parsedPmtPids.has(header.pid)) {
      const pmtInfo = parsePMT(buffer, i, header.pid);
      if (pmtInfo) {
        pmtInfos.push(pmtInfo);
        parsedPmtPids.add(header.pid);
        for (const entry of pmtInfo.entries) {
          pesMap.set(entry.elementaryPID, entry.streamType);
          pidToProgramMap.set(entry.elementaryPID, entry.programNumber);
        }
      }
    }
  }

  for (const [pid, bytes] of pidWindowBytes) {
    if (bytes > 0) {
      const history = pidBitrateHistory.get(pid)!;
      const packets = pidWindowPackets.get(pid) || 0;
      const packetIndex = totalPackets - 1;
      const timeMs = (packetIndex * TS_PACKET_SIZE) / (totalBitrate / 8) * 1000;
      const bitrate = (bytes * 8) / (BITRATE_WINDOW_MS / 1000);
      history.push({ time: Math.round(timeMs), bitrate, byteCount: bytes, packetCount: packets });
    }
  }

  const totalPayload = Array.from(pidByteCount.values()).reduce((sum, c) => sum + c, 0);

  const pids: PIDInfo[] = [];
  for (const [pid, byteCount] of pidByteCount) {
    const type = classifyPIDType(pid, pmtPIDs, pesMap);
    const streamType = pesMap.get(pid);
    const programNumber = pidToProgramMap.get(pid);
    pids.push({
      pid,
      type,
      description: getDescription(pid, type, pesMap, pmtPIDs),
      ...(streamType !== undefined ? { streamType, streamTypeDesc: getStreamTypeDesc(streamType) } : {}),
      ...(programNumber !== undefined ? { programNumber } : {}),
      byteCount,
      packetCount: pidPacketCount.get(pid) || 0,
      bandwidthPercent: totalPayload > 0 ? parseFloat(((byteCount / totalPayload) * 100).toFixed(2)) : 0,
    });
  }

  pids.sort((a, b) => b.bandwidthPercent - a.bandwidthPercent);

  const bitrateHistories: PIDBitrateHistory[] = [];
  for (const [pid, points] of pidBitrateHistory) {
    if (points.length === 0) continue;
    const bitrates = points.map((p) => p.bitrate);
    const avgBitrate = bitrates.reduce((a, b) => a + b, 0) / bitrates.length;
    bitrateHistories.push({
      pid,
      points,
      averageBitrate: Math.round(avgBitrate),
      maxBitrate: Math.max(...bitrates),
      minBitrate: Math.min(...bitrates),
    });
  }

  return {
    fileName,
    fileSize: totalBytes,
    totalPackets,
    totalBytes,
    pids,
    pat: patInfo || { transportStreamId: 0, versionNumber: 0, pmtEntries: [] },
    pmts: pmtInfos,
    bitrateHistories,
    bitrateWindowMs: BITRATE_WINDOW_MS,
  };
}

function getPayloadSize(buffer: Buffer, offset: number, header: TSPacketHeader): number {
  const adaptationFieldControl = header.adaptationFieldControl;
  if (adaptationFieldControl === 0x01) return TS_PACKET_SIZE - 4;
  if (adaptationFieldControl === 0x03) {
    if (offset + 4 >= buffer.length) return 0;
    const adaptationFieldLength = buffer[offset + 4];
    return TS_PACKET_SIZE - 4 - 1 - adaptationFieldLength;
  }
  return 0;
}

function getPayloadData(buffer: Buffer, offset: number, header: TSPacketHeader): Buffer | null {
  const adaptationFieldControl = header.adaptationFieldControl;
  let payloadStart: number;
  let payloadLength: number;

  if (adaptationFieldControl === 0x01) {
    payloadStart = offset + 4;
    payloadLength = TS_PACKET_SIZE - 4;
  } else if (adaptationFieldControl === 0x03) {
    if (offset + 4 >= buffer.length) return null;
    const adaptationFieldLength = buffer[offset + 4];
    payloadStart = offset + 5 + adaptationFieldLength;
    payloadLength = TS_PACKET_SIZE - 4 - 1 - adaptationFieldLength;
  } else {
    return null;
  }

  if (payloadLength <= 0) return null;
  return buffer.slice(payloadStart, payloadStart + payloadLength);
}

export function extractPIDPayload(buffer: Buffer, targetPid: number): {
  pid: number;
  size: number;
  packetCount: number;
  buffer: Buffer;
} {
  const totalBytes = buffer.length;
  const chunks: Buffer[] = [];
  let packetCount = 0;
  let totalSize = 0;

  for (let i = 0; i <= totalBytes - TS_PACKET_SIZE; i += TS_PACKET_SIZE) {
    const header = parsePacketHeader(buffer, i);
    if (!header || header.pid !== targetPid) continue;

    const payload = getPayloadData(buffer, i, header);
    if (payload && payload.length > 0) {
      chunks.push(payload);
      totalSize += payload.length;
      packetCount++;
    }
  }

  const resultBuffer = Buffer.concat(chunks);
  return {
    pid: targetPid,
    size: totalSize,
    packetCount,
    buffer: resultBuffer,
  };
}
