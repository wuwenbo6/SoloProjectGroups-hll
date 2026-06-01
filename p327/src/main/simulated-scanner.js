const { rssiToDistance } = require('./utils/trilateration');
const TimeSeriesRecorder = require('./utils/time-series');

const DEDUPLICATION_WINDOW_MS = 10000;

const IBEACON_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SIMULATED_BEACONS = [
  {
    id: 'sim-ibeacon-1',
    address: 'AA:BB:CC:DD:EE:01',
    rssi: -42,
    localName: 'Sim iBeacon 1',
    beacons: [
      { type: 'ibeacon', uuid: IBEACON_UUID, major: 1, minor: 100, txPower: -59 }
    ]
  },
  {
    id: 'sim-ibeacon-2',
    address: 'AA:BB:CC:DD:EE:02',
    rssi: -65,
    localName: 'Sim iBeacon 2',
    beacons: [
      { type: 'ibeacon', uuid: IBEACON_UUID, major: 2, minor: 200, txPower: -59 }
    ]
  },
  {
    id: 'sim-eddystone-url',
    address: 'AA:BB:CC:DD:EE:03',
    rssi: -55,
    localName: 'Sim Eddystone URL',
    beacons: [
      { type: 'eddystone-url', url: 'https://www.example.com', txPower: -59 }
    ]
  },
  {
    id: 'sim-eddystone-tlm',
    address: 'AA:BB:CC:DD:EE:04',
    rssi: -73,
    localName: 'Sim Eddystone TLM',
    beacons: [
      { type: 'eddystone-tlm', version: 0, batteryVoltage: 3.1, temperature: 22.5, advCount: 123456, secSinceBoot: 86400 }
    ]
  },
  {
    id: 'sim-eddystone-uid',
    address: 'AA:BB:CC:DD:EE:05',
    rssi: -58,
    localName: 'Sim Eddystone UID',
    beacons: [
      { type: 'eddystone-uid', namespace: 'a1b2c3d4e5f6', instance: '010203040506', txPower: -59 }
    ]
  }
];

class SimulatedBleScanner {
  constructor() {
    this.scanning = false;
    this.interval = null;
    this.onUpdate = null;
    this.beacons = new Map();
    this.lastUpdateTimestamps = new Map();
    this.timeSeries = new TimeSeriesRecorder();
  }

  get isAvailable() {
    return true;
  }

  async init() {
    return true;
  }

  startScanning(callback) {
    this.onUpdate = callback;
    this.scanning = true;
    this.lastUpdateTimestamps.clear();
    this.timeSeries.clear();

    for (const b of SIMULATED_BEACONS) {
      const uniqueKey = `${b.address}-${b.beacons.map(bb => bb.type).join(',')}`;
      const txPower = b.beacons[0]?.txPower || -59;
      const distance = rssiToDistance(b.rssi, txPower);
      const enhanced = { ...b, uniqueKey, distance, timestamp: Date.now() };
      this.beacons.set(uniqueKey, enhanced);
      this.timeSeries.record(enhanced);
    }

    this.onUpdate(Array.from(this.beacons.values()));

    this.interval = setInterval(() => {
      const now = Date.now();
      let shouldNotify = false;

      for (const [uniqueKey, beacon] of this.beacons) {
        const lastUpdate = this.lastUpdateTimestamps.get(uniqueKey) || 0;
        if (now - lastUpdate >= DEDUPLICATION_WINDOW_MS) {
          const rssiDelta = Math.floor(Math.random() * 7) - 3;
          const newRssi = Math.max(-100, Math.min(-20, beacon.rssi + rssiDelta));
          const txPower = beacon.beacons[0]?.txPower || -59;
          const newDistance = rssiToDistance(newRssi, txPower);
          const enhanced = { ...beacon, rssi: newRssi, distance: newDistance, timestamp: now };
          this.beacons.set(uniqueKey, enhanced);
          this.timeSeries.record(enhanced);
          this.lastUpdateTimestamps.set(uniqueKey, now);
          shouldNotify = true;
        }
      }

      if (shouldNotify && this.onUpdate) {
        this.onUpdate(Array.from(this.beacons.values()));
      }
    }, 1000);
  }

  stopScanning() {
    this.scanning = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  clearDevices() {
    this.beacons.clear();
    this.lastUpdateTimestamps.clear();
    this.timeSeries.clear();
    if (this.onUpdate) {
      this.onUpdate([]);
    }
  }

  getDevices() {
    return Array.from(this.beacons.values());
  }

  exportTimeSeries() {
    return this.timeSeries.export();
  }
}

module.exports = SimulatedBleScanner;
