const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getDevices: () => ipcRenderer.invoke('get-devices'),
    getLogs: (limit, offset, type) => ipcRenderer.invoke('get-logs', { limit, offset, type }),
    clearLogs: () => ipcRenderer.invoke('clear-logs'),
    
    getPolicies: () => ipcRenderer.invoke('get-policies'),
    updatePolicies: (policies) => ipcRenderer.invoke('update-policies', policies),
    
    addWhitelist: (item) => ipcRenderer.invoke('add-whitelist', item),
    addBlacklist: (item) => ipcRenderer.invoke('add-blacklist', item),
    removeWhitelist: (itemId) => ipcRenderer.invoke('remove-whitelist', itemId),
    removeBlacklist: (itemId) => ipcRenderer.invoke('remove-blacklist', itemId),
    
    blockDevice: (deviceId) => ipcRenderer.invoke('block-device', deviceId),
    allowDevice: (deviceId) => ipcRenderer.invoke('allow-device', deviceId),
    
    getSettings: () => ipcRenderer.invoke('get-settings'),
    updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
    
    exportLogs: (format, dateRange) => ipcRenderer.invoke('export-logs', { format, dateRange }),

    detectEncryption: (device) => ipcRenderer.invoke('detect-encryption', device),
    decryptDevice: (device, password, options) => ipcRenderer.invoke('decrypt-device', { device, password, options }),
    getEncryptedDevices: () => ipcRenderer.invoke('get-encrypted-devices'),

    getEraseMethods: () => ipcRenderer.invoke('get-erase-methods'),
    eraseDevice: (device, options) => ipcRenderer.invoke('erase-device', { device, options }),
    cancelErase: (taskId) => ipcRenderer.invoke('cancel-erase', taskId),
    getEraseTasks: () => ipcRenderer.invoke('get-erase-tasks'),

    getReportTypes: () => ipcRenderer.invoke('get-report-types'),
    getExportFormats: () => ipcRenderer.invoke('get-export-formats'),
    generateReport: (type, options) => ipcRenderer.invoke('generate-report', { type, options }),
    exportReport: (report, format) => ipcRenderer.invoke('export-report', { report, format }),
    
    onDeviceInserted: (callback) => {
        ipcRenderer.on('device-inserted', (_event, data) => callback(data));
    },
    onDeviceRemoved: (callback) => {
        ipcRenderer.on('device-removed', (_event, data) => callback(data));
    },
    onDeviceBlocked: (callback) => {
        ipcRenderer.on('device-blocked', (_event, data) => callback(data));
    },
    onDeviceAllowed: (callback) => {
        ipcRenderer.on('device-allowed', (_event, data) => callback(data));
    },
    onFileOperation: (callback) => {
        ipcRenderer.on('file-operation', (_event, data) => callback(data));
    },
    onUsbAlert: (callback) => {
        ipcRenderer.on('usb-alert', (_event, data) => callback(data));
    },
    onInitialDevices: (callback) => {
        ipcRenderer.on('initial-devices', (_event, data) => callback(data));
    },
    onPoliciesReevaluated: (callback) => {
        ipcRenderer.on('policies-reevaluated', (_event, data) => callback(data));
    },
    onDeviceDecrypted: (callback) => {
        ipcRenderer.on('device-decrypted', (_event, data) => callback(data));
    },
    onEraseStarted: (callback) => {
        ipcRenderer.on('erase-started', (_event, data) => callback(data));
    },
    onEraseProgress: (callback) => {
        ipcRenderer.on('erase-progress', (_event, data) => callback(data));
    },
    onEraseCompleted: (callback) => {
        ipcRenderer.on('erase-completed', (_event, data) => callback(data));
    },
    onEraseError: (callback) => {
        ipcRenderer.on('erase-error', (_event, data) => callback(data));
    },
    onEraseCancelled: (callback) => {
        ipcRenderer.on('erase-cancelled', (_event, data) => callback(data));
    }
});
