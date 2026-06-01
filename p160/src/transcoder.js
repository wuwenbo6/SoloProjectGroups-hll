const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class AudioTranscoder {
  constructor() {
    this.ffmpegPath = this.findFFmpeg();
  }

  findFFmpeg() {
    const possiblePaths = [
      '/usr/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/opt/homebrew/bin/ffmpeg',
      '/usr/bin/avconv',
      '/usr/local/bin/avconv'
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return 'ffmpeg';
  }

  isAvailable() {
    return new Promise((resolve) => {
      const proc = spawn(this.ffmpegPath, ['-version']);
      proc.on('error', () => resolve(false));
      proc.on('exit', (code) => resolve(code === 0));
    });
  }

  transcodeFLACToLPCM(inputPath, options = {}) {
    const {
      sampleRate = 44100,
      channels = 2,
      bitDepth = 16
    } = options;

    const args = [
      '-i', inputPath,
      '-f', 's16be',
      '-acodec', 'pcm_s16be',
      '-ar', sampleRate.toString(),
      '-ac', channels.toString(),
      '-'
    ];

    const ffmpeg = spawn(this.ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    ffmpeg.stderr.on('data', (data) => {
    });

    ffmpeg.on('error', (err) => {
      console.error('FFmpeg error:', err.message);
    });

    return ffmpeg.stdout;
  }

  getLPCMHeaders(fileSize, duration, sampleRate = 44100, channels = 2, bitDepth = 16) {
    const byteRate = (sampleRate * channels * bitDepth) / 8;
    
    return {
      'Content-Type': 'audio/L16;rate=44100;channels=2',
      'transferMode.dlna.org': 'Streaming',
      'contentFeatures.dlna.org': 'DLNA.ORG_PN=LPCM;DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000',
      'Accept-Ranges': 'none'
    };
  }

  async getAudioInfo(inputPath) {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        inputPath
      ];

      const ffprobe = spawn('ffprobe', args);
      let output = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('error', reject);
      ffprobe.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error('ffprobe exited with code ' + code));
          return;
        }

        try {
          const info = JSON.parse(output);
          const audioStream = info.streams?.find(s => s.codec_type === 'audio');
          
          resolve({
            duration: parseFloat(info.format?.duration) || 0,
            sampleRate: parseInt(audioStream?.sample_rate) || 44100,
            channels: parseInt(audioStream?.channels) || 2,
            bitRate: parseInt(info.format?.bit_rate) || 0,
            codec: audioStream?.codec_name || 'unknown'
          });
        } catch (err) {
          reject(err);
        }
      });
    });
  }
}

module.exports = new AudioTranscoder();
