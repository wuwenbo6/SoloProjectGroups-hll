const db = require('./database');
const libvirt = require('./libvirt');
const fs = require('fs');
const path = require('path');
const checksumManager = require('./checksum');

const BACKUP_DIR = path.join(__dirname, '../backups');
const MOUNT_DIR = path.join(__dirname, '../mounts');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(MOUNT_DIR)) {
  fs.mkdirSync(MOUNT_DIR, { recursive: true });
}

class BackupManager {
  async getVMList() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM vms ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async syncVMsFromLibvirt() {
    try {
      const vms = await libvirt.listVMs();
      
      for (const vm of vms) {
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT OR REPLACE INTO vms (name, uuid, status, disk_path, os_type) 
             VALUES (?, ?, ?, ?, ?)`,
            [vm.name, vm.uuid, vm.status, vm.disk_path, vm.os_type],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      return vms;
    } catch (error) {
      throw error;
    }
  }

  async getBackupChain(vmId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM backups WHERE vm_id = ? ORDER BY created_at ASC`,
        [vmId],
        (err, rows) => {
          if (err) reject(err);
          else {
            const chain = this.buildBackupChain(rows);
            resolve(chain);
          }
        }
      );
    });
  }

  buildBackupChain(backups) {
    const map = new Map();
    const roots = [];

    backups.forEach(backup => {
      map.set(backup.id, { ...backup, children: [] });
    });

    backups.forEach(backup => {
      const node = map.get(backup.id);
      if (backup.parent_id && map.has(backup.parent_id)) {
        map.get(backup.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  async getLastFullBackup(vmId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM backups WHERE vm_id = ? AND type = 'full' AND status = 'completed' 
         ORDER BY created_at DESC LIMIT 1`,
        [vmId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async getLastBackup(vmId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM backups WHERE vm_id = ? AND status = 'completed' 
         ORDER BY created_at DESC LIMIT 1`,
        [vmId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async createFullBackup(vmId, vmName) {
    const backupName = `full_${vmName}_${Date.now()}`;
    const backupPath = path.join(BACKUP_DIR, `${backupName}.qcow2`);
    
    const backupId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO backups (vm_id, name, type, status) VALUES (?, ?, 'full', 'pending')`,
        [vmId, backupName],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    try {
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE backups SET status = 'creating_snapshot' WHERE id = ?`,
          [backupId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const snapshot = await libvirt.createSnapshot(vmName, backupName);

      const vm = await new Promise((resolve, reject) => {
        db.get(`SELECT * FROM vms WHERE id = ?`, [vmId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE backups SET status = 'copying', disk_path = ?, snapshot_name = ? WHERE id = ?`,
          [vm.disk_path, backupName, backupId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const result = await libvirt.fullBackup(vm.disk_path, backupPath);

      const checksum = await checksumManager.calculateFileChecksum(backupPath);

      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE backups SET status = 'completed', backup_path = ?, size = ?, checksum = ?, checksum_algorithm = 'sha256' WHERE id = ?`,
          [backupPath, result.size, checksum, backupId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      return { success: true, backupId, backupPath, checksum };
    } catch (error) {
      await new Promise((resolve) => {
        db.run(
          `UPDATE backups SET status = 'failed' WHERE id = ?`,
          [backupId],
          () => resolve()
        );
      });
      throw error;
    }
  }

  async createIncrementalBackup(vmId, vmName) {
    const lastBackup = await this.getLastBackup(vmId);
    
    if (!lastBackup) {
      throw new Error('没有找到基准备份，请先创建完整备份');
    }

    const backupName = `inc_${vmName}_${Date.now()}`;
    const backupPath = path.join(BACKUP_DIR, `${backupName}.inc`);
    
    const backupId = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO backups (vm_id, name, type, parent_id, status) 
         VALUES (?, ?, 'incremental', ?, 'pending')`,
        [vmId, backupName, lastBackup.id],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    try {
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE backups SET status = 'creating_snapshot' WHERE id = ?`,
          [backupId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const snapshot = await libvirt.createSnapshot(vmName, backupName);

      const vm = await new Promise((resolve, reject) => {
        db.get(`SELECT * FROM vms WHERE id = ?`, [vmId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE backups SET status = 'comparing_blocks', disk_path = ?, snapshot_name = ? WHERE id = ?`,
          [vm.disk_path, backupName, backupId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const changedBlocks = await libvirt.getChangedBlocks(
        lastBackup.disk_path,
        vm.disk_path
      );

      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE backups SET status = 'copying_changed' WHERE id = ?`,
          [backupId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const result = await libvirt.backupIncremental(
        vm.disk_path,
        backupPath,
        changedBlocks
      );

      const checksum = await checksumManager.calculateFileChecksum(backupPath);
      const fileSize = fs.statSync(backupPath).size;

      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE backups SET status = 'completed', backup_path = ?, 
           changed_blocks = ?, size = ?, checksum = ?, checksum_algorithm = 'sha256' WHERE id = ?`,
          [backupPath, result.changedBlocks, fileSize, checksum, backupId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      return { success: true, backupId, backupPath, changedBlocks: result.changedBlocks, checksum };
    } catch (error) {
      await new Promise((resolve) => {
        db.run(
          `UPDATE backups SET status = 'failed' WHERE id = ?`,
          [backupId],
          () => resolve()
        );
      });
      throw error;
    }
  }

  async getBackupInfo(backupId) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM backups WHERE id = ?`, [backupId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getChildBackups(backupId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM backups WHERE parent_id = ?`,
        [backupId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async getAllBackups(vmId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM backups WHERE vm_id = ? ORDER BY created_at ASC`,
        [vmId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async canDeleteBackup(backupId) {
    const children = await this.getChildBackups(backupId);
    return {
      canDelete: children.length === 0,
      children: children,
      message: children.length > 0 
        ? `该备份有 ${children.length} 个子备份依赖，无法直接删除` 
        : '可以安全删除'
    };
  }

  async deleteBackup(backupId, force = false) {
    const backup = await this.getBackupInfo(backupId);
    
    if (!backup) {
      throw new Error('备份不存在');
    }

    if (!force) {
      const check = await this.canDeleteBackup(backupId);
      if (!check.canDelete) {
        throw new Error(check.message);
      }
    }

    if (force) {
      const children = await this.getChildBackups(backupId);
      for (const child of children) {
        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE backups SET parent_id = ? WHERE id = ?`,
            [backup.parent_id, child.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }
    }

    if (backup.backup_path && fs.existsSync(backup.backup_path)) {
      try {
        fs.unlinkSync(backup.backup_path);
      } catch (e) {
        console.warn('删除备份文件失败:', e.message);
      }
    }

    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM backups WHERE id = ?`, [backupId], (err) => {
        if (err) reject(err);
        else resolve({ success: true, orphanedChildren: force });
      });
    });
  }

  async mergeBackupChain(vmId, targetBackupId = null) {
    const backups = await this.getAllBackups(vmId);
    
    if (backups.length < 2) {
      throw new Error('备份链太短，无需合并');
    }

    const vm = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM vms WHERE id = ?`, [vmId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!vm) {
      throw new Error('虚拟机不存在');
    }

    try {
      await libvirt.blockCommitToBase(vm.name);
      
      const fullBackups = backups.filter(b => b.type === 'full');
      const latestFull = fullBackups[fullBackups.length - 1];
      
      if (latestFull) {
        const incrementalBackups = backups.filter(b => 
          b.type === 'incremental' && b.created_at > latestFull.created_at
        );
        
        for (const inc of incrementalBackups) {
          if (inc.backup_path && fs.existsSync(inc.backup_path)) {
            try {
              fs.unlinkSync(inc.backup_path);
            } catch (e) {}
          }
          await new Promise((resolve) => {
            db.run(`DELETE FROM backups WHERE id = ?`, [inc.id], () => resolve());
          });
        }
      }

      return {
        success: true,
        message: '快照链合并成功，已清理增量备份',
        mergedCount: backups.length - 1
      };
    } catch (error) {
      throw new Error(`合并快照链失败: ${error.message}`);
    }
  }

  async getBackupChainStats(vmId) {
    const backups = await this.getAllBackups(vmId);
    
    return {
      totalCount: backups.length,
      fullCount: backups.filter(b => b.type === 'full').length,
      incrementalCount: backups.filter(b => b.type === 'incremental').length,
      totalSize: backups.reduce((sum, b) => sum + (b.size || 0), 0),
      needsMerge: backups.filter(b => b.type === 'incremental').length > 5,
      chainLength: backups.length
    };
  }

  async mountBackup(backupId) {
    const backup = await this.getBackupInfo(backupId);
    
    if (!backup || !backup.backup_path) {
      throw new Error('备份不存在或没有备份文件');
    }

    const mountPath = path.join(MOUNT_DIR, `backup_${backupId}`);
    
    try {
      await libvirt.mountImage(backup.backup_path, mountPath);
      
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO mount_points (backup_id, mount_path, status) 
           VALUES (?, ?, 'mounted')`,
          [backupId, mountPath],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      return { success: true, mountPath };
    } catch (error) {
      throw error;
    }
  }

  async unmountBackup(backupId) {
    const mountPoint = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM mount_points WHERE backup_id = ? AND status = 'mounted'`,
        [backupId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!mountPoint) {
      throw new Error('没有找到挂载点');
    }

    try {
      await libvirt.unmountImage(mountPoint.mount_path);
      
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE mount_points SET status = 'unmounted' WHERE id = ?`,
          [mountPoint.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  async browseFiles(backupId, dirPath = '/') {
    const mountPoint = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM mount_points WHERE backup_id = ? AND status = 'mounted'`,
        [backupId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!mountPoint) {
      throw new Error('备份未挂载，请先挂载备份');
    }

    const fullPath = path.join(mountPoint.mount_path, dirPath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error('路径不存在');
    }

    const stats = fs.statSync(fullPath);
    
    if (!stats.isDirectory()) {
      throw new Error('路径不是目录');
    }

    const files = fs.readdirSync(fullPath);
    const result = [];

    for (const file of files) {
      const filePath = path.join(fullPath, file);
      const fileStats = fs.statSync(filePath);
      result.push({
        name: file,
        type: fileStats.isDirectory() ? 'directory' : 'file',
        size: fileStats.size,
        mtime: fileStats.mtime,
        path: path.join(dirPath, file)
      });
    }

    return result;
  }

  async verifyBackupChecksum(backupId) {
    const backup = await this.getBackupInfo(backupId);
    
    if (!backup || !backup.backup_path) {
      throw new Error('备份不存在或没有备份文件');
    }

    if (!backup.checksum) {
      throw new Error('该备份没有记录校验和');
    }

    const result = await checksumManager.verifyFileChecksum(
      backup.backup_path,
      backup.checksum,
      backup.checksum_algorithm || 'sha256'
    );

    return result;
  }

  async exportChecksumFile(backupId, outputDir = null) {
    const backup = await this.getBackupInfo(backupId);
    
    if (!backup) {
      throw new Error('备份不存在');
    }

    if (!backup.checksum) {
      throw new Error('该备份没有记录校验和');
    }

    const dir = outputDir || path.join(__dirname, '../backups');
    const outputPath = path.join(dir, `${backup.name}.checksum.txt`);
    
    await checksumManager.exportChecksumFile(backup, outputPath);
    
    return { path: outputPath, filename: `${backup.name}.checksum.txt` };
  }

  async restoreBackup(backupId, deleteSubsequent = false) {
    const backup = await this.getBackupInfo(backupId);
    
    if (!backup) {
      throw new Error('备份不存在');
    }

    const vm = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM vms WHERE id = ?`, [backup.vm_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!vm) {
      throw new Error('虚拟机不存在');
    }

    const allBackups = await this.getAllBackups(backup.vm_id);
    const backupTime = new Date(backup.created_at).getTime();
    const subsequentBackups = allBackups.filter(b => 
      new Date(b.created_at).getTime() > backupTime
    );

    if (subsequentBackups.length > 0 && !deleteSubsequent) {
      throw new Error(
        `恢复到此备份将导致 ${subsequentBackups.length} 个后续备份失效。` +
        `请确认是否要删除这些后续备份，或选择最新备份恢复。`
      );
    }

    try {
      await libvirt.revertSnapshot(vm.name, backup.snapshot_name);
      
      if (deleteSubsequent) {
        for (const sub of subsequentBackups) {
          if (sub.backup_path && fs.existsSync(sub.backup_path)) {
            try {
              fs.unlinkSync(sub.backup_path);
            } catch (e) {}
          }
          await new Promise((resolve) => {
            db.run(`DELETE FROM backups WHERE id = ?`, [sub.id], () => resolve());
          });
        }
      }

      return { 
        success: true, 
        deletedCount: deleteSubsequent ? subsequentBackups.length : 0,
        message: deleteSubsequent 
          ? `已恢复并删除 ${subsequentBackups.length} 个后续备份`
          : '已恢复到该备份点，后续备份仍然保留但可能无法正常使用'
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new BackupManager();
