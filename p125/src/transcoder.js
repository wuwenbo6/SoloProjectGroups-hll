const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const db = require('./database');

const activeSessions = new Map();

class TranscoderSession {
  constructor(streamKey, sessionId, rtmpUrl) {
    this.streamKey = streamKey;
    this.sessionId = sessionId;
    this.rtmpUrl = rtmpUrl;
    this.ffmpeg = null;
    this.outputDir = path.join(config.dash.outputDir, sessionId);
    this.isRunning = false;
    this.startTime = null;
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  buildFFmpegArgs() {
    const args = ['-y', '-nostdin', '-loglevel', 'info'];
    args.push('-fflags', '+genpts+discardcorrupt+igndts');
    args.push('-avioflags', 'direct');
    args.push('-i', this.rtmpUrl);
    
    const profiles = config.transcoding.profiles;
    const keyint = 30;
    
    profiles.forEach((profile, index) => {
      args.push('-map', '0:v:0');
      args.push('-map', '0:a:0');
    });
    
    args.push('-c:v', 'libx264');
    args.push('-preset', 'ultrafast');
    args.push('-tune', 'zerolatency');
    args.push('-g', keyint.toString());
    args.push('-keyint_min', keyint.toString());
    args.push('-sc_threshold', '0');
    args.push('-bf', '0');
    args.push('-b_strategy', '0');
    args.push('-rc-lookahead', '0');
    args.push('-refs', '1');
    args.push('-me_range', '16');
    args.push('-subq', '1');
    args.push('-trellis', '0');
    args.push('-aq-mode', '0');
    args.push('-threads', '4');
    args.push('-async', '1');
    args.push('-vsync', '1');
    
    args.push('-x264opts', 
      `nal-hrd=cbr:no-scenecut:rc-lookahead=0:intra-refresh=1:` +
      `keyint=${keyint}:min-keyint=${keyint}:bframes=0:ref=1:` +
      `fast-pskip=1:mixed-refs=0:weightp=0:8x8dct=0:cqm=flat`
    );
    
    args.push('-force_key_frames', `expr:eq(mod(n,${keyint}),0)`);
    
    args.push('-c:a', 'aac');
    args.push('-ac', '2');
    args.push('-ar', '44100');
    args.push('-profile:a', 'aac_low');
    args.push('-cutoff', '18000');
    
    profiles.forEach((profile, index) => {
      const [width, height] = profile.resolution.split('x');
      const bitrateK = parseInt(profile.bitrate);
      
      args.push(`-filter:v:${index}`, 
        `fps=30,scale=${width}:${height}:flags=fast_bilinear`
      );
      args.push(`-b:v:${index}`, profile.bitrate);
      args.push(`-maxrate:v:${index}`, profile.bitrate);
      args.push(`-bufsize:v:${index}`, bitrateK + 'k');
      args.push(`-profile:v:${index}`, 'high');
      args.push(`-level:v:${index}`, '4.0');
      args.push(`-b:a:${index}`, profile.audioBitrate);
    });
    
    args.push('-f', 'dash');
    args.push('-use_timeline', '1');
    args.push('-use_template', '1');
    args.push('-seg_duration', config.dash.segmentDuration.toString());
    args.push('-frag_duration', config.dash.llDashChunkDuration.toString());
    args.push('-frag_type', 'duration');
    args.push('-window_size', config.dash.windowSize.toString());
    args.push('-extra_window_size', config.dash.extraWindowSize.toString());
    args.push('-remove_at_exit', '1');
    args.push('-single_file', '0');
    args.push('-init_seg_name', 'init-$RepresentationID$.m4s');
    args.push('-media_seg_name', 'chunk-$RepresentationID$-$Number%05d$.m4s');
    args.push('-adaptation_sets', 'id=0,streams=v id=1,streams=a');
    args.push('-streaming', '1');
    args.push('-ignore_io_errors', '1');
    
    if (config.dash.llDashEnabled) {
      args.push('-ldash', '1');
      args.push('-target_latency', config.dash.targetLatency.toString());
      args.push('-min_buffer_time', config.dash.minBufferTime.toString());
      args.push('-write_prft', '1');
      args.push('-utc_timing', '/usr/share/zoneinfo/UTC');
    }
    
    args.push(path.join(this.outputDir, 'stream.mpd'));
    
    return args;
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        this.ensureOutputDir();
        
        const ffmpegArgs = this.buildFFmpegArgs();
        console.log('Starting FFmpeg with args:', ffmpegArgs.join(' '));
        
        this.ffmpeg = spawn('ffmpeg', ffmpegArgs, {
          stdio: ['ignore', 'pipe', 'pipe']
        });

        this.ffmpeg.stdout.on('data', (data) => {
          console.log(`[FFmpeg-out ${this.sessionId}]`, data.toString());
        });

        this.ffmpeg.stderr.on('data', (data) => {
          const output = data.toString();
          if (output.includes('Error') || output.includes('error')) {
            console.error(`[FFmpeg-err ${this.sessionId}]`, output);
          } else {
            console.log(`[FFmpeg ${this.sessionId}]`, output.substring(0, 200));
          }
        });

        this.ffmpeg.on('exit', (code, signal) => {
          this.isRunning = false;
          console.log(`FFmpeg exited with code ${code}, signal ${signal} for session ${this.sessionId}`);
          db.endStreamSession(this.sessionId);
          activeSessions.delete(this.sessionId);
        });

        this.ffmpeg.on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        });

        this.isRunning = true;
        this.startTime = Date.now();
        resolve(this);
      } catch (err) {
        reject(err);
      }
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.ffmpeg && !this.ffmpeg.killed) {
        console.log(`Stopping FFmpeg for session ${this.sessionId}`);
        this.ffmpeg.kill('SIGINT');
        
        setTimeout(() => {
          if (this.ffmpeg && !this.ffmpeg.killed) {
            this.ffmpeg.kill('SIGKILL');
          }
          resolve();
        }, 2000);
      } else {
        resolve();
      }
    });
  }

  cleanup() {
    return this.stop().then(() => {
      if (fs.existsSync(this.outputDir)) {
        setTimeout(() => {
          fs.rm(this.outputDir, { recursive: true, force: true }, (err) => {
            if (err) console.error('Cleanup error:', err);
            else console.log(`Cleaned up session ${this.sessionId}`);
          });
        }, 10000);
      }
    });
  }

  getStats() {
    return {
      sessionId: this.sessionId,
      streamKey: this.streamKey,
      isRunning: this.isRunning,
      startTime: this.startTime,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      outputDir: this.outputDir
    };
  }
}

function createSession(streamKey, sessionId, rtmpUrl, clientIp) {
  if (activeSessions.has(sessionId)) {
    return activeSessions.get(sessionId);
  }

  const session = new TranscoderSession(streamKey, sessionId, rtmpUrl);
  activeSessions.set(sessionId, session);
  
  db.createStreamSession(streamKey, sessionId, clientIp);
  
  return session;
}

function getSession(sessionId) {
  return activeSessions.get(sessionId);
}

function removeSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.cleanup();
    activeSessions.delete(sessionId);
  }
}

function getAllSessions() {
  return Array.from(activeSessions.values()).map(s => s.getStats());
}

module.exports = {
  createSession,
  getSession,
  removeSession,
  getAllSessions,
  TranscoderSession
};
