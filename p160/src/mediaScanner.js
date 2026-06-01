const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const chokidar = require('chokidar');
const config = require('../config');

class MediaScanner {
  constructor() {
    this.mediaFiles = [];
    this.scanPaths = config.media.scanPaths;
    this.extensions = config.media.extensions;
    this.watcher = null;
  }

  getMediaType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    if (this.extensions.video.includes(ext)) return 'video';
    if (this.extensions.audio.includes(ext)) return 'audio';
    if (this.extensions.image.includes(ext)) return 'image';
    
    return null;
  }

  generateId(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex');
  }

  async scanFile(filePath) {
    try {
      const stats = await fs.promises.lstat(filePath);
      
      if (stats.isSymbolicLink()) {
        console.log('Skipping symlink:', filePath);
        return null;
      }
      
      if (!stats.isFile()) return null;

      const mediaType = this.getMediaType(filePath);
      if (!mediaType) return null;

      const fileName = path.basename(filePath);
      const dirName = path.basename(path.dirname(filePath));

      return {
        id: this.generateId(filePath),
        name: fileName,
        title: path.parse(fileName).name,
        type: mediaType,
        path: filePath,
        size: stats.size,
        directory: dirName,
        extension: path.extname(filePath).toLowerCase().slice(1),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      };
    } catch (err) {
      console.error('Error scanning file:', filePath, err.message);
      return null;
    }
  }

  async scanDirectory(dirPath) {
    const results = [];
    
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isSymbolicLink()) {
          console.log('Skipping symlink:', fullPath);
          continue;
        }
        
        if (entry.isDirectory()) {
          const subResults = await this.scanDirectory(fullPath);
          results.push(...subResults);
        } else {
          const file = await this.scanFile(fullPath);
          if (file) results.push(file);
        }
      }
    } catch (err) {
      console.error('Error scanning directory:', dirPath, err.message);
    }
    
    return results;
  }

  async scan() {
    console.log('Starting media scan...');
    const allFiles = [];

    for (const scanPath of this.scanPaths) {
      if (!fs.existsSync(scanPath)) {
        console.log('Path does not exist, skipping:', scanPath);
        continue;
      }
      
      const files = await this.scanDirectory(scanPath);
      allFiles.push(...files);
    }

    this.mediaFiles = allFiles;
    console.log(`Media scan complete. Found ${allFiles.length} files.`);
    return allFiles;
  }

  getAllMedia(type = null) {
    if (type && type !== 'all') {
      return this.mediaFiles.filter(f => f.type === type);
    }
    return [...this.mediaFiles];
  }

  getById(id) {
    return this.mediaFiles.find(f => f.id === id);
  }

  getStats() {
    return {
      total: this.mediaFiles.length,
      video: this.mediaFiles.filter(f => f.type === 'video').length,
      audio: this.mediaFiles.filter(f => f.type === 'audio').length,
      image: this.mediaFiles.filter(f => f.type === 'image').length
    };
  }

  startWatching() {
    if (!config.media.watchForChanges) return;

    const validPaths = this.scanPaths.filter(p => fs.existsSync(p));
    if (validPaths.length === 0) return;

    this.watcher = chokidar.watch(validPaths, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true
    });

    this.watcher
      .on('add', async (filePath) => {
        const file = await this.scanFile(filePath);
        if (file) {
          const exists = this.mediaFiles.find(f => f.id === file.id);
          if (!exists) {
            this.mediaFiles.push(file);
            console.log('New media added:', file.name);
          }
        }
      })
      .on('unlink', (filePath) => {
        const id = this.generateId(filePath);
        const index = this.mediaFiles.findIndex(f => f.id === id);
        if (index > -1) {
          const removed = this.mediaFiles.splice(index, 1)[0];
          console.log('Media removed:', removed.name);
        }
      })
      .on('change', async (filePath) => {
        const id = this.generateId(filePath);
        const index = this.mediaFiles.findIndex(f => f.id === id);
        const updated = await this.scanFile(filePath);
        if (updated && index > -1) {
          this.mediaFiles[index] = updated;
          console.log('Media updated:', updated.name);
        }
      });

    console.log('Watching for media changes...');
  }

  stopWatching() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

module.exports = MediaScanner;
