import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function writeFileHeader(buffer, offset) {
  const syncPattern = Buffer.from([0x49, 0x52, 0x49, 0x47, 0x31, 0x30, 0x36, 0x00]);
  syncPattern.copy(buffer, offset);
  
  buffer.writeUInt16LE(0x0a00, offset + 8);
  
  buffer.writeBigUInt64LE(0n, offset + 10);
  
  const now = Math.floor(Date.now() / 1000);
  buffer.writeUInt32LE(now, offset + 18);
  
  buffer.writeUInt16LE(0, offset + 22);
  
  return 24;
}

function writePacketHeader(buffer, offset, packetType, packetLength, timestampNs, hasSecondaryHeader = false, hasChecksum = false) {
  buffer.writeUInt16LE(0xeb90, offset);
  
  let chunkInfo = packetType & 0x07ff;
  if (hasSecondaryHeader) chunkInfo |= (1 << 11);
  if (hasChecksum) chunkInfo |= (1 << 12);
  buffer.writeUInt16LE(chunkInfo, offset + 2);
  
  buffer.writeUInt32LE(packetLength, offset + 4);
  
  buffer.writeBigUInt64LE(timestampNs, offset + 8);
  
  return 16;
}

function generateTmatsPacket() {
  const tmatsContent = `BEGIN TMATS
\\ID: RECORDER-001\\
\\COMMENT: Generated test data\\
\\COMMENT: IRIG 106 Chapter 10 Sample File\\
\\R-1\\RECORDING\\FORMAT: IRIG106\\
\\R-1\\RECORDING\\VERSION: 10.0\\
\\R-1\\TM\\CH-1\\NAME: Temperature\\
\\R-1\\TM\\CH-1\\SOURCE: Sensor_A\\
\\R-1\\TM\\CH-2\\NAME: Pressure\\
\\R-1\\TM\\CH-2\\SOURCE: Sensor_B\\
\\R-1\\TM\\CH-3\\NAME: Acceleration_X\\
\\R-1\\TM\\CH-3\\SOURCE: IMU\\
\\R-1\\1553\\BUS-1\\NAME: Main Bus\\
\\R-1\\1553\\BUS-1\\RT-1\\NAME: Flight_Computer\\
\\R-1\\1553\\BUS-1\\RT-2\\NAME: Navigation\\
END TMATS
`;

  const contentBuffer = Buffer.from(tmatsContent, 'utf8');
  const headerSize = 16;
  const padding = (4 - (contentBuffer.length % 4)) % 4;
  const totalLength = headerSize + contentBuffer.length + padding;
  
  const buffer = Buffer.alloc(totalLength);
  const timestamp = 0n;
  
  writePacketHeader(buffer, 0, 0x01, totalLength, timestamp);
  contentBuffer.copy(buffer, headerSize);
  
  return buffer;
}

function generatePcmPacket(timestampNs, packetIndex) {
  const sampleCount = 1024;
  const dataSize = sampleCount * 2;
  const headerSize = 16;
  const totalLength = headerSize + dataSize;
  
  const buffer = Buffer.alloc(totalLength);
  
  writePacketHeader(buffer, 0, 0x02, totalLength, timestampNs);
  
  for (let i = 0; i < sampleCount; i++) {
    const phase = (packetIndex * 0.1) + (i * 0.01);
    const value = Math.floor(2000 * Math.sin(phase) + Math.random() * 100 - 50);
    buffer.writeInt16LE(value, headerSize + i * 2);
  }
  
  return buffer;
}

function generate1553Packet(timestampNs, packetIndex) {
  const messageCount = 5 + (packetIndex % 8);
  let messagesSize = 0;
  const messages = [];
  
  for (let i = 0; i < messageCount; i++) {
    const rt = 1 + (i % 10);
    const tr = i % 2;
    const sa = 1 + ((i * 3) % 30);
    const wc = 1 + (i % 32);
    
    const dataWordCount = tr === 1 ? wc : wc;
    const header = ((dataWordCount + 2) << 10);
    
    const msgBuffer = Buffer.alloc(8 + 2 + (tr === 0 ? 2 : 0) + dataWordCount * 2 + (tr === 1 ? 2 : 0));
    let pos = 0;
    
    msgBuffer.writeUInt16LE(header, pos); pos += 2;
    msgBuffer.writeUInt16LE(Math.floor(Math.random() * 1000), pos); pos += 2;
    msgBuffer.writeUInt32LE(Math.floor(Math.random() * 1000000), pos); pos += 4;
    
    const cmdWord1 = (rt << 11) | (tr << 10) | (sa << 5) | wc;
    msgBuffer.writeUInt16LE(cmdWord1, pos); pos += 2;
    
    if (tr === 0) {
      msgBuffer.writeUInt16LE(0x0000, pos); pos += 2;
    }
    
    for (let j = 0; j < dataWordCount; j++) {
      msgBuffer.writeUInt16LE(Math.floor(Math.random() * 0xffff), pos); pos += 2;
    }
    
    if (tr === 1) {
      msgBuffer.writeUInt16LE(0x0000, pos); pos += 2;
    }
    
    messages.push(msgBuffer);
    messagesSize += msgBuffer.length;
  }
  
  const headerSize = 16;
  const totalLength = headerSize + messagesSize;
  const buffer = Buffer.alloc(totalLength);
  
  writePacketHeader(buffer, 0, 0x07, totalLength, timestampNs);
  
  let offset = headerSize;
  for (const msg of messages) {
    msg.copy(buffer, offset);
    offset += msg.length;
  }
  
  return buffer;
}

function generateTestFile(filePath) {
  const tmatsPacket = generateTmatsPacket();
  
  const packets = [];
  packets.push({ data: tmatsPacket, type: 'TMATS' });
  
  let timestamp = 10000000n;
  const timeIncrement = 10000000n;
  
  for (let i = 0; i < 10; i++) {
    const pcmPacket = generatePcmPacket(timestamp, i);
    packets.push({ data: pcmPacket, type: 'PCM' });
    timestamp += timeIncrement;
    
    if (i % 2 === 1) {
      const mil1553Packet = generate1553Packet(timestamp, i);
      packets.push({ data: mil1553Packet, type: 'MIL-STD-1553' });
      timestamp += timeIncrement;
    }
  }
  
  let totalSize = 24;
  for (const packet of packets) {
    totalSize += packet.data.length;
  }
  
  const buffer = Buffer.alloc(totalSize);
  
  let offset = writeFileHeader(buffer, 0);
  buffer.writeBigUInt64LE(BigInt(totalSize), 10);
  
  for (const packet of packets) {
    packet.data.copy(buffer, offset);
    offset += packet.data.length;
  }
  
  fs.writeFileSync(filePath, buffer);
  console.log(`Generated test file: ${filePath}`);
  console.log(`Total size: ${totalSize} bytes`);
  console.log(`Packets: ${packets.length}`);
  packets.forEach((p, i) => {
    console.log(`  ${i}: ${p.type} - ${p.data.length} bytes`);
  });
}

const outputPath = path.join(__dirname, '..', 'test_data.ch10');
generateTestFile(outputPath);
