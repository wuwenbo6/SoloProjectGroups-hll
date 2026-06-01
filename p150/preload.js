const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startMonitoring: () => ipcRenderer.invoke('start-monitoring'),
  stopMonitoring: () => ipcRenderer.invoke('stop-monitoring'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  onSecurityEvent: (callback) => {
    ipcRenderer.on('security-event', (event, data) => callback(data));
  },
  onAdminStatus: (callback) => {
    ipcRenderer.on('admin-status', (event, data) => callback(data));
  },
  removeSecurityEventListener: () => {
    ipcRenderer.removeAllListeners('security-event');
  }
});
