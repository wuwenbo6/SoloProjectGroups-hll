const { spawn } = require('child_process');
const EventEmitter = require('events');

class FMReceiver extends EventEmitter {
  constructor() {
    super();
    this.rtlfmProcess = null;
    this.currentFrequency = null;
    this.sampleRate = 256000;
    this.audioRate = 48000;
    this.isRunning = false;
  }

  start(frequency, options = {}) {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        this.stop();
      }

      this.currentFrequency = frequency;
      const freqStr = `${frequency}M`;
      
      const args = [
        '-f', freqStr,
        '-s', this.sampleRate.toString(),
        '-r', this.audioRate.toString(),
        '-M', 'fm',
        '-l', '0',
        '-g', options.gain || '40',
        '-p', options.ppm || '0',
        '-'
      ];

      console.log('Starting rtl_fm with args:', args.join(' '));
      
      this.rtlfmProcess = spawn('rtl_fm', args);
      
      this.rtlfmProcess.stdout.on('data', (data) => {
        this.emit('audioData', data);
      });

      this.rtlfmProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('Tuned to')) {
          this.isRunning = true;
          console.log('RTL-FM tuned to', freqStr);
          resolve({ frequency, sampleRate: this.audioRate });
        }
      });

      this.rtlfmProcess.on('error', (err) => {
        console.error('rtl_fm process error:', err);
        reject(new Error('Failed to start rtl_fm. Make sure rtl-sdr is installed.'));
      });

      this.rtlfmProcess.on('close', (code) => {
        this.isRunning = false;
        console.log('rtl_fm process exited with code', code);
        this.emit('stopped', code);
      });

      setTimeout(() => {
        if (!this.isRunning) {
          reject(new Error('Timeout waiting for rtl_fm to start'));
        }
      }, 5000);
    });
  }

  stop() {
    if (this.rtlfmProcess) {
      this.rtlfmProcess.kill('SIGTERM');
      this.rtlfmProcess = null;
    }
    this.isRunning = false;
    this.currentFrequency = null;
  }

  getAudioStream() {
    if (this.rtlfmProcess) {
      return this.rtlfmProcess.stdout;
    }
    return null;
  }

  isActive() {
    return this.isRunning;
  }

  getFrequency() {
    return this.currentFrequency;
  }

  getAudioRate() {
    return this.audioRate;
  }
}

class FrequencyScanner extends EventEmitter {
  constructor() {
    super();
    this.isScanning = false;
    this.receiver = new FMReceiver();
  }

  async scanRange(startFreq, endFreq, step = 0.1) {
    if (this.isScanning) {
      throw new Error('Scanner is already running');
    }

    this.isScanning = true;
    const results = [];
    
    try {
      for (let freq = startFreq; freq <= endFreq; freq += step) {
        if (!this.isScanning) break;
        
        freq = Math.round(freq * 10) / 10;
        
        this.emit('scanProgress', {
          current: freq,
          start: startFreq,
          end: endFreq,
          found: results.length
        });

        const signalStrength = await this.checkFrequency(freq);
        
        if (signalStrength > -50) {
          const station = {
            frequency: freq,
            signal: signalStrength,
            name: `FM ${freq}`,
            type: 'Unknown'
          };
          results.push(station);
          this.emit('stationFound', station);
        }

        await this.delay(200);
      }
    } finally {
      this.receiver.stop();
      this.isScanning = false;
    }

    this.emit('scanComplete', results);
    return results;
  }

  async checkFrequency(frequency) {
    return new Promise((resolve) => {
      const freqStr = `${frequency}M`;
      const args = [
        '-f', freqStr,
        '-s', '256000',
        '-r', '48000',
        '-M', 'fm',
        '-T',
        '-'
      ];

      const process = spawn('rtl_fm', args);
      let maxSignal = -100;
      let samples = 0;

      process.stdout.on('data', () => {
        samples++;
      });

      process.stderr.on('data', (data) => {
        const msg = data.toString();
        const signalMatch = msg.match(/signal:\s*([-\d.]+)/);
        if (signalMatch) {
          maxSignal = Math.max(maxSignal, parseFloat(signalMatch[1]));
        }
      });

      setTimeout(() => {
        process.kill();
        resolve(samples > 10 ? maxSignal : -100);
      }, 300);
    });
  }

  stop() {
    this.isScanning = false;
    this.receiver.stop();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { FMReceiver, FrequencyScanner };
