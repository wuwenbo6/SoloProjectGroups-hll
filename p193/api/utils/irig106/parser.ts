import { PacketType, PacketTypeName } from '../../../shared/types';
import type {
  ParseResult,
  ParseResultWithOptions,
  PacketSummary,
  PacketDetail,
  ParseOptions,
  PcmDeinterleaveResult,
  FileIndex
} from '../../../shared/types';
import { parseFileHeader, FILE_HEADER_SIZE } from './fileHeader';
import { parsePacketHeader, PACKET_HEADER_SIZE, formatTimestamp, getPacketDataOffset } from './packetHeader';
import { parseTmatsPacket } from './tmats';
import { parsePcmPacket, getPcmDataBuffer } from './pcm';
import { parseMilStd1553Packet } from './milstd1553';
import { resolveTimeReference, applyTimeReference, detectTimeReferenceFromTmats } from './timeReference';
import { deinterleavePcmData } from './deinterleave';
import {
  computeFileHash,
  buildFileIndex,
  saveFileIndex,
  loadFileIndex,
  hasFileIndex
} from './fileIndex';

const MAX_PACKETS = 10000;
const MAX_FILE_SIZE = 1024 * 1024 * 1024;

function parseGenericPacket(
  buffer: Buffer,
  fileOffset: number,
  header: ReturnType<typeof parsePacketHeader>,
  index: number
): { summary: PacketSummary; detail: PacketDetail } {
  const dataOffset = getPacketDataOffset(header);
  const packetDataStart = fileOffset + dataOffset;
  const dataEnd = packetDataStart + header.dataLength;
  const actualDataEnd = Math.min(dataEnd, buffer.length);

  let dataBuffer: Buffer;
  if (actualDataEnd > packetDataStart) {
    dataBuffer = buffer.slice(packetDataStart, actualDataEnd);
  } else {
    dataBuffer = Buffer.alloc(0);
  }

  const rawDataHex = dataBuffer.slice(0, 256).toString('hex');
  const textPreview = dataBuffer.toString('utf8', 0, 64).replace(/[\x00-\x1f\x7f]/g, '.');
  const hexPreview = dataBuffer.slice(0, 16).toString('hex').match(/.{2}/g)?.join(' ') || '';

  const typeName = PacketTypeName[header.packetType] || 'Unknown';

  const summary: PacketSummary = {
    index,
    type: header.packetType,
    typeName,
    timestamp: formatTimestamp(header.timestamp),
    timestampNs: header.timestamp,
    packetLength: header.packetLength,
    dataLength: header.dataLength,
    sequenceNumber: index,
    offset: fileOffset,
    preview: `${typeName} Data: ${dataBuffer.length} bytes | ${hexPreview}`
  };

  const detail: PacketDetail = {
    ...summary,
    header,
    fields: {
      'Format': `${typeName} (Type 0x${header.packetType.toString(16).padStart(2, '0')})`,
      'Data Length': dataBuffer.length,
      'Secondary Header': header.secondaryHeaderPresent ? 'Present' : 'Not Present',
      'Checksum': header.hasChecksum ? 'Present' : 'Not Present',
      'Hex Preview': hexPreview,
      'Text Preview': textPreview
    },
    rawDataHex
  };

  return { summary, detail };
}

export function parseIrig106File(buffer: Buffer, fileName: string): ParseResult {
  return parseIrig106FileWithOptions(buffer, fileName, {}) as ParseResult;
}

export function parseIrig106FileWithOptions(
  buffer: Buffer,
  fileName: string,
  options: ParseOptions
): ParseResultWithOptions {
  const errors: string[] = [];
  const stats: Record<number, number> = {};
  const packets: PacketSummary[] = [];
  const packetDetails: Record<number, PacketDetail> = {};
  const deinterleaveResults: Record<number, PcmDeinterleaveResult> = {};

  let timeReferenceApplied = false;
  let pcmDeinterleaved = false;
  let indexCacheUsed = false;
  let indexCacheCreated = false;
  let fileIndex: FileIndex | null = null;

  if (buffer.length < FILE_HEADER_SIZE) {
    return {
      success: false,
      fileName,
      fileSize: buffer.length,
      fileHeader: {
        syncPattern: '',
        versionMajor: 0,
        versionMinor: 0,
        fileSize: 0n,
        creationTime: new Date(0),
        packetCount: 0
      },
      totalPackets: 0,
      packets: [],
      packetDetails: {},
      stats: {},
      errors: ['File too small: not a valid IRIG 106 file'],
      timeReferenceApplied,
      pcmDeinterleaved,
      indexCacheUsed,
      indexCacheCreated,
      deinterleaveResults
    };
  }

  let fileHeader;
  try {
    fileHeader = parseFileHeader(buffer);
  } catch (e) {
    return {
      success: false,
      fileName,
      fileSize: buffer.length,
      fileHeader: {
        syncPattern: '',
        versionMajor: 0,
        versionMinor: 0,
        fileSize: BigInt(buffer.length),
        creationTime: new Date(0),
        packetCount: 0
      },
      totalPackets: 0,
      packets: [],
      packetDetails: {},
      stats: {},
      errors: [e instanceof Error ? e.message : 'Invalid file header'],
      timeReferenceApplied,
      pcmDeinterleaved,
      indexCacheUsed,
      indexCacheCreated,
      deinterleaveResults
    };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    errors.push(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit, only first 1GB will be parsed`);
  }

  const fileHash = computeFileHash(buffer);

  if (options.useIndexCache) {
    if (hasFileIndex(fileHash)) {
      const cachedIndex = loadFileIndex(fileHash);
      if (cachedIndex && cachedIndex.totalPackets > 0) {
        fileIndex = cachedIndex;
        indexCacheUsed = true;
      }
    }

    if (!fileIndex) {
      fileIndex = buildFileIndex(buffer, fileName, MAX_PACKETS);
      saveFileIndex(fileIndex);
      indexCacheCreated = true;
    }
  }

  const parseLimit = Math.min(buffer.length, MAX_FILE_SIZE);
  let offset = FILE_HEADER_SIZE;
  let packetIndex = 0;
  let consecutiveErrors = 0;
  let tmatsFields: Record<string, string | number | bigint> | undefined;

  while (offset < parseLimit - PACKET_HEADER_SIZE && packetIndex < MAX_PACKETS) {
    try {
      const header = parsePacketHeader(buffer, offset);

      if (header.packetLength === 0) {
        offset += 2;
        consecutiveErrors++;
        if (consecutiveErrors > 10) break;
        continue;
      }

      let result;
      switch (header.packetType) {
        case PacketType.TMATS:
          result = parseTmatsPacket(buffer, offset, header, packetIndex);
          if (result.detail && result.detail.fields) {
            tmatsFields = result.detail.fields;
          }
          break;
        case PacketType.PCM:
          result = parsePcmPacket(buffer, offset, header, packetIndex);
          if (options.pcmDeinterleave?.enabled) {
            const dataBuffer = getPcmDataBuffer(buffer, offset, header);
            if (dataBuffer) {
              const deinterResult = deinterleavePcmData(dataBuffer, options.pcmDeinterleave);
              deinterleaveResults[packetIndex] = deinterResult;
              pcmDeinterleaved = true;
              result.detail.fields['Deinterleaved'] = deinterResult.success ? 'Yes' : 'Partial';
              result.detail.fields['Channels'] = deinterResult.channels.length;
              for (let i = 0; i < deinterResult.channels.length && i < 4; i++) {
                const ch = deinterResult.channels[i];
                const prefix = `Ch${ch.channelIndex + 1}`;
                result.detail.fields[`${prefix} Name`] = ch.channelName;
                result.detail.fields[`${prefix} Samples`] = ch.sampleCount;
                result.detail.fields[`${prefix} Min`] = ch.minSample;
                result.detail.fields[`${prefix} Max`] = ch.maxSample;
                result.detail.fields[`${prefix} Avg`] = Number(ch.avgSample).toFixed(2);
                if (ch.samples.length > 0) {
                  result.detail.fields[`${prefix} First 4`] = `[${ch.samples.slice(0, 4).join(', ')}${ch.sampleCount > 4 ? ', ...' : ''}]`;
                }
              }
              if (deinterResult.errors.length > 0) {
                result.detail.fields['Deinterleave Warnings'] = deinterResult.errors.join('; ');
              }
            }
          }
          break;
        case PacketType.MIL_STD_1553:
          result = parseMilStd1553Packet(buffer, offset, header, packetIndex);
          break;
        default:
          result = parseGenericPacket(buffer, offset, header, packetIndex);
      }

      packets.push(result.summary);
      packetDetails[packetIndex] = result.detail;

      stats[header.packetType] = (stats[header.packetType] || 0) + 1;

      offset += header.packetLength;
      packetIndex++;
      consecutiveErrors = 0;

    } catch (e) {
      errors.push(`Error at offset ${offset}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      consecutiveErrors++;

      if (consecutiveErrors > 20) {
        errors.push('Too many consecutive errors, stopping parse');
        break;
      }

      offset += 2;
    }
  }

  if (packetIndex >= MAX_PACKETS) {
    errors.push(`Reached maximum packet limit of ${MAX_PACKETS}`);
  }

  fileHeader.packetCount = packetIndex;

  let result: ParseResultWithOptions = {
    success: true,
    fileName,
    fileSize: buffer.length,
    fileHeader,
    totalPackets: packetIndex,
    packets,
    packetDetails,
    stats,
    errors,
    timeReferenceApplied,
    pcmDeinterleaved,
    indexCacheUsed,
    indexCacheCreated,
    deinterleaveResults: Object.keys(deinterleaveResults).length > 0 ? deinterleaveResults : undefined
  };

  if (options.timeReference?.enabled) {
    const timeRef = resolveTimeReference(options.timeReference, tmatsFields);
    if (timeRef) {
      result = applyTimeReference(result, timeRef);
      result.timeReferenceApplied = true;
      result.fileHeader = { ...result.fileHeader };
      for (const [idxStr, detail] of Object.entries(result.packetDetails)) {
        const idx = parseInt(idxStr);
        result.packetDetails[idx] = {
          ...detail,
          fields: {
            ...detail.fields,
            'Time Reference': timeRef.referenceTime?.toISOString() || timeRef.referenceEpochNs.toString(),
            'Time Source': timeRef.timeSource
          }
        };
      }
    }
  }

  return result;
}
