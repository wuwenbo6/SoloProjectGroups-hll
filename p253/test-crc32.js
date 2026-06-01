function crc32Test() {
  const CRC32_TABLE: number[] = (() => {
    const table: number[] = [];
    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      }
      table[i] = crc >>> 0;
    }
    return table;
  })();

  function crc32(buffer: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const testString = "123456789";
  const buffer = new TextEncoder().encode(testString);
  const result = crc32(buffer);
  
  console.log(`CRC32 of "${testString}": 0x${result.toString(16).padStart(8, "0")}`);
  console.log(`Expected: 0xcbf43926`);
  console.log(`Match: ${result === 0xcbf43926 ? "YES" : "NO"}`);
}

crc32Test();
