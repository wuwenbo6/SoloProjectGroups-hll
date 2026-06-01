import { contextBridge, ipcRenderer } from 'electron';
import type { WavFileInfo, DemodulationConfig, AnalysisResult, AnalysisProgress } from '@shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: (): Promise<WavFileInfo | null> =>
    ipcRenderer.invoke('dmr:select-file'),

  startAnalysis: (filePath: string, config: DemodulationConfig): Promise<void> =>
    ipcRenderer.invoke('dmr:start-analysis', { filePath, config }),

  cancelAnalysis: (): Promise<void> =>
    ipcRenderer.invoke('dmr:cancel-analysis'),

  onProgress: (callback: (progress: AnalysisProgress) => void) => {
    ipcRenderer.on('dmr:analysis-progress', (_event, progress) => callback(progress));
    return () => ipcRenderer.removeAllListeners('dmr:analysis-progress');
  },

  onComplete: (callback: (result: AnalysisResult) => void) => {
    ipcRenderer.on('dmr:analysis-complete', (_event, result) => callback(result));
    return () => ipcRenderer.removeAllListeners('dmr:analysis-complete');
  },

  onError: (callback: (error: { message: string }) => void) => {
    ipcRenderer.on('dmr:analysis-error', (_event, error) => callback(error));
    return () => ipcRenderer.removeAllListeners('dmr:analysis-error');
  },

  openVoiceFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('dmr:open-voice-file', filePath),

  openVoiceFolder: (folderPath: string): Promise<void> =>
    ipcRenderer.invoke('dmr:open-voice-folder', folderPath),
});

declare global {
  interface Window {
    electronAPI: {
      selectFile: () => Promise<WavFileInfo | null>;
      startAnalysis: (filePath: string, config: DemodulationConfig) => Promise<void>;
      cancelAnalysis: () => Promise<void>;
      onProgress: (callback: (progress: AnalysisProgress) => void) => () => void;
      onComplete: (callback: (result: AnalysisResult) => void) => () => void;
      onError: (callback: (error: { message: string }) => void) => () => void;
      openVoiceFile: (filePath: string) => Promise<void>;
      openVoiceFolder: (folderPath: string) => Promise<void>;
    };
  }
}
