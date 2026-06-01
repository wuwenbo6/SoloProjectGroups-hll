const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('canAPI', {
  detectDevices: () => ipcRenderer.invoke('can-detect-devices'),
  getDevices: () => ipcRenderer.invoke('can-get-devices'),
  connect: (deviceId) => ipcRenderer.invoke('can-connect', deviceId),
  disconnect: () => ipcRenderer.invoke('can-disconnect'),
  sendMessage: (id, data) => ipcRenderer.invoke('can-send', id, data),
  onMessage: (callback) => ipcRenderer.on('can-message', (_, msg) => callback(msg)),
  removeMessageListener: () => ipcRenderer.removeAllListeners('can-message')
});

contextBridge.exposeInMainWorld('sdoAPI', {
  read: (nodeId, index, subIndex) => ipcRenderer.invoke('sdo-read', nodeId, index, subIndex),
  write: (nodeId, index, subIndex, data) => ipcRenderer.invoke('sdo-write', nodeId, index, subIndex, data),
  batchRead: (nodeId, entries) => ipcRenderer.invoke('sdo-batch-read', nodeId, entries),
  batchWrite: (nodeId, entries) => ipcRenderer.invoke('sdo-batch-write', nodeId, entries),
  onProgress: (callback) => ipcRenderer.on('sdo-progress', (_, progress) => callback(progress)),
  removeProgressListener: () => ipcRenderer.removeAllListeners('sdo-progress'),
  onBatchProgress: (callback) => ipcRenderer.on('batch-progress', (_, progress) => callback(progress)),
  removeBatchProgressListener: () => ipcRenderer.removeAllListeners('batch-progress')
});

contextBridge.exposeInMainWorld('csvAPI', {
  exportReadResults: (results) => ipcRenderer.invoke('export-csv', results),
  exportWriteResults: (results) => ipcRenderer.invoke('export-csv-write', results),
  importCSV: () => ipcRenderer.invoke('import-csv')
});
