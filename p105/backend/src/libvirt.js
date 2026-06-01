const { exec, execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class LibvirtManager {
  constructor() {
    this.connectionUri = 'qemu:///system';
  }

  execVirsh(args, options = {}) {
    return new Promise((resolve, reject) => {
      execFile('virsh', ['-c', this.connectionUri, ...args], options, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  execQemuImg(args) {
    return new Promise((resolve, reject) => {
      execFile('qemu-img', args, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  async listVMs() {
    try {
      const output = await this.execVirsh(['list', '--all', '--name']);
      const names = output.split('\n').filter(n => n.trim());
      const vms = [];

      for (const name of names) {
        const vm = await this.getVMInfo(name);
        if (vm) vms.push(vm);
      }

      return vms;
    } catch (error) {
      throw new Error(`获取虚拟机列表失败: ${error.message}`);
    }
  }

  async getVMInfo(name) {
    try {
      const dominfo = await this.execVirsh(['dominfo', name]);
      const lines = dominfo.split('\n');
      const info = {};

      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length) {
          info[key.trim()] = valueParts.join(':').trim();
        }
      }

      const dumpxml = await this.execVirsh(['dumpxml', name]);
      const diskMatch = dumpxml.match(/<source file='([^']+)'/);

      return {
        name,
        uuid: info['UUID'] || '',
        status: info['State'] || 'unknown',
        disk_path: diskMatch ? diskMatch[1] : '',
        os_type: info['OS Type'] || '',
        memory: info['Max memory'] || '',
        cpus: info['CPU(s)'] || ''
      };
    } catch (error) {
      return null;
    }
  }

  async createSnapshot(vmName, snapshotName) {
    try {
      await this.execVirsh([
        'snapshot-create-as',
        vmName,
        snapshotName,
        '--disk-only',
        '--atomic'
      ]);

      const dumpxml = await this.execVirsh(['dumpxml', vmName]);
      const diskMatch = dumpxml.match(/<source file='([^']+)'/);

      return {
        success: true,
        snapshotName,
        newDiskPath: diskMatch ? diskMatch[1] : ''
      };
    } catch (error) {
      throw new Error(`创建快照失败: ${error.message}`);
    }
  }

  async listSnapshots(vmName) {
    try {
      const output = await this.execVirsh(['snapshot-list', vmName, '--disk-only']);
      const lines = output.split('\n').slice(2);
      const snapshots = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          snapshots.push({
            name: parts[0],
            state: parts[1],
            time: parts.slice(2).join(' ')
          });
        }
      }

      return snapshots;
    } catch (error) {
      throw new Error(`获取快照列表失败: ${error.message}`);
    }
  }

  async deleteSnapshot(vmName, snapshotName) {
    try {
      await this.execVirsh(['snapshot-delete', vmName, snapshotName, '--metadata']);
      return { success: true };
    } catch (error) {
      throw new Error(`删除快照失败: ${error.message}`);
    }
  }

  async getImageInfo(imagePath) {
    try {
      const output = await this.execQemuImg(['info', '--output=json', imagePath]);
      return JSON.parse(output);
    } catch (error) {
      throw new Error(`获取镜像信息失败: ${error.message}`);
    }
  }

  async getChangedBlocks(baseImage, topImage) {
    try {
      const output = await this.execQemuImg([
        'compare',
        '-f', 'qcow2',
        '-F', 'qcow2',
        baseImage,
        topImage
      ]);

      const blocks = [];
      const lines = output.split('\n');
      
      for (const line of lines) {
        const match = line.match(/Offset\s+0x([0-9a-fA-F]+),\s+chunk\s+(\d+)/);
        if (match) {
          blocks.push({
            offset: parseInt(match[1], 16),
            chunk: parseInt(match[2])
          });
        }
      }

      return blocks;
    } catch (error) {
      if (error.message.includes('Images are identical')) {
        return [];
      }
      throw new Error(`获取变化块失败: ${error.message}`);
    }
  }

  async commitSnapshot(vmName, snapshotName) {
    try {
      await this.execVirsh(['blockcommit', vmName, 'vda', '--active', '--verbose']);
      return { success: true };
    } catch (error) {
      throw new Error(`提交快照失败: ${error.message}`);
    }
  }

  async blockCommitToBase(vmName, topSnapshot = null) {
    try {
      const args = ['blockcommit', vmName, 'vda', '--active', '--verbose'];
      if (topSnapshot) {
        args.push('--top', topSnapshot);
      }
      await this.execVirsh(args);
      return { success: true };
    } catch (error) {
      throw new Error(`合并快照失败: ${error.message}`);
    }
  }

  async blockPull(vmName, basePath) {
    try {
      await this.execVirsh(['blockpull', vmName, 'vda', '--base', basePath, '--wait']);
      return { success: true };
    } catch (error) {
      throw new Error(`拉取快照失败: ${error.message}`);
    }
  }

  async revertSnapshot(vmName, snapshotName) {
    try {
      await this.execVirsh(['snapshot-revert', vmName, snapshotName, '--force']);
      return { success: true };
    } catch (error) {
      throw new Error(`恢复快照失败: ${error.message}`);
    }
  }

  async deleteSnapshotMetadata(vmName, snapshotName) {
    try {
      await this.execVirsh(['snapshot-delete', vmName, snapshotName, '--metadata', '--children']);
      return { success: true };
    } catch (error) {
      throw new Error(`删除快照元数据失败: ${error.message}`);
    }
  }

  async rebaseImage(topImage, baseImage) {
    try {
      await this.execQemuImg(['rebase', '-u', '-b', baseImage, topImage]);
      return { success: true };
    } catch (error) {
      throw new Error(`重新绑定镜像失败: ${error.message}`);
    }
  }

  async commitImage(topImage, baseImage) {
    try {
      await this.execQemuImg(['commit', topImage]);
      return { success: true };
    } catch (error) {
      throw new Error(`提交镜像失败: ${error.message}`);
    }
  }

  mountImage(imagePath, mountPoint) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(mountPoint)) {
        fs.mkdirSync(mountPoint, { recursive: true });
      }

      exec(`guestmount -a ${imagePath} -i --ro ${mountPoint}`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve({ success: true, mountPoint });
        }
      });
    });
  }

  unmountImage(mountPoint) {
    return new Promise((resolve, reject) => {
      exec(`fusermount -u ${mountPoint}`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  async backupIncremental(sourcePath, backupPath, changedBlocks, blockSize = 4096) {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(sourcePath, {
        highWaterMark: blockSize
      });

      const writeStream = fs.createWriteStream(backupPath);
      let offset = 0;
      let blockIndex = 0;
      let changedCount = 0;

      readStream.on('data', (chunk) => {
        const blockOffset = offset;
        offset += chunk.length;

        const isChanged = changedBlocks.some(b => 
          blockOffset >= b.offset && blockOffset < b.offset + blockSize
        );

        if (isChanged) {
          const header = Buffer.alloc(8);
          header.writeBigUInt64BE(BigInt(blockOffset), 0);
          writeStream.write(header);
          writeStream.write(chunk);
          changedCount++;
        }

        blockIndex++;
      });

      readStream.on('end', () => {
        writeStream.end();
        resolve({
          success: true,
          changedBlocks: changedCount,
          backupPath
        });
      });

      readStream.on('error', reject);
      writeStream.on('error', reject);
    });
  }

  async fullBackup(sourcePath, backupPath) {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(sourcePath);
      const writeStream = fs.createWriteStream(backupPath);

      readStream.pipe(writeStream);

      writeStream.on('finish', () => {
        const stats = fs.statSync(backupPath);
        resolve({
          success: true,
          size: stats.size,
          backupPath
        });
      });

      readStream.on('error', reject);
      writeStream.on('error', reject);
    });
  }
}

module.exports = new LibvirtManager();
