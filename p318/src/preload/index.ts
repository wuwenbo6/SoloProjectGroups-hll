import { contextBridge, ipcRenderer } from 'electron';
import type { NodeConfig, BusConfig, NodeState, BusState, LogEntry, TimelineEvent, BusUtilizationStats, BusMode } from '../shared/types';

const api = {
  startSimulation: (config?: BusConfig) => ipcRenderer.invoke('sim:start', config),
  pauseSimulation: () => ipcRenderer.invoke('sim:pause'),
  resetSimulation: () => ipcRenderer.invoke('sim:reset'),
  getState: () => ipcRenderer.invoke('sim:getState'),

  addNode: (config?: Partial<NodeConfig>) => ipcRenderer.invoke('node:add', config),
  removeNode: (nodeId: string) => ipcRenderer.invoke('node:remove', nodeId),
  updateNode: (nodeId: string, config: Partial<NodeConfig>) =>
    ipcRenderer.invoke('node:update', nodeId, config),
  manualSend: (nodeId: string) => ipcRenderer.invoke('node:manualSend', nodeId),

  updateBusConfig: (config: Partial<BusConfig>) => ipcRenderer.invoke('bus:updateConfig', config),
  getBusConfig: () => ipcRenderer.invoke('bus:getConfig'),
  setBusMode: (mode: BusMode) => ipcRenderer.invoke('bus:setMode', mode),
  getUtilization: () => ipcRenderer.invoke('bus:getUtilization'),
  exportData: () => ipcRenderer.invoke('export:data'),

  onStateUpdate: (callback: (state: { nodes: Record<string, NodeState>; bus: BusState; utilization: BusUtilizationStats }) => void) => {
    const handler = (_event: unknown, state: { nodes: Record<string, NodeState>; bus: BusState; utilization: BusUtilizationStats }) => callback(state);
    ipcRenderer.on('state:update', handler);
    return () => ipcRenderer.removeListener('state:update', handler);
  },

  onLog: (callback: (log: LogEntry) => void) => {
    const handler = (_event: unknown, log: LogEntry) => callback(log);
    ipcRenderer.on('log:new', handler);
    return () => ipcRenderer.removeListener('log:new', handler);
  },

  onTimelineEvent: (callback: (event: TimelineEvent) => void) => {
    const handler = (_event: unknown, event: TimelineEvent) => callback(event);
    ipcRenderer.on('timeline:update', handler);
    return () => ipcRenderer.removeListener('timeline:update', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
