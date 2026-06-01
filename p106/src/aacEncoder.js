const { spawn } = require('child_process');
const EventEmitter = require('events');
const { PassThrough } = require('stream');

class AACEncoder extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sampleRate = options.sampleRate || 48000;
    this.channels = options.channels || 1;
    this.bitrate = options.bitrate || '128k';
    this.ffmpegProcess = null;
    this.outputStream = new PassThrough();
    this.isRunning = false;
  }

  start(inputStream) {
    return new Promise((resolve, reject) => {
      this.stop();

      const args = [
        '-f', 's16le',
        '-ar', this.sampleRate.toString(),
        '-ac', this.channels.toString(),
        '-i', '-',
        '-c:a', 'aac',
        '-b:a', this.bitrate,
        '-f', 'adts',
        '-'
      ];

      console.log('Starting FFmpeg AAC encoder with args:', args.join(' '));

      this.ffmpegProcess = spawn('ffmpeg', args);
      
      inputStream.pipe(this.ffmpegProcess.stdin);
      this.ffmpegProcess.stdout.pipe(this.outputStream);

      this.ffmpegProcess.stdout.on('data', (data) => {
        this.emit('aacData', data);
      });

      this.ffmpegProcess.stderr.on('data', (data) => {
      });

      this.ffmpegProcess.on('error', (err) => {
        console.error('FFmpeg error:', err);
        this.startFallbackEncoder(inputStream);
        resolve({ mode: 'fallback' });
      });

      this.ffmpegProcess.on('close', (code) => {
        this.isRunning = false;
        console.log('FFmpeg process exited with code', code);
      });

      setTimeout(() => {
        if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
          this.isRunning = true;
          resolve({ mode: 'ffmpeg' });
        }
      }, 1000);
    });
  }

  startFallbackEncoder(inputStream) {
    console.log('Starting fallback PCM streaming mode');
    this.fallbackStream = new PassThrough();
    
    inputStream.on('data', (data) => {
      this.fallbackStream.write(data);
      this.emit('aacData', data);
    });

    this.isRunning = true;
  }

  getOutputStream() {
    if (this.fallbackStream) {
      return this.fallbackStream;
    }
    return this.outputStream;
  }

  stop() {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGTERM');
      this.ffmpegProcess = null;
    }
    if (this.fallbackStream) {
      this.fallbackStream.end();
      this.fallbackStream = null;
    }
    this.isRunning = false;
  }

  isActive() {
    return this.isRunning;
  }
}

class ADTSParser {
  static getFrameSize(data) {
    if (data.length < 7) return 0;
    
    const protectionAbsent = (data[1] & 0x01) === 1;
    const headerSize = protectionAbsent ? 7 : 9;
    
    const frameSize = 
      ((data[3] & 0x03) << 11) |
      (data[4] << 3) |
      ((data[5] & 0xE0) >> 5);
    
    return frameSize;
  }

  static isValidHeader(data) {
    return data.length >= 2 && 
           data[0] === 0xFF && 
           (data[1] & 0xF0) === 0xF0;
  }
}

module.exports = { AACEncoder, ADTSParser };
