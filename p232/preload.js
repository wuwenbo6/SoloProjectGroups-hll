const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ntfsAPI', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  loadImage: (filePath) => ipcRenderer.invoke('load-image', filePath),
  parseMFT: (options) => ipcRenderer.invoke('parse-mft', options),
  scanSignatures: (options) => ipcRenderer.invoke('scan-signatures', options),
  analyzeRecovery: (entries) => ipcRenderer.invoke('analyze-recovery', entries),
  recoverFile: (entry, outputPath) => ipcRenderer.invoke('recover-file', entry, outputPath),
  saveFileDialog: () => ipcRenderer.invoke('save-file-dialog'),
  getFilePreview: (entry) => ipcRenderer.invoke('get-file-preview', entry),
  exportCSVReport: (entries, outputPath) => ipcRenderer.invoke('export-csv-report', entries, outputPath),
  exportSignatureReport: (results, outputPath) => ipcRenderer.invoke('export-signature-report', results, outputPath),
  exportFullReport: (analysis, signatures, outputPath) => ipcRenderer.invoke('export-full-report', analysis, signatures, outputPath),
  saveCSVDialog: (defaultName) => ipcRenderer.invoke('save-csv-dialog', defaultName),
  onMFTProgress: (callback) => ipcRenderer.on('mft-progress', (_event, data) => callback(data)),
  onScanProgress: (callback) => ipcRenderer.on('scan-progress', (_event, data) => callback(data)),
});
