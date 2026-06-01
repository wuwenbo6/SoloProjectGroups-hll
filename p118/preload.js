const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  video: {
    select: () => ipcRenderer.invoke('video:select'),
    process: (videoPath, options) => ipcRenderer.invoke('video:process', videoPath, options),
    stop: () => ipcRenderer.invoke('video:stop'),
    onFrameProcessed: (callback) => {
      ipcRenderer.on('frame:processed', (event, data) => callback(data));
    },
    onDetectionAlert: (callback) => {
      ipcRenderer.on('detection:alert', (event, alert) => callback(alert));
    },
    onProcessingComplete: (callback) => {
      ipcRenderer.on('processing:complete', (event, result) => callback(result));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('frame:processed');
      ipcRenderer.removeAllListeners('detection:alert');
      ipcRenderer.removeAllListeners('processing:complete');
    }
  },
  events: {
    getAll: (filters) => ipcRenderer.invoke('events:getAll', filters),
    getById: (id) => ipcRenderer.invoke('events:getById', id),
    delete: (id) => ipcRenderer.invoke('events:delete', id),
    export: (outputPath) => ipcRenderer.invoke('events:export', outputPath)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settings) => ipcRenderer.invoke('settings:update', settings)
  },
  alarm: {
    test: () => ipcRenderer.invoke('alarm:test'),
    mute: (muted) => ipcRenderer.invoke('alarm:mute', muted)
  },
  emergency: {
    trigger: (reason) => ipcRenderer.invoke('emergency:trigger', reason),
    getRecords: (filters) => ipcRenderer.invoke('emergency:getRecords', filters),
    getById: (id) => ipcRenderer.invoke('emergency:getById', id),
    delete: (id) => ipcRenderer.invoke('emergency:delete', id),
    getStatus: () => ipcRenderer.invoke('emergency:getStatus'),
    onTriggered: (callback) => {
      ipcRenderer.on('emergency:triggered', (event, data) => callback(data));
    },
    onSaved: (callback) => {
      ipcRenderer.on('emergency:saved', (event, record) => callback(record));
    },
    onError: (callback) => {
      ipcRenderer.on('emergency:error', (event, error) => callback(error));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('emergency:triggered');
      ipcRenderer.removeAllListeners('emergency:saved');
      ipcRenderer.removeAllListeners('emergency:error');
    }
  },
  upload: {
    getQueue: () => ipcRenderer.invoke('upload:getQueue'),
    getHistory: (filters) => ipcRenderer.invoke('upload:getHistory', filters),
    cancel: (uploadId) => ipcRenderer.invoke('upload:cancel', uploadId),
    retry: (uploadId) => ipcRenderer.invoke('upload:retry', uploadId),
    getStatus: () => ipcRenderer.invoke('upload:getStatus'),
    onQueued: (callback) => {
      ipcRenderer.on('upload:queued', (event, task) => callback(task));
    },
    onStarted: (callback) => {
      ipcRenderer.on('upload:started', (event, task) => callback(task));
    },
    onProgress: (callback) => {
      ipcRenderer.on('upload:progress', (event, data) => callback(data));
    },
    onCompleted: (callback) => {
      ipcRenderer.on('upload:completed', (event, task) => callback(task));
    },
    onFailed: (callback) => {
      ipcRenderer.on('upload:failed', (event, task) => callback(task));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('upload:queued');
      ipcRenderer.removeAllListeners('upload:started');
      ipcRenderer.removeAllListeners('upload:progress');
      ipcRenderer.removeAllListeners('upload:completed');
      ipcRenderer.removeAllListeners('upload:failed');
    }
  },
  gps: {
    getTracks: (filters) => ipcRenderer.invoke('gps:getTracks', filters),
    getTrackById: (trackId) => ipcRenderer.invoke('gps:getTrackById', trackId),
    getTrackPoints: (trackId) => ipcRenderer.invoke('gps:getTrackPoints', trackId),
    exportGPX: (trackId) => ipcRenderer.invoke('gps:exportGPX', trackId),
    exportKML: (trackId) => ipcRenderer.invoke('gps:exportKML', trackId),
    exportJSON: (trackId) => ipcRenderer.invoke('gps:exportJSON', trackId),
    getStatistics: (trackId) => ipcRenderer.invoke('gps:getStatistics', trackId),
    delete: (trackId) => ipcRenderer.invoke('gps:delete', trackId),
    getStatus: () => ipcRenderer.invoke('gps:getStatus'),
    onRecordingStarted: (callback) => {
      ipcRenderer.on('gps:recording_started', (event, track) => callback(track));
    },
    onRecordingStopped: (callback) => {
      ipcRenderer.on('gps:recording_stopped', (event, track) => callback(track));
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('gps:recording_started');
      ipcRenderer.removeAllListeners('gps:recording_stopped');
    }
  }
});
