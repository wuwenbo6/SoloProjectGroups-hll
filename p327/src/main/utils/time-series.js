class TimeSeriesRecorder {
  constructor() {
    this.series = new Map();
    this.startTime = Date.now();
  }

  record(device) {
    const { uniqueKey, id, address, rssi, beacons, timestamp } = device;
    const key = uniqueKey || id || address;

    if (!this.series.has(key)) {
      this.series.set(key, {
        key,
        address,
        beacons: beacons.map(b => ({ type: b.type, ...(b.uuid ? { uuid: b.uuid } : {}), ...(b.url ? { url: b.url } : {}), ...(b.namespace ? { namespace: b.namespace, instance: b.instance } : {}) })),
        firstSeen: timestamp,
        lastSeen: timestamp,
        samples: []
      });
    }

    const entry = this.series.get(key);
    entry.lastSeen = timestamp;
    entry.samples.push({
      timestamp,
      rssi,
      distance: device.distance || null
    });

    return entry;
  }

  getSeries(key) {
    return this.series.get(key);
  }

  getAllSeries() {
    return Array.from(this.series.values());
  }

  clear() {
    this.series.clear();
    this.startTime = Date.now();
  }

  export() {
    return {
      exportTime: Date.now(),
      sessionStartTime: this.startTime,
      duration: Date.now() - this.startTime,
      beacons: Array.from(this.series.values()).map(s => ({
        key: s.key,
        address: s.address,
        beacons: s.beacons,
        firstSeen: s.firstSeen,
        lastSeen: s.lastSeen,
        totalSamples: s.samples.length,
        avgRssi: s.samples.reduce((sum, s) => sum + s.rssi, 0) / s.samples.length,
        minRssi: Math.min(...s.samples.map(s => s.rssi)),
        maxRssi: Math.max(...s.samples.map(s => s.rssi)),
        samples: s.samples
      }))
    };
  }
}

module.exports = TimeSeriesRecorder;
