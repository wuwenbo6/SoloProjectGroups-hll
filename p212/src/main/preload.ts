import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('bacnetAPI', {
  listPorts: () => ipcRenderer.invoke('list-ports'),
  connect: (port: string, baudRate: number) => ipcRenderer.invoke('connect', port, baudRate),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  isConnected: () => ipcRenderer.invoke('is-connected'),
  clearFrames: () => ipcRenderer.invoke('clear-frames'),
  getFrames: () => ipcRenderer.invoke('get-frames'),
  getDevices: () => ipcRenderer.invoke('get-devices'),
  sendWhoIs: (lowLimit?: number, highLimit?: number) => ipcRenderer.invoke('send-who-is', lowLimit, highLimit),
  setSourceAddress: (addr: number) => ipcRenderer.invoke('set-source-address', addr),
  exportPcap: () => ipcRenderer.invoke('export-pcap'),
  onFrame: (callback: (frame: any) => void) => {
    ipcRenderer.on('frame-captured', (_event, frame) => callback(frame));
  },
  onDeviceUpdate: (callback: (devices: any[]) => void) => {
    ipcRenderer.on('devices-updated', (_event, devices) => callback(devices));
  },
  onError: (callback: (error: string) => void) => {
    ipcRenderer.on('error', (_event, error) => callback(error));
  },
  removeFrameListener: () => {
    ipcRenderer.removeAllListeners('frame-captured');
  },
  removeDeviceListener: () => {
    ipcRenderer.removeAllListeners('devices-updated');
  },
  removeErrorListener: () => {
    ipcRenderer.removeAllListeners('error');
  },
});
