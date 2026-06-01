const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('radioAPI', {
  start: (frequency, options) => ipcRenderer.invoke('radio:start', frequency, options),
  stop: () => ipcRenderer.invoke('radio:stop'),
  getStatus: () => ipcRenderer.invoke('radio:status'),
  getStreamUrl: () => ipcRenderer.invoke('radio:streamUrl'),
  getSignalLevel: () => ipcRenderer.invoke('radio:signalLevel'),
  getIsSilent: () => ipcRenderer.invoke('radio:isSilent'),
  getRDSStats: () => ipcRenderer.invoke('radio:rdsStats'),
  setNoiseThreshold: (threshold) => ipcRenderer.invoke('radio:setNoiseThreshold', threshold),
  
  startRecording: (options) => ipcRenderer.invoke('record:start', options),
  pauseRecording: () => ipcRenderer.invoke('record:pause'),
  resumeRecording: () => ipcRenderer.invoke('record:resume'),
  stopRecording: () => ipcRenderer.invoke('record:stop'),
  getRecordingStatus: () => ipcRenderer.invoke('record:status'),
  getRecordingsList: () => ipcRenderer.invoke('record:list'),
  deleteRecording: (filePath) => ipcRenderer.invoke('record:delete', filePath),
  setRecordingOutputDir: (dir) => ipcRenderer.invoke('record:setOutputDir', dir),
  getRecordingOutputDir: () => ipcRenderer.invoke('record:getOutputDir'),
  getTimerPresets: () => ipcRenderer.invoke('record:getTimerPresets'),
  startTimerRecording: (durationSeconds, options) => ipcRenderer.invoke('record:startTimer', durationSeconds, options),
  stopTimerRecording: () => ipcRenderer.invoke('record:stopTimer'),
  
  onSpectrumData: (callback) => ipcRenderer.on('spectrum:data', (event, data) => callback(data)),
  
  onRecordStarted: (callback) => ipcRenderer.on('record:started', (event, data) => callback(data)),
  onRecordStopped: (callback) => ipcRenderer.on('record:stopped', (event, data) => callback(data)),
  onRecordPaused: (callback) => ipcRenderer.on('record:paused', callback),
  onRecordResumed: (callback) => ipcRenderer.on('record:resumed', callback),
  onRecordProgress: (callback) => ipcRenderer.on('record:progress', (event, data) => callback(data)),
  onTimerStarted: (callback) => ipcRenderer.on('timer:started', (event, data) => callback(data)),
  onTimerStopped: (callback) => ipcRenderer.on('timer:stopped', callback),
  onTimerTick: (callback) => ipcRenderer.on('timer:tick', (event, data) => callback(data)),
  
  selectOutputDir: () => ipcRenderer.invoke('dialog:selectOutputDir'),
  saveFileDialog: (defaultPath) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  copyFile: (source, dest) => ipcRenderer.invoke('file:copy', source, dest),
  
  startScan: (startFreq, endFreq, step) => ipcRenderer.invoke('scan:start', startFreq, endFreq, step),
  stopScan: () => ipcRenderer.invoke('scan:stop'),
  isScanning: () => ipcRenderer.invoke('scan:isScanning'),
  
  onStarted: (callback) => ipcRenderer.on('radio:started', (event, data) => callback(data)),
  onStopped: (callback) => ipcRenderer.on('radio:stopped', callback),
  onStationName: (callback) => ipcRenderer.on('radio:stationName', (event, name) => callback(name)),
  onProgramType: (callback) => ipcRenderer.on('radio:programType', (event, type) => callback(type)),
  onRadioText: (callback) => ipcRenderer.on('radio:radioText', (event, text) => callback(text)),
  onMetadata: (callback) => ipcRenderer.on('radio:metadata', (event, metadata) => callback(metadata)),
  onSignalDetected: (callback) => ipcRenderer.on('radio:signalDetected', (event, data) => callback(data)),
  onSilenceDetected: (callback) => ipcRenderer.on('radio:silenceDetected', (event, data) => callback(data)),
  
  onScanProgress: (callback) => ipcRenderer.on('scan:progress', (event, progress) => callback(progress)),
  onStationFound: (callback) => ipcRenderer.on('scan:stationFound', (event, station) => callback(station)),
  onScanComplete: (callback) => ipcRenderer.on('scan:complete', (event, stations) => callback(stations)),
  
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('radio:started');
    ipcRenderer.removeAllListeners('radio:stopped');
    ipcRenderer.removeAllListeners('radio:stationName');
    ipcRenderer.removeAllListeners('radio:programType');
    ipcRenderer.removeAllListeners('radio:radioText');
    ipcRenderer.removeAllListeners('radio:metadata');
    ipcRenderer.removeAllListeners('radio:signalDetected');
    ipcRenderer.removeAllListeners('radio:silenceDetected');
    ipcRenderer.removeAllListeners('spectrum:data');
    ipcRenderer.removeAllListeners('record:started');
    ipcRenderer.removeAllListeners('record:stopped');
    ipcRenderer.removeAllListeners('record:paused');
    ipcRenderer.removeAllListeners('record:resumed');
    ipcRenderer.removeAllListeners('record:progress');
    ipcRenderer.removeAllListeners('timer:started');
    ipcRenderer.removeAllListeners('timer:stopped');
    ipcRenderer.removeAllListeners('timer:tick');
    ipcRenderer.removeAllListeners('scan:progress');
    ipcRenderer.removeAllListeners('scan:stationFound');
    ipcRenderer.removeAllListeners('scan:complete');
  }
});
