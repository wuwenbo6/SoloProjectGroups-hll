import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  reader: {
    list: () => Promise<any[]>
    connect: (readerId: string) => Promise<any>
    disconnect: () => Promise<any>
  }
  auth: {
    authenticate: (sector: number, keyType: 'A' | 'B', key: number[]) => Promise<any>
    deauthenticate: (sector: number) => Promise<any>
    deauthenticateAll: () => Promise<any>
  }
  card: {
    read: (block: number) => Promise<any>
    write: (block: number, data: number[]) => Promise<any>
    getAll: () => Promise<any[]>
    reset: () => Promise<any>
    exportDump: () => Promise<any>
    importDump: (data: number[]) => Promise<any>
  }
  keys: {
    save: (entries: any[]) => Promise<any>
    load: () => Promise<any[]>
  }
}

const api: ElectronAPI = {
  reader: {
    list: () => ipcRenderer.invoke('reader:list'),
    connect: (readerId: string) => ipcRenderer.invoke('reader:connect', readerId),
    disconnect: () => ipcRenderer.invoke('reader:disconnect')
  },
  auth: {
    authenticate: (sector: number, keyType: 'A' | 'B', key: number[]) =>
      ipcRenderer.invoke('auth:authenticate', { sector, keyType, key }),
    deauthenticate: (sector: number) => ipcRenderer.invoke('auth:deauthenticate', { sector }),
    deauthenticateAll: () => ipcRenderer.invoke('auth:deauthenticateAll')
  },
  card: {
    read: (block: number) => ipcRenderer.invoke('card:read', { block }),
    write: (block: number, data: number[]) => ipcRenderer.invoke('card:write', { block, data }),
    getAll: () => ipcRenderer.invoke('card:getAll'),
    reset: () => ipcRenderer.invoke('card:reset'),
    exportDump: () => ipcRenderer.invoke('card:exportDump'),
    importDump: (data: number[]) => ipcRenderer.invoke('card:importDump', { data })
  },
  keys: {
    save: (entries: any[]) => ipcRenderer.invoke('keys:save', { entries }),
    load: () => ipcRenderer.invoke('keys:load')
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
