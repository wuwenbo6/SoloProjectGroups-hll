const { Transform } = require('stream');
const EventEmitter = require('events');

class SpectrumAnalyzer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sampleRate = options.sampleRate || 48000;
    this.fftSize = options.fftSize || 2048;
    this.bufferSize = this.fftSize;
    this.smoothing = options.smoothing || 0.6;
    this.updateInterval = options.updateInterval || 50;
    
    this.buffer = [];
    this.previousData = null;
    this.lastUpdate = 0;
    this.isRunning = false;
    
    this.windowFunction = this.createHannWindow();
    this.frequencyBands = this.createFrequencyBands();
  }

  createHannWindow() {
    const window = new Float32Array(this.fftSize);
    for (let i = 0; i < this.fftSize; i++) {
      window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (this.fftSize - 1)));
    }
    return window;
  }

  createFrequencyBands() {
    return [
      { name: 'sub_bass', min: 20, max: 60 },
      { name: 'bass', min: 60, max: 250 },
      { name: 'low_mid', min: 250, max: 500 },
      { name: 'mid', min: 500, max: 2000 },
      { name: 'upper_mid', min: 2000, max: 4000 },
      { name: 'presence', min: 4000, max: 6000 },
      { name: 'brilliance', min: 6000, max: 20000 }
    ];
  }

  processStream(inputStream) {
    const self = this;
    this.isRunning = true;
    
    const transformStream = new Transform({
      transform(chunk, encoding, callback) {
        self.processChunk(chunk);
        this.push(chunk);
        callback();
      }
    });
    
    return inputStream.pipe(transformStream);
  }

  processChunk(chunk) {
    const samples = chunk.length / 2;
    for (let i = 0; i < samples; i++) {
      const sample = chunk.readInt16LE(i * 2) / 32768.0;
      this.buffer.push(sample);
    }
    
    const maxBuffer = this.fftSize * 4;
    if (this.buffer.length > maxBuffer) {
      this.buffer = this.buffer.slice(-maxBuffer);
    }
    
    const now = Date.now();
    if (now - this.lastUpdate >= this.updateInterval && this.buffer.length >= this.fftSize) {
      this.lastUpdate = now;
      this.analyze();
    }
  }

  analyze() {
    if (this.buffer.length < this.fftSize) return null;
    
    const samples = this.buffer.slice(-this.fftSize);
    const real = new Float32Array(this.fftSize);
    const imag = new Float32Array(this.fftSize);
    
    for (let i = 0; i < this.fftSize; i++) {
      real[i] = samples[i] * this.windowFunction[i];
      imag[i] = 0;
    }
    
    this.fft(real, imag);
    
    const spectrum = this.calculateSpectrum(real, imag);
    
    if (this.previousData) {
      for (let i = 0; i < spectrum.length; i++) {
        spectrum[i] = this.previousData[i] * this.smoothing + spectrum[i] * (1 - this.smoothing);
      }
    }
    this.previousData = spectrum;
    
    const bands = this.calculateBands(spectrum);
    
    const result = {
      spectrum: Array.from(spectrum),
      bands: bands,
      peak: this.findPeak(spectrum),
      average: this.calculateAverage(spectrum),
      timestamp: Date.now()
    };
    
    this.emit('spectrumData', result);
    return result;
  }

  fft(real, imag) {
    const n = real.length;
    if (n <= 1) return;
    
    const m = n / 2;
    const evenReal = new Float32Array(m);
    const evenImag = new Float32Array(m);
    const oddReal = new Float32Array(m);
    const oddImag = new Float32Array(m);
    
    for (let i = 0; i < m; i++) {
      evenReal[i] = real[i * 2];
      evenImag[i] = imag[i * 2];
      oddReal[i] = real[i * 2 + 1];
      oddImag[i] = imag[i * 2 + 1];
    }
    
    this.fft(evenReal, evenImag);
    this.fft(oddReal, oddImag);
    
    for (let k = 0; k < m; k++) {
      const t = -2 * Math.PI * k / n;
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);
      
      const tempReal = cosT * oddReal[k] - sinT * oddImag[k];
      const tempImag = sinT * oddReal[k] + cosT * oddImag[k];
      
      real[k] = evenReal[k] + tempReal;
      imag[k] = evenImag[k] + tempImag;
      real[k + m] = evenReal[k] - tempReal;
      imag[k + m] = evenImag[k] - tempImag;
    }
  }

  calculateSpectrum(real, imag) {
    const n = this.fftSize / 2;
    const spectrum = new Float32Array(n);
    
    for (let i = 0; i < n; i++) {
      const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
      spectrum[i] = 20 * Math.log10(magnitude + 0.0001);
    }
    
    const minDb = -100;
    const maxDb = 0;
    for (let i = 0; i < n; i++) {
      spectrum[i] = (Math.max(minDb, Math.min(maxDb, spectrum[i])) - minDb) / (maxDb - minDb);
    }
    
    return spectrum;
  }

  calculateBands(spectrum) {
    const bands = {};
    const freqPerBin = this.sampleRate / this.fftSize;
    
    this.frequencyBands.forEach(band => {
      const startBin = Math.floor(band.min / freqPerBin);
      const endBin = Math.min(Math.ceil(band.max / freqPerBin), spectrum.length - 1);
      
      let sum = 0;
      let count = 0;
      for (let i = startBin; i <= endBin; i++) {
        sum += spectrum[i];
        count++;
      }
      
      bands[band.name] = count > 0 ? sum / count : 0;
    });
    
    return bands;
  }

  findPeak(spectrum) {
    let peakIndex = 0;
    let peakValue = 0;
    
    for (let i = 0; i < spectrum.length; i++) {
      if (spectrum[i] > peakValue) {
        peakValue = spectrum[i];
        peakIndex = i;
      }
    }
    
    const freqPerBin = this.sampleRate / this.fftSize;
    return {
      frequency: peakIndex * freqPerBin,
      value: peakValue,
      index: peakIndex
    };
  }

  calculateAverage(spectrum) {
    let sum = 0;
    for (let i = 0; i < spectrum.length; i++) {
      sum += spectrum[i];
    }
    return sum / spectrum.length;
  }

  getFrequencyCount() {
    return this.fftSize / 2;
  }

  getFrequencyAtIndex(index) {
    return index * (this.sampleRate / this.fftSize);
  }

  stop() {
    this.isRunning = false;
    this.buffer = [];
    this.previousData = null;
  }
}

class RF SpectrumDisplay {
  constructor(options = {}) {
    this.centerFreq = options.centerFreq || 95;
    this.span = options.span || 10;
    this.sampleRate = options.sampleRate || 256000;
    this.fftSize = options.fftSize || 4096;
    this.updateInterval = options.updateInterval || 100;
    
    this.spectrumData = new Float32Array(this.fftSize / 2);
    this.smoothing = 0.7;
    this.peakHold = new Float32Array(this.fftSize / 2);
    this.lastUpdate = 0;
  }

  processIQData(iqBuffer) {
    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval) return;
    this.lastUpdate = now;
    
    const samples = iqBuffer.length / 2;
    const fftSize = Math.min(this.fftSize, samples);
    
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);
    
    for (let i = 0; i < fftSize; i++) {
      real[i] = iqBuffer.readInt8(i * 2) / 128.0;
      imag[i] = iqBuffer.readInt8(i * 2 + 1) / 128.0;
    }
    
    this.applyWindow(real, imag);
    this.performFFT(real, imag);
  }

  applyWindow(real, imag) {
    const n = real.length;
    for (let i = 0; i < n; i++) {
      const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
      real[i] *= window;
      imag[i] *= window;
    }
  }

  performFFT(real, imag) {
    const n = real.length;
    const levels = Math.log2(n);
    
    for (let level = 0; level < levels; level++) {
      const size = 1 << (level + 1);
      const halfSize = size >> 1;
      const step = Math.PI / halfSize;
      
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < halfSize; j++) {
          const evenIndex = i + j;
          const oddIndex = evenIndex + halfSize;
          
          const cos = Math.cos(step * j);
          const sin = -Math.sin(step * j);
          
          const tempReal = cos * real[oddIndex] - sin * imag[oddIndex];
          const tempImag = sin * real[oddIndex] + cos * imag[oddIndex];
          
          real[oddIndex] = real[evenIndex] - tempReal;
          imag[oddIndex] = imag[evenIndex] - tempImag;
          real[evenIndex] += tempReal;
          imag[evenIndex] += tempImag;
        }
      }
    }
    
    this.updateSpectrum(real, imag);
  }

  updateSpectrum(real, imag) {
    const n = real.length / 2;
    
    for (let i = 0; i < n; i++) {
      const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
      const db = 20 * Math.log10(magnitude + 0.0001);
      const normalized = (db + 100) / 100;
      
      const smoothed = this.spectrumData[i] * this.smoothing + normalized * (1 - this.smoothing);
      this.spectrumData[i] = Math.max(0, Math.min(1, smoothed));
      
      if (normalized > this.peakHold[i]) {
        this.peakHold[i] = normalized;
      } else {
        this.peakHold[i] *= 0.995;
      }
    }
  }

  getSpectrum() {
    return {
      data: Array.from(this.spectrumData),
      peakHold: Array.from(this.peakHold),
      centerFreq: this.centerFreq,
      span: this.span,
      sampleRate: this.sampleRate
    };
  }

  setCenterFreq(freq) {
    this.centerFreq = freq;
  }

  resetPeakHold() {
    this.peakHold.fill(0);
  }
}

module.exports = { SpectrumAnalyzer, RFSpectrumDisplay };
