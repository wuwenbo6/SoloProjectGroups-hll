const path = require('path');

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*'
  },
  dash: {
    outputDir: path.join(__dirname, '../streams'),
    segmentDuration: 1,
    windowSize: 15,
    extraWindowSize: 5,
    llDashEnabled: true,
    llDashChunkDuration: 200,
    targetLatency: 2.5,
    minBufferTime: 0.5
  },
  transcoding: {
    profiles: [
      {
        name: '1080p',
        bitrate: '4000k',
        resolution: '1920x1080',
        audioBitrate: '128k'
      },
      {
        name: '720p',
        bitrate: '2500k',
        resolution: '1280x720',
        audioBitrate: '96k'
      },
      {
        name: '480p',
        bitrate: '1500k',
        resolution: '854x480',
        audioBitrate: '64k'
      },
      {
        name: '360p',
        bitrate: '800k',
        resolution: '640x360',
        audioBitrate: '48k'
      }
    ]
  },
  ads: {
    enabled: true,
    defaultInterval: 300,
    defaultDuration: 15,
    adBreakMargin: 2,
    adsFolder: path.join(__dirname, '../ads')
  },
  database: {
    path: path.join(__dirname, '../data/streams.db')
  }
};

module.exports = config;
