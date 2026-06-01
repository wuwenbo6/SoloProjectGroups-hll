const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { PassThrough } = require('stream');

class AudioRecorder extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sampleRate = options.sampleRate || 48000;
    this.channels = options.channels || 1;
    this.outputDir = options.outputDir || this.getDefaultOutputDir();
    
    this.isRecording = false;
    this.isPaused = false;
    this.recordProcess = null;
    this.outputStream = null;
    this.currentFile = null;
    this.startTime = null;
    this.pauseTime = null;
    this.totalPausedDuration = 0;
    this.recordedSize = 0;
    
    this.timer = null;
    this.timerDuration = 0;
    this.timerRemaining = 0;
    this.isTimerActive = false;
    
    this.ensureOutputDir();
  }

  getDefaultOutputDir() {
    const home = process.env.HOME || process.env.USERPROFILE || '.';
    return path.join(home, 'FM_Recordings');
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  setOutputDir(dir) {
    this.outputDir = dir;
    this.ensureOutputDir();
  }

  getOutputDir() {
    return this.outputDir;
  }

  generateFileName(prefix = 'FM_Recording') {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .substring(0, 19);
    return `${prefix}_${timestamp}.mp3`;
  }

  start(inputStream, options = {}) {
    return new Promise((resolve, reject) => {
      if (this.isRecording) {
        reject(new Error('Already recording'));
        return;
      }

      const fileName = options.fileName || this.generateFileName(options.prefix);
      const filePath = path.join(this.outputDir, fileName);
      
      this.ensureOutputDir();

      const args = [
        '-f', 's16le',
        '-ar', this.sampleRate.toString(),
        '-ac', this.channels.toString(),
        '-i', '-',
        '-c:a', 'libmp3lame',
        '-b:a', options.bitrate || '192k',
        '-y',
        filePath
      ];

      console.log('Starting recording to:', filePath);
      
      this.recordProcess = spawn('ffmpeg', args);
      this.outputStream = new PassThrough();
      
      inputStream.pipe(this.outputStream);
      this.outputStream.pipe(this.recordProcess.stdin);

      this.recordProcess.stdout.on('data', (data) => {
      });

      this.recordProcess.stderr.on('data', (data) => {
        this.parseFFmpegOutput(data.toString());
      });

      this.recordProcess.on('error', (err) => {
        console.error('Recording process error:', err);
        this.isRecording = false;
        reject(err);
      });

      this.recordProcess.on('close', (code) => {
        console.log('Recording process exited with code', code);
        if (this.isRecording) {
          this.emit('recordStopped', { 
            filePath: this.currentFile,
            duration: this.getDuration(),
            size: this.recordedSize
          });
        }
        this.isRecording = false;
      });

      this.currentFile = filePath;
      this.isRecording = true;
      this.isPaused = false;
      this.startTime = Date.now();
      this.totalPausedDuration = 0;
      this.recordedSize = 0;

      this.emit('recordStarted', { filePath, fileName });
      resolve({ filePath, fileName });
    });
  }

  parseFFmpegOutput(output) {
    const sizeMatch = output.match(/size=\s*(\d+)kB/);
    if (sizeMatch) {
      this.recordedSize = parseInt(sizeMatch[1]) * 1024;
      this.emit('recordProgress', {
        duration: this.getDuration(),
        size: this.recordedSize,
        file: this.currentFile
      });
    }
  }

  pause() {
    if (!this.isRecording || this.isPaused) return;
    
    this.isPaused = true;
    this.pauseTime = Date.now();
    
    if (this.outputStream) {
      this.outputStream.cork();
    }
    
    this.emit('recordPaused');
  }

  resume() {
    if (!this.isRecording || !this.isPaused) return;
    
    if (this.pauseTime) {
      this.totalPausedDuration += Date.now() - this.pauseTime;
      this.pauseTime = null;
    }
    
    this.isPaused = false;
    
    if (this.outputStream) {
      this.outputStream.uncork();
    }
    
    this.emit('recordResumed');
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.isRecording) {
        resolve({ filePath: this.currentFile });
        return;
      }

      this.stopTimer();

      if (this.recordProcess) {
        this.recordProcess.stdin.end();
        
        setTimeout(() => {
          if (this.recordProcess && !this.recordProcess.killed) {
            this.recordProcess.kill('SIGTERM');
          }
        }, 2000);
      }

      const result = {
        filePath: this.currentFile,
        duration: this.getDuration(),
        size: this.recordedSize
      };

      this.isRecording = false;
      this.isPaused = false;
      this.startTime = null;
      this.pauseTime = null;
      this.totalPausedDuration = 0;

      resolve(result);
    });
  }

  startTimer(durationSeconds, inputStream, options = {}) {
    return new Promise((resolve, reject) => {
      if (this.isTimerActive) {
        reject(new Error('Timer already active'));
        return;
      }

      this.timerDuration = durationSeconds;
      this.timerRemaining = durationSeconds;
      this.isTimerActive = true;

      this.start(inputStream, options)
        .then((result) => {
          this.emit('timerStarted', { 
            duration: durationSeconds,
            ...result 
          });

          this.timer = setInterval(() => {
            this.timerRemaining--;
            this.emit('timerTick', { 
              remaining: this.timerRemaining,
              total: this.timerDuration,
              elapsed: this.timerDuration - this.timerRemaining
            });

            if (this.timerRemaining <= 0) {
              this.stopTimer();
            }
          }, 1000);

          resolve(result);
        })
        .catch(reject);
    });
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    if (this.isTimerActive) {
      this.isTimerActive = false;
      this.emit('timerStopped');
    }

    return this.stop();
  }

  getDuration() {
    if (!this.startTime) return 0;
    
    const endTime = this.isPaused && this.pauseTime ? this.pauseTime : Date.now();
    const totalMs = endTime - this.startTime - this.totalPausedDuration;
    return Math.floor(totalMs / 1000);
  }

  getStatus() {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      isTimerActive: this.isTimerActive,
      currentFile: this.currentFile,
      duration: this.getDuration(),
      size: this.recordedSize,
      timerRemaining: this.timerRemaining,
      timerDuration: this.timerDuration,
      outputDir: this.outputDir
    };
  }

  getRecordingsList() {
    return new Promise((resolve, reject) => {
      this.ensureOutputDir();
      
      fs.readdir(this.outputDir, (err, files) => {
        if (err) {
          reject(err);
          return;
        }

        const recordings = [];
        files.forEach(file => {
          const filePath = path.join(this.outputDir, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile() && (file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.aac'))) {
              recordings.push({
                name: file,
                path: filePath,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
              });
            }
          } catch (e) {}
        });

        recordings.sort((a, b) => b.created - a.created);
        resolve(recordings);
      });
    });
  }

  deleteRecording(filePath) {
    return new Promise((resolve, reject) => {
      if (!filePath.startsWith(this.outputDir)) {
        reject(new Error('Invalid file path'));
        return;
      }

      fs.unlink(filePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  exportToWave(inputStream, outputPath) {
    return new Promise((resolve, reject) => {
      const args = [
        '-f', 's16le',
        '-ar', this.sampleRate.toString(),
        '-ac', this.channels.toString(),
        '-i', '-',
        '-c:a', 'pcm_s16le',
        '-y',
        outputPath
      ];

      const process = spawn('ffmpeg', args);
      inputStream.pipe(process.stdin);

      process.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`Export failed with code ${code}`));
        }
      });

      process.on('error', reject);
    });
  }
}

class TimerPresets {
  static getPresets() {
    return [
      { label: '5 分钟', value: 5 * 60 },
      { label: '10 分钟', value: 10 * 60 },
      { label: '15 分钟', value: 15 * 60 },
      { label: '30 分钟', value: 30 * 60 },
      { label: '1 小时', value: 60 * 60 },
      { label: '2 小时', value: 2 * 60 * 60 }
    ];
  }
}

module.exports = { AudioRecorder, TimerPresets };
