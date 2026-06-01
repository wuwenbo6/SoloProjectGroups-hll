const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const checksumManager = require('./checksum');

class RemoteBackupManager {
  async createConfig(config) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO remote_configs (name, type, host, port, username, password, private_key_path, remote_path, enabled) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          config.name,
          config.type || 'scp',
          config.host,
          config.port || 22,
          config.username,
          config.password || null,
          config.private_key_path || null,
          config.remote_path,
          config.enabled !== false ? 1 : 0
        ],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, ...config });
        }
      );
    });
  }

  async updateConfig(id, config) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE remote_configs SET name = ?, host = ?, port = ?, username = ?, 
         password = ?, private_key_path = ?, remote_path = ?, enabled = ? WHERE id = ?`,
        [
          config.name,
          config.host,
          config.port || 22,
          config.username,
          config.password || null,
          config.private_key_path || null,
          config.remote_path,
          config.enabled !== false ? 1 : 0,
          id
        ],
        (err) => {
          if (err) reject(err);
          else resolve({ success: true });
        }
      );
    });
  }

  async deleteConfig(id) {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM remote_configs WHERE id = ?`, [id], (err) => {
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  }

  async getConfigs() {
    return new Promise((resolve, reject) => {
      db.all(`SELECT * FROM remote_configs ORDER BY created_at DESC`, (err, rows) => {
        if (err) reject(err);
        else {
          rows.forEach(r => delete r.password);
          resolve(rows);
        }
      });
    });
  }

  async getConfig(id) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM remote_configs WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async testConnection(configId) {
    const config = await this.getConfig(configId);
    if (!config) throw new Error('配置不存在');

    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        conn.exec(`ls "${config.remote_path}"`, (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }
          
          stream.on('close', () => {
            conn.end();
            resolve({ success: true, message: '连接成功' });
          });
          
          stream.on('error', (err) => {
            conn.end();
            reject(err);
          });
        });
      }).on('error', reject).connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.private_key_path ? fs.readFileSync(config.private_key_path) : undefined
      });
    });
  }

  async transferBackup(backupId, configId) {
    const backup = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM backups WHERE id = ?`, [backupId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!backup) throw new Error('备份不存在');
    if (!backup.backup_path || !fs.existsSync(backup.backup_path)) {
      throw new Error('备份文件不存在');
    }

    const config = await this.getConfig(configId);
    if (!config) throw new('远程配置不存在');

    const remoteId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO remote_backups (backup_id, config_id, remote_path, status) 
         VALUES (?, ?, ?, 'transferring')`,
        [backupId, configId, path.basename(backup.backup_path)],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    try {
      const result = await this.scpTransfer(
        backup.backup_path,
        config,
        path.join(config.remote_path, path.basename(backup.backup_path))
      );

      const remoteChecksum = backup.checksum || await checksumManager.calculateFileChecksum(backup.backup_path);
      const stats = fs.statSync(backup.backup_path);

      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE remote_backups SET status = 'completed', remote_path = ?, 
           size = ?, checksum = ?, transferred_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [
            path.join(config.remote_path, path.basename(backup.backup_path)),
            stats.size,
            remoteChecksum,
            remoteId
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      return {
        success: true,
        remoteId,
        remotePath: path.join(config.remote_path, path.basename(backup.backup_path))
      };
    } catch (error) {
      await new Promise((resolve) => {
        db.run(
          `UPDATE remote_backups SET status = 'failed' WHERE id = ?`,
          [remoteId],
          () => resolve()
        );
      });
      throw error;
    }
  }

  async scpTransfer(localPath, config, remotePath) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

          const readStream = fs.createReadStream(localPath);
          const writeStream = sftp.createWriteStream(remotePath);

          writeStream.on('close', () => {
            conn.end();
            resolve({ success: true });
          });

          writeStream.on('error', (err) => {
            conn.end();
            reject(err);
          });

          readStream.pipe(writeStream);
        });
      }).on('error', reject).connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.private_key_path ? fs.readFileSync(config.private_key_path) : undefined
      });
    });
  }

  async getRemoteBackups(backupId = null) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT rb.*, rc.name as config_name, rc.host, rc.type as config_type,
               b.name as backup_name, b.type as backup_type
        FROM remote_backups rb
        LEFT JOIN remote_configs rc ON rb.config_id = rc.id
        LEFT JOIN backups b ON rb.backup_id = b.id
      `;
      const params = [];
      
      if (backupId) {
        query += ' WHERE rb.backup_id = ?';
        params.push(backupId);
      }
      
      query += ' ORDER BY rb.created_at DESC';
      
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async deleteRemoteBackup(remoteId) {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM remote_backups WHERE id = ?`, [remoteId], (err) => {
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  }

  async autoTransferBackup(backupId) {
    const configs = await this.getConfigs();
    const enabledConfigs = configs.filter(c => c.enabled);
    
    const results = [];
    for (const config of enabledConfigs) {
      try {
        const result = await this.transferBackup(backupId, config.id);
        results.push({ configId: config.id, success: true, ...result });
      } catch (error) {
        results.push({ configId: config.id, success: false, error: error.message });
      }
    }
    
    return results;
  }
}

module.exports = new RemoteBackupManager();
