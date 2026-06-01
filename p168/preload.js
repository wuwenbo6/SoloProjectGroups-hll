const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('uefi', {
  getVariable: (name, guid) => ipcRenderer.invoke('getVariable', name, guid),
  setVariable: (name, guid, data, attributes) => ipcRenderer.invoke('setVariable', name, guid, data, attributes),
  getAllVariables: () => ipcRenderer.invoke('getAllVariables'),
  getNextVariableName: (vendorGuid) => ipcRenderer.invoke('getNextVariableName', vendorGuid),
  queryVariableInfo: (attributes) => ipcRenderer.invoke('queryVariableInfo', attributes),
  getVariableAttributes: () => ipcRenderer.invoke('getVariableAttributes'),
  exportVariables: () => ipcRenderer.invoke('exportVariables'),
  importVariables: (jsonData) => ipcRenderer.invoke('importVariables', jsonData),
  getProtectedVariables: () => ipcRenderer.invoke('getProtectedVariables')
});
