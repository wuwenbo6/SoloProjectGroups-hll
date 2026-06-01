import { PacketType, PacketTypeName } from '../../../shared/types';
import type { PacketSummary, PacketDetail, PacketHeader } from '../../../shared/types';
import { formatTimestamp, getPacketDataOffset } from './packetHeader';

export function parseTmatsPacket(
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

  const textContent = dataBuffer.toString('utf8', 0, Math.min(dataBuffer.length, 1024));
  
  const preview = textContent
    .replace(/\x00/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .substring(0, 100);

  const fields: Record<string, string | number | bigint> = {};
  
  const lines = dataBuffer.toString('utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('\\') && trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();
      if (key && value) {
        fields[key.trim()] = value;
      }
    }
  }

  const rawDataHex = dataBuffer.slice(0, 256).toString('hex');

  const summary: PacketSummary = {
    index,
    type: PacketType.TMATS,
    typeName: PacketTypeName[PacketType.TMATS],
    timestamp: formatTimestamp(header.timestamp),
    timestampNs: header.timestamp,
    packetLength: header.packetLength,
    dataLength: header.dataLength,
    sequenceNumber: index,
    offset: fileOffset,
    preview: preview || 'TMATS configuration data'
  };

  const detail: PacketDetail = {
    ...summary,
    header,
    fields: {
      'Format': 'TMATS (Telemetry Attributes Transfer Standard)',
      'Content Type': 'ASCII Configuration',
      'Total Lines': lines.length,
      ...fields
    },
    rawDataHex
  };

  return { summary, detail };
}
