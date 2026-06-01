const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanJpegs: (folderPath) => ipcRenderer.invoke('scan-jpegs', folderPath),
  getImageData: (imagePath) => ipcRenderer.invoke('get-image-data', imagePath),
  getImageDimensions: (imagePath) => ipcRenderer.invoke('get-image-dimensions', imagePath),
  selectOutput: () => ipcRenderer.invoke('select-output'),
  encodeVideo: (options) => ipcRenderer.invoke('encode-video', options),
  cancelEncode: () => ipcRenderer.invoke('cancel-encode'),
  onEncodeProgress: (callback) => {
    ipcRenderer.on('encode-progress', (_, percent) => callback(percent))
  }
})
