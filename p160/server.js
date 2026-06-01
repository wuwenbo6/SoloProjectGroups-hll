const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const config = require('./config');
const MediaScanner = require('./src/mediaScanner');
const DLNAServer = require('./src/dlnaServer');
const transcoder = require('./src/transcoder');
const subtitleService = require('./src/subtitleService');

const app = express();
const mediaScanner = new MediaScanner();
const dlnaServer = new DLNAServer(mediaScanner);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/device.xml', (req, res) => {
  const xml = dlnaServer.createDeviceDescriptionXML();
  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

app.get('/ContentDirectory.xml', (req, res) => {
  const xml = dlnaServer.createServiceDescriptionXML();
  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

app.post('/control/ContentDirectory', express.text({ type: 'text/xml' }), (req, res) => {
  const soapAction = req.headers['soapaction'];
  const body = req.body;

  const result = dlnaServer.handleSOAPAction(soapAction, body);
  
  if (result) {
    const match = soapAction.match(/\"([^\"]+)#([^\"]+)\"/);
    const [, serviceType, actionName] = match;
    
    const response = dlnaServer.createSOAPResponse(serviceType, actionName, result);
    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.send(response);
  } else {
    res.status(500).send('SOAP action not handled');
  }
});

app.get('/api/media', (req, res) => {
  const { type, search, page = 1, limit = 50 } = req.query;
  let files = mediaScanner.getAllMedia(type && type !== 'all' ? type : null);

  if (search) {
    const searchLower = search.toLowerCase();
    files = files.filter(f => 
      f.name.toLowerCase().includes(searchLower) ||
      f.title.toLowerCase().includes(searchLower)
    );
  }

  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + parseInt(limit);
  const pagedFiles = files.slice(startIndex, endIndex);

  res.json({
    data: pagedFiles,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: files.length,
      pages: Math.ceil(files.length / limit)
    }
  });
});

app.get('/api/media/:id', (req, res) => {
  const file = mediaScanner.getById(req.params.id);
  if (file) {
    res.json(file);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.get('/api/stats', (req, res) => {
  res.json(mediaScanner.getStats());
});

app.get('/api/scan', async (req, res) => {
  try {
    const files = await mediaScanner.scan();
    res.json({ 
      success: true, 
      count: files.length,
      stats: mediaScanner.getStats()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    serverName: config.server.friendlyName,
    host: config.server.host,
    port: config.server.port,
    scanPaths: config.media.scanPaths
  });
});

app.get('/stream/:id', async (req, res) => {
  const file = mediaScanner.getById(req.params.id);
  
  if (!file) {
    return res.status(404).send('File not found');
  }

  if (!fs.existsSync(file.path)) {
    return res.status(404).send('File not found on disk');
  }

  const transcode = req.query.transcode === 'lpcm' && file.extension === 'flac';
  
  if (transcode) {
    try {
      const ffmpegAvailable = await transcoder.isAvailable();
      if (!ffmpegAvailable) {
        console.log('FFmpeg not available, falling back to direct stream');
      } else {
        console.log(`Transcoding FLAC to LPCM: ${file.name}`);
        const headers = transcoder.getLPCMHeaders();
        
        res.writeHead(200, headers);
        const transcodeStream = transcoder.transcodeFLACToLPCM(file.path);
        transcodeStream.pipe(res);
        
        req.on('close', () => {
          transcodeStream.destroy();
        });
        return;
      }
    } catch (err) {
      console.error('Transcoding error:', err);
    }
  }

  const stat = fs.statSync(file.path);
  const mimeType = mime.lookup(file.extension) || 'application/octet-stream';

  const range = req.headers.range;
  
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunksize = (end - start) + 1;

    const fileStream = fs.createReadStream(file.path, { start, end });
    
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType,
      'transferMode.dlna.org': 'Streaming',
      'contentFeatures.dlna.org': dlnaServer.getDLNAProfile(mimeType)
    });

    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'transferMode.dlna.org': 'Streaming',
      'contentFeatures.dlna.org': dlnaServer.getDLNAProfile(mimeType)
    });

    fs.createReadStream(file.path).pipe(res);
  }
});

app.get('/api/media/:id/subtitles', (req, res) => {
  const file = mediaScanner.getById(req.params.id);
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (file.type !== 'video') {
    return res.json({ subtitles: null });
  }

  const subtitleData = subtitleService.getSubtitles(file.path);
  
  if (subtitleData) {
    res.json({
      hasSubtitles: true,
      name: subtitleData.name,
      language: subtitleData.language,
      count: subtitleData.subtitles.length,
      subtitles: subtitleData.subtitles
    });
  } else {
    res.json({ hasSubtitles: false });
  }
});

app.get('/api/media/:id/subtitles/srt', (req, res) => {
  const file = mediaScanner.getById(req.params.id);
  
  if (!file) {
    return res.status(404).send('File not found');
  }

  if (file.type !== 'video') {
    return res.status(404).send('No subtitles available');
  }

  const subtitleData = subtitleService.getSubtitles(file.path);
  
  if (subtitleData) {
    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${subtitleData.name}"`);
    res.send(subtitleService.toSRTFormat(subtitleData.subtitles));
  } else {
    res.status(404).send('No subtitles found');
  }
});

app.get('/api/media/:id/subtitles/vtt', (req, res) => {
  const file = mediaScanner.getById(req.params.id);
  
  if (!file) {
    return res.status(404).send('File not found');
  }

  if (file.type !== 'video') {
    return res.status(404).send('No subtitles available');
  }

  const subtitleData = subtitleService.getSubtitles(file.path);
  
  if (subtitleData) {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.send(subtitleService.convertToWebVTT(subtitleData.subtitles));
  } else {
    res.status(404).send('No subtitles found');
  }
});

app.get('/transcode/:id/lpcm', async (req, res) => {
  const file = mediaScanner.getById(req.params.id);
  
  if (!file) {
    return res.status(404).send('File not found');
  }

  if (file.extension !== 'flac') {
    return res.status(400).send('Only FLAC files can be transcoded to LPCM');
  }

  if (!fs.existsSync(file.path)) {
    return res.status(404).send('File not found on disk');
  }

  try {
    const ffmpegAvailable = await transcoder.isAvailable();
    if (!ffmpegAvailable) {
      return res.status(503).send('FFmpeg is not available for transcoding');
    }

    console.log(`Transcoding FLAC to LPCM: ${file.name}`);
    const headers = transcoder.getLPCMHeaders();
    res.writeHead(200, headers);
    
    const transcodeStream = transcoder.transcodeFLACToLPCM(file.path);
    transcodeStream.pipe(res);
    
    req.on('close', () => {
      transcodeStream.destroy();
    });
  } catch (err) {
    console.error('Transcoding error:', err);
    res.status(500).send('Transcoding failed');
  }
});

app.get('/api/transcode/status', async (req, res) => {
  const available = await transcoder.isAvailable();
  res.json({
    ffmpegAvailable: available,
    supportedConversions: [
      { from: 'flac', to: 'lpcm', description: 'FLAC to LPCM (PCM 16-bit Big Endian)' }
    ]
  });
});

app.get('/thumbnail/:id', (req, res) => {
  const file = mediaScanner.getById(req.params.id);
  
  if (!file) {
    return res.status(404).sendFile(path.join(__dirname, 'public', 'images', 'placeholder.svg'));
  }

  if (file.type === 'image' && fs.existsSync(file.path)) {
    res.sendFile(file.path);
  } else {
    const placeholder = path.join(__dirname, 'public', 'images', `${file.type}.svg`);
    if (fs.existsSync(placeholder)) {
      res.sendFile(placeholder);
    } else {
      res.sendFile(path.join(__dirname, 'public', 'images', 'placeholder.svg'));
    }
  }
});

app.get('/icon.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'images', 'icon.png'));
});

async function startServer() {
  try {
    console.log('Starting DLNA Media Server...');
    console.log('Server URL:', `http://${config.server.host}:${config.server.port}`);
    
    await mediaScanner.scan();
    mediaScanner.startWatching();
    
    setInterval(() => {
      mediaScanner.scan();
    }, config.media.scanInterval);
    
    await dlnaServer.start();
    
    app.listen(config.server.port, config.server.host, () => {
      console.log(`Web server running on http://${config.server.host}:${config.server.port}`);
      console.log('DLNA Media Server is ready!');
      console.log('Stats:', mediaScanner.getStats());
    });
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await dlnaServer.stop();
  mediaScanner.stopWatching();
  process.exit(0);
});

startServer();
