import { NALUnit, NALUnitType, ParseResult, GOP, CUSize, SliceInfo, CUAnalysisResult } from '../types';

export type ParseProgressCallback = (progress: number, processed: number, total: number) => void;

const STREAMING_THRESHOLD = 10 * 1024 * 1024;
const CHUNK_SIZE = 4 * 1024 * 1024;
const OVERLAP_SIZE = 4;

export function isLargeFile(size: number): boolean {
  return size > STREAMING_THRESHOLD;
}

export function findStartCodes(buffer: Uint8Array): number[] {
  const startCodes: number[] = [];
  const len = buffer.length;

  for (let i = 0; i < len - 2; i++) {
    if (buffer[i] === 0x00 && buffer[i + 1] === 0x00) {
      if (buffer[i + 2] === 0x01) {
        startCodes.push(i);
        i += 2;
      } else if (i + 3 < len && buffer[i + 2] === 0x00 && buffer[i + 3] === 0x01) {
        startCodes.push(i);
        i += 3;
      }
    }
  }

  return startCodes;
}

function parseNALUnitType(typeCode: number): NALUnitType {
  switch (typeCode) {
    case 0:
      return 'B';
    case 1:
      return 'P';
    case 9:
      return 'RASL';
    case 10:
      return 'RADL';
    case 19:
    case 20:
      return 'IDR';
    case 32:
      return 'VPS';
    case 33:
      return 'SPS';
    case 34:
      return 'PPS';
    case 35:
      return 'AUD';
    case 36:
      return 'EOS';
    case 37:
      return 'EOB';
    case 38:
      return 'FD';
    case 39:
    case 40:
      return 'SEI';
    default:
      return 'UNKNOWN';
  }
}

function parseNALHeader(headerByte1: number, headerByte2: number): {
  typeCode: number;
  layerId: number;
  temporalId: number;
} {
  const typeCode = (headerByte1 >> 1) & 0x3f;
  const layerId = ((headerByte1 & 0x01) << 5) | ((headerByte2 >> 3) & 0x1f);
  const temporalId = headerByte2 & 0x07;

  return { typeCode, layerId, temporalId };
}

function getFirstBytes(data: Uint8Array, count: number = 8): string {
  const bytes = Array.from(data.slice(0, Math.min(count, data.length)));
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export function analyzeGOPStructure(nalUnits: NALUnit[]): GOP[] {
  const gops: GOP[] = [];
  let currentGOP: GOP | null = null;

  for (let i = 0; i < nalUnits.length; i++) {
    const nal = nalUnits[i];

    if (nal.type === 'IDR') {
      if (currentGOP) {
        currentGOP.endIndex = i - 1;
        gops.push(currentGOP);
      }

      currentGOP = {
        index: gops.length,
        startIndex: i,
        endIndex: i,
        frameCount: 0,
        idrCount: 0,
        pFrameCount: 0,
        bFrameCount: 0,
        raslFrameCount: 0,
        radlFrameCount: 0,
        size: 0,
      };
    }

    if (currentGOP) {
      currentGOP.endIndex = i;
      currentGOP.frameCount++;
      currentGOP.size += nal.size;

      if (nal.type === 'IDR') currentGOP.idrCount++;
      if (nal.type === 'P') currentGOP.pFrameCount++;
      if (nal.type === 'B') currentGOP.bFrameCount++;
      if (nal.type === 'RASL') currentGOP.raslFrameCount++;
      if (nal.type === 'RADL') currentGOP.radlFrameCount++;
    }
  }

  if (currentGOP) {
    gops.push(currentGOP);
  }

  return gops;
}

export function calculateStats(nalUnits: NALUnit[]) {
  return {
    total: nalUnits.length,
    vps: nalUnits.filter((n) => n.type === 'VPS').length,
    sps: nalUnits.filter((n) => n.type === 'SPS').length,
    pps: nalUnits.filter((n) => n.type === 'PPS').length,
    idr: nalUnits.filter((n) => n.type === 'IDR').length,
    pFrame: nalUnits.filter((n) => n.type === 'P').length,
    bFrame: nalUnits.filter((n) => n.type === 'B').length,
    raslFrame: nalUnits.filter((n) => n.type === 'RASL').length,
    radlFrame: nalUnits.filter((n) => n.type === 'RADL').length,
    aud: nalUnits.filter((n) => n.type === 'AUD').length,
    sei: nalUnits.filter((n) => n.type === 'SEI').length,
    eos: nalUnits.filter((n) => n.type === 'EOS').length,
    eob: nalUnits.filter((n) => n.type === 'EOB').length,
    fd: nalUnits.filter((n) => n.type === 'FD').length,
    unknown: nalUnits.filter((n) => n.type === 'UNKNOWN').length,
  };
}

const EMPTY_CU_STATS: Record<CUSize, number> = { '64x64': 0, '32x32': 0, '16x16': 0, '8x8': 0 };

function estimateSliceInfo(nalData: Uint8Array, nalType: NALUnitType): SliceInfo | undefined {
  if (!['IDR', 'P', 'B', 'RASL', 'RADL'].includes(nalType)) return undefined;
  if (nalData.length < 4) return undefined;

  let sliceType: 'I' | 'P' | 'B';
  if (nalType === 'IDR') {
    sliceType = 'I';
  } else if (nalType === 'P' || nalType === 'RASL') {
    sliceType = 'P';
  } else {
    sliceType = 'B';
  }

  const nalPayload = nalData.slice(2);

  let byteOffset = 0;
  let bitOffset = 0;

  const readBits = (numBits: number): number => {
    let value = 0;
    for (let i = 0; i < numBits; i++) {
      if (byteOffset >= nalPayload.length) return value;
      value = (value << 1) | ((nalPayload[byteOffset] >> (7 - bitOffset)) & 1);
      bitOffset++;
      if (bitOffset >= 8) {
        bitOffset = 0;
        byteOffset++;
      }
    }
    return value;
  };

  const readUe = (): number => {
    let leadingZeros = 0;
    while (byteOffset < nalPayload.length) {
      const bit = (nalPayload[byteOffset] >> (7 - bitOffset)) & 1;
      bitOffset++;
      if (bitOffset >= 8) { bitOffset = 0; byteOffset++; }
      if (bit === 1) break;
      leadingZeros++;
      if (leadingZeros > 32) break;
    }
    if (leadingZeros === 0) return 0;
    const suffix = readBits(leadingZeros);
    return (1 << leadingZeros) - 1 + suffix;
  };

  try {
    const firstSliceSegmentInPicFlag = readBits(1);
    if (!firstSliceSegmentInPicFlag) {
      readUe();
    }

    if (nalType !== 'IDR' && nalType !== 'AUD') {
      readBits(1);
    }

    const sliceQpDelta = readUe();
    const sliceQp = 26 + (sliceQpDelta > 127 ? sliceQpDelta - 256 : sliceQpDelta);
  } catch {
    return undefined;
  }

  const dataEntropy = estimateEntropy(nalPayload);

  const cuStats = estimateCUPartition(sliceType, nalData.length, dataEntropy);
  const intraStats = estimateIntraPredModes(sliceType, nalData.length, dataEntropy);

  const totalCUs = Object.values(cuStats).reduce((a, b) => a + b, 0);

  return {
    sliceType,
    sliceQp: 26,
    cuPartitionStats: cuStats,
    intraPredStats: intraStats,
    cuTotalCount: totalCUs,
  };
}

function estimateEntropy(data: Uint8Array): number {
  if (data.length === 0) return 0;
  const freq = new Map<number, number>();
  for (let i = 0; i < Math.min(data.length, 512); i++) {
    freq.set(data[i], (freq.get(data[i]) || 0) + 1);
  }
  const len = Math.min(data.length, 512);
  let entropy = 0;
  freq.forEach((count) => {
    const p = count / len;
    if (p > 0) entropy -= p * Math.log2(p);
  });
  return entropy;
}

function estimateCUPartition(
  sliceType: 'I' | 'P' | 'B',
  frameSize: number,
  entropy: number
): Record<CUSize, number> {
  const bytesPerPixel = frameSize / (1920 * 1080);
  const complexity = Math.min(1, entropy / 8);

  let stats: Record<CUSize, number>;

  if (sliceType === 'I') {
    stats = {
      '64x64': Math.round(15 + complexity * 25),
      '32x32': Math.round(35 + complexity * 40),
      '16x16': Math.round(50 + complexity * 55),
      '8x8': Math.round(20 + complexity * 35),
    };
  } else if (sliceType === 'P') {
    stats = {
      '64x64': Math.round(40 + (1 - complexity) * 50),
      '32x32': Math.round(50 + complexity * 30),
      '16x16': Math.round(25 + complexity * 30),
      '8x8': Math.round(8 + complexity * 15),
    };
  } else {
    stats = {
      '64x64': Math.round(55 + (1 - complexity) * 60),
      '32x32': Math.round(40 + (1 - complexity) * 25),
      '16x16': Math.round(18 + complexity * 20),
      '8x8': Math.round(5 + complexity * 10),
    };
  }

  if (bytesPerPixel < 0.02) {
    stats['64x64'] = Math.round(stats['64x64'] * 1.8);
    stats['32x32'] = Math.round(stats['32x32'] * 1.3);
    stats['16x16'] = Math.round(stats['16x16'] * 0.6);
    stats['8x8'] = Math.round(stats['8x8'] * 0.3);
  } else if (bytesPerPixel > 0.15) {
    stats['64x64'] = Math.round(stats['64x64'] * 0.4);
    stats['32x32'] = Math.round(stats['32x32'] * 0.8);
    stats['16x16'] = Math.round(stats['16x16'] * 1.5);
    stats['8x8'] = Math.round(stats['8x8'] * 2.2);
  }

  return stats;
}

function estimateIntraPredModes(
  sliceType: 'I' | 'P' | 'B',
  frameSize: number,
  entropy: number
): Record<string, number> {
  if (sliceType !== 'I') {
    const cuCount = Math.round(frameSize / 200);
    return {
      PLANAR: Math.round(cuCount * 0.3),
      DC: Math.round(cuCount * 0.15),
      ANGULAR_10: Math.round(cuCount * 0.08),
      ANGULAR_26: Math.round(cuCount * 0.08),
      ANGULAR_18: Math.round(cuCount * 0.06),
      ANGULAR_34: Math.round(cuCount * 0.05),
    };
  }

  const complexity = Math.min(1, entropy / 8);
  const totalIntraCUs = Math.round(frameSize / 80);

  const modes: Record<string, number> = {
    PLANAR: Math.round(totalIntraCUs * (0.25 + (1 - complexity) * 0.1)),
    DC: Math.round(totalIntraCUs * (0.12 + (1 - complexity) * 0.05)),
    ANGULAR_10: Math.round(totalIntraCUs * (0.06 + complexity * 0.04)),
    ANGULAR_18: Math.round(totalIntraCUs * (0.05 + complexity * 0.03)),
    ANGULAR_26: Math.round(totalIntraCUs * (0.06 + complexity * 0.04)),
    ANGULAR_34: Math.round(totalIntraCUs * (0.04 + complexity * 0.03)),
    ANGULAR_2: Math.round(totalIntraCUs * 0.03),
    ANGULAR_6: Math.round(totalIntraCUs * 0.03),
    ANGULAR_14: Math.round(totalIntraCUs * 0.03),
    ANGULAR_22: Math.round(totalIntraCUs * 0.03),
    ANGULAR_30: Math.round(totalIntraCUs * 0.02),
  };

  return modes;
}

export function analyzeCUStructure(nalUnits: NALUnit[]): CUAnalysisResult {
  const overallCU: Record<CUSize, number> = { ...EMPTY_CU_STATS };
  const overallIntra: Record<string, number> = {};
  const cuByFrameType = {
    idr: { ...EMPTY_CU_STATS },
    p: { ...EMPTY_CU_STATS },
    b: { ...EMPTY_CU_STATS },
  };

  for (const nal of nalUnits) {
    if (!nal.sliceInfo) continue;
    const info = nal.sliceInfo;

    for (const [size, count] of Object.entries(info.cuPartitionStats)) {
      overallCU[size as CUSize] += count;
    }

    for (const [mode, count] of Object.entries(info.intraPredStats)) {
      overallIntra[mode] = (overallIntra[mode] || 0) + count;
    }

    const targetMap = info.sliceType === 'I' ? cuByFrameType.idr
      : info.sliceType === 'P' ? cuByFrameType.p
      : cuByFrameType.b;

    for (const [size, count] of Object.entries(info.cuPartitionStats)) {
      targetMap[size as CUSize] += count;
    }
  }

  const totalCUs = Object.values(overallCU).reduce((a, b) => a + b, 0);
  const avgCUSize = totalCUs > 0
    ? (overallCU['64x64'] * 4096 + overallCU['32x32'] * 1024 + overallCU['16x16'] * 256 + overallCU['8x8'] * 64) / totalCUs
    : 0;

  return {
    cuPartitionDistribution: overallCU,
    intraPredModeDistribution: overallIntra,
    cuSizeByFrameType: cuByFrameType,
    totalCUs,
    avgCUSize,
  };
}

export function exportToCSV(result: ParseResult): string {
  const header = '帧序号,NAL索引,类型,类型码,大小(字节),偏移地址,Temporal ID,Layer ID';
  const rows = result.nalUnits.map((nal) => {
    return [
      nal.index,
      nal.index,
      nal.type,
      nal.typeCode,
      nal.size,
      `0x${nal.offset.toString(16).toUpperCase()}`,
      nal.temporalId,
      nal.layerId,
    ].join(',');
  });

  return [header, ...rows].join('\n');
}

export function downloadCSV(result: ParseResult): void {
  const csv = exportToCSV(result);
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${result.fileName.replace(/\.[^.]+$/, '')}_nal_analysis.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseH265(buffer: ArrayBuffer, fileName: string): ParseResult {
  const uint8Buffer = new Uint8Array(buffer);
  const startCodes = findStartCodes(uint8Buffer);

  if (startCodes.length === 0) {
    throw new Error('未找到有效的 NAL 起始码，请确认是 H.265 裸流文件');
  }

  const nalUnits: NALUnit[] = [];

  for (let i = 0; i < startCodes.length; i++) {
    const startPos = startCodes[i];
    let startCodeLength = 3;

    if (startPos + 3 < uint8Buffer.length && uint8Buffer[startPos + 3] === 0x01) {
      startCodeLength = 4;
    }

    const nalStart = startPos + startCodeLength;
    let nalEnd = uint8Buffer.length;

    if (i < startCodes.length - 1) {
      const nextStartPos = startCodes[i + 1];
      nalEnd = nextStartPos;
    }

    if (nalStart >= nalEnd) continue;

    const nalData = uint8Buffer.slice(nalStart, nalEnd);

    if (nalData.length < 2) continue;

    const { typeCode, layerId, temporalId } = parseNALHeader(nalData[0], nalData[1]);
    const nalType = parseNALUnitType(typeCode);

    const nalUnit: NALUnit = {
      index: i,
      type: nalType,
      typeCode,
      size: nalEnd - nalStart,
      offset: startPos,
      layerId,
      temporalId,
      firstBytes: getFirstBytes(nalData),
      sliceInfo: estimateSliceInfo(nalData, nalType),
    };

    nalUnits.push(nalUnit);
  }

  const stats = calculateStats(nalUnits);
  const gopStructure = analyzeGOPStructure(nalUnits);
  const cuAnalysis = analyzeCUStructure(nalUnits);

  return {
    fileName,
    fileSize: buffer.byteLength,
    nalUnits,
    stats,
    gopStructure,
    cuAnalysis,
  };
}

export async function parseH265Streaming(
  file: File,
  onProgress?: ParseProgressCallback
): Promise<ParseResult> {
  const fileSize = file.size;
  const nalUnits: NALUnit[] = [];
  let nalIndex = 0;
  let leftoverBuffer = new Uint8Array(0);
  let processedBytes = 0;
  let lastNALOffset = 0;
  let totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, fileSize);
    const chunk = await file.slice(start, end);
    const chunkBuffer = await chunk.arrayBuffer();
    const chunkData = new Uint8Array(chunkBuffer);

    const combinedBuffer = new Uint8Array(leftoverBuffer.length + chunkData.length);
    combinedBuffer.set(leftoverBuffer, 0);
    combinedBuffer.set(chunkData, leftoverBuffer.length);

    const startCodes = findStartCodes(combinedBuffer);

    if (startCodes.length === 0) {
      leftoverBuffer = combinedBuffer.slice(-OVERLAP_SIZE);
      processedBytes = end;
      if (onProgress) {
        onProgress(end / fileSize, end, fileSize);
      }
      continue;
    }

    for (let i = 0; i < startCodes.length - 1; i++) {
      const startPos = startCodes[i];
      const nextStartPos = startCodes[i + 1];

      let startCodeLength = 3;
      if (startPos + 3 < combinedBuffer.length && combinedBuffer[startPos + 3] === 0x01) {
        startCodeLength = 4;
      }

      const nalStart = startPos + startCodeLength;
      const nalEnd = nextStartPos;

      if (nalStart >= nalEnd) continue;

      const nalData = combinedBuffer.slice(nalStart, nalEnd);

      if (nalData.length < 2) continue;

      const { typeCode, layerId, temporalId } = parseNALHeader(nalData[0], nalData[1]);
      const nalType = parseNALUnitType(typeCode);

      const nalUnit: NALUnit = {
        index: nalIndex++,
        type: nalType,
        typeCode,
        size: nalEnd - nalStart,
        offset: lastNALOffset + startPos,
        layerId,
        temporalId,
        firstBytes: getFirstBytes(nalData),
        sliceInfo: estimateSliceInfo(nalData, nalType),
      };

      nalUnits.push(nalUnit);
    }

    const lastStartPos = startCodes[startCodes.length - 1];
    leftoverBuffer = combinedBuffer.slice(lastStartPos);
    lastNALOffset = end - leftoverBuffer.length;

    processedBytes = end;

    if (onProgress) {
      onProgress(end / fileSize, end, fileSize);
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (leftoverBuffer.length > 4) {
    const startCodes = findStartCodes(leftoverBuffer);

    for (let i = 0; i < startCodes.length; i++) {
      const startPos = startCodes[i];
      const nextStartPos = i < startCodes.length - 1 ? startCodes[i + 1] : leftoverBuffer.length;

      let startCodeLength = 3;
      if (startPos + 3 < leftoverBuffer.length && leftoverBuffer[startPos + 3] === 0x01) {
        startCodeLength = 4;
      }

      const nalStart = startPos + startCodeLength;
      const nalEnd = nextStartPos;

      if (nalStart >= nalEnd) continue;

      const nalData = leftoverBuffer.slice(nalStart, nalEnd);

      if (nalData.length < 2) continue;

      const { typeCode, layerId, temporalId } = parseNALHeader(nalData[0], nalData[1]);
      const nalType = parseNALUnitType(typeCode);

      const nalUnit: NALUnit = {
        index: nalIndex++,
        type: nalType,
        typeCode,
        size: nalEnd - nalStart,
        offset: lastNALOffset + startPos,
        layerId,
        temporalId,
        firstBytes: getFirstBytes(nalData),
        sliceInfo: estimateSliceInfo(nalData, nalType),
      };

      nalUnits.push(nalUnit);
    }
  }

  if (nalUnits.length === 0) {
    throw new Error('未找到有效的 NAL 起始码，请确认是 H.265 裸流文件');
  }

  const stats = calculateStats(nalUnits);
  const gopStructure = analyzeGOPStructure(nalUnits);
  const cuAnalysis = analyzeCUStructure(nalUnits);

  return {
    fileName: file.name,
    fileSize,
    nalUnits,
    stats,
    gopStructure,
    cuAnalysis,
  };
}

export async function parseFile(
  file: File,
  onProgress?: ParseProgressCallback
): Promise<ParseResult> {
  if (isLargeFile(file.size)) {
    return parseH265Streaming(file, onProgress);
  } else {
    const buffer = await file.arrayBuffer();
    return parseH265(buffer, file.name);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function generateMockData(): ParseResult {
  const nalUnits: NALUnit[] = [];
  const types: { type: NALUnitType; typeCode: number }[] = [
    { type: 'VPS', typeCode: 32 },
    { type: 'SPS', typeCode: 33 },
    { type: 'PPS', typeCode: 34 },
  ];

  for (let gop = 0; gop < 5; gop++) {
    nalUnits.push({
      index: nalUnits.length,
      type: 'AUD',
      typeCode: 35,
      size: 10,
      offset: nalUnits.length * 1000,
      layerId: 0,
      temporalId: 0,
      firstBytes: '00 00 00 01',
    });

    if (gop === 0) {
      types.forEach((t) => {
        nalUnits.push({
          index: nalUnits.length,
          type: t.type,
          typeCode: t.typeCode,
          size: 50 + Math.floor(Math.random() * 100),
          offset: nalUnits.length * 1000,
          layerId: 0,
          temporalId: 0,
          firstBytes: '00 00 00 01',
        });
      });
    }

    const idrSize = 5000 + Math.floor(Math.random() * 10000);
    nalUnits.push({
      index: nalUnits.length,
      type: 'IDR',
      typeCode: 19,
      size: idrSize,
      offset: nalUnits.length * 1000,
      layerId: 0,
      temporalId: 0,
      firstBytes: '00 00 00 01',
      sliceInfo: {
        sliceType: 'I',
        sliceQp: 26 + Math.floor(Math.random() * 10),
        cuPartitionStats: estimateCUPartition('I', idrSize, 5 + Math.random() * 3),
        intraPredStats: estimateIntraPredModes('I', idrSize, 5 + Math.random() * 3),
        cuTotalCount: 0,
      },
    });
    if (nalUnits[nalUnits.length - 1].sliceInfo) {
      nalUnits[nalUnits.length - 1].sliceInfo!.cuTotalCount =
        Object.values(nalUnits[nalUnits.length - 1].sliceInfo!.cuPartitionStats).reduce((a, b) => a + b, 0);
    }

    const frameTypes = [
      { type: 'P' as NALUnitType, code: 1, weight: 5 },
      { type: 'B' as NALUnitType, code: 0, weight: 2 },
      { type: 'RASL' as NALUnitType, code: 9, weight: 1 },
      { type: 'RADL' as NALUnitType, code: 10, weight: 1 },
    ];

    const pFrames = 8 + Math.floor(Math.random() * 15);
    for (let i = 0; i < pFrames; i++) {
      const totalWeight = frameTypes.reduce((sum, ft) => sum + ft.weight, 0);
      let random = Math.random() * totalWeight;
      let selectedType = frameTypes[0];

      for (const ft of frameTypes) {
        random -= ft.weight;
        if (random <= 0) {
          selectedType = ft;
          break;
        }
      }

      const frameSize = 1000 + Math.floor(Math.random() * 5000);
      const sliceType: 'I' | 'P' | 'B' = selectedType.type === 'B' ? 'B' : 'P';

      nalUnits.push({
        index: nalUnits.length,
        type: selectedType.type,
        typeCode: selectedType.code,
        size: frameSize,
        offset: nalUnits.length * 1000,
        layerId: 0,
        temporalId: Math.floor(Math.random() * 3) + 1,
        firstBytes: '00 00 00 01',
        sliceInfo: {
          sliceType,
          sliceQp: 26 + Math.floor(Math.random() * 10),
          cuPartitionStats: estimateCUPartition(sliceType, frameSize, 3 + Math.random() * 4),
          intraPredStats: estimateIntraPredModes(sliceType, frameSize, 3 + Math.random() * 4),
          cuTotalCount: 0,
        },
      });
      if (nalUnits[nalUnits.length - 1].sliceInfo) {
        nalUnits[nalUnits.length - 1].sliceInfo!.cuTotalCount =
          Object.values(nalUnits[nalUnits.length - 1].sliceInfo!.cuPartitionStats).reduce((a, b) => a + b, 0);
      }
    }
  }

  nalUnits.push({
    index: nalUnits.length,
    type: 'EOS',
    typeCode: 36,
    size: 5,
    offset: nalUnits.length * 1000,
    layerId: 0,
    temporalId: 0,
    firstBytes: '00 00 00 01',
  });

  const stats = calculateStats(nalUnits);
  const gopStructure = analyzeGOPStructure(nalUnits);
  const cuAnalysis = analyzeCUStructure(nalUnits);

  return {
    fileName: 'demo_sample.hevc',
    fileSize: nalUnits.reduce((sum, n) => sum + n.size, 0),
    nalUnits,
    stats,
    gopStructure,
    cuAnalysis,
  };
}
