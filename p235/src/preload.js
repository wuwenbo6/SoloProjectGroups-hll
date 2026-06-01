const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  connectDevice: () => ipcRenderer.invoke('connect-device'),
  disconnectDevice: () => ipcRenderer.invoke('disconnect-device'),
  parseHex: (filePath) => ipcRenderer.invoke('parse-hex', filePath),
  setTargetDevice: (device) => ipcRenderer.invoke('set-target-device', device),
  eraseDevice: () => ipcRenderer.invoke('erase-device'),
  programDevice: (hexData) => ipcRenderer.invoke('program-device', hexData),
  verifyDevice: (hexData) => ipcRenderer.invoke('verify-device', hexData),
  readDevice: () => ipcRenderer.invoke('read-device'),
  getDeviceList: () => ipcRenderer.invoke('get-device-list'),
  readChipID: () => ipcRenderer.invoke('read-chip-id'),
  verifyChipID: (expectedID) => ipcRenderer.invoke('verify-chip-id', expectedID),
  getOfflineStatus: () => ipcRenderer.invoke('get-offline-status'),
  offlineWrite: (hexData) => ipcRenderer.invoke('offline-write', hexData),
  offlineRead: () => ipcRenderer.invoke('offline-read'),
  offlineStart: () => ipcRenderer.invoke('offline-start'),
  offlineErase: () => ipcRenderer.invoke('offline-erase'),
  offlineVerify: () => ipcRenderer.invoke('offline-verify'),
  onProgramProgress: (callback) => {
    ipcRenderer.on('program-progress', (event, data) => callback(data));
  },
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('program-progress');
  }
});
