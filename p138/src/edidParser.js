const EDID_HEADER = [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00];

function parseEDID(edidData) {
  if (typeof edidData === 'string') {
    edidData = hexToBytes(edidData);
  }

  if (!validateEDID(edidData)) {
    return { valid: false, error: '无效的EDID数据' };
  }

  const result = {
    valid: true,
    manufacturerId: parseManufacturerId(edidData.slice(8, 10)),
    productId: edidData.readUInt16LE(10),
    serialNumber: edidData.readUInt32LE(12),
    manufactureWeek: edidData[16],
    manufactureYear: edidData[17] + 1990,
    edidVersion: `${edidData[18]}.${edidData[19]}`,
    displayParameters: parseDisplayParameters(edidData.slice(20, 25)),
    chromaticity: parseChromaticity(edidData.slice(25, 35)),
    establishedTimings: parseEstablishedTimings(edidData.slice(35, 38)),
    standardTimings: parseStandardTimings(edidData.slice(38, 56)),
    detailedTimings: parseDetailedTimings(edidData.slice(54, 126)),
    extensions: edidData[126],
    checksum: edidData[127]
  };

  result.displayName = findDisplayName(edidData);
  result.preferredTiming = result.detailedTimings.find(t => t.isPreferred) || result.detailedTimings[0];

  return result;
}

function validateEDID(data) {
  if (!data || data.length < 128) return false;
  
  for (let i = 0; i < 8; i++) {
    if (data[i] !== EDID_HEADER[i]) return false;
  }

  let checksum = 0;
  for (let i = 0; i < 128; i++) {
    checksum = (checksum + data[i]) & 0xFF;
  }
  return checksum === 0;
}

function parseManufacturerId(bytes) {
  const id = (bytes[0] << 8) | bytes[1];
  const char1 = ((id >> 10) & 0x1F) + 0x40;
  const char2 = ((id >> 5) & 0x1F) + 0x40;
  const char3 = (id & 0x1F) + 0x40;
  return String.fromCharCode(char1, char2, char3);
}

function parseDisplayParameters(bytes) {
  const videoInputDefinition = bytes[0];
  const isDigital = (videoInputDefinition & 0x80) !== 0;
  
  return {
    isDigital,
    videoInput: isDigital ? 'Digital' : 'Analog',
    maxHorizontalCm: bytes[1],
    maxVerticalCm: bytes[2],
    gamma: (bytes[3] + 100) / 100,
    features: {
      standby: (bytes[4] & 0x80) !== 0,
      suspend: (bytes[4] & 0x40) !== 0,
      activeOff: (bytes[4] & 0x20) !== 0,
      displayType: (bytes[4] >> 3) & 0x03,
      sRGB: (bytes[4] & 0x04) !== 0,
      preferredTimingMode: (bytes[4] & 0x02) !== 0,
      defaultGTFSupported: (bytes[4] & 0x01) !== 0
    }
  };
}

function parseChromaticity(bytes) {
  const redGreenLow = bytes[0];
  const blueWhiteLow = bytes[1];
  const redX = bytes[2];
  const redY = bytes[3];
  const greenX = bytes[4];
  const greenY = bytes[5];
  const blueX = bytes[6];
  const blueY = bytes[7];
  const whiteX = bytes[8];
  const whiteY = bytes[9];

  const extractValue = (high, lowBits) => {
    return ((high << 2) | lowBits) / 1024;
  };

  return {
    red: {
      x: extractValue(redX, (redGreenLow >> 6) & 0x03),
      y: extractValue(redY, (redGreenLow >> 4) & 0x03)
    },
    green: {
      x: extractValue(greenX, (redGreenLow >> 2) & 0x03),
      y: extractValue(greenY, redGreenLow & 0x03)
    },
    blue: {
      x: extractValue(blueX, (blueWhiteLow >> 6) & 0x03),
      y: extractValue(blueY, (blueWhiteLow >> 4) & 0x03)
    },
    white: {
      x: extractValue(whiteX, (blueWhiteLow >> 2) & 0x03),
      y: extractValue(whiteY, blueWhiteLow & 0x03)
    }
  };
}

function parseEstablishedTimings(bytes) {
  const timings = [];
  const established = [
    { mask: 0x80, name: '720x400 @ 70Hz' },
    { mask: 0x40, name: '720x400 @ 88Hz' },
    { mask: 0x20, name: '640x480 @ 60Hz' },
    { mask: 0x10, name: '640x480 @ 67Hz' },
    { mask: 0x08, name: '640x480 @ 72Hz' },
    { mask: 0x04, name: '640x480 @ 75Hz' },
    { mask: 0x02, name: '800x600 @ 56Hz' },
    { mask: 0x01, name: '800x600 @ 60Hz' },
    { mask: 0x80, name: '800x600 @ 72Hz', offset: 1 },
    { mask: 0x40, name: '800x600 @ 75Hz', offset: 1 },
    { mask: 0x20, name: '832x624 @ 75Hz', offset: 1 },
    { mask: 0x10, name: '1024x768 @ 87Hz (I)', offset: 1 },
    { mask: 0x08, name: '1024x768 @ 60Hz', offset: 1 },
    { mask: 0x04, name: '1024x768 @ 70Hz', offset: 1 },
    { mask: 0x02, name: '1024x768 @ 75Hz', offset: 1 },
    { mask: 0x01, name: '1280x1024 @ 75Hz', offset: 1 },
    { mask: 0x80, name: '1152x870 @ 75Hz', offset: 2 }
  ];

  established.forEach(t => {
    const offset = t.offset || 0;
    if ((bytes[offset] & t.mask) !== 0) {
      timings.push(t.name);
    }
  });

  return timings;
}

function parseStandardTimings(bytes) {
  const timings = [];
  for (let i = 0; i < 8; i++) {
    const byte1 = bytes[i * 2];
    const byte2 = bytes[i * 2 + 1];
    
    if (byte1 === 0x01 && byte2 === 0x01) continue;
    
    const horizontalPixels = (byte1 + 31) * 8;
    const aspectRatio = (byte2 >> 6) & 0x03;
    const refreshRate = (byte2 & 0x3F) + 60;
    
    let aspect = '4:3';
    if (aspectRatio === 1) aspect = '16:10';
    else if (aspectRatio === 2) aspect = '16:9';
    else if (aspectRatio === 3) aspect = '5:4';
    
    timings.push({
      horizontalPixels,
      aspectRatio: aspect,
      refreshRate: `${refreshRate}Hz`,
      description: `${horizontalPixels} x ... @ ${refreshRate}Hz (${aspect})`
    });
  }
  return timings.filter(t => t.horizontalPixels > 248);
}

function parseDetailedTimings(bytes) {
  const timings = [];
  
  for (let i = 0; i < 4; i++) {
    const offset = i * 18;
    const block = bytes.slice(offset, offset + 18);
    
    const pixelClock = (block.readUInt16LE(0) / 100).toFixed(2);
    
    if (parseInt(pixelClock) === 0) {
      const displayDesc = parseDisplayDescriptor(block);
      if (displayDesc) timings.push(displayDesc);
      continue;
    }
    
    const horizontalActive = block[2] + ((block[4] & 0xF0) << 4);
    const horizontalBlanking = block[3] + ((block[4] & 0x0F) << 8);
    const verticalActive = block[5] + ((block[7] & 0xF0) << 4);
    const verticalBlanking = block[6] + ((block[7] & 0x0F) << 8);
    const horizontalSyncOffset = block[8] + ((block[11] & 0xC0) << 2);
    const horizontalSyncPulse = block[9] + ((block[11] & 0x30) << 4);
    const verticalSyncOffset = (block[10] >> 4) + ((block[11] & 0x0C) << 2);
    const verticalSyncPulse = (block[10] & 0x0F) + ((block[11] & 0x03) << 4);
    const horizontalImageSize = block[12] + ((block[14] & 0xF0) << 4);
    const verticalImageSize = block[13] + ((block[14] & 0x0F) << 8);
    const horizontalBorder = block[15];
    const verticalBorder = block[16];
    const flags = block[17];
    
    const isInterlaced = (flags & 0x80) !== 0;
    const stereoMode = (flags >> 5) & 0x03;
    const syncType = flags & 0x1F;
    
    const verticalFrequency = calculateVerticalFrequency(
      parseFloat(pixelClock),
      horizontalActive + horizontalBlanking,
      verticalActive + verticalBlanking
    );
    
    timings.push({
      type: 'detailed-timing',
      isPreferred: i === 0,
      pixelClock: `${pixelClock} MHz`,
      resolution: `${horizontalActive}x${verticalActive}`,
      refreshRate: `${verticalFrequency.toFixed(1)}Hz`,
      interlaced: isInterlaced,
      horizontal: {
        active: horizontalActive,
        blanking: horizontalBlanking,
        syncOffset: horizontalSyncOffset,
        syncPulse: horizontalSyncPulse,
        imageSize: horizontalImageSize
      },
      vertical: {
        active: verticalActive,
        blanking: verticalBlanking,
        syncOffset: verticalSyncOffset,
        syncPulse: verticalSyncPulse,
        imageSize: verticalImageSize
      },
      border: { horizontal: horizontalBorder, vertical: verticalBorder },
      stereoMode,
      syncType,
      description: `${horizontalActive}x${verticalActive} @ ${verticalFrequency.toFixed(1)}Hz${isInterlaced ? ' (I)' : ''}`
    });
  }
  
  return timings;
}

function parseDisplayDescriptor(block) {
  const tag = block[3];
  
  if (tag === 0xFC) {
    const name = block.slice(5).toString('ascii').replace(/\0/g, '').trim();
    return { type: 'display-name', name };
  } else if (tag === 0xFE) {
    const text = block.slice(5).toString('ascii').replace(/\0/g, '').trim();
    return { type: 'alphanumeric', text };
  } else if (tag === 0xFF) {
    const serial = block.slice(5).toString('ascii').replace(/\0/g, '').trim();
    return { type: 'serial-number', serial };
  } else if (tag === 0xFD) {
    return {
      type: 'range-limits',
      minVerticalRate: block[5],
      maxVerticalRate: block[6],
      minHorizontalRate: block[7],
      maxHorizontalRate: block[8],
      maxPixelClock: block[9] * 10
    };
  }
  return null;
}

function findDisplayName(edidData) {
  for (let i = 0; i < 4; i++) {
    const offset = 54 + i * 18;
    const block = edidData.slice(offset, offset + 18);
    const pixelClock = block.readUInt16LE(0);
    
    if (pixelClock === 0 && block[3] === 0xFC) {
      return block.slice(5).toString('ascii').replace(/\0/g, '').trim();
    }
  }
  return null;
}

function calculateVerticalFrequency(pixelClockMHz, horizontalTotal, verticalTotal) {
  return (pixelClockMHz * 1000000) / (horizontalTotal * verticalTotal);
}

function hexToBytes(hex) {
  hex = hex.replace(/\s+/g, '').toLowerCase();
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return Buffer.from(bytes);
}

function detectHDMIInput(edidInfo) {
  const inputs = [];
  
  if (edidInfo.displayParameters && edidInfo.displayParameters.isDigital) {
    inputs.push('HDMI/DVI');
  }
  
  if (edidInfo.detailedTimings) {
    const hdmiTimings = edidInfo.detailedTimings.filter(t => 
      t.type === 'detailed-timing' && 
      parseInt(t.resolution.split('x')[0]) >= 1280
    );
    if (hdmiTimings.length > 0) {
      inputs.push('支持HD分辨率');
    }
  }
  
  return inputs;
}

function getSupportedResolutions(edidInfo) {
  const resolutions = new Set();
  
  if (edidInfo.establishedTimings) {
    edidInfo.establishedTimings.forEach(t => resolutions.add(t));
  }
  
  if (edidInfo.detailedTimings) {
    edidInfo.detailedTimings
      .filter(t => t.type === 'detailed-timing')
      .forEach(t => resolutions.add(t.description));
  }
  
  return Array.from(resolutions);
}

module.exports = {
  parseEDID,
  validateEDID,
  hexToBytes,
  detectHDMIInput,
  getSupportedResolutions
};
