const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('iolinkAPI', {
  connect: (portPath, baudRate) => ipcRenderer.invoke('connect', portPath, baudRate),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  listPorts: () => ipcRenderer.invoke('list-ports'),
  wakeupDevice: (portNumber, comSpeed) => ipcRenderer.invoke('wakeup-device', portNumber, comSpeed),
  startOperate: (portNumber) => ipcRenderer.invoke('start-operate', portNumber),
  stopOperate: (portNumber) => ipcRenderer.invoke('stop-operate', portNumber),
  readISDU: (portNumber, index, subindex) => ipcRenderer.invoke('read-isdu', portNumber, index, subindex),
  writeISDU: (portNumber, index, subindex, value) => ipcRenderer.invoke('write-isdu', portNumber, index, subindex, value),
  readPage: (portNumber, pageNumber) => ipcRenderer.invoke('read-page', portNumber, pageNumber),
  getDeviceList: () => ipcRenderer.invoke('get-device-list'),
  getDeviceInfo: (portNumber) => ipcRenderer.invoke('get-device-info', portNumber),
  getProcessData: (portNumber) => ipcRenderer.invoke('get-process-data', portNumber),
  getISDUList: (portNumber) => ipcRenderer.invoke('get-isdu-list', portNumber),
  getEvents: (portNumber) => ipcRenderer.invoke('get-events', portNumber),
  getMSeqStats: () => ipcRenderer.invoke('get-mseq-stats'),
  getMSeqHistory: (count) => ipcRenderer.invoke('get-mseq-history', count),
  getMSeqActive: (portNumber) => ipcRenderer.invoke('get-mseq-active', portNumber),
  getDeviceMSeqStats: (portNumber) => ipcRenderer.invoke('get-device-mseq-stats', portNumber),
  getDeviceMSeqHistory: (portNumber, count) => ipcRenderer.invoke('get-device-mseq-history', portNumber, count),
  getCycleCount: () => ipcRenderer.invoke('get-cycle-count'),
  getAlarms: (portNumber, activeOnly) => ipcRenderer.invoke('get-alarms', portNumber, activeOnly),
  getAlarmSummary: (portNumber) => ipcRenderer.invoke('get-alarm-summary', portNumber),
  acknowledgeAlarm: (portNumber, alarmIndex) => ipcRenderer.invoke('acknowledge-alarm', portNumber, alarmIndex),
  acknowledgeAllAlarms: (portNumber) => ipcRenderer.invoke('acknowledge-all-alarms', portNumber),
  exportISDU: (portNumber, format) => ipcRenderer.invoke('export-isdu', portNumber, format),

  onDeviceUpdate: (callback) => {
    ipcRenderer.on('device-update', (_event, data) => callback(data));
  },
  onDeviceEvent: (callback) => {
    ipcRenderer.on('device-event', (_event, data) => callback(data));
  },
  onStateChange: (callback) => {
    ipcRenderer.on('state-change', (_event, data) => callback(data));
  },
  onLog: (callback) => {
    ipcRenderer.on('log', (_event, data) => callback(data));
  },
});
