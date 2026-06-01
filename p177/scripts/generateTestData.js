const fs = require('fs');
const path = require('path');

function generateTestHEVCFile(outputPath, numFrames = 10) {
  const buffers = [];

  const vpsNal = createNALUnit(32, generateVPSRBSP());
  buffers.push(vpsNal);

  const spsNal = createNALUnit(33, generateSPSRBSP());
  buffers.push(spsNal);

  const ppsNal = createNALUnit(34, generatePPSRBSP());
  buffers.push(ppsNal);

  for (let i = 0; i < numFrames; i++) {
    if (i % 5 === 0) {
      const seiNal = createSEINALUnit(`TIMESTAMP:${Date.now()}_${i}`);
      buffers.push(seiNal);
    }

    const nalType = i === 0 ? 19 : 1;
    const sliceNal = createNALUnit(nalType, generateSliceRBSP(i));
    buffers.push(sliceNal);
  }

  const finalBuffer = Buffer.concat(buffers);
  fs.writeFileSync(outputPath, finalBuffer);

  console.log(`测试HEVC文件已生成: ${outputPath}`);
  console.log(`文件大小: ${finalBuffer.length} 字节`);
  console.log(`NAL单元数量: ${buffers.length}`);

  return outputPath;
}

function createNALUnit(nalType, rbsp) {
  const header = Buffer.alloc(2);
  const forbiddenZeroBit = 0;
  const nuhLayerId = 0;
  const nuhTemporalIdPlus1 = 1;

  const headerValue = (forbiddenZeroBit << 15) |
                      (nalType << 9) |
                      (nuhLayerId << 3) |
                      (nuhTemporalIdPlus1 & 0x07);

  header.writeUInt16BE(headerValue, 0);

  const ebsp = [];
  let zeroCount = 0;

  for (let i = 0; i < rbsp.length; i++) {
    const byte = rbsp[i];
    if (zeroCount === 2 && byte <= 0x03) {
      ebsp.push(0x03);
      zeroCount = 0;
    }
    ebsp.push(byte);
    if (byte === 0x00) {
      zeroCount++;
    } else {
      zeroCount = 0;
    }
  }

  const ebspBuffer = Buffer.from(ebsp);
  const startCode = Buffer.from([0x00, 0x00, 0x00, 0x01]);

  return Buffer.concat([startCode, header, ebspBuffer]);
}

function createSEINALUnit(userData) {
  const userDataBytes = Buffer.from(userData, 'utf8');

  const payloadType = 5;
  const payloadSize = userDataBytes.length;

  const payloadTypeBytes = [];
  let remainingType = payloadType;
  while (remainingType >= 255) {
    payloadTypeBytes.push(0xff);
    remainingType -= 255;
  }
  payloadTypeBytes.push(remainingType);

  const payloadSizeBytes = [];
  let remainingSize = payloadSize;
  while (remainingSize >= 255) {
    payloadSizeBytes.push(0xff);
    remainingSize -= 255;
  }
  payloadSizeBytes.push(remainingSize);

  const seiPayload = Buffer.concat([
    Buffer.from(payloadTypeBytes),
    Buffer.from(payloadSizeBytes),
    userDataBytes
  ]);

  const rbsp = Buffer.concat([
    seiPayload,
    Buffer.from([0x80])
  ]);

  return createNALUnit(39, rbsp);
}

function generateVPSRBSP() {
  return Buffer.from([0x00, 0x00, 0x03, 0x00, 0x00, 0x03, 0x00, 0x3b, 0x20, 0x00, 0x00, 0x03, 0x00, 0x00, 0x03, 0x00, 0x00, 0x7b, 0x18, 0xb0, 0x24, 0x80]);
}

function generateSPSRBSP() {
  return Buffer.from([0x42, 0x01, 0x01, 0x00, 0x00, 0x03, 0x00, 0x00, 0x03, 0x00, 0x3b, 0xa0, 0x03, 0xc0, 0x80, 0x11, 0x07, 0xcb, 0x90, 0x88, 0x84, 0x2b, 0x20, 0x00, 0x00, 0x03, 0x00, 0x20, 0x00, 0x00, 0x06, 0x41, 0xe2, 0x45, 0x56, 0x24]);
}

function generatePPSRBSP() {
  return Buffer.from([0x44, 0x01, 0xc0, 0xf7, 0xbc, 0x20, 0x00, 0x00, 0x03, 0x00, 0x80, 0x00, 0x00, 0x13, 0x88]);
}

function generateSliceRBSP(frameNum) {
  const data = Buffer.alloc(50);
  data[0] = 0x00;
  data[1] = 0x00;
  for (let i = 2; i < data.length - 1; i++) {
    data[i] = Math.floor(Math.random() * 256);
  }
  data[data.length - 1] = 0x80;
  return data;
}

if (require.main === module) {
  const outputDir = path.join(__dirname, '..', 'test_data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'test_sample.h265');
  generateTestHEVCFile(outputPath, 15);

  console.log('\n你可以在应用中打开这个文件进行测试。');
}

module.exports = {
  generateTestHEVCFile,
  createNALUnit,
  createSEINALUnit
};
