const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const db = require('./database');

class SVCEncoder {
  constructor() {
    this.videosDir = path.join(__dirname, 'videos');
    this.ensureDir(this.videosDir);
    this.GOP_SIZE = 60;
    this.BASE_FPS = 30;
    this.SEGMENT_DURATION = 2;
  }

  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async encodeSVC(inputPath, originalName) {
    const videoId = await this.insertVideoRecord(originalName, inputPath);
    const outputDir = path.join(this.videosDir, videoId.toString());
    this.ensureDir(outputDir);

    const layers = [
      { type: 'base', index: 0, bitrate: 500, width: 640, height: 360, fps: this.BASE_FPS },
      { type: 'enhancement', index: 1, bitrate: 1000, width: 854, height: 480, fps: this.BASE_FPS },
      { type: 'enhancement', index: 2, bitrate: 2000, width: 1280, height: 720, fps: this.BASE_FPS }
    ];

    const encodePromises = layers.map((layer, idx) => 
      this.encodeHLS(inputPath, outputDir, videoId, layer, idx)
    );

    await Promise.all(encodePromises);
    
    this.generateMasterPlaylist(outputDir, layers);
    
    await this.updateVideoDuration(inputPath, videoId);
    
    return { videoId, layers };
  }

  async insertVideoRecord(originalName, filePath) {
    const result = await db.run(
      'INSERT INTO videos (original_name, file_path) VALUES (?, ?)',
      [originalName, filePath]
    );
    return result.lastID;
  }

  async updateVideoDuration(inputPath, videoId) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, async (err, metadata) => {
        if (!err && metadata.format) {
          const duration = metadata.format.duration;
          const videoStream = metadata.streams.find(s => s.codec_type === 'video');
          await db.run(
            'UPDATE videos SET duration = ?, width = ?, height = ? WHERE id = ?',
            [duration, videoStream?.width, videoStream?.height, videoId]
          );
        }
        resolve();
      });
    });
  }

  encodeHLS(inputPath, outputDir, videoId, layer, idx) {
    return new Promise((resolve, reject) => {
      const layerDir = path.join(outputDir, `layer_${layer.index}`);
      this.ensureDir(layerDir);

      const playlistPath = path.join(layerDir, 'playlist.m3u8');
      const segmentPattern = path.join(layerDir, 'segment_%03d.ts');

      const command = ffmpeg(inputPath)
        .output(playlistPath)
        .videoCodec('libx264')
        .size(`${layer.width}x${layer.height}`)
        .videoBitrate(`${layer.bitrate}k`)
        .fps(layer.fps)
        .audioCodec('aac')
        .audioBitrate('64k')
        .audioChannels(2)
        .outputOptions([
          '-profile:v baseline',
          '-level 3.1',
          `-g ${this.GOP_SIZE}`,
          `-keyint_min ${this.GOP_SIZE}`,
          '-sc_threshold 0',
          '-force_key_frames expr:gte(t,n_forced*' + this.SEGMENT_DURATION + ')',
          '-x264opts keyint=' + this.GOP_SIZE + ':min-keyint=' + this.GOP_SIZE + ':scenecut=0:no-scenecut',
          '-bf 0',
          '-refs 3',
          '-pix_fmt yuv420p',
          '-f hls',
          '-hls_time ' + this.SEGMENT_DURATION,
          '-hls_list_size 0',
          '-hls_segment_filename ' + segmentPattern,
          '-hls_flags independent_segments',
          '-hls_playlist_type vod',
          '-hls_base_url '
        ]);

      command.on('end', async () => {
        await this.insertEncodingParam(videoId, layer, layerDir);
        console.log(`HLS encoding complete for layer ${layer.index}`);
        resolve();
      });

      command.on('error', (err) => {
        console.error(`Error encoding HLS layer ${layer.index}:`, err);
        reject(err);
      });

      command.run();
    });
  }

  generateMasterPlaylist(outputDir, layers) {
    const masterPath = path.join(outputDir, 'master.m3u8');
    
    let content = '#EXTM3U\n';
    content += '#EXT-X-VERSION:6\n';
    content += '#EXT-X-INDEPENDENT-SEGMENTS\n\n';

    layers.forEach((layer, idx) => {
      const bandwidth = layer.bitrate * 1000;
      content += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${layer.width}x${layer.height},CODECS="avc1.42E01E,mp4a.40.2"\n`;
      content += `layer_${layer.index}/playlist.m3u8\n\n`;
    });

    fs.writeFileSync(masterPath, content);
    console.log('Master playlist generated:', masterPath);
  }

  async insertEncodingParam(videoId, layer, filePath) {
    await db.run(`
      INSERT INTO encoding_params 
      (video_id, layer_type, layer_index, bitrate, width, height, fps, file_path, format)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      videoId,
      layer.type,
      layer.index,
      layer.bitrate,
      layer.width,
      layer.height,
      layer.fps,
      filePath,
      'hls'
    ]);
  }

  async getVideoLayers(videoId) {
    return await db.all(
      'SELECT * FROM encoding_params WHERE video_id = ? ORDER BY layer_index',
      [videoId]
    );
  }

  async getVideoInfo(videoId) {
    return await db.get('SELECT * FROM videos WHERE id = ?', [videoId]);
  }

  async getAllVideos() {
    return await db.all('SELECT * FROM videos ORDER BY created_at DESC');
  }

  getMasterPlaylistPath(videoId) {
    return path.join(this.videosDir, videoId.toString(), 'master.m3u8');
  }

  getLayerPlaylistPath(videoId, layerIndex) {
    return path.join(this.videosDir, videoId.toString(), `layer_${layerIndex}`, 'playlist.m3u8');
  }

  getSegmentPath(videoId, layerIndex, segmentName) {
    return path.join(this.videosDir, videoId.toString(), `layer_${layerIndex}`, segmentName);
  }
}

module.exports = new SVCEncoder();
