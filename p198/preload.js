const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  sessionCreate: (l) => ipcRenderer.invoke('session:create', l),
  sessionList: () => ipcRenderer.invoke('session:list'),
  sessionRemove: (id) => ipcRenderer.invoke('session:remove', id),
  startRecord: (id) => ipcRenderer.invoke('recording:start', id),
  stopRecord: (id) => ipcRenderer.invoke('recording:stop', id),
  addEvent: (id, d) => ipcRenderer.invoke('recording:addEvent', id, d),
  saveRecord: (id, p) => ipcRenderer.invoke('recording:save', id, p),
  loadRecord: (p) => ipcRenderer.invoke('recording:load', p),
  exportHTML: (id, p) => ipcRenderer.invoke('recording:exportHTML', id, p),
  exportHTMLFromFile: (j, h) => ipcRenderer.invoke('recording:exportHTMLFromFile', j, h),
  getDPI: () => ipcRenderer.invoke('recording:getDPI'),
  startReplay: (e) => ipcRenderer.invoke('replay:start', e),
  stopReplay: () => ipcRenderer.invoke('replay:stop'),
  showSaveDialog: () => ipcRenderer.invoke('dialog:save'),
  showSaveHTMLDialog: () => ipcRenderer.invoke('dialog:saveHTML'),
  showOpenDialog: () => ipcRenderer.invoke('dialog:open'),
  onReplayEvent: (cb) => ipcRenderer.on('replay:event', (_, e) => cb(e)),
  onReplayProgress: (cb) => ipcRenderer.on('replay:progress', (_, d) => cb(d)),
  onReplayComplete: (cb) => ipcRenderer.on('replay:complete', () => cb())
});
