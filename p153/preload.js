const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dicomAPI', {
  loadDicom: () => ipcRenderer.invoke('load-dicom'),
  getPixelDataInfo: () => ipcRenderer.invoke('get-pixel-data-info'),
  getPixelData: () => ipcRenderer.invoke('get-pixel-data'),
  applyROIReplacement: (roiData) => ipcRenderer.invoke('apply-roi-replacement', roiData),
  setTagValue: (tag, value) => ipcRenderer.invoke('set-tag-value', tag, value),
  saveDicom: () => ipcRenderer.invoke('save-dicom'),
  validateDicom: () => ipcRenderer.invoke('validate-dicom'),
  exportTagDictionary: () => ipcRenderer.invoke('export-tag-dictionary'),
  importTagDictionary: () => ipcRenderer.invoke('import-tag-dictionary'),
  batchModifyTags: (modifications) => ipcRenderer.invoke('batch-modify-tags', modifications),
});