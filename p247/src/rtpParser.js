const fs = require('fs');
const pcapParser = require('pcap-parser');
const { RTCPParser } = require('./rtcpParser');

class RTPParser {
  constructor() {
    this.rtpStreams = new Map();
    this.rtcpParser = new RTCPParser();
  }

  parseRTPHeader(buffer) {
    if (buffer.length < 12) return null;

    const version = (buffer[0] >> 6) & 0x03;
    const padding = (buffer[0] >> 5) & 0x01;
    const extension = (buffer[0] >> 4) & 0x01;
    const csrcCount = buffer[0] & 0x0f;
    const marker = (buffer[1] >> 7) & 0x01;
    const payloadType = buffer[1] & 0x7f;
    const sequenceNumber = buffer.readUInt16BE(2);
    const timestamp = buffer.readUInt32BE(4);
    const ssrc = buffer.readUInt32BE(8);

    let headerLength = 12 + csrcCount * 4;

    if (extension && buffer.length >= headerLength + 4) {
      const extensionLength = buffer.readUInt16BE(headerLength + 2);
      headerLength += 4 + extensionLength * 4;
    }

    if (padding && buffer.length > headerLength) {
      const paddingLength = buffer[buffer.length - 1];
      if (paddingLength > 0 && headerLength + paddingLength <= buffer.length) {
        return {
          version,
          padding,
          extension,
          csrcCount,
          marker,
          payloadType,
          sequenceNumber,
          timestamp,
          ssrc,
          headerLength,
          payload: buffer.slice(headerLength, buffer.length - paddingLength)
        };
      }
    }

    return {
      version,
      padding,
      extension,
      csrcCount,
      marker,
      payloadType,
      sequenceNumber,
      timestamp,
      ssrc,
      headerLength,
      payload: buffer.slice(headerLength)
    };
  }

  isRTCPPacket(buffer) {
    return this.rtcpParser.isRTCP(buffer);
  }

  isRTPPacket(buffer) {
    if (buffer.length < 12) return false;
    const version = (buffer[0] >> 6) & 0x03;
    const packetType = buffer[1] & 0x7f;
    return version === 2 && packetType < 128;
  }

  parsePCAPFile(filePath) {
    return new Promise((resolve, reject) => {
      const rtpPackets = [];
      const rtcpPackets = [];
      const parser = pcapParser.parse(filePath);

      parser.on('packet', (packet) => {
        const parsed = this.extractPacketFromPCAP(packet);
        if (!parsed) return;

        if (parsed.type === 'rtp') {
          rtpPackets.push(parsed.packet);
        } else if (parsed.type === 'rtcp') {
          rtcpPackets.push(parsed.packet);
        }
      });

      parser.on('end', () => {
        resolve({
          rtpPackets,
          rtcpPackets,
          totalRTP: rtpPackets.length,
          totalRTCP: rtcpPackets.length
        });
      });

      parser.on('error', (err) => {
        reject(err);
      });
    });
  }

  extractPacketFromPCAP(packet) {
    const packetData = packet.data;
    if (packetData.length < 14) return null;

    const etherType = packetData.readUInt16BE(12);
    let ipStart = 14;

    if (etherType === 0x8100 && packetData.length >= 18) {
      ipStart = 18;
    }

    if (packetData.length < ipStart + 20) return null;

    const ipVersion = (packetData[ipStart] >> 4) & 0x0f;
    if (ipVersion !== 4) return null;

    const ihl = packetData[ipStart] & 0x0f;
    const ipHeaderLength = ihl * 4;
    const protocol = packetData[ipStart + 9];

    if (protocol !== 17) return null;

    const udpStart = ipStart + ipHeaderLength;

    if (packetData.length < udpStart + 8) return null;

    const sourcePort = packetData.readUInt16BE(udpStart);
    const destPort = packetData.readUInt16BE(udpStart + 2);
    const udpLength = packetData.readUInt16BE(udpStart + 4);

    const payloadStart = udpStart + 8;
    const payload = packetData.slice(payloadStart, payloadStart + udpLength - 8);

    const arrivalTime = packet.header.timestampSeconds * 1000000 + packet.header.timestampMicroseconds;

    if (this.isRTCPPacket(payload)) {
      const rtcpPacket = this.rtcpParser.parseRTCPPacket(payload);
      if (rtcpPacket) {
        return {
          type: 'rtcp',
          packet: {
            arrivalTime,
            sourcePort,
            destPort,
            ...rtcpPacket
          }
        };
      }
    }

    if (this.isRTPPacket(payload)) {
      const rtpHeader = this.parseRTPHeader(payload);
      if (rtpHeader && rtpHeader.version === 2) {
        return {
          type: 'rtp',
          packet: {
            arrivalTime,
            sourcePort,
            destPort,
            ...rtpHeader
          }
        };
      }
    }

    return null;
  }

  groupBySSRC(packets) {
    const streams = new Map();
    for (const packet of packets) {
      const key = packet.ssrc.toString();
      if (!streams.has(key)) {
        streams.set(key, []);
      }
      streams.get(key).push(packet);
    }
    return streams;
  }

  groupRTCPBySSRC(rtcpPackets) {
    const srpPackets = rtcpPackets.filter(p => p.packetTypeName === 'SR');
    const streams = new Map();
    for (const packet of srpPackets) {
      const key = packet.ssrc.toString();
      if (!streams.has(key)) {
        streams.set(key, []);
      }
      streams.get(key).push(packet);
    }
    return streams;
  }
}

module.exports = RTPParser;
