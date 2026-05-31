const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const db = require('../database/init');

class AnalyticsService {
  static analysisQueue = [];
  static isProcessing = false;
  static activeAnalyses = new Map();

  static async detect(cameraId, options = {}) {
    const { type = 'all', snapshot = false } = options;

    const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(cameraId);
    if (!camera) {
      throw new Error('Camera not found');
    }

    const result = {
      cameraId,
      timestamp: new Date().toISOString(),
      faces: [],
      licensePlates: [],
      objects: []
    };

    if (snapshot && camera.rtsp_uri) {
      const snapshotPath = await this.captureSnapshot(camera);
      result.snapshotPath = snapshotPath;
    }

    return result;
  }

  static async detectFaces(cameraId, imagePath = null) {
    const detections = [];
    
    const mockFaces = [
      { id: 1, confidence: 0.92, bounding_box: { x: 100, y: 50, width: 80, height: 100 }, attributes: { gender: 'male', age: 30 } },
      { id: 2, confidence: 0.85, bounding_box: { x: 250, y: 80, width: 70, height: 90 }, attributes: { gender: 'female', age: 25 } }
    ];

    for (const face of mockFaces) {
      const detectionId = await this.saveDetection(cameraId, 'face', face);
      detections.push({ id: detectionId, ...face });
    }

    return detections;
  }

  static async detectLicensePlates(cameraId, imagePath = null) {
    const detections = [];

    const mockPlates = [
      { plate_number: '京A12345', confidence: 0.88, bounding_box: { x: 300, y: 400, width: 150, height: 60 } },
      { plate_number: '沪B67890', confidence: 0.76, bounding_box: { x: 500, y: 350, width: 140, height: 55 } }
    ];

    for (const plate of mockPlates) {
      const detectionId = await this.saveDetection(cameraId, 'license_plate', plate);
      detections.push({ id: detectionId, ...plate });
    }

    return detections;
  }

  static async saveDetection(cameraId, detectionType, data) {
    const result = db.prepare(`
      INSERT INTO detection_results 
      (camera_id, detection_type, confidence, bounding_box, attributes, snapshot_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      cameraId,
      detectionType,
      data.confidence || 0,
      JSON.stringify(data.bounding_box || {}),
      JSON.stringify(data.attributes || {}),
      data.snapshotPath || ''
    );

    return result.lastInsertRowid;
  }

  static getDetections(cameraId = null, detectionType = null, limit = 100, offset = 0) {
    let query = `
      SELECT dr.*, c.name as camera_name
      FROM detection_results dr
      LEFT JOIN cameras c ON dr.camera_id = c.id
    `;
    const params = [];
    const conditions = [];

    if (cameraId) {
      conditions.push('dr.camera_id = ?');
      params.push(cameraId);
    }

    if (detectionType) {
      conditions.push('dr.detection_type = ?');
      params.push(detectionType);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY dr.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(query).all(...params);
  }

  static async captureSnapshot(camera) {
    return new Promise((resolve, reject) => {
      const outputDir = path.join(__dirname, '../snapshots');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = path.join(outputDir, `${camera.id}_${timestamp}.jpg`);

      if (!camera.rtsp_uri) {
        resolve(null);
        return;
      }

      const cmd = `ffmpeg -i "${camera.rtsp_uri}" -vframes 1 -q:v 2 -y "${outputPath}"`;
      
      exec(cmd, { timeout: 10000 }, (error) => {
        if (error) {
          resolve(null);
        } else {
          resolve(outputPath);
        }
      });
    });
  }

  static startContinuousAnalysis(cameraId, options = {}) {
    const { interval = 5000, types = ['face', 'license_plate'] } = options;
    const key = `analysis_${cameraId}`;

    if (this.activeAnalyses.has(key)) {
      return { started: false, message: 'Already running' };
    }

    const intervalId = setInterval(async () => {
      try {
        for (const type of types) {
          if (type === 'face') {
            await this.detectFaces(cameraId);
          } else if (type === 'license_plate') {
            await this.detectLicensePlates(cameraId);
          }
        }
      } catch (error) {
        console.error('Analysis error:', error);
      }
    }, interval);

    this.activeAnalyses.set(key, { intervalId, cameraId, options });
    return { started: true, key };
  }

  static stopContinuousAnalysis(cameraId) {
    const key = `analysis_${cameraId}`;
    const analysis = this.activeAnalyses.get(key);
    
    if (analysis) {
      clearInterval(analysis.intervalId);
      this.activeAnalyses.delete(key);
      return { stopped: true };
    }

    return { stopped: false, message: 'Not running' };
  }

  static getActiveAnalyses() {
    return Array.from(this.activeAnalyses.keys());
  }
}

module.exports = AnalyticsService;
