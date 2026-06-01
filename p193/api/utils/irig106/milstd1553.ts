import { PacketType, PacketTypeName } from '../../../shared/types';
import type { PacketSummary, PacketDetail, PacketHeader } from '../../../shared/types';
import { formatTimestamp, getPacketDataOffset } from './packetHeader';

interface Mil1553Message {
  commandWord1: number;
  commandWord2?: number;
  statusWord1?: number;
  statusWord2?: number;
  dataWords: number[];
  gapTime: number;
  messageTime: number;
}

function parse1553Message(buffer: Buffer, offset: number): { message: Mil1553Message; bytesRead: number } {
  const header = buffer.readUInt16LE(offset);
  const messageLength = (header >> 10) & 0x3f;
  const gapTime = buffer.readUInt16LE(offset + 2);
  const messageTime = buffer.readUInt32LE(offset + 4);
  
  let pos = offset + 8;
  const commandWord1 = buffer.readUInt16LE(pos);
  pos += 2;

  const rtAddress = (commandWord1 >> 11) & 0x1f;
  const trBit = (commandWord1 >> 10) & 0x01;
  const subAddress = (commandWord1 >> 5) & 0x1f;
  const wordCount = commandWord1 & 0x1f;

  const dataWords: number[] = [];
  let statusWord1: number | undefined;
  let statusWord2: number | undefined;
  let commandWord2: number | undefined;

  if (trBit === 0 && subAddress !== 0 && subAddress !== 31) {
    statusWord1 = buffer.readUInt16LE(pos);
    pos += 2;
    for (let i = 0; i < wordCount; i++) {
      dataWords.push(buffer.readUInt16LE(pos));
      pos += 2;
    }
  } else if (trBit === 1 && subAddress !== 0 && subAddress !== 31) {
    for (let i = 0; i < wordCount; i++) {
      dataWords.push(buffer.readUInt16LE(pos));
      pos += 2;
    }
    statusWord1 = buffer.readUInt16LE(pos);
    pos += 2;
  } else if (trBit === 0 && (subAddress === 0 || subAddress === 31)) {
    statusWord1 = buffer.readUInt16LE(pos);
    pos += 2;
  } else if (trBit === 1 && (subAddress === 0 || subAddress === 31)) {
    statusWord1 = buffer.readUInt16LE(pos);
    pos += 2;
  }

  if (messageLength > 1 && trBit === 1) {
    commandWord2 = buffer.readUInt16LE(pos);
    pos += 2;
    statusWord2 = buffer.readUInt16LE(pos);
    pos += 2;
  }

  return {
    message: {
      commandWord1,
      commandWord2,
      statusWord1,
      statusWord2,
      dataWords,
      gapTime,
      messageTime
    },
    bytesRead: pos - offset
  };
}

function formatWord(addr: number, tr: number, sa: number, wc: number): string {
  return `RT${addr} ${tr === 1 ? 'TX' : 'RX'} SA${sa} WC${wc}`;
}

export function parseMilStd1553Packet(
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

  const messages: Mil1553Message[] = [];
  let pos = 0;
  let messageCount = 0;
  
  while (pos < dataBuffer.length - 8 && messageCount < 50) {
    try {
      const result = parse1553Message(dataBuffer, pos);
      messages.push(result.message);
      pos += result.bytesRead;
      messageCount++;
    } catch {
      break;
    }
  }

  const rawDataHex = dataBuffer.slice(0, 256).toString('hex');
  
  const messageSummaries = messages.slice(0, 5).map(msg => {
    const rt = (msg.commandWord1 >> 11) & 0x1f;
    const tr = (msg.commandWord1 >> 10) & 0x01;
    const sa = (msg.commandWord1 >> 5) & 0x1f;
    const wc = msg.commandWord1 & 0x1f;
    return formatWord(rt, tr, sa, wc);
  });

  const preview = `1553 Bus: ${messageCount} messages${messageCount > 0 ? ` (${messageSummaries.join(', ')}${messageCount > 5 ? ', ...' : ''})` : ''}`;

  const busErrors = messages.filter(m => {
    if (!m.statusWord1) return false;
    return (m.statusWord1 & 0x0010) !== 0;
  }).length;

  const summary: PacketSummary = {
    index,
    type: PacketType.MIL_STD_1553,
    typeName: PacketTypeName[PacketType.MIL_STD_1553],
    timestamp: formatTimestamp(header.timestamp),
    timestampNs: header.timestamp,
    packetLength: header.packetLength,
    dataLength: header.dataLength,
    sequenceNumber: index,
    offset: fileOffset,
    preview
  };

  const fields: Record<string, string | number | bigint> = {
    'Format': 'MIL-STD-1553 Bus Data',
    'Bus Type': 'Dual-redundant avionics data bus',
    'Message Count': messageCount,
    'Bus Errors Detected': busErrors
  };

  messages.forEach((msg, idx) => {
    if (idx >= 10) return;
    
    const rt = (msg.commandWord1 >> 11) & 0x1f;
    const tr = (msg.commandWord1 >> 10) & 0x01;
    const sa = (msg.commandWord1 >> 5) & 0x1f;
    const wc = msg.commandWord1 & 0x1f;
    
    fields[`Msg ${idx + 1}`] = formatWord(rt, tr, sa, wc);
    fields[`Msg ${idx + 1} Data`] = `[${msg.dataWords.slice(0, 8).map(d => '0x' + d.toString(16).toUpperCase().padStart(4, '0')).join(', ')}${msg.dataWords.length > 8 ? ', ...' : ''}]`;
    
    if (msg.statusWord1 !== undefined) {
      const statusFlags = [];
      if (msg.statusWord1 & 0x8000) statusFlags.push('ME');
      if (msg.statusWord1 & 0x4000) statusFlags.push('WE');
      if (msg.statusWord1 & 0x0800) statusFlags.push('Busy');
      if (msg.statusWord1 & 0x0400) statusFlags.push('Subsystem Flag');
      if (msg.statusWord1 & 0x0200) statusFlags.push('Busy A');
      if (msg.statusWord1 & 0x0100) statusFlags.push('Busy B');
      fields[`Msg ${idx + 1} Status`] = statusFlags.length > 0 ? statusFlags.join(', ') : 'OK';
    }
  });

  const detail: PacketDetail = {
    ...summary,
    header,
    fields,
    rawDataHex
  };

  return { summary, detail };
}
