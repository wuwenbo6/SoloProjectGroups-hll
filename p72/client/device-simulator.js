const coap = require('coap');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { patch } = require('bsdiff-node');

class DeviceSimulator {
  constructor(deviceId, deviceName) {
    this.deviceId = deviceId;
    this.deviceName = deviceName;
    this.currentVersion = 'v0.0.0';
    this.serverHost = 'localhost';
    this.serverPort = 5683;
    
    this.requestTimeout = 5000;
    this.baseRequestInterval = 200;
    this.maxRequestInterval = 2000;
    this.currentRequestInterval = this.baseRequestInterval;
    
    this.tempDir = path.join(__dirname, '../firmware/temp');
    this.ensureTempDir();
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  getTempFilePath(recordId) {
    return path.join(this.tempDir, `${this.deviceId}_${recordId}.tmp`);
  }

  getBitmapPath(recordId) {
    return path.join(this.tempDir, `${this.deviceId}_${recordId}_bitmap.json`);
  }

  loadDownloadedBlocks(recordId, totalBlocks) {
    const bitmapPath = this.getBitmapPath(recordId);
    if (fs.existsSync(bitmapPath)) {
      try {
        const bitmap = JSON.parse(fs.readFileSync(bitmapPath, 'utf8'));
        return bitmap;
      } catch (e) {
        console.warn(`[${this.deviceId}] 读取块位图失败，重新下载`);
      }
    }
    return { downloaded: new Array(totalBlocks).fill(false), count: 0 };
  }

  saveDownloadedBlocks(recordId, bitmap) {
    fs.writeFileSync(this.getBitmapPath(recordId), JSON.stringify(bitmap));
  }

  saveBlockData(recordId, blockIndex, data) {
    const tempPath = this.getTempFilePath(recordId);
    const fd = fs.openSync(tempPath, 'a+');
    fs.writeSync(fd, data, 0, data.length, blockIndex * 1024);
    fs.closeSync(fd);
  }

  assembleFirmwareFromTemp(recordId, totalBlocks, expectedSize) {
    const tempPath = this.getTempFilePath(recordId);
    if (fs.existsSync(tempPath)) {
      const data = fs.readFileSync(tempPath);
      return data.slice(0, expectedSize);
    }
    return null;
  }

  cleanupTempFiles(recordId) {
    const tempPath = this.getTempFilePath(recordId);
    const bitmapPath = this.getBitmapPath(recordId);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    if (fs.existsSync(bitmapPath)) fs.unlinkSync(bitmapPath);
  }

  request(path, method = 'GET', payload = null) {
    return new Promise((resolve, reject) => {
      const req = coap.request({
        host: this.serverHost,
        port: this.serverPort,
        pathname: path,
        method: method,
        confirmable: true,
        retrySend: 2
      });

      const timeout = setTimeout(() => {
        req.abort();
        reject(new Error('Request timeout'));
      }, this.requestTimeout);

      req.on('response', (res) => {
        clearTimeout(timeout);
        let data = Buffer.alloc(0);
        res.on('data', (chunk) => {
          data = Buffer.concat([data, chunk]);
        });
        res.on('end', () => {
          try {
            resolve({
              code: res.code,
              data: JSON.parse(data.toString())
            });
          } catch (e) {
            resolve({
              code: res.code,
              data: data.toString()
            });
          }
        });
      });

      req.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      if (payload) {
        req.write(JSON.stringify(payload));
      }
      req.end();
    });
  }

  async register() {
    console.log(`[${this.deviceId}] 注册设备...`);
    try {
      const res = await this.request('/register', 'POST', {
        deviceId: this.deviceId,
        name: this.deviceName,
        version: this.currentVersion
      });
      console.log(`[${this.deviceId}] 注册结果:`, res.data);
      return res.data.success;
    } catch (e) {
      console.error(`[${this.deviceId}] 注册失败:`, e.message);
      return false;
    }
  }

  async checkUpgrade() {
    console.log(`[${this.deviceId}] 检查升级...`);
    try {
      const res = await this.request(`/check/${this.deviceId}`);
      return res.data;
    } catch (e) {
      console.error(`[${this.deviceId}] 检查升级失败:`, e.message);
      return { upgradeAvailable: false };
    }
  }

  async getBlockWithBackoff(recordId, blockNum) {
    let attempt = 0;
    const maxAttempts = 5;
    
    while (attempt < maxAttempts) {
      try {
        const res = await this.request(`/block/${recordId}/${blockNum}`);
        
        this.currentRequestInterval = Math.max(
          this.baseRequestInterval,
          this.currentRequestInterval * 0.9
        );
        
        return res.data;
      } catch (e) {
        attempt++;
        const backoffTime = Math.min(
          this.currentRequestInterval * Math.pow(1.5, attempt),
          this.maxRequestInterval
        );
        console.warn(`[${this.deviceId}] 块 ${blockNum} 请求失败 (${attempt}/${maxAttempts}，${backoffTime}ms 后重试`);
        await new Promise(r => setTimeout(r, backoffTime));
      }
    }
    
    throw new Error(`块 ${blockNum} 下载失败，超过最大重试次数`);
  }

  verifyBlock(blockData, expectedChecksum) {
    const actualChecksum = crypto.createHash('md5').update(blockData).digest('hex');
    return actualChecksum === expectedChecksum;
  }

  verifyFirmware(firmwareBuffer, expectedChecksum) {
    const actualChecksum = crypto.createHash('md5').update(firmwareBuffer).digest('hex');
    return actualChecksum === expectedChecksum;
  }

  async reportProgress(recordId, blockNum) {
    try {
      await this.request('/progress', 'POST', {
        recordId,
        blockNum,
        deviceId: this.deviceId
      });
    } catch (e) {
      console.warn(`[${this.deviceId}] 上报进度失败:`, e.message);
    }
  }

  async reportComplete(recordId, success, errorMessage = null, newVersion = null) {
    try {
      await this.request('/complete', 'POST', {
        recordId,
        success,
        errorMessage,
        deviceId: this.deviceId,
        version: newVersion
      });
    } catch (e) {
      console.warn(`[${this.deviceId}] 上报完成失败:`, e.message);
    }
  }

  async performUpgrade() {
    console.log(`[${this.deviceId}] ========== 开始升级流程 ==========`);
    
    await this.register();
    
    const upgradeInfo = await this.checkUpgrade();
    if (!upgradeInfo.upgradeAvailable) {
      console.log(`[${this.deviceId}] 没有可用的升级`);
      return false;
    }

    const { recordId, totalBlocks, version, checksum, isDelta, previousVersion, deltaChecksum } = upgradeInfo;
    
    console.log(`[${this.deviceId}] 发现升级:`, {
      recordId,
      version,
      isDelta,
      previousVersion,
      totalBlocks,
      resumeFrom: upgradeInfo.currentBlock
    });

    if (isDelta && !previousVersion) {
      console.warn(`[${this.deviceId}] 差分升级需要已知的旧版本，切换到完整固件升级...`);
      return this.performFullUpgrade(recordId, version, checksum, totalBlocks);
    }

    if (isDelta) {
      return this.performDeltaUpgrade(recordId, version, checksum, totalBlocks, previousVersion, deltaChecksum);
    } else {
      return this.performFullUpgrade(recordId, version, checksum, totalBlocks);
    }
  }

  async performFullUpgrade(recordId, version, checksum, totalBlocks) {
    console.log(`[${this.deviceId}] 执行完整固件升级...`);
    
    const firmware = await this.request(`/firmware/${recordId}`);
    const firmwareSize = firmware.data.size;
    
    this.backupCurrentFirmware(version);
    
    let bitmap = this.loadDownloadedBlocks(recordId, totalBlocks);
    let downloadedCount = bitmap.downloaded.filter(Boolean).length;
    console.log(`[${this.deviceId}] 已下载 ${downloadedCount}/${totalBlocks} 块`);

    for (let i = 0; i < totalBlocks; i++) {
      if (bitmap.downloaded[i]) continue;

      try {
        console.log(`[${this.deviceId}] 下载块 ${i}/${totalBlocks - 1}...`);
        
        const blockData = await this.getBlockWithBackoff(recordId, i);
        const blockBuffer = Buffer.from(blockData.data, 'base64');
        
        if (!this.verifyBlock(blockBuffer, blockData.checksum)) {
          console.error(`[${this.deviceId}] 块 ${i} 校验失败，重试...`);
          i--;
          continue;
        }
        
        this.saveBlockData(recordId, i, blockBuffer);
        bitmap.downloaded[i] = true;
        bitmap.count++;
        this.saveDownloadedBlocks(recordId, bitmap);
        
        await this.reportProgress(recordId, i + 1);
        console.log(`[${this.deviceId}] 块 ${i} 完成 (${bitmap.count}/${totalBlocks})`);
        
      } catch (error) {
        console.error(`[${this.deviceId}] 块 ${i} 下载失败:`, error.message);
        await this.attemptRollback(recordId, `Block ${i} download failed`);
        return false;
      }
      
      await new Promise(r => setTimeout(r, this.currentRequestInterval));
    }

    console.log(`[${this.deviceId}] 组装固件...`);
    const firmwareBuffer = this.assembleFirmwareFromTemp(recordId, totalBlocks, firmwareSize);
    
    if (!firmwareBuffer || !this.verifyFirmware(firmwareBuffer, checksum)) {
      console.error(`[${this.deviceId}] 固件校验失败！`);
      await this.attemptRollback(recordId, 'Firmware integrity check failed');
      return false;
    }
    
    return this.finalizeUpgrade(recordId, version, firmwareBuffer);
  }

  async performDeltaUpgrade(recordId, version, targetChecksum, totalBlocks, baseVersion, deltaChecksum) {
    console.log(`[${this.deviceId}] 执行差分升级: ${baseVersion} -> ${version}`);
    
    const baseFirmwarePath = path.join(__dirname, `../firmware/downloaded_${this.deviceId}_${baseVersion}.bin`);
    if (!fs.existsSync(baseFirmwarePath)) {
      console.warn(`[${this.deviceId}] 找不到旧版本固件 ${baseVersion}，切换到完整升级...`);
      return this.performFullUpgrade(recordId, version, targetChecksum, totalBlocks);
    }

    const baseFirmware = fs.readFileSync(baseFirmwarePath);
    console.log(`[${this.deviceId}] 旧版本固件大小: ${baseFirmware.length} bytes`);
    
    this.backupCurrentFirmware(version);
    
    const deltaBitmap = this.loadDownloadedBlocks(`${recordId}_delta`, totalBlocks);
    let downloadedCount = deltaBitmap.downloaded.filter(Boolean).length;
    console.log(`[${this.deviceId}] 已下载补丁 ${downloadedCount}/${totalBlocks} 块`);

    for (let i = 0; i < totalBlocks; i++) {
      if (deltaBitmap.downloaded[i]) continue;

      try {
        console.log(`[${this.deviceId}] 下载补丁块 ${i}/${totalBlocks - 1}...`);
        
        const blockData = await this.getDeltaBlockWithBackoff(recordId, i);
        const blockBuffer = Buffer.from(blockData.data, 'base64');
        
        if (!this.verifyBlock(blockBuffer, blockData.checksum)) {
          console.error(`[${this.deviceId}] 补丁块 ${i} 校验失败，重试...`);
          i--;
          continue;
        }
        
        this.saveBlockData(`${recordId}_delta`, i, blockBuffer);
        deltaBitmap.downloaded[i] = true;
        deltaBitmap.count++;
        this.saveDownloadedBlocks(`${recordId}_delta`, deltaBitmap);
        
        await this.reportProgress(recordId, i + 1);
        console.log(`[${this.deviceId}] 补丁块 ${i} 完成 (${deltaBitmap.count}/${totalBlocks})`);
        
      } catch (error) {
        console.error(`[${this.deviceId}] 补丁块 ${i} 下载失败:`, error.message);
        await this.attemptRollback(recordId, `Delta block ${i} download failed`);
        return false;
      }
      
      await new Promise(r => setTimeout(r, this.currentRequestInterval));
    }

    console.log(`[${this.deviceId}] 组装差分补丁...`);
    const deltaBuffer = this.assembleFirmwareFromTemp(`${recordId}_delta`, totalBlocks, -1);
    
    if (!deltaBuffer || !this.verifyFirmware(deltaBuffer, deltaChecksum)) {
      console.error(`[${this.deviceId}] 差分补丁校验失败！`);
      await this.attemptRollback(recordId, 'Delta integrity check failed');
      return false;
    }

    console.log(`[${this.deviceId}] 应用补丁 (补丁大小: ${deltaBuffer.length} bytes)...`);
    const newFirmware = patch(baseFirmware, deltaBuffer);
    console.log(`[${this.deviceId}] 补丁应用完成，新固件大小: ${newFirmware.length} bytes`);
    
    if (!this.verifyFirmware(newFirmware, targetChecksum)) {
      console.error(`[${this.deviceId}] 新固件校验失败！`);
      await this.attemptRollback(recordId, 'Patched firmware check failed');
      return false;
    }
    
    this.cleanupTempFiles(`${recordId}_delta`);
    
    return this.finalizeUpgrade(recordId, version, newFirmware);
  }

  async getDeltaBlockWithBackoff(recordId, blockNum) {
    let attempt = 0;
    const maxAttempts = 5;
    
    while (attempt < maxAttempts) {
      try {
        const res = await this.request(`/delta-block/${recordId}/${blockNum}`);
        
        this.currentRequestInterval = Math.max(
          this.baseRequestInterval,
          this.currentRequestInterval * 0.9
        );
        
        return res.data;
      } catch (e) {
        attempt++;
        const backoffTime = Math.min(
          this.currentRequestInterval * Math.pow(1.5, attempt),
          this.maxRequestInterval
        );
        console.warn(`[${this.deviceId}] 补丁块 ${blockNum} 请求失败 (${attempt}/${maxAttempts})，${backoffTime}ms 后重试`);
        await new Promise(r => setTimeout(r, backoffTime));
      }
    }
    
    throw new Error(`补丁块 ${blockNum} 下载失败，超过最大重试次数`);
  }

  backupCurrentFirmware(newVersion) {
    const currentPath = path.join(__dirname, `../firmware/downloaded_${this.deviceId}_${this.currentVersion}.bin`);
    const backupPath = path.join(__dirname, `../firmware/backup_${this.deviceId}_${this.currentVersion}_to_${newVersion}.bin`);
    
    if (fs.existsSync(currentPath)) {
      fs.copyFileSync(currentPath, backupPath);
      console.log(`[${this.deviceId}] 已备份当前固件: ${backupPath}`);
    }
  }

  async attemptRollback(recordId, errorMessage) {
    console.log(`[${this.deviceId}] 尝试回滚... 原因: ${errorMessage}`);
    
    try {
      await this.request('/rollback', 'POST', {
        recordId,
        success: true,
        errorMessage,
        deviceId: this.deviceId
      });
      
      const backupPath = path.join(__dirname, `../firmware/backup_${this.deviceId}_*.bin`);
      console.log(`[${this.deviceId}] 回滚记录已上报，恢复固件版本: ${this.currentVersion}`);
      
      return true;
    } catch (e) {
      console.error(`[${this.deviceId}] 回滚上报失败:`, e.message);
      return false;
    }
  }

  finalizeUpgrade(recordId, version, firmwareBuffer) {
    const outputPath = path.join(__dirname, `../firmware/downloaded_${this.deviceId}_${version}.bin`);
    fs.writeFileSync(outputPath, firmwareBuffer);
    console.log(`[${this.deviceId}] 固件已保存: ${outputPath}`);
    
    this.cleanupTempFiles(recordId);
    
    this.currentVersion = version;
    this.reportComplete(recordId, true, null, version);
    
    console.log(`[${this.deviceId}] ========== 升级完成: ${version} ==========`);
    return true;
  }

  async run() {
    console.log(`[${this.deviceId}] 设备模拟器启动`);
    console.log(`[${this.deviceId}] 当前版本: ${this.currentVersion}`);
    
    await this.performUpgrade();
    
    setInterval(async () => {
      await this.register();
      const upgradeInfo = await this.checkUpgrade();
      if (upgradeInfo.upgradeAvailable) {
        await this.performUpgrade();
      }
    }, 30000);
  }
}

if (require.main === module) {
  const deviceId = process.argv[2] || 'device_sim_001';
  const deviceName = process.argv[3] || '模拟器设备1';
  
  const device = new DeviceSimulator(deviceId, deviceName);
  device.run().catch(console.error);
}

module.exports = DeviceSimulator;
