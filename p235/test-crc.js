const CRC16 = {
  calculate(buffer, polynomial = 0x1021, initial = 0x0000) {
    let crc = initial;
    for (let i = 0; i < buffer.length; i++) {
      crc ^= buffer[i] << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ polynomial;
        } else {
          crc <<= 1;
        }
        crc &= 0xFFFF;
      }
    }
    return crc;
  },

  check(buffer) {
    if (buffer.length < 2) return false;
    const data = buffer.slice(0, -2);
    const expectedCRC = buffer[buffer.length - 2] | (buffer[buffer.length - 1] << 8);
    const calculatedCRC = this.calculate(data);
    return expectedCRC === calculatedCRC;
  }
};

function testCRC() {
  console.log('Testing CRC16/CCITT implementation...');
  
  const testData1 = Buffer.from([0x76]);
  const crc1 = CRC16.calculate(testData1);
  console.log(`Test 1 - Command 0x76 (READ_VERSION): CRC = 0x${crc1.toString(16).toUpperCase().padStart(4, '0')}`);
  
  const packet1 = Buffer.from([0x76, crc1 & 0xFF, (crc1 >> 8) & 0xFF]);
  console.log(`Test 1 - CRC check: ${CRC16.check(packet1) ? 'PASS' : 'FAIL'}`);
  
  const testData2 = Buffer.from([0x44, 0x00, 0x00, 0x03, 0x09, 0x01, 0x09]);
  const crc2 = CRC16.calculate(testData2);
  console.log(`Test 2 - Script download: CRC = 0x${crc2.toString(16).toUpperCase().padStart(4, '0')}`);
  
  const packet2 = Buffer.concat([testData2, Buffer.from([crc2 & 0xFF, (crc2 >> 8) & 0xFF])]);
  console.log(`Test 2 - CRC check: ${CRC16.check(packet2) ? 'PASS' : 'FAIL'}`);
  
  const corruptedPacket = Buffer.from([0x76, 0x00, 0x00]);
  console.log(`Test 3 - Corrupted data check: ${CRC16.check(corruptedPacket) ? 'FAIL (should fail)' : 'PASS (correctly detected corruption)'}`);
  
  console.log('\nAll CRC tests completed!');
}

testCRC();
