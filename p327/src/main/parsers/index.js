const { parseIBeacon } = require('./ibeacon');
const { parseEddystone, EDDYSTONE_UUID } = require('./eddystone');

function parseAdvertisement(peripheral) {
  const { advertisement, id, rssi } = peripheral;
  const result = {
    id,
    address: peripheral.address || 'unknown',
    rssi,
    localName: advertisement.localName || null,
    timestamp: Date.now(),
    beacons: []
  };

  if (advertisement.manufacturerData) {
    const iBeacon = parseIBeacon(advertisement.manufacturerData);
    if (iBeacon) {
      result.beacons.push(iBeacon);
    }
  }

  if (advertisement.serviceData && advertisement.serviceData.length > 0) {
    for (const sd of advertisement.serviceData) {
      const serviceUuid = sd.uuid.toLowerCase().replace(/-/g, '');
      if (serviceUuid === EDDYSTONE_UUID) {
        const eddystoneBuf = Buffer.concat([
          Buffer.from([0x03, sd.data.length + 1]),
          Buffer.from(serviceUuid, 'hex'),
          sd.data
        ]);
        const eddystone = parseEddystone(eddystoneBuf);
        if (eddystone) {
          result.beacons.push(eddystone);
        }
      }
    }
  }

  return result;
}

module.exports = { parseAdvertisement };
