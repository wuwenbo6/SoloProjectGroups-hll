const { EventEmitter } = require('events');
const { PcscManager } = require('./pcsc');
const { AtrParser } = require('./atr-parser');
const { ApplicationRegistry } = require('./application-registry');
const { SlotManager } = require('./slot-manager');
const { ApduTracer } = require('./apdu-tracer');

class SmartCardManager extends EventEmitter {
  constructor() {
    super();
    this.pcsc = new PcscManager();
    this.appRegistry = ApplicationRegistry.getInstance();
    this.slotManager = new SlotManager();
    this.tracer = new ApduTracer();
    this.readers = new Map();
    this.monitoring = false;
    this._monitorCallback = null;

    this.tracer.start();
  }

  async startMonitoring(callback) {
    if (this.monitoring) return;
    this.monitoring = true;
    this._monitorCallback = callback;

    try {
      await this.pcsc.establishContext();

      const readers = await this.pcsc.listReaders();
      for (const name of readers) {
        this.readers.set(name, {
          name,
          connected: false,
          atr: null,
          atrParsed: null,
          selectedApp: null,
        });
        if (callback) {
          callback({ type: 'reader-added', reader: name });
        }
      }

      this.pcsc.on('reader-event', (event) => {
        this._handleReaderEvent(event);
      });

      this.pcsc.startStatusChange();
    } catch (err) {
      this.emit('error', err);
    }
  }

  stopMonitoring() {
    this.monitoring = false;
    this._monitorCallback = null;
    this.pcsc.stopStatusChange();
  }

  stop() {
    this.stopMonitoring();
    for (const [name] of this.readers) {
      if (this.readers.get(name).connected) {
        this.pcsc.disconnect(name).catch(() => {});
      }
    }
    this.pcsc.releaseContext().catch(() => {});
  }

  getReaders() {
    return Array.from(this.readers.values()).map((r) => ({
      name: r.name,
      connected: r.connected,
      atr: r.atr,
      atrParsed: r.atrParsed,
      selectedApp: r.selectedApp,
    }));
  }

  getDefaultReader() {
    for (const [, reader] of this.readers) {
      return reader.name;
    }
    return null;
  }

  async connectReader(readerName) {
    const readerInfo = this.readers.get(readerName);
    if (!readerInfo) {
      throw new Error(`Reader not found: ${readerName}`);
    }
    if (readerInfo.connected) {
      return { atr: readerInfo.atr, atrParsed: readerInfo.atrParsed };
    }

    const result = await this.pcsc.connect(readerName);
    readerInfo.connected = true;
    readerInfo.atr = result.atr;

    if (result.atr) {
      try {
        readerInfo.atrParsed = AtrParser.parse(result.atr);
      } catch (_e) {
          readerInfo.atrParsed = null;
        }
    }

    return {
      atr: result.atr,
      atrParsed: readerInfo.atrParsed,
    };
  }

  async coldReset(readerName) {
    const readerInfo = this.readers.get(readerName);
    if (!readerInfo) {
      throw new Error(`Reader not found: ${readerName}`);
    }
    if (!readerInfo.connected) {
      throw new Error(`Reader not connected: ${readerName}`);
    }

    const result = await this.pcsc.connect(readerName);
    readerInfo.atr = result.atr;
    readerInfo.protocol = result.protocol;

    if (result.atr) {
      try {
        readerInfo.atrParsed = AtrParser.parse(result.atr);
      } catch (_e) {
        readerInfo.atrParsed = null;
      }
    }

    readerInfo.selectedApp = null;

    return {
      atr: result.atr,
      atrParsed: readerInfo.atrParsed,
      reset: true,
    };
  }

  async disconnectReader(readerName) {
    const readerInfo = this.readers.get(readerName);
    if (!readerInfo) {
      throw new Error(`Reader not found: ${readerName}`);
    }
    if (!readerInfo.connected) {
      return;
    }

    await this.pcsc.disconnect(readerName);
    readerInfo.connected = false;
    readerInfo.atr = null;
  }

  async transmit(readerName, apduHex, options = {}) {
    const readerInfo = this.readers.get(readerName);
    if (!readerInfo) {
      throw new Error(`Reader not found: ${readerName}`);
    }
    if (!readerInfo.connected) {
      throw new Error(`Reader not connected: ${readerName}`);
    }

    const apduBuf = Buffer.from(apduHex, 'hex');
    let selectMatch = null;

    if (apduBuf.length >= 2 && apduBuf[1] === 0xA4) {
      try {
        selectMatch = this.appRegistry.matchSelectCommand(apduHex);
        if (selectMatch && selectMatch.matchedApplications && selectMatch.matchedApplications.length > 0) {
          readerInfo.selectedApp = selectMatch.matchedApplications[0];
        } else if (selectMatch && selectMatch.matchType === 'df_name') {
          readerInfo.selectedApp = {
            name: `DF: ${selectMatch.dfName || selectMatch.dataHex}`,
            dfName: selectMatch.dfName,
            aid: selectMatch.dataHex,
            matchType: 'manual',
          };
        } else if (selectMatch && selectMatch.matchType === 'aid') {
          readerInfo.selectedApp = {
            name: `AID: ${selectMatch.aid}`,
            aid: selectMatch.aid,
            matchType: 'manual',
          };
        }

        if (selectMatch && !selectMatch.error) {
          this.emit('select-match', {
            reader: readerName,
            match: selectMatch,
          });
        }
      } catch (_e) {
        // ignore match errors
      }
    }

    const result = await this.pcsc.transmit(readerName, apduBuf);

    const slotId = this.slotManager.getSlotForReader(readerName);
    this.tracer.addTrace({
      timestamp: Date.now(),
      direction: options.direction || 'outgoing',
      reader: readerName,
      slotId,
      apdu: apduHex,
      response: result.data.toString('hex'),
      sw: result.sw.toString('hex'),
      source: options.source || 'local',
      selectMatch,
    });

    return {
      data: result.data.toString('hex'),
      sw: result.sw.toString('hex'),
      selectMatch,
    };
  }

  transmitFromSpice(readerName, apduHex, slotId) {
    return this.transmit(readerName, apduHex, {
      direction: 'incoming',
      source: 'spice-vm',
      slotId,
    });
  }

  matchSelectCommand(apduHex) {
    return this.appRegistry.matchSelectCommand(apduHex);
  }

  parseAtr(atrHex) {
    return AtrParser.parse(atrHex);
  }

  getSelectedApp(readerName) {
    const readerInfo = this.readers.get(readerName);
    return readerInfo ? readerInfo.selectedApp : null;
  }

  addApplication(app) {
    this.appRegistry.addApplication(app);
  }

  getApplicationRegistry() {
    return this.appRegistry.getAllApplications();
  }

  getSlots() {
    return this.slotManager.getAllSlots();
  }

  assignReaderToSlot(slotId, readerName) {
    this.slotManager.assignReaderToSlot(slotId, readerName);
    const readerInfo = this.readers.get(readerName);
    if (readerInfo) {
      this.slotManager.setSlotStatus(slotId, {
        connected: readerInfo.connected,
        atr: readerInfo.atr,
      });
    }
    return { success: true };
  }

  unassignSlot(slotId) {
    return this.slotManager.unassignSlot(slotId);
  }

  getSlotForReader(readerName) {
    return this.slotManager.getSlotForReader(readerName);
  }

  getReaderForSlot(slotId) {
    return this.slotManager.getReaderForSlot(slotId);
  }

  swapSlots(slotId1, slotId2) {
    return this.slotManager.swapSlots(slotId1, slotId2);
  }

  autoAssignReader(readerName, preferSlotId = null) {
    return this.slotManager.autoAssignReader(readerName, preferSlotId);
  }

  addSlot(slotId) {
    this.slotManager.addSlot(slotId);
  }

  removeSlot(slotId) {
    this.slotManager.removeSlot(slotId);
  }

  setMaxSlots(count) {
    this.slotManager.setMaxSlots(count);
  }

  getTraces(filter = null) {
    return this.tracer.getTraces(filter);
  }

  getTraceCount() {
    return this.tracer.getTraceCount();
  }

  clearTraces() {
    this.tracer.clear();
  }

  exportTraces(filePath, format = 'text', filter = null) {
    return this.tracer.export(filePath, format, filter);
  }

  getTraceFormats() {
    return ApduTracer.getFormats();
  }

  enableTraceAutoSave(filePath) {
    this.tracer.enableAutoSave(filePath);
  }

  disableTraceAutoSave() {
    this.tracer.disableAutoSave();
  }

  _handleReaderEvent(event) {
    if (event.type === 'reader-added') {
      this.readers.set(event.reader, {
        name: event.reader,
        connected: false,
        atr: null,
        atrParsed: null,
        selectedApp: null,
      });
    } else if (event.type === 'reader-removed') {
      const info = this.readers.get(event.reader);
      if (info && info.connected) {
        this.pcsc.disconnect(event.reader).catch(() => {});
      }
      this.readers.delete(event.reader);
    } else if (event.type === 'card-inserted') {
      if (this._monitorCallback) {
        this._monitorCallback({
          type: 'card-inserted',
          reader: event.reader,
        });
      }
    } else if (event.type === 'card-removed') {
      const info = this.readers.get(event.reader);
      if (info) {
        info.connected = false;
        info.atr = null;
        info.atrParsed = null;
        info.selectedApp = null;
      }
      if (this._monitorCallback) {
        this._monitorCallback({
          type: 'card-removed',
          reader: event.reader,
        });
      }
    }

    if (this._monitorCallback) {
      this._monitorCallback(event);
    }
  }
}

module.exports = { SmartCardManager };
