const IBEACON_MANUFACTURER_ID = 0x004c;
const IBEACON_TYPE = 0x02;
const IBEACON_DATA_LENGTH = 0x15;

function parseIBeacon(manufacturerData) {
  if (manufacturerData.length < 23) return null;

  const manufacturerId = manufacturerData.readUInt16LE(0);
  if (manufacturerId !== IBEACON_MANUFACTURER_ID) return null;

  const beaconType = manufacturerData.readUInt8(2);
  if (beaconType !== IBEACON_TYPE) return null;

  const dataLength = manufacturerData.readUInt8(3);
  if (dataLength !== IBEACON_DATA_LENGTH) return null;

  const uuid = [
    manufacturerData.readUInt32BE(4).toString(16).padStart(8, '0'),
    manufacturerData.readUInt16BE(8).toString(16).padStart(4, '0'),
    manufacturerData.readUInt16BE(10).toString(16).padStart(4, '0'),
    manufacturerData.readUInt16BE(12).toString(16).padStart(4, '0'),
    Array.from(manufacturerData.slice(14, 20))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  ].join('-');

  const major = manufacturerData.readUInt16BE(20);
  const minor = manufacturerData.readUInt16BE(22);
  const txPower = manufacturerData.readInt8(24);

  return {
    type: 'ibeacon',
    uuid,
    major,
    minor,
    txPower
  };
}

module.exports = { parseIBeacon };
