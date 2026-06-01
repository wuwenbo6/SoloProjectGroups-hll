const express = require('express');
const cors = require('cors');
const NodeMediaServer = require('node-media-server');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const db = require('./database');
const transcoder = require('./transcoder');
const adManager = require('./adManager');

db.initDB();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/streams', express.static(config.dash.outputDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mpd')) {
      res.setHeader('Content-Type', 'application/dash+xml');
      res.setHeader('Cache-Control', 'no-cache');
    } else if (filePath.endsWith('.m4s')) {
      res.setHeader('Content-Type', 'video/iso.segment');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

app.get('/api/streams', (req, res) => {
  const streams = transcoder.getAllSessions();
  res.json(streams);
});

app.get('/api/streams/active', (req, res) => {
  const sessions = db.getActiveSessions();
  res.json(sessions);
});

app.get('/api/streams/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const sessions = db.getSessionHistory(limit);
  res.json(sessions);
});

app.get('/api/streams/:sessionId', (req, res) => {
  const session = db.getSessionById(req.params.sessionId);
  if (session) {
    res.json(session);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

app.post('/api/viewer/join', (req, res) => {
  const { sessionId } = req.body;
  const viewerId = uuidv4();
  const clientIp = req.ip;
  const userAgent = req.get('User-Agent');
  
  db.createViewerSession(sessionId, viewerId, clientIp, userAgent);
  
  res.json({
    viewerId,
    sessionId,
    mpdUrl: `/streams/${sessionId}/stream.mpd`
  });
});

app.post('/api/viewer/quality', (req, res) => {
  const { viewerId, quality } = req.body;
  db.updateViewerQuality(viewerId, quality);
  res.json({ success: true });
});

app.post('/api/viewer/leave', (req, res) => {
  const { viewerId } = req.body;
  db.endViewerSession(viewerId);
  res.json({ success: true });
});

app.get('/api/stats/viewers/:sessionId', (req, res) => {
  const count = db.getViewerCount(req.params.sessionId);
  res.json({ viewerCount: count });
});

app.get('/api/config', (req, res) => {
  res.json({
    llDashEnabled: config.dash.llDashEnabled,
    targetLatency: config.dash.targetLatency,
    minBufferTime: config.dash.minBufferTime,
    segmentDuration: config.dash.segmentDuration,
    adsEnabled: config.ads.enabled,
    adInterval: config.ads.defaultInterval,
    adDuration: config.ads.defaultDuration
  });
});

app.get('/api/streams/:sessionId/stats', (req, res) => {
  const stats = db.getStreamStatistics(req.params.sessionId);
  if (stats) {
    res.json(stats);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

app.get('/api/streams/:sessionId/export/csv', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = db.getSessionById(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const csv = db.exportSessionStatsCSV(sessionId);
  const filename = `stream_stats_${sessionId}_${Date.now()}.csv`;
  
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
  
  db.recordPlaybackEvent(sessionId, null, 'stats_export_csv', { filename });
});

app.get('/api/streams/:sessionId/export/json', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = db.getSessionById(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const json = db.exportSessionStatsJSON(sessionId);
  const filename = `stream_stats_${sessionId}_${Date.now()}.json`;
  
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(json);
  
  db.recordPlaybackEvent(sessionId, null, 'stats_export_json', { filename });
});

app.get('/api/streams/summary', (req, res) => {
  const summary = db.getAllStreamsSummary();
  res.json(summary);
});

app.get('/api/ads/:sessionId', (req, res) => {
  const ads = adManager.getSessionAds(req.params.sessionId);
  if (ads) {
    res.json(ads);
  } else {
    const scheduled = adManager.getScheduledAds(req.params.sessionId);
    res.json({ sessionId: req.params.sessionId, adsInserted: scheduled.length, ads: scheduled });
  }
});

app.get('/api/ads/:sessionId/scheduled', (req, res) => {
  const ads = adManager.getScheduledAds(req.params.sessionId);
  res.json(ads);
});

app.post('/api/ads/:sessionId/insert', (req, res) => {
  const { sessionId } = req.params;
  const { adUrl, duration, positionSeconds } = req.body;
  
  if (!adUrl || !duration) {
    return res.status(400).json({ error: 'adUrl and duration are required' });
  }
  
  const session = db.getSessionById(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  let position;
  if (positionSeconds !== undefined) {
    position = positionSeconds;
  } else {
    const adSession = adManager.getSessionAds(sessionId);
    position = adSession ? adSession.nextAdPosition : config.ads.defaultInterval;
  }
  
  const ad = adManager.insertAdAtPosition(sessionId, adUrl, duration, position);
  res.json(ad);
});

app.post('/api/ads/playback/start', (req, res) => {
  const { adId, viewerId, sessionId } = req.body;
  adManager.recordAdPlayback(adId, viewerId, sessionId);
  res.json({ success: true });
});

app.post('/api/ads/playback/complete', (req, res) => {
  const { adId, viewerId, completionPercentage, clicked } = req.body;
  adManager.completeAdPlayback(adId, viewerId, completionPercentage || 100, clicked || false);
  res.json({ success: true });
});

app.get('/api/ads/active', (req, res) => {
  const sessions = adManager.getAllActiveSessions();
  res.json(sessions);
});

app.post('/api/events/record', (req, res) => {
  const { sessionId, viewerId, eventType, eventData } = req.body;
  
  if (!sessionId || !eventType) {
    return res.status(400).json({ error: 'sessionId and eventType are required' });
  }
  
  db.recordPlaybackEvent(sessionId, viewerId, eventType, eventData);
  res.json({ success: true });
});

app.post('/api/viewer/watchtime', (req, res) => {
  const { viewerId, seconds } = req.body;
  if (!viewerId || !seconds) {
    return res.status(400).json({ error: 'viewerId and seconds are required' });
  }
  db.updateViewerWatchTime(viewerId, seconds);
  res.json({ success: true });
});

const nmsConfig = {
  rtmp: config.rtmp,
  http: config.http
};

const nms = new NodeMediaServer(nmsConfig);

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  const session = nms.getSession(id);
  if (!session) {
    return;
  }
  const streamKey = StreamPath.split('/').pop();
  console.log(`Stream incoming: ${streamKey}`);
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  
  const session = nms.getSession(id);
  if (!session) {
    return;
  }
  
  const streamKey = StreamPath.split('/').pop();
  const sessionId = streamKey;
  const clientIp = session.ip;
  const startTime = Date.now();
  
  const rtmpUrl = `rtmp://127.0.0.1:${config.rtmp.port}/live/${streamKey}`;
  
  console.log(`Starting transcoding session for stream: ${streamKey}, session: ${sessionId}`);
  
  const transcodeSession = transcoder.createSession(streamKey, sessionId, rtmpUrl, clientIp);
  
  transcodeSession.start()
    .then(() => {
      console.log(`Transcoding started successfully for ${sessionId}`);
      
      if (config.ads.enabled) {
        adManager.startAdScheduler(sessionId, startTime);
        console.log(`Ad scheduler started for ${sessionId}, interval: ${config.ads.defaultInterval}s`);
      }
      
      db.recordPlaybackEvent(sessionId, null, 'stream_start', {
        streamKey,
        clientIp,
        llDashEnabled: config.dash.llDashEnabled
      });
    })
    .catch(err => {
      console.error(`Failed to start transcoding for ${sessionId}:`, err);
    });
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
  
  const streamKey = StreamPath.split('/').pop();
  const sessionId = streamKey;
  
  console.log(`Stream ended: ${streamKey}, stopping transcoding`);
  
  adManager.stopAdScheduler(sessionId);
  transcoder.removeSession(sessionId);
  
  db.recordPlaybackEvent(sessionId, null, 'stream_end', { streamKey });
});

process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  
  const sessions = transcoder.getAllSessions();
  for (const session of sessions) {
    adManager.stopAdScheduler(session.sessionId);
    await transcoder.removeSession(session.sessionId);
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nSIGTERM received, shutting down...');
  
  const sessions = transcoder.getAllSessions();
  for (const session of sessions) {
    adManager.stopAdScheduler(session.sessionId);
    await transcoder.removeSession(session.sessionId);
  }
  
  process.exit(0);
});

nms.run();

const HTTP_PORT = process.env.HTTP_PORT || 3000;
app.listen(HTTP_PORT, () => {
  console.log(`\n=== DASH Streaming Server ===`);
  console.log(`RTMP Server:  rtmp://localhost:${config.rtmp.port}/live`);
  console.log(`HTTP Server:  http://localhost:${HTTP_PORT}`);
  console.log(`DASH Streams: http://localhost:${HTTP_PORT}/streams/<sessionId>/stream.mpd`);
  console.log(`API:          http://localhost:${HTTP_PORT}/api`);
  console.log(`Player:       http://localhost:${HTTP_PORT}`);
  console.log(`\nPush RTMP stream to: rtmp://localhost:${config.rtmp.port}/live/<stream-key>`);
  console.log(`Then play at: http://localhost:${HTTP_PORT}?s=<stream-key>`);
});

module.exports = app;
