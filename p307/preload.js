const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('l2capAPI', {
  getState: () => ipcRenderer.invoke('l2cap:getState'),
  connect: (peerAddress) => ipcRenderer.invoke('l2cap:connect', peerAddress),
  disconnect: () => ipcRenderer.invoke('l2cap:disconnect'),
  sendData: (data) => ipcRenderer.invoke('l2cap:sendData', data),
  negotiateMtu: (mtu) => ipcRenderer.invoke('l2cap:negotiateMtu', mtu),
  grantCredits: (count) => ipcRenderer.invoke('l2cap:grantCredits', count),
  exportLogs: () => ipcRenderer.invoke('l2cap:exportLogs'),
  onStateUpdate: (callback) => {
    ipcRenderer.on('l2cap:stateUpdate', (event, state) => callback(state));
  },
  onLog: (callback) => {
    ipcRenderer.on('l2cap:log', (event, log) => callback(log));
  },
  onSignaling: (callback) => {
    ipcRenderer.on('l2cap:signaling', (event, pkt) => callback(pkt));
  }
});