const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('usbAPI', {
  getUSBDevices: () => ipcRenderer.invoke('get-usb-devices'),
  refreshDevices: () => ipcRenderer.invoke('refresh-devices'),
  redirectDevice: (vendorId, productId) => ipcRenderer.invoke('redirect-usb-device', vendorId, productId),
  releaseDevice: (vendorId, productId) => ipcRenderer.invoke('release-usb-device', vendorId, productId),
  onDeviceAdded: (callback) => {
    ipcRenderer.on('usb-device-added', (event, device) => callback(device));
  },
  onDeviceRemoved: (callback) => {
    ipcRenderer.on('usb-device-removed', (event, device) => callback(device));
  },
  onDeviceUpdated: (callback) => {
    ipcRenderer.on('usb-device-updated', (event, device) => callback(device));
  },
  onChannelsCreated: (callback) => {
    ipcRenderer.on('channels-created', (event, data) => callback(data));
  },
  onChannelBackpressure: (callback) => {
    ipcRenderer.on('channel-backpressure', (event, data) => callback(data));
  },
  onISOStreamStarted: (callback) => {
    ipcRenderer.on('iso-stream-started', (event, data) => callback(data));
  },
  onISOStreamStopped: (callback) => {
    ipcRenderer.on('iso-stream-stopped', (event, data) => callback(data));
  },
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('usb-device-added');
    ipcRenderer.removeAllListeners('usb-device-removed');
    ipcRenderer.removeAllListeners('usb-device-updated');
    ipcRenderer.removeAllListeners('channels-created');
    ipcRenderer.removeAllListeners('channel-backpressure');
    ipcRenderer.removeAllListeners('iso-stream-started');
    ipcRenderer.removeAllListeners('iso-stream-stopped');
  },
  getDeviceChannels: (vendorId, productId) => ipcRenderer.invoke('get-device-channels', vendorId, productId),
  getAllChannels: () => ipcRenderer.invoke('get-all-channels'),
  createUSBChannel: (vendorId, productId, endpointConfig) => ipcRenderer.invoke('create-usb-channel', vendorId, productId, endpointConfig),
  closeUSBChannel: (channelId) => ipcRenderer.invoke('close-usb-channel', channelId),
  setChannelTokenParams: (channelId, capacity, refillRate, creditWindow) => ipcRenderer.invoke('set-channel-token-params', channelId, capacity, refillRate, creditWindow),
  getChannelStats: (channelId) => ipcRenderer.invoke('get-channel-stats', channelId),
  submitBulkTransfer: (channelId, data) => ipcRenderer.invoke('submit-bulk-transfer', channelId, data),
  startISOStream: (channelId) => ipcRenderer.invoke('start-iso-stream', channelId),
  stopISOStream: (channelId) => ipcRenderer.invoke('stop-iso-stream', channelId),
  submitISOTransfer: (channelId, data) => ipcRenderer.invoke('submit-iso-transfer', channelId, data)
});

contextBridge.exposeInMainWorld('spiceAPI', {
  connect: (connectionParams) => ipcRenderer.invoke('connect-spice', connectionParams),
  disconnect: () => ipcRenderer.invoke('disconnect-spice'),
  getConnection: () => ipcRenderer.invoke('get-spice-connection'),
  getRedirectStats: () => ipcRenderer.invoke('get-redirect-stats'),
  exportStats: () => ipcRenderer.invoke('export-stats')
});
