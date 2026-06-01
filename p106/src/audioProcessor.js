const { Transform } = require('stream');
const EventEmitter = require('events');

class AudioNoiseGate extends Transform {
  constructor(options = {}) {
    super();
    this.threshold = options.threshold || 500;
    this.silenceDuration = options.silenceDuration || 500;
    this.releaseTime = options.releaseTime || 100;
    this.sampleRate = options.sampleRate || 48000;
    this.channels = options.channels || 1;
    this.bytesPerSample = 2;
    
    this.isOpen = false;
    this.silenceStartTime = null;
    this.lastSignalTime = Date.now();
    this.rmsHistory = [];
    this.historySize = 10;
    
    this.signalLevel = 0;
    this.isSilent = false;
  }

  _transform(chunk, encoding, callback) {
    const rms = this.calculateRMS(chunk);
    this.signalLevel = rms;
    
    this.rmsHistory.push(rms);
    if (this.rmsHistory.length > this.historySize) {
      this.rmsHistory.shift();
    }
    
    const avgRMS = this.rmsHistory.reduce((a, b) => a + b, 0) / this.rmsHistory.length;
    
    const now = Date.now();
    
    if (avgRMS > this.threshold) {
      this.lastSignalTime = now;
      if (!this.isOpen) {
        this.isOpen = true;
        this.isSilent = false;
        this.emit('signalDetected', { rms: avgRMS });
      }
      this.push(chunk);
    } else if (this.isOpen) {
      const silenceTime = now - this.lastSignalTime;
      if (silenceTime < this.silenceDuration) {
        this.push(chunk);
      } else {
        this.isOpen = false;
        this.isSilent = true;
        this.emit('silenceDetected', { rms: avgRMS });
        this.push(this.generateSilence(chunk.length));
      }
    } else {
      this.isSilent = true;
      this.push(this.generateSilence(chunk.length));
    }
    
    callback();
  }

  calculateRMS(chunk) {
    const sampleCount = chunk.length / this.bytesPerSample;
    let sum = 0;
    
    for (let i = 0; i < chunk.length; i += this.bytesPerSample) {
      const sample = chunk.readInt16LE(i);
      sum += sample * sample;
    }
    
    return Math.sqrt(sum / sampleCount);
  }

  generateSilence(length) {
    return Buffer.alloc(length, 0);
  }

  setThreshold(threshold) {
    this.threshold = threshold;
  }

  getSignalLevel() {
    return this.signalLevel;
  }

  getIsSilent() {
    return this.isSilent;
  }
}

class AudioProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.noiseGate = new AudioNoiseGate(options);
    this.enableAGC = options.enableAGC !== false;
    this.agcTargetLevel = options.agcTargetLevel || 8000;
    this.agcMaxGain = options.agcMaxGain || 10;
    
    this.setupEventForwarding();
  }

  setupEventForwarding() {
    this.noiseGate.on('signalDetected', (data) => {
      this.emit('signalDetected', data);
    });
    
    this.noiseGate.on('silenceDetected', (data) => {
      this.emit('silenceDetected', data);
    });
  }

  processStream(inputStream) {
    if (this.enableAGC) {
      const agcStream = this.createAGCStream();
      return inputStream.pipe(agcStream).pipe(this.noiseGate);
    }
    return inputStream.pipe(this.noiseGate);
  }

  createAGCStream() {
    const self = this;
    return new Transform({
      transform(chunk, encoding, callback) {
        const rms = self.calculateRMS(chunk);
        
        if (rms > 0) {
          let gain = self.agcTargetLevel / rms;
          gain = Math.min(gain, self.agcMaxGain);
          gain = Math.max(gain, 0.1);
          
          const output = Buffer.alloc(chunk.length);
          for (let i = 0; i < chunk.length; i += 2) {
            let sample = chunk.readInt16LE(i);
            sample = Math.round(sample * gain);
            sample = Math.max(-32768, Math.min(32767, sample));
            output.writeInt16LE(sample, i);
          }
          
          this.push(output);
        } else {
          this.push(chunk);
        }
        
        callback();
      }
    });
  }

  calculateRMS(chunk) {
    let sum = 0;
    const sampleCount = chunk.length / 2;
    
    for (let i = 0; i < chunk.length; i += 2) {
      const sample = chunk.readInt16LE(i);
      sum += sample * sample;
    }
    
    return Math.sqrt(sum / sampleCount);
  }

  setNoiseThreshold(threshold) {
    this.noiseGate.setThreshold(threshold);
  }

  getSignalLevel() {
    return this.noiseGate.getSignalLevel();
  }

  isSilent() {
    return this.noiseGate.getIsSilent();
  }

  getProcessedStream() {
    return this.noiseGate;
  }
}

class RDSDataValidator {
  static checkCRC(data) {
    if (data.length < 2) return false;
    let crc = 0xFFFF;
    
    for (let i = 0; i < data.length - 2; i++) {
      crc ^= data[i] << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc <<= 1;
        }
      }
      crc &= 0xFFFF;
    }
    
    const receivedCRC = (data[data.length - 2] << 8) | data[data.length - 1];
    return crc === receivedCRC;
  }

  static validateGroup(blockData) {
    if (!blockData || blockData.length < 4) {
      return { valid: false, error: 'insufficient_data' };
    }
    
    const hasPI = blockData.pi && blockData.pi !== '0000';
    const hasGroupType = blockData.groupType !== undefined;
    
    if (!hasPI) {
      return { valid: false, error: 'missing_pi_code' };
    }
    
    return { valid: true };
  }

  static reconstructPartialData(blocks) {
    const reconstructed = {};
    const validBlocks = blocks.filter(b => b && b.valid !== false);
    
    if (validBlocks.length === 0) {
      return null;
    }
    
    validBlocks.forEach(block => {
      if (block.pi) reconstructed.pi = block.pi;
      if (block.groupType !== undefined) reconstructed.groupType = block.groupType;
      if (block.version !== undefined) reconstructed.version = block.version;
      if (block.ps) reconstructed.ps = block.ps;
      if (block.rt) reconstructed.rt = block.rt;
      if (block.ptype !== undefined) reconstructed.ptype = block.ptype;
    });
    
    return reconstructed;
  }
}

class RDSReassemblyBuffer {
  constructor() {
    this.groups = [];
    this.maxGroups = 5;
    this.psBuffer = [];
    this.rtBuffer = [];
    this.psPosition = 0;
    this.rtPosition = 0;
    this.lastPI = null;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 10;
  }

  addGroup(group) {
    if (!group || !group.valid) {
      this.consecutiveErrors++;
      return false;
    }
    
    this.consecutiveErrors = 0;
    
    if (this.lastPI && group.pi !== this.lastPI) {
      this.clear();
    }
    this.lastPI = group.pi;
    
    this.groups.push(group);
    if (this.groups.length > this.maxGroups) {
      this.groups.shift();
    }
    
    return true;
  }

  addPSChar(position, char) {
    if (position >= 0 && position < 8) {
      this.psBuffer[position] = char;
      this.psPosition = position;
    }
  }

  getPS() {
    const ps = this.psBuffer.filter(c => c !== undefined).join('');
    return ps.length >= 2 ? ps.trim() : null;
  }

  addRTChar(position, char) {
    if (position >= 0 && position < 64) {
      this.rtBuffer[position] = char;
      this.rtPosition = position;
    }
  }

  getRT() {
    const rt = this.rtBuffer.filter(c => c !== undefined).join('');
    return rt.length >= 4 ? rt.trim() : null;
  }

  hasTooManyErrors() {
    return this.consecutiveErrors >= this.maxConsecutiveErrors;
  }

  clear() {
    this.groups = [];
    this.psBuffer = [];
    this.rtBuffer = [];
    this.psPosition = 0;
    this.rtPosition = 0;
    this.lastPI = null;
    this.consecutiveErrors = 0;
  }

  getStats() {
    return {
      totalGroups: this.groups.length,
      consecutiveErrors: this.consecutiveErrors,
      psLength: this.psBuffer.filter(c => c !== undefined).length,
      rtLength: this.rtBuffer.filter(c => c !== undefined).length
    };
  }
}

module.exports = {
  AudioNoiseGate,
  AudioProcessor,
  RDSDataValidator,
  RDSReassemblyBuffer
};
