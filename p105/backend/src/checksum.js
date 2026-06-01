const crypto = require('crypto');
const fs = require('fs');

class ChecksumManager {
  async calculateFileChecksum(filePath, algorithm = 'sha256') {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        reject(new Error('文件不存在'));
        return;
      }

      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => {
        hash.update(data);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', reject);
    });
  }

  async verifyFileChecksum(filePath, expectedChecksum, algorithm = 'sha256') {
    const actualChecksum = await this.calculateFileChecksum(filePath, algorithm);
    return {
      valid: actualChecksum === expectedChecksum,
      expected: expectedChecksum,
      actual: actualChecksum
    };
  }

  calculateStringChecksum(str, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(str).digest('hex');
  }

  async exportChecksumFile(backup, outputPath) {
    const checksumData = {
      backup_id: backup.id,
      backup_name: backup.name,
      file_path: backup.backup_path,
      checksum: backup.checksum,
      algorithm: backup.checksum_algorithm,
      size: backup.size,
      created_at: backup.created_at,
      exported_at: new Date().toISOString()
    };

    const content = `# KVM备份校验和文件
# 请勿修改此文件内容

备份ID: ${checksumData.backup_id}
备份名称: ${checksumData.backup_name}
文件路径: ${checksumData.file_path}
校验和算法: ${checksumData.algorithm}
文件大小: ${checksumData.size} bytes
创建时间: ${checksumData.created_at}
导出时间: ${checksumData.exported_at}

${checksumData.algorithm.toUpperCase()}: ${checksumData.checksum}
`;

    fs.writeFileSync(outputPath, content);
    return outputPath;
  }

  parseChecksumFile(checksumFilePath) {
    const content = fs.readFileSync(checksumFilePath, 'utf8');
    const lines = content.split('\n');
    const result = {};

    for (const line of lines) {
      if (line.startsWith('#') || !line.trim()) continue;
      
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        result[key] = value;
      } else if (line.includes(':')) {
        const parts = line.split(':');
        if (parts.length === 2) {
          result[parts[0].trim().toUpperCase()] = parts[1].trim();
        }
      }
    }

    return result;
  }
}

module.exports = new ChecksumManager();
