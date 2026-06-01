const EDDYSTONE_UUID = 'feaa';

const EDDYSTONE_UID = 0x00;
const EDDYSTONE_URL = 0x10;
const EDDYSTONE_TLM = 0x20;

const URL_SCHEMES = ['http://www.', 'https://www.', 'http://', 'https://'];
const URL_EXPANSIONS = ['.com/', '.org/', '.edu/', '.net/', '.info/', '.biz/', '.gov/', '.com', '.org', '.edu', '.net', '.info', '.biz', '.gov'];

function parseEddystone(serviceData) {
  const serviceUuid = serviceData.readUInt16LE(0).toString(16).padStart(4, '0');
  if (serviceUuid !== EDDYSTONE_UUID) return null;

  if (serviceData.length < 3) return null;

  const frameType = serviceData.readUInt8(2);

  switch (frameType) {
    case EDDYSTONE_URL:
      return parseUrlFrame(serviceData);
    case EDDYSTONE_TLM:
      return parseTlmFrame(serviceData);
    case EDDYSTONE_UID:
      return parseUidFrame(serviceData);
    default:
      return null;
  }
}

function parseUrlFrame(data) {
  if (data.length < 6) return null;

  const txPower = data.readInt8(3);
  const urlScheme = data.readUInt8(4);

  let url = URL_SCHEMES[urlScheme] || '';

  for (let i = 5; i < data.length; i++) {
    const byte = data.readUInt8(i);
    if (byte < URL_EXPANSIONS.length) {
      url += URL_EXPANSIONS[byte];
    } else {
      url += String.fromCharCode(byte);
    }
  }

  return {
    type: 'eddystone-url',
    url,
    txPower
  };
}

function parseTlmFrame(data) {
  if (data.length < 11) return null;

  const version = data.readUInt8(3);
  const batteryVoltageMv = data.readUInt16BE(4);
  const batteryVoltage = Math.round(batteryVoltageMv / 10) / 100;
  const temperature = data.readInt16BE(6) / 256;
  const advCount = data.readUInt32BE(8);

  let secSinceBoot = null;
  if (data.length >= 15) {
    secSinceBoot = data.readUInt32BE(12);
  }

  return {
    type: 'eddystone-tlm',
    version,
    batteryVoltage,
    temperature: Math.round(temperature * 100) / 100,
    advCount,
    secSinceBoot
  };
}

function parseUidFrame(data) {
  if (data.length < 18) return null;

  const txPower = data.readInt8(3);
  const namespace = data.slice(4, 10).toString('hex');
  const instance = data.slice(10, 16).toString('hex');

  return {
    type: 'eddystone-uid',
    namespace,
    instance,
    txPower
  };
}

module.exports = { parseEddystone, EDDYSTONE_UUID };
