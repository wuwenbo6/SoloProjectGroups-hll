const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const BandwidthProbe = require('./bandwidth-probe');
const svcEncoder = require('./svc-encoder');
const db = require('./database');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

new BandwidthProbe(server);

app.get('/api/videos', async (req, res) => {
  try {
    const videos = await svcEncoder.getAllVideos();
    res.json(videos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/videos/:id', async (req, res) => {
  try {
    const videoId = req.params.id;
    const info = await svcEncoder.getVideoInfo(videoId);
    const layers = await svcEncoder.getVideoLayers(videoId);
    res.json({ info, layers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/videos/:id/layers', async (req, res) => {
  try {
    const videoId = req.params.id;
    const layers = await svcEncoder.getVideoLayers(videoId);
    res.json(layers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await svcEncoder.encodeSVC(req.file.path, req.file.originalname);
    res.json({
      success: true,
      videoId: result.videoId,
      layers: result.layers
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/videos/:id/layers/:layerIndex/stream', async (req, res) => {
  try {
    const videoId = req.params.id;
    const layerIndex = parseInt(req.params.layerIndex);
    
    const layerPath = await svcEncoder.getLayerPath(videoId, layerIndex);
    
    if (!layerPath || !fs.existsSync(layerPath)) {
      return res.status(404).json({ error: 'Layer not found' });
    }

    const stat = fs.statSync(layerPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      const file = fs.createReadStream(layerPath, { start, end });
      
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4'
      };
      
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4'
      };
      res.writeHead(200, head);
      fs.createReadStream(layerPath).pipe(res);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/videos/:id/hls/master.m3u8', async (req, res) => {
  try {
    const videoId = req.params.id;
    const masterPath = svcEncoder.getMasterPlaylistPath(videoId);
    
    if (!fs.existsSync(masterPath)) {
      return res.status(404).json({ error: 'HLS playlist not found' });
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    fs.createReadStream(masterPath).pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/videos/:id/hls/layer_:layerIndex/playlist.m3u8', async (req, res) => {
  try {
    const videoId = req.params.id;
    const layerIndex = parseInt(req.params.layerIndex);
    const playlistPath = svcEncoder.getLayerPlaylistPath(videoId, layerIndex);
    
    if (!fs.existsSync(playlistPath)) {
      return res.status(404).json({ error: 'Layer playlist not found' });
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    fs.createReadStream(playlistPath).pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/videos/:id/hls/layer_:layerIndex/segment_:segmentId.ts', async (req, res) => {
  try {
    const videoId = req.params.id;
    const layerIndex = parseInt(req.params.layerIndex);
    const segmentId = req.params.segmentId;
    const segmentName = `segment_${segmentId.padStart(3, '0')}.ts`;
    const segmentPath = svcEncoder.getSegmentPath(videoId, layerIndex, segmentName);
    
    if (!fs.existsSync(segmentPath)) {
      return res.status(404).json({ error: 'Segment not found' });
    }

    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    fs.createReadStream(segmentPath).pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bandwidth/history', async (req, res) => {
  try {
    const logs = await db.all('SELECT * FROM bandwidth_logs ORDER BY timestamp DESC LIMIT 50');
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`SVC Video Streaming Server running on http://localhost:${PORT}`);
  console.log(`WebSocket bandwidth probe available at ws://localhost:${PORT}/ws/bandwidth`);
});
