const fs = require('fs');
const path = require('path');

const AUDIT_LOG_ENABLED = process.env.AUDIT_LOG_ENABLED !== 'false';
const AUDIT_LOG_DIR = process.env.AUDIT_LOG_DIR || path.join(__dirname, '..', '..', 'logs');
const AUDIT_LOG_FILE = process.env.AUDIT_LOG_FILE || 'audit.log';
const AUDIT_LOG_MAX_SIZE = parseInt(process.env.AUDIT_LOG_MAX_SIZE) || 10 * 1024 * 1024;

const auditLogs = new Map();

if (!fs.existsSync(AUDIT_LOG_DIR)) {
  fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
}

const logFilePath = path.join(AUDIT_LOG_DIR, AUDIT_LOG_FILE);

function getLogLevel(eventType) {
  switch (eventType) {
    case 'publish_start':
    case 'play_start':
      return 'INFO';
    case 'publish_done':
    case 'play_done':
      return 'INFO';
    case 'auth_failed':
    case 'ip_mismatch':
      return 'WARN';
    case 'error':
      return 'ERROR';
    default:
      return 'INFO';
  }
}

function formatLogEntry(entry) {
  const level = getLogLevel(entry.eventType);
  const timestamp = entry.timestamp || new Date().toISOString();
  const parts = [
    `[${timestamp}]`,
    `[${level}]`,
    `[${entry.eventType}]`,
    entry.app ? `[app=${entry.app}]` : '',
    entry.streamKey ? `[stream=${entry.streamKey}]` : '',
    entry.clientIp ? `[ip=${entry.clientIp}]` : '',
    entry.userId ? `[user=${entry.userId}]` : '',
    entry.action ? `[action=${entry.action}]` : '',
    entry.message ? entry.message : '',
  ].filter(Boolean);

  return parts.join(' ') + '\n';
}

function writeLog(entry) {
  if (!AUDIT_LOG_ENABLED) return;

  const logLine = formatLogEntry(entry);
  
  try {
    fs.appendFileSync(logFilePath, logLine, 'utf8');
    
    const stats = fs.statSync(logFilePath);
    if (stats.size > AUDIT_LOG_MAX_SIZE) {
      rotateLog();
    }
  } catch (err) {
    console.error('写入审计日志失败:', err.message);
  }
}

function rotateLog() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rotatedPath = `${logFilePath}.${timestamp}`;
  
  try {
    fs.renameSync(logFilePath, rotatedPath);
  } catch (err) {
    console.error('日志轮转失败:', err.message);
  }
}

function logEvent(eventType, data = {}) {
  const entry = {
    eventType,
    timestamp: new Date().toISOString(),
    ...data,
  };

  writeLog(entry);
}

function recordStreamStart(streamKey, data = {}) {
  const sessionId = `${streamKey}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const entry = {
    sessionId,
    streamKey,
    startTime: Date.now(),
    startTimeIso: new Date().toISOString(),
    ...data,
  };

  auditLogs.set(sessionId, entry);
  
  logEvent('publish_start', {
    ...data,
    streamKey,
    sessionId,
    message: '推流开始',
  });

  return sessionId;
}

function recordStreamEnd(sessionId, data = {}) {
  const entry = auditLogs.get(sessionId);
  
  if (entry) {
    const endTime = Date.now();
    const duration = Math.floor((endTime - entry.startTime) / 1000);
    
    logEvent('publish_done', {
      ...data,
      streamKey: entry.streamKey,
      sessionId,
      duration: duration,
      message: `推流结束，时长: ${formatDuration(duration)}`,
    });

    auditLogs.delete(sessionId);
  } else {
    logEvent('publish_done', {
      ...data,
      sessionId,
      message: '推流结束（未找到会话记录）',
    });
  }
}

function recordPlayStart(streamKey, data = {}) {
  logEvent('play_start', {
    ...data,
    streamKey,
    message: '拉流开始',
  });
}

function recordPlayEnd(streamKey, data = {}) {
  logEvent('play_done', {
    ...data,
    streamKey,
    message: '拉流结束',
  });
}

function recordAuthFailed(streamKey, reason, data = {}) {
  logEvent('auth_failed', {
    ...data,
    streamKey,
    message: `鉴权失败: ${reason}`,
  });
}

function getActiveStreams() {
  return Array.from(auditLogs.values());
}

function getRecentLogs(limit = 100) {
  try {
    if (!fs.existsSync(logFilePath)) {
      return [];
    }

    const content = fs.readFileSync(logFilePath, 'utf8');
    const lines = content.trim().split('\n');
    return lines.slice(-limit).map(line => parseLogLine(line));
  } catch (err) {
    console.error('读取日志失败:', err.message);
    return [];
  }
}

function parseLogLine(line) {
  const timestampMatch = line.match(/\[([^\]]+)\]/);
  const levelMatch = line.match(/\[(INFO|WARN|ERROR)\]/);
  const eventTypeMatch = line.match(/\[([a-z_]+)\]/g);
  
  return {
    raw: line,
    timestamp: timestampMatch ? timestampMatch[1] : null,
    level: levelMatch ? levelMatch[1] : null,
    eventType: eventTypeMatch ? eventTypeMatch[1] : null,
  };
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
  return `${Math.floor(seconds / 3600)}时${Math.floor((seconds % 3600) / 60)}分`;
}

module.exports = {
  logEvent,
  recordStreamStart,
  recordStreamEnd,
  recordPlayStart,
  recordPlayEnd,
  recordAuthFailed,
  getActiveStreams,
  getRecentLogs,
};
