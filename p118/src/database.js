const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class AppDatabase {
  constructor(appInstance) {
    this.db = null;
    this.app = appInstance;
    this.dbPath = path.join(this.app.getPath('userData'), 'dashcam_events.db');
  }

  init() {
    try {
      const userDataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      this.createTables();
      this.insertDefaultSettings();

      console.log('数据库初始化成功:', this.dbPath);
    } catch (error) {
      console.error('数据库初始化失败:', error);
      throw error;
    }
  }

  createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        duration REAL,
        fps REAL,
        width INTEGER,
        height INTEGER,
        total_frames INTEGER,
        processed_frames INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER,
        frame_number INTEGER NOT NULL,
        timestamp REAL NOT NULL,
        distance REAL NOT NULL,
        risk_level TEXT NOT NULL,
        vehicle_x INTEGER,
        vehicle_y INTEGER,
        vehicle_width INTEGER,
        vehicle_height INTEGER,
        plate_width INTEGER,
        plate_height INTEGER,
        plate_x INTEGER,
        plate_y INTEGER,
        speed REAL,
        relative_speed REAL,
        ttc REAL,
        image_path TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS detections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER,
        frame_number INTEGER NOT NULL,
        timestamp REAL NOT NULL,
        vehicle_count INTEGER DEFAULT 0,
        detected_vehicles TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS emergency_videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        emergency_id TEXT UNIQUE NOT NULL,
        video_id INTEGER,
        source_video_path TEXT NOT NULL,
        output_path TEXT NOT NULL,
        thumbnail_path TEXT,
        reason TEXT NOT NULL,
        event_data TEXT,
        trigger_frame INTEGER,
        trigger_timestamp REAL,
        pre_duration REAL,
        post_duration REAL,
        total_duration REAL,
        total_frames INTEGER,
        fps REAL,
        width INTEGER,
        height INTEGER,
        file_size INTEGER,
        status TEXT DEFAULT 'saved',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS upload_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_id TEXT UNIQUE NOT NULL,
        emergency_id TEXT,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        server_response TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS gps_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id TEXT UNIQUE NOT NULL,
        video_id INTEGER,
        start_time TEXT NOT NULL,
        end_time TEXT,
        point_count INTEGER DEFAULT 0,
        total_distance REAL DEFAULT 0,
        avg_speed REAL DEFAULT 0,
        max_speed REAL DEFAULT 0,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_video_id ON events(video_id);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_risk_level ON events(risk_level);
      CREATE INDEX IF NOT EXISTS idx_events_distance ON events(distance);
      CREATE INDEX IF NOT EXISTS idx_detections_video_id ON detections(video_id);
      CREATE INDEX IF NOT EXISTS idx_emergency_videos_video_id ON emergency_videos(video_id);
      CREATE INDEX IF NOT EXISTS idx_emergency_videos_reason ON emergency_videos(reason);
      CREATE INDEX IF NOT EXISTS idx_upload_tasks_status ON upload_tasks(status);
      CREATE INDEX IF NOT EXISTS idx_gps_tracks_video_id ON gps_tracks(video_id);
    `);
  }

  insertDefaultSettings() {
    const defaultSettings = [
      { key: 'distance_threshold', value: '3.0', description: '安全距离阈值（米）' },
      { key: 'danger_threshold', value: '1.5', description: '危险距离阈值（米）' },
      { key: 'plate_real_width', value: '0.4', description: '标准车牌宽度（米）' },
      { key: 'focal_length', value: '800', description: '相机焦距（像素）' },
      { key: 'confidence_threshold', value: '0.7', description: '检测置信度阈值' },
      { key: 'frame_skip', value: '2', description: '跳帧数（提高处理速度）' },
      { key: 'alarm_enabled', value: 'true', description: '是否启用报警' },
      { key: 'alarm_volume', value: '80', description: '报警音量（0-100）' },
      { key: 'min_vehicle_width', value: '50', description: '最小车辆检测宽度（像素）' },
      { key: 'night_mode_enabled', value: 'true', description: '启用夜间模式增强' },
      { key: 'night_brightness_threshold', value: '60', description: '夜间亮度阈值（0-255）' },
      { key: 'taillight_distance_enabled', value: 'true', description: '启用尾灯距离估算（夜间）' },
      { key: 'lane_filter_enabled', value: 'true', description: '启用车道过滤（过滤旁车道车辆）' },
      { key: 'lane_center_tolerance', value: '0.25', description: '车道中心容差（0.1-0.5）' },
      { key: 'kalman_filter_enabled', value: 'true', description: '启用卡尔曼滤波平滑距离' },
      { key: 'distance_smoothing_window', value: '5', description: '距离平滑窗口大小' },
      { key: 'emergency_pre_seconds', value: '15', description: '紧急录像前置缓存秒数' },
      { key: 'emergency_post_seconds', value: '10', description: '紧急录像后置录制秒数' },
      { key: 'emergency_trigger_on_collision', value: 'true', description: '碰撞时自动触发紧急录像' },
      { key: 'emergency_trigger_on_nearmiss', value: 'false', description: '接近事件时触发紧急录像' },
      { key: 'auto_upload_enabled', value: 'false', description: '启用自动上传功能' },
      { key: 'upload_on_collision', value: 'false', description: '碰撞事件自动上传' },
      { key: 'upload_on_nearmiss', value: 'false', description: '接近事件自动上传' },
      { key: 'upload_server_url', value: 'https://api.example.com/upload', description: '上传服务器地址' },
      { key: 'upload_max_retries', value: '3', description: '上传最大重试次数' },
      { key: 'gps_enabled', value: 'true', description: '启用GPS轨迹记录' },
      { key: 'gps_export_format', value: 'gpx', description: 'GPS导出格式（gpx/kml/json）' }
    ];

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO settings (key, value, description)
      VALUES (?, ?, ?)
    `);

    const insertMany = this.db.transaction((settings) => {
      for (const setting of settings) {
        stmt.run(setting.key, setting.value, setting.description);
      }
    });

    insertMany(defaultSettings);
  }

  getSettings() {
    const rows = this.db.prepare('SELECT key, value, description FROM settings').all();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = {
        value: this.parseValue(row.value),
        description: row.description
      };
    }
    return settings;
  }

  updateSettings(settings) {
    const stmt = this.db.prepare(`
      UPDATE settings 
      SET value = ?, updated_at = CURRENT_TIMESTAMP
      WHERE key = ?
    `);

    const updateMany = this.db.transaction((settings) => {
      for (const [key, value] of Object.entries(settings)) {
        stmt.run(String(value), key);
      }
    });

    updateMany(settings);
    return this.getSettings();
  }

  parseValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(Number(value)) && value !== '') return Number(value);
    return value;
  }

  addVideo(videoInfo) {
    const stmt = this.db.prepare(`
      INSERT INTO videos (file_path, file_name, duration, fps, width, height, total_frames, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'processing')
    `);

    const result = stmt.run(
      videoInfo.filePath,
      videoInfo.fileName,
      videoInfo.duration || 0,
      videoInfo.fps || 30,
      videoInfo.width || 0,
      videoInfo.height || 0,
      videoInfo.totalFrames || 0
    );

    return result.lastInsertRowid;
  }

  updateVideoStatus(videoId, status, processedFrames = null) {
    const stmt = this.db.prepare(`
      UPDATE videos 
      SET status = ?, 
          processed_frames = COALESCE(?, processed_frames),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(status, processedFrames, videoId);
  }

  addEvent(eventData) {
    const stmt = this.db.prepare(`
      INSERT INTO events (
        video_id, frame_number, timestamp, distance, risk_level,
        vehicle_x, vehicle_y, vehicle_width, vehicle_height,
        plate_width, plate_height, plate_x, plate_y,
        speed, relative_speed, ttc, image_path, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      eventData.videoId,
      eventData.frameNumber,
      eventData.timestamp,
      eventData.distance,
      eventData.riskLevel,
      eventData.vehicleX,
      eventData.vehicleY,
      eventData.vehicleWidth,
      eventData.vehicleHeight,
      eventData.plateWidth,
      eventData.plateHeight,
      eventData.plateX,
      eventData.plateY,
      eventData.speed,
      eventData.relativeSpeed,
      eventData.ttc,
      eventData.imagePath,
      eventData.notes
    );

    return result.lastInsertRowid;
  }

  addDetection(detectionData) {
    const stmt = this.db.prepare(`
      INSERT INTO detections (video_id, frame_number, timestamp, vehicle_count, detected_vehicles)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      detectionData.videoId,
      detectionData.frameNumber,
      detectionData.timestamp,
      detectionData.vehicleCount,
      JSON.stringify(detectionData.detectedVehicles || [])
    );
  }

  getEvents(filters = {}) {
    let sql = `
      SELECT e.*, v.file_name as video_name, v.file_path as video_path
      FROM events e
      LEFT JOIN videos v ON e.video_id = v.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.videoId) {
      sql += ' AND e.video_id = ?';
      params.push(filters.videoId);
    }

    if (filters.riskLevel) {
      sql += ' AND e.risk_level = ?';
      params.push(filters.riskLevel);
    }

    if (filters.startDate) {
      sql += ' AND e.created_at >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      sql += ' AND e.created_at <= ?';
      params.push(filters.endDate);
    }

    if (filters.maxDistance) {
      sql += ' AND e.distance <= ?';
      params.push(filters.maxDistance);
    }

    sql += ' ORDER BY e.timestamp DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    return this.db.prepare(sql).all(...params);
  }

  getEventById(id) {
    return this.db.prepare(`
      SELECT e.*, v.file_name as video_name, v.file_path as video_path
      FROM events e
      LEFT JOIN videos v ON e.video_id = v.id
      WHERE e.id = ?
    `).get(id);
  }

  deleteEvent(id) {
    this.db.prepare('DELETE FROM events WHERE id = ?').run(id);
    return { success: true };
  }

  getVideoById(id) {
    return this.db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
  }

  getVideos() {
    return this.db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all();
  }

  exportEvents(outputPath) {
    const events = this.getEvents();
    const fs = require('fs');
    fs.writeFileSync(outputPath, JSON.stringify(events, null, 2));
    return { success: true, count: events.length, path: outputPath };
  }

  getDetectionsByVideoId(videoId) {
    const rows = this.db.prepare(`
      SELECT * FROM detections 
      WHERE video_id = ? 
      ORDER BY frame_number ASC
    `).all(videoId);

    return rows.map(row => ({
      ...row,
      detected_vehicles: JSON.parse(row.detected_vehicles || '[]')
    }));
  }

  getEventsByVideoId(videoId) {
    return this.db.prepare(`
      SELECT * FROM events WHERE video_id = ? ORDER BY timestamp ASC
    `).all(videoId);
  }

  addEmergencyRecord(record) {
    const stmt = this.db.prepare(`
      INSERT INTO emergency_videos (
        emergency_id, video_id, source_video_path, output_path, thumbnail_path,
        reason, event_data, trigger_frame, trigger_timestamp,
        pre_duration, post_duration, total_duration, total_frames,
        fps, width, height, file_size, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      record.emergencyId,
      record.videoId,
      record.sourceVideoPath,
      record.outputPath,
      record.thumbnailPath,
      record.reason,
      record.eventData,
      record.triggerFrame,
      record.triggerTimestamp,
      record.preDuration,
      record.postDuration,
      record.totalDuration,
      record.totalFrames,
      record.fps,
      record.width,
      record.height,
      record.fileSize,
      record.status || 'saved'
    );

    return result.lastInsertRowid;
  }

  getEmergencyRecords(filters = {}) {
    let sql = 'SELECT * FROM emergency_videos WHERE 1=1';
    const params = [];

    if (filters.videoId) {
      sql += ' AND video_id = ?';
      params.push(filters.videoId);
    }
    if (filters.reason) {
      sql += ' AND reason = ?';
      params.push(filters.reason);
    }
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    return this.db.prepare(sql).all(...params);
  }

  getEmergencyRecordById(id) {
    return this.db.prepare('SELECT * FROM emergency_videos WHERE id = ?').get(id);
  }

  getEmergencyRecordByEmergencyId(emergencyId) {
    return this.db.prepare('SELECT * FROM emergency_videos WHERE emergency_id = ?').get(emergencyId);
  }

  deleteEmergencyRecord(id) {
    this.db.prepare('DELETE FROM emergency_videos WHERE id = ?').run(id);
    return { success: true };
  }

  addUploadTask(task) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO upload_tasks (
        upload_id, emergency_id, reason, status, progress,
        retry_count, error_message, created_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.emergencyRecord?.id || null,
      task.reason,
      task.status,
      task.progress,
      task.retryCount,
      task.error,
      task.createdAt,
      task.startedAt,
      task.completedAt
    );
  }

  updateUploadTaskStatus(uploadId, status, progress = 0, error = null) {
    const stmt = this.db.prepare(`
      UPDATE upload_tasks 
      SET status = ?, 
          progress = ?,
          error_message = ?,
          started_at = CASE WHEN ? = 'uploading' AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END,
          completed_at = CASE WHEN ? = 'completed' OR ? = 'failed' OR ? = 'cancelled' THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE upload_id = ?
    `);

    stmt.run(status, progress, error, status, status, status, status, uploadId);
  }

  updateUploadTaskProgress(uploadId, progress) {
    this.db.prepare('UPDATE upload_tasks SET progress = ? WHERE upload_id = ?')
      .run(progress, uploadId);
  }

  updateUploadResponse(uploadId, response) {
    this.db.prepare('UPDATE upload_tasks SET server_response = ? WHERE upload_id = ?')
      .run(response, uploadId);
  }

  getUploadTasks(filters = {}) {
    let sql = 'SELECT * FROM upload_tasks WHERE 1=1';
    const params = [];

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.reason) {
      sql += ' AND reason = ?';
      params.push(filters.reason);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    return this.db.prepare(sql).all(...params);
  }

  addGPSTrack(track) {
    const stmt = this.db.prepare(`
      INSERT INTO gps_tracks (
        track_id, video_id, start_time, end_time,
        point_count, total_distance, avg_speed, max_speed, data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      track.id,
      track.videoId || null,
      track.startTime,
      track.endTime,
      track.pointCount,
      track.totalDistance,
      track.avgSpeed,
      track.maxSpeed,
      track.data
    );

    return result.lastInsertRowid;
  }

  getGPSTracks(filters = {}) {
    let sql = 'SELECT * FROM gps_tracks WHERE 1=1';
    const params = [];

    if (filters.videoId) {
      sql += ' AND video_id = ?';
      params.push(filters.videoId);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    return this.db.prepare(sql).all(...params);
  }

  getGPSTrackById(trackId) {
    return this.db.prepare('SELECT * FROM gps_tracks WHERE track_id = ?').get(trackId);
  }

  deleteGPSTrack(trackId) {
    this.db.prepare('DELETE FROM gps_tracks WHERE track_id = ?').run(trackId);
    return { success: true };
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log('数据库连接已关闭');
    }
  }
}

module.exports = AppDatabase;
