const ftp = require('basic-ftp');
const SftpClient = require('ssh2-sftp-client');
const fs = require('fs');
const path = require('path');

class FtpService {
  constructor() {
    this.ftpClient = new ftp.Client();
    this.ftpClient.ftp.verbose = false;
    this.sftpClient = new SftpClient();
    this.isConnected = false;
    this.useSftp = false;
    this.currentConfig = null;
  }

  async connect(config) {
    this.currentConfig = config;
    try {
      await this.ftpClient.access({
        host: config.host,
        port: config.port || 21,
        user: config.user,
        password: config.password,
        secure: config.secure || false
      });
      this.isConnected = true;
      this.useSftp = false;
      return { success: true, protocol: 'FTP', message: 'Connected successfully via FTP' };
    } catch (ftpError) {
      if (config.sftpFallback !== false) {
        try {
          await this.sftpClient.connect({
            host: config.host,
            port: config.sftpPort || 22,
            username: config.user,
            password: config.password
          });
          this.isConnected = true;
          this.useSftp = true;
          return { success: true, protocol: 'SFTP', message: 'Connected successfully via SFTP (fallback)' };
        } catch (sftpError) {
          this.isConnected = false;
          throw new Error(`FTP failed: ${ftpError.message}, SFTP fallback failed: ${sftpError.message}`);
        }
      }
      this.isConnected = false;
      throw ftpError;
    }
  }

  async disconnect() {
    try {
      if (this.useSftp) {
        await this.sftpClient.end();
      } else {
        await this.ftpClient.close();
      }
      this.isConnected = false;
      this.useSftp = false;
      return true;
    } catch (error) {
      throw error;
    }
  }

  async setBinaryMode() {
    if (!this.isConnected) {
      throw new Error('Not connected to FTP server');
    }
    if (this.useSftp) {
      return { success: true, protocol: 'SFTP', message: 'Binary mode is default for SFTP' };
    }
    try {
      const response = await this.ftpClient.ftp.send('TYPE I');
      if (response.code !== 200) {
        throw new Error(`Failed to set binary mode, response code: ${response.code}, message: ${response.message}`);
      }
      return { success: true, code: response.code, message: response.message };
    } catch (error) {
      throw new Error(`TYPE I command failed: ${error.message}`);
    }
  }

  async getRemoteMtime(remotePath) {
    if (!this.isConnected) {
      throw new Error('Not connected to FTP server');
    }
    if (this.useSftp) {
      const stats = await this.sftpClient.stat(remotePath);
      return new Date(stats.mtime * 1000);
    }
    try {
      const response = await this.ftpClient.ftp.send(`MDTM ${remotePath}`);
      if (response.code === 213) {
        const timeStr = response.message.trim();
        const year = parseInt(timeStr.substring(0, 4));
        const month = parseInt(timeStr.substring(4, 6)) - 1;
        const day = parseInt(timeStr.substring(6, 8));
        const hour = parseInt(timeStr.substring(8, 10));
        const minute = parseInt(timeStr.substring(10, 12));
        const second = parseInt(timeStr.substring(12, 14));
        return new Date(year, month, day, hour, minute, second);
      }
      throw new Error(`MDTM command failed with code ${response.code}`);
    } catch (error) {
      throw new Error(`MDTM command failed: ${error.message}`);
    }
  }

  async list(remotePath = '/') {
    if (!this.isConnected) {
      throw new Error('Not connected to FTP server');
    }
    try {
      let list;
      if (this.useSftp) {
        list = await this.sftpClient.list(remotePath);
        list = list.map(item => ({
          name: item.name,
          type: item.type === 'd' ? 2 : 1,
          size: item.size,
          modifiedAt: item.modifyTime ? new Date(item.modifyTime) : null,
          permissions: item.permissions,
          owner: item.owner,
          group: item.group
        }));
      } else {
        list = await this.ftpClient.list(remotePath);
        list = list.map(item => ({
          name: item.name,
          type: item.type,
          size: item.size,
          modifiedAt: item.modifiedAt,
          permissions: item.permissions,
          owner: item.owner,
          group: item.group
        }));
      }
      return list;
    } catch (error) {
      throw error;
    }
  }

  async upload(localPath, remotePath, onProgress) {
    if (!this.isConnected) {
      throw new Error('Not connected to FTP server');
    }
    try {
      const stats = fs.statSync(localPath);
      const totalSize = stats.size;

      if (this.useSftp) {
        return await this.sftpUpload(localPath, remotePath, totalSize, onProgress);
      }

      const startedAt = Date.now();
      this.ftpClient.trackProgress((info) => {
        if (info.type === 'upload') {
          const progress = {
            name: path.basename(localPath),
            bytes: info.bytes,
            totalBytes: totalSize,
            percentage: Math.round((info.bytes / totalSize) * 100),
            speed: this.calculateSpeed(info.bytes, startedAt)
          };
          if (onProgress) onProgress(progress);
        }
      });

      await this.ftpClient.uploadFrom(localPath, remotePath);
      this.ftpClient.trackProgress(undefined);
      return { success: true, localPath, remotePath };
    } catch (error) {
      if (!this.useSftp) this.ftpClient.trackProgress(undefined);
      throw error;
    }
  }

  async sftpUpload(localPath, remotePath, totalSize, onProgress) {
    const readStream = fs.createReadStream(localPath);
    let uploadedBytes = 0;
    const startedAt = Date.now();

    readStream.on('data', (chunk) => {
      uploadedBytes += chunk.length;
      if (onProgress) {
        onProgress({
          name: path.basename(localPath),
          bytes: uploadedBytes,
          totalBytes: totalSize,
          percentage: Math.round((uploadedBytes / totalSize) * 100),
          speed: this.calculateSpeed(uploadedBytes, startedAt)
        });
      }
    });

    await this.sftpClient.put(readStream, remotePath);
    return { success: true, localPath, remotePath };
  }

  async download(remotePath, localPath, onProgress) {
    if (!this.isConnected) {
      throw new Error('Not connected to FTP server');
    }
    try {
      if (!this.useSftp) {
        await this.setBinaryMode();
      }

      const totalSize = await this.getRemoteFileSize(remotePath);

      if (this.useSftp) {
        return await this.sftpDownload(remotePath, localPath, totalSize, onProgress);
      }

      const writeStream = fs.createWriteStream(localPath);
      const startedAt = Date.now();

      this.ftpClient.trackProgress((info) => {
        if (info.type === 'download') {
          const progress = {
            name: path.basename(remotePath),
            bytes: info.bytes,
            totalBytes: totalSize,
            percentage: totalSize > 0 ? Math.round((info.bytes / totalSize) * 100) : 0,
            speed: this.calculateSpeed(info.bytes, startedAt)
          };
          if (onProgress) onProgress(progress);
        }
      });

      await this.ftpClient.downloadTo(writeStream, remotePath);
      this.ftpClient.trackProgress(undefined);

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      return { success: true, remotePath, localPath, binaryMode: true };
    } catch (error) {
      if (!this.useSftp) this.ftpClient.trackProgress(undefined);
      throw error;
    }
  }

  async sftpDownload(remotePath, localPath, totalSize, onProgress) {
    const writeStream = fs.createWriteStream(localPath);
    const startedAt = Date.now();

    const readStream = await this.sftpClient.get(remotePath);
    let downloadedBytes = 0;

    readStream.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      if (onProgress) {
        onProgress({
          name: path.basename(remotePath),
          bytes: downloadedBytes,
          totalBytes: totalSize,
          percentage: totalSize > 0 ? Math.round((downloadedBytes / totalSize) * 100) : 0,
          speed: this.calculateSpeed(downloadedBytes, startedAt)
        });
      }
    });

    await new Promise((resolve, reject) => {
      readStream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      readStream.on('error', reject);
    });

    return { success: true, remotePath, localPath };
  }

  async getRemoteFileSize(remotePath) {
    if (this.useSftp) {
      const stats = await this.sftpClient.stat(remotePath);
      return stats.size;
    }
    const list = await this.ftpClient.list(path.dirname(remotePath));
    const file = list.find(f => f.name === path.basename(remotePath));
    return file ? file.size : 0;
  }

  async resumeUpload(localPath, remotePath, onProgress) {
    if (!this.isConnected) {
      throw new Error('Not connected to FTP server');
    }
    try {
      let startAt = 0;
      try {
        if (this.useSftp) {
          try {
            const stats = await this.sftpClient.stat(remotePath);
            startAt = stats.size;
          } catch (e) {
            startAt = 0;
          }
        } else {
          const remoteList = await this.ftpClient.list(path.dirname(remotePath));
          const remoteFile = remoteList.find(f => f.name === path.basename(remotePath));
          if (remoteFile) {
            startAt = remoteFile.size;
          }
        }
      } catch (e) {
        startAt = 0;
      }

      const stats = fs.statSync(localPath);
      const totalSize = stats.size;

      if (startAt >= totalSize) {
        if (onProgress) {
          onProgress({
            name: path.basename(localPath),
            bytes: totalSize,
            totalBytes: totalSize,
            percentage: 100,
            speed: 0
          });
        }
        return { success: true, localPath, remotePath, resumed: true, fromBytes: startAt };
      }

      if (this.useSftp) {
        return await this.sftpResumeUpload(localPath, remotePath, startAt, totalSize, onProgress);
      }

      const startedAt = Date.now();
      this.ftpClient.trackProgress((info) => {
        if (info.type === 'upload') {
          const currentBytes = startAt + info.bytes;
          const progress = {
            name: path.basename(localPath),
            bytes: currentBytes,
            totalBytes: totalSize,
            percentage: Math.round((currentBytes / totalSize) * 100),
            speed: this.calculateSpeed(info.bytes, startedAt),
            resumed: true,
            fromBytes: startAt
          };
          if (onProgress) onProgress(progress);
        }
      });

      await this.ftpClient.uploadFrom(localPath, remotePath, { startAt });
      this.ftpClient.trackProgress(undefined);
      return { success: true, localPath, remotePath, resumed: true, fromBytes: startAt };
    } catch (error) {
      if (!this.useSftp) this.ftpClient.trackProgress(undefined);
      throw error;
    }
  }

  async sftpResumeUpload(localPath, remotePath, startAt, totalSize, onProgress) {
    const readStream = fs.createReadStream(localPath, { start: startAt });
    let uploadedBytes = startAt;
    const startedAt = Date.now();

    readStream.on('data', (chunk) => {
      uploadedBytes += chunk.length;
      if (onProgress) {
        onProgress({
          name: path.basename(localPath),
          bytes: uploadedBytes,
          totalBytes: totalSize,
          percentage: Math.round((uploadedBytes / totalSize) * 100),
          speed: this.calculateSpeed(uploadedBytes - startAt, startedAt),
          resumed: true,
          fromBytes: startAt
        });
      }
    });

    const writeStream = await this.sftpClient.createWriteStream(remotePath, {
      flags: startAt > 0 ? 'a' : 'w',
      start: startAt
    });

    await new Promise((resolve, reject) => {
      readStream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      readStream.on('error', reject);
    });

    return { success: true, localPath, remotePath, resumed: true, fromBytes: startAt };
  }

  async resumeDownload(remotePath, localPath, onProgress) {
    if (!this.isConnected) {
      throw new Error('Not connected to FTP server');
    }
    try {
      if (!this.useSftp) {
        await this.setBinaryMode();
      }

      let startAt = 0;
      if (fs.existsSync(localPath)) {
        startAt = fs.statSync(localPath).size;
      }

      const totalSize = await this.getRemoteFileSize(remotePath);

      if (startAt >= totalSize && totalSize > 0) {
        if (onProgress) {
          onProgress({
            name: path.basename(remotePath),
            bytes: totalSize,
            totalBytes: totalSize,
            percentage: 100,
            speed: 0,
            resumed: true,
            fromBytes: startAt
          });
        }
        return { success: true, remotePath, localPath, resumed: true, fromBytes: startAt, binaryMode: true };
      }

      if (this.useSftp) {
        return await this.sftpResumeDownload(remotePath, localPath, startAt, totalSize, onProgress);
      }

      const writeStream = fs.createWriteStream(localPath, { flags: startAt > 0 ? 'a' : 'w', start: startAt });
      const startedAt = Date.now();

      this.ftpClient.trackProgress((info) => {
        if (info.type === 'download') {
          const currentBytes = startAt + info.bytes;
          const progress = {
            name: path.basename(remotePath),
            bytes: currentBytes,
            totalBytes: totalSize,
            percentage: totalSize > 0 ? Math.round((currentBytes / totalSize) * 100) : 0,
            speed: this.calculateSpeed(info.bytes, startedAt),
            resumed: true,
            fromBytes: startAt
          };
          if (onProgress) onProgress(progress);
        }
      });

      await this.ftpClient.downloadTo(writeStream, remotePath, { startAt });
      this.ftpClient.trackProgress(undefined);

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      return { success: true, remotePath, localPath, resumed: true, fromBytes: startAt, binaryMode: true };
    } catch (error) {
      if (!this.useSftp) this.ftpClient.trackProgress(undefined);
      throw error;
    }
  }

  async sftpResumeDownload(remotePath, localPath, startAt, totalSize, onProgress) {
    const writeStream = fs.createWriteStream(localPath, { flags: startAt > 0 ? 'a' : 'w', start: startAt });
    const startedAt = Date.now();

    const readStream = await this.sftpClient.get(remotePath, {
      readStreamOptions: { start: startAt }
    });
    let downloadedBytes = startAt;

    readStream.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      if (onProgress) {
        onProgress({
          name: path.basename(remotePath),
          bytes: downloadedBytes,
          totalBytes: totalSize,
          percentage: totalSize > 0 ? Math.round((downloadedBytes / totalSize) * 100) : 0,
          speed: this.calculateSpeed(downloadedBytes - startAt, startedAt),
          resumed: true,
          fromBytes: startAt
        });
      }
    });

    await new Promise((resolve, reject) => {
      readStream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      readStream.on('error', reject);
    });

    return { success: true, remotePath, localPath, resumed: true, fromBytes: startAt };
  }

  async delete(remotePath) {
    if (!this.isConnected) {
      throw new Error('Not connected to FTP server');
    }
    try {
      if (this.useSftp) {
        await this.sftpClient.delete(remotePath);
      } else {
        await this.ftpClient.remove(remotePath);
      }
      return true;
    } catch (error) {
      throw error;
    }
  }

  async mkdir(remotePath) {
    if (!this.isConnected) {
      throw new Error('Not connected to FTP server');
    }
    try {
      if (this.useSftp) {
        await this.sftpClient.mkdir(remotePath, true);
      } else {
        await this.ftpClient.ensureDir(remotePath);
      }
      return true;
    } catch (error) {
      throw error;
    }
  }

  async mirrorSync(localDir, remoteDir, onProgress, onFileComplete) {
    if (!this.isConnected) {
      throw new Error('Not connected to FTP server');
    }

    const results = {
      uploaded: [],
      downloaded: [],
      skipped: [],
      errors: []
    };

    const syncFile = async (localPath, remotePath, direction) => {
      try {
        if (direction === 'upload') {
          await this.upload(localPath, remotePath, onProgress);
          results.uploaded.push(remotePath);
        } else {
          await this.download(remotePath, localPath, onProgress);
          results.downloaded.push(localPath);
        }
        if (onFileComplete) onFileComplete(localPath, remotePath, direction);
      } catch (error) {
        results.errors.push({ path: remotePath, error: error.message });
      }
    };

    const compareAndSync = async (localPath, remotePath, fileName) => {
      const localFilePath = path.join(localPath, fileName);
      const remoteFilePath = remotePath === '/' ? `/${fileName}` : `${remotePath}/${fileName}`;

      try {
        const localStats = fs.statSync(localFilePath);
        
        if (localStats.isDirectory()) {
          await this.mkdir(remoteFilePath);
          await this.mirrorSyncRecursive(localFilePath, remoteFilePath, onProgress, onFileComplete, results);
        } else {
          let needUpload = true;
          try {
            const remoteMtime = await this.getRemoteMtime(remoteFilePath);
            const localMtime = localStats.mtime;
            needUpload = localMtime > remoteMtime;
            if (!needUpload) {
              results.skipped.push(remoteFilePath);
            }
          } catch (e) {
            needUpload = true;
          }

          if (needUpload) {
            await syncFile(localFilePath, remoteFilePath, 'upload');
          }
        }
      } catch (error) {
        results.errors.push({ path: localFilePath, error: error.message });
      }
    };

    const files = fs.readdirSync(localDir);
    for (const file of files) {
      await compareAndSync(localDir, remoteDir, file);
    }

    return results;
  }

  async mirrorSyncRecursive(localDir, remoteDir, onProgress, onFileComplete, results) {
    const files = fs.readdirSync(localDir);
    for (const file of files) {
      const localFilePath = path.join(localDir, file);
      const remoteFilePath = `${remoteDir}/${file}`;

      try {
        const localStats = fs.statSync(localFilePath);
        
        if (localStats.isDirectory()) {
          try {
            await this.mkdir(remoteFilePath);
          } catch (e) {}
          await this.mirrorSyncRecursive(localFilePath, remoteFilePath, onProgress, onFileComplete, results);
        } else {
          let needUpload = true;
          try {
            const remoteMtime = await this.getRemoteMtime(remoteFilePath);
            const localMtime = localStats.mtime;
            needUpload = localMtime > remoteMtime;
            if (!needUpload) {
              results.skipped.push(remoteFilePath);
            }
          } catch (e) {
            needUpload = true;
          }

          if (needUpload) {
            await this.upload(localFilePath, remoteFilePath, onProgress);
            results.uploaded.push(remoteFilePath);
            if (onFileComplete) onFileComplete(localFilePath, remoteFilePath, 'upload');
          }
        }
      } catch (error) {
        results.errors.push({ path: localFilePath, error: error.message });
      }
    }
  }

  calculateSpeed(bytes, startedAt) {
    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed <= 0) return '0 B/s';
    const bytesPerSecond = bytes / elapsed;
    return this.formatBytes(bytesPerSecond) + '/s';
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new FtpService();
