import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectDicomFolder: () => ipcRenderer.invoke('select-dicom-folder'),
  selectExportPath: () => ipcRenderer.invoke('select-export-path'),
  getPythonPort: () => ipcRenderer.invoke('get-python-port'),
  onPythonReady: (callback: () => void) => {
    ipcRenderer.on('python-ready', callback);
    return () => ipcRenderer.removeListener('python-ready', callback);
  },
  onPythonError: (callback: (error: string) => void) => {
    ipcRenderer.on('python-error', (_e, error) => callback(error));
    return () => ipcRenderer.removeListener('python-error', callback);
  },
});

declare global {
  interface Window {
    electronAPI: {
      selectDicomFolder: () => Promise<string | null>;
      selectExportPath: () => Promise<string | null>;
      getPythonPort: () => Promise<number>;
      onPythonReady: (callback: () => void) => () => void;
      onPythonError: (callback: (error: string) => void) => () => void;
    };
  }
}
