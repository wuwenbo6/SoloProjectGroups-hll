import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.invoke('minimize-window'),
  maximize: () => ipcRenderer.invoke('maximize-window'),
  close: () => ipcRenderer.invoke('close-window'),
})

declare global {
  interface Window {
    electronAPI: {
      minimize: () => Promise<void>
      maximize: () => Promise<boolean>
      close: () => Promise<void>
    }
  }
}
