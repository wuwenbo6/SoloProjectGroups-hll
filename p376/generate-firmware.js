const fs = require('fs');
const path = require('path');

const firmwareSize = 4096;
const firmwarePath = path.join(__dirname, 'firmware.ota');

const buffer = Buffer.alloc(firmwareSize);

for (let i = 0; i < firmwareSize; i++) {
  buffer[i] = i % 256;
}

buffer.writeUInt32LE(0x02000000, 0);
buffer.writeUInt16LE(0x1001, 4);
buffer.writeUInt16LE(0x0001, 6);
buffer.write('v2.0.0', 8, 6, 'ascii');

fs.writeFileSync(firmwarePath, buffer);
console.log(`Firmware file created: ${firmwarePath} (${firmwareSize} bytes)`);
