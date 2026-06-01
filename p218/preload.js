const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  connect: (host, device) => ipcRenderer.invoke('connect', host, device),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  isConnected: () => ipcRenderer.invoke('isConnected'),
  sendCommand: (command) => ipcRenderer.invoke('sendCommand', command),
  query: (command) => ipcRenderer.invoke('query', command),
  discoverDevices: () => ipcRenderer.invoke('discoverDevices'),
  takeSnapshot: () => ipcRenderer.invoke('takeSnapshot'),
  saveSnapshot: (filePath) => ipcRenderer.invoke('saveSnapshot', filePath),
  loadSnapshot: (filePath) => ipcRenderer.invoke('loadSnapshot', filePath),
  restoreSnapshot: (snapshot) => ipcRenderer.invoke('restoreSnapshot', snapshot),
  listSnapshots: (directory) => ipcRenderer.invoke('listSnapshots', directory),
  generateSnapshotFilename: () => ipcRenderer.invoke('generateSnapshotFilename'),
  getSnapshotDirectory: () => ipcRenderer.invoke('getSnapshotDirectory'),
  showSaveDialog: (defaultFilename) => ipcRenderer.invoke('showSaveDialog', defaultFilename),
  showOpenDialog: () => ipcRenderer.invoke('showOpenDialog')
});
