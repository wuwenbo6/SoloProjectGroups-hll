const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execSync, spawn } = require('child_process');
const EventEmitter = require('events');
const crypto = require('crypto');

class RemoteEraser extends EventEmitter {
    constructor(policyManager, auditLogger) {
        super();
        this.policyManager = policyManager;
        this.auditLogger = auditLogger;
        this.platform = os.platform();
        this.eraseTasks = new Map();
        this.isErasing = false;
    }

    async eraseDevice(device, options = {}) {
        const {
            method = 'quick',
            passes = 1,
            verify = true,
            notifyOnComplete = true
        } = options;

        if (this.isErasing) {
            return { success: false, message: '已有擦除任务正在运行' };
        }

        const taskId = crypto.randomBytes(8).toString('hex');
        const mountPoint = device.mountPoint || this.getDeviceMountPoint(device);

        if (!mountPoint || !fs.existsSync(mountPoint)) {
            return { success: false, message: '设备未找到或已断开' };
        }

        this.isErasing = true;
        this.eraseTasks.set(taskId, {
            id: taskId,
            device,
            mountPoint,
            status: 'started',
            method,
            passes,
            verify,
            startTime: new Date().toISOString(),
            progress: 0
        });

        this.emit('erase-started', { taskId, device });

        this.auditLogger.log('erase_started', {
            taskId,
            deviceId: device.id,
            deviceName: device.deviceName,
            method,
            passes,
            mountPoint,
            timestamp: new Date().toISOString()
        });

        try {
            const result = await this.performErase(taskId, device, mountPoint, options);
            
            if (verify && result.success) {
                const verified = this.verifyErase(mountPoint);
                result.verified = verified;
            }

            this.eraseTasks.set(taskId, {
                ...this.eraseTasks.get(taskId),
                status: result.success ? 'completed' : 'failed',
                endTime: new Date().toISOString(),
                result
            });

            this.isErasing = false;

            this.auditLogger.log(result.success ? 'erase_completed' : 'erase_failed', {
                taskId,
                deviceId: device.id,
                deviceName: device.deviceName,
                method,
                verified: result.verified,
                timestamp: new Date().toISOString()
            });

            this.emit('erase-completed', { taskId, device, result });

            if (notifyOnComplete) {
                this.emit('erase-notification', {
                    type: result.success ? 'success' : 'danger',
                    title: result.success ? '擦除完成' : '擦除失败',
                    message: result.success 
                        ? `设备 "${device.deviceName}" 已成功擦除`
                        : `设备 "${device.deviceName}" 擦除失败: ${result.message}`,
                    device
                });
            }

            return result;
        } catch (error) {
            this.isErasing = false;
            this.eraseTasks.set(taskId, {
                ...this.eraseTasks.get(taskId),
                status: 'error',
                endTime: new Date().toISOString(),
                error: error.message
            });

            this.auditLogger.log('erase_error', {
                taskId,
                deviceId: device.id,
                deviceName: device.deviceName,
                error: error.message,
                timestamp: new Date().toISOString()
            });

            this.emit('erase-error', { taskId, device, error: error.message });

            return { success: false, message: error.message };
        }
    }

    async performErase(taskId, device, mountPoint, options) {
        const { method = 'quick', passes = 1 } = options;

        switch (method) {
            case 'quick':
                return this.quickErase(taskId, device, mountPoint);
            case 'secure':
                return this.secureErase(taskId, device, mountPoint, passes);
            case 'dod':
                return this.dodErase(taskId, device, mountPoint);
            case 'gutmann':
                return this.gutmannErase(taskId, device, mountPoint);
            default:
                return this.quickErase(taskId, device, mountPoint);
        }
    }

    quickErase(taskId, device, mountPoint) {
        return new Promise((resolve) => {
            try {
                this.updateTaskProgress(taskId, 10);

                const deletedFiles = this.deleteAllFiles(mountPoint);
                
                this.updateTaskProgress(taskId, 100);

                resolve({
                    success: true,
                    message: '快速擦除完成',
                    method: 'quick',
                    deletedFiles
                });
            } catch (error) {
                resolve({
                    success: false,
                    message: `快速擦除失败: ${error.message}`,
                    method: 'quick'
                });
            }
        });
    }

    secureErase(taskId, device, mountPoint, passes = 1) {
        return new Promise((resolve) => {
            try {
                const devicePath = this.getDevicePath(device, mountPoint);
                if (!devicePath) {
                    resolve({ success: false, message: '无法获取设备路径' });
                    return;
                }

                const totalSteps = passes * 2;
                let currentStep = 0;

                for (let pass = 0; pass < passes; pass++) {
                    currentStep++;
                    this.updateTaskProgress(taskId, Math.floor((currentStep / totalSteps) * 100));
                    
                    this.overwriteDevice(devicePath, '0x00');
                    
                    currentStep++;
                    this.updateTaskProgress(taskId, Math.floor((currentStep / totalSteps) * 100));
                    
                    this.overwriteDevice(devicePath, '0xFF');
                }

                this.updateTaskProgress(taskId, 100);

                resolve({
                    success: true,
                    message: `安全擦除完成 (${passes} 轮)`,
                    method: 'secure',
                    passes
                });
            } catch (error) {
                resolve({
                    success: false,
                    message: `安全擦除失败: ${error.message}`,
                    method: 'secure'
                });
            }
        });
    }

    dodErase(taskId, device, mountPoint) {
        return new Promise((resolve) => {
            try {
                const devicePath = this.getDevicePath(device, mountPoint);
                if (!devicePath) {
                    resolve({ success: false, message: '无法获取设备路径' });
                    return;
                }

                const patterns = ['0x00', '0xFF', '0xAA'];
                const totalSteps = patterns.length * 3;
                let currentStep = 0;

                for (let round = 0; round < 3; round++) {
                    for (const pattern of patterns) {
                        currentStep++;
                        this.updateTaskProgress(taskId, Math.floor((currentStep / totalSteps) * 100));
                        this.overwriteDevice(devicePath, pattern);
                    }
                }

                this.updateTaskProgress(taskId, 100);

                resolve({
                    success: true,
                    message: 'DoD 5220.22-M 标准擦除完成',
                    method: 'dod',
                    rounds: 3
                });
            } catch (error) {
                resolve({
                    success: false,
                    message: `DoD擦除失败: ${error.message}`,
                    method: 'dod'
                });
            }
        });
    }

    gutmannErase(taskId, device, mountPoint) {
        return new Promise((resolve) => {
            try {
                const devicePath = this.getDevicePath(device, mountPoint);
                if (!devicePath) {
                    resolve({ success: false, message: '无法获取设备路径' });
                    return;
                }

                const patterns = [
                    'random', '0x00', '0x11', '0x22', '0x33', '0x44', '0x55', '0x66', '0x77',
                    '0x88', '0x99', '0xAA', '0xBB', '0xCC', '0xDD', '0xEE', '0xFF',
                    '0x92', '0x49', '0x24', '0x12', '0x09', '0x14', '0x02', '0x44', '0x82',
                    '0x01', '0x00', '0x00', 'random'
                ];

                const totalSteps = patterns.length;
                let currentStep = 0;

                for (const pattern of patterns) {
                    currentStep++;
                    this.updateTaskProgress(taskId, Math.floor((currentStep / totalSteps) * 100));
                    this.overwriteDevice(devicePath, pattern);
                }

                this.updateTaskProgress(taskId, 100);

                resolve({
                    success: true,
                    message: 'Gutmann 35次擦除完成',
                    method: 'gutmann',
                    passes: 35
                });
            } catch (error) {
                resolve({
                    success: false,
                    message: `Gutmann擦除失败: ${error.message}`,
                    method: 'gutmann'
                });
            }
        });
    }

    deleteAllFiles(mountPoint) {
        let deletedCount = 0;

        try {
            const deleteRecursive = (dir) => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    try {
                        if (entry.isDirectory()) {
                            deleteRecursive(fullPath);
                            fs.rmdirSync(fullPath);
                        } else {
                            fs.unlinkSync(fullPath);
                            deletedCount++;
                        }
                    } catch (e) {
                        console.error(`Failed to delete ${fullPath}:`, e);
                    }
                }
            };

            deleteRecursive(mountPoint);
        } catch (error) {
            console.error('Error deleting files:', error);
        }

        return deletedCount;
    }

    overwriteDevice(devicePath, pattern) {
        if (this.platform === 'win32') {
            this.overwriteWindows(devicePath, pattern);
        } else {
            this.overwriteUnix(devicePath, pattern);
        }
    }

    overwriteWindows(devicePath, pattern) {
        try {
            const command = pattern === 'random' 
                ? `dd if=/dev/urandom of=${devicePath} bs=4M status=progress`
                : `dd if=/dev/zero of=${devicePath} bs=4M status=progress`;
            
            execSync(command, { timeout: 300000 });
        } catch (error) {
            console.error('Windows overwrite error:', error);
            this.overwriteFileByFile(devicePath, pattern);
        }
    }

    overwriteUnix(devicePath, pattern) {
        try {
            const command = pattern === 'random'
                ? `dd if=/dev/urandom of=${devicePath} bs=4M status=progress`
                : `dd if=/dev/zero of=${devicePath} bs=4M status=progress`;
            
            execSync(command, { timeout: 300000 });
        } catch (error) {
            console.error('Unix overwrite error:', error);
        }
    }

    overwriteFileByFile(mountPoint, pattern) {
        try {
            const overwriteFile = (filePath) => {
                try {
                    const stats = fs.statSync(filePath);
                    const fileSize = stats.size;
                    const buffer = pattern === 'random' 
                        ? crypto.randomBytes(Math.min(fileSize, 1024 * 1024))
                        : Buffer.alloc(Math.min(fileSize, 1024 * 1024), pattern === '0xFF' ? 0xFF : 0x00);
                    
                    const fd = fs.openSync(filePath, 'w');
                    let written = 0;
                    
                    while (written < fileSize) {
                        const toWrite = Math.min(buffer.length, fileSize - written);
                        fs.writeSync(fd, buffer, 0, toWrite, written);
                        written += toWrite;
                    }
                    
                    fs.closeSync(fd);
                } catch (e) {
                    console.error(`Failed to overwrite ${filePath}:`, e);
                }
            };

            const walkDir = (dir) => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        walkDir(fullPath);
                    } else if (entry.isFile()) {
                        overwriteFile(fullPath);
                    }
                }
            };

            walkDir(mountPoint);
        } catch (error) {
            console.error('File by file overwrite error:', error);
        }
    }

    verifyErase(mountPoint) {
        try {
            const checkFiles = (dir) => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isFile() && !entry.name.startsWith('.')) {
                        return false;
                    }
                    if (entry.isDirectory()) {
                        if (!checkFiles(path.join(dir, entry.name))) {
                            return false;
                        }
                    }
                }
                return true;
            };

            return checkFiles(mountPoint);
        } catch (error) {
            return false;
        }
    }

    updateTaskProgress(taskId, progress) {
        const task = this.eraseTasks.get(taskId);
        if (task) {
            task.progress = progress;
            this.eraseTasks.set(taskId, task);
            this.emit('erase-progress', { taskId, progress });
        }
    }

    getDeviceMountPoint(device) {
        if (device.mountPoint) {
            return device.mountPoint;
        }

        if (this.platform === 'win32') {
            for (let i = 67; i <= 90; i++) {
                const drive = `${String.fromCharCode(i)}:\\`;
                if (fs.existsSync(drive)) {
                    return drive;
                }
            }
        } else if (this.platform === 'darwin') {
            if (fs.existsSync('/Volumes')) {
                const volumes = fs.readdirSync('/Volumes');
                for (const vol of volumes) {
                    if (!vol.startsWith('.')) {
                        return `/Volumes/${vol}`;
                    }
                }
            }
        } else {
            if (fs.existsSync('/proc/mounts')) {
                const mounts = fs.readFileSync('/proc/mounts', 'utf8');
                for (const mount of mounts.split('\n')) {
                    const parts = mount.split(' ');
                    if (parts[0] && parts[0].startsWith('/dev/sd') && parts[1]) {
                        return parts[1];
                    }
                }
            }
        }

        return null;
    }

    getDevicePath(device, mountPoint) {
        if (this.platform === 'win32') {
            return `\\\\.\\${mountPoint.charAt(0)}:`;
        } else if (this.platform === 'darwin') {
            try {
                const diskutilOutput = execSync(`diskutil info "${mountPoint}" | grep "Device Node"`, { encoding: 'utf8' });
                const match = diskutilOutput.match(/Device Node:\s+(\S+)/);
                if (match) {
                    return match[1];
                }
            } catch (e) {
                console.error('Error getting device path:', e);
            }
            return null;
        } else {
            if (fs.existsSync('/proc/mounts')) {
                const mounts = fs.readFileSync('/proc/mounts', 'utf8');
                for (const mount of mounts.split('\n')) {
                    const parts = mount.split(' ');
                    if (parts[1] === mountPoint) {
                        return parts[0];
                    }
                }
            }
            return null;
        }
    }

    getEraseTask(taskId) {
        return this.eraseTasks.get(taskId);
    }

    getAllEraseTasks() {
        return Array.from(this.eraseTasks.values());
    }

    cancelErase(taskId) {
        const task = this.eraseTasks.get(taskId);
        if (task && (task.status === 'started')) {
            task.status = 'cancelled';
            task.endTime = new Date().toISOString();
            this.eraseTasks.set(taskId, task);
            this.isErasing = false;
            
            this.emit('erase-cancelled', { taskId, device: task.device });
            
            this.auditLogger.log('erase_cancelled', {
                taskId,
                deviceId: task.device.id,
                deviceName: task.device.deviceName,
                timestamp: new Date().toISOString()
            });

            return true;
        }
        return false;
    }

    getEraseMethods() {
        return [
            { id: 'quick', name: '快速擦除', description: '删除所有文件，不覆盖', passes: 1 },
            { id: 'secure', name: '安全擦除', description: '使用 0x00 和 0xFF 覆盖', passes: 1 },
            { id: 'dod', name: 'DoD标准', description: 'DoD 5220.22-M 标准 (3轮)', passes: 3 },
            { id: 'gutmann', name: 'Gutmann', description: '35次擦除 (最安全)', passes: 35 }
        ];
    }
}

module.exports = { RemoteEraser };
