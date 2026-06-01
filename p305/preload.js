const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFiles: () => ipcRenderer.invoke('open-files'),
  parseGerber: (filePath) => ipcRenderer.invoke('parse-gerber', filePath),
  runDRC: (parsedData, rules) => ipcRenderer.invoke('run-drc', { parsedData, rules }),
  savePdfReport: (reportData) => ipcRenderer.invoke('save-pdf-report', reportData),
});
