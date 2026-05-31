const WebSocket = require('ws');
const crypto = require('crypto');
const db = require('./database');

class BandwidthProbe {
  constructor(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws/bandwidth' });
    this.sessions = new Map();
    this.init();
  }

  init() {
    this.wss.on('connection', (ws) => {
      const sessionId = this.generateSessionId();
      this.sessions.set(sessionId, {
        ws,
        startTime: null,
        bytesReceived: 0,
        bandwidth: 0
      });

      console.log(`New bandwidth probe session: ${sessionId}`);

      ws.on('message', (data) => {
        this.handleMessage(sessionId, data);
      });

      ws.on('close', () => {
        console.log(`Session closed: ${sessionId}`);
        this.sessions.delete(sessionId);
      });

      ws.send(JSON.stringify({ type: 'session', sessionId }));
    });
  }

  generateSessionId() {
    return crypto.randomBytes(8).toString('hex');
  }

  async handleMessage(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'probe-start':
          this.startProbe(sessionId, session, message);
          break;
        case 'probe-data':
          this.handleProbeData(sessionId, session, message);
          break;
        case 'probe-end':
          await this.endProbe(sessionId, session);
          break;
        case 'get-current':
          this.sendCurrentBandwidth(sessionId, session);
          break;
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  }

  startProbe(sessionId, session, message) {
    session.startTime = Date.now();
    session.bytesReceived = 0;
    session.packetCount = 0;
    
    session.ws.send(JSON.stringify({
      type: 'probe-ack',
      timestamp: Date.now()
    }));
  }

  handleProbeData(sessionId, session, message) {
    if (!session.startTime) {
      session.startTime = Date.now();
    }

    session.bytesReceived += message.size || 1024;
    session.packetCount = (session.packetCount || 0) + 1;

    const elapsed = (Date.now() - session.startTime) / 1000;
    if (elapsed > 0) {
      session.bandwidth = (session.bytesReceived * 8) / elapsed;
    }

    if (session.packetCount % 5 === 0) {
      this.sendBandwidthUpdate(sessionId, session);
    }
  }

  async endProbe(sessionId, session) {
    const elapsed = (Date.now() - session.startTime) / 1000;
    const bandwidth = elapsed > 0 ? (session.bytesReceived * 8) / elapsed : 0;
    
    session.bandwidth = bandwidth;

    await this.saveBandwidthLog(sessionId, bandwidth);

    session.ws.send(JSON.stringify({
      type: 'probe-result',
      bandwidth: bandwidth,
      bytesReceived: session.bytesReceived,
      duration: elapsed
    }));

    session.startTime = null;
    session.bytesReceived = 0;
  }

  sendBandwidthUpdate(sessionId, session) {
    session.ws.send(JSON.stringify({
      type: 'bandwidth-update',
      bandwidth: session.bandwidth,
      timestamp: Date.now()
    }));
  }

  sendCurrentBandwidth(sessionId, session) {
    session.ws.send(JSON.stringify({
      type: 'current-bandwidth',
      bandwidth: session.bandwidth
    }));
  }

  async saveBandwidthLog(sessionId, bandwidth) {
    try {
      await db.run('INSERT INTO bandwidth_logs (session_id, bandwidth_bps) VALUES (?, ?)', [sessionId, bandwidth]);
    } catch (e) {
      console.error('Error saving bandwidth log:', e);
    }
  }

  startContinuousProbe(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const probeInterval = setInterval(() => {
      if (!this.sessions.has(sessionId)) {
        clearInterval(probeInterval);
        return;
      }

      const payloadSize = 10 * 1024;
      const payload = Buffer.alloc(payloadSize);
      
      session.ws.send(JSON.stringify({
        type: 'probe-payload',
        size: payloadSize,
        timestamp: Date.now()
      }));
    }, 500);
  }

  getSessionBandwidth(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.bandwidth : 0;
  }
}

module.exports = BandwidthProbe;
