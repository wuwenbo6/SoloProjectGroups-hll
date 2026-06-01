import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  onMessage: (callback: (message: any) => void) => {
    ipcRenderer.on('pd:message', (_event, data) => callback(data))
  },
  onNegotiationUpdate: (callback: (update: any) => void) => {
    ipcRenderer.on('pd:negotiation-update', (_event, data) => callback(data))
  },
  onPowerCurvePoint: (callback: (point: any) => void) => {
    ipcRenderer.on('pd:power-curve-point', (_event, data) => callback(data))
  },
  onDeviceStatus: (callback: (status: any) => void) => {
    ipcRenderer.on('pd:device-status', (_event, data) => callback(data))
  },
  onMessageIdGap: (callback: (event: any) => void) => {
    ipcRenderer.on('pd:message-id-gap', (_event, data) => callback(data))
  },
  onHardReset: (callback: (event: any) => void) => {
    ipcRenderer.on('pd:hard-reset', (_event, data) => callback(data))
  },
  startSimulation: (scenario: string, speed: number) => {
    ipcRenderer.send('pd:start-simulation', scenario, speed)
  },
  stopSimulation: () => {
    ipcRenderer.send('pd:stop-simulation')
  },
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('pd:message')
    ipcRenderer.removeAllListeners('pd:negotiation-update')
    ipcRenderer.removeAllListeners('pd:power-curve-point')
    ipcRenderer.removeAllListeners('pd:device-status')
    ipcRenderer.removeAllListeners('pd:message-id-gap')
    ipcRenderer.removeAllListeners('pd:hard-reset')
  },
})
