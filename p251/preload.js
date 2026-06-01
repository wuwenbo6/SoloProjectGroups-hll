const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flashAPI', {
    readJEDECId: () => ipcRenderer.invoke('read-jedec-id'),
    readSFDP: () => ipcRenderer.invoke('read-sfdp'),
    eraseSector: (address) => ipcRenderer.invoke('erase-sector', address),
    eraseBlock: (address) => ipcRenderer.invoke('erase-block', address),
    eraseChip: () => ipcRenderer.invoke('erase-chip'),
    program: (address, data) => ipcRenderer.invoke('program', address, data),
    read: (address, length) => ipcRenderer.invoke('read', address, length),
    enableQSPI: () => ipcRenderer.invoke('enable-qspi'),
    disableQSPI: () => ipcRenderer.invoke('disable-qspi'),
    enableDDR: () => ipcRenderer.invoke('enable-ddr'),
    disableDDR: () => ipcRenderer.invoke('disable-ddr'),
    getMode: () => ipcRenderer.invoke('get-mode'),
    getOperationLog: () => ipcRenderer.invoke('get-operation-log'),
    clearOperationLog: () => ipcRenderer.invoke('clear-operation-log'),
    fastReadQuad: (address, length) => ipcRenderer.invoke('fast-read-quad', address, length),
    quadInputPageProgram: (address, data) => ipcRenderer.invoke('quad-input-page-program', address, data)
});
