const EventEmitter = require('events');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

class USBMonitor extends EventEmitter {
    constructor(policyManager, auditLogger) {
        super();
        this.policyManager = policyManager;
        this.auditLogger = auditLogger;
        this.connectedDevices = new Map();
        this.deviceStates = new Map();
        this.isMonitoring = false;
        this.platform = os.platform();
        this.watcher = null;
        this.fileWatchers = new Map();
        this.pendingOperations = new Map();
        this.debounceTimers = new Map();

        this.policyManager.on('policies-updated', () => {
            this.reevaluateAllDevices();
        });
    }

    async getUSBDevices() {
        const devices = [];

        try {
            if (this.platform === 'win32') {
                const result = execSync(
                    'powershell -Command "Get-PnpDevice -Class USB | Where-Object {$_.Status -eq \'OK\'} | Select-Object InstanceId, FriendlyName, Status | ConvertTo-Json -Depth 3"',
                    { encoding: 'utf8', timeout: 10000 }
                );
                if (result.trim()) {
                    const deviceList = JSON.parse(result);
                    const deviceArray = Array.isArray(deviceList) ? deviceList : [deviceList];
                    for (const dev of deviceArray) {
                        devices.push(this.parseWindowsDevice(dev));
                    }
                }
            } else if (this.platform === 'darwin') {
                const result = execSync(
                    'system_profiler SPUSBDataType -json',
                    { encoding: 'utf8', timeout: 10000 }
                );
                const data = JSON.parse(result);
                this.parseMacDevices(data.SPUSBDataType, devices);
            } else {
                const result = execSync('lsusb -v 2>/dev/null || lsusb', { encoding: 'utf8', timeout: 10000 });
                const lines = result.split('\n');
                let currentDevice = null;
                for (const line of lines) {
                    const match = line.match(/Bus (\d+) Device (\d+): ID (\w+):(\w+) (.+)/);
                    if (match) {
                        if (currentDevice) {
                            devices.push(currentDevice);
                        }
                        currentDevice = {
                            id: `${match[3]}:${match[4]}`,
                            vendorId: match[3],
                            productId: match[4],
                            deviceName: match[5],
                            serialNumber: '',
                            manufacturer: '',
                            deviceType: 'USB',
                            mountPoint: ''
                        };
                    } else if (currentDevice && line.includes('iSerial')) {
                        const serialMatch = line.match(/iSerial\s+\d+\s+(.+)/);
                        if (serialMatch) {
                            currentDevice.serialNumber = serialMatch[1].trim();
                        }
                    }
                }
                if (currentDevice) {
                    devices.push(currentDevice);
                }

                if (fs.existsSync('/proc/mounts')) {
                    const mounts = fs.readFileSync('/proc/mounts', 'utf8');
                    for (const mount of mounts.split('\n')) {
                        const parts = mount.split(' ');
                        if (parts[0] && parts[0].startsWith('/dev/sd') && parts[1]) {
                            const dev = devices.find(d => d.mountPoint === '');
                            if (dev) {
                                dev.mountPoint = parts[1];
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to enumerate USB devices:', error);
        }

        return devices;
    }

    parseWindowsDevice(pnpDevice) {
        const instanceId = pnpDevice.InstanceId || '';
        const idMatch = instanceId.match(/VID_([0-9A-Fa-f]+)&PID_([0-9A-Fa-f]+)/);
        let vendorId = '';
        let productId = '';
        if (idMatch) {
            vendorId = idMatch[1];
            productId = idMatch[2];
        }
        return {
            id: `${vendorId}:${productId}`,
            vendorId,
            productId,
            deviceName: pnpDevice.FriendlyName || 'Unknown USB Device',
            serialNumber: instanceId.split('\\').pop() || '',
            manufacturer: '',
            deviceType: 'USB',
            mountPoint: '',
            status: pnpDevice.Status
        };
    }

    parseMacDevices(usbData, devices) {
        for (const item of usbData || []) {
            if (item._items) {
                this.parseMacDevices(item._items, devices);
            }
            if (item.vendor_id && item.product_id) {
                devices.push({
                    id: `${item.vendor_id}:${item.product_id}`,
                    vendorId: item.vendor_id,
                    productId: item.product_id,
                    deviceName: item._name || item.product || 'Unknown USB Device',
                    serialNumber: item.serial_num || '',
                    manufacturer: item.vendor || '',
                    deviceType: item.device_speed || 'USB',
                    mountPoint: item.volume_name ? `/Volumes/${item.volume_name}` : ''
                });
            }
        }
    }

    getConnectedDevices() {
        return Array.from(this.connectedDevices.values()).map(device => ({
            ...device,
            policy: this.deviceStates.get(device.id)?.policy || null
        }));
    }

    reevaluateAllDevices() {
        for (const [deviceId, device] of this.connectedDevices) {
            const oldState = this.deviceStates.get(deviceId);
            const newPolicy = this.policyManager.getDevicePolicy(device.id, device.vendorId);

            if (!oldState || oldState.policy.action !== newPolicy.action) {
                this.deviceStates.set(deviceId, {
                    policy: newPolicy,
                    updatedAt: new Date().toISOString()
                });

                if (newPolicy.action === 'block') {
                    this.stopWatchingDevice(device);
                    this.blockDevice(deviceId);
                    this.emit('device-blocked', device, newPolicy.reason || '策略更新');
                    this.auditLogger.log('device_blocked', {
                        deviceId: device.id,
                        deviceName: device.deviceName,
                        reason: '策略更新后自动阻止',
                        timestamp: new Date().toISOString()
                    });
                } else {
                    if (!oldState || oldState.policy.action === 'block') {
                        this.startWatchingDevice(device);
                    }
                    this.emit('device-allowed', device);
                    this.auditLogger.log('device_allowed', {
                        deviceId: device.id,
                        deviceName: device.deviceName,
                        reason: '策略更新后自动允许',
                        timestamp: new Date().toISOString()
                    });
                }
            }
        }

        this.emit('policies-reevaluated', {
            devices: Array.from(this.connectedDevices.values()).map(d => ({
                ...d,
                policy: this.deviceStates.get(d.id)?.policy || null
            }))
        });
    }

    async checkDeviceChanges() {
        const currentDevices = await this.getUSBDevices();
        const currentDeviceIds = new Set(currentDevices.map(d => d.id));

        for (const [deviceId, device] of this.connectedDevices) {
            if (!currentDeviceIds.has(deviceId)) {
                this.connectedDevices.delete(deviceId);
                this.deviceStates.delete(deviceId);
                this.stopWatchingDevice(device);
                this.emit('device-removed', device);
            }
        }

        for (const device of currentDevices) {
            if (!this.connectedDevices.has(device.id)) {
                this.connectedDevices.set(device.id, device);
                this.emit('device-inserted', device);

                const policy = this.policyManager.getDevicePolicy(device.id, device.vendorId);
                this.deviceStates.set(device.id, {
                    policy,
                    updatedAt: new Date().toISOString()
                });

                if (policy.action === 'block') {
                    this.blockDevice(device.id);
                    this.emit('device-blocked', device, policy.reason || '黑名单策略');
                } else {
                    this.startWatchingDevice(device);
                    this.emit('device-allowed', device);
                }
            }
        }
    }

    startWatchingDevice(device) {
        const mountPoints = this.getDeviceMountPoints(device);
        for (const mountPoint of mountPoints) {
            if (fs.existsSync(mountPoint)) {
                const watcherKey = `${device.id}-${mountPoint}`;
                
                if (this.fileWatchers.has(watcherKey)) {
                    continue;
                }

                try {
                    const chokidar = require('chokidar');
                    const watcher = chokidar.watch(mountPoint, {
                        ignoreInitial: true,
                        persistent: true,
                        depth: 99,
                        followSymlinks: false,
                        usePolling: true,
                        interval: 500,
                        binaryInterval: 1000,
                        awaitWriteFinish: {
                            stabilityThreshold: 2000,
                            pollInterval: 500
                        },
                        atomic: true,
                        ignorePermissionErrors: true
                    });

                    const fileOperationMap = new Map();
                    const debounceDelay = 1000;

                    const emitFileOperation = (type, filePath, size) => {
                        const operationId = `${type}-${filePath}`;
                        const now = Date.now();

                        if (fileOperationMap.has(operationId)) {
                            const lastEmit = fileOperationMap.get(operationId);
                            if (now - lastEmit < debounceDelay) {
                                return;
                            }
                        }
                        fileOperationMap.set(operationId, now);

                        if (this.debounceTimers.has(operationId)) {
                            clearTimeout(this.debounceTimers.get(operationId));
                        }

                        this.debounceTimers.set(operationId, setTimeout(() => {
                            fileOperationMap.delete(operationId);
                            this.debounceTimers.delete(operationId);
                        }, 5000));

                        try {
                            const stat = fs.statSync(filePath);
                            const fileSize = size || stat.size;
                            
                            this.emit('file-operation', {
                                type: type,
                                deviceId: device.id,
                                deviceName: device.deviceName,
                                filePath: filePath,
                                fileSize: fileSize,
                                timestamp: new Date().toISOString(),
                                allowed: true
                            });
                        } catch (e) {
                            this.emit('file-operation', {
                                type: type,
                                deviceId: device.id,
                                deviceName: device.deviceName,
                                filePath: filePath,
                                timestamp: new Date().toISOString(),
                                allowed: true
                            });
                        }
                    };

                    watcher.on('add', (filePath) => {
                        emitFileOperation('write', filePath);
                    });

                    watcher.on('change', (filePath) => {
                        emitFileOperation('modify', filePath);
                    });

                    watcher.on('unlink', (filePath) => {
                        emitFileOperation('delete', filePath);
                    });

                    watcher.on('addDir', (dirPath) => {
                        emitFileOperation('mkdir', dirPath);
                    });

                    watcher.on('unlinkDir', (dirPath) => {
                        emitFileOperation('rmdir', dirPath);
                    });

                    watcher.on('error', (error) => {
                        console.error(`Watcher error for ${mountPoint}:`, error);
                    });

                    this.fileWatchers.set(watcherKey, watcher);
                } catch (error) {
                    console.error(`Failed to watch ${mountPoint}:`, error);
                }
            }
        }
    }

    stopWatchingDevice(device) {
        for (const [key, watcher] of this.fileWatchers) {
            if (key.startsWith(device.id)) {
                watcher.close();
                this.fileWatchers.delete(key);
            }
        }
    }

    getDeviceMountPoints(device) {
        const mountPoints = [];

        if (device.mountPoint) {
            mountPoints.push(device.mountPoint);
        }

        if (this.platform === 'win32') {
            try {
                const result = execSync('wmic logicaldisk get DeviceID, VolumeName', { encoding: 'utf8' });
                const lines = result.split('\n').filter(line => line.trim());
                for (let i = 1; i < lines.length; i++) {
                    const parts = lines[i].trim().split(/\s+/);
                    if (parts.length >= 2) {
                        mountPoints.push(`${parts[0]}\\`);
                    }
                }
            } catch (e) {
                for (let i = 67; i <= 90; i++) {
                    const drive = `${String.fromCharCode(i)}:\\`;
                    if (fs.existsSync(drive)) {
                        mountPoints.push(drive);
                    }
                }
            }
        } else if (this.platform === 'darwin') {
            if (fs.existsSync('/Volumes')) {
                const volumes = fs.readdirSync('/Volumes');
                for (const vol of volumes) {
                    if (vol !== 'Macintosh HD' && vol !== 'OS X' && !vol.startsWith('.')) {
                        mountPoints.push(`/Volumes/${vol}`);
                    }
                }
            }
        } else {
            if (fs.existsSync('/proc/mounts')) {
                const mounts = fs.readFileSync('/proc/mounts', 'utf8');
                for (const mount of mounts.split('\n')) {
                    const parts = mount.split(' ');
                    if (parts[0] && parts[0].startsWith('/dev/sd') && parts[1] && parts[1].startsWith('/media/')) {
                        mountPoints.push(parts[1]);
                    }
                }
            }
        }

        return mountPoints;
    }

    blockDevice(deviceId) {
        const device = this.connectedDevices.get(deviceId);
        if (!device) return false;

        this.stopWatchingDevice(device);

        if (this.platform === 'win32') {
            try {
                execSync(`devcon disable "${device.vendorId}&${device.productId}"`, { timeout: 5000 });
            } catch (error) {
                console.error('Failed to disable device:', error);
                return false;
            }
        } else if (this.platform === 'darwin') {
            try {
                execSync(`diskutil unmountDisk /dev/${device.id} 2>/dev/null || diskutil eject /dev/${device.id} 2>/dev/null || true`);
            } catch (error) {
                console.error('Failed to eject device:', error);
                return false;
            }
        } else {
            const mountPoints = this.getDeviceMountPoints(device);
            for (const mountPoint of mountPoints) {
                try {
                    execSync(`umount -l "${mountPoint}" 2>/dev/null || umount "${mountPoint}" 2>/dev/null || true`);
                } catch (error) {
                    console.error('Failed to unmount:', error);
                }
            }
        }

        return true;
    }

    allowDevice(deviceId) {
        const device = this.connectedDevices.get(deviceId);
        if (!device) return false;

        this.startWatchingDevice(device);
        return true;
    }

    startMonitoring() {
        if (this.isMonitoring) return;

        this.isMonitoring = true;

        this.checkDeviceChanges();

        this.monitoringInterval = setInterval(() => {
            this.checkDeviceChanges();
        }, 2000);

        console.log('USB monitoring started');
    }

    stopMonitoring() {
        this.isMonitoring = false;

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        for (const [key, timer] of this.debounceTimers) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        this.pendingOperations.clear();

        for (const [key, watcher] of this.fileWatchers) {
            watcher.close();
        }
        this.fileWatchers.clear();

        this.connectedDevices.clear();
        this.deviceStates.clear();
        console.log('USB monitoring stopped');
    }
}

module.exports = { USBMonitor };
