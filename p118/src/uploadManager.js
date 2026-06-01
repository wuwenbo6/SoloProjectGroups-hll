const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

class UploadManager extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
    this.uploadQueue = [];
    this.isUploading = false;
    this.maxRetries = 3;
    this.retryDelay = 5000;
    this.uploadServerUrl = 'https://api.example.com/upload';
    this.uploadToken = '';
    this.autoUploadEnabled = true;
    this.uploadOnCollision = true;
    this.uploadOnNearMiss = false;
    this.includeVideo = true;
    this.includeMetadata = true;
    this.concurrentUploads = 1;
    this.currentUploads = 0;
  }

  setConfig(config) {
    if (config.uploadServerUrl !== undefined) {
      this.uploadServerUrl = config.uploadServerUrl;
    }
    if (config.uploadToken !== undefined) {
      this.uploadToken = config.uploadToken;
    }
    if (config.autoUploadEnabled !== undefined) {
      this.autoUploadEnabled = config.autoUploadEnabled;
    }
    if (config.uploadOnCollision !== undefined) {
      this.uploadOnCollision = config.uploadOnCollision;
    }
    if (config.uploadOnNearMiss !== undefined) {
      this.uploadOnNearMiss = config.uploadOnNearMiss;
    }
    if (config.maxRetries !== undefined) {
      this.maxRetries = config.maxRetries;
    }
    if (config.concurrentUploads !== undefined) {
      this.concurrentUploads = config.concurrentUploads;
    }
    
    console.log(`上传配置已更新: 服务器=${this.uploadServerUrl}, 自动上传=${this.autoUploadEnabled}`);
  }

  autoUpload(emergencyRecord, reason) {
    if (!this.autoUploadEnabled) {
      console.log('自动上传已禁用');
      return null;
    }
    
    if (reason === 'collision' && !this.uploadOnCollision) {
      console.log('碰撞事件自动上传已禁用');
      return null;
    }
    
    if (reason === 'nearmiss' && !this.uploadOnNearMiss) {
      console.log('接近事件自动上传已禁用');
      return null;
    }
    
    return this.queueUpload(emergencyRecord, reason);
  }

  queueUpload(emergencyRecord, reason = 'manual') {
    const uploadTask = {
      id: `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      emergencyRecord,
      reason,
      status: 'pending',
      retryCount: 0,
      progress: 0,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      error: null
    };
    
    this.uploadQueue.push(uploadTask);
    this.db.addUploadTask(uploadTask);
    
    this.emit('upload:queued', uploadTask);
    console.log(`上传任务已入队: ${uploadTask.id}, 原因: ${reason}`);
    
    this.processQueue();
    
    return uploadTask;
  }

  async processQueue() {
    if (this.isUploading || this.currentUploads >= this.concurrentUploads) {
      return;
    }
    
    const pendingTask = this.uploadQueue.find(t => t.status === 'pending');
    if (!pendingTask) {
      return;
    }
    
    this.isUploading = true;
    this.currentUploads++;
    
    try {
      await this.executeUpload(pendingTask);
    } catch (e) {
      console.error('上传任务处理失败:', e);
    } finally {
      this.currentUploads--;
      this.isUploading = false;
      
      const remainingPending = this.uploadQueue.filter(t => t.status === 'pending');
      if (remainingPending.length > 0) {
        setTimeout(() => this.processQueue(), 100);
      }
    }
  }

  async executeUpload(task) {
    task.status = 'uploading';
    task.startedAt = new Date().toISOString();
    this.db.updateUploadTaskStatus(task.id, 'uploading', 0);
    this.emit('upload:started', task);
    
    try {
      const formData = this.buildUploadFormData(task);
      
      const result = await this.uploadToServer(formData, (progress) => {
        task.progress = progress;
        this.db.updateUploadTaskProgress(task.id, progress);
        this.emit('upload:progress', { id: task.id, progress });
      });
      
      task.status = 'completed';
      task.progress = 100;
      task.completedAt = new Date().toISOString();
      task.serverResponse = result;
      
      this.db.updateUploadTaskStatus(task.id, 'completed', 100);
      this.db.updateUploadResponse(task.id, JSON.stringify(result));
      
      this.emit('upload:completed', task);
      console.log(`上传完成: ${task.id}`);
      
      return result;
    } catch (error) {
      task.retryCount++;
      task.error = error.message;
      
      if (task.retryCount < this.maxRetries) {
        task.status = 'pending';
        this.db.updateUploadTaskStatus(task.id, 'pending', 0, error.message);
        this.emit('upload:retrying', { id: task.id, retryCount: task.retryCount, error: error.message });
        
        console.log(`上传失败，将在${this.retryDelay / 1000}秒后重试(${task.retryCount}/${this.maxRetries}): ${task.id}`);
        
        setTimeout(() => {
          const retryTask = this.uploadQueue.find(t => t.id === task.id);
          if (retryTask && retryTask.status === 'pending') {
            this.processQueue();
          }
        }, this.retryDelay);
      } else {
        task.status = 'failed';
        this.db.updateUploadTaskStatus(task.id, 'failed', 0, error.message);
        this.emit('upload:failed', task);
        console.error(`上传失败，已达最大重试次数: ${task.id}`, error);
      }
      
      throw error;
    }
  }

  buildUploadFormData(task) {
    const record = task.emergencyRecord;
    const formData = {
      metadata: {
        id: record.emergencyId || record.id,
        reason: record.reason,
        triggerTimestamp: record.triggerTimestamp,
        preDuration: record.preDuration,
        postDuration: record.postDuration,
        totalDuration: record.totalDuration,
        eventData: record.eventData,
        sourceVideo: record.sourceVideoPath
      }
    };
    
    if (this.includeVideo && record.outputPath && fs.existsSync(record.outputPath)) {
      formData.video = fs.createReadStream(record.outputPath);
      formData.metadata.videoFile = path.basename(record.outputPath);
      formData.metadata.fileSize = record.fileSize;
    }
    
    if (record.thumbnailPath && fs.existsSync(record.thumbnailPath)) {
      formData.thumbnail = fs.createReadStream(record.thumbnailPath);
      formData.metadata.thumbnailFile = path.basename(record.thumbnailPath);
    }
    
    if (this.includeMetadata) {
      const events = this.db.getEventsByVideoId(record.videoId);
      formData.metadata.events = events;
    }
    
    return formData;
  }

  uploadToServer(formData, onProgress) {
    return new Promise((resolve, reject) => {
      const boundary = `DashCamBoundary_${Date.now()}`;
      const dataParts = [];
      
      if (formData.metadata) {
        dataParts.push(
          `--${boundary}\r\n`,
          'Content-Disposition: form-data; name="metadata"\r\n',
          'Content-Type: application/json\r\n\r\n',
          JSON.stringify(formData.metadata),
          '\r\n'
        );
      }
      
      const fileFields = [];
      if (formData.video) fileFields.push({ name: 'video', stream: formData.video });
      if (formData.thumbnail) fileFields.push({ name: 'thumbnail', stream: formData.thumbnail });
      
      const uploadOptions = {
        serverUrl: this.uploadServerUrl,
        token: this.uploadToken,
        boundary,
        dataParts,
        fileFields,
        onProgress
      };
      
      this.simulateUpload(uploadOptions)
        .then(resolve)
        .catch(reject);
    });
  }

  async simulateUpload(options) {
    const totalSteps = 100;
    const stepDelay = 50;
    
    for (let i = 0; i <= totalSteps; i++) {
      await this.sleep(stepDelay);
      if (options.onProgress) {
        options.onProgress(i);
      }
      
      if (i === 30 && Math.random() < 0.1) {
        throw new Error('模拟上传失败：网络超时');
      }
    }
    
    return {
      success: true,
      uploadId: `server_${Date.now()}`,
      url: `${this.uploadServerUrl}/uploads/${Date.now()}`,
      timestamp: new Date().toISOString()
    };
  }

  cancelUpload(uploadId) {
    const task = this.uploadQueue.find(t => t.id === uploadId);
    if (task) {
      if (task.status === 'uploading') {
        task.status = 'cancelled';
        this.db.updateUploadTaskStatus(uploadId, 'cancelled', 0, '用户取消');
        this.emit('upload:cancelled', task);
        console.log(`上传已取消: ${uploadId}`);
        return true;
      } else if (task.status === 'pending') {
        task.status = 'cancelled';
        this.uploadQueue = this.uploadQueue.filter(t => t.id !== uploadId);
        this.db.updateUploadTaskStatus(uploadId, 'cancelled', 0, '用户取消');
        this.emit('upload:cancelled', task);
        return true;
      }
    }
    return false;
  }

  retryUpload(uploadId) {
    const task = this.uploadQueue.find(t => t.id === uploadId);
    if (task && (task.status === 'failed' || task.status === 'cancelled')) {
      task.status = 'pending';
      task.retryCount = 0;
      task.error = null;
      this.db.updateUploadTaskStatus(uploadId, 'pending', 0);
      this.emit('upload:retrying', { id: uploadId, retryCount: 0 });
      this.processQueue();
      return true;
    }
    return false;
  }

  getUploadQueue() {
    return this.uploadQueue.map(task => ({
      id: task.id,
      reason: task.reason,
      status: task.status,
      progress: task.progress,
      retryCount: task.retryCount,
      error: task.error,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      emergencyRecord: task.emergencyRecord ? {
        id: task.emergencyRecord.id,
        reason: task.emergencyRecord.reason,
        totalDuration: task.emergencyRecord.totalDuration
      } : null
    }));
  }

  getUploadHistory(filters = {}) {
    return this.db.getUploadTasks(filters);
  }

  getStatus() {
    const pendingCount = this.uploadQueue.filter(t => t.status === 'pending').length;
    const uploadingCount = this.uploadQueue.filter(t => t.status === 'uploading').length;
    const completedCount = this.uploadQueue.filter(t => t.status === 'completed').length;
    const failedCount = this.uploadQueue.filter(t => t.status === 'failed').length;
    
    return {
      autoUploadEnabled: this.autoUploadEnabled,
      uploadServerUrl: this.uploadServerUrl,
      queueSize: this.uploadQueue.length,
      pendingCount,
      uploadingCount,
      completedCount,
      failedCount,
      currentUploads: this.currentUploads,
      maxRetries: this.maxRetries
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = UploadManager;
