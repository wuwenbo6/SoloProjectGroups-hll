const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ftpAPI', {
  connect: (config) => ipcRenderer.invoke('ftp-connect', config),
  disconnect: () => ipcRenderer.invoke('ftp-disconnect'),
  list: (path) => ipcRenderer.invoke('ftp-list', path),
  upload: (localPath, remotePath) => ipcRenderer.invoke('ftp-upload', localPath, remotePath),
  download: (remotePath, localPath) => ipcRenderer.invoke('ftp-download', remotePath, localPath),
  resumeUpload: (localPath, remotePath) => ipcRenderer.invoke('ftp-resume-upload', localPath, remotePath),
  resumeDownload: (remotePath, localPath) => ipcRenderer.invoke('ftp-resume-download', remotePath, localPath),
  delete: (remotePath) => ipcRenderer.invoke('ftp-delete', remotePath),
  mkdir: (remotePath) => ipcRenderer.invoke('ftp-mkdir', remotePath),
  getMtime: (remotePath) => ipcRenderer.invoke('ftp-get-mtime', remotePath),
  mirrorSync: (localDir, remoteDir) => ipcRenderer.invoke('ftp-mirror-sync', localDir, remoteDir),
  onUploadProgress: (callback) => {
    ipcRenderer.on('upload-progress', (event, progress) => callback(progress));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, progress) => callback(progress));
  },
  onMirrorProgress: (callback) => {
    ipcRenderer.on('mirror-progress', (event, progress) => callback(progress));
  },
  onMirrorFileComplete: (callback) => {
    ipcRenderer.on('mirror-file-complete', (event, data) => callback(data));
  }
});
