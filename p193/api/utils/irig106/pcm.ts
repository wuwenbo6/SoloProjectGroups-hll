import { PacketType, PacketTypeName } from '../../../shared/types';
import type { PacketSummary, PacketDetail, PacketHeader } from '../../../shared/types';
import { formatTimestamp, getPacketDataOffset } from './packetHeader';

export function getPcmDataBuffer(
  buffer: Buffer,
  fileOffset: number,
  header: PacketHeader
): Buffer | null {
  const dataOffset = getPacketDataOffset(header);
  const packetDataStart = fileOffset + dataOffset;
  const dataEnd = packetDataStart + header.dataLength;
  const actualDataEnd = Math.min(dataEnd, buffer.length);

  if (actualDataEnd > packetDataStart) {
    return buffer.slice(packetDataStart, actualDataEnd);
  }
  return null;
}

export function parsePcmPacket(
  buffer: Buffer,
  fileOffset: number,
  header: PacketHeader,
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

  const sampleCount = Math.floor(dataBuffer.length / 2);
  const samples: number[] = [];
  for (let i = 0; i < Math.min(sampleCount, 32); i++) {
    samples.push(dataBuffer.readInt16LE(i * 2));
  }

  const rawDataHex = dataBuffer.slice(0, 256).toString('hex');
  
  const preview = `PCM Data: ${sampleCount} samples, first 8: [${samples.slice(0, 8).join(', ')}${sampleCount > 8 ? ', ...' : ''}]`;

  let minSample = Infinity;
  let maxSample = -Infinity;
  let sum = 0;
  for (let i = 0; i < sampleCount && i < 1024; i++) {
    const sample = dataBuffer.readInt16LE(i * 2);
    minSample = Math.min(minSample, sample);
    maxSample = Math.max(maxSample, sample);
    sum += sample;
  }

  const avgSample = sampleCount > 0 ? sum / Math.min(sampleCount, 1024) : 0;

  const summary: PacketSummary = {
    index,
    type: PacketType.PCM,
    typeName: PacketTypeName[PacketType.PCM],
    timestamp: formatTimestamp(header.timestamp),
    timestampNs: header.timestamp,
    packetLength: header.packetLength,
    dataLength: header.dataLength,
    sequenceNumber: index,
    offset: fileOffset,
    preview
  };

  const detail: PacketDetail = {
    ...summary,
    header,
    fields: {
      'Format': 'PCM (Pulse Code Modulation)',
      'Sample Format': '16-bit signed integer (Little Endian)',
      'Total Samples': sampleCount,
      'Samples Analyzed': Math.min(sampleCount, 1024),
      'Min Sample': minSample === Infinity ? 'N/A' : minSample,
      'Max Sample': maxSample === -Infinity ? 'N/A' : maxSample,
      'Avg Sample': avgSample.toFixed(2),
      'First Samples': `[${samples.slice(0, 16).join(', ')}${sampleCount > 16 ? ', ...' : ''}]`
    },
    rawDataHex
  };

  return { summary, detail };
}
