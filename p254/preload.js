const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daliAPI', {
  getSerialPorts: () => ipcRenderer.invoke('get-serial-ports'),
  openSerialPort: (portPath, baudRate) => ipcRenderer.invoke('open-serial-port', portPath, baudRate),
  closeSerialPort: () => ipcRenderer.invoke('close-serial-port'),
  sendDALICommand: (addrByte, cmdByte) => ipcRenderer.invoke('send-dali-command', addrByte, cmdByte),
  sendDimmerCommand: (addrType, address, level) => ipcRenderer.invoke('send-dimmer-command', addrType, address, level),
  sendFadeTimeCommand: (addrType, address, fadeTime) => ipcRenderer.invoke('send-fade-time-command', addrType, address, fadeTime),
  queryLevel: (addrType, address) => ipcRenderer.invoke('query-level', addrType, address),
  queryFadeTime: (addrType, address) => ipcRenderer.invoke('query-fade-time', addrType, address),
  queryStatus: (addrType, address) => ipcRenderer.invoke('query-status', addrType, address),
  queryLampPower: (addrType, address) => ipcRenderer.invoke('query-lamp-power', addrType, address),
  queryLampFailure: (addrType, address) => ipcRenderer.invoke('query-lamp-failure', addrType, address),
  storeScene: (addrType, address, sceneNumber) => ipcRenderer.invoke('store-scene', addrType, address, sceneNumber),
  recallScene: (addrType, address, sceneNumber) => ipcRenderer.invoke('recall-scene', addrType, address, sceneNumber),
  removeScene: (addrType, address, sceneNumber) => ipcRenderer.invoke('remove-scene', addrType, address, sceneNumber),
  querySceneLevel: (addrType, address, sceneNumber) => ipcRenderer.invoke('query-scene-level', addrType, address, sceneNumber),
  getSimulationStatus: () => ipcRenderer.invoke('get-simulation-status'),
  encodeDALIFrame: (addrType, address, command, isCommand) => ipcRenderer.invoke('encode-dali-frame', addrType, address, command, isCommand),
  setSimulationLampPower: (powerOn) => ipcRenderer.invoke('set-simulation-lamp-power', powerOn),
  setSimulationLampFailure: (failure) => ipcRenderer.invoke('set-simulation-lamp-failure', failure),
  getAllScenes: () => ipcRenderer.invoke('get-all-scenes'),
  parseStatusByte: (statusByte) => ipcRenderer.invoke('parse-status-byte', statusByte),
  getPowerWatts: (level) => ipcRenderer.invoke('get-power-watts', level),
  onSerialData: (callback) => ipcRenderer.on('serial-data', (event, data) => callback(data)),
  onSerialClosed: (callback) => ipcRenderer.on('serial-closed', () => callback()),
  onLevelUpdate: (callback) => ipcRenderer.on('dali-level-update', (event, level) => callback(level)),
  onFadeTimeUpdate: (callback) => ipcRenderer.on('dali-fade-time-update', (event, data) => callback(data)),
  onSimulationStateUpdate: (callback) => ipcRenderer.on('dali-simulation-state-update', (event, data) => callback(data)),
  removeSerialListeners: () => {
    ipcRenderer.removeAllListeners('serial-data');
    ipcRenderer.removeAllListeners('serial-closed');
    ipcRenderer.removeAllListeners('dali-level-update');
    ipcRenderer.removeAllListeners('dali-fade-time-update');
    ipcRenderer.removeAllListeners('dali-simulation-state-update');
  }
});
