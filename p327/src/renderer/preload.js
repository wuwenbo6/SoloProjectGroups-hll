const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bleAPI', {
  startScan: (useSimulation) => ipcRenderer.invoke('start-scan', useSimulation),
  stopScan: () => ipcRenderer.invoke('stop-scan'),
  clearDevices: () => ipcRenderer.invoke('clear-devices'),
  exportTimeSeries: () => ipcRenderer.invoke('export-time-series'),
  onBeaconsUpdate: (callback) => {
    ipcRenderer.on('beacons-update', (_event, beacons) => callback(beacons));
  }
});
