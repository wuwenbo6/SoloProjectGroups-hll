const fs = require('fs');
const path = require('path');
const db = require('../database/init');

class ConfigBackupService {
  static async exportConfig(options = {}) {
    const { includePasswords = false, prettyPrint = true } = options;

    const config = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      cameras: await this.exportCameras(includePasswords),
      recordingSchedules: await this.exportRecordingSchedules(),
      eventSubscriptions: await this.exportEventSubscriptions()
    };

    return prettyPrint ? JSON.stringify(config, null, 2) : JSON.stringify(config);
  }

  static async exportCameras(includePasswords = false) {
    const cameras = db.prepare('SELECT * FROM cameras').all();
    
    return cameras.map(cam => ({
      id: cam.id,
      name: cam.name,
      ip_address: cam.ip_address,
      port: cam.port,
      username: cam.username,
      password: includePasswords ? cam.password : '***',
      manufacturer: cam.manufacturer,
      model: cam.model,
      serial_number: cam.serial_number,
      firmware_version: cam.firmware_version,
      rtsp_uri: cam.rtsp_uri,
      ptz_supported: cam.ptz_supported
    }));
  }

  static async exportRecordingSchedules() {
    const schedules = db.prepare('SELECT * FROM recording_schedules').all();
    
    return schedules.map(sched => ({
      id: sched.id,
      camera_id: sched.camera_id,
      name: sched.name,
      enabled: sched.enabled,
      days_of_week: sched.days_of_week,
      start_time: sched.start_time,
      end_time: sched.end_time,
      storage_path: sched.storage_path,
      segment_duration: sched.segment_duration
    }));
  }

  static async exportEventSubscriptions() {
    const subscriptions = db.prepare('SELECT * FROM event_subscriptions').all();
    
    return subscriptions.map(sub => ({
      id: sub.id,
      camera_id: sub.camera_id,
      event_type: sub.event_type,
      enabled: sub.enabled,
      config: sub.config
    }));
  }

  static async saveBackupToFile(filePath = null) {
    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_${timestamp}.json`;
    const fullPath = filePath || path.join(backupDir, fileName);

    const config = await this.exportConfig({ prettyPrint: true });
    fs.writeFileSync(fullPath, config);

    return {
      fileName,
      filePath: fullPath,
      size: Buffer.byteLength(config)
    };
  }

  static async importConfig(configData, options = {}) {
    const { merge = true, overwrite = false } = options;

    let config;
    if (typeof configData === 'string') {
      config = JSON.parse(configData);
    } else {
      config = configData;
    }

    const results = {
      cameras: { imported: 0, skipped: 0, errors: [] },
      schedules: { imported: 0, skipped: 0, errors: [] },
      subscriptions: { imported: 0, skipped: 0, errors: [] }
    };

    if (config.cameras) {
      for (const cam of config.cameras) {
        try {
          const existing = db.prepare('SELECT id FROM cameras WHERE ip_address = ? AND port = ?').get(cam.ip_address, cam.port);
          
          if (existing && !overwrite) {
            results.cameras.skipped++;
            continue;
          }

          if (existing && overwrite) {
            db.prepare(`
              UPDATE cameras SET
                name = ?,
                username = ?,
                password = ?,
                manufacturer = ?,
                model = ?,
                serial_number = ?,
                firmware_version = ?,
                rtsp_uri = ?,
                ptz_supported = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(
              cam.name,
              cam.username,
              cam.password === '***' ? '' : cam.password,
              cam.manufacturer,
              cam.model,
              cam.serial_number,
              cam.firmware_version,
              cam.rtsp_uri,
              cam.ptz_supported,
              existing.id
            );
            results.cameras.imported++;
          } else {
            db.prepare(`
              INSERT INTO cameras 
              (name, ip_address, port, username, password, manufacturer, model, serial_number, firmware_version, rtsp_uri, ptz_supported)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              cam.name,
              cam.ip_address,
              cam.port,
              cam.username,
              cam.password === '***' ? '' : cam.password,
              cam.manufacturer,
              cam.model,
              cam.serial_number,
              cam.firmware_version,
              cam.rtsp_uri,
              cam.ptz_supported
            );
            results.cameras.imported++;
          }
        } catch (error) {
          results.cameras.errors.push({ camera: cam.name, error: error.message });
        }
      }
    }

    if (config.recordingSchedules) {
      for (const sched of config.recordingSchedules) {
        try {
          const camera = db.prepare('SELECT id FROM cameras WHERE ip_address = ? AND port = ?').get(
            config.cameras?.find(c => c.id === sched.camera_id)?.ip_address,
            config.cameras?.find(c => c.id === sched.camera_id)?.port
          );

          const actualCameraId = camera?.id || sched.camera_id;
          
          db.prepare(`
            INSERT INTO recording_schedules 
            (camera_id, name, enabled, days_of_week, start_time, end_time, storage_path, segment_duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            actualCameraId,
            sched.name,
            sched.enabled,
            sched.days_of_week,
            sched.start_time,
            sched.end_time,
            sched.storage_path,
            sched.segment_duration
          );
          results.schedules.imported++;
        } catch (error) {
          results.schedules.errors.push({ schedule: sched.name, error: error.message });
        }
      }
    }

    return results;
  }

  static listBackups() {
    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) {
      return [];
    }

    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(backupDir, f);
        const stats = fs.statSync(filePath);
        return {
          fileName: f,
          filePath,
          size: stats.size,
          createdAt: stats.mtime
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    return files;
  }

  static deleteBackup(fileName) {
    const backupDir = path.join(__dirname, '../backups');
    const filePath = path.join(backupDir, fileName);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { deleted: true };
    }
    
    return { deleted: false, error: 'File not found' };
  }
}

module.exports = ConfigBackupService;
