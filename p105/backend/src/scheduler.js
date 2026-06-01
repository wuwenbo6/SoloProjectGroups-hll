const cron = require('node-cron');
const db = require('./database');
const backupManager = require('./backupManager');
const checksumManager = require('./checksum');
const remoteBackupManager = require('./remoteBackup');

class BackupScheduler {
  constructor() {
    this.jobs = new Map();
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loadAndSchedulePolicies();
    console.log('备份调度器已启动');
  }

  stop() {
    this.jobs.forEach((job) => {
      if (job.task) job.task.stop();
    });
    this.jobs.clear();
    this.running = false;
    console.log('备份调度器已停止');
  }

  async loadAndSchedulePolicies() {
    const policies = await this.getPolicies();
    policies.forEach(policy => {
      if (policy.enabled) {
        this.schedulePolicy(policy);
      }
    });
  }

  getPolicies() {
    return new Promise((resolve, reject) => {
      db.all(`SELECT * FROM backup_policies ORDER BY created_at DESC`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getPolicy(id) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM backup_policies WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async createPolicy(policy) {
    const id = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO backup_policies (vm_id, name, type, cron_expression, retention_count, full_backup_interval, enabled) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          policy.vm_id,
          policy.name,
          policy.type || 'incremental',
          policy.cron_expression,
          policy.retention_count || 7,
          policy.full_backup_interval || 7,
          policy.enabled !== false ? 1 : 0
        ],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    const newPolicy = await this.getPolicy(id);
    
    if (newPolicy.enabled) {
      this.schedulePolicy(newPolicy);
    }

    return newPolicy;
  }

  async updatePolicy(id, policy) {
    const existing = await this.getPolicy(id);
    if (!existing) throw new Error('策略不存在');

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE backup_policies SET name = ?, type = ?, cron_expression = ?, 
         retention_count = ?, full_backup_interval = ?, enabled = ? WHERE id = ?`,
        [
          policy.name,
          policy.type || 'incremental',
          policy.cron_expression,
          policy.retention_count || 7,
          policy.full_backup_interval || 7,
          policy.enabled !== false ? 1 : 0,
          id
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    if (this.jobs.has(id)) {
      const job = this.jobs.get(id);
      if (job.task) job.task.stop();
      this.jobs.delete(id);
    }

    const updated = await this.getPolicy(id);
    if (updated.enabled) {
      this.schedulePolicy(updated);
    }

    return updated;
  }

  async deletePolicy(id) {
    if (this.jobs.has(id)) {
      const job = this.jobs.get(id);
      if (job.task) job.task.stop();
      this.jobs.delete(id);
    }

    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM backup_policies WHERE id = ?`, [id], (err) => {
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  }

  schedulePolicy(policy) {
    if (this.jobs.has(policy.id)) {
      const job = this.jobs.get(policy.id);
      if (job.task) job.task.stop();
    }

    try {
      const task = cron.schedule(policy.cron_expression, () => {
        this.executePolicy(policy.id);
      });

      this.jobs.set(policy.id, { policy, task });
      this.updateNextRun(policy.id);
      
      console.log(`已调度备份策略: ${policy.name} (${policy.cron_expression})`);
    } catch (error) {
      console.error(`调度策略失败 ${policy.name}:`, error.message);
    }
  }

  async executePolicy(policyId) {
    const policy = await this.getPolicy(policyId);
    if (!policy || !policy.enabled) return;

    console.log(`执行备份策略: ${policy.name}`);

    try {
      const vm = await new Promise((resolve, reject) => {
        db.get(`SELECT * FROM vms WHERE id = ?`, [policy.vm_id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!vm) {
        throw new Error('虚拟机不存在');
      }

      const fullBackups = await new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM backups WHERE vm_id = ? AND type = 'full' AND status = 'completed' 
           ORDER BY created_at DESC`,
          [policy.vm_id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      const lastFullBackup = fullBackups[0];
      const daysSinceLastFull = lastFullBackup 
        ? Math.floor((Date.now() - new Date(lastFullBackup.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : Infinity;

      let result;
      if (!lastFullBackup || daysSinceLastFull >= policy.full_backup_interval) {
        result = await backupManager.createFullBackup(policy.vm_id, vm.name);
      } else {
        result = await backupManager.createIncrementalBackup(policy.vm_id, vm.name);
      }

      if (result.backupId) {
        await new Promise((resolve) => {
          setTimeout(async () => {
            const backup = await backupManager.getBackupInfo(result.backupId);
            if (backup && backup.backup_path) {
              try {
                const checksum = await checksumManager.calculateFileChecksum(backup.backup_path);
                await new Promise((resolve) => {
                  db.run(
                    `UPDATE backups SET checksum = ?, checksum_algorithm = 'sha256' WHERE id = ?`,
                    [checksum, result.backupId],
                    () => resolve()
                  );
                });
              } catch (e) {
                console.warn('计算校验和失败:', e.message);
              }
            }
            resolve();
          }, 1000);
        });

        try {
          await remoteBackupManager.autoTransferBackup(result.backupId);
        } catch (e) {
          console.warn('异地备份失败:', e.message);
        }
      }

      await this.cleanupOldBackups(policy.vm_id, policy.retention_count);

      await this.logPolicyRun(policyId, result.backupId, 'success', '备份成功');

      await new Promise((resolve) => {
        db.run(
          `UPDATE backup_policies SET last_run = CURRENT_TIMESTAMP WHERE id = ?`,
          [policyId],
          () => resolve()
        );
      });

      this.updateNextRun(policyId);

      console.log(`备份策略执行成功: ${policy.name}`);
    } catch (error) {
      console.error(`备份策略执行失败 ${policy.name}:`, error.message);
      await this.logPolicyRun(policyId, null, 'failed', error.message);
    }
  }

  async cleanupOldBackups(vmId, retentionCount) {
    const backups = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM backups WHERE vm_id = ? AND status = 'completed' ORDER BY created_at DESC`,
        [vmId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    if (backups.length > retentionCount) {
      const toDelete = backups.slice(retentionCount);
      for (const backup of toDelete) {
        try {
          await backupManager.deleteBackup(backup.id, true);
        } catch (e) {
          console.warn(`清理旧备份失败 ${backup.name}:`, e.message);
        }
      }
    }
  }

  logPolicyRun(policyId, backupId, status, message) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO policy_logs (policy_id, backup_id, status, message) VALUES (?, ?, ?, ?)`,
        [policyId, backupId, status, message],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  getPolicyLogs(policyId, limit = 50) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT pl.*, b.name as backup_name FROM policy_logs pl 
         LEFT JOIN backups b ON pl.backup_id = b.id
         WHERE pl.policy_id = ? ORDER BY pl.created_at DESC LIMIT ?`,
        [policyId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  updateNextRun(policyId) {
    const policy = this.jobs.get(policyId);
    if (!policy) return;

    try {
      const task = policy.task;
      if (task && task.nextDates) {
        const nextDate = task.nextDates(1)[0];
        if (nextDate) {
          db.run(
            `UPDATE backup_policies SET next_run = ? WHERE id = ?`,
            [nextDate.toISOString(), policyId]
          );
        }
      }
    } catch (e) {}
  }

  validateCronExpression(expression) {
    try {
      return cron.validate(expression);
    } catch (e) {
      return false;
    }
  }

  getNextRuns(expression, count = 5) {
    try {
      const task = cron.schedule(expression, () => {});
      const dates = task.nextDates(count);
      task.stop();
      return dates.map(d => d.toISOString());
    } catch (e) {
      return [];
    }
  }
}

const scheduler = new BackupScheduler();
module.exports = scheduler;
