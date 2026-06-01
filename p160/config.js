const path = require('path');
const os = require('os');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const config = {
  server: {
    port: 8080,
    host: getLocalIP(),
    friendlyName: 'Node.js DLNA Media Server',
    manufacturer: 'Node.js DLNA',
    modelName: 'MediaServer',
    modelNumber: '1.0',
    uuid: 'MediaServer-1234-5678-9abc-def012345678'
  },
  media: {
    scanPaths: [
      path.join(os.homedir(), 'Movies'),
      path.join(os.homedir(), 'Music'),
      path.join(os.homedir(), 'Pictures')
    ],
    scanInterval: 30000,
    watchForChanges: true,
    extensions: {
      video: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.m4v', '.webm', '.mpeg', '.mpg'],
      audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus'],
      image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp']
    }
  },
  dlna: {
    ssdpPort: 1900,
    maxAge: 1800
  },
  transcoding: {
    enabled: true,
    ffmpegPath: 'ffmpeg',
    flacToLPCM: {
      sampleRate: 44100,
      channels: 2,
      bitDepth: 16
    }
  },
  subtitles: {
    enabled: true,
    supportedFormats: ['.srt'],
    autoDetect: true
  }
};

module.exports = config;
