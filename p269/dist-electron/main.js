var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";
import * as fs from "fs";
const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function encode$3(bytes) {
  let base64 = "";
  for (let i = 0; i < bytes.length; i += 3) {
    base64 += chars[bytes[i] >> 2];
    base64 += chars[(bytes[i] & 3) << 4 | bytes[i + 1] >> 4];
    base64 += chars[(bytes[i + 1] & 15) << 2 | bytes[i + 2] >> 6];
    base64 += chars[bytes[i + 2] & 63];
  }
  if (bytes.length % 3 === 2) {
    base64 = base64.substring(0, base64.length - 1) + "=";
  } else if (bytes.length % 3 === 1) {
    base64 = base64.substring(0, base64.length - 2) + "==";
  }
  return base64;
}
function decode$3(base64) {
  let lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  let bufferLength = base64.length * 0.75;
  if (base64[base64.length - 1] === "=") {
    bufferLength--;
    if (base64[base64.length - 2] === "=") {
      bufferLength--;
    }
  }
  let bytes = new Uint8Array(bufferLength);
  for (let i = 0, j = 0; i < base64.length; i += 4) {
    let encoded1 = lookup[base64.charCodeAt(i)];
    let encoded2 = lookup[base64.charCodeAt(i + 1)];
    let encoded3 = lookup[base64.charCodeAt(i + 2)];
    let encoded4 = lookup[base64.charCodeAt(i + 3)];
    bytes[j++] = encoded1 << 2 | encoded2 >> 4;
    bytes[j++] = (encoded2 & 15) << 4 | encoded3 >> 2;
    bytes[j++] = (encoded3 & 3) << 6 | encoded4 & 63;
  }
  return bytes;
}
function changeBitDepth(samples, bithDepth, newSamples, targetBitDepth) {
  if (["32f", "64"].indexOf(bithDepth) > -1 && ["32f", "64"].indexOf(targetBitDepth) > -1) {
    newSamples.set(samples);
    return;
  }
  validateBitDepth_(bithDepth);
  validateBitDepth_(targetBitDepth);
  let toFunction = getBitDepthFunction_(bithDepth, targetBitDepth);
  let options = {
    oldMin: Math.pow(2, parseInt(bithDepth, 10)) / 2,
    newMin: Math.pow(2, parseInt(targetBitDepth, 10)) / 2,
    oldMax: Math.pow(2, parseInt(bithDepth, 10)) / 2 - 1,
    newMax: Math.pow(2, parseInt(targetBitDepth, 10)) / 2 - 1
  };
  sign8Bit_(bithDepth, samples, true);
  for (let i = 0, len = samples.length; i < len; i++) {
    newSamples[i] = toFunction(samples[i], options);
  }
  sign8Bit_(targetBitDepth, newSamples, false);
}
function intToInt_(sample, args) {
  if (sample > 0) {
    sample = parseInt(sample / args.oldMax * args.newMax, 10);
  } else {
    sample = parseInt(sample / args.oldMin * args.newMin, 10);
  }
  return sample;
}
function floatToInt_(sample, args) {
  return parseInt(
    sample > 0 ? sample * args.newMax : sample * args.newMin,
    10
  );
}
function intToFloat_(sample, args) {
  return sample > 0 ? sample / args.oldMax : sample / args.oldMin;
}
function getBitDepthFunction_(original, target) {
  let func = function(x) {
    return x;
  };
  if (original != target) {
    if (["32f", "64"].includes(original)) {
      func = floatToInt_;
    } else {
      if (["32f", "64"].includes(target)) {
        func = intToFloat_;
      } else {
        func = intToInt_;
      }
    }
  }
  return func;
}
function validateBitDepth_(bitDepth) {
  if (bitDepth != "32f" && bitDepth != "64" && (parseInt(bitDepth, 10) < "8" || parseInt(bitDepth, 10) > "53")) {
    throw new Error("Invalid bit depth.");
  }
}
function sign8Bit_(bitDepth, samples, sign) {
  if (bitDepth == "8") {
    let factor = sign ? -128 : 128;
    for (let i = 0, len = samples.length; i < len; i++) {
      samples[i] = samples[i] += factor;
    }
  }
}
const INDEX_TABLE = [
  -1,
  -1,
  -1,
  -1,
  2,
  4,
  6,
  8,
  -1,
  -1,
  -1,
  -1,
  2,
  4,
  6,
  8
];
const STEP_TABLE = [
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  16,
  17,
  19,
  21,
  23,
  25,
  28,
  31,
  34,
  37,
  41,
  45,
  50,
  55,
  60,
  66,
  73,
  80,
  88,
  97,
  107,
  118,
  130,
  143,
  157,
  173,
  190,
  209,
  230,
  253,
  279,
  307,
  337,
  371,
  408,
  449,
  494,
  544,
  598,
  658,
  724,
  796,
  876,
  963,
  1060,
  1166,
  1282,
  1411,
  1552,
  1707,
  1878,
  2066,
  2272,
  2499,
  2749,
  3024,
  3327,
  3660,
  4026,
  4428,
  4871,
  5358,
  5894,
  6484,
  7132,
  7845,
  8630,
  9493,
  10442,
  11487,
  12635,
  13899,
  15289,
  16818,
  18500,
  20350,
  22385,
  24623,
  27086,
  29794,
  32767
];
function encode$2(samples) {
  let state = {
    index: 0,
    predicted: 0
  };
  let adpcmSamples = new Uint8Array(samples.length);
  let block = [];
  let fileIndex = 0;
  let blockCount = 0;
  for (let i = 0, len = samples.length; i < len; i++) {
    if (i % 505 == 0 && i != 0) {
      adpcmSamples.set(encodeBlock(block, state), fileIndex);
      fileIndex += 256;
      block = [];
      blockCount++;
    }
    block.push(samples[i]);
  }
  let samplesLength = samples.length / 2;
  if (samplesLength % 2) {
    samplesLength++;
  }
  return adpcmSamples.slice(0, samplesLength + 512 + blockCount * 4);
}
function decode$2(adpcmSamples, blockAlign = 256) {
  let state = {
    index: 0,
    predicted: 0,
    step: 7
  };
  let samples = new Int16Array(adpcmSamples.length * 2);
  let block = [];
  let fileIndex = 0;
  for (let i = 0, len = adpcmSamples.length; i < len; i++) {
    if (i % blockAlign == 0 && i != 0) {
      let decoded = decodeBlock(block, state);
      samples.set(decoded, fileIndex);
      fileIndex += decoded.length;
      block = [];
    }
    block.push(adpcmSamples[i]);
  }
  return samples;
}
function encodeBlock(block, state) {
  let adpcmSamples = blockHead_(block[0], state);
  for (let i = 3, len = block.length; i < len; i += 2) {
    let sample2 = encodeSample_(block[i], state);
    let sample = encodeSample_(block[i + 1], state);
    adpcmSamples.push(sample << 4 | sample2);
  }
  return adpcmSamples;
}
function decodeBlock(block, state) {
  state.predicted = sign_(block[1] << 8 | block[0]);
  state.index = block[2];
  state.step = STEP_TABLE[state.index];
  let result = [
    state.predicted,
    state.predicted
  ];
  for (let i = 4, len = block.length; i < len; i++) {
    let original_sample = block[i];
    let second_sample = original_sample >> 4;
    let first_sample = second_sample << 4 ^ original_sample;
    result.push(decodeSample_(first_sample, state));
    result.push(decodeSample_(second_sample, state));
  }
  return result;
}
function sign_(num) {
  return num > 32768 ? num - 65536 : num;
}
function encodeSample_(sample, state) {
  let delta = sample - state.predicted;
  let value = 0;
  if (delta >= 0) {
    value = 0;
  } else {
    value = 8;
    delta = -delta;
  }
  let step = STEP_TABLE[state.index];
  let diff = step >> 3;
  if (delta > step) {
    value |= 4;
    delta -= step;
    diff += step;
  }
  step >>= 1;
  if (delta > step) {
    value |= 2;
    delta -= step;
    diff += step;
  }
  step >>= 1;
  if (delta > step) {
    value |= 1;
    diff += step;
  }
  updateEncoder_(value, diff, state);
  return value;
}
function updateEncoder_(value, diff, state) {
  if (value & 8) {
    state.predicted -= diff;
  } else {
    state.predicted += diff;
  }
  if (state.predicted < -32768) {
    state.predicted = -32768;
  } else if (state.predicted > 32767) {
    state.predicted = 32767;
  }
  state.index += INDEX_TABLE[value & 7];
  if (state.index < 0) {
    state.index = 0;
  } else if (state.index > 88) {
    state.index = 88;
  }
}
function decodeSample_(nibble, state) {
  let difference = 0;
  if (nibble & 4) {
    difference += state.step;
  }
  if (nibble & 2) {
    difference += state.step >> 1;
  }
  if (nibble & 1) {
    difference += state.step >> 2;
  }
  difference += state.step >> 3;
  if (nibble & 8) {
    difference = -difference;
  }
  state.predicted += difference;
  if (state.predicted > 32767) {
    state.predicted = 32767;
  } else if (state.predicted < -32767) {
    state.predicted = -32767;
  }
  updateDecoder_(nibble, state);
  return state.predicted;
}
function updateDecoder_(nibble, state) {
  state.index += INDEX_TABLE[nibble];
  if (state.index < 0) {
    state.index = 0;
  } else if (state.index > 88) {
    state.index = 88;
  }
  state.step = STEP_TABLE[state.index];
}
function blockHead_(sample, state) {
  encodeSample_(sample, state);
  let adpcmSamples = [];
  adpcmSamples.push(sample & 255);
  adpcmSamples.push(sample >> 8 & 255);
  adpcmSamples.push(state.index);
  adpcmSamples.push(0);
  return adpcmSamples;
}
const LOG_TABLE = [
  1,
  1,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7
];
function encodeSample$1(sample) {
  let compandedValue;
  sample = sample == -32768 ? -32767 : sample;
  let sign = ~sample >> 8 & 128;
  if (!sign) {
    sample = sample * -1;
  }
  if (sample > 32635) {
    sample = 32635;
  }
  if (sample >= 256) {
    let exponent = LOG_TABLE[sample >> 8 & 127];
    let mantissa = sample >> exponent + 3 & 15;
    compandedValue = exponent << 4 | mantissa;
  } else {
    compandedValue = sample >> 4;
  }
  return compandedValue ^ (sign ^ 85);
}
function decodeSample$1(aLawSample) {
  let sign = 0;
  aLawSample ^= 85;
  if ((aLawSample & 128) !== 0) {
    aLawSample &= -129;
    sign = -1;
  }
  let position = ((aLawSample & 240) >> 4) + 4;
  let decoded = 0;
  if (position != 4) {
    decoded = 1 << position | (aLawSample & 15) << position - 4 | 1 << position - 5;
  } else {
    decoded = aLawSample << 1 | 1;
  }
  decoded = sign === 0 ? decoded : -decoded;
  return decoded * 8 * -1;
}
function encode$1(samples) {
  let aLawSamples = new Uint8Array(samples.length);
  for (let i = 0, len = samples.length; i < len; i++) {
    aLawSamples[i] = encodeSample$1(samples[i]);
  }
  return aLawSamples;
}
function decode$1(samples) {
  let pcmSamples = new Int16Array(samples.length);
  for (let i = 0, len = samples.length; i < len; i++) {
    pcmSamples[i] = decodeSample$1(samples[i]);
  }
  return pcmSamples;
}
const BIAS = 132;
const CLIP = 32635;
const encodeTable = [
  0,
  0,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  5,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  6,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7,
  7
];
const decodeTable = [0, 132, 396, 924, 1980, 4092, 8316, 16764];
function encodeSample(sample) {
  let sign;
  let exponent;
  let mantissa;
  let muLawSample;
  sign = sample >> 8 & 128;
  if (sign != 0) sample = -sample;
  sample = sample + BIAS;
  if (sample > CLIP) sample = CLIP;
  exponent = encodeTable[sample >> 7 & 255];
  mantissa = sample >> exponent + 3 & 15;
  muLawSample = ~(sign | exponent << 4 | mantissa);
  return muLawSample;
}
function decodeSample(muLawSample) {
  let sign;
  let exponent;
  let mantissa;
  let sample;
  muLawSample = ~muLawSample;
  sign = muLawSample & 128;
  exponent = muLawSample >> 4 & 7;
  mantissa = muLawSample & 15;
  sample = decodeTable[exponent] + (mantissa << exponent + 3);
  if (sign != 0) sample = -sample;
  return sample;
}
function encode(samples) {
  let muLawSamples = new Uint8Array(samples.length);
  for (let i = 0, len = samples.length; i < len; i++) {
    muLawSamples[i] = encodeSample(samples[i]);
  }
  return muLawSamples;
}
function decode(samples) {
  let pcmSamples = new Int16Array(samples.length);
  for (let i = 0, len = samples.length; i < len; i++) {
    pcmSamples[i] = decodeSample(samples[i]);
  }
  return pcmSamples;
}
function endianness(bytes, offset, start = 0, end = bytes.length) {
  for (let index = start; index < end; index += offset) {
    swap_(bytes, offset, index);
  }
}
function swap_(bytes, offset, index) {
  offset--;
  for (let x = 0; x < offset; x++) {
    let theByte = bytes[index + x];
    bytes[index + x] = bytes[index + offset];
    bytes[index + offset] = theByte;
    offset--;
  }
}
function unpack$1(buffer, start = 0, end = buffer.length) {
  let str = "";
  for (let index = start; index < end; ) {
    let lowerBoundary = 128;
    let upperBoundary = 191;
    let replace = false;
    let charCode = buffer[index++];
    if (charCode >= 0 && charCode <= 127) {
      str += String.fromCharCode(charCode);
    } else {
      let count = 0;
      if (charCode >= 194 && charCode <= 223) {
        count = 1;
      } else if (charCode >= 224 && charCode <= 239) {
        count = 2;
        if (buffer[index] === 224) {
          lowerBoundary = 160;
        }
        if (buffer[index] === 237) {
          upperBoundary = 159;
        }
      } else if (charCode >= 240 && charCode <= 244) {
        count = 3;
        if (buffer[index] === 240) {
          lowerBoundary = 144;
        }
        if (buffer[index] === 244) {
          upperBoundary = 143;
        }
      } else {
        replace = true;
      }
      charCode = charCode & (1 << 8 - count - 1) - 1;
      for (let i = 0; i < count; i++) {
        if (buffer[index] < lowerBoundary || buffer[index] > upperBoundary) {
          replace = true;
        }
        charCode = charCode << 6 | buffer[index] & 63;
        index++;
      }
      if (replace) {
        str += String.fromCharCode(65533);
      } else if (charCode <= 65535) {
        str += String.fromCharCode(charCode);
      } else {
        charCode -= 65536;
        str += String.fromCharCode(
          (charCode >> 10 & 1023) + 55296,
          (charCode & 1023) + 56320
        );
      }
    }
  }
  return str;
}
function pack$1(str, buffer, index = 0) {
  let i = 0;
  let len = str.length;
  while (i < len) {
    let codePoint = str.codePointAt(i);
    if (codePoint < 128) {
      buffer[index] = codePoint;
      index++;
    } else {
      let count = 0;
      let offset = 0;
      if (codePoint <= 2047) {
        count = 1;
        offset = 192;
      } else if (codePoint <= 65535) {
        count = 2;
        offset = 224;
      } else if (codePoint <= 1114111) {
        count = 3;
        offset = 240;
        i++;
      }
      buffer[index] = (codePoint >> 6 * count) + offset;
      index++;
      while (count > 0) {
        buffer[index] = 128 | codePoint >> 6 * (count - 1) & 63;
        index++;
        count--;
      }
    }
    i++;
  }
  return index;
}
class IntParser {
  /**
   * @param {number} bits The number of bits used by the integer.
   * @param {boolean} [signed=false] True for signed, false otherwise.
   */
  constructor(bits, signed = false) {
    this.bits = bits;
    this.offset = Math.ceil(bits / 8);
    this.max = Math.pow(2, bits) - 1;
    this.min = 0;
    this.unpack = this.unpack_;
    if (signed) {
      this.max = Math.pow(2, bits) / 2 - 1;
      this.min = -this.max - 1;
      this.unpack = this.unpackSigned_;
    }
  }
  /**
   * Write one unsigned integer to a byte buffer.
   * @param {!(Uint8Array|Array<number>)} buffer An array of bytes.
   * @param {number} num The number. Overflows are truncated.
   * @param {number} [index=0] The index being written in the byte buffer.
   * @return {number} The next index to write on the byte buffer.
   */
  pack(buffer, num, index = 0) {
    num = this.clamp_(Math.round(num));
    for (let i = 0, len = this.offset; i < len; i++) {
      buffer[index] = Math.floor(num / Math.pow(2, i * 8)) & 255;
      index++;
    }
    return index;
  }
  /**
   * Read one unsigned integer from a byte buffer.
   * Does not check for overflows.
   * @param {!(Uint8Array|Array<number>)} buffer An array of bytes.
   * @param {number} [index=0] The index to read.
   * @return {number}
   * @private
   */
  unpack_(buffer, index = 0) {
    let num = 0;
    for (let x = 0; x < this.offset; x++) {
      num += buffer[index + x] * Math.pow(256, x);
    }
    return num;
  }
  /**
   * Read one two's complement signed integer from a byte buffer.
   * @param {!(Uint8Array|Array<number>)} buffer An array of bytes.
   * @param {number} [index=0] The index to read.
   * @return {number}
   * @private
   */
  unpackSigned_(buffer, index = 0) {
    return this.sign_(this.unpack_(buffer, index));
  }
  /**
   * Clamp values on overflow.
   * @param {number} num The number.
   * @private
   */
  clamp_(num) {
    if (num > this.max) {
      return this.max;
    } else if (num < this.min) {
      return this.min;
    }
    return num;
  }
  /**
   * Sign a number.
   * @param {number} num The number.
   * @return {number}
   * @private
   */
  sign_(num) {
    if (num > this.max) {
      num -= this.max * 2 + 2;
    }
    return num;
  }
}
class FloatParser {
  /**
   * Pack a IEEE 754 floating point number.
   * @param {number} ebits The exponent bits.
   * @param {number} fbits The fraction bits.
   */
  constructor(ebits, fbits) {
    this.offset = Math.ceil((ebits + fbits) / 8);
    this.ebits = ebits;
    this.fbits = fbits;
    this.bias = (1 << ebits - 1) - 1;
    this.biasP2 = Math.pow(2, this.bias + 1);
    this.ebitsFbits = ebits + fbits;
    this.fbias = Math.pow(2, -(8 * this.offset - 1 - ebits));
  }
  /**
   * Pack a IEEE 754 floating point number.
   * @param {!Uint8Array|!Array<number>} buffer The buffer.
   * @param {number} num The number.
   * @param {number} index The index to write on the buffer.
   * @return {number} The next index to write on the buffer.
   */
  pack(buffer, num, index) {
    if (Math.abs(num) > this.biasP2 - this.ebitsFbits * 2) {
      num = num < 0 ? -Infinity : Infinity;
    }
    let sign = ((num = +num) || 1 / num) < 0 ? 1 : num < 0 ? 1 : 0;
    num = Math.abs(num);
    let exp = Math.min(Math.floor(Math.log(num) / Math.LN2), 1023);
    let fraction = roundToEven(num / Math.pow(2, exp) * Math.pow(2, this.fbits));
    if (num !== num) {
      fraction = Math.pow(2, this.fbits - 1);
      exp = (1 << this.ebits) - 1;
    } else if (num !== 0) {
      if (num >= Math.pow(2, 1 - this.bias)) {
        if (fraction / Math.pow(2, this.fbits) >= 2) {
          exp = exp + 1;
          fraction = 1;
        }
        if (exp > this.bias) {
          exp = (1 << this.ebits) - 1;
          fraction = 0;
        } else {
          exp = exp + this.bias;
          fraction = roundToEven(fraction) - Math.pow(2, this.fbits);
        }
      } else {
        fraction = roundToEven(num / Math.pow(2, 1 - this.bias - this.fbits));
        exp = 0;
      }
    }
    return this.packFloatBits_(buffer, index, sign, exp, fraction);
  }
  /**
   * Unpack a IEEE 754 floating point number.
   * Derived from IEEE754 by DeNA Co., Ltd., MIT License. 
   * Adapted to handle NaN. Should port the solution to the original repo.
   * @param {!Uint8Array|!Array<number>} buffer The buffer.
   * @param {number} index The index to read from the buffer.
   * @return {number} The floating point number.
   */
  unpack(buffer, index) {
    let eMax = (1 << this.ebits) - 1;
    let significand;
    let leftBits = "";
    for (let i = this.offset - 1; i >= 0; i--) {
      let t = buffer[i + index].toString(2);
      leftBits += "00000000".substring(t.length) + t;
    }
    let sign = leftBits.charAt(0) == "1" ? -1 : 1;
    leftBits = leftBits.substring(1);
    let exponent = parseInt(leftBits.substring(0, this.ebits), 2);
    leftBits = leftBits.substring(this.ebits);
    if (exponent == eMax) {
      if (parseInt(leftBits, 2) !== 0) {
        return NaN;
      }
      return sign * Infinity;
    } else if (exponent === 0) {
      exponent += 1;
      significand = parseInt(leftBits, 2);
    } else {
      significand = parseInt("1" + leftBits, 2);
    }
    return sign * significand * this.fbias * Math.pow(2, exponent - this.bias);
  }
  /**
   * Pack a IEEE754 from its sign, exponent and fraction bits
   * and place it in a byte buffer.
   * @param {!Uint8Array|!Array<number>} buffer The byte buffer to write to.
   * @param {number} index The buffer index to write.
   * @param {number} sign The sign.
   * @param {number} exp the exponent.
   * @param {number} fraction The fraction.
   * @return {number}
   * @private
   */
  packFloatBits_(buffer, index, sign, exp, fraction) {
    let bits = [];
    bits.push(sign);
    for (let i = this.ebits; i > 0; i -= 1) {
      bits[i] = exp % 2 ? 1 : 0;
      exp = Math.floor(exp / 2);
    }
    let len = bits.length;
    for (let i = this.fbits; i > 0; i -= 1) {
      bits[len + i] = fraction % 2 ? 1 : 0;
      fraction = Math.floor(fraction / 2);
    }
    let str = bits.join("");
    let offset = this.offset + index - 1;
    let k = index;
    while (offset >= index) {
      buffer[offset] = parseInt(str.substring(0, 8), 2);
      str = str.substring(8);
      offset--;
      k++;
    }
    return k;
  }
}
function roundToEven(n) {
  let w = Math.floor(n);
  let f = n - w;
  if (f < 0.5) {
    return w;
  }
  if (f > 0.5) {
    return w + 1;
  }
  return w % 2 ? w + 1 : w;
}
function unpackString(buffer, index = 0, end = buffer.length) {
  return unpack$1(buffer, index, end);
}
function packString(str) {
  let buffer = [];
  pack$1(str, buffer);
  return buffer;
}
function packStringTo(str, buffer, index = 0) {
  return pack$1(str, buffer, index);
}
function packArrayTo(values, theType, buffer, index = 0) {
  theType = theType || {};
  let packer = getParser_(theType.bits, theType.fp, theType.signed);
  let offset = Math.ceil(theType.bits / 8);
  let i = 0;
  let start = index;
  for (let valuesLen = values.length; i < valuesLen; i++) {
    index = packer.pack(buffer, values[i], index);
  }
  if (theType.be) {
    endianness(buffer, offset, start, index);
  }
  return index;
}
function unpackArrayTo(buffer, theType, output, start = 0, end = buffer.length) {
  theType = theType || {};
  let parser = getParser_(theType.bits, theType.fp, theType.signed);
  end = getUnpackLen_(buffer, start, end, parser.offset);
  if (theType.be) {
    let readBuffer = copyBuffer_(buffer);
    if (theType.be) {
      endianness(readBuffer, parser.offset, start, end);
    }
    unpack_(readBuffer, output, start, end, parser);
  } else {
    unpack_(buffer, output, start, end, parser);
  }
}
function packTo(value, theType, buffer, index = 0) {
  return packArrayTo([value], theType, buffer, index);
}
function pack(value, theType) {
  let output = [];
  packTo(value, theType, output, 0);
  return output;
}
function unpack(buffer, theType, index = 0) {
  let output = [];
  unpackArrayTo(
    buffer,
    theType,
    output,
    index,
    index + Math.ceil(theType.bits / 8)
  );
  return output[0];
}
function unpack_(buffer, output, start, end, parser) {
  let offset = parser.offset;
  for (let index = 0, j = start; j < end; j += offset, index++) {
    output[index] = parser.unpack(buffer, j);
  }
}
function copyBuffer_(buffer) {
  return new Uint8Array(buffer);
}
function getUnpackLen_(buffer, start, end, offset) {
  let extra = (end - start) % offset;
  return end - extra;
}
function getParser_(bits, fp, signed) {
  if (fp && bits == 32) {
    return new FloatParser(8, 23);
  } else if (fp && bits == 64) {
    return new FloatParser(11, 52);
  }
  return new IntParser(bits, signed);
}
class RIFFFile {
  constructor() {
    this.container = "";
    this.chunkSize = 0;
    this.format = "";
    this.signature = null;
    this.head = 0;
    this.uInt32 = { bits: 32, be: false };
    this.supported_containers = ["RIFF", "RIFX"];
  }
  /**
   * Read the signature of the chunks in a RIFF/RIFX file.
   * @param {!Uint8Array} buffer The file bytes.
   * @protected
   */
  setSignature(buffer) {
    this.head = 0;
    this.container = this.readString(buffer, 4);
    if (this.supported_containers.indexOf(this.container) === -1) {
      throw Error("Not a supported format.");
    }
    this.uInt32.be = this.container === "RIFX";
    this.chunkSize = this.readUInt32(buffer);
    this.format = this.readString(buffer, 4);
    this.signature = {
      chunkId: this.container,
      chunkSize: this.chunkSize,
      format: this.format,
      subChunks: this.getSubChunksIndex_(buffer)
    };
  }
  /**
    * Find a chunk by its fourCC_ in a array of RIFF chunks.
    * @param {string} chunkId The chunk fourCC_.
    * @param {boolean} [multiple=false] True if there may be multiple chunks
    *    with the same chunkId.
    * @return {Object}
    * @protected
    */
  findChunk(chunkId, multiple = false) {
    let chunks = this.signature.subChunks;
    let chunk = [];
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].chunkId == chunkId) {
        if (multiple) {
          chunk.push(chunks[i]);
        } else {
          return chunks[i];
        }
      }
    }
    if (chunkId == "LIST") {
      return chunk.length ? chunk : null;
    }
    return null;
  }
  /**
   * Read bytes as a string from a RIFF chunk.
   * @param {!Uint8Array} bytes The bytes.
   * @param {number} maxSize the max size of the string.
   * @return {string} The string.
   * @protected
   */
  readString(bytes, maxSize) {
    let str = "";
    str = unpackString(bytes, this.head, this.head + maxSize);
    this.head += maxSize;
    return str;
  }
  /**
   * Read a number from a chunk.
   * @param {!Uint8Array} bytes The chunk bytes.
   * @return {number} The number.
   * @protected
   */
  readUInt32(bytes) {
    let value = unpack(bytes, this.uInt32, this.head);
    this.head += 4;
    return value;
  }
  /**
   * Return the sub chunks of a RIFF file.
   * @param {!Uint8Array} buffer the RIFF file bytes.
   * @return {!Array<Object>} The subchunks of a RIFF/RIFX or LIST chunk.
   * @private
   */
  getSubChunksIndex_(buffer) {
    let chunks = [];
    let i = this.head;
    while (i <= buffer.length - 8) {
      chunks.push(this.getSubChunkIndex_(buffer, i));
      i += 8 + chunks[chunks.length - 1].chunkSize;
      i = i % 2 ? i + 1 : i;
    }
    return chunks;
  }
  /**
   * Return a sub chunk from a RIFF file.
   * @param {!Uint8Array} buffer the RIFF file bytes.
   * @param {number} index The start index of the chunk.
   * @return {!Object} A subchunk of a RIFF/RIFX or LIST chunk.
   * @private
   */
  getSubChunkIndex_(buffer, index) {
    let chunk = {
      chunkId: this.getChunkId_(buffer, index),
      chunkSize: this.getChunkSize_(buffer, index)
    };
    if (chunk.chunkId == "LIST") {
      chunk.format = unpackString(buffer, index + 8, index + 12);
      this.head += 4;
      chunk.subChunks = this.getSubChunksIndex_(buffer);
    } else {
      let realChunkSize = chunk.chunkSize % 2 ? chunk.chunkSize + 1 : chunk.chunkSize;
      this.head = index + 8 + realChunkSize;
      chunk.chunkData = {
        start: index + 8,
        end: this.head
      };
    }
    return chunk;
  }
  /**
   * Return the fourCC_ of a chunk.
   * @param {!Uint8Array} buffer the RIFF file bytes.
   * @param {number} index The start index of the chunk.
   * @return {string} The id of the chunk.
   * @private
   */
  getChunkId_(buffer, index) {
    this.head += 4;
    return unpackString(buffer, index, index + 4);
  }
  /**
   * Return the size of a chunk.
   * @param {!Uint8Array} buffer the RIFF file bytes.
   * @param {number} index The start index of the chunk.
   * @return {number} The size of the chunk without the id and size fields.
   * @private
   */
  getChunkSize_(buffer, index) {
    this.head += 4;
    return unpack(buffer, this.uInt32, index + 4);
  }
}
class WaveFileReader extends RIFFFile {
  constructor() {
    super();
    this.supported_containers.push("RF64");
    this.fmt = {
      /** @type {string} */
      chunkId: "",
      /** @type {number} */
      chunkSize: 0,
      /** @type {number} */
      audioFormat: 0,
      /** @type {number} */
      numChannels: 0,
      /** @type {number} */
      sampleRate: 0,
      /** @type {number} */
      byteRate: 0,
      /** @type {number} */
      blockAlign: 0,
      /** @type {number} */
      bitsPerSample: 0,
      /** @type {number} */
      cbSize: 0,
      /** @type {number} */
      validBitsPerSample: 0,
      /** @type {number} */
      dwChannelMask: 0,
      /**
       * 4 32-bit values representing a 128-bit ID
       * @type {!Array<number>}
       */
      subformat: []
    };
    this.fact = {
      /** @type {string} */
      chunkId: "",
      /** @type {number} */
      chunkSize: 0,
      /** @type {number} */
      dwSampleLength: 0
    };
    this.cue = {
      /** @type {string} */
      chunkId: "",
      /** @type {number} */
      chunkSize: 0,
      /** @type {number} */
      dwCuePoints: 0,
      /** @type {!Array<!Object>} */
      points: []
    };
    this.smpl = {
      /** @type {string} */
      chunkId: "",
      /** @type {number} */
      chunkSize: 0,
      /** @type {number} */
      dwManufacturer: 0,
      /** @type {number} */
      dwProduct: 0,
      /** @type {number} */
      dwSamplePeriod: 0,
      /** @type {number} */
      dwMIDIUnityNote: 0,
      /** @type {number} */
      dwMIDIPitchFraction: 0,
      /** @type {number} */
      dwSMPTEFormat: 0,
      /** @type {number} */
      dwSMPTEOffset: 0,
      /** @type {number} */
      dwNumSampleLoops: 0,
      /** @type {number} */
      dwSamplerData: 0,
      /** @type {!Array<!Object>} */
      loops: []
    };
    this.bext = {
      /** @type {string} */
      chunkId: "",
      /** @type {number} */
      chunkSize: 0,
      /** @type {string} */
      description: "",
      //256
      /** @type {string} */
      originator: "",
      //32
      /** @type {string} */
      originatorReference: "",
      //32
      /** @type {string} */
      originationDate: "",
      //10
      /** @type {string} */
      originationTime: "",
      //8
      /**
       * 2 32-bit values, timeReference high and low
       * @type {!Array<number>}
       */
      timeReference: [0, 0],
      /** @type {number} */
      version: 0,
      //WORD
      /** @type {string} */
      UMID: "",
      // 64 chars
      /** @type {number} */
      loudnessValue: 0,
      //WORD
      /** @type {number} */
      loudnessRange: 0,
      //WORD
      /** @type {number} */
      maxTruePeakLevel: 0,
      //WORD
      /** @type {number} */
      maxMomentaryLoudness: 0,
      //WORD
      /** @type {number} */
      maxShortTermLoudness: 0,
      //WORD
      /** @type {string} */
      reserved: "",
      //180
      /** @type {string} */
      codingHistory: ""
      // string, unlimited
    };
    this.iXML = {
      /** @type {string} */
      chunkId: "",
      /** @type {number} */
      chunkSize: 0,
      /** @type {string} */
      value: ""
    };
    this.ds64 = {
      /** @type {string} */
      chunkId: "",
      /** @type {number} */
      chunkSize: 0,
      /** @type {number} */
      riffSizeHigh: 0,
      // DWORD
      /** @type {number} */
      riffSizeLow: 0,
      // DWORD
      /** @type {number} */
      dataSizeHigh: 0,
      // DWORD
      /** @type {number} */
      dataSizeLow: 0,
      // DWORD
      /** @type {number} */
      originationTime: 0,
      // DWORD
      /** @type {number} */
      sampleCountHigh: 0,
      // DWORD
      /** @type {number} */
      sampleCountLow: 0
      // DWORD
      /** @type {number} */
      //'tableLength': 0, // DWORD
      /** @type {!Array<number>} */
      //'table': []
    };
    this.data = {
      /** @type {string} */
      chunkId: "",
      /** @type {number} */
      chunkSize: 0,
      /** @type {!Uint8Array} */
      samples: new Uint8Array(0)
    };
    this.LIST = [];
    this.junk = {
      /** @type {string} */
      chunkId: "",
      /** @type {number} */
      chunkSize: 0,
      /** @type {!Array<number>} */
      chunkData: []
    };
    this._PMX = {
      /** @type {string} */
      chunkId: "",
      /** @type {number} */
      chunkSize: 0,
      /** @type {string} */
      value: ""
    };
    this.uInt16 = { bits: 16, be: false, signed: false, fp: false };
  }
  /**
   * Set up the WaveFileReader object from a byte buffer.
   * @param {!Uint8Array} wavBuffer The buffer.
   * @param {boolean=} [samples=true] True if the samples should be loaded.
   * @throws {Error} If container is not RIFF, RIFX or RF64.
   * @throws {Error} If format is not WAVE.
   * @throws {Error} If no 'fmt ' chunk is found.
   * @throws {Error} If no 'data' chunk is found.
   */
  fromBuffer(wavBuffer, samples = true) {
    this.clearHeaders();
    this.setSignature(wavBuffer);
    this.uInt16.be = this.uInt32.be;
    if (this.format != "WAVE") {
      throw Error('Could not find the "WAVE" format identifier');
    }
    this.readDs64Chunk_(wavBuffer);
    this.readFmtChunk_(wavBuffer);
    this.readFactChunk_(wavBuffer);
    this.readBextChunk_(wavBuffer);
    this.readiXMLChunk_(wavBuffer);
    this.readCueChunk_(wavBuffer);
    this.readSmplChunk_(wavBuffer);
    this.readDataChunk_(wavBuffer, samples);
    this.readJunkChunk_(wavBuffer);
    this.readLISTChunk_(wavBuffer);
    this.read_PMXChunk_(wavBuffer);
  }
  /**
   * Reset the chunks of the WaveFileReader instance.
   * @protected
   * @ignore
   */
  clearHeaders() {
    let tmpWav = new WaveFileReader();
    Object.assign(this.fmt, tmpWav.fmt);
    Object.assign(this.fact, tmpWav.fact);
    Object.assign(this.cue, tmpWav.cue);
    Object.assign(this.smpl, tmpWav.smpl);
    Object.assign(this.bext, tmpWav.bext);
    Object.assign(this.iXML, tmpWav.iXML);
    Object.assign(this.ds64, tmpWav.ds64);
    Object.assign(this.data, tmpWav.data);
    this.LIST = [];
    Object.assign(this.junk, tmpWav.junk);
    Object.assign(this._PMX, tmpWav._PMX);
  }
  /**
   * Read the 'fmt ' chunk of a wave file.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @throws {Error} If no 'fmt ' chunk is found.
   * @private
   */
  readFmtChunk_(buffer) {
    let chunk = this.findChunk("fmt ");
    if (chunk) {
      this.head = chunk.chunkData.start;
      this.fmt.chunkId = chunk.chunkId;
      this.fmt.chunkSize = chunk.chunkSize;
      this.fmt.audioFormat = this.readUInt16_(buffer);
      this.fmt.numChannels = this.readUInt16_(buffer);
      this.fmt.sampleRate = this.readUInt32(buffer);
      this.fmt.byteRate = this.readUInt32(buffer);
      this.fmt.blockAlign = this.readUInt16_(buffer);
      this.fmt.bitsPerSample = this.readUInt16_(buffer);
      this.readFmtExtension_(buffer);
    } else {
      throw Error('Could not find the "fmt " chunk');
    }
  }
  /**
   * Read the 'fmt ' chunk extension.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @private
   */
  readFmtExtension_(buffer) {
    if (this.fmt.chunkSize > 16) {
      this.fmt.cbSize = this.readUInt16_(buffer);
      if (this.fmt.chunkSize > 18) {
        this.fmt.validBitsPerSample = this.readUInt16_(buffer);
        if (this.fmt.chunkSize > 20) {
          this.fmt.dwChannelMask = this.readUInt32(buffer);
          this.fmt.subformat = [
            this.readUInt32(buffer),
            this.readUInt32(buffer),
            this.readUInt32(buffer),
            this.readUInt32(buffer)
          ];
        }
      }
    }
  }
  /**
   * Read the 'fact' chunk of a wav file.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @private
   */
  readFactChunk_(buffer) {
    let chunk = this.findChunk("fact");
    if (chunk) {
      this.head = chunk.chunkData.start;
      this.fact.chunkId = chunk.chunkId;
      this.fact.chunkSize = chunk.chunkSize;
      this.fact.dwSampleLength = this.readUInt32(buffer);
    }
  }
  /**
   * Read the 'cue ' chunk of a wave file.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @private
   */
  readCueChunk_(buffer) {
    let chunk = this.findChunk("cue ");
    if (chunk) {
      this.head = chunk.chunkData.start;
      this.cue.chunkId = chunk.chunkId;
      this.cue.chunkSize = chunk.chunkSize;
      this.cue.dwCuePoints = this.readUInt32(buffer);
      for (let i = 0; i < this.cue.dwCuePoints; i++) {
        this.cue.points.push({
          dwName: this.readUInt32(buffer),
          dwPosition: this.readUInt32(buffer),
          fccChunk: this.readString(buffer, 4),
          dwChunkStart: this.readUInt32(buffer),
          dwBlockStart: this.readUInt32(buffer),
          dwSampleOffset: this.readUInt32(buffer)
        });
      }
    }
  }
  /**
   * Read the 'smpl' chunk of a wave file.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @private
   */
  readSmplChunk_(buffer) {
    let chunk = this.findChunk("smpl");
    if (chunk) {
      this.head = chunk.chunkData.start;
      this.smpl.chunkId = chunk.chunkId;
      this.smpl.chunkSize = chunk.chunkSize;
      this.smpl.dwManufacturer = this.readUInt32(buffer);
      this.smpl.dwProduct = this.readUInt32(buffer);
      this.smpl.dwSamplePeriod = this.readUInt32(buffer);
      this.smpl.dwMIDIUnityNote = this.readUInt32(buffer);
      this.smpl.dwMIDIPitchFraction = this.readUInt32(buffer);
      this.smpl.dwSMPTEFormat = this.readUInt32(buffer);
      this.smpl.dwSMPTEOffset = this.readUInt32(buffer);
      this.smpl.dwNumSampleLoops = this.readUInt32(buffer);
      this.smpl.dwSamplerData = this.readUInt32(buffer);
      for (let i = 0; i < this.smpl.dwNumSampleLoops; i++) {
        this.smpl.loops.push({
          dwName: this.readUInt32(buffer),
          dwType: this.readUInt32(buffer),
          dwStart: this.readUInt32(buffer),
          dwEnd: this.readUInt32(buffer),
          dwFraction: this.readUInt32(buffer),
          dwPlayCount: this.readUInt32(buffer)
        });
      }
    }
  }
  /**
   * Read the 'data' chunk of a wave file.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @param {boolean} samples True if the samples should be loaded.
   * @throws {Error} If no 'data' chunk is found.
   * @private
   */
  readDataChunk_(buffer, samples) {
    let chunk = this.findChunk("data");
    if (chunk) {
      this.data.chunkId = "data";
      this.data.chunkSize = chunk.chunkSize;
      if (samples) {
        this.data.samples = buffer.slice(
          chunk.chunkData.start,
          chunk.chunkData.end
        );
      }
    } else {
      throw Error('Could not find the "data" chunk');
    }
  }
  /**
   * Read the 'bext' chunk of a wav file.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @private
   */
  readBextChunk_(buffer) {
    let chunk = this.findChunk("bext");
    if (chunk) {
      this.head = chunk.chunkData.start;
      this.bext.chunkId = chunk.chunkId;
      this.bext.chunkSize = chunk.chunkSize;
      this.bext.description = this.readString(buffer, 256);
      this.bext.originator = this.readString(buffer, 32);
      this.bext.originatorReference = this.readString(buffer, 32);
      this.bext.originationDate = this.readString(buffer, 10);
      this.bext.originationTime = this.readString(buffer, 8);
      this.bext.timeReference = [
        this.readUInt32(buffer),
        this.readUInt32(buffer)
      ];
      this.bext.version = this.readUInt16_(buffer);
      this.bext.UMID = this.readString(buffer, 64);
      this.bext.loudnessValue = this.readUInt16_(buffer);
      this.bext.loudnessRange = this.readUInt16_(buffer);
      this.bext.maxTruePeakLevel = this.readUInt16_(buffer);
      this.bext.maxMomentaryLoudness = this.readUInt16_(buffer);
      this.bext.maxShortTermLoudness = this.readUInt16_(buffer);
      this.bext.reserved = this.readString(buffer, 180);
      this.bext.codingHistory = this.readString(
        buffer,
        this.bext.chunkSize - 602
      );
    }
  }
  /**
   * Read the 'iXML' chunk of a wav file.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @private
   */
  readiXMLChunk_(buffer) {
    let chunk = this.findChunk("iXML");
    if (chunk) {
      this.head = chunk.chunkData.start;
      this.iXML.chunkId = chunk.chunkId;
      this.iXML.chunkSize = chunk.chunkSize;
      this.iXML.value = unpackString(
        buffer,
        this.head,
        this.head + this.iXML.chunkSize
      );
    }
  }
  /**
   * Read the 'ds64' chunk of a wave file.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @throws {Error} If no 'ds64' chunk is found and the file is RF64.
   * @private
   */
  readDs64Chunk_(buffer) {
    let chunk = this.findChunk("ds64");
    if (chunk) {
      this.head = chunk.chunkData.start;
      this.ds64.chunkId = chunk.chunkId;
      this.ds64.chunkSize = chunk.chunkSize;
      this.ds64.riffSizeHigh = this.readUInt32(buffer);
      this.ds64.riffSizeLow = this.readUInt32(buffer);
      this.ds64.dataSizeHigh = this.readUInt32(buffer);
      this.ds64.dataSizeLow = this.readUInt32(buffer);
      this.ds64.originationTime = this.readUInt32(buffer);
      this.ds64.sampleCountHigh = this.readUInt32(buffer);
      this.ds64.sampleCountLow = this.readUInt32(buffer);
    } else {
      if (this.container == "RF64") {
        throw Error('Could not find the "ds64" chunk');
      }
    }
  }
  /**
   * Read the 'LIST' chunks of a wave file.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @private
   */
  readLISTChunk_(buffer) {
    let listChunks = this.findChunk("LIST", true);
    if (listChunks !== null) {
      for (let j = 0; j < listChunks.length; j++) {
        let subChunk = listChunks[j];
        this.LIST.push({
          chunkId: subChunk.chunkId,
          chunkSize: subChunk.chunkSize,
          format: subChunk.format,
          subChunks: []
        });
        for (let x = 0; x < subChunk.subChunks.length; x++) {
          this.readLISTSubChunks_(
            subChunk.subChunks[x],
            subChunk.format,
            buffer
          );
        }
      }
    }
  }
  /**
   * Read the sub chunks of a 'LIST' chunk.
   * @param {!Object} subChunk The 'LIST' subchunks.
   * @param {string} format The 'LIST' format, 'adtl' or 'INFO'.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @private
   */
  readLISTSubChunks_(subChunk, format, buffer) {
    if (format == "adtl") {
      if (["labl", "note", "ltxt"].indexOf(subChunk.chunkId) > -1) {
        this.readLISTadtlSubChunks_(buffer, subChunk);
      }
    } else if (format == "INFO") {
      this.readLISTINFOSubChunks_(buffer, subChunk);
    }
  }
  /**
   * Read the sub chunks of a 'LIST' chunk of type 'adtl'.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @param {!Object} subChunk The 'LIST' subchunks.
   * @private
   */
  readLISTadtlSubChunks_(buffer, subChunk) {
    this.head = subChunk.chunkData.start;
    let item = {
      chunkId: subChunk.chunkId,
      chunkSize: subChunk.chunkSize,
      dwName: this.readUInt32(buffer)
    };
    if (subChunk.chunkId == "ltxt") {
      item.dwSampleLength = this.readUInt32(buffer);
      item.dwPurposeID = this.readUInt32(buffer);
      item.dwCountry = this.readUInt16_(buffer);
      item.dwLanguage = this.readUInt16_(buffer);
      item.dwDialect = this.readUInt16_(buffer);
      item.dwCodePage = this.readUInt16_(buffer);
      item.value = "";
    } else {
      item.value = this.readZSTR_(buffer, this.head);
    }
    this.LIST[this.LIST.length - 1].subChunks.push(item);
  }
  /**
   * Read the sub chunks of a 'LIST' chunk of type 'INFO'.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @param {!Object} subChunk The 'LIST' subchunks.
   * @private
   */
  readLISTINFOSubChunks_(buffer, subChunk) {
    this.head = subChunk.chunkData.start;
    this.LIST[this.LIST.length - 1].subChunks.push({
      chunkId: subChunk.chunkId,
      chunkSize: subChunk.chunkSize,
      value: this.readZSTR_(buffer, this.head)
    });
  }
  /**
   * Read the 'junk' chunk of a wave file.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @private
   */
  readJunkChunk_(buffer) {
    let chunk = this.findChunk("junk");
    if (chunk) {
      this.junk = {
        chunkId: chunk.chunkId,
        chunkSize: chunk.chunkSize,
        chunkData: [].slice.call(buffer.slice(
          chunk.chunkData.start,
          chunk.chunkData.end
        ))
      };
    }
  }
  /**
   * Read the '_PMX' chunk of a wav file.
   * @param {!Uint8Array} buffer The wav file buffer.
   * @private
   */
  read_PMXChunk_(buffer) {
    let chunk = this.findChunk("_PMX");
    if (chunk) {
      this.head = chunk.chunkData.start;
      this._PMX.chunkId = chunk.chunkId;
      this._PMX.chunkSize = chunk.chunkSize;
      this._PMX.value = unpackString(
        buffer,
        this.head,
        this.head + this._PMX.chunkSize
      );
    }
  }
  /**
   * Read bytes as a ZSTR string.
   * @param {!Uint8Array} bytes The bytes.
   * @param {number=} [index=0] the index to start reading.
   * @return {string} The string.
   * @private
   */
  readZSTR_(bytes, index = 0) {
    for (let i = index; i < bytes.length; i++) {
      this.head++;
      if (bytes[i] === 0) {
        break;
      }
    }
    return unpackString(bytes, index, this.head - 1);
  }
  /**
   * Read a number from a chunk.
   * @param {!Uint8Array} bytes The chunk bytes.
   * @return {number} The number.
   * @private
   */
  readUInt16_(bytes) {
    let value = unpack(bytes, this.uInt16, this.head);
    this.head += 2;
    return value;
  }
}
function writeString(str, byteLength) {
  let packedString = packString(str);
  for (let i = packedString.length; i < byteLength; i++) {
    packedString.push(0);
  }
  return packedString;
}
class WaveFileParser extends WaveFileReader {
  /**
   * Return a byte buffer representig the WaveFileParser object as a .wav file.
   * The return value of this method can be written straight to disk.
   * @return {!Uint8Array} A wav file.
   */
  toBuffer() {
    this.uInt16.be = this.container === "RIFX";
    this.uInt32.be = this.uInt16.be;
    let fileBody = [
      this.getJunkBytes_(),
      this.getDs64Bytes_(),
      this.getBextBytes_(),
      this.getiXMLBytes_(),
      this.getFmtBytes_(),
      this.getFactBytes_(),
      packString(this.data.chunkId),
      pack(this.data.samples.length, this.uInt32),
      this.data.samples,
      this.getCueBytes_(),
      this.getSmplBytes_(),
      this.getLISTBytes_(),
      this.get_PMXBytes_()
    ];
    let fileBodyLength = 0;
    for (let i = 0; i < fileBody.length; i++) {
      fileBodyLength += fileBody[i].length;
    }
    let file = new Uint8Array(fileBodyLength + 12);
    let index = 0;
    index = packStringTo(this.container, file, index);
    index = packTo(fileBodyLength + 4, this.uInt32, file, index);
    index = packStringTo(this.format, file, index);
    for (let i = 0; i < fileBody.length; i++) {
      file.set(fileBody[i], index);
      index += fileBody[i].length;
    }
    return file;
  }
  /**
   * Return the bytes of the 'bext' chunk.
   * @private
   */
  getBextBytes_() {
    let bytes = [];
    this.enforceBext_();
    if (this.bext.chunkId) {
      this.bext.chunkSize = 602 + this.bext.codingHistory.length;
      bytes = bytes.concat(
        packString(this.bext.chunkId),
        pack(602 + this.bext.codingHistory.length, this.uInt32),
        writeString(this.bext.description, 256),
        writeString(this.bext.originator, 32),
        writeString(this.bext.originatorReference, 32),
        writeString(this.bext.originationDate, 10),
        writeString(this.bext.originationTime, 8),
        pack(this.bext.timeReference[0], this.uInt32),
        pack(this.bext.timeReference[1], this.uInt32),
        pack(this.bext.version, this.uInt16),
        writeString(this.bext.UMID, 64),
        pack(this.bext.loudnessValue, this.uInt16),
        pack(this.bext.loudnessRange, this.uInt16),
        pack(this.bext.maxTruePeakLevel, this.uInt16),
        pack(this.bext.maxMomentaryLoudness, this.uInt16),
        pack(this.bext.maxShortTermLoudness, this.uInt16),
        writeString(this.bext.reserved, 180),
        writeString(
          this.bext.codingHistory,
          this.bext.codingHistory.length
        )
      );
    }
    this.enforceByteLen_(bytes);
    return bytes;
  }
  /**
   * Make sure a 'bext' chunk is created if BWF data was created in a file.
   * @private
   */
  enforceBext_() {
    for (let prop in this.bext) {
      if (this.bext.hasOwnProperty(prop)) {
        if (this.bext[prop] && prop != "timeReference") {
          this.bext.chunkId = "bext";
          break;
        }
      }
    }
    if (this.bext.timeReference[0] || this.bext.timeReference[1]) {
      this.bext.chunkId = "bext";
    }
  }
  /**
   * Return the bytes of the 'iXML' chunk.
   * @return {!Array<number>} The 'iXML' chunk bytes.
   * @private
   */
  getiXMLBytes_() {
    let bytes = [];
    if (this.iXML.chunkId) {
      let iXMLPackedValue = packString(this.iXML.value);
      this.iXML.chunkSize = iXMLPackedValue.length;
      bytes = bytes.concat(
        packString(this.iXML.chunkId),
        pack(this.iXML.chunkSize, this.uInt32),
        iXMLPackedValue
      );
    }
    this.enforceByteLen_(bytes);
    return bytes;
  }
  /**
   * Return the bytes of the 'ds64' chunk.
   * @return {!Array<number>} The 'ds64' chunk bytes.
   * @private
   */
  getDs64Bytes_() {
    let bytes = [];
    if (this.ds64.chunkId) {
      bytes = bytes.concat(
        packString(this.ds64.chunkId),
        pack(this.ds64.chunkSize, this.uInt32),
        pack(this.ds64.riffSizeHigh, this.uInt32),
        pack(this.ds64.riffSizeLow, this.uInt32),
        pack(this.ds64.dataSizeHigh, this.uInt32),
        pack(this.ds64.dataSizeLow, this.uInt32),
        pack(this.ds64.originationTime, this.uInt32),
        pack(this.ds64.sampleCountHigh, this.uInt32),
        pack(this.ds64.sampleCountLow, this.uInt32)
      );
    }
    this.enforceByteLen_(bytes);
    return bytes;
  }
  /**
   * Return the bytes of the 'cue ' chunk.
   * @return {!Array<number>} The 'cue ' chunk bytes.
   * @private
   */
  getCueBytes_() {
    let bytes = [];
    if (this.cue.chunkId) {
      let cuePointsBytes = this.getCuePointsBytes_();
      bytes = bytes.concat(
        packString(this.cue.chunkId),
        pack(cuePointsBytes.length + 4, this.uInt32),
        // chunkSize
        pack(this.cue.dwCuePoints, this.uInt32),
        cuePointsBytes
      );
    }
    this.enforceByteLen_(bytes);
    return bytes;
  }
  /**
   * Return the bytes of the 'cue ' points.
   * @return {!Array<number>} The 'cue ' points as an array of bytes.
   * @private
   */
  getCuePointsBytes_() {
    let points = [];
    for (let i = 0; i < this.cue.dwCuePoints; i++) {
      points = points.concat(
        pack(this.cue.points[i].dwName, this.uInt32),
        pack(this.cue.points[i].dwPosition, this.uInt32),
        packString(this.cue.points[i].fccChunk),
        pack(this.cue.points[i].dwChunkStart, this.uInt32),
        pack(this.cue.points[i].dwBlockStart, this.uInt32),
        pack(this.cue.points[i].dwSampleOffset, this.uInt32)
      );
    }
    return points;
  }
  /**
   * Return the bytes of the 'smpl' chunk.
   * @return {!Array<number>} The 'smpl' chunk bytes.
   * @private
   */
  getSmplBytes_() {
    let bytes = [];
    if (this.smpl.chunkId) {
      let smplLoopsBytes = this.getSmplLoopsBytes_();
      bytes = bytes.concat(
        packString(this.smpl.chunkId),
        pack(smplLoopsBytes.length + 36, this.uInt32),
        //chunkSize
        pack(this.smpl.dwManufacturer, this.uInt32),
        pack(this.smpl.dwProduct, this.uInt32),
        pack(this.smpl.dwSamplePeriod, this.uInt32),
        pack(this.smpl.dwMIDIUnityNote, this.uInt32),
        pack(this.smpl.dwMIDIPitchFraction, this.uInt32),
        pack(this.smpl.dwSMPTEFormat, this.uInt32),
        pack(this.smpl.dwSMPTEOffset, this.uInt32),
        pack(this.smpl.dwNumSampleLoops, this.uInt32),
        pack(this.smpl.dwSamplerData, this.uInt32),
        smplLoopsBytes
      );
    }
    this.enforceByteLen_(bytes);
    return bytes;
  }
  /**
   * Return the bytes of the 'smpl' loops.
   * @return {!Array<number>} The 'smpl' loops as an array of bytes.
   * @private
   */
  getSmplLoopsBytes_() {
    let loops = [];
    for (let i = 0; i < this.smpl.dwNumSampleLoops; i++) {
      loops = loops.concat(
        pack(this.smpl.loops[i].dwName, this.uInt32),
        pack(this.smpl.loops[i].dwType, this.uInt32),
        pack(this.smpl.loops[i].dwStart, this.uInt32),
        pack(this.smpl.loops[i].dwEnd, this.uInt32),
        pack(this.smpl.loops[i].dwFraction, this.uInt32),
        pack(this.smpl.loops[i].dwPlayCount, this.uInt32)
      );
    }
    return loops;
  }
  /**
   * Return the bytes of the 'fact' chunk.
   * @return {!Array<number>} The 'fact' chunk bytes.
   * @private
   */
  getFactBytes_() {
    let bytes = [];
    if (this.fact.chunkId) {
      bytes = bytes.concat(
        packString(this.fact.chunkId),
        pack(this.fact.chunkSize, this.uInt32),
        pack(this.fact.dwSampleLength, this.uInt32)
      );
    }
    this.enforceByteLen_(bytes);
    return bytes;
  }
  /**
   * Return the bytes of the 'fmt ' chunk.
   * @return {!Array<number>} The 'fmt' chunk bytes.
   * @throws {Error} if no 'fmt ' chunk is present.
   * @private
   */
  getFmtBytes_() {
    let fmtBytes = [];
    if (this.fmt.chunkId) {
      let bytes = fmtBytes.concat(
        packString(this.fmt.chunkId),
        pack(this.fmt.chunkSize, this.uInt32),
        pack(this.fmt.audioFormat, this.uInt16),
        pack(this.fmt.numChannels, this.uInt16),
        pack(this.fmt.sampleRate, this.uInt32),
        pack(this.fmt.byteRate, this.uInt32),
        pack(this.fmt.blockAlign, this.uInt16),
        pack(this.fmt.bitsPerSample, this.uInt16),
        this.getFmtExtensionBytes_()
      );
      this.enforceByteLen_(bytes);
      return bytes;
    }
    throw Error('Could not find the "fmt " chunk');
  }
  /**
   * Return the bytes of the fmt extension fields.
   * @return {!Array<number>} The fmt extension bytes.
   * @private
   */
  getFmtExtensionBytes_() {
    let extension = [];
    if (this.fmt.chunkSize > 16) {
      extension = extension.concat(
        pack(this.fmt.cbSize, this.uInt16)
      );
    }
    if (this.fmt.chunkSize > 18) {
      extension = extension.concat(
        pack(this.fmt.validBitsPerSample, this.uInt16)
      );
    }
    if (this.fmt.chunkSize > 20) {
      extension = extension.concat(
        pack(this.fmt.dwChannelMask, this.uInt32)
      );
    }
    if (this.fmt.chunkSize > 24) {
      extension = extension.concat(
        pack(this.fmt.subformat[0], this.uInt32),
        pack(this.fmt.subformat[1], this.uInt32),
        pack(this.fmt.subformat[2], this.uInt32),
        pack(this.fmt.subformat[3], this.uInt32)
      );
    }
    return extension;
  }
  /**
   * Return the bytes of the 'LIST' chunk.
   * @return {!Array<number>} The 'LIST' chunk bytes.
   * @private
   */
  getLISTBytes_() {
    let bytes = [];
    for (let i = 0; i < this.LIST.length; i++) {
      let subChunksBytes = this.getLISTSubChunksBytes_(
        this.LIST[i].subChunks,
        this.LIST[i].format
      );
      bytes = bytes.concat(
        packString(this.LIST[i].chunkId),
        pack(subChunksBytes.length + 4, this.uInt32),
        //chunkSize
        packString(this.LIST[i].format),
        subChunksBytes
      );
    }
    this.enforceByteLen_(bytes);
    return bytes;
  }
  /**
   * Return the bytes of the sub chunks of a 'LIST' chunk.
   * @param {!Array<!Object>} subChunks The 'LIST' sub chunks.
   * @param {string} format The format of the 'LIST' chunk.
   *    Currently supported values are 'adtl' or 'INFO'.
   * @return {!Array<number>} The sub chunk bytes.
   * @private
   */
  getLISTSubChunksBytes_(subChunks, format) {
    let bytes = [];
    for (let i = 0, len = subChunks.length; i < len; i++) {
      if (format == "INFO") {
        bytes = bytes.concat(this.getLISTINFOSubChunksBytes_(subChunks[i]));
      } else if (format == "adtl") {
        bytes = bytes.concat(this.getLISTadtlSubChunksBytes_(subChunks[i]));
      }
      this.enforceByteLen_(bytes);
    }
    return bytes;
  }
  /**
   * Return the bytes of the sub chunks of a 'LIST' chunk of type 'INFO'.
   * @param {!Object} subChunk The 'LIST' sub chunk.
   * @return {!Array<number>}
   * @private
   */
  getLISTINFOSubChunksBytes_(subChunk) {
    let bytes = [];
    let LISTsubChunkValue = writeString(
      subChunk.value,
      subChunk.value.length
    );
    bytes = bytes.concat(
      packString(subChunk.chunkId),
      pack(LISTsubChunkValue.length + 1, this.uInt32),
      //chunkSize
      LISTsubChunkValue
    );
    bytes.push(0);
    return bytes;
  }
  /**
   * Return the bytes of the sub chunks of a 'LIST' chunk of type 'INFO'.
   * @param {!Object} subChunk The 'LIST' sub chunk.
   * @return {!Array<number>}
   * @private
   */
  getLISTadtlSubChunksBytes_(subChunk) {
    let bytes = [];
    if (["labl", "note"].indexOf(subChunk.chunkId) > -1) {
      let LISTsubChunkValue = writeString(
        subChunk.value,
        subChunk.value.length
      );
      bytes = bytes.concat(
        packString(subChunk.chunkId),
        pack(LISTsubChunkValue.length + 4 + 1, this.uInt32),
        //chunkSize
        pack(subChunk.dwName, this.uInt32),
        LISTsubChunkValue
      );
      bytes.push(0);
    } else if (subChunk.chunkId == "ltxt") {
      bytes = bytes.concat(
        this.getLtxtChunkBytes_(subChunk)
      );
    }
    return bytes;
  }
  /**
   * Return the bytes of a 'ltxt' chunk.
   * @param {!Object} ltxt the 'ltxt' chunk.
   * @return {!Array<number>}
   * @private
   */
  getLtxtChunkBytes_(ltxt) {
    return [].concat(
      packString(ltxt.chunkId),
      pack(ltxt.value.length + 20, this.uInt32),
      pack(ltxt.dwName, this.uInt32),
      pack(ltxt.dwSampleLength, this.uInt32),
      pack(ltxt.dwPurposeID, this.uInt32),
      pack(ltxt.dwCountry, this.uInt16),
      pack(ltxt.dwLanguage, this.uInt16),
      pack(ltxt.dwDialect, this.uInt16),
      pack(ltxt.dwCodePage, this.uInt16),
      // should always be a empty string;
      // kept for compatibility
      writeString(ltxt.value, ltxt.value.length)
    );
  }
  /**
   * Return the bytes of the '_PMX' chunk.
   * @return {!Array<number>} The '_PMX' chunk bytes.
   * @private
   */
  get_PMXBytes_() {
    let bytes = [];
    if (this._PMX.chunkId) {
      let _PMXPackedValue = packString(this._PMX.value);
      this._PMX.chunkSize = _PMXPackedValue.length;
      bytes = bytes.concat(
        packString(this._PMX.chunkId),
        pack(this._PMX.chunkSize, this.uInt32),
        _PMXPackedValue
      );
    }
    this.enforceByteLen_(bytes);
    return bytes;
  }
  /**
   * Return the bytes of the 'junk' chunk.
   * @private
   */
  getJunkBytes_() {
    let bytes = [];
    if (this.junk.chunkId) {
      return bytes.concat(
        packString(this.junk.chunkId),
        pack(this.junk.chunkData.length, this.uInt32),
        //chunkSize
        this.junk.chunkData
      );
    }
    this.enforceByteLen_(bytes);
    return bytes;
  }
  /**
   * Push a null byte into a byte array if
   * the byte count is odd.
   * @param {!Array<number>} bytes The byte array.
   * @private
   */
  enforceByteLen_(bytes) {
    if (bytes.length % 2) {
      bytes.push(0);
    }
  }
}
function interleave(samples) {
  let finalSamples = [];
  if (samples.length > 0) {
    if (samples[0].constructor !== Number) {
      finalSamples = new Float64Array(samples[0].length * samples.length);
      for (let i = 0, len = samples[0].length, x = 0; i < len; i++) {
        for (let j = 0, subLen = samples.length; j < subLen; j++, x++) {
          finalSamples[x] = samples[j][i];
        }
      }
    } else {
      finalSamples = samples;
    }
  }
  return finalSamples;
}
function deInterleave(samples, numChannels, OutputObject = Float64Array) {
  let finalSamples = [];
  for (let i = 0; i < numChannels; i++) {
    finalSamples[i] = new OutputObject(samples.length / numChannels);
  }
  for (let i = 0; i < numChannels; i++) {
    for (let j = i, s = 0; j < samples.length; j += numChannels, s++) {
      finalSamples[i][s] = samples[j];
    }
  }
  return finalSamples;
}
function validateNumChannels(channels, bits) {
  let blockAlign = channels * bits / 8;
  if (channels < 1 || blockAlign > 65535) {
    return false;
  }
  return true;
}
function validateSampleRate(channels, bits, sampleRate) {
  let byteRate = channels * (bits / 8) * sampleRate;
  if (sampleRate < 1 || byteRate > 4294967295) {
    return false;
  }
  return true;
}
class WaveFileCreator extends WaveFileParser {
  constructor() {
    super();
    this.bitDepth = "0";
    this.dataType = { bits: 0, be: false };
    this.WAV_AUDIO_FORMATS = {
      "4": 17,
      "8": 1,
      "8a": 6,
      "8m": 7,
      "16": 1,
      "24": 1,
      "32": 1,
      "32f": 3,
      "64": 3
    };
  }
  /**
   * Set up the WaveFileCreator object based on the arguments passed.
   * Existing chunks are reset.
   * @param {number} numChannels The number of channels.
   * @param {number} sampleRate The sample rate.
   *    Integers like 8000, 44100, 48000, 96000, 192000.
   * @param {string} bitDepthCode The audio bit depth code.
   *    One of '4', '8', '8a', '8m', '16', '24', '32', '32f', '64'
   *    or any value between '8' and '32' (like '12').
   * @param {!(Array|TypedArray)} samples The samples.
   * @param {Object=} options Optional. Used to force the container
   *    as RIFX with {'container': 'RIFX'}
   * @throws {Error} If any argument does not meet the criteria.
   */
  fromScratch(numChannels, sampleRate, bitDepthCode, samples, options) {
    options = options || {};
    this.clearHeaders();
    this.newWavFile_(numChannels, sampleRate, bitDepthCode, samples, options);
  }
  /**
   * Set up the WaveFileParser object from a byte buffer.
   * @param {!Uint8Array} wavBuffer The buffer.
   * @param {boolean=} [samples=true] True if the samples should be loaded.
   * @throws {Error} If container is not RIFF, RIFX or RF64.
   * @throws {Error} If format is not WAVE.
   * @throws {Error} If no 'fmt ' chunk is found.
   * @throws {Error} If no 'data' chunk is found.
   */
  fromBuffer(wavBuffer, samples = true) {
    super.fromBuffer(wavBuffer, samples);
    this.bitDepthFromFmt_();
    this.updateDataType_();
  }
  /**
   * Return a byte buffer representig the WaveFileParser object as a .wav file.
   * The return value of this method can be written straight to disk.
   * @return {!Uint8Array} A wav file.
   * @throws {Error} If bit depth is invalid.
   * @throws {Error} If the number of channels is invalid.
   * @throws {Error} If the sample rate is invalid.
   */
  toBuffer() {
    this.validateWavHeader_();
    return super.toBuffer();
  }
  /**
   * Return the samples packed in a Float64Array.
   * @param {boolean=} [interleaved=false] True to return interleaved samples,
   *   false to return the samples de-interleaved.
   * @param {Function=} [OutputObject=Float64Array] The sample container.
   * @return {!(Array|TypedArray)} the samples.
   */
  getSamples(interleaved = false, OutputObject = Float64Array) {
    let samples = new OutputObject(
      this.data.samples.length / (this.dataType.bits / 8)
    );
    unpackArrayTo(
      this.data.samples,
      this.dataType,
      samples,
      0,
      this.data.samples.length
    );
    if (!interleaved && this.fmt.numChannels > 1) {
      return deInterleave(samples, this.fmt.numChannels, OutputObject);
    }
    return samples;
  }
  /**
   * Return the sample at a given index.
   * @param {number} index The sample index.
   * @return {number} The sample.
   * @throws {Error} If the sample index is off range.
   */
  getSample(index) {
    index = index * (this.dataType.bits / 8);
    if (index + this.dataType.bits / 8 > this.data.samples.length) {
      throw new Error("Range error");
    }
    return unpack(
      this.data.samples.slice(index, index + this.dataType.bits / 8),
      this.dataType
    );
  }
  /**
   * Set the sample at a given index.
   * @param {number} index The sample index.
   * @param {number} sample The sample.
   * @throws {Error} If the sample index is off range.
   */
  setSample(index, sample) {
    index = index * (this.dataType.bits / 8);
    if (index + this.dataType.bits / 8 > this.data.samples.length) {
      throw new Error("Range error");
    }
    packTo(sample, this.dataType, this.data.samples, index);
  }
  /**
   * Return the value of the iXML chunk.
   * @return {string} The contents of the iXML chunk.
   */
  getiXML() {
    return this.iXML.value;
  }
  /**
   * Set the value of the iXML chunk.
   * @param {string} iXMLValue The value for the iXML chunk.
   * @throws {TypeError} If the value is not a string.
   */
  setiXML(iXMLValue) {
    if (typeof iXMLValue !== "string") {
      throw new TypeError("iXML value must be a string.");
    }
    this.iXML.value = iXMLValue;
    this.iXML.chunkId = "iXML";
  }
  /**
   * Get the value of the _PMX chunk.
   * @return {string} The contents of the _PMX chunk.
   */
  get_PMX() {
    return this._PMX.value;
  }
  /**
   * Set the value of the _PMX chunk.
   * @param {string} _PMXValue The value for the _PMX chunk.
   * @throws {TypeError} If the value is not a string.
   */
  set_PMX(_PMXValue) {
    if (typeof _PMXValue !== "string") {
      throw new TypeError("_PMX value must be a string.");
    }
    this._PMX.value = _PMXValue;
    this._PMX.chunkId = "_PMX";
  }
  /**
   * Set up the WaveFileCreator object based on the arguments passed.
   * @param {number} numChannels The number of channels.
   * @param {number} sampleRate The sample rate.
   *   Integers like 8000, 44100, 48000, 96000, 192000.
   * @param {string} bitDepthCode The audio bit depth code.
   *   One of '4', '8', '8a', '8m', '16', '24', '32', '32f', '64'
   *   or any value between '8' and '32' (like '12').
   * @param {!(Array|TypedArray)} samples The samples.
   * @param {Object} options Used to define the container.
   * @throws {Error} If any argument does not meet the criteria.
   * @private
   */
  newWavFile_(numChannels, sampleRate, bitDepthCode, samples, options) {
    if (!options.container) {
      options.container = "RIFF";
    }
    this.container = options.container;
    this.bitDepth = bitDepthCode;
    samples = interleave(samples);
    this.updateDataType_();
    let numBytes = this.dataType.bits / 8;
    this.data.samples = new Uint8Array(samples.length * numBytes);
    packArrayTo(samples, this.dataType, this.data.samples, 0);
    this.makeWavHeader_(
      bitDepthCode,
      numChannels,
      sampleRate,
      numBytes,
      this.data.samples.length,
      options
    );
    this.data.chunkId = "data";
    this.data.chunkSize = this.data.samples.length;
    this.validateWavHeader_();
  }
  /**
   * Define the header of a wav file.
   * @param {string} bitDepthCode The audio bit depth
   * @param {number} numChannels The number of channels
   * @param {number} sampleRate The sample rate.
   * @param {number} numBytes The number of bytes each sample use.
   * @param {number} samplesLength The length of the samples in bytes.
   * @param {!Object} options The extra options, like container defintion.
   * @private
   */
  makeWavHeader_(bitDepthCode, numChannels, sampleRate, numBytes, samplesLength, options) {
    if (bitDepthCode == "4") {
      this.createADPCMHeader_(
        bitDepthCode,
        numChannels,
        sampleRate,
        numBytes,
        samplesLength,
        options
      );
    } else if (bitDepthCode == "8a" || bitDepthCode == "8m") {
      this.createALawMulawHeader_(
        bitDepthCode,
        numChannels,
        sampleRate,
        numBytes,
        samplesLength,
        options
      );
    } else if (Object.keys(this.WAV_AUDIO_FORMATS).indexOf(bitDepthCode) == -1 || numChannels > 2) {
      this.createExtensibleHeader_(
        bitDepthCode,
        numChannels,
        sampleRate,
        numBytes,
        samplesLength,
        options
      );
    } else {
      this.createPCMHeader_(
        bitDepthCode,
        numChannels,
        sampleRate,
        numBytes,
        samplesLength,
        options
      );
    }
  }
  /**
   * Create the header of a linear PCM wave file.
   * @param {string} bitDepthCode The audio bit depth
   * @param {number} numChannels The number of channels
   * @param {number} sampleRate The sample rate.
   * @param {number} numBytes The number of bytes each sample use.
   * @param {number} samplesLength The length of the samples in bytes.
   * @param {!Object} options The extra options, like container defintion.
   * @private
   */
  createPCMHeader_(bitDepthCode, numChannels, sampleRate, numBytes, samplesLength, options) {
    this.container = options.container;
    this.chunkSize = 36 + samplesLength;
    this.format = "WAVE";
    this.bitDepth = bitDepthCode;
    this.fmt = {
      chunkId: "fmt ",
      chunkSize: 16,
      audioFormat: this.WAV_AUDIO_FORMATS[bitDepthCode] || 65534,
      numChannels,
      sampleRate,
      byteRate: numChannels * numBytes * sampleRate,
      blockAlign: numChannels * numBytes,
      bitsPerSample: parseInt(bitDepthCode, 10),
      cbSize: 0,
      validBitsPerSample: 0,
      dwChannelMask: 0,
      subformat: []
    };
  }
  /**
   * Create the header of a ADPCM wave file.
   * @param {string} bitDepthCode The audio bit depth
   * @param {number} numChannels The number of channels
   * @param {number} sampleRate The sample rate.
   * @param {number} numBytes The number of bytes each sample use.
   * @param {number} samplesLength The length of the samples in bytes.
   * @param {!Object} options The extra options, like container defintion.
   * @private
   */
  createADPCMHeader_(bitDepthCode, numChannels, sampleRate, numBytes, samplesLength, options) {
    this.createPCMHeader_(
      bitDepthCode,
      numChannels,
      sampleRate,
      numBytes,
      samplesLength,
      options
    );
    this.chunkSize = 40 + samplesLength;
    this.fmt.chunkSize = 20;
    this.fmt.byteRate = 4055;
    this.fmt.blockAlign = 256;
    this.fmt.bitsPerSample = 4;
    this.fmt.cbSize = 2;
    this.fmt.validBitsPerSample = 505;
    this.fact = {
      chunkId: "fact",
      chunkSize: 4,
      dwSampleLength: samplesLength * 2
    };
  }
  /**
   * Create the header of WAVE_FORMAT_EXTENSIBLE file.
   * @param {string} bitDepthCode The audio bit depth
   * @param {number} numChannels The number of channels
   * @param {number} sampleRate The sample rate.
   * @param {number} numBytes The number of bytes each sample use.
   * @param {number} samplesLength The length of the samples in bytes.
   * @param {!Object} options The extra options, like container defintion.
   * @private
   */
  createExtensibleHeader_(bitDepthCode, numChannels, sampleRate, numBytes, samplesLength, options) {
    this.createPCMHeader_(
      bitDepthCode,
      numChannels,
      sampleRate,
      numBytes,
      samplesLength,
      options
    );
    this.chunkSize = 36 + 24 + samplesLength;
    this.fmt.chunkSize = 40;
    this.fmt.bitsPerSample = (parseInt(bitDepthCode, 10) - 1 | 7) + 1;
    this.fmt.cbSize = 22;
    this.fmt.validBitsPerSample = parseInt(bitDepthCode, 10);
    this.fmt.dwChannelMask = dwChannelMask_(numChannels);
    this.fmt.subformat = [1, 1048576, 2852126848, 1905997824];
  }
  /**
   * Create the header of mu-Law and A-Law wave files.
   * @param {string} bitDepthCode The audio bit depth
   * @param {number} numChannels The number of channels
   * @param {number} sampleRate The sample rate.
   * @param {number} numBytes The number of bytes each sample use.
   * @param {number} samplesLength The length of the samples in bytes.
   * @param {!Object} options The extra options, like container defintion.
   * @private
   */
  createALawMulawHeader_(bitDepthCode, numChannels, sampleRate, numBytes, samplesLength, options) {
    this.createPCMHeader_(
      bitDepthCode,
      numChannels,
      sampleRate,
      numBytes,
      samplesLength,
      options
    );
    this.chunkSize = 40 + samplesLength;
    this.fmt.chunkSize = 20;
    this.fmt.cbSize = 2;
    this.fmt.validBitsPerSample = 8;
    this.fact = {
      chunkId: "fact",
      chunkSize: 4,
      dwSampleLength: samplesLength
    };
  }
  /**
   * Set the string code of the bit depth based on the 'fmt ' chunk.
   * @private
   */
  bitDepthFromFmt_() {
    if (this.fmt.audioFormat === 3 && this.fmt.bitsPerSample === 32) {
      this.bitDepth = "32f";
    } else if (this.fmt.audioFormat === 6) {
      this.bitDepth = "8a";
    } else if (this.fmt.audioFormat === 7) {
      this.bitDepth = "8m";
    } else {
      this.bitDepth = this.fmt.bitsPerSample.toString();
    }
  }
  /**
   * Validate the bit depth.
   * @return {boolean} True is the bit depth is valid.
   * @throws {Error} If bit depth is invalid.
   * @private
   */
  validateBitDepth_() {
    if (!this.WAV_AUDIO_FORMATS[this.bitDepth]) {
      if (parseInt(this.bitDepth, 10) > 8 && parseInt(this.bitDepth, 10) < 54) {
        return true;
      }
      throw new Error("Invalid bit depth.");
    }
    return true;
  }
  /**
   * Update the type definition used to read and write the samples.
   * @private
   */
  updateDataType_() {
    this.dataType = {
      bits: (parseInt(this.bitDepth, 10) - 1 | 7) + 1,
      fp: this.bitDepth == "32f" || this.bitDepth == "64",
      signed: this.bitDepth != "8",
      be: this.container == "RIFX"
    };
    if (["4", "8a", "8m"].indexOf(this.bitDepth) > -1) {
      this.dataType.bits = 8;
      this.dataType.signed = false;
    }
  }
  /**
   * Validate the header of the file.
   * @throws {Error} If bit depth is invalid.
   * @throws {Error} If the number of channels is invalid.
   * @throws {Error} If the sample rate is invalid.
   * @ignore
   * @private
   */
  validateWavHeader_() {
    this.validateBitDepth_();
    if (!validateNumChannels(this.fmt.numChannels, this.fmt.bitsPerSample)) {
      throw new Error("Invalid number of channels.");
    }
    if (!validateSampleRate(
      this.fmt.numChannels,
      this.fmt.bitsPerSample,
      this.fmt.sampleRate
    )) {
      throw new Error("Invalid sample rate.");
    }
  }
}
function dwChannelMask_(numChannels) {
  let mask = 0;
  if (numChannels === 1) {
    mask = 4;
  } else if (numChannels === 2) {
    mask = 3;
  } else if (numChannels === 4) {
    mask = 51;
  } else if (numChannels === 6) {
    mask = 63;
  } else if (numChannels === 8) {
    mask = 1599;
  }
  return mask;
}
class WaveFileTagEditor extends WaveFileCreator {
  /**
   * Return the value of a RIFF tag in the INFO chunk.
   * @param {string} tag The tag name.
   * @return {?string} The value if the tag is found, null otherwise.
   */
  getTag(tag) {
    let index = this.getTagIndex_(tag);
    if (index.TAG !== null) {
      return this.LIST[index.LIST].subChunks[index.TAG].value;
    }
    return null;
  }
  /**
   * Write a RIFF tag in the INFO chunk. If the tag do not exist,
   * then it is created. It if exists, it is overwritten.
   * @param {string} tag The tag name.
   * @param {string} value The tag value.
   * @throws {Error} If the tag name is not valid.
   */
  setTag(tag, value) {
    tag = fixRIFFTag_(tag);
    let index = this.getTagIndex_(tag);
    if (index.TAG !== null) {
      this.LIST[index.LIST].subChunks[index.TAG].chunkSize = value.length + 1;
      this.LIST[index.LIST].subChunks[index.TAG].value = value;
    } else if (index.LIST !== null) {
      this.LIST[index.LIST].subChunks.push({
        chunkId: tag,
        chunkSize: value.length + 1,
        value
      });
    } else {
      this.LIST.push({
        chunkId: "LIST",
        chunkSize: 8 + value.length + 1,
        format: "INFO",
        subChunks: []
      });
      this.LIST[this.LIST.length - 1].subChunks.push({
        chunkId: tag,
        chunkSize: value.length + 1,
        value
      });
    }
  }
  /**
   * Remove a RIFF tag from the INFO chunk.
   * @param {string} tag The tag name.
   * @return {boolean} True if a tag was deleted.
   */
  deleteTag(tag) {
    let index = this.getTagIndex_(tag);
    if (index.TAG !== null) {
      this.LIST[index.LIST].subChunks.splice(index.TAG, 1);
      return true;
    }
    return false;
  }
  /**
   * Return a Object<tag, value> with the RIFF tags in the file.
   * @return {!Object<string, string>} The file tags.
   */
  listTags() {
    let index = this.getLISTIndex("INFO");
    let tags = {};
    if (index !== null) {
      for (let i = 0, len = this.LIST[index].subChunks.length; i < len; i++) {
        tags[this.LIST[index].subChunks[i].chunkId] = this.LIST[index].subChunks[i].value;
      }
    }
    return tags;
  }
  /**
   * Return the index of a list by its type.
   * @param {string} listType The list type ('adtl', 'INFO')
   * @return {?number}
   * @protected
   */
  getLISTIndex(listType) {
    for (let i = 0, len = this.LIST.length; i < len; i++) {
      if (this.LIST[i].format == listType) {
        return i;
      }
    }
    return null;
  }
  /**
   * Return the index of a tag in a FILE chunk.
   * @param {string} tag The tag name.
   * @return {!Object<string, ?number>}
   *    Object.LIST is the INFO index in LIST
   *    Object.TAG is the tag index in the INFO
   * @private
   */
  getTagIndex_(tag) {
    let index = { LIST: null, TAG: null };
    for (let i = 0, len = this.LIST.length; i < len; i++) {
      if (this.LIST[i].format == "INFO") {
        index.LIST = i;
        for (let j = 0, subLen = this.LIST[i].subChunks.length; j < subLen; j++) {
          if (this.LIST[i].subChunks[j].chunkId == tag) {
            index.TAG = j;
            break;
          }
        }
        break;
      }
    }
    return index;
  }
}
function fixRIFFTag_(tag) {
  if (tag.constructor !== String) {
    throw new Error("Invalid tag name.");
  } else if (tag.length < 4) {
    for (let i = 0, len = 4 - tag.length; i < len; i++) {
      tag += " ";
    }
  }
  return tag;
}
class WaveFileCueEditor extends WaveFileTagEditor {
  /**
   * Return an array with all cue points in the file, in the order they appear
   * in the file.
   * Objects representing cue points/regions look like this:
   *   {
   *     position: 500, // the position in milliseconds
   *     label: 'cue marker 1',
   *     end: 1500, // the end position in milliseconds
   *     dwName: 1,
   *     dwPosition: 0,
   *     fccChunk: 'data',
   *     dwChunkStart: 0,
   *     dwBlockStart: 0,
   *     dwSampleOffset: 22050, // the position as a sample offset
   *     dwSampleLength: 3646827, // length as a sample count, 0 if not a region
   *     dwPurposeID: 544106354,
   *     dwCountry: 0,
   *     dwLanguage: 0,
   *     dwDialect: 0,
   *     dwCodePage: 0,
   *   }
   * @return {!Array<Object>}
   */
  listCuePoints() {
    let points = this.getCuePoints_();
    for (let i = 0, len = points.length; i < len; i++) {
      points[i].position = points[i].dwSampleOffset / this.fmt.sampleRate * 1e3;
      if (points[i].dwSampleLength) {
        points[i].end = points[i].dwSampleLength / this.fmt.sampleRate * 1e3;
        points[i].end += points[i].position;
      } else {
        points[i].end = null;
      }
      delete points[i].value;
    }
    return points;
  }
  /**
   * Create a cue point in the wave file.
   * @param {!{
   *   position: number,
   *   label: ?string,
   *   end: ?number,
   *   dwPurposeID: ?number,
   *   dwCountry: ?number,
   *   dwLanguage: ?number,
   *   dwDialect: ?number,
   *   dwCodePage: ?number
   * }} pointData A object with the data of the cue point.
   *
   * # Only required attribute to create a cue point:
   * pointData.position: The position of the point in milliseconds
   *
   * # Optional attribute for cue points:
   * pointData.label: A string label for the cue point
   *
   * # Extra data used for regions
   * pointData.end: A number representing the end of the region,
   *   in milliseconds, counting from the start of the file. If
   *   no end attr is specified then no region is created.
   *
   * # You may also specify the following attrs for regions, all optional:
   * pointData.dwPurposeID
   * pointData.dwCountry
   * pointData.dwLanguage
   * pointData.dwDialect
   * pointData.dwCodePage
   */
  setCuePoint(pointData) {
    this.cue.chunkId = "cue ";
    if (!pointData.label) {
      pointData.label = "";
    }
    let existingPoints = this.getCuePoints_();
    this.clearLISTadtl_();
    this.cue.points = [];
    pointData.dwSampleOffset = pointData.position * this.fmt.sampleRate / 1e3;
    pointData.dwSampleLength = 0;
    if (pointData.end) {
      pointData.dwSampleLength = pointData.end * this.fmt.sampleRate / 1e3 - pointData.dwSampleOffset;
    }
    if (existingPoints.length === 0) {
      this.setCuePoint_(pointData, 1);
    } else {
      this.setCuePointInOrder_(existingPoints, pointData);
    }
    this.cue.dwCuePoints = this.cue.points.length;
  }
  /**
   * Remove a cue point from a wave file.
   * @param {number} index the index of the point. First is 1,
   *    second is 2, and so on.
   */
  deleteCuePoint(index) {
    this.cue.chunkId = "cue ";
    let existingPoints = this.getCuePoints_();
    this.clearLISTadtl_();
    let len = this.cue.points.length;
    this.cue.points = [];
    for (let i = 0; i < len; i++) {
      if (i + 1 !== index) {
        this.setCuePoint_(existingPoints[i], i + 1);
      }
    }
    this.cue.dwCuePoints = this.cue.points.length;
    if (this.cue.dwCuePoints) {
      this.cue.chunkId = "cue ";
    } else {
      this.cue.chunkId = "";
      this.clearLISTadtl_();
    }
  }
  /**
   * Update the label of a cue point.
   * @param {number} pointIndex The ID of the cue point.
   * @param {string} label The new text for the label.
   */
  updateLabel(pointIndex, label) {
    let cIndex = this.getLISTIndex("adtl");
    if (cIndex !== null) {
      for (let i = 0, len = this.LIST[cIndex].subChunks.length; i < len; i++) {
        if (this.LIST[cIndex].subChunks[i].dwName == pointIndex) {
          this.LIST[cIndex].subChunks[i].value = label;
        }
      }
    }
  }
  /**
   * Return an array with all cue points in the file, in the order they appear
   * in the file.
   * @return {!Array<!Object>}
   * @private
   */
  getCuePoints_() {
    let points = [];
    for (let i = 0; i < this.cue.points.length; i++) {
      let chunk = this.cue.points[i];
      let pointData = this.getDataForCuePoint_(chunk.dwName);
      pointData.label = pointData.value ? pointData.value : "";
      pointData.dwPosition = chunk.dwPosition;
      pointData.fccChunk = chunk.fccChunk;
      pointData.dwChunkStart = chunk.dwChunkStart;
      pointData.dwBlockStart = chunk.dwBlockStart;
      pointData.dwSampleOffset = chunk.dwSampleOffset;
      points.push(pointData);
    }
    return points;
  }
  /**
   * Return the associated data of a cue point.
   * @param {number} pointDwName The ID of the cue point.
   * @return {!Object}
   * @private
   */
  getDataForCuePoint_(pointDwName) {
    let LISTindex = this.getLISTIndex("adtl");
    let pointData = {};
    if (LISTindex !== null) {
      this.getCueDataFromLIST_(pointData, LISTindex, pointDwName);
    }
    return pointData;
  }
  /**
   * Get all data associated to a cue point in a LIST chunk.
   * @param {!Object} pointData A object to hold the point data.
   * @param {number} index The index of the adtl LIST chunk.
   * @param {number} pointDwName The ID of the cue point.
   * @private
   */
  getCueDataFromLIST_(pointData, index, pointDwName) {
    for (let i = 0, len = this.LIST[index].subChunks.length; i < len; i++) {
      if (this.LIST[index].subChunks[i].dwName == pointDwName) {
        let chunk = this.LIST[index].subChunks[i];
        pointData.value = chunk.value || pointData.value;
        pointData.dwName = chunk.dwName || 0;
        pointData.dwSampleLength = chunk.dwSampleLength || 0;
        pointData.dwPurposeID = chunk.dwPurposeID || 0;
        pointData.dwCountry = chunk.dwCountry || 0;
        pointData.dwLanguage = chunk.dwLanguage || 0;
        pointData.dwDialect = chunk.dwDialect || 0;
        pointData.dwCodePage = chunk.dwCodePage || 0;
      }
    }
  }
  /**
   * Push a new cue point in this.cue.points.
   * @param {!Object} pointData A object with data of the cue point.
   * @param {number} dwName the dwName of the cue point
   * @private
   */
  setCuePoint_(pointData, dwName) {
    this.cue.points.push({
      dwName,
      dwPosition: pointData.dwPosition ? pointData.dwPosition : 0,
      fccChunk: pointData.fccChunk ? pointData.fccChunk : "data",
      dwChunkStart: pointData.dwChunkStart ? pointData.dwChunkStart : 0,
      dwBlockStart: pointData.dwBlockStart ? pointData.dwBlockStart : 0,
      dwSampleOffset: pointData.dwSampleOffset
    });
    this.setLabl_(pointData, dwName);
  }
  /**
   * Push a new cue point in this.cue.points according to existing cue points.
   * @param {!Array} existingPoints Array with the existing points.
   * @param {!Object} pointData A object with data of the cue point.
   * @private
   */
  setCuePointInOrder_(existingPoints, pointData) {
    let hasSet = false;
    for (let i = 0; i < existingPoints.length; i++) {
      if (existingPoints[i].dwSampleOffset > pointData.dwSampleOffset && !hasSet) {
        this.setCuePoint_(pointData, i + 1);
        this.setCuePoint_(existingPoints[i], i + 2);
        hasSet = true;
      } else {
        this.setCuePoint_(existingPoints[i], hasSet ? i + 2 : i + 1);
      }
    }
    if (!hasSet) {
      this.setCuePoint_(pointData, this.cue.points.length + 1);
    }
  }
  /**
   * Clear any LIST chunk labeled as 'adtl'.
   * @private
   */
  clearLISTadtl_() {
    for (let i = 0, len = this.LIST.length; i < len; i++) {
      if (this.LIST[i].format == "adtl") {
        this.LIST.splice(i);
      }
    }
  }
  /**
   * Create a new 'labl' subchunk in a 'LIST' chunk of type 'adtl'.
   * This method creates a LIST adtl chunk in the file if one
   * is not present.
   * @param {!Object} pointData A object with data of the cue point.
   * @param {number} dwName The ID of the cue point.
   * @private
   */
  setLabl_(pointData, dwName) {
    let adtlIndex = this.getLISTIndex("adtl");
    if (adtlIndex === null) {
      this.LIST.push({
        chunkId: "LIST",
        chunkSize: 4,
        format: "adtl",
        subChunks: []
      });
      adtlIndex = this.LIST.length - 1;
    }
    this.setLabelText_(adtlIndex, pointData, dwName);
    if (pointData.dwSampleLength) {
      this.setLtxtChunk_(adtlIndex, pointData, dwName);
    }
  }
  /**
   * Create a new 'labl' subchunk in a 'LIST' chunk of type 'adtl'.
   * @param {number} adtlIndex The index of the 'adtl' LIST in this.LIST.
   * @param {!Object} pointData A object with data of the cue point.
   * @param {number} dwName The ID of the cue point.
   * @private
   */
  setLabelText_(adtlIndex, pointData, dwName) {
    this.LIST[adtlIndex].subChunks.push({
      chunkId: "labl",
      chunkSize: 4,
      // should be 4 + label length in bytes
      dwName,
      value: pointData.label
    });
    this.LIST[adtlIndex].chunkSize += 12;
  }
  /**
   * Create a new 'ltxt' subchunk in a 'LIST' chunk of type 'adtl'.
   * @param {number} adtlIndex The index of the 'adtl' LIST in this.LIST.
   * @param {!Object} pointData A object with data of the cue point.
   * @param {number} dwName The ID of the cue point.
   * @private
   */
  setLtxtChunk_(adtlIndex, pointData, dwName) {
    this.LIST[adtlIndex].subChunks.push({
      chunkId: "ltxt",
      chunkSize: 20,
      // should be 12 + label byte length
      dwName,
      dwSampleLength: pointData.dwSampleLength,
      dwPurposeID: pointData.dwPurposeID || 0,
      dwCountry: pointData.dwCountry || 0,
      dwLanguage: pointData.dwLanguage || 0,
      dwDialect: pointData.dwDialect || 0,
      dwCodePage: pointData.dwCodePage || 0,
      value: pointData.label
      // kept for compatibility
    });
    this.LIST[adtlIndex].chunkSize += 28;
  }
}
class Interpolator {
  /**
   * @param {number} scaleFrom the length of the original array.
   * @param {number} scaleTo The length of the new array.
   * @param {!Object} details The extra configuration, if needed.
   */
  constructor(scaleFrom, scaleTo, details) {
    this.length_ = scaleFrom;
    this.scaleFactor_ = (scaleFrom - 1) / scaleTo;
    this.interpolate = this.sinc;
    if (details.method === "point") {
      this.interpolate = this.point;
    } else if (details.method === "linear") {
      this.interpolate = this.linear;
    } else if (details.method === "cubic") {
      this.interpolate = this.cubic;
    }
    this.tangentFactor_ = 1 - Math.max(0, Math.min(1, details.tension || 0));
    this.sincFilterSize_ = details.sincFilterSize || 1;
    this.kernel_ = sincKernel_(details.sincWindow || window_);
  }
  /**
   * @param {number} t The index to interpolate.
   * @param {Array<number>|TypedArray} samples the original array.
   * @return {number} The interpolated value.
   */
  point(t, samples) {
    return this.getClippedInput_(Math.round(this.scaleFactor_ * t), samples);
  }
  /**
   * @param {number} t The index to interpolate.
   * @param {Array<number>|TypedArray} samples the original array.
   * @return {number} The interpolated value.
   */
  linear(t, samples) {
    t = this.scaleFactor_ * t;
    let k = Math.floor(t);
    t -= k;
    return (1 - t) * this.getClippedInput_(k, samples) + t * this.getClippedInput_(k + 1, samples);
  }
  /**
   * @param {number} t The index to interpolate.
   * @param {Array<number>|TypedArray} samples the original array.
   * @return {number} The interpolated value.
   */
  cubic(t, samples) {
    t = this.scaleFactor_ * t;
    let k = Math.floor(t);
    let m = [this.getTangent_(k, samples), this.getTangent_(k + 1, samples)];
    let p = [
      this.getClippedInput_(k, samples),
      this.getClippedInput_(k + 1, samples)
    ];
    t -= k;
    let t2 = t * t;
    let t3 = t * t2;
    return (2 * t3 - 3 * t2 + 1) * p[0] + (t3 - 2 * t2 + t) * m[0] + (-2 * t3 + 3 * t2) * p[1] + (t3 - t2) * m[1];
  }
  /**
   * @param {number} t The index to interpolate.
   * @param {Array<number>|TypedArray} samples the original array.
   * @return {number} The interpolated value.
   */
  sinc(t, samples) {
    t = this.scaleFactor_ * t;
    let k = Math.floor(t);
    let ref = k - this.sincFilterSize_ + 1;
    let ref1 = k + this.sincFilterSize_;
    let sum = 0;
    for (let n = ref; n <= ref1; n++) {
      sum += this.kernel_(t - n) * this.getClippedInput_(n, samples);
    }
    return sum;
  }
  /**
   * @param {number} k The scaled index to interpolate.
   * @param {Array<number>|TypedArray} samples the original array.
   * @return {number} The tangent.
   * @private
   */
  getTangent_(k, samples) {
    return this.tangentFactor_ * (this.getClippedInput_(k + 1, samples) - this.getClippedInput_(k - 1, samples)) / 2;
  }
  /**
   * @param {number} t The scaled index to interpolate.
   * @param {Array<number>|TypedArray} samples the original array.
   * @return {number} The interpolated value.
   * @private
   */
  getClippedInput_(t, samples) {
    if (0 <= t && t < this.length_) {
      return samples[t];
    }
    return 0;
  }
}
function window_(x) {
  return Math.exp(-x / 2 * x / 2);
}
function sincKernel_(window) {
  return function(x) {
    return sinc_(x) * window(x);
  };
}
function sinc_(x) {
  if (x === 0) {
    return 1;
  }
  return Math.sin(Math.PI * x) / (Math.PI * x);
}
class FIRLPF {
  /**
   * @param {number} order The order of the filter.
   * @param {number} sampleRate The sample rate.
   * @param {number} cutOff The cut off frequency.
   */
  constructor(order, sampleRate, cutOff) {
    let omega = 2 * Math.PI * cutOff / sampleRate;
    let dc = 0;
    this.filters = [];
    for (let i = 0; i <= order; i++) {
      if (i - order / 2 === 0) {
        this.filters[i] = omega;
      } else {
        this.filters[i] = Math.sin(omega * (i - order / 2)) / (i - order / 2);
        this.filters[i] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * i / order);
      }
      dc = dc + this.filters[i];
    }
    for (let i = 0; i <= order; i++) {
      this.filters[i] /= dc;
    }
    this.z = this.initZ_();
  }
  /**
   * @param {number} sample A sample of a sequence.
   * @return {number}
   */
  filter(sample) {
    this.z.buf[this.z.pointer] = sample;
    let out = 0;
    for (let i = 0, len = this.z.buf.length; i < len; i++) {
      out += this.filters[i] * this.z.buf[(this.z.pointer + i) % this.z.buf.length];
    }
    this.z.pointer = (this.z.pointer + 1) % this.z.buf.length;
    return out;
  }
  /**
   * Reset the filter.
   */
  reset() {
    this.z = this.initZ_();
  }
  /**
   * Return the default value for z.
   * @private
   */
  initZ_() {
    let r = [];
    for (let i = 0; i < this.filters.length - 1; i++) {
      r.push(0);
    }
    return {
      buf: r,
      pointer: 0
    };
  }
}
class ButterworthLPF {
  /**
   * @param {number} order The order of the filter.
   * @param {number} sampleRate The sample rate.
   * @param {number} cutOff The cut off frequency.
   */
  constructor(order, sampleRate, cutOff) {
    let filters = [];
    for (let i = 0; i < order; i++) {
      filters.push(this.getCoeffs_({
        Fs: sampleRate,
        Fc: cutOff,
        Q: 0.5 / Math.sin(Math.PI / (order * 2) * (i + 0.5))
      }));
    }
    this.stages = [];
    for (let i = 0; i < filters.length; i++) {
      this.stages[i] = {
        b0: filters[i].b[0],
        b1: filters[i].b[1],
        b2: filters[i].b[2],
        a1: filters[i].a[0],
        a2: filters[i].a[1],
        k: filters[i].k,
        z: [0, 0]
      };
    }
  }
  /**
   * @param {number} sample A sample of a sequence.
   * @return {number}
   */
  filter(sample) {
    let out = sample;
    for (let i = 0, len = this.stages.length; i < len; i++) {
      out = this.runStage_(i, out);
    }
    return out;
  }
  /**
   * @param {!Object} params The filter params.
   * @return {!Object}
   */
  getCoeffs_(params) {
    let coeffs = {};
    coeffs.a = [];
    coeffs.b = [];
    let p = this.preCalc_(params, coeffs);
    coeffs.k = 1;
    coeffs.b.push((1 - p.cw) / (2 * p.a0));
    coeffs.b.push(2 * coeffs.b[0]);
    coeffs.b.push(coeffs.b[0]);
    return coeffs;
  }
  /**
   * @param {!Object} params The filter params.
   * @param {!Object} coeffs The coefficients template.
   * @return {!Object}
   */
  preCalc_(params, coeffs) {
    let pre = {};
    let w = 2 * Math.PI * params.Fc / params.Fs;
    pre.alpha = Math.sin(w) / (2 * params.Q);
    pre.cw = Math.cos(w);
    pre.a0 = 1 + pre.alpha;
    coeffs.a0 = pre.a0;
    coeffs.a.push(-2 * pre.cw / pre.a0);
    coeffs.k = 1;
    coeffs.a.push((1 - pre.alpha) / pre.a0);
    return pre;
  }
  /**
   * @param {number} i The stage index.
   * @param {number} sample The sample.
   * @return {number}
   */
  runStage_(i, sample) {
    let temp = sample * this.stages[i].k - this.stages[i].a1 * this.stages[i].z[0] - this.stages[i].a2 * this.stages[i].z[1];
    let out = this.stages[i].b0 * temp + this.stages[i].b1 * this.stages[i].z[0] + this.stages[i].b2 * this.stages[i].z[1];
    this.stages[i].z[1] = this.stages[i].z[0];
    this.stages[i].z[0] = temp;
    return out;
  }
  /**
   * Reset the filter.
   */
  reset() {
    for (let i = 0; i < this.stages.length; i++) {
      this.stages[i].z = [0, 0];
    }
  }
}
const DEFAULT_LPF_USE = {
  "point": false,
  "linear": false,
  "cubic": true,
  "sinc": true
};
const DEFAULT_LPF_ORDER = {
  "IIR": 16,
  "FIR": 71
};
const DEFAULT_LPF = {
  "IIR": ButterworthLPF,
  "FIR": FIRLPF
};
function resample(samples, oldSampleRate, sampleRate, options = null) {
  options = options || {};
  let rate = (sampleRate - oldSampleRate) / oldSampleRate + 1;
  let newSamples = new Float64Array(samples.length * rate);
  options.method = options.method || "cubic";
  let interpolator = new Interpolator(
    samples.length,
    newSamples.length,
    {
      method: options.method,
      tension: options.tension || 0,
      sincFilterSize: options.sincFilterSize || 6,
      sincWindow: options.sincWindow || void 0,
      clip: options.clip || "mirror"
    }
  );
  if (options.LPF === void 0) {
    options.LPF = DEFAULT_LPF_USE[options.method];
  }
  if (options.LPF) {
    options.LPFType = options.LPFType || "IIR";
    const LPF = DEFAULT_LPF[options.LPFType];
    if (sampleRate > oldSampleRate) {
      let filter = new LPF(
        options.LPForder || DEFAULT_LPF_ORDER[options.LPFType],
        sampleRate,
        oldSampleRate / 2
      );
      upsample_(
        samples,
        newSamples,
        interpolator,
        filter
      );
    } else {
      let filter = new LPF(
        options.LPForder || DEFAULT_LPF_ORDER[options.LPFType],
        oldSampleRate,
        sampleRate / 2
      );
      downsample_(
        samples,
        newSamples,
        interpolator,
        filter
      );
    }
  } else {
    resample_(samples, newSamples, interpolator);
  }
  return newSamples;
}
function resample_(samples, newSamples, interpolator) {
  for (let i = 0, len = newSamples.length; i < len; i++) {
    newSamples[i] = interpolator.interpolate(i, samples);
  }
}
function upsample_(samples, newSamples, interpolator, filter) {
  for (let i = 0, len = newSamples.length; i < len; i++) {
    newSamples[i] = filter.filter(interpolator.interpolate(i, samples));
  }
  filter.reset();
  for (let i = newSamples.length - 1; i >= 0; i--) {
    newSamples[i] = filter.filter(newSamples[i]);
  }
}
function downsample_(samples, newSamples, interpolator, filter) {
  for (let i = 0, len = samples.length; i < len; i++) {
    samples[i] = filter.filter(samples[i]);
  }
  filter.reset();
  for (let i = samples.length - 1; i >= 0; i--) {
    samples[i] = filter.filter(samples[i]);
  }
  resample_(samples, newSamples, interpolator);
}
class WaveFileConverter extends WaveFileCueEditor {
  /**
   * Force a file as RIFF.
   */
  toRIFF() {
    let output = new Float64Array(
      outputSize_(this.data.samples.length, this.dataType.bits / 8)
    );
    unpackArrayTo(
      this.data.samples,
      this.dataType,
      output,
      0,
      this.data.samples.length
    );
    this.fromExisting_(
      this.fmt.numChannels,
      this.fmt.sampleRate,
      this.bitDepth,
      output,
      { container: "RIFF" }
    );
  }
  /**
   * Force a file as RIFX.
   */
  toRIFX() {
    let output = new Float64Array(
      outputSize_(this.data.samples.length, this.dataType.bits / 8)
    );
    unpackArrayTo(
      this.data.samples,
      this.dataType,
      output,
      0,
      this.data.samples.length
    );
    this.fromExisting_(
      this.fmt.numChannels,
      this.fmt.sampleRate,
      this.bitDepth,
      output,
      { container: "RIFX" }
    );
  }
  /**
   * Encode a 16-bit wave file as 4-bit IMA ADPCM.
   * @throws {Error} If sample rate is not 8000.
   * @throws {Error} If number of channels is not 1.
   */
  toIMAADPCM() {
    if (this.fmt.sampleRate !== 8e3) {
      throw new Error(
        "Only 8000 Hz files can be compressed as IMA-ADPCM."
      );
    } else if (this.fmt.numChannels !== 1) {
      throw new Error(
        "Only mono files can be compressed as IMA-ADPCM."
      );
    } else {
      this.assure16Bit_();
      let output = new Int16Array(
        outputSize_(this.data.samples.length, 2)
      );
      unpackArrayTo(
        this.data.samples,
        this.dataType,
        output,
        0,
        this.data.samples.length
      );
      this.fromExisting_(
        this.fmt.numChannels,
        this.fmt.sampleRate,
        "4",
        encode$2(output),
        { container: this.correctContainer_() }
      );
    }
  }
  /**
   * Decode a 4-bit IMA ADPCM wave file as a 16-bit wave file.
   * @param {string=} [bitDepthCode='16'] The new bit depth of the samples.
   *    One of '8' ... '32' (integers), '32f' or '64' (floats).
   */
  fromIMAADPCM(bitDepthCode = "16") {
    this.fromExisting_(
      this.fmt.numChannels,
      this.fmt.sampleRate,
      "16",
      decode$2(this.data.samples, this.fmt.blockAlign),
      { container: this.correctContainer_() }
    );
    if (bitDepthCode != "16") {
      this.toBitDepth(bitDepthCode);
    }
  }
  /**
   * Encode a 16-bit wave file as 8-bit A-Law.
   */
  toALaw() {
    this.assure16Bit_();
    let output = new Int16Array(
      outputSize_(this.data.samples.length, 2)
    );
    unpackArrayTo(
      this.data.samples,
      this.dataType,
      output,
      0,
      this.data.samples.length
    );
    this.fromExisting_(
      this.fmt.numChannels,
      this.fmt.sampleRate,
      "8a",
      encode$1(output),
      { container: this.correctContainer_() }
    );
  }
  /**
   * Decode a 8-bit A-Law wave file into a 16-bit wave file.
   * @param {string=} [bitDepthCode='16'] The new bit depth of the samples.
   *    One of '8' ... '32' (integers), '32f' or '64' (floats).
   */
  fromALaw(bitDepthCode = "16") {
    this.fromExisting_(
      this.fmt.numChannels,
      this.fmt.sampleRate,
      "16",
      decode$1(this.data.samples),
      { container: this.correctContainer_() }
    );
    if (bitDepthCode != "16") {
      this.toBitDepth(bitDepthCode);
    }
  }
  /**
   * Encode 16-bit wave file as 8-bit mu-Law.
   */
  toMuLaw() {
    this.assure16Bit_();
    let output = new Int16Array(
      outputSize_(this.data.samples.length, 2)
    );
    unpackArrayTo(
      this.data.samples,
      this.dataType,
      output,
      0,
      this.data.samples.length
    );
    this.fromExisting_(
      this.fmt.numChannels,
      this.fmt.sampleRate,
      "8m",
      encode(output),
      { container: this.correctContainer_() }
    );
  }
  /**
   * Decode a 8-bit mu-Law wave file into a 16-bit wave file.
   * @param {string=} [bitDepthCode='16'] The new bit depth of the samples.
   *    One of '8' ... '32' (integers), '32f' or '64' (floats).
   */
  fromMuLaw(bitDepthCode = "16") {
    this.fromExisting_(
      this.fmt.numChannels,
      this.fmt.sampleRate,
      "16",
      decode(this.data.samples),
      { container: this.correctContainer_() }
    );
    if (bitDepthCode != "16") {
      this.toBitDepth(bitDepthCode);
    }
  }
  /**
   * Change the bit depth of the samples.
   * @param {string} newBitDepth The new bit depth of the samples.
   *    One of '8' ... '32' (integers), '32f' or '64' (floats)
   * @param {boolean=} [changeResolution=true] A boolean indicating if the
   *    resolution of samples should be actually changed or not.
   * @throws {Error} If the bit depth is not valid.
   */
  toBitDepth(newBitDepth, changeResolution = true) {
    let toBitDepth = newBitDepth;
    let thisBitDepth = this.bitDepth;
    if (!changeResolution) {
      if (newBitDepth != "32f") {
        toBitDepth = this.dataType.bits.toString();
      }
      thisBitDepth = "" + this.dataType.bits;
    }
    this.assureUncompressed_();
    let samples = this.getSamples(true);
    let newSamples = new Float64Array(samples.length);
    changeBitDepth(samples, thisBitDepth, newSamples, toBitDepth);
    this.fromExisting_(
      this.fmt.numChannels,
      this.fmt.sampleRate,
      newBitDepth,
      newSamples,
      { container: this.correctContainer_() }
    );
  }
  /**
   * Convert the sample rate of the file.
   * @param {number} sampleRate The target sample rate.
   * @param {Object=} options The extra configuration, if needed.
   */
  toSampleRate(sampleRate, options) {
    this.validateResample_(sampleRate);
    let samples = this.getSamples();
    let newSamples = [];
    if (samples.constructor === Float64Array) {
      newSamples = resample(samples, this.fmt.sampleRate, sampleRate, options);
    } else {
      for (let i = 0; i < samples.length; i++) {
        newSamples.push(resample(
          samples[i],
          this.fmt.sampleRate,
          sampleRate,
          options
        ));
      }
    }
    this.fromExisting_(
      this.fmt.numChannels,
      sampleRate,
      this.bitDepth,
      newSamples,
      { "container": this.correctContainer_() }
    );
  }
  /**
   * Validate the conditions for resampling.
   * @param {number} sampleRate The target sample rate.
   * @throws {Error} If the file cant be resampled.
   * @private
   */
  validateResample_(sampleRate) {
    if (!validateSampleRate(
      this.fmt.numChannels,
      this.fmt.bitsPerSample,
      sampleRate
    )) {
      throw new Error("Invalid sample rate.");
    } else if (["4", "8a", "8m"].indexOf(this.bitDepth) > -1) {
      throw new Error(
        "wavefile can't change the sample rate of compressed files."
      );
    }
  }
  /**
   * Make the file 16-bit if it is not.
   * @private
   */
  assure16Bit_() {
    this.assureUncompressed_();
    if (this.bitDepth != "16") {
      this.toBitDepth("16");
    }
  }
  /**
   * Uncompress the samples in case of a compressed file.
   * @private
   */
  assureUncompressed_() {
    if (this.bitDepth == "8a") {
      this.fromALaw();
    } else if (this.bitDepth == "8m") {
      this.fromMuLaw();
    } else if (this.bitDepth == "4") {
      this.fromIMAADPCM();
    }
  }
  /**
   * Return 'RIFF' if the container is 'RF64', the current container name
   * otherwise. Used to enforce 'RIFF' when RF64 is not allowed.
   * @return {string}
   * @private
   */
  correctContainer_() {
    return this.container == "RF64" ? "RIFF" : this.container;
  }
  /**
   * Set up the WaveFileCreator object based on the arguments passed.
   * This method only reset the fmt , fact, ds64 and data chunks.
   * @param {number} numChannels The number of channels
   *    (Integer numbers: 1 for mono, 2 stereo and so on).
   * @param {number} sampleRate The sample rate.
   *    Integer numbers like 8000, 44100, 48000, 96000, 192000.
   * @param {string} bitDepthCode The audio bit depth code.
   *    One of '4', '8', '8a', '8m', '16', '24', '32', '32f', '64'
   *    or any value between '8' and '32' (like '12').
   * @param {!(Array|TypedArray)} samples
   *    The samples. Must be in the correct range according to the bit depth.
   * @param {Object} options Used to define the container. Uses RIFF by default.
   * @throws {Error} If any argument does not meet the criteria.
   * @private
   */
  fromExisting_(numChannels, sampleRate, bitDepthCode, samples, options) {
    let tmpWav = new WaveFileCueEditor();
    Object.assign(this.fmt, tmpWav.fmt);
    Object.assign(this.fact, tmpWav.fact);
    Object.assign(this.ds64, tmpWav.ds64);
    Object.assign(this.data, tmpWav.data);
    this.newWavFile_(numChannels, sampleRate, bitDepthCode, samples, options);
  }
}
function outputSize_(byteLen, byteOffset) {
  let outputSize = byteLen / byteOffset;
  if (outputSize % 2) {
    outputSize++;
  }
  return outputSize;
}
class WaveFile extends WaveFileConverter {
  /**
   * @param {Uint8Array=} wav A wave file buffer.
   * @throws {Error} If container is not RIFF, RIFX or RF64.
   * @throws {Error} If format is not WAVE.
   * @throws {Error} If no 'fmt ' chunk is found.
   * @throws {Error} If no 'data' chunk is found.
   */
  constructor(wav) {
    super();
    if (wav) {
      this.fromBuffer(wav);
    }
  }
  /**
   * Use a .wav file encoded as a base64 string to load the WaveFile object.
   * @param {string} base64String A .wav file as a base64 string.
   * @throws {Error} If any property of the object appears invalid.
   */
  fromBase64(base64String) {
    this.fromBuffer(decode$3(base64String));
  }
  /**
   * Return a base64 string representig the WaveFile object as a .wav file.
   * @return {string} A .wav file as a base64 string.
   * @throws {Error} If any property of the object appears invalid.
   */
  toBase64() {
    return encode$3(this.toBuffer());
  }
  /**
   * Return a DataURI string representig the WaveFile object as a .wav file.
   * The return of this method can be used to load the audio in browsers.
   * @return {string} A .wav file as a DataURI.
   * @throws {Error} If any property of the object appears invalid.
   */
  toDataURI() {
    return "data:audio/wav;base64," + this.toBase64();
  }
  /**
   * Use a .wav file encoded as a DataURI to load the WaveFile object.
   * @param {string} dataURI A .wav file as DataURI.
   * @throws {Error} If any property of the object appears invalid.
   */
  fromDataURI(dataURI) {
    this.fromBase64(dataURI.replace("data:audio/wav;base64,", ""));
  }
}
class WavReader {
  static readFile(filePath) {
    const stats = fs.statSync(filePath);
    const buffer = fs.readFileSync(filePath);
    const wav = new WaveFile(buffer);
    const sampleRate = wav.fmt.sampleRate;
    const channels = wav.fmt.numChannels;
    const bitsPerSample = wav.fmt.bitsPerSample;
    const samples = wav.getSamples(false, Float64Array);
    const monoSamples = channels > 1 ? this.toMono(samples, channels) : samples;
    const duration = monoSamples.length / sampleRate;
    return {
      info: {
        path: filePath,
        name: path.basename(filePath),
        sampleRate,
        channels,
        bitsPerSample,
        duration,
        size: stats.size
      },
      samples: monoSamples,
      sampleRate
    };
  }
  static toMono(samples, channels) {
    const monoLength = Math.floor(samples.length / channels);
    const mono = new Float64Array(monoLength);
    for (let i = 0; i < monoLength; i++) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch++) {
        sum += samples[i * channels + ch];
      }
      mono[i] = sum / channels;
    }
    return mono;
  }
  static normalize(samples) {
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > max) max = abs;
    }
    if (max === 0) return samples;
    const normalized = new Float64Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      normalized[i] = samples[i] / max;
    }
    return normalized;
  }
}
const SYMBOL_MAP = [-3, -1, 1, 3];
class Fsk4Demodulator {
  constructor(config, sampleRate) {
    __publicField(this, "config");
    __publicField(this, "sampleRate");
    __publicField(this, "samplesPerSymbol");
    this.config = config;
    this.sampleRate = sampleRate;
    this.samplesPerSymbol = sampleRate / config.symbolRate;
  }
  demodulate(samples) {
    const normalized = this.normalize(samples);
    const frequencyShifted = this.frequencyShift(normalized);
    const filtered = this.lowPassFilter(frequencyShifted);
    const discriminator = this.frequencyDiscriminator(filtered);
    const symbols = this.symbolDecision(discriminator);
    const syncedSymbols = this.symbolSynchronization(symbols, discriminator);
    const snr = this.estimateSNR(filtered);
    const freqOffset = this.estimateFrequencyOffset(discriminator);
    const ser = this.estimateSER(syncedSymbols);
    const qualityScore = this.calculateQualityScore(snr, ser);
    return {
      symbols: syncedSymbols,
      snr,
      frequencyOffset: freqOffset,
      symbolErrorRate: ser,
      qualityScore
    };
  }
  normalize(samples) {
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > max) max = abs;
    }
    if (max === 0) return samples;
    const result = new Float64Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      result[i] = samples[i] / max;
    }
    return result;
  }
  frequencyShift(samples) {
    const { centerFrequency } = this.config;
    if (centerFrequency === 0) return samples;
    const result = new Float64Array(samples.length);
    const phaseStep = 2 * Math.PI * centerFrequency / this.sampleRate;
    for (let i = 0; i < samples.length; i++) {
      const phase = i * phaseStep;
      result[i] = samples[i] * Math.cos(phase);
    }
    return result;
  }
  lowPassFilter(samples) {
    const cutoff = this.config.symbolRate * 1.5;
    const filterLength = Math.floor(this.samplesPerSymbol * 4) | 1;
    const halfLength = (filterLength - 1) / 2;
    const coefficients = new Float64Array(filterLength);
    const fc = cutoff / this.sampleRate;
    for (let i = 0; i < filterLength; i++) {
      const n = i - halfLength;
      if (n === 0) {
        coefficients[i] = 2 * Math.PI * fc;
      } else {
        coefficients[i] = Math.sin(2 * Math.PI * fc * n) / n;
      }
      coefficients[i] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (filterLength - 1));
    }
    let sum = 0;
    for (let i = 0; i < filterLength; i++) {
      sum += coefficients[i];
    }
    for (let i = 0; i < filterLength; i++) {
      coefficients[i] /= sum;
    }
    const result = new Float64Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      let acc = 0;
      for (let j = 0; j < filterLength; j++) {
        const idx = i - j + halfLength;
        if (idx >= 0 && idx < samples.length) {
          acc += samples[idx] * coefficients[j];
        }
      }
      result[i] = acc;
    }
    return result;
  }
  frequencyDiscriminator(samples) {
    const result = new Float64Array(samples.length);
    const delayLine = new Float64Array(Math.floor(this.samplesPerSymbol));
    for (let i = 0; i < samples.length; i++) {
      const delayed = delayLine[i % delayLine.length];
      delayLine[i % delayLine.length] = samples[i];
      if (i >= delayLine.length) {
        const phaseDiff = Math.atan2(
          samples[i] * delayed - 0,
          samples[i] * delayed + 0
        );
        result[i] = phaseDiff;
      }
    }
    return this.differentiate(result);
  }
  differentiate(samples) {
    const result = new Float64Array(samples.length);
    for (let i = 1; i < samples.length; i++) {
      result[i] = samples[i] - samples[i - 1];
    }
    result[0] = result[1] || 0;
    return result;
  }
  symbolDecision(discriminator) {
    const symbols = [];
    const step = Math.floor(this.samplesPerSymbol);
    for (let i = 0; i < discriminator.length; i += step) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < step && i + j < discriminator.length; j++) {
        sum += discriminator[i + j];
        count++;
      }
      const avg = sum / count;
      symbols.push(this.quantize(avg));
    }
    return symbols;
  }
  quantize(value) {
    const threshold = this.config.frequencyDeviation / 2;
    if (value > threshold * 1.5) return 3;
    if (value > 0) return 1;
    if (value > -threshold * 1.5) return -1;
    return -3;
  }
  symbolSynchronization(symbols, discriminator) {
    const sps = Math.floor(this.samplesPerSymbol);
    let bestOffset = 0;
    let maxQuality = -Infinity;
    for (let offset = 0; offset < sps; offset++) {
      let quality = 0;
      for (let i = offset; i < discriminator.length - sps; i += sps) {
        const peak = Math.abs(discriminator[i + Math.floor(sps / 2)]);
        quality += peak;
      }
      if (quality > maxQuality) {
        maxQuality = quality;
        bestOffset = offset;
      }
    }
    const synced = [];
    for (let i = bestOffset; i < discriminator.length; i += sps) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < sps && i + j < discriminator.length; j++) {
        sum += discriminator[i + j];
        count++;
      }
      if (count > 0) {
        synced.push(this.quantize(sum / count));
      }
    }
    return synced;
  }
  estimateSNR(samples) {
    let signalPower = 0;
    let noisePower = 0;
    for (let i = 0; i < samples.length; i++) {
      signalPower += samples[i] * samples[i];
    }
    signalPower /= samples.length;
    for (let i = 1; i < samples.length; i++) {
      const diff = samples[i] - samples[i - 1];
      noisePower += diff * diff;
    }
    noisePower /= samples.length;
    if (noisePower === 0) return 30;
    return 10 * Math.log10(signalPower / noisePower);
  }
  estimateFrequencyOffset(discriminator) {
    let sum = 0;
    for (let i = 0; i < discriminator.length; i++) {
      sum += discriminator[i];
    }
    return sum / discriminator.length * (this.sampleRate / (2 * Math.PI));
  }
  estimateSER(symbols) {
    let transitions = 0;
    for (let i = 1; i < symbols.length; i++) {
      if (symbols[i] !== symbols[i - 1]) {
        transitions++;
      }
    }
    return Math.min(0.5, transitions / symbols.length);
  }
  calculateQualityScore(snr, ser) {
    const snrScore = Math.min(100, Math.max(0, (snr + 5) * 5));
    const serScore = Math.min(100, Math.max(0, (1 - ser * 2) * 100));
    return Math.round((snrScore + serScore) / 2);
  }
  static generateTestSymbols(length) {
    const symbols = [];
    for (let i = 0; i < length; i++) {
      symbols.push(SYMBOL_MAP[Math.floor(Math.random() * 4)]);
    }
    return symbols;
  }
  static modulate(symbols, sampleRate, symbolRate, freqDev) {
    const sps = Math.floor(sampleRate / symbolRate);
    const samples = new Float64Array(symbols.length * sps);
    let phase = 0;
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const freq = symbol / 3 * freqDev;
      const phaseStep = 2 * Math.PI * freq / sampleRate;
      for (let j = 0; j < sps; j++) {
        const idx = i * sps + j;
        samples[idx] = Math.sin(phase);
        phase += phaseStep;
      }
    }
    return samples;
  }
}
const DMR_SYNC_WORD = 1969215455;
const DMR_SYNC_WORD_MS = 1969215455;
const DMR_SYNC_WORD_BS = 2113361399;
const DMR_SYNC_PATTERN_VOICE = 7731039;
const DMR_SYNC_PATTERN_DATA = 7731037;
const DMR_SYNC_LENGTH = 48;
const DMR_SLOT_LENGTH = 1800;
const DMR_SYMBOLS_PER_FRAME = 288;
const CRC_CCITT_POLY = 4129;
const CRC_CCITT_INIT = 65535;
const CSBK_TYPES = {
  0: "UU_Voice_Request",
  1: "UU_Answer_Response",
  2: "BS_Dwn_Act",
  7: "Group_Voice_Channel_User",
  15: "NACK",
  16: "Preamble",
  17: "MSG_ACK",
  32: "RAND",
  33: "AUTH_FAIL",
  34: "BS_Outbound_Service",
  48: "System_Parms",
  49: "Neighbor_Site_Parms",
  50: "Protect_Parms"
};
class DmrParser {
  constructor(symbolRate = 4800) {
    __publicField(this, "symbolRate");
    __publicField(this, "frames", []);
    __publicField(this, "currentCalls", /* @__PURE__ */ new Map());
    this.symbolRate = symbolRate;
  }
  parse(symbols, sampleRate = 48e3) {
    this.frames = [];
    this.currentCalls.clear();
    const bits = this.symbolsToBits(symbols);
    const syncResults = this.findSyncWords(bits);
    for (const syncResult of syncResults) {
      const frame = this.parseFrame(bits, syncResult.position, symbols, syncResult.patternType, sampleRate);
      if (frame) {
        this.frames.push(frame);
      }
    }
    return this.frames;
  }
  symbolsToBits(symbols) {
    const bits = new Uint8Array(symbols.length * 2);
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      let value;
      switch (symbol) {
        case -3:
          value = 0;
          break;
        case -1:
          value = 1;
          break;
        case 1:
          value = 3;
          break;
        case 3:
          value = 2;
          break;
        default:
          value = 0;
      }
      bits[i * 2] = value >> 1 & 1;
      bits[i * 2 + 1] = value & 1;
    }
    return bits;
  }
  findSyncWords(bits) {
    const results = [];
    const syncPatterns = [
      { pattern: DMR_SYNC_WORD, length: 32, type: "ms_sync" },
      { pattern: DMR_SYNC_WORD_BS, length: 32, type: "bs_sync" },
      { pattern: DMR_SYNC_PATTERN_VOICE, length: 24, type: "voice_sync" },
      { pattern: DMR_SYNC_PATTERN_DATA, length: 24, type: "data_sync" }
    ];
    for (let i = 0; i < bits.length - DMR_SYNC_LENGTH; i += 24) {
      let matched = false;
      for (const sp of syncPatterns) {
        const syncBits = this.hexToBits(sp.pattern, sp.length);
        if (this.matchSync(bits, i, syncBits) || this.matchSync(bits, i, this.invertBits(syncBits))) {
          results.push({ position: i, patternType: sp.type });
          i += DMR_SYMBOLS_PER_FRAME * 2 - DMR_SYNC_LENGTH;
          matched = true;
          break;
        }
      }
      if (!matched) {
        for (const sp of syncPatterns) {
          const syncBits = this.hexToBits(sp.pattern, sp.length);
          const matchResult = this.softMatchSync(bits, i, syncBits);
          if (matchResult.confidence >= 0.8) {
            results.push({ position: i, patternType: sp.type });
            i += DMR_SYMBOLS_PER_FRAME * 2 - DMR_SYNC_LENGTH;
            break;
          }
        }
      }
    }
    return results;
  }
  hexToBits(hex, length) {
    const bits = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bits[i] = hex >> length - 1 - i & 1;
    }
    return bits;
  }
  matchSync(bits, offset, syncBits) {
    let mismatches = 0;
    for (let i = 0; i < syncBits.length && offset + i < bits.length; i++) {
      if (bits[offset + i] !== syncBits[i]) {
        mismatches++;
        if (mismatches > 4) return false;
      }
    }
    return mismatches <= 4;
  }
  softMatchSync(bits, offset, syncBits) {
    let mismatches = 0;
    for (let i = 0; i < syncBits.length && offset + i < bits.length; i++) {
      if (bits[offset + i] !== syncBits[i]) {
        mismatches++;
      }
    }
    const confidence = 1 - mismatches / syncBits.length;
    return { confidence, mismatches };
  }
  invertBits(bits) {
    const inverted = new Uint8Array(bits.length);
    for (let i = 0; i < bits.length; i++) {
      inverted[i] = bits[i] ^ 1;
    }
    return inverted;
  }
  crcCcitt(data, length) {
    let crc = CRC_CCITT_INIT;
    for (let i = 0; i < length && i < data.length; i++) {
      crc ^= data[i] << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 32768) {
          crc = crc << 1 ^ CRC_CCITT_POLY;
        } else {
          crc = crc << 1;
        }
        crc &= 65535;
      }
    }
    return crc;
  }
  crcCcittBits(bits, offset, bitLength) {
    const byteLength = Math.ceil(bitLength / 8);
    const data = new Uint8Array(byteLength);
    for (let i = 0; i < bitLength && offset + i < bits.length; i++) {
      if (bits[offset + i]) {
        data[Math.floor(i / 8)] |= 1 << 7 - i % 8;
      }
    }
    return this.crcCcitt(data, byteLength);
  }
  verifyCrc(bits, offset, dataLength, crcOffset) {
    const calculatedCrc = this.crcCcittBits(bits, offset, dataLength);
    const receivedCrc = this.bitsToHex(bits, offset + crcOffset, 16);
    return calculatedCrc === receivedCrc;
  }
  parseFrame(bits, bitPos, symbols, syncPattern = "unknown", sampleRate = 48e3) {
    const symbolPos = Math.floor(bitPos / 2);
    const timestamp = symbolPos / this.symbolRate * 1e3;
    const slot = this.detectSlot(bits, bitPos);
    const frameType = this.detectFrameType(bits, bitPos, syncPattern);
    if (!slot || !frameType) return null;
    let callType = "unknown";
    let sourceId;
    let destinationId;
    let talkgroupId;
    let colorCode;
    let crcValid = false;
    let crcValue;
    let voiceSamples;
    try {
      if (frameType === "csbk") {
        const csbkInfo = this.parseCSBK(bits, bitPos);
        callType = "csbk";
        sourceId = csbkInfo.sourceId;
        destinationId = csbkInfo.destinationId;
        talkgroupId = this.extractTalkgroupId(bits, bitPos, frameType);
        crcValid = this.verifyCrc(bits, bitPos + 64, 80, 144);
        crcValue = this.crcCcittBits(bits, bitPos + 64, 80);
      } else if (frameType === "voice") {
        callType = this.detectVoiceCallType(bits, bitPos);
        const ids = this.extractIds(bits, bitPos);
        sourceId = ids.sourceId;
        destinationId = ids.destinationId;
        talkgroupId = this.extractTalkgroupId(bits, bitPos, frameType);
        colorCode = this.extractColorCode(bits, bitPos);
        crcValid = this.verifyCrc(bits, bitPos + 40, 96, 136);
        crcValue = this.crcCcittBits(bits, bitPos + 40, 96);
        voiceSamples = this.extractVoiceSamples(symbols, symbolPos, sampleRate);
      } else if (frameType === "data") {
        callType = this.detectDataCallType(bits, bitPos);
        const ids = this.extractIds(bits, bitPos);
        sourceId = ids.sourceId;
        destinationId = ids.destinationId;
        crcValid = this.verifyCrc(bits, bitPos + 48, 88, 136);
        crcValue = this.crcCcittBits(bits, bitPos + 48, 88);
      }
    } catch {
      crcValid = false;
    }
    const rawData = this.extractPayload(bits, bitPos);
    return {
      slot,
      timestamp,
      frameType,
      callType,
      sourceId,
      destinationId,
      talkgroupId,
      colorCode,
      rawData,
      syncPattern,
      crcValid,
      crcValue,
      voiceSamples
    };
  }
  detectSlot(bits, offset) {
    const syncPattern = this.bitsToHex(bits, offset, 32);
    if (syncPattern === DMR_SYNC_WORD_MS || syncPattern === DMR_SYNC_WORD) {
      return 1;
    } else if (syncPattern === DMR_SYNC_WORD_BS) {
      return 2;
    }
    return Math.floor(offset / (DMR_SLOT_LENGTH * 2)) % 2 === 0 ? 1 : 2;
  }
  detectFrameType(bits, offset, syncPattern = "unknown") {
    if (syncPattern === "voice_sync") {
      return "voice";
    }
    if (syncPattern === "data_sync") {
      return "data";
    }
    const ftBits = this.bitsToHex(bits, offset + 56, 8);
    if (ftBits === 204) return "csbk";
    if (ftBits === 170) return "voice";
    if (ftBits === 85) return "data";
    return "sync";
  }
  bitsToHex(bits, offset, length) {
    let value = 0;
    for (let i = 0; i < length && offset + i < bits.length; i++) {
      value = value << 1 | bits[offset + i];
    }
    return value;
  }
  parseCSBK(bits, offset) {
    const csbkTypeBits = this.bitsToHex(bits, offset + 64, 8);
    const csbkType = CSBK_TYPES[csbkTypeBits] || "Unknown";
    const destinationId = this.bitsToHex(bits, offset + 80, 24);
    const sourceId = this.bitsToHex(bits, offset + 104, 24);
    return {
      sourceId,
      destinationId,
      csbkType
    };
  }
  detectVoiceCallType(bits, offset) {
    const callTypeBits = this.bitsToHex(bits, offset + 48, 4);
    if (callTypeBits === 0) return "group_voice";
    if (callTypeBits === 1) return "private_voice";
    return "group_voice";
  }
  detectDataCallType(bits, offset) {
    const callTypeBits = this.bitsToHex(bits, offset + 48, 4);
    if (callTypeBits === 0) return "group_data";
    if (callTypeBits === 1) return "private_data";
    return "group_data";
  }
  extractIds(bits, offset) {
    try {
      const destinationId = this.bitsToHex(bits, offset + 72, 24);
      const sourceId = this.bitsToHex(bits, offset + 96, 24);
      return { sourceId, destinationId };
    } catch {
      return {};
    }
  }
  extractColorCode(bits, offset) {
    try {
      return this.bitsToHex(bits, offset + 40, 4);
    } catch {
      return void 0;
    }
  }
  extractTalkgroupId(bits, offset, frameType) {
    try {
      if (frameType === "voice") {
        return this.bitsToHex(bits, offset + 72, 24);
      }
      if (frameType === "csbk") {
        return this.bitsToHex(bits, offset + 80, 24);
      }
      return void 0;
    } catch {
      return void 0;
    }
  }
  extractVoiceSamples(symbols, symbolPos, sampleRate) {
    try {
      const samplesPerSymbol = Math.floor(sampleRate / this.symbolRate);
      const frameSymbols = DMR_SYMBOLS_PER_FRAME;
      const totalSamples = frameSymbols * samplesPerSymbol;
      if (symbolPos + frameSymbols > symbols.length) return void 0;
      const samples = new Float32Array(totalSamples);
      for (let i = 0; i < frameSymbols; i++) {
        const symbol = symbols[symbolPos + i] || 0;
        const normalizedSymbol = symbol / 3;
        for (let j = 0; j < samplesPerSymbol; j++) {
          samples[i * samplesPerSymbol + j] = normalizedSymbol;
        }
      }
      return samples;
    } catch {
      return void 0;
    }
  }
  extractPayload(bits, offset) {
    const payloadLength = Math.min(DMR_SYMBOLS_PER_FRAME * 2, bits.length - offset);
    const payload = new Uint8Array(Math.ceil(payloadLength / 8));
    for (let i = 0; i < payloadLength && offset + i < bits.length; i++) {
      if (bits[offset + i]) {
        payload[Math.floor(i / 8)] |= 1 << 7 - i % 8;
      }
    }
    return payload;
  }
  generateTimeSlots(frames) {
    var _a;
    const timeSlots = [];
    const maxGap = 200;
    const slotFrames = /* @__PURE__ */ new Map();
    slotFrames.set(1, []);
    slotFrames.set(2, []);
    for (const frame of frames) {
      (_a = slotFrames.get(frame.slot)) == null ? void 0 : _a.push(frame);
    }
    for (const [slot, frameList] of slotFrames) {
      if (frameList.length === 0) continue;
      frameList.sort((a, b) => a.timestamp - b.timestamp);
      let currentCall = null;
      for (const frame of frameList) {
        if (!currentCall) {
          currentCall = {
            callType: frame.callType,
            startTime: frame.timestamp,
            endTime: frame.timestamp + DMR_SYMBOLS_PER_FRAME / this.symbolRate * 1e3,
            sourceId: frame.sourceId,
            destinationId: frame.destinationId,
            talkgroupId: frame.talkgroupId,
            voiceSamples: frame.voiceSamples ? [frame.voiceSamples] : [],
            frameCount: 1
          };
        } else {
          const gap = frame.timestamp - currentCall.endTime;
          if (gap < maxGap && frame.callType === currentCall.callType) {
            currentCall.endTime = frame.timestamp + DMR_SYMBOLS_PER_FRAME / this.symbolRate * 1e3;
            if (frame.sourceId && !currentCall.sourceId) currentCall.sourceId = frame.sourceId;
            if (frame.destinationId && !currentCall.destinationId) currentCall.destinationId = frame.destinationId;
            if (frame.talkgroupId && !currentCall.talkgroupId) currentCall.talkgroupId = frame.talkgroupId;
            if (frame.voiceSamples) currentCall.voiceSamples.push(frame.voiceSamples);
            currentCall.frameCount++;
          } else {
            timeSlots.push({
              slot,
              startTime: currentCall.startTime,
              endTime: currentCall.endTime,
              callType: currentCall.callType,
              sourceId: currentCall.sourceId,
              destinationId: currentCall.destinationId,
              talkgroupId: currentCall.talkgroupId,
              duration: currentCall.endTime - currentCall.startTime,
              frameCount: currentCall.frameCount,
              voiceSamples: currentCall.voiceSamples
            });
            currentCall = {
              callType: frame.callType,
              startTime: frame.timestamp,
              endTime: frame.timestamp + DMR_SYMBOLS_PER_FRAME / this.symbolRate * 1e3,
              sourceId: frame.sourceId,
              destinationId: frame.destinationId,
              talkgroupId: frame.talkgroupId,
              voiceSamples: frame.voiceSamples ? [frame.voiceSamples] : [],
              frameCount: 1
            };
          }
        }
      }
      if (currentCall) {
        timeSlots.push({
          slot,
          startTime: currentCall.startTime,
          endTime: currentCall.endTime,
          callType: currentCall.callType,
          sourceId: currentCall.sourceId,
          destinationId: currentCall.destinationId,
          talkgroupId: currentCall.talkgroupId,
          duration: currentCall.endTime - currentCall.startTime,
          frameCount: currentCall.frameCount,
          voiceSamples: currentCall.voiceSamples
        });
      }
    }
    return timeSlots.sort((a, b) => a.startTime - b.startTime);
  }
  generateStatistics(frames, timeSlots, duration) {
    const byType = {
      group_voice: 0,
      private_voice: 0,
      group_data: 0,
      private_data: 0,
      csbk: 0,
      unknown: 0
    };
    const bySlot = {
      1: 0,
      2: 0
    };
    for (const ts of timeSlots) {
      byType[ts.callType]++;
      bySlot[ts.slot]++;
    }
    let totalDuration = 0;
    for (const ts of timeSlots) {
      totalDuration += ts.duration;
    }
    return {
      totalCalls: timeSlots.length,
      byType,
      bySlot,
      totalDuration
    };
  }
  static generateTestData(duration, sampleRate, symbolRate) {
    const totalSymbols = Math.floor(duration * symbolRate);
    const symbols = [];
    const frames = [];
    for (let i = 0; i < totalSymbols; i++) {
      if (i % DMR_SYMBOLS_PER_FRAME === 0 && Math.random() > 0.3) {
        const slot = Math.random() > 0.5 ? 1 : 2;
        const frameTypes = ["voice", "voice", "voice", "data", "csbk"];
        const frameType = frameTypes[Math.floor(Math.random() * frameTypes.length)];
        const callTypes = ["group_voice", "private_voice", "group_data", "csbk"];
        const callType = callTypes[Math.floor(Math.random() * callTypes.length)];
        frames.push({
          slot,
          timestamp: i / symbolRate * 1e3,
          frameType,
          callType,
          sourceId: Math.floor(Math.random() * 1e5) + 1e3,
          destinationId: Math.floor(Math.random() * 1e4) + 100,
          colorCode: Math.floor(Math.random() * 16)
        });
      }
      symbols.push([-3, -1, 1, 3][Math.floor(Math.random() * 4)]);
    }
    return { symbols, frames };
  }
}
class VoiceSaver {
  constructor(outputDir, sampleRate = 48e3) {
    __publicField(this, "outputDir");
    __publicField(this, "sampleRate");
    this.outputDir = outputDir;
    this.sampleRate = sampleRate;
    this.ensureOutputDir();
  }
  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }
  mergeSamples(sampleArrays) {
    let totalLength = 0;
    for (const arr of sampleArrays) {
      totalLength += arr.length;
    }
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const arr of sampleArrays) {
      merged.set(arr, offset);
      offset += arr.length;
    }
    return merged;
  }
  generateFileName(segment, index) {
    const timeStr = this.formatTime(segment.startTime);
    const tgStr = segment.talkgroupId ? `_TG${segment.talkgroupId}` : "";
    const slotStr = `_SL${segment.slot}`;
    const typeStr = `_${segment.callType}`;
    return `call_${index.toString().padStart(4, "0")}${timeStr}${slotStr}${tgStr}${typeStr}.wav`;
  }
  formatTime(ms) {
    const seconds = Math.floor(ms / 1e3);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `_${hours.toString().padStart(2, "0")}${(minutes % 60).toString().padStart(2, "0")}${(seconds % 60).toString().padStart(2, "0")}`;
  }
  saveVoiceSegment(segment, index) {
    if (segment.samples.length === 0) return null;
    try {
      const mergedSamples = this.mergeSamples(segment.samples);
      const intSamples = new Int16Array(mergedSamples.length);
      for (let i = 0; i < mergedSamples.length; i++) {
        const sample = Math.max(-1, Math.min(1, mergedSamples[i]));
        intSamples[i] = Math.round(sample * 32767);
      }
      const wav = new WaveFile();
      wav.fromScratch(1, this.sampleRate, "16", intSamples);
      const fileName = this.generateFileName(segment, index);
      const filePath = path.join(this.outputDir, fileName);
      fs.writeFileSync(filePath, wav.toBuffer());
      return filePath;
    } catch (error) {
      console.error("Failed to save voice segment:", error);
      return null;
    }
  }
  saveAllVoiceSegments(segments) {
    const results = [];
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment.samples.length > 0) {
        const filePath = this.saveVoiceSegment(segment, i + 1);
        results.push({ index: i + 1, filePath });
      }
    }
    return results;
  }
  getOutputDir() {
    return this.outputDir;
  }
}
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
let mainWindow = null;
let isAnalyzing = false;
let shouldCancel = false;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: "#0a0e17",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: "hiddenInset"
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../dist/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
ipcMain.handle("dmr:select-file", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "WAV Audio Files", extensions: ["wav"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  try {
    const filePath = result.filePaths[0];
    const wavData = WavReader.readFile(filePath);
    return wavData.info;
  } catch (error) {
    console.error("Error reading WAV file:", error);
    return null;
  }
});
ipcMain.handle("dmr:start-analysis", async (_event, { filePath, config }) => {
  if (isAnalyzing) {
    return;
  }
  isAnalyzing = true;
  shouldCancel = false;
  try {
    sendProgress("reading", 0);
    const wavData = WavReader.readFile(filePath);
    sendProgress("reading", 10);
    if (shouldCancel) {
      isAnalyzing = false;
      return;
    }
    const normalizedSamples = WavReader.normalize(wavData.samples);
    sendProgress("demodulating", 20);
    const demodulator = new Fsk4Demodulator(config, wavData.sampleRate);
    const chunkSize = Math.floor(wavData.samples.length / 10);
    let allSymbols = [];
    for (let i = 0; i < 10; i++) {
      if (shouldCancel) {
        isAnalyzing = false;
        return;
      }
      const start = i * chunkSize;
      const end = i === 9 ? wavData.samples.length : (i + 1) * chunkSize;
      const chunk = normalizedSamples.slice(start, end);
      const result = demodulator.demodulate(chunk);
      allSymbols = allSymbols.concat(result.symbols);
      const progress = 20 + (i + 1) * 6;
      sendProgress("demodulating", progress);
    }
    if (shouldCancel) {
      isAnalyzing = false;
      return;
    }
    sendProgress("parsing", 80);
    const parser = new DmrParser(config.symbolRate);
    const frames = parser.parse(allSymbols, wavData.sampleRate);
    if (shouldCancel) {
      isAnalyzing = false;
      return;
    }
    sendProgress("parsing", 90);
    const timeSlotsWithSamples = parser.generateTimeSlots(frames);
    const outputDir = path.join(os.tmpdir(), "dmr_voice_segments", path.basename(filePath, path.extname(filePath)));
    const voiceSaver = new VoiceSaver(outputDir, wavData.sampleRate);
    const finalTimeSlots = [];
    for (let i = 0; i < timeSlotsWithSamples.length; i++) {
      const ts = timeSlotsWithSamples[i];
      let voiceFile;
      if (ts.voiceSamples && ts.voiceSamples.length > 0) {
        voiceFile = voiceSaver.saveVoiceSegment({
          slot: ts.slot,
          startTime: ts.startTime,
          endTime: ts.endTime,
          callType: ts.callType,
          talkgroupId: ts.talkgroupId,
          sourceId: ts.sourceId,
          destinationId: ts.destinationId,
          samples: ts.voiceSamples
        }, i + 1) || void 0;
      }
      finalTimeSlots.push({
        slot: ts.slot,
        startTime: ts.startTime,
        endTime: ts.endTime,
        callType: ts.callType,
        sourceId: ts.sourceId,
        destinationId: ts.destinationId,
        talkgroupId: ts.talkgroupId,
        duration: ts.duration,
        frameCount: ts.frameCount,
        voiceFile
      });
    }
    const statistics = parser.generateStatistics(frames, finalTimeSlots, wavData.info.duration * 1e3);
    const demodResult = demodulator.demodulate(normalizedSamples);
    const analysisResult = {
      fileInfo: wavData.info,
      demodulation: {
        ...demodResult,
        symbols: allSymbols
      },
      frames,
      timeSlots: finalTimeSlots,
      callStatistics: statistics,
      voiceOutputDir: outputDir
    };
    sendProgress("complete", 100);
    mainWindow == null ? void 0 : mainWindow.webContents.send("dmr:analysis-complete", analysisResult);
  } catch (error) {
    console.error("Analysis error:", error);
    mainWindow == null ? void 0 : mainWindow.webContents.send("dmr:analysis-error", {
      message: error instanceof Error ? error.message : "Unknown error occurred"
    });
  } finally {
    isAnalyzing = false;
  }
});
ipcMain.handle("dmr:cancel-analysis", () => {
  shouldCancel = true;
  isAnalyzing = false;
});
ipcMain.handle("dmr:open-voice-file", async (_event, filePath) => {
  try {
    await shell.openPath(filePath);
  } catch (error) {
    console.error("Failed to open voice file:", error);
  }
});
ipcMain.handle("dmr:open-voice-folder", async (_event, folderPath) => {
  try {
    await shell.openPath(folderPath);
  } catch (error) {
    console.error("Failed to open voice folder:", error);
  }
});
function sendProgress(phase, progress) {
  mainWindow == null ? void 0 : mainWindow.webContents.send("dmr:analysis-progress", { phase, progress });
}
