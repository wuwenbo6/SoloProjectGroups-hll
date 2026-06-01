const Database = require('better-sqlite3');
const config = require('./config');

let db;

function initDB() {
  db = new Database(config.database.path);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS stream_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stream_key TEXT NOT NULL,
      session_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'live',
      start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      client_ip TEXT,
      total_bytes INTEGER DEFAULT 0,
      ll_dash_enabled INTEGER DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_stream_key ON stream_sessions(stream_key);
    CREATE INDEX IF NOT EXISTS idx_session_id ON stream_sessions(session_id);
    CREATE INDEX IF NOT EXISTS idx_status ON stream_sessions(status);

    CREATE TABLE IF NOT EXISTS viewer_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      quality TEXT,
      join_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      leave_time DATETIME,
      client_ip TEXT,
      user_agent TEXT,
      total_watch_seconds INTEGER DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_viewer_session ON viewer_sessions(session_id);
    CREATE INDEX IF NOT EXISTS idx_viewer_id ON viewer_sessions(viewer_id);

    CREATE TABLE IF NOT EXISTS quality_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      quality TEXT NOT NULL,
      bitrate TEXT,
      resolution TEXT,
      bytes_sent INTEGER DEFAULT 0,
      duration_seconds INTEGER DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ad_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      ad_id TEXT NOT NULL,
      ad_url TEXT NOT NULL,
      ad_duration INTEGER NOT NULL,
      insert_time DATETIME NOT NULL,
      position_seconds INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      scte35_marker TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_ad_session ON ad_schedule(session_id);
    CREATE INDEX IF NOT EXISTS idx_ad_status ON ad_schedule(status);

    CREATE TABLE IF NOT EXISTS ad_playback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ad_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      completion_percentage INTEGER DEFAULT 0,
      clicked INTEGER DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_ad_playback_ad ON ad_playback(ad_id);
    CREATE INDEX IF NOT EXISTS idx_ad_playback_viewer ON ad_playback(viewer_id);
    CREATE INDEX IF NOT EXISTS idx_ad_playback_session ON ad_playback(session_id);

    CREATE TABLE IF NOT EXISTS playback_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      viewer_id TEXT,
      event_type TEXT NOT NULL,
      event_data TEXT,
      timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_event_session ON playback_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_event_type ON playback_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_event_timestamp ON playback_events(timestamp);
  `);
  
  console.log('Database initialized with LL-DASH, ads and statistics support');
  return db;
}

function createStreamSession(streamKey, sessionId, clientIp) {
  const stmt = db.prepare(`
    INSERT INTO stream_sessions (stream_key, session_id, status, start_time, client_ip)
    VALUES (?, ?, 'live', CURRENT_TIMESTAMP, ?)
  `);
  return stmt.run(streamKey, sessionId, clientIp);
}

function endStreamSession(sessionId) {
  const stmt = db.prepare(`
    UPDATE stream_sessions 
    SET status = 'ended', end_time = CURRENT_TIMESTAMP 
    WHERE session_id = ?
  `);
  return stmt.run(sessionId);
}

function updateStreamBytes(sessionId, bytes) {
  const stmt = db.prepare(`
    UPDATE stream_sessions 
    SET total_bytes = total_bytes + ? 
    WHERE session_id = ?
  `);
  return stmt.run(bytes, sessionId);
}

function getActiveSessions() {
  const stmt = db.prepare(`
    SELECT * FROM stream_sessions WHERE status = 'live' ORDER BY start_time DESC
  `);
  return stmt.all();
}

function getSessionById(sessionId) {
  const stmt = db.prepare(`
    SELECT * FROM stream_sessions WHERE session_id = ?
  `);
  return stmt.get(sessionId);
}

function getSessionHistory(limit = 50) {
  const stmt = db.prepare(`
    SELECT * FROM stream_sessions ORDER BY start_time DESC LIMIT ?
  `);
  return stmt.all(limit);
}

function createViewerSession(sessionId, viewerId, clientIp, userAgent) {
  const stmt = db.prepare(`
    INSERT INTO viewer_sessions (session_id, viewer_id, join_time, client_ip, user_agent)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)
  `);
  return stmt.run(sessionId, viewerId, clientIp, userAgent);
}

function updateViewerQuality(viewerId, quality) {
  const stmt = db.prepare(`
    UPDATE viewer_sessions 
    SET quality = ? 
    WHERE viewer_id = ? AND leave_time IS NULL
  `);
  return stmt.run(quality, viewerId);
}

function endViewerSession(viewerId) {
  const stmt = db.prepare(`
    UPDATE viewer_sessions 
    SET leave_time = CURRENT_TIMESTAMP 
    WHERE viewer_id = ? AND leave_time IS NULL
  `);
  return stmt.run(viewerId);
}

function recordQualityStats(sessionId, quality, bitrate, resolution, bytes) {
  const stmt = db.prepare(`
    INSERT INTO quality_stats (session_id, quality, bitrate, resolution, bytes_sent)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(sessionId, quality, bitrate, resolution, bytes);
}

function getViewerCount(sessionId) {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM viewer_sessions WHERE session_id = ? AND leave_time IS NULL
  `);
  return stmt.get(sessionId).count;
}

function updateViewerWatchTime(viewerId, seconds) {
  const stmt = db.prepare(`
    UPDATE viewer_sessions 
    SET total_watch_seconds = total_watch_seconds + ? 
    WHERE viewer_id = ?
  `);
  return stmt.run(seconds, viewerId);
}

function scheduleAd(sessionId, adId, adUrl, adDuration, positionSeconds) {
  const scte35Marker = `/DAl${Date.now()}`;
  const stmt = db.prepare(`
    INSERT INTO ad_schedule (session_id, ad_id, ad_url, ad_duration, insert_time, position_seconds, scte35_marker)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
  `);
  return stmt.run(sessionId, adId, adUrl, adDuration, positionSeconds, scte35Marker);
}

function getScheduledAds(sessionId) {
  const stmt = db.prepare(`
    SELECT * FROM ad_schedule 
    WHERE session_id = ? AND status = 'scheduled' 
    ORDER BY position_seconds ASC
  `);
  return stmt.all(sessionId);
}

function updateAdStatus(adId, status) {
  const stmt = db.prepare(`
    UPDATE ad_schedule SET status = ? WHERE ad_id = ?
  `);
  return stmt.run(status, adId);
}

function recordAdPlayback(adId, viewerId, sessionId) {
  const stmt = db.prepare(`
    INSERT INTO ad_playback (ad_id, viewer_id, session_id, start_time)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `);
  return stmt.run(adId, viewerId, sessionId);
}

function updateAdPlaybackCompletion(adId, viewerId, completionPercentage, clicked = false) {
  const stmt = db.prepare(`
    UPDATE ad_playback 
    SET completion_percentage = ?, clicked = clicked | ?, end_time = CURRENT_TIMESTAMP
    WHERE ad_id = ? AND viewer_id = ? AND end_time IS NULL
  `);
  return stmt.run(completionPercentage, clicked ? 1 : 0, adId, viewerId);
}

function recordPlaybackEvent(sessionId, viewerId, eventType, eventData = null) {
  const stmt = db.prepare(`
    INSERT INTO playback_events (session_id, viewer_id, event_type, event_data)
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(sessionId, viewerId, eventType, eventData ? JSON.stringify(eventData) : null);
}

function getStreamStatistics(sessionId) {
  const stats = {};
  
  const session = getSessionById(sessionId);
  stats.session = session;
  
  const viewerStmt = db.prepare(`
    SELECT 
      COUNT(*) as total_viewers,
      AVG(total_watch_seconds) as avg_watch_time
    FROM viewer_sessions 
    WHERE session_id = ?
  `);
  const viewerStats = viewerStmt.get(sessionId);
  stats.viewers = viewerStats;
  
  const qualityStmt = db.prepare(`
    SELECT 
      quality,
      COUNT(*) as switch_count,
      SUM(bytes_sent) as total_bytes
    FROM quality_stats 
    WHERE session_id = ?
    GROUP BY quality
  `);
  stats.qualityDistribution = qualityStmt.all(sessionId);
  
  const adStmt = db.prepare(`
    SELECT 
      a.ad_id,
      a.ad_url,
      COUNT(p.id) as impressions,
      AVG(p.completion_percentage) as avg_completion,
      SUM(p.clicked) as clicks
    FROM ad_schedule a
    LEFT JOIN ad_playback p ON a.ad_id = p.ad_id
    WHERE a.session_id = ?
    GROUP BY a.ad_id
  `);
  stats.adPerformance = adStmt.all(sessionId);
  
  const eventStmt = db.prepare(`
    SELECT 
      event_type,
      COUNT(*) as count
    FROM playback_events 
    WHERE session_id = ?
    GROUP BY event_type
  `);
  stats.events = eventStmt.all(sessionId);
  
  return stats;
}

function exportSessionStatsCSV(sessionId) {
  const stats = getStreamStatistics(sessionId);
  
  let csv = '\ufeff';
  csv += '=== 直播会话统计 ===\n';
  csv += '会话ID,流密钥,状态,开始时间,结束时间,总字节数,LL-DASH\n';
  csv += `${stats.session?.session_id},${stats.session?.stream_key},${stats.session?.status},${stats.session?.start_time},${stats.session?.end_time || '-'},${stats.session?.total_bytes},${stats.session?.ll_dash_enabled ? '是' : '否'}\n\n`;
  
  csv += '=== 观看者统计 ===\n';
  csv += '总观看人次,平均观看时长(秒)\n';
  csv += `${stats.viewers?.total_viewers || 0},${(stats.viewers?.avg_watch_time || 0).toFixed(1)}\n\n`;
  
  csv += '=== 画质分布 ===\n';
  csv += '画质,切换次数,总字节数\n';
  stats.qualityDistribution?.forEach(q => {
    csv += `${q.quality},${q.switch_count},${q.total_bytes}\n`;
  });
  csv += '\n';
  
  csv += '=== 广告表现 ===\n';
  csv += '广告ID,广告URL,曝光数,平均完成率(%),点击数\n';
  stats.adPerformance?.forEach(a => {
    csv += `${a.ad_id},${a.ad_url},${a.impressions},${(a.avg_completion || 0).toFixed(1)},${a.clicks || 0}\n`;
  });
  csv += '\n';
  
  csv += '=== 播放事件 ===\n';
  csv += '事件类型,次数\n';
  stats.events?.forEach(e => {
    csv += `${e.event_type},${e.count}\n`;
  });
  
  return csv;
}

function exportSessionStatsJSON(sessionId) {
  return JSON.stringify(getStreamStatistics(sessionId), null, 2);
}

function getAllStreamsSummary() {
  const stmt = db.prepare(`
    SELECT 
      s.session_id,
      s.stream_key,
      s.status,
      s.start_time,
      s.end_time,
      s.total_bytes,
      COUNT(DISTINCT v.id) as viewer_count
    FROM stream_sessions s
    LEFT JOIN viewer_sessions v ON s.session_id = v.session_id
    GROUP BY s.session_id
    ORDER BY s.start_time DESC
    LIMIT 50
  `);
  return stmt.all();
}

module.exports = {
  initDB,
  createStreamSession,
  endStreamSession,
  updateStreamBytes,
  getActiveSessions,
  getSessionById,
  getSessionHistory,
  createViewerSession,
  updateViewerQuality,
  endViewerSession,
  recordQualityStats,
  getViewerCount,
  updateViewerWatchTime,
  scheduleAd,
  getScheduledAds,
  updateAdStatus,
  recordAdPlayback,
  updateAdPlaybackCompletion,
  recordPlaybackEvent,
  getStreamStatistics,
  exportSessionStatsCSV,
  exportSessionStatsJSON,
  getAllStreamsSummary
};
