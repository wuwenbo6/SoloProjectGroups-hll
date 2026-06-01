const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  hid: {
    requestDevice: (filters) => navigator.hid.requestDevice(filters),
    getDevices: () => navigator.hid.getDevices(),
    addEventListener: (type, listener) => navigator.hid.addEventListener(type, listener),
    removeEventListener: (type, listener) => navigator.hid.removeEventListener(type, listener)
  }
});
