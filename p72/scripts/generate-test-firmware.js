const fs = require('fs');
const path = require('path');

const size = process.argv[2] ? parseInt(process.argv[2]) : 5 * 1024;
const outputPath = process.argv[3] || path.join(__dirname, '../firmware/test_firmware.bin');

console.log(`生成测试固件，大小: ${size} 字节`);

const firmware = Buffer.alloc(size);
for (let i = 0; i < size; i++) {
  firmware[i] = Math.floor(Math.random() * 256);
}

const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(outputPath, firmware);
console.log(`测试固件已生成: ${outputPath}`);
console.log(`大小: ${firmware.length} bytes`);
