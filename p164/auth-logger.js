const fs = require('fs');
const path = require('path');

class AuthLogger {
  constructor(logFile = 'auth.log') {
    this.logFile = path.join(__dirname, logFile);
    this.logs = [];
    this.maxLogs = 1000;
    this._ensureLogFile();
  }

  _ensureLogFile() {
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, '');
    }
  }

  _formatLog(entry) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] ${entry.ip} - ${entry.mechanism} - ${entry.username || 'unknown'} - ${entry.success ? 'SUCCESS' : 'FAILED'} - ${entry.message || ''}`;
  }

  log(entry) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ip: entry.ip || 'unknown',
      mechanism: entry.mechanism || 'unknown',
      username: entry.username || 'unknown',
      success: entry.success,
      message: entry.message || ''
    };

    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    const logLine = this._formatLog(logEntry);
    console.log(`[AuthLog] ${logLine}`);

    try {
      fs.appendFileSync(this.logFile, logLine + '\n');
    } catch (err) {
      console.error('[AuthLog] Failed to write log:', err.message);
    }

    return logEntry;
  }

  logSuccess(ip, mechanism, username, message = '') {
    return this.log({
      ip,
      mechanism,
      username,
      success: true,
      message
    });
  }

  logFailure(ip, mechanism, username, message = '') {
    return this.log({
      ip,
      mechanism,
      username,
      success: false,
      message
    });
  }

  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  getStats() {
    const stats = {
      total: this.logs.length,
      success: 0,
      failed: 0,
      byMechanism: {},
      byUsername: {}
    };

    for (const log of this.logs) {
      if (log.success) {
        stats.success++;
      } else {
        stats.failed++;
      }

      if (!stats.byMechanism[log.mechanism]) {
        stats.byMechanism[log.mechanism] = { total: 0, success: 0, failed: 0 };
      }
      stats.byMechanism[log.mechanism].total++;
      if (log.success) {
        stats.byMechanism[log.mechanism].success++;
      } else {
        stats.byMechanism[log.mechanism].failed++;
      }

      if (log.username !== 'unknown') {
        if (!stats.byUsername[log.username]) {
          stats.byUsername[log.username] = { total: 0, success: 0, failed: 0 };
        }
        stats.byUsername[log.username].total++;
        if (log.success) {
          stats.byUsername[log.username].success++;
        } else {
          stats.byUsername[log.username].failed++;
        }
      }
    }

    return stats;
  }

  clearLogs() {
    this.logs = [];
    try {
      fs.writeFileSync(this.logFile, '');
    } catch (err) {
      console.error('[AuthLog] Failed to clear log file:', err.message);
    }
  }
}

module.exports = AuthLogger;
