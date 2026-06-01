const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  instrument: {
    list: () => ipcRenderer.invoke('instrument:list'),
    connect: (deviceId) => ipcRenderer.invoke('instrument:connect', deviceId),
    disconnect: (deviceId) => ipcRenderer.invoke('instrument:disconnect', deviceId),
    send: (deviceId, command, timeout) => ipcRenderer.invoke('instrument:send', deviceId, command, timeout),
    query: (deviceId, command, timeout) => ipcRenderer.invoke('instrument:query', deviceId, command, timeout),
    batch: (deviceId, commands, options) => ipcRenderer.invoke('instrument:batch', deviceId, commands, options),
    isBusy: (deviceId) => ipcRenderer.invoke('instrument:isBusy', deviceId),
    reset: (deviceId) => ipcRenderer.invoke('instrument:reset', deviceId),
    setTimeout: (deviceId, timeout) => ipcRenderer.invoke('instrument:setTimeout', deviceId, timeout)
  },
  commands: {
    getAll: () => ipcRenderer.invoke('commands:getAll'),
    add: (command) => ipcRenderer.invoke('commands:add', command),
    update: (id, command) => ipcRenderer.invoke('commands:update', id, command),
    delete: (id) => ipcRenderer.invoke('commands:delete', id)
  },
  sequences: {
    getAll: () => ipcRenderer.invoke('sequences:getAll'),
    add: (sequence) => ipcRenderer.invoke('sequences:add', sequence),
    update: (id, sequence) => ipcRenderer.invoke('sequences:update', id, sequence),
    delete: (id) => ipcRenderer.invoke('sequences:delete', id)
  },
  script: {
    run: (code, language) => ipcRenderer.invoke('script:run', code, language),
    runWithTest: (code, language, testName) => ipcRenderer.invoke('script:runWithTest', code, language, testName),
    runSequence: (sequenceId) => ipcRenderer.invoke('script:runSequence', sequenceId),
    stop: () => ipcRenderer.invoke('script:stop')
  },
  testRuns: {
    getAll: (limit) => ipcRenderer.invoke('testruns:getAll', limit),
    get: (testRunId) => ipcRenderer.invoke('testruns:get', testRunId),
    delete: (testRunId) => ipcRenderer.invoke('testruns:delete', testRunId)
  },
  measurements: {
    getHistory: (deviceId, command, limit) => ipcRenderer.invoke('measurements:getHistory', deviceId, command, limit)
  },
  report: {
    exportHTML: (testRunId) => ipcRenderer.invoke('report:exportHTML', testRunId),
    exportCSV: (testRunId) => ipcRenderer.invoke('report:exportCSV', testRunId),
    exportJSON: (testRunId) => ipcRenderer.invoke('report:exportJSON', testRunId),
    previewHTML: (testRunId) => ipcRenderer.invoke('report:previewHTML', testRunId)
  }
});
