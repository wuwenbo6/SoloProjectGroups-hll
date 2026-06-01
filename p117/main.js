const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { USBMonitor } = require('./src/backend/usbMonitor');
const { PolicyManager } = require('./src/backend/policy');
const { AuditLogger } = require('./src/backend/logger');
const { LogServer } = require('./src/backend/logServer');
const { EncryptedUSBDetector } = require('./src/backend/encryptedUSB');
const { RemoteEraser } = require('./src/backend/remoteEraser');
const { AuditReportGenerator } = require('./src/backend/auditReport');

const isDev = !app.isPackaged;
const dataDir = path.join(app.getPath('userData'), 'data');
const logDir = path.join(dataDir, 'logs');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

let mainWindow = null;
let usbMonitor = null;
let policyManager = null;
let auditLogger = null;
let logServer = null;
let encryptedDetector = null;
let remoteEraser = null;
let reportGenerator = null;

function checkAdminPrivileges() {
    if (process.platform === 'win32') {
        return new Promise((resolve) => {
            exec('net session', (error) => {
                resolve(!error);
            });
        });
    } else if (process.platform === 'darwin') {
        return new Promise((resolve) => {
            exec('id -u', (error, stdout) => {
                if (!error && parseInt(stdout.trim()) === 0) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        });
    } else {
        return Promise.resolve(process.getuid && process.getuid() === 0);
    }
}

function showAdminWarning() {
    dialog.showMessageBoxSync({
        type: 'warning',
        title: '管理员权限要求',
        message: '需要管理员/root权限',
        detail: 'USB Guardian 需要管理员权限才能监控USB设备和执行设备策略。请以管理员身份重新运行本程序。',
        buttons: ['确定']
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        backgroundColor: '#1e1e2e',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        },
        title: 'USB Guardian - 设备监控系统'
    });

    mainWindow.setMenuBarVisibility(false);

    mainWindow.loadFile(path.join(__dirname, 'src', 'render', 'index.html'));

    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function sendAlert(type, title, message) {
    if (mainWindow) {
        mainWindow.webContents.send('usb-alert', {
            type,
            title,
            message,
            timestamp: new Date().toISOString()
        });
    }

    if (Notification.isSupported()) {
        const notification = new Notification({
            title: title,
            body: message,
            silent: false
        });
        notification.show();
    }
}

function initializeServices() {
    auditLogger = new AuditLogger(logDir);
    policyManager = new PolicyManager(dataDir);
    usbMonitor = new USBMonitor(policyManager, auditLogger);
    logServer = new LogServer(auditLogger, dataDir);
    encryptedDetector = new EncryptedUSBDetector(policyManager, auditLogger);
    remoteEraser = new RemoteEraser(policyManager, auditLogger);
    reportGenerator = new AuditReportGenerator(auditLogger, policyManager);

    usbMonitor.on('device-inserted', (device) => {
        auditLogger.log('device_inserted', {
            deviceId: device.id,
            vendorId: device.vendorId,
            productId: device.productId,
            deviceName: device.deviceName,
            serialNumber: device.serialNumber,
            timestamp: new Date().toISOString()
        });

        const policy = policyManager.getDevicePolicy(device.id, device.vendorId);
        const mountPoint = device.mountPoint || encryptedDetector.getDeviceMountPoints(device)[0];
        if (mountPoint) {
            const encryptionInfo = encryptedDetector.detectEncryptionType(device, mountPoint);
            device.isEncrypted = encryptionInfo.isEncrypted;
            device.encryptionType = encryptionInfo.type;
            device.encryptionDetails = encryptionInfo.details;
        }

        if (mainWindow) {
            mainWindow.webContents.send('device-inserted', {
                device,
                policy
            });
        }
    });

    usbMonitor.on('device-removed', (device) => {
        auditLogger.log('device_removed', {
            deviceId: device.id,
            deviceName: device.deviceName,
            timestamp: new Date().toISOString()
        });

        if (mainWindow) {
            mainWindow.webContents.send('device-removed', { device });
        }
    });

    usbMonitor.on('device-blocked', (device, reason) => {
        auditLogger.log('device_blocked', {
            deviceId: device.id,
            deviceName: device.deviceName,
            reason: reason,
            timestamp: new Date().toISOString()
        });

        sendAlert('blocked', '设备已被阻止', `USB设备 "${device.deviceName}" 已根据策略被阻止访问。`);
    });

    usbMonitor.on('device-allowed', (device) => {
        auditLogger.log('device_allowed', {
            deviceId: device.id,
            deviceName: device.deviceName,
            timestamp: new Date().toISOString()
        });

        if (mainWindow) {
            mainWindow.webContents.send('device-allowed', { device });
        }
    });

    usbMonitor.on('file-operation', (operation) => {
        auditLogger.log('file_operation', {
            ...operation,
            timestamp: new Date().toISOString()
        });

        if (mainWindow) {
            mainWindow.webContents.send('file-operation', operation);
        }
    });

    usbMonitor.on('policies-reevaluated', (data) => {
        if (mainWindow) {
            mainWindow.webContents.send('policies-reevaluated', data);
        }
    });

    remoteEraser.on('erase-started', (data) => {
        if (mainWindow) {
            mainWindow.webContents.send('erase-started', data);
        }
    });

    remoteEraser.on('erase-progress', (data) => {
        if (mainWindow) {
            mainWindow.webContents.send('erase-progress', data);
        }
    });

    remoteEraser.on('erase-completed', (data) => {
        if (mainWindow) {
            mainWindow.webContents.send('erase-completed', data);
        }
        sendAlert('success', '擦除完成', `设备 "${data.device?.deviceName || '未知'}" 已成功擦除`);
    });

    remoteEraser.on('erase-error', (data) => {
        if (mainWindow) {
            mainWindow.webContents.send('erase-error', data);
        }
        sendAlert('danger', '擦除失败', `设备擦除失败: ${data.error || '未知错误'}`);
    });

    remoteEraser.on('erase-cancelled', (data) => {
        if (mainWindow) {
            mainWindow.webContents.send('erase-cancelled', data);
        }
    });

    encryptedDetector.on('device-decrypted', (data) => {
        if (mainWindow) {
            mainWindow.webContents.send('device-decrypted', data);
        }
        sendAlert('success', '解密成功', `设备 "${data.device?.deviceName || '未知'}" 已成功解密`);
    });

    usbMonitor.startMonitoring();
    logServer.start(3000);

    auditLogger.log('system_started', {
        timestamp: new Date().toISOString(),
        platform: process.platform,
        hostname: os.hostname()
    });
}

function registerIpcHandlers() {
    ipcMain.handle('get-devices', () => {
        return usbMonitor.getConnectedDevices();
    });

    ipcMain.handle('get-logs', (event, { limit, offset, type }) => {
        return auditLogger.getLogs(limit, offset, type);
    });

    ipcMain.handle('clear-logs', () => {
        return auditLogger.clearLogs();
    });

    ipcMain.handle('get-policies', () => {
        return policyManager.getPolicies();
    });

    ipcMain.handle('update-policies', (event, policies) => {
        return policyManager.updatePolicies(policies);
    });

    ipcMain.handle('add-whitelist', (event, item) => {
        return policyManager.addToWhitelist(item);
    });

    ipcMain.handle('add-blacklist', (event, item) => {
        return policyManager.addToBlacklist(item);
    });

    ipcMain.handle('remove-whitelist', (event, itemId) => {
        return policyManager.removeFromWhitelist(itemId);
    });

    ipcMain.handle('remove-blacklist', (event, itemId) => {
        return policyManager.removeFromBlacklist(itemId);
    });

    ipcMain.handle('block-device', (event, deviceId) => {
        return usbMonitor.blockDevice(deviceId);
    });

    ipcMain.handle('allow-device', (event, deviceId) => {
        return usbMonitor.allowDevice(deviceId);
    });

    ipcMain.handle('get-settings', () => {
        return policyManager.getSettings();
    });

    ipcMain.handle('update-settings', (event, settings) => {
        return policyManager.updateSettings(settings);
    });

    ipcMain.handle('export-logs', (event, { format, dateRange }) => {
        return auditLogger.exportLogs(format, dateRange);
    });

    ipcMain.handle('detect-encryption', (event, device) => {
        const mountPoint = device.mountPoint || encryptedDetector.getDeviceMountPoints(device)[0];
        return encryptedDetector.detectEncryptionType(device, mountPoint);
    });

    ipcMain.handle('decrypt-device', (event, { device, password, options }) => {
        return encryptedDetector.decryptDevice(device, password, options);
    });

    ipcMain.handle('get-encrypted-devices', () => {
        const devices = usbMonitor.getConnectedDevices();
        return encryptedDetector.getEncryptedDevices(devices);
    });

    ipcMain.handle('get-erase-methods', () => {
        return remoteEraser.getEraseMethods();
    });

    ipcMain.handle('erase-device', (event, { device, options }) => {
        return remoteEraser.eraseDevice(device, options);
    });

    ipcMain.handle('cancel-erase', (event, taskId) => {
        return remoteEraser.cancelErase(taskId);
    });

    ipcMain.handle('get-erase-tasks', () => {
        return remoteEraser.getAllEraseTasks();
    });

    ipcMain.handle('get-report-types', () => {
        return reportGenerator.getReportTypes();
    });

    ipcMain.handle('get-export-formats', () => {
        return reportGenerator.getExportFormats();
    });

    ipcMain.handle('generate-report', (event, { type, options }) => {
        return reportGenerator.generateReport(type, options);
    });

    ipcMain.handle('export-report', (event, { report, format }) => {
        return reportGenerator.exportReport(report, format);
    });
}

app.whenReady().then(async () => {
    const isAdmin = await checkAdminPrivileges();
    
    if (!isAdmin) {
        showAdminWarning();
        app.quit();
        return;
    }

    createWindow();
    initializeServices();
    registerIpcHandlers();

    if (mainWindow) {
        mainWindow.webContents.on('did-finish-load', () => {
            const devices = usbMonitor.getConnectedDevices();
            mainWindow.webContents.send('initial-devices', devices);
        });
    }
});

app.on('window-all-closed', () => {
    if (usbMonitor) {
        usbMonitor.stopMonitoring();
    }
    if (logServer) {
        logServer.stop();
    }

    auditLogger.log('system_stopped', {
        timestamp: new Date().toISOString()
    });

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
