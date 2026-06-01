const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('audioAPI', {
  selectWavFile: () => ipcRenderer.invoke('select-wav-file'),
  processAudio: (wavData, bitrate) => ipcRenderer.invoke('process-audio', wavData, bitrate),
  processAudioMultiBitrate: (wavData, bitrates) => ipcRenderer.invoke('process-audio-multi-bitrate', wavData, bitrates),
  processAudioChunk: (chunkData, sampleRate, bitrate, numChannels) => ipcRenderer.invoke('process-audio-chunk', chunkData, sampleRate, bitrate, numChannels)
});
