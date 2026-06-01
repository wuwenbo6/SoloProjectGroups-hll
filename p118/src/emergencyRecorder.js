const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

class EmergencyRecorder extends EventEmitter {
  constructor(db, app) {
    super();
    this.db = db;
    this.app = app;
    this.isRecording = false;
    this.frameBuffer = [];
    this.bufferSize = 0;
    this.maxBufferSeconds = 30;
    this.postEventSeconds = 10;
    this.fps = 30;
    this.currentVideoId = null;
    this.currentVideoPath = null;
    this.videoWriter = null;
    this.pendingSave = null;
    this.saveTimeout = null;
    this.emergencyDir = null;
    this.isSaving = false;
    
    this.initEmergencyDir();
  }

  initEmergencyDir() {
    try {
      const userDataPath = this.app.getPath('userData');
      this.emergencyDir = path.join(userDataPath, 'emergency_videos');
      
      if (!fs.existsSync(this.emergencyDir)) {
        fs.mkdirSync(this.emergencyDir, { recursive: true });
      }
      
      console.log('紧急录像目录:', this.emergencyDir);
    } catch (e) {
      console.error('初始化紧急录像目录失败:', e);
      this.emergencyDir = path.join(process.cwd(), 'emergency_videos');
      if (!fs.existsSync(this.emergencyDir)) {
        fs.mkdirSync(this.emergencyDir, { recursive: true });
      }
    }
  }

  setConfig(config) {
    if (config.preEventSeconds !== undefined) {
      this.maxBufferSeconds = Math.max(5, Math.min(60, config.preEventSeconds));
    }
    if (config.postEventSeconds !== undefined) {
      this.postEventSeconds = Math.max(5, Math.min(30, config.postEventSeconds));
    }
    if (config.fps !== undefined) {
      this.fps = config.fps;
    }
    
    this.bufferSize = this.maxBufferSeconds * this.fps;
    console.log(`紧急录像配置: 前置${this.maxBufferSeconds}秒, 后置${this.postEventSeconds}秒, 缓冲${this.bufferSize}帧`);
  }

  start(videoPath, videoId) {
    this.currentVideoPath = videoPath;
    this.currentVideoId = videoId;
    this.isRecording = true;
    this.frameBuffer = [];
    this.pendingSave = null;
    this.isSaving = false;
    
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    
    console.log('紧急录像模式已启动:', path.basename(videoPath));
    this.emit('recorder:started', { videoId, videoPath });
  }

  addFrame(frame, frameNumber, timestamp) {
    if (!this.isRecording) return;
    
    const frameData = {
      frame,
      frameNumber,
      timestamp,
      savedAt: Date.now()
    };
    
    this.frameBuffer.push(frameData);
    
    if (this.frameBuffer.length > this.bufferSize) {
      this.frameBuffer.shift();
    }
    
    if (this.pendingSave && this.isSaving) {
      this.pendingSave.postFrames.push(frameData);
      
      const postSecondsRecorded = (this.pendingSave.postFrames.length / this.fps);
      if (postSecondsRecorded >= this.postEventSeconds) {
        this.completeEmergencySave();
      }
    }
  }

  triggerEmergency(reason = 'manual', eventData = {}) {
    if (!this.isRecording) {
      console.warn('紧急录像触发失败: 未在录像中');
      return null;
    }
    
    if (this.isSaving) {
      console.log('已有紧急录像正在保存，忽略重复触发');
      return this.pendingSave;
    }
    
    console.log(`触发紧急录像: ${reason}`);
    
    const emergencyId = `emergency_${Date.now()}`;
    const preFrames = [...this.frameBuffer];
    const triggerFrame = preFrames.length > 0 ? preFrames[preFrames.length - 1] : null;
    
    this.pendingSave = {
      id: emergencyId,
      reason,
      eventData,
      triggerTime: Date.now(),
      triggerFrame: triggerFrame ? triggerFrame.frameNumber : 0,
      triggerTimestamp: triggerFrame ? triggerFrame.timestamp : 0,
      preFrames,
      postFrames: [],
      status: 'recording'
    };
    
    this.isSaving = true;
    
    this.emit('emergency:triggered', {
      id: emergencyId,
      reason,
      eventData,
      preSeconds: preFrames.length / this.fps,
      postSeconds: this.postEventSeconds
    });
    
    this.saveTimeout = setTimeout(() => {
      if (this.isSaving) {
        this.completeEmergencySave();
      }
    }, this.postEventSeconds * 1000 + 2000);
    
    return this.pendingSave;
  }

  async completeEmergencySave() {
    if (!this.pendingSave) return;
    
    try {
      const { preFrames, postFrames, triggerFrame, triggerTimestamp } = this.pendingSave;
      const allFrames = [...preFrames, ...postFrames];
      
      const fileName = `emergency_${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
      const outputPath = path.join(this.emergencyDir, fileName);
      
      const videoInfo = await this.saveFramesToVideo(allFrames, outputPath);
      
      const thumbnailPath = await this.saveThumbnail(
        preFrames.length > 0 ? preFrames[preFrames.length - 1].frame : null,
        outputPath.replace('.mp4', '.jpg')
      );
      
      const record = {
        emergencyId: this.pendingSave.id,
        videoId: this.currentVideoId,
        sourceVideoPath: this.currentVideoPath,
        outputPath,
        thumbnailPath,
        reason: this.pendingSave.reason,
        eventData: JSON.stringify(this.pendingSave.eventData),
        triggerFrame,
        triggerTimestamp,
        preDuration: preFrames.length / this.fps,
        postDuration: postFrames.length / this.fps,
        totalDuration: allFrames.length / this.fps,
        totalFrames: allFrames.length,
        fps: this.fps,
        width: videoInfo.width,
        height: videoInfo.height,
        fileSize: videoInfo.fileSize,
        status: 'saved'
      };
      
      const dbId = this.db.addEmergencyRecord(record);
      record.id = dbId;
      
      this.emit('emergency:saved', record);
      console.log(`紧急录像已保存: ${outputPath}, ${record.totalDuration.toFixed(1)}秒`);
      
      return record;
    } catch (e) {
      console.error('保存紧急录像失败:', e);
      this.emit('emergency:error', { error: e.message, id: this.pendingSave?.id });
      return null;
    } finally {
      this.pendingSave = null;
      this.isSaving = false;
      
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }
    }
  }

  async saveFramesToVideo(frames, outputPath) {
    return new Promise((resolve, reject) => {
      try {
        if (frames.length === 0) {
          reject(new Error('没有帧可保存'));
          return;
        }
        
        const width = frames[0].frame.cols || 1280;
        const height = frames[0].frame.rows || 720;
        
        let fileSize = 0;
        let writtenFrames = 0;
        
        try {
          const cv = require('opencv4nodejs');
          const writer = new cv.VideoWriter(
            outputPath,
            cv.VideoWriter.fourcc('m', 'p', '4', 'v'),
            this.fps,
            new cv.Size(width, height),
            true
          );
          
          for (const frameData of frames) {
            writer.write(frameData.frame);
            writtenFrames++;
          }
          
          writer.release();
          
          if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            fileSize = stats.size;
          }
        } catch (e) {
          console.log('OpenCV保存视频失败，使用帧存储:', e.message);
          
          const framesDir = outputPath.replace('.mp4', '_frames');
          if (!fs.existsSync(framesDir)) {
            fs.mkdirSync(framesDir, { recursive: true });
          }
          
          const cv = require('opencv4nodejs');
          for (let i = 0; i < frames.length; i++) {
            const framePath = path.join(framesDir, `frame_${i.toString().padStart(6, '0')}.jpg`);
            cv.imwrite(framePath, frames[i].frame);
          }
          
          const metadata = {
            fps: this.fps,
            width,
            height,
            frameCount: frames.length,
            sourceVideo: this.currentVideoPath
          };
          
          fs.writeFileSync(
            outputPath.replace('.mp4', '_metadata.json'),
            JSON.stringify(metadata, null, 2)
          );
          
          fileSize = this.getDirectorySize(framesDir);
        }
        
        resolve({ width, height, fileSize, frames: writtenFrames || frames.length });
      } catch (e) {
        reject(e);
      }
    });
  }

  async saveThumbnail(frame, outputPath) {
    try {
      if (!frame) return null;
      
      const cv = require('opencv4nodejs');
      const smallFrame = frame.rescale(0.5);
      cv.imwrite(outputPath, smallFrame);
      
      return outputPath;
    } catch (e) {
      console.log('保存缩略图失败:', e.message);
      return null;
    }
  }

  getDirectorySize(dirPath) {
    let size = 0;
    if (!fs.existsSync(dirPath)) return size;
    
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        size += stats.size;
      }
    }
    return size;
  }

  triggerManual() {
    return this.triggerEmergency('manual', { type: 'user_triggered' });
  }

  triggerCollision(eventData) {
    return this.triggerEmergency('collision', { 
      type: 'collision',
      ...eventData 
    });
  }

  triggerNearMiss(eventData) {
    return this.triggerEmergency('nearmiss', { 
      type: 'nearmiss',
      ...eventData 
    });
  }

  getEmergencyRecords(filters = {}) {
    return this.db.getEmergencyRecords(filters);
  }

  getEmergencyRecordById(id) {
    return this.db.getEmergencyRecordById(id);
  }

  deleteEmergencyRecord(id) {
    const record = this.db.getEmergencyRecordById(id);
    if (record) {
      try {
        if (record.output_path && fs.existsSync(record.output_path)) {
          fs.unlinkSync(record.output_path);
        }
        if (record.thumbnail_path && fs.existsSync(record.thumbnail_path)) {
          fs.unlinkSync(record.thumbnail_path);
        }
      } catch (e) {
        console.warn('删除紧急录像文件失败:', e);
      }
    }
    return this.db.deleteEmergencyRecord(id);
  }

  getStatus() {
    return {
      isRecording: this.isRecording,
      isSaving: this.isSaving,
      bufferSize: this.frameBuffer.length,
      maxBufferSize: this.bufferSize,
      bufferSeconds: this.frameBuffer.length / this.fps,
      maxBufferSeconds: this.maxBufferSeconds,
      postEventSeconds: this.postEventSeconds,
      emergencyDir: this.emergencyDir,
      currentVideoId: this.currentVideoId,
      pendingSave: this.pendingSave ? {
        id: this.pendingSave.id,
        reason: this.pendingSave.reason,
        triggerTime: this.pendingSave.triggerTime,
        preFrames: this.pendingSave.preFrames.length,
        postFrames: this.pendingSave.postFrames.length
      } : null
    };
  }

  stop() {
    this.isRecording = false;
    
    if (this.isSaving && this.pendingSave) {
      this.completeEmergencySave();
    }
    
    this.frameBuffer = [];
    this.currentVideoId = null;
    this.currentVideoPath = null;
    
    console.log('紧急录像模式已停止');
    this.emit('recorder:stopped');
  }
}

module.exports = EmergencyRecorder;
