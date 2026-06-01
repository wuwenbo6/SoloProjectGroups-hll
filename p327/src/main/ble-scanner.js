const { parseAdvertisement } = require('../parsers');
const { rssiToDistance } = require('../utils/trilateration');
const TimeSeriesRecorder = require('../utils/time-series');

const DEDUPLICATION_WINDOW_MS = 10000;

class BleScanner {
  constructor() {
    this.noble = null;
    this.scanning = false;
    this.peripherals = new Map();
    this.lastUpdateTimestamps = new Map();
    this.timeSeries = new TimeSeriesRecorder();
    this.onUpdate = null;
    this._nobleAvailable = false;
  }

  async init() {
    try {
      this.noble = require('@abandonware/noble');
      this._nobleAvailable = true;

      this.noble.on('stateChange', (state) => {
        if (state === 'poweredOn' && this.scanning) {
          this.noble.startScanning([], true);
        }
      });

      this.noble.on('discover', (peripheral) => {
        const parsed = parseAdvertisement(peripheral);
        if (parsed.beacons.length > 0) {
          const uniqueKey = `${parsed.address}-${parsed.beacons.map(b => b.type).join(',')}`;
          const now = Date.now();
          const lastUpdate = this.lastUpdateTimestamps.get(uniqueKey) || 0;

          const txPower = parsed.beacons[0]?.txPower || -59;
          const distance = rssiToDistance(parsed.rssi, txPower);
          const enhanced = { ...parsed, uniqueKey, distance };

          this.peripherals.set(uniqueKey, enhanced);
          this.timeSeries.record(enhanced);

          if (now - lastUpdate >= DEDUPLICATION_WINDOW_MS) {
            this.lastUpdateTimestamps.set(uniqueKey, now);
            if (this.onUpdate) {
              this.onUpdate(Array.from(this.peripherals.values()));
            }
          }
        }
      });

      return true;
    } catch (err) {
      console.warn('Noble BLE not available:', err.message);
      this._nobleAvailable = false;
      return false;
    }
  }

  get isAvailable() {
    return this._nobleAvailable;
  }

  startScanning(callback) {
    this.onUpdate = callback;
    this.scanning = true;
    this.lastUpdateTimestamps.clear();
    this.timeSeries.clear();

    if (this._nobleAvailable && this.noble.state === 'poweredOn') {
      this.noble.startScanning([], true);
    }
  }

  stopScanning() {
    this.scanning = false;
    if (this._nobleAvailable && this.noble.state === 'poweredOn') {
      this.noble.stopScanning();
    }
  }

  clearDevices() {
    this.peripherals.clear();
    this.lastUpdateTimestamps.clear();
    this.timeSeries.clear();
    if (this.onUpdate) {
      this.onUpdate([]);
    }
  }

  getDevices() {
    return Array.from(this.peripherals.values());
  }

  exportTimeSeries() {
    return this.timeSeries.export();
  }
}

module.exports = BleScanner;
