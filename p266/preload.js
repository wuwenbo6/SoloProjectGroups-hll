const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bluetoothAPI', {
  startScan: () => ipcRenderer.invoke('start-scan'),
  stopScan: () => ipcRenderer.invoke('stop-scan'),
  getDevices: () => ipcRenderer.invoke('get-devices'),
  getAdapterInfo: () => ipcRenderer.invoke('get-adapter-info'),
  initBlueZ: () => ipcRenderer.invoke('init-bluez'),
  
  pairDevice: (devicePath) => ipcRenderer.invoke('pair-device', devicePath),
  cancelPairing: (devicePath) => ipcRenderer.invoke('cancel-pairing', devicePath),
  removeDevice: (devicePath) => ipcRenderer.invoke('remove-device', devicePath),
  connectDevice: (devicePath) => ipcRenderer.invoke('connect-device', devicePath),
  disconnectDevice: (devicePath) => ipcRenderer.invoke('disconnect-device', devicePath),
  providePin: (devicePath, pinCode) => ipcRenderer.invoke('provide-pin', devicePath, pinCode),
  getDeviceDetails: (devicePath) => ipcRenderer.invoke('get-device-details', devicePath),
  exportDevicesCSV: () => ipcRenderer.invoke('export-devices-csv'),
  
  onDeviceAdded: (callback) => {
    ipcRenderer.on('device-added', (event, device) => callback(device));
  },
  onDeviceRemoved: (callback) => {
    ipcRenderer.on('device-removed', (event, device) => callback(device));
  },
  onDeviceUpdated: (callback) => {
    ipcRenderer.on('device-updated', (event, device) => callback(device));
  },
  onScanningChanged: (callback) => {
    ipcRenderer.on('scanning-changed', (event, isScanning) => callback(isScanning));
  },
  onRequestPin: (callback) => {
    ipcRenderer.on('request-pin', (event, data) => callback(data));
  },
  onRequestPasskey: (callback) => {
    ipcRenderer.on('request-passkey', (event, data) => callback(data));
  },
  onRequestConfirmation: (callback) => {
    ipcRenderer.on('request-confirmation', (event, data) => callback(data));
  },
  onDisplayPin: (callback) => {
    ipcRenderer.on('display-pin', (event, data) => callback(data));
  },
  onDisplayPasskey: (callback) => {
    ipcRenderer.on('display-passkey', (event, data) => callback(data));
  },
  
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('device-added');
    ipcRenderer.removeAllListeners('device-removed');
    ipcRenderer.removeAllListeners('device-updated');
    ipcRenderer.removeAllListeners('scanning-changed');
    ipcRenderer.removeAllListeners('request-pin');
    ipcRenderer.removeAllListeners('request-passkey');
    ipcRenderer.removeAllListeners('request-confirmation');
    ipcRenderer.removeAllListeners('display-pin');
    ipcRenderer.removeAllListeners('display-passkey');
  }
});
