const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  connectDevice: () => ipcRenderer.invoke('connect-device'),
  disconnectDevice: () => ipcRenderer.invoke('disconnect-device'),
  setPPS: (voltage, current) => ipcRenderer.invoke('set-pps', voltage, current),
  getStatus: () => ipcRenderer.invoke('get-status'),
  startMonitoring: () => ipcRenderer.invoke('start-monitoring'),
  stopMonitoring: () => ipcRenderer.invoke('stop-monitoring'),
  executeCurve: (curvePoints) => ipcRenderer.invoke('execute-curve', curvePoints),
  stopCurve: () => ipcRenderer.invoke('stop-curve'),
  getPPSCapabilities: () => ipcRenderer.invoke('get-pps-capabilities'),
  runLoadTransientTest: (config) => ipcRenderer.invoke('run-load-transient-test', config),
  runRippleTest: (config) => ipcRenderer.invoke('run-ripple-test', config),
  generateReport: (type, testData, statistics) => ipcRenderer.invoke('generate-report', type, testData, statistics),
  saveReport: (report) => ipcRenderer.invoke('save-report', report),
  onMonitoringData: (callback) => {
    ipcRenderer.on('monitoring-data', (event, data) => callback(data));
  },
  onCurveProgress: (callback) => {
    ipcRenderer.on('curve-progress', (event, data) => callback(data));
  },
  onLoadTestProgress: (callback) => {
    ipcRenderer.on('load-test-progress', (event, progress) => callback(progress));
  },
  onRippleSample: (callback) => {
    ipcRenderer.on('ripple-sample', (event, sample) => callback(sample));
  }
});