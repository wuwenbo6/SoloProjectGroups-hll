const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execSync, spawn } = require('child_process');
const EventEmitter = require('events');
const crypto = require('crypto');

class EncryptedUSBDetector extends EventEmitter {
    constructor(policyManager, auditLogger) {
        super();
        this.policyManager = policyManager;
        this.auditLogger = auditLogger;
        this.platform = os.platform();
        this.decryptedDevices = new Map();
        this.encryptionKeys = new Map();
    }

    detectEncryptionType(device, mountPoint) {
        const result = {
            isEncrypted: false,
            type: 'none',
            details: {}
        };

        if (!mountPoint || !fs.existsSync(mountPoint)) {
            return result;
        }

        try {
            if (this.platform === 'win32') {
                return this.detectWindowsEncryption(device, mountPoint);
            } else if (this.platform === 'darwin') {
                return this.detectMacEncryption(device, mountPoint);
            } else {
                return this.detectLinuxEncryption(device, mountPoint);
            }
        } catch (error) {
            console.error('Error detecting encryption:', error);
            return result;
        }
    }

    detectWindowsEncryption(device, mountPoint) {
        const result = {
            isEncrypted: false,
            type: 'none',
            details: {}
        };

        try {
            const driveLetter = mountPoint.charAt(0);
            const command = `manage-bde -status ${driveLetter}:`;
            const output = execSync(command, { encoding: 'utf8', timeout: 10000 });

            if (output.includes('BitLocker')) {
                result.isEncrypted = true;
                result.type = 'bitlocker';
                
                if (output.includes('Fully Encrypted') || output.includes('Used Space Only Encrypted')) {
                    result.details.encrypted = true;
                }
                if (output.includes('Protection On')) {
                    result.details.protectionEnabled = true;
                }
                
                const statusMatch = output.match(/Conversion Status:\s+(.+)/);
                if (statusMatch) {
                    result.details.status = statusMatch[1].trim();
                }
            }

            const encryptedFiles = this.scanForEncryptedFiles(mountPoint);
            if (encryptedFiles.length > 0) {
                result.isEncrypted = true;
                if (result.type === 'none') {
                    result.type = 'file';
                }
                result.details.encryptedFiles = encryptedFiles.slice(0, 10);
                result.details.encryptedFileCount = encryptedFiles.length;
            }

            return result;
        } catch (error) {
            const encryptedFiles = this.scanForEncryptedFiles(mountPoint);
            if (encryptedFiles.length > 0) {
                result.isEncrypted = true;
                result.type = 'file';
                result.details.encryptedFiles = encryptedFiles.slice(0, 10);
                result.details.encryptedFileCount = encryptedFiles.length;
            }
            return result;
        }
    }

    detectMacEncryption(device, mountPoint) {
        const result = {
            isEncrypted: false,
            type: 'none',
            details: {}
        };

        try {
            const diskInfo = execSync(`diskutil info "${mountPoint}" 2>/dev/null`, { encoding: 'utf8' });
            
            if (diskInfo.includes('Encrypted') || diskInfo.includes('FileVault')) {
                result.isEncrypted = true;
                result.type = 'filevault';
                
                if (diskInfo.includes('Yes (Locked)')) {
                    result.details.locked = true;
                } else if (diskInfo.includes('Yes (Unlocked)')) {
                    result.details.locked = false;
                }
            }

            const encryptedFiles = this.scanForEncryptedFiles(mountPoint);
            if (encryptedFiles.length > 0) {
                result.isEncrypted = true;
                if (result.type === 'none') {
                    result.type = 'file';
                }
                result.details.encryptedFiles = encryptedFiles.slice(0, 10);
                result.details.encryptedFileCount = encryptedFiles.length;
            }

            return result;
        } catch (error) {
            const encryptedFiles = this.scanForEncryptedFiles(mountPoint);
            if (encryptedFiles.length > 0) {
                result.isEncrypted = true;
                result.type = 'file';
                result.details.encryptedFiles = encryptedFiles.slice(0, 10);
                result.details.encryptedFileCount = encryptedFiles.length;
            }
            return result;
        }
    }

    detectLinuxEncryption(device, mountPoint) {
        const result = {
            isEncrypted: false,
            type: 'none',
            details: {}
        };

        try {
            const lsblkOutput = execSync('lsblk -f 2>/dev/null', { encoding: 'utf8' });
            const lines = lsblkOutput.split('\n');
            
            for (const line of lines) {
                if (line.includes('crypt') || line.includes('LUKS')) {
                    result.isEncrypted = true;
                    result.type = 'luks';
                    break;
                }
            }

            if (!result.isEncrypted) {
                const dmsetupOutput = execSync('dmsetup ls 2>/dev/null', { encoding: 'utf8' });
                if (dmsetupOutput.includes('crypt')) {
                    result.isEncrypted = true;
                    result.type = 'device-mapper';
                }
            }

            const encryptedFiles = this.scanForEncryptedFiles(mountPoint);
            if (encryptedFiles.length > 0) {
                result.isEncrypted = true;
                if (result.type === 'none') {
                    result.type = 'file';
                }
                result.details.encryptedFiles = encryptedFiles.slice(0, 10);
                result.details.encryptedFileCount = encryptedFiles.length;
            }

            return result;
        } catch (error) {
            const encryptedFiles = this.scanForEncryptedFiles(mountPoint);
            if (encryptedFiles.length > 0) {
                result.isEncrypted = true;
                result.type = 'file';
                result.details.encryptedFiles = encryptedFiles.slice(0, 10);
                result.details.encryptedFileCount = encryptedFiles.length;
            }
            return result;
        }
    }

    scanForEncryptedFiles(mountPoint) {
        const encryptedExtensions = ['.enc', '.encrypted', '.aes', '.gpg', '.pgp', '.bit', '.lock'];
        const encryptedFiles = [];

        try {
            this.findEncryptedFiles(mountPoint, encryptedExtensions, encryptedFiles, 0, 3);
        } catch (error) {
            console.error('Error scanning for encrypted files:', error);
        }

        return encryptedFiles;
    }

    findEncryptedFiles(dir, extensions, results, depth, maxDepth) {
        if (depth > maxDepth) return;

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                try {
                    if (entry.isDirectory() && !entry.name.startsWith('.')) {
                        this.findEncryptedFiles(fullPath, extensions, results, depth + 1, maxDepth);
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (extensions.includes(ext)) {
                            results.push(fullPath);
                        }
                        
                        const header = this.readFileHeader(fullPath);
                        if (header && this.isLikelyEncrypted(header, entry.name)) {
                            results.push(fullPath);
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${dir}:`, error);
        }
    }

    readFileHeader(filePath, bytes = 16) {
        try {
            const fd = fs.openSync(filePath, 'r');
            const buffer = Buffer.alloc(bytes);
            fs.readSync(fd, buffer, 0, bytes, 0);
            fs.closeSync(fd);
            return buffer;
        } catch (error) {
            return null;
        }
    }

    isLikelyEncrypted(header, filename) {
        const encryptedSignatures = [
            Buffer.from('Salted__'),
            Buffer.from([0x85, 0x01, 0x0c, 0x06]),
            Buffer.from([0x60, 0xea, 0x90, 0x85]),
        ];

        for (const sig of encryptedSignatures) {
            if (header.slice(0, sig.length).equals(sig)) {
                return true;
            }
        }

        let zeroBytes = 0;
        for (let i = 0; i < header.length; i++) {
            if (header[i] === 0) zeroBytes++;
        }
        if (zeroBytes > header.length * 0.3) {
            return false;
        }

        let variance = 0;
        const mean = header.reduce((a, b) => a + b, 0) / header.length;
        for (const byte of header) {
            variance += Math.pow(byte - mean, 2);
        }
        variance /= header.length;
        
        return variance > 1000 && variance < 5000;
    }

    async decryptDevice(device, password, options = {}) {
        const mountPoint = device.mountPoint || options.mountPoint;
        if (!mountPoint || !fs.existsSync(mountPoint)) {
            return { success: false, message: '无效的挂载点' };
        }

        const encryptionType = this.detectEncryptionType(device, mountPoint);
        
        if (!encryptionType.isEncrypted) {
            return { success: false, message: '设备未加密' };
        }

        try {
            this.auditLogger.log('decrypt_attempt', {
                deviceId: device.id,
                deviceName: device.deviceName,
                encryptionType: encryptionType.type,
                timestamp: new Date().toISOString()
            });

            let decryptResult;
            switch (encryptionType.type) {
                case 'bitlocker':
                    decryptResult = await this.decryptBitLocker(device, mountPoint, password);
                    break;
                case 'filevault':
                    decryptResult = await this.decryptFileVault(device, mountPoint, password);
                    break;
                case 'luks':
                    decryptResult = await this.decryptLUKS(device, mountPoint, password);
                    break;
                case 'file':
                    decryptResult = await this.decryptFiles(device, mountPoint, password, options);
                    break;
                default:
                    decryptResult = { success: false, message: '不支持的加密类型' };
            }

            if (decryptResult.success) {
                this.decryptedDevices.set(device.id, {
                    device,
                    encryptionType: encryptionType.type,
                    decryptedAt: new Date().toISOString(),
                    ...decryptResult
                });

                this.auditLogger.log('decrypt_success', {
                    deviceId: device.id,
                    deviceName: device.deviceName,
                    encryptionType: encryptionType.type,
                    timestamp: new Date().toISOString()
                });

                this.emit('device-decrypted', { device, encryptionType: encryptionType.type });
            } else {
                this.auditLogger.log('decrypt_failed', {
                    deviceId: device.id,
                    deviceName: device.deviceName,
                    reason: decryptResult.message,
                    timestamp: new Date().toISOString()
                });
            }

            return decryptResult;
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async decryptBitLocker(device, mountPoint, password) {
        return new Promise((resolve) => {
            const driveLetter = mountPoint.charAt(0);
            
            try {
                const command = `manage-bde -unlock ${driveLetter}: -password`;
                const child = spawn('cmd', ['/c', command], {
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                child.stdin.write(password + '\n');
                child.stdin.end();

                let output = '';
                child.stdout.on('data', (data) => {
                    output += data.toString();
                });

                child.on('close', (code) => {
                    if (code === 0 && output.includes('successfully unlocked')) {
                        resolve({ success: true, message: 'BitLocker解密成功' });
                    } else {
                        resolve({ success: false, message: 'BitLocker解密失败：密码错误或设备不可用' });
                    }
                });

                setTimeout(() => {
                    child.kill();
                    resolve({ success: false, message: 'BitLocker解密超时' });
                }, 30000);
            } catch (error) {
                resolve({ success: false, message: `BitLocker解密错误: ${error.message}` });
            }
        });
    }

    async decryptFileVault(device, mountPoint, password) {
        return new Promise((resolve) => {
            try {
                const command = `diskutil apfs unlockVolume "${mountPoint}" -passphrase "${password}"`;
                exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
                    if (error) {
                        resolve({ success: false, message: `FileVault解密失败: ${stderr || error.message}` });
                    } else if (stdout.includes('unlocked') || stdout.includes('Unlocked')) {
                        resolve({ success: true, message: 'FileVault解密成功' });
                    } else {
                        resolve({ success: false, message: 'FileVault解密失败' });
                    }
                });
            } catch (error) {
                resolve({ success: false, message: `FileVault解密错误: ${error.message}` });
            }
        });
    }

    async decryptLUKS(device, mountPoint, password) {
        return new Promise((resolve) => {
            try {
                const mapperName = `usb_${device.id.replace(/[:]/g, '_')}`;
                const command = `echo "${password}" | sudo cryptsetup luksOpen ${device.devicePath || '/dev/sdb1'} ${mapperName}`;
                
                exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
                    if (error) {
                        resolve({ success: false, message: `LUKS解密失败: ${stderr || error.message}` });
                    } else {
                        exec(`sudo mount /dev/mapper/${mapperName} ${mountPoint}`, (mountError) => {
                            if (mountError) {
                                resolve({ success: false, message: `设备挂载失败: ${mountError.message}` });
                            } else {
                                resolve({ success: true, message: 'LUKS解密成功' });
                            }
                        });
                    }
                });
            } catch (error) {
                resolve({ success: false, message: `LUKS解密错误: ${error.message}` });
            }
        });
    }

    async decryptFiles(device, mountPoint, password, options) {
        const encryptedFiles = this.scanForEncryptedFiles(mountPoint);
        const decryptResults = [];
        const key = this.deriveKey(password, options.salt);

        for (const filePath of encryptedFiles.slice(0, options.maxFiles || 100)) {
            try {
                const result = this.decryptFile(filePath, key, options);
                decryptResults.push({
                    filePath,
                    success: result.success,
                    outputPath: result.outputPath || null
                });
            } catch (error) {
                decryptResults.push({
                    filePath,
                    success: false,
                    error: error.message
                });
            }
        }

        const successCount = decryptResults.filter(r => r.success).length;
        
        return {
            success: successCount > 0,
            message: `已解密 ${successCount}/${encryptedFiles.length} 个文件`,
            details: decryptResults
        };
    }

    deriveKey(password, salt) {
        if (!salt) {
            salt = crypto.randomBytes(16);
        }
        return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    }

    decryptFile(filePath, key, options = {}) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            const baseName = path.basename(filePath, ext);
            const outputPath = path.join(path.dirname(filePath), `decrypted_${baseName}`);

            if (ext === '.aes' || ext === '.enc') {
                const input = fs.createReadStream(filePath);
                const output = fs.createWriteStream(outputPath);
                const iv = Buffer.alloc(16, 0);
                
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                
                return new Promise((resolve) => {
                    input.pipe(decipher).pipe(output);
                    output.on('finish', () => {
                        resolve({ success: true, outputPath });
                    });
                    output.on('error', (err) => {
                        resolve({ success: false, error: err.message });
                    });
                });
            } else {
                const content = fs.readFileSync(filePath);
                const iv = content.slice(0, 16);
                const encryptedContent = content.slice(16);
                
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                let decrypted = decipher.update(encryptedContent);
                decrypted = Buffer.concat([decrypted, decipher.final()]);
                
                fs.writeFileSync(outputPath, decrypted);
                return { success: true, outputPath };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    isDeviceDecrypted(deviceId) {
        return this.decryptedDevices.has(deviceId);
    }

    getDecryptionInfo(deviceId) {
        return this.decryptedDevices.get(deviceId) || null;
    }

    getEncryptedDevices(devices) {
        const encryptedDevices = [];
        
        for (const device of devices) {
            const mountPoints = device.mountPoint ? [device.mountPoint] : this.getDeviceMountPoints(device);
            for (const mountPoint of mountPoints) {
                const encryptionType = this.detectEncryptionType(device, mountPoint);
                if (encryptionType.isEncrypted) {
                    encryptedDevices.push({
                        ...device,
                        encryptionType: encryptionType.type,
                        encryptionDetails: encryptionType.details,
                        isDecrypted: this.isDeviceDecrypted(device.id)
                    });
                    break;
                }
            }
        }
        
        return encryptedDevices;
    }

    getDeviceMountPoints(device) {
        const mountPoints = [];
        if (this.platform === 'win32') {
            for (let i = 67; i <= 90; i++) {
                const drive = `${String.fromCharCode(i)}:\\`;
                if (fs.existsSync(drive)) {
                    mountPoints.push(drive);
                }
            }
        } else if (this.platform === 'darwin') {
            if (fs.existsSync('/Volumes')) {
                const volumes = fs.readdirSync('/Volumes');
                for (const vol of volumes) {
                    if (!vol.startsWith('.')) {
                        mountPoints.push(`/Volumes/${vol}`);
                    }
                }
            }
        }
        return mountPoints;
    }
}

module.exports = { EncryptedUSBDetector };
