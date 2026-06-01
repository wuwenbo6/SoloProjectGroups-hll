const EventEmitter = require('events');
const converter = require('./converter');
const watermarkService = require('./watermark');
const thumbnailService = require('./thumbnail');
const db = require('../database/db');
const path = require('path');
const fs = require('fs');

class ConversionQueue extends EventEmitter {
  constructor(maxConcurrent = 2) {
    super();
    this.queue = [];
    this.processing = new Set();
    this.maxConcurrent = maxConcurrent;
  }

  add(job) {
    this.queue.push(job);
    this.emit('queued', job.id);
    this.processNext();
  }

  async processNext() {
    if (this.processing.size >= this.maxConcurrent) {
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    this.processing.add(job.id);
    
    this.emit('processing', job.id);
    await db.updateConversionStatus(job.id, 'processing');

    try {
      const outputDir = path.dirname(job.outputBasePath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPaths = {};
      const formats = Array.isArray(job.formats) ? job.formats : [job.formats];

      for (const format of formats) {
        console.log(`Converting ${job.id} to ${format}...`);
        const outputPath = await converter.convert(job.inputPath, format, outputDir);
        
        if (format === 'pdf' && job.watermarkConfig && job.watermarkConfig.enabled) {
          console.log(`Adding watermark to ${job.id}...`);
          await watermarkService.addWatermarkToPdf(outputPath, job.watermarkConfig);
        }
        
        outputPaths[format] = outputPath;
      }

      if (job.createThumbnail && outputPaths['pdf']) {
        console.log(`Generating thumbnail for ${job.id}...`);
        const thumbnailPath = await thumbnailService.generateThumbnail(
          outputPaths['pdf'],
          job.id,
          outputDir
        );
        if (thumbnailPath) {
          await db.updateThumbnailPath(job.id, thumbnailPath);
        }
      }
      
      await db.updateConversionStatus(job.id, 'completed', outputPaths);
      this.emit('completed', job.id, outputPaths);
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      await db.updateConversionStatus(job.id, 'failed', null, error.message);
      this.emit('failed', job.id, error.message);
    } finally {
      this.processing.delete(job.id);
      this.processNext();
    }
  }

  getStatus(jobId) {
    if (this.processing.has(jobId)) {
      return 'processing';
    }
    const queuedJob = this.queue.find(j => j.id === jobId);
    if (queuedJob) {
      return 'queued';
    }
    return null;
  }

  getQueueLength() {
    return this.queue.length;
  }

  getProcessingCount() {
    return this.processing.size;
  }
}

module.exports = new ConversionQueue(2);
