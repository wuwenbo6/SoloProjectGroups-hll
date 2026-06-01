const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pcap = require('pcap');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const sessions = new Map();
const MAX_PACKET_HISTORY = 1000;
const BATCH_INTERVAL = 50;
const MAX_BATCH_SIZE = 100;
const MAX_BUFFERED_AMOUNT = 1024 * 1024;
const MAX_STREAMS = 500;

function generateSessionId() {
  return crypto.randomBytes(4).toString('hex');
}

function getNetworkInterfaces() {
  const interfaces = pcap.findalldevs();
  return interfaces.map(dev => ({
    name: dev.name,
    description: dev.description || '',
    addresses: dev.addresses || []
  }));
}

function validateBPFFilter(filter) {
  if (!filter || filter.trim() === '') {
    return { valid: true };
  }

  const commonErrors = checkCommonFilterErrors(filter);
  if (commonErrors) {
    return commonErrors;
  }

  return { valid: true };
}

function checkCommonFilterErrors(filter) {
  const errors = [];
  const hints = [];

  if (filter.match(/\sport\s+\d+\s*-\s*\d+/)) {
    errors.push('端口范围应使用 portrange');
    hints.push('例如: tcp portrange 80-90');
  }

  if (filter.match(/\b(and|or|not)\b/i) && !filter.match(/\(|\)/)) {
    hints.push('复杂表达式建议使用括号，例如: (tcp port 80) and (host 192.168.1.1)');
  }

  if (filter.match(/\bip\s+(tcp|udp)\b/i)) {
    errors.push('不需要 ip 前缀');
    hints.push('直接使用: tcp port 80 或 udp port 53');
  }

  if (filter.match(/\bport\s+[a-zA-Z]/) && !filter.match(/\bport\s+(http|https|ftp|ssh|telnet|domain|dns)\b/i)) {
    errors.push('端口号必须是数字');
    hints.push('例如: tcp port 80，而不是 tcp port http');
  }

  const invalidKeywords = filter.match(/\b([a-zA-Z]+)\s*port\b/gi);
  if (invalidKeywords) {
    invalidKeywords.forEach(match => {
      const keyword = match.toLowerCase().replace(/\s*port$/, '');
      if (!['tcp', 'udp', 'src', 'dst'].includes(keyword)) {
        errors.push(`无效的协议: ${keyword}`);
      }
    });
  }

  if (errors.length > 0) {
    return {
      valid: false,
      message: errors.join('; '),
      hint: hints
    };
  }

  if (hints.length > 0) {
    return {
      valid: true,
      warning: '检查过滤器语法',
      hint: hints
    };
  }

  return null;
}



app.get('/api/interfaces', (req, res) => {
  try {
    const interfaces = getNetworkInterfaces();
    res.json(interfaces);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/validate-filter', (req, res) => {
  const { filter } = req.body;
  const result = validateBPFFilter(filter);
  res.json(result);
});

app.post('/api/sessions', (req, res) => {
  const { interface: iface, filter, sessionId } = req.body;

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    res.json({
      sessionId,
      interface: session.interface,
      filter: session.filter,
      clients: session.clients.size
    });
    return;
  }

  if (!iface) {
    res.status(400).json({ error: 'Network interface is required' });
    return;
  }

  const filterResult = validateBPFFilter(filter);
  if (!filterResult.valid) {
    res.status(400).json({
      error: filterResult.message,
      hint: filterResult.hint
    });
    return;
  }

  const newSessionId = generateSessionId();
  let pcapSession = null;

  try {
    pcapSession = pcap.createSession(iface, filter || '');
  } catch (err) {
    res.status(500).json({ error: `Failed to create capture session: ${err.message}` });
    return;
  }

  const session = {
    id: newSessionId,
    interface: iface,
    filter: filter || '',
    pcapSession,
    clients: new Set(),
    packetHistory: [],
    rawPackets: [],
    packetCount: 0,
    startedAt: Date.now(),
    packetBuffer: [],
    batchTimer: null,
    droppedPackets: 0,
    tcpStreams: new Map(),
    streamList: [],
    expertInfo: [],
    linkType: pcapSession.link_type || 1
  };

  pcapSession.on('packet', (rawPacket) => {
    const packet = decodePacket(rawPacket, session.packetCount);
    session.packetCount++;

    session.packetHistory.push(packet);
    if (session.packetHistory.length > MAX_PACKET_HISTORY) {
      session.packetHistory.shift();
    }

    session.rawPackets.push({
      buf: rawPacket.buf,
      timestamp: rawPacket.pcap_header?.ts?.seconds * 1000 + (rawPacket.pcap_header?.ts?.microseconds / 1000) || Date.now(),
      len: rawPacket.pcap_header?.len || rawPacket.buf.length,
      caplen: rawPacket.pcap_header?.caplen || rawPacket.buf.length
    });
    if (session.rawPackets.length > MAX_PACKET_HISTORY) {
      session.rawPackets.shift();
    }

    if (packet.payload?.tcp) {
      const streamResult = trackTCPStream(session, packet);
      if (streamResult.newStream) {
        broadcastToSession(session, {
          type: 'new_stream',
          stream: streamResult.stream
        });
      }
      if (streamResult.updated) {
        broadcastToSession(session, {
          type: 'stream_updated',
          stream: streamResult.stream
        });
      }
    }

    const expertResults = checkExpertInfo(session, packet);
    expertResults.forEach(info => {
      broadcastToSession(session, {
        type: 'expert_info',
        data: info
      });
    });

    session.packetBuffer.push(packet);

    if (!session.batchTimer) {
      session.batchTimer = setInterval(() => {
        flushPacketBatch(session);
      }, BATCH_INTERVAL);
    }

    if (session.packetBuffer.length >= MAX_BATCH_SIZE) {
      flushPacketBatch(session);
    }
  });

  pcapSession.on('error', (err) => {
    broadcastToSession(session, {
      type: 'error',
      message: err.message
    });
  });

  sessions.set(newSessionId, session);

  res.json({
    sessionId: newSessionId,
    interface: iface,
    filter: filter || '',
    clients: 0
  });
});

app.delete('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  cleanupSession(sessionId);
  res.json({ success: true });
});

app.get('/api/sessions/:sessionId/packets', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const { limit = 100, offset = 0 } = req.query;
  const start = Math.max(0, session.packetHistory.length - parseInt(limit) - parseInt(offset));
  const end = session.packetHistory.length - parseInt(offset);
  const packets = session.packetHistory.slice(start, end);

  res.json({
    packets,
    total: session.packetCount,
    hasMore: start > 0
  });
});

app.get('/api/sessions/:sessionId/streams', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const streams = session.streamList.map(s => ({
    index: s.index,
    key: s.key,
    src: s.src,
    dst: s.dst,
    startTime: s.startTime,
    endTime: s.endTime,
    status: s.status,
    packetCount: s.packetCount,
    byteCount: s.byteCount,
    flags: s.flags
  }));

  res.json({ streams });
});

app.get('/api/sessions/:sessionId/streams/:streamIndex/packets', (req, res) => {
  const { sessionId, streamIndex } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const stream = session.streamList[parseInt(streamIndex)];
  if (!stream) {
    res.status(404).json({ error: 'Stream not found' });
    return;
  }

  const packets = stream.packets
    .map(idx => session.packetHistory.find(p => p.index === idx))
    .filter(Boolean);

  res.json({ stream, packets });
});

app.get('/api/sessions/:sessionId/expert', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const { limit = 100 } = req.query;
  const infos = session.expertInfo.slice(-parseInt(limit));

  res.json({
    expertInfo: infos,
    total: session.expertInfo.length
  });
});

app.get('/api/sessions/:sessionId/export', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  try {
    const pcapng = buildPCAPNG(session);
    const filename = `capture-${sessionId}-${Date.now()}.pcapng`;

    res.setHeader('Content-Type', 'application/vnd.tcpdump.pcapng');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pcapng.length);

    res.send(pcapng);
  } catch (err) {
    res.status(500).json({ error: `Export failed: ${err.message}` });
  }
});

function decodePacket(rawPacket, index) {
  const packet = pcap.decode.packet(rawPacket);
  const linkType = packet.link_type;

  let result = {
    index,
    timestamp: Date.now(),
    linkType,
    length: rawPacket.buf?.length || 0,
    rawHex: rawPacket.buf ? rawPacket.buf.toString('hex') : '',
    payload: {}
  };

  try {
    if (packet.payload) {
      const ethernet = packet.payload;
      result.payload.ethernet = {
        type: ethernet.ethertype,
        src: ethernet.shost,
        dst: ethernet.dhost
      };

      if (ethernet.payload) {
        const ip = ethernet.payload;
        const ipVersion = ip.version;

        if (ipVersion === 4) {
          result.payload.ip = {
            version: 4,
            src: ip.saddr,
            dst: ip.daddr,
            protocol: ip.protocol,
            ttl: ip.ttl,
            length: ip.length
          };

          if (ip.payload) {
            if (ip.protocol === 6 && ip.payload.payload) {
              const tcp = ip.payload;
              result.payload.tcp = {
                srcPort: tcp.sport,
                dstPort: tcp.dport,
                seqNo: tcp.seqno,
                ackNo: tcp.ackno,
                flags: {
                  syn: tcp.flags.syn,
                  ack: tcp.flags.ack,
                  fin: tcp.flags.fin,
                  rst: tcp.flags.rst,
                  psh: tcp.flags.psh,
                  urg: tcp.flags.urg
                },
                windowSize: tcp.window_size,
                dataOffset: tcp.data_offset
              };
              result.payload.transport = 'TCP';
              result.srcPort = tcp.sport;
              result.dstPort = tcp.dport;
              if (tcp.payload) {
                result.payload.tcp.payload = tcp.payload.toString('hex');
              }
            } else if (ip.protocol === 17 && ip.payload.payload) {
              const udp = ip.payload;
              result.payload.udp = {
                srcPort: udp.sport,
                dstPort: udp.dport,
                length: udp.length,
                checksum: udp.checksum
              };
              result.payload.transport = 'UDP';
              result.srcPort = udp.sport;
              result.dstPort = udp.dport;
            } else if (ip.protocol === 1) {
              result.payload.transport = 'ICMP';
            }
          }
        } else if (ipVersion === 6) {
          result.payload.ip = {
            version: 6,
            src: ip.saddr.toString(),
            dst: ip.daddr.toString(),
            nextHeader: ip.next_header,
            hopLimit: ip.hop_limit,
            payloadLength: ip.payload_length
          };
          result.payload.transport = 'IPv6';
        }
      }
    }
  } catch (err) {
    result.decodeError = err.message;
  }

  return result;
}

function getStreamKey(packet) {
  const ip = packet.payload?.ip;
  const tcp = packet.payload?.tcp;
  if (!ip || !tcp) return null;

  const src = `${ip.src}:${tcp.srcPort}`;
  const dst = `${ip.dst}:${tcp.dstPort}`;
  const keys = [src, dst].sort();
  return `${keys[0]}<->${keys[1]}`;
}

function trackTCPStream(session, packet) {
  const key = getStreamKey(packet);
  if (!key) return { newStream: false, updated: false };

  const ip = packet.payload.ip;
  const tcp = packet.payload.tcp;
  const src = `${ip.src}:${tcp.srcPort}`;
  const dst = `${ip.dst}:${tcp.dstPort}`;

  let stream = session.tcpStreams.get(key);
  let isNew = false;

  if (!stream) {
    const streamIndex = session.streamList.length;
    stream = {
      index: streamIndex,
      key,
      src,
      dst,
      packets: [],
      byteCount: { [src]: 0, [dst]: 0 },
      packetCount: { [src]: 0, [dst]: 0 },
      startTime: packet.timestamp,
      endTime: packet.timestamp,
      status: 'active',
      flags: {
        syn: { [src]: false, [dst]: false },
        ack: { [src]: false, [dst]: false },
        fin: { [src]: false, [dst]: false },
        rst: false
      }
    };

    session.tcpStreams.set(key, stream);
    session.streamList.push(stream);
    isNew = true;

    if (session.tcpStreams.size > MAX_STREAMS) {
      const oldestKey = session.streamList[0]?.key;
      if (oldestKey) {
        session.tcpStreams.delete(oldestKey);
        session.streamList.shift();
      }
    }
  }

  stream.packets.push(packet.index);
  stream.byteCount[src] += packet.length || 0;
  stream.packetCount[src]++;
  stream.endTime = packet.timestamp;

  if (tcp.flags.syn) stream.flags.syn[src] = true;
  if (tcp.flags.ack) stream.flags.ack[src] = true;
  if (tcp.flags.fin) {
    stream.flags.fin[src] = true;
    if (stream.flags.fin[src] && stream.flags.fin[dst]) {
      stream.status = 'closed';
    }
  }
  if (tcp.flags.rst) {
    stream.flags.rst = true;
    stream.status = 'reset';
  }

  const publicStream = {
    index: stream.index,
    key: stream.key,
    src: stream.src,
    dst: stream.dst,
    startTime: stream.startTime,
    endTime: stream.endTime,
    status: stream.status,
    packetCount: stream.packetCount,
    byteCount: stream.byteCount,
    flags: stream.flags
  };

  return { newStream: isNew, updated: true, stream: publicStream };
}

function checkExpertInfo(session, packet) {
  const infos = [];
  const tcp = packet.payload?.tcp;
  const ip = packet.payload?.ip;

  if (tcp) {
    if (tcp.flags.syn && tcp.flags.ack) {
      infos.push({
        severity: 'info',
        type: 'tcp.connection.syn_ack',
        message: `TCP SYN-ACK: ${ip.src}:${tcp.srcPort} → ${ip.dst}:${tcp.dstPort}`,
        packetIndex: packet.index,
        timestamp: packet.timestamp
      });
    } else if (tcp.flags.syn) {
      infos.push({
        severity: 'info',
        type: 'tcp.connection.syn',
        message: `TCP SYN: ${ip.src}:${tcp.srcPort} → ${ip.dst}:${tcp.dstPort}`,
        packetIndex: packet.index,
        timestamp: packet.timestamp
      });
    } else if (tcp.flags.fin) {
      infos.push({
        severity: 'info',
        type: 'tcp.connection.fin',
        message: `TCP FIN: ${ip.src}:${tcp.srcPort} → ${ip.dst}:${tcp.dstPort}`,
        packetIndex: packet.index,
        timestamp: packet.timestamp
      });
    } else if (tcp.flags.rst) {
      infos.push({
        severity: 'warning',
        type: 'tcp.connection.reset',
        message: `TCP RST: ${ip.src}:${tcp.srcPort} → ${ip.dst}:${tcp.dstPort}`,
        packetIndex: packet.index,
        timestamp: packet.timestamp
      });
    }

    if (tcp.windowSize < 100 && tcp.windowSize > 0) {
      infos.push({
        severity: 'warning',
        type: 'tcp.window.zero',
        message: `TCP 窗口过小: ${tcp.windowSize} (可能出现流控问题)`,
        packetIndex: packet.index,
        timestamp: packet.timestamp
      });
    }

    if (packet.length < 60 && tcp.flags.psh) {
      infos.push({
        severity: 'note',
        type: 'tcp.small_segment',
        message: `TCP 小段数据: ${packet.length} bytes`,
        packetIndex: packet.index,
        timestamp: packet.timestamp
      });
    }
  }

  if (ip && ip.ttl < 10) {
    infos.push({
      severity: 'warning',
      type: 'ip.ttl.low',
      message: `IP TTL 过低: ${ip.ttl}`,
      packetIndex: packet.index,
      timestamp: packet.timestamp
    });
  }

  if (packet.length < 60) {
    infos.push({
      severity: 'note',
      type: 'frame.small',
      message: `超短帧: ${packet.length} bytes`,
      packetIndex: packet.index,
      timestamp: packet.timestamp
    });
  }

  infos.forEach(info => {
    session.expertInfo.push(info);
    if (session.expertInfo.length > MAX_PACKET_HISTORY) {
      session.expertInfo.shift();
    }
  });

  return infos;
}

function buildPCAPNG(session) {
  const blocks = [];

  const sectionHeader = buildSectionHeaderBlock();
  blocks.push(sectionHeader);

  const interfaceDescription = buildInterfaceDescriptionBlock(session);
  blocks.push(interfaceDescription);

  session.rawPackets.forEach((rp, idx) => {
    const epb = buildEnhancedPacketBlock(rp, idx);
    blocks.push(epb);
  });

  const totalLength = blocks.reduce((sum, b) => sum + b.length, 0);
  const buffer = Buffer.alloc(totalLength);
  let offset = 0;
  blocks.forEach(b => {
    b.copy(buffer, offset);
    offset += b.length;
  });

  return buffer;
}

function buildSectionHeaderBlock() {
  const magic = 0x1a2b3c4d;
  const versionMajor = 1;
  const versionMinor = 0;
  const sectionLength = -1;

  const options = Buffer.from([
    0x03, 0x00, 0x10, 0x00,
    0x52, 0x65, 0x6d, 0x6f, 0x74, 0x65, 0x50, 0x43, 0x41, 0x50, 0x20, 0x31, 0x2e, 0x30, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
  ]);

  const blockType = 0x0a0d0d0a;
  const blockLength = 28 + options.length;

  const buf = Buffer.alloc(blockLength);
  buf.writeUInt32LE(blockType, 0);
  buf.writeUInt32LE(blockLength, 4);
  buf.writeUInt32BE(magic, 8);
  buf.writeUInt16LE(versionMajor, 12);
  buf.writeUInt16LE(versionMinor, 14);
  buf.writeInt32LE(sectionLength, 16);
  buf.writeInt32LE(sectionLength, 20);
  options.copy(buf, 24);
  buf.writeUInt32LE(blockLength, blockLength - 4);

  return buf;
}

function buildInterfaceDescriptionBlock(session) {
  const linkType = session.linkType;
  const snapLen = 65535;

  const name = session.interface;
  const nameBuf = Buffer.from(name, 'utf8');
  const namePad = (4 - (nameBuf.length % 4)) % 4;
  const options = Buffer.alloc(4 + 4 + nameBuf.length + namePad + 4);
  let offset = 0;
  options.writeUInt16LE(0x0002, offset);
  offset += 2;
  options.writeUInt16LE(nameBuf.length + namePad, offset);
  offset += 2;
  nameBuf.copy(options, offset);
  offset += nameBuf.length + namePad;
  options.writeUInt32LE(0x00000000, offset);

  const blockType = 0x00000001;
  const blockLength = 20 + options.length;

  const buf = Buffer.alloc(blockLength);
  buf.writeUInt32LE(blockType, 0);
  buf.writeUInt32LE(blockLength, 4);
  buf.writeUInt16LE(linkType, 8);
  buf.writeUInt16LE(0, 10);
  buf.writeUInt32LE(snapLen, 12);
  options.copy(buf, 16);
  buf.writeUInt32LE(blockLength, blockLength - 4);

  return buf;
}

function buildEnhancedPacketBlock(rawPacket, index) {
  const interfaceId = 0;
  const timestamp = rawPacket.timestamp;
  const tsHigh = Math.floor(timestamp / 1000 / 4294.967296);
  const tsLow = Math.floor((timestamp / 1000) * 1000000) % 4294967296;
  const capturedLen = rawPacket.caplen;
  const originalLen = rawPacket.len;

  const packetData = rawPacket.buf;
  const dataPad = (4 - (packetData.length % 4)) % 4;

  const blockType = 0x00000006;
  const blockLength = 32 + packetData.length + dataPad;

  const buf = Buffer.alloc(blockLength);
  buf.writeUInt32LE(blockType, 0);
  buf.writeUInt32LE(blockLength, 4);
  buf.writeUInt32LE(interfaceId, 8);
  buf.writeUInt32LE(tsHigh, 12);
  buf.writeUInt32LE(tsLow, 16);
  buf.writeUInt32LE(capturedLen, 20);
  buf.writeUInt32LE(originalLen, 24);
  packetData.copy(buf, 28);
  buf.writeUInt32LE(blockLength, blockLength - 4);

  return buf;
}

function flushPacketBatch(session) {
  if (session.packetBuffer.length === 0) return;

  const batch = session.packetBuffer.splice(0, MAX_BATCH_SIZE);

  const message = {
    type: 'packet_batch',
    packets: batch
  };

  broadcastToSession(session, message);

  if (session.packetBuffer.length > MAX_BATCH_SIZE * 5) {
    session.droppedPackets += session.packetBuffer.length - MAX_BATCH_SIZE;
    session.packetBuffer = session.packetBuffer.slice(-MAX_BATCH_SIZE);

    broadcastToSession(session, {
      type: 'congestion_warning',
      droppedPackets: session.droppedPackets,
      bufferSize: session.packetBuffer.length
    });
  }
}

function broadcastToSession(session, message) {
  const data = JSON.stringify(message);
  session.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;

    if (client.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      if (!client.backpressureWarningSent) {
        client.backpressureWarningSent = true;
        client.send(JSON.stringify({
          type: 'backpressure',
          message: 'Client too slow, skipping packets'
        }));
      }
      return;
    }

    client.backpressureWarningSent = false;
    client.send(data);
  });
}

function cleanupSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    try {
      session.pcapSession.close();
    } catch (e) {
    }
    if (session.batchTimer) {
      clearInterval(session.batchTimer);
    }
    sessions.delete(sessionId);
  }
}

wss.on('connection', (ws, req) => {
  let sessionId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'join': {
          sessionId = data.sessionId;
          const session = sessions.get(sessionId);

          if (!session) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Session not found'
            }));
            return;
          }

          session.clients.add(ws);
          ws.send(JSON.stringify({
            type: 'joined',
            sessionId,
            interface: session.interface,
            filter: session.filter,
            packetCount: session.packetCount,
            startedAt: session.startedAt,
            clients: session.clients.size
          }));

          broadcastToSession(session, {
            type: 'client_joined',
            clients: session.clients.size
          });
          break;
        }

        case 'leave': {
          if (sessionId) {
            const session = sessions.get(sessionId);
            if (session) {
              session.clients.delete(ws);
              broadcastToSession(session, {
                type: 'client_left',
                clients: session.clients.size
              });
            }
            sessionId = null;
          }
          break;
        }

        case 'request_history': {
          if (sessionId) {
            const session = sessions.get(sessionId);
            if (session) {
              const { limit = 50 } = data;
              const packets = session.packetHistory.slice(-limit);
              ws.send(JSON.stringify({
                type: 'history',
                packets
              }));
            }
          }
          break;
        }

        case 'request_streams': {
          if (sessionId) {
            const session = sessions.get(sessionId);
            if (session) {
              const streams = session.streamList.map(s => ({
                index: s.index,
                key: s.key,
                src: s.src,
                dst: s.dst,
                startTime: s.startTime,
                endTime: s.endTime,
                status: s.status,
                packetCount: s.packetCount,
                byteCount: s.byteCount,
                flags: s.flags
              }));
              ws.send(JSON.stringify({
                type: 'streams',
                streams
              }));
            }
          }
          break;
        }

        case 'request_expert': {
          if (sessionId) {
            const session = sessions.get(sessionId);
            if (session) {
              const { limit = 100 } = data;
              const infos = session.expertInfo.slice(-parseInt(limit));
              ws.send(JSON.stringify({
                type: 'expert',
                expertInfo: infos
              }));
            }
          }
          break;
        }
      }
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'error',
        message: err.message
      }));
    }
  });

  ws.on('close', () => {
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        session.clients.delete(ws);
        broadcastToSession(session, {
          type: 'client_left',
          clients: session.clients.size
        });

        if (session.clients.size === 0) {
          setTimeout(() => {
            const currentSession = sessions.get(sessionId);
            if (currentSession && currentSession.clients.size === 0) {
              cleanupSession(sessionId);
            }
          }, 30000);
        }
      }
    }
  });

  ws.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket connection established'
  }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Remote PCAP server running on http://localhost:${PORT}`);
});
