const fs = require('fs');
const path = require('path');

const TRACE_FORMATS = {
  TEXT: 'text',
  JSON: 'json',
  PCAP: 'pcap',
  HEX: 'hex',
};

class ApduTracer {
  constructor() {
    this._traces = [];
    this._active = false;
    this._autoSave = false;
    this._autoSavePath = null;
    this._maxTraces = 100000;
  }

  start() {
    this._active = true;
    this._traces = [];
  }

  stop() {
    this._active = false;
  }

  isActive() {
    return this._active;
  }

  clear() {
    this._traces = [];
  }

  addTrace(entry) {
    if (!this._active) return;

    const trace = {
      timestamp: entry.timestamp || Date.now(),
      direction: entry.direction || 'outgoing',
      reader: entry.reader || 'unknown',
      slotId: entry.slotId,
      apdu: entry.apdu,
      response: entry.response || null,
      sw: entry.sw || null,
      error: entry.error || null,
      source: entry.source || 'local',
      selectMatch: entry.selectMatch || null,
      id: this._traces.length + 1,
    };

    this._traces.push(trace);

    if (this._traces.length > this._maxTraces) {
      this._traces.shift();
    }

    if (this._autoSave && this._autoSavePath) {
      this._appendToAutoSave(trace);
    }

    return trace;
  }

  getTraces(filter = null) {
    if (!filter) return [...this._traces];

    return this._traces.filter((t) => {
      if (filter.direction && t.direction !== filter.direction) return false;
      if (filter.reader && t.reader !== filter.reader) return false;
      if (filter.slotId !== undefined && t.slotId !== filter.slotId) return false;
      if (filter.source && t.source !== filter.source) return false;
      return true;
    });
  }

  getTraceCount() {
    return this._traces.length;
  }

  setMaxTraces(count) {
    this._maxTraces = count;
  }

  enableAutoSave(filePath) {
    this._autoSave = true;
    this._autoSavePath = filePath;

    if (!fs.existsSync(filePath)) {
      const header = '# APDU Trace Log\n# Started: ' + new Date().toISOString() + '\n# Format: timestamp | direction | reader | slot | APDU | response | SW\n\n';
      fs.writeFileSync(filePath, header);
    }
  }

  disableAutoSave() {
    this._autoSave = false;
    this._autoSavePath = null;
  }

  _appendToAutoSave(trace) {
    try {
      const line = `${new Date(trace.timestamp).toISOString()} | ${trace.direction} | ${trace.reader} | ${trace.slotId || '-'} | ${trace.apdu} | ${trace.response || '-'} | ${trace.sw || '-'}\n`;
      fs.appendFileSync(this._autoSavePath, line);
    } catch (_err) {
      // ignore
    }
  }

  exportToText(filePath, filter = null) {
    const traces = this.getTraces(filter);
    const lines = [];

    lines.push('# APDU Trace Export');
    lines.push('# Generated: ' + new Date().toISOString());
    lines.push('# Total traces: ' + traces.length);
    lines.push('');
    lines.push('--------------------------------------------------------------------------------');
    lines.push('');

    for (const trace of traces) {
      const time = new Date(trace.timestamp).toISOString();
      const dir = trace.direction === 'incoming' ? '>>>' : '<<<';
      const slotInfo = trace.slotId !== null && trace.slotId !== undefined ? `[Slot ${trace.slotId}]` : '';

      lines.push(`# ${time} ${dir} ${trace.reader} ${slotInfo}`);
      lines.push(`# Source: ${trace.source}`);
      lines.push(`CMD: ${trace.apdu}`);

      if (trace.selectMatch && trace.selectMatch.matchedApplications) {
        const apps = trace.selectMatch.matchedApplications.map((a) => a.name).join(', ');
        lines.push(`# Matched: ${apps}`);
      }

      if (trace.response) {
        lines.push(`RSP: ${trace.response}`);
      }
      if (trace.sw) {
        lines.push(`SW:  ${trace.sw}`);
      }
      if (trace.error) {
        lines.push(`ERR: ${trace.error}`);
      }
      lines.push('');
    }

    fs.writeFileSync(filePath, lines.join('\n'));
    return { path: filePath, count: traces.length };
  }

  exportToJson(filePath, filter = null) {
    const traces = this.getTraces(filter);
    const data = {
      exportTime: new Date().toISOString(),
      totalTraces: traces.length,
      filter,
      traces,
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return { path: filePath, count: traces.length };
  }

  exportToHex(filePath, filter = null) {
    const traces = this.getTraces(filter);
    const lines = [];

    for (const trace of traces) {
      const prefix = trace.direction === 'incoming' ? '< ' : '> ';
      lines.push(prefix + trace.apdu);
      if (trace.response) {
        lines.push(prefix + trace.response + trace.sw);
      }
    }

    fs.writeFileSync(filePath, lines.join('\n'));
    return { path: filePath, count: traces.length };
  }

  exportToPcap(filePath, filter = null) {
    const traces = this.getTraces(filter);
    const buf = this._buildPcap(traces);
    fs.writeFileSync(filePath, buf);
    return { path: filePath, count: traces.length };
  }

  _buildPcap(traces) {
    const LINKTYPE_USB = 220;
    const USBPCAP_BUFFER_CONTROL = 0x04;

    const header = Buffer.alloc(24);
    header.writeUInt32LE(0xa1b2c3d4, 0);
    header.writeUInt16LE(2, 4);
    header.writeUInt16LE(4, 6);
    header.writeUInt32LE(0, 8);
    header.writeUInt32LE(0, 12);
    header.writeUInt32LE(65535, 16);
    header.writeUInt32LE(LINKTYPE_USB, 20);

    const packets = [];
    let tsOffset = 0;

    for (const trace of traces) {
      const tsSec = Math.floor((trace.timestamp - tsOffset) / 1000);
      const tsUsec = (trace.timestamp - tsOffset) % 1000 * 1000;

      const apduBuf = this._buildUsbPacket(trace);

      const packetHeader = Buffer.alloc(16);
      packetHeader.writeUInt32LE(tsSec, 0);
      packetHeader.writeUInt32LE(tsUsec, 4);
      packetHeader.writeUInt32LE(apduBuf.length, 8);
      packetHeader.writeUInt32LE(apduBuf.length, 12);

      packets.push(packetHeader, apduBuf);
    }

    return Buffer.concat([header, ...packets]);
  }

  _buildUsbPacket(trace) {
    const isIn = trace.direction === 'incoming';
    const data = isIn
      ? Buffer.from((trace.response || '') + (trace.sw || ''), 'hex')
      : Buffer.from(trace.apdu, 'hex');

    const header = Buffer.alloc(40);
    header.writeUInt8(USBPCAP_BUFFER_CONTROL, 0);
    header.writeUInt8(isIn ? 0x80 : 0x00, 2);
    header.writeUInt8(0x06, 3);
    header.writeUInt16LE(0x00A0, 4);
    header.writeUInt16LE(0x0000, 6);
    header.writeUInt16LE(data.length, 8);
    header.writeUInt8(0x00, 14);
    header.writeUInt8(0x01, 15);
    header.writeUInt32LE(0, 16);
    header.writeUInt32LE(data.length, 20);

    return Buffer.concat([header, data]);
  }

  export(filePath, format = TRACE_FORMATS.TEXT, filter = null) {
    switch (format) {
      case TRACE_FORMATS.JSON:
        return this.exportToJson(filePath, filter);
      case TRACE_FORMATS.PCAP:
        return this.exportToPcap(filePath, filter);
      case TRACE_FORMATS.HEX:
        return this.exportToHex(filePath, filter);
      case TRACE_FORMATS.TEXT:
      default:
        return this.exportToText(filePath, filter);
    }
  }

  static getFormats() {
    return Object.values(TRACE_FORMATS);
  }
}

module.exports = { ApduTracer, TRACE_FORMATS };
