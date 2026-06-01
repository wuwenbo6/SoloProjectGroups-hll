import type { ElectronAPI } from '../../preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export const electronAPI = window.electronAPI;

export const simAPI = {
  start: (config?: Parameters<ElectronAPI['startSimulation']>[0]) =>
    electronAPI.startSimulation(config),
  pause: () => electronAPI.pauseSimulation(),
  reset: () => electronAPI.resetSimulation(),
  getState: () => electronAPI.getState(),
};

export const nodeAPI = {
  add: (config?: Parameters<ElectronAPI['addNode']>[0]) => electronAPI.addNode(config),
  remove: (nodeId: string) => electronAPI.removeNode(nodeId),
  update: (nodeId: string, config: Parameters<ElectronAPI['updateNode']>[1]) =>
    electronAPI.updateNode(nodeId, config),
  manualSend: (nodeId: string) => electronAPI.manualSend(nodeId),
};

export const busAPI = {
  updateConfig: (config: Parameters<ElectronAPI['updateBusConfig']>[0]) =>
    electronAPI.updateBusConfig(config),
  getConfig: () => electronAPI.getBusConfig(),
  setMode: (mode: Parameters<ElectronAPI['setBusMode']>[0]) =>
    electronAPI.setBusMode(mode),
  getUtilization: () => electronAPI.getUtilization(),
  exportData: () => electronAPI.exportData(),
};

export const events = {
  onStateUpdate: (callback: Parameters<ElectronAPI['onStateUpdate']>[0]) =>
    electronAPI.onStateUpdate(callback),
  onLog: (callback: Parameters<ElectronAPI['onLog']>[0]) => electronAPI.onLog(callback),
  onTimelineEvent: (callback: Parameters<ElectronAPI['onTimelineEvent']>[0]) =>
    electronAPI.onTimelineEvent(callback),
};
