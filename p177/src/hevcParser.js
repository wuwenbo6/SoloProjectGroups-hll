const fs = require('fs');

const NAL_UNIT_TYPES = {
  0: 'TRAIL_N',
  1: 'TRAIL_R',
  2: 'TSA_N',
  3: 'TSA_R',
  4: 'STSA_N',
  5: 'STSA_R',
  6: 'RADL_N',
  7: 'RADL_R',
  8: 'RASL_N',
  9: 'RASL_R',
  10: 'RSV_VCL_N10',
  11: 'RSV_VCL_R11',
  12: 'RSV_VCL_N12',
  13: 'RSV_VCL_R13',
  14: 'RSV_VCL_N14',
  15: 'RSV_VCL_R15',
  16: 'BLA_W_LP',
  17: 'BLA_W_RADL',
  18: 'BLA_N_LP',
  19: 'IDR_W_RADL',
  20: 'IDR_N_LP',
  21: 'CRA_NUT',
  22: 'RSV_IRAP_VCL22',
  23: 'RSV_IRAP_VCL23',
  24: 'RSV_VCL24',
  25: 'RSV_VCL25',
  26: 'RSV_VCL26',
  27: 'RSV_VCL27',
  28: 'RSV_VCL28',
  29: 'RSV_VCL29',
  30: 'RSV_VCL30',
  31: 'RSV_VCL31',
  32: 'VPS_NUT',
  33: 'SPS_NUT',
  34: 'PPS_NUT',
  35: 'AUD_NUT',
  36: 'EOS_NUT',
  37: 'EOB_NUT',
  38: 'FD_NUT',
  39: 'PREFIX_SEI_NUT',
  40: 'SUFFIX_SEI_NUT',
  41: 'RSV_NVCL41',
  42: 'RSV_NVCL42',
  43: 'RSV_NVCL43',
  44: 'RSV_NVCL44',
  45: 'RSV_NVCL45',
  46: 'RSV_NVCL46',
  47: 'RSV_NVCL47',
  48: 'UNSPEC48',
  49: 'UNSPEC49',
  50: 'UNSPEC50',
  51: 'UNSPEC51',
  52: 'UNSPEC52',
  53: 'UNSPEC53',
  54: 'UNSPEC54',
  55: 'UNSPEC55',
  56: 'UNSPEC56',
  57: 'UNSPEC57',
  58: 'UNSPEC58',
  59: 'UNSPEC59',
  60: 'UNSPEC60',
  61: 'UNSPEC61',
  62: 'UNSPEC62',
  63: 'UNSPEC63'
};

const SEI_PAYLOAD_TYPES = {
  0: 'buffering_period',
  1: 'pic_timing',
  2: 'pan_scan_rect',
  3: 'filler_payload',
  4: 'user_data_registered_itu_t_t35',
  5: 'user_data_unregistered',
  6: 'recovery_point',
  7: 'dec_ref_pic_marking_repetition',
  8: 'spare_pic',
  9: 'scene_info',
  10: 'sub_seq_info',
  11: 'sub_seq_layer_characteristics',
  12: 'sub_seq_characteristics',
  13: 'full_frame_freeze',
  14: 'full_frame_freeze_release',
  15: 'full_frame_snapshot',
  16: 'progressive_refinement_segment_start',
  17: 'progressive_refinement_segment_end',
  18: 'motion_constrained_slice_group_set',
  19: 'film_grain_characteristics',
  20: 'deblocking_filter_display_preference',
  21: 'stereo_video_info',
  22: 'post_filter_hint',
  23: 'tone_mapping_info',
  24: 'scalability_info',
  25: 'sub_pic_scalable_layer',
  26: 'non_required_layer_rep',
  27: 'priority_layer_info',
  28: 'layers_not_present',
  29: 'layer_dependency_change',
  30: 'scalable_nesting',
  31: 'base_layer_temporal_hrd',
  32: 'quality_layer_integrity_check',
  33: 'redundant_pic_property',
  34: 'tl0_dep_rep_index',
  35: 'tl_switching_point',
  36: 'parallel_decoding_info',
  37: 'mvc_scalable_nesting',
  38: 'view_scalability_info',
  39: 'multiview_scene_info',
  40: 'multiview_acquisition_info',
  41: 'non_required_view_component',
  42: 'view_dependency_change',
  43: 'operation_points_not_present',
  44: 'base_view_temporal_hrd',
  45: 'frame_packing_arrangement',
  46: 'multiview_layout',
  47: 'depth_presentation_info',
  48: 'multiview_depth_layout',
  49: 'depth_sampling_info',
  50: 'depth_reconstruction_info',
  51: 'beta_offset_info',
  52: 'depth_timing_info',
  53: 'decoder_side_information',
  54: 'enhanced_decoder_information',
  55: 'three_dimensional_reference_displays_info',
  56: 'depth_range_info',
  57: 'default_display_window',
  58: 'mastering_display_colour_volume',
  59: 'colour_remapping_info',
  60: 'sdr_conversion_window',
  61: 'light_level_content',
  62: 'alternative_transfer_characteristics',
  63: 'ambient_viewing_environment',
  64: 'content_colour_volume',
  65: 'equirectangular_projection',
  66: 'cubemap_projection',
  67: 'fisheye_viewport_info',
  68: 'fisheye_viewport_camera_parameters',
  127: 'reserved_sei_message'
};

function findStartCodes(buffer) {
  const startCodes = [];
  const startCode3 = Buffer.from([0x00, 0x00, 0x01]);
  const startCode4 = Buffer.from([0x00, 0x00, 0x00, 0x01]);

  let pos = 0;
  while (pos < buffer.length) {
    const idx4 = buffer.indexOf(startCode4, pos);
    const idx3 = buffer.indexOf(startCode3, pos);

    if (idx4 === -1 && idx3 === -1) break;

    if (idx4 !== -1 && (idx3 === -1 || idx4 < idx3)) {
      startCodes.push({ position: idx4, length: 4 });
      pos = idx4 + 4;
    } else if (idx3 !== -1) {
      if (idx3 > 0 && buffer[idx3 - 1] === 0x00) {
        startCodes.push({ position: idx3 - 1, length: 4 });
        pos = idx3 + 3;
      } else {
        startCodes.push({ position: idx3, length: 3 });
        pos = idx3 + 3;
      }
    }
  }

  return startCodes;
}

function parseNALHeader(buffer, offset) {
  if (offset + 2 > buffer.length) {
    throw new Error('Invalid NAL unit: buffer too short');
  }

  const header = buffer.readUInt16BE(offset);
  const forbiddenZeroBit = (header >> 15) & 0x01;
  const nalUnitType = (header >> 9) & 0x3F;
  const nuhLayerId = (header >> 3) & 0x3F;
  const nuhTemporalIdPlus1 = header & 0x07;

  return {
    forbiddenZeroBit,
    nalUnitType,
    nuhLayerId,
    nuhTemporalIdPlus1,
    typeName: NAL_UNIT_TYPES[nalUnitType] || `UNKNOWN_${nalUnitType}`
  };
}

function parseEBSP(buffer, startOffset, endOffset) {
  const ebsp = buffer.slice(startOffset, endOffset);
  const rbsp = [];

  for (let i = 0; i < ebsp.length; i++) {
    if (i >= 2 && ebsp[i] === 0x03 && ebsp[i - 1] === 0x00 && ebsp[i - 2] === 0x00) {
      continue;
    }
    rbsp.push(ebsp[i]);
  }

  return Buffer.from(rbsp);
}

function readExpGolomb(rbsp, bitOffset) {
  let leadingZeroBits = -1;
  let b = 0;

  for (b = 0; b === 0; leadingZeroBits++) {
    b = readBit(rbsp, bitOffset);
    bitOffset++;
  }

  let codeNum = 0;
  for (let i = 0; i < leadingZeroBits; i++) {
    b = readBit(rbsp, bitOffset);
    bitOffset++;
    codeNum = (codeNum << 1) | b;
  }
  codeNum = codeNum + (1 << leadingZeroBits) - 1;

  return { codeNum, bitOffset };
}

function readBit(buffer, bitOffset) {
  const byteOffset = Math.floor(bitOffset / 8);
  const bitInByte = 7 - (bitOffset % 8);
  return (buffer[byteOffset] >> bitInByte) & 0x01;
}

function readBits(buffer, bitOffset, numBits) {
  let value = 0;
  for (let i = 0; i < numBits; i++) {
    value = (value << 1) | readBit(buffer, bitOffset + i);
  }
  return { value, bitOffset: bitOffset + numBits };
}

function parseSEIMessage(rbsp) {
  let bitOffset = 0;
  const seiMessages = [];

  while (bitOffset < rbsp.length * 8) {
    const remainingBits = rbsp.length * 8 - bitOffset;
    if (remainingBits < 8) break;

    const byteOffset = Math.floor(bitOffset / 8);
    const bitsRemainder = bitOffset % 8;

    if (bitsRemainder !== 0) {
      bitOffset = Math.ceil(bitOffset / 8) * 8;
    }

    if (rbsp[byteOffset] === 0x80) {
      break;
    }

    let payloadType = 0;
    let nextByte = rbsp[Math.floor(bitOffset / 8)];
    while (nextByte === 0xff) {
      payloadType += 255;
      bitOffset += 8;
      if (Math.floor(bitOffset / 8) >= rbsp.length) break;
      nextByte = rbsp[Math.floor(bitOffset / 8)];
    }
    payloadType += rbsp[Math.floor(bitOffset / 8)];
    bitOffset += 8;

    if (Math.floor(bitOffset / 8) >= rbsp.length) break;

    let payloadSize = 0;
    nextByte = rbsp[Math.floor(bitOffset / 8)];
    while (nextByte === 0xff) {
      payloadSize += 255;
      bitOffset += 8;
      if (Math.floor(bitOffset / 8) >= rbsp.length) break;
      nextByte = rbsp[Math.floor(bitOffset / 8)];
    }
    if (Math.floor(bitOffset / 8) < rbsp.length) {
      payloadSize += rbsp[Math.floor(bitOffset / 8)];
      bitOffset += 8;
    }

    const payloadStartByte = Math.floor(bitOffset / 8);
    const payloadEndByte = Math.min(payloadStartByte + payloadSize, rbsp.length);
    const payloadData = rbsp.slice(payloadStartByte, payloadEndByte);
    bitOffset += payloadSize * 8;

    seiMessages.push({
      payloadType,
      payloadTypeName: SEI_PAYLOAD_TYPES[payloadType] || `UNKNOWN_${payloadType}`,
      payloadSize,
      payloadData,
      payloadText: payloadData.toString('utf8', 0, Math.min(100, payloadData.length))
    });
  }

  return seiMessages;
}

function parseHEVCFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const fileSize = buffer.length;
  const startCodes = findStartCodes(buffer);

  const nalUnits = [];

  for (let i = 0; i < startCodes.length; i++) {
    const start = startCodes[i];
    const nextStart = i < startCodes.length - 1 ? startCodes[i + 1] : null;

    const nalStartOffset = start.position + start.length;
    const nalEndOffset = nextStart ? nextStart.position : buffer.length;

    const header = parseNALHeader(buffer, nalStartOffset);
    const rbsp = parseEBSP(buffer, nalStartOffset + 2, nalEndOffset);

    const nalUnit = {
      index: i,
      startCodePosition: start.position,
      startCodeLength: start.length,
      nalUnitLength: nalEndOffset - nalStartOffset,
      header,
      rbsp,
      seiMessages: []
    };

    if (header.nalUnitType === 39 || header.nalUnitType === 40) {
      try {
        nalUnit.seiMessages = parseSEIMessage(rbsp);
      } catch (e) {
        console.warn(`Failed to parse SEI in NAL unit ${i}:`, e.message);
      }
    }

    nalUnits.push(nalUnit);
  }

  return {
    filePath,
    fileSize,
    nalUnitCount: nalUnits.length,
    nalUnits
  };
}

function extractSEI(filePath) {
  const result = parseHEVCFile(filePath);
  const seiNalUnits = [];

  for (const nalUnit of result.nalUnits) {
    const nalType = nalUnit.header.nalUnitType;
    if (nalType === 39 || nalType === 40) {
      seiNalUnits.push({
        index: nalUnit.index,
        nalUnitType: nalType,
        nalUnitTypeName: nalUnit.header.typeName,
        seiMessages: nalUnit.seiMessages.map(msg => ({
          ...msg,
          payloadText: msg.payloadData.toString('utf8'),
          payloadHex: msg.payloadData.toString('hex')
        }))
      });
    }
  }

  return {
    ...result,
    seiNalUnits
  };
}

function encodeSEIVariableLength(value) {
  const bytes = [];
  while (value >= 255) {
    bytes.push(0xff);
    value -= 255;
  }
  bytes.push(value);
  return Buffer.from(bytes);
}

function generateSEIUnregisteredMessage(data) {
  const userDataBytes = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');

  const payloadType = 5;
  const payloadSize = userDataBytes.length;

  const seiPayload = Buffer.concat([
    encodeSEIVariableLength(payloadType),
    encodeSEIVariableLength(payloadSize),
    userDataBytes
  ]);

  const rbsp = Buffer.concat([
    seiPayload,
    Buffer.from([0x80])
  ]);

  return rbsp;
}

function generateSEIRegisteredMessage(countryCode, providerCode, userIdentifier, userData) {
  const ituTT35Header = Buffer.alloc(7);
  ituTT35Header.writeUInt8(countryCode & 0xFF, 0);
  ituTT35Header.writeUInt8((providerCode >> 8) & 0xFF, 1);
  ituTT35Header.writeUInt8(providerCode & 0xFF, 2);
  ituTT35Header.write(userIdentifier, 3, 4, 'ascii');

  const userDataBytes = Buffer.isBuffer(userData) ? userData : Buffer.from(String(userData), 'utf8');

  const payloadData = Buffer.concat([ituTT35Header, userDataBytes]);
  const payloadType = 4;
  const payloadSize = payloadData.length;

  const seiPayload = Buffer.concat([
    encodeSEIVariableLength(payloadType),
    encodeSEIVariableLength(payloadSize),
    payloadData
  ]);

  const rbsp = Buffer.concat([
    seiPayload,
    Buffer.from([0x80])
  ]);

  return rbsp;
}

function generateSEIUserDataMessage(timestamp, options = {}) {
  const {
    seiType = 'unregistered',
    countryCode = 0xB5,
    providerCode = 0x003C,
    userIdentifier = 'TS  '
  } = options;

  const data = `TIMESTAMP:${timestamp}`;

  if (seiType === 'registered') {
    return generateSEIRegisteredMessage(countryCode, providerCode, userIdentifier, data);
  } else {
    return generateSEIUnregisteredMessage(data);
  }
}

function createNALUnit(nalUnitType, rbsp) {
  const header = Buffer.alloc(2);
  const forbiddenZeroBit = 0;
  const nuhLayerId = 0;
  const nuhTemporalIdPlus1 = 1;

  const headerValue = (forbiddenZeroBit << 15) |
                      (nalUnitType << 9) |
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

function insertSEITimestamp(inputPath, outputPath, options = {}) {
  const buffer = fs.readFileSync(inputPath);
  const startCodes = findStartCodes(buffer);

  const outputBuffers = [];
  let processedCount = 0;
  let lastOffset = 0;

  let hasVPS = false;
  let hasSPS = false;
  let hasPPS = false;
  let canInsertSEI = false;

  for (let i = 0; i < startCodes.length; i++) {
    const start = startCodes[i];
    const nextStart = i < startCodes.length - 1 ? startCodes[i + 1] : null;

    outputBuffers.push(buffer.slice(lastOffset, start.position));

    const nalStartOffset = start.position + start.length;
    const nalEndOffset = nextStart ? nextStart.position : buffer.length;
    const header = parseNALHeader(buffer, nalStartOffset);
    const nalType = header.nalUnitType;

    if (nalType === 32) hasVPS = true;
    if (nalType === 33) hasSPS = true;
    if (nalType === 34) hasPPS = true;

    if (!canInsertSEI && hasVPS && hasSPS && hasPPS) {
      canInsertSEI = true;
    }

    if (canInsertSEI && nalType >= 16 && nalType <= 23) {
      const timestamp = Date.now() + processedCount;
      const seiRbsp = generateSEIUserDataMessage(timestamp, options);
      const seiNalUnit = createNALUnit(39, seiRbsp);
      outputBuffers.push(seiNalUnit);
      processedCount++;
    }

    outputBuffers.push(buffer.slice(start.position, nalEndOffset));
    lastOffset = nalEndOffset;
  }

  outputBuffers.push(buffer.slice(lastOffset));

  const outputBuffer = Buffer.concat(outputBuffers);
  fs.writeFileSync(outputPath, outputBuffer);

  return {
    inputFile: inputPath,
    outputFile: outputPath,
    inputSize: buffer.length,
    outputSize: outputBuffer.length,
    seiInsertedCount: processedCount,
    hasVPS,
    hasSPS,
    hasPPS,
    canInsertSEI,
    seiType: options.seiType || 'unregistered'
  };
}

function batchProcessFolder(inputFolder, outputFolder, options = {}) {
  const path = require('path');

  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  const files = fs.readdirSync(inputFolder);
  const hevcExtensions = ['.h265', '.hevc', '.265', '.h264', '.avc'];

  const hevcFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return hevcExtensions.includes(ext);
  });

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (const file of hevcFiles) {
    const inputPath = path.join(inputFolder, file);
    const ext = path.extname(file);
    const baseName = path.basename(file, ext);
    const outputPath = path.join(outputFolder, `${baseName}_sei${ext}`);

    try {
      const result = insertSEITimestamp(inputPath, outputPath, options);
      results.push({
        fileName: file,
        status: 'success',
        ...result
      });
      successCount++;
    } catch (error) {
      results.push({
        fileName: file,
        status: 'error',
        error: error.message
      });
      errorCount++;
    }
  }

  return {
    inputFolder,
    outputFolder,
    totalFiles: hevcFiles.length,
    successCount,
    errorCount,
    results
  };
}

function saveToFile(data, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return true;
}

module.exports = {
  parseHEVCFile,
  extractSEI,
  insertSEITimestamp,
  batchProcessFolder,
  generateSEIUnregisteredMessage,
  generateSEIRegisteredMessage,
  saveToFile,
  NAL_UNIT_TYPES,
  SEI_PAYLOAD_TYPES
};
