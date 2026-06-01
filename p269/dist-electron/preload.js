import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {
  selectFile: () => ipcRenderer.invoke("dmr:select-file"),
  startAnalysis: (filePath, config) => ipcRenderer.invoke("dmr:start-analysis", { filePath, config }),
  cancelAnalysis: () => ipcRenderer.invoke("dmr:cancel-analysis"),
  onProgress: (callback) => {
    ipcRenderer.on("dmr:analysis-progress", (_event, progress) => callback(progress));
    return () => ipcRenderer.removeAllListeners("dmr:analysis-progress");
  },
  onComplete: (callback) => {
    ipcRenderer.on("dmr:analysis-complete", (_event, result) => callback(result));
    return () => ipcRenderer.removeAllListeners("dmr:analysis-complete");
  },
  onError: (callback) => {
    ipcRenderer.on("dmr:analysis-error", (_event, error) => callback(error));
    return () => ipcRenderer.removeAllListeners("dmr:analysis-error");
  },
  openVoiceFile: (filePath) => ipcRenderer.invoke("dmr:open-voice-file", filePath),
  openVoiceFolder: (folderPath) => ipcRenderer.invoke("dmr:open-voice-folder", folderPath)
});
