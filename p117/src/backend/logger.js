const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class AuditLogger extends EventEmitter {
    constructor(logDir) {
        super();
        this.logDir = logDir;
        this.logFile = path.join(logDir, 'audit.log');
        this.logEntries = [];
        this.maxEntries = 10000;
        this.maxFileSize = 10 * 1024 * 1024;
        this.ensureLogDir();
        this.loadExistingLogs();
    }

    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    loadExistingLogs() {
        try {
            if (fs.existsSync(this.logFile)) {
                const stat = fs.statSync(this.logFile);
                if (stat.size > this.maxFileSize) {
                    this.rotateLog();
                } else {
                    const data = fs.readFileSync(this.logFile, 'utf8');
                    const lines = data.split('\n').filter(line => line.trim());
                    for (const line of lines) {
                        try {
                            const entry = JSON.parse(line);
                            this.logEntries.push(entry);
                        } catch (e) {
                            console.error('Failed to parse log entry:', e);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load logs:', error);
        }

        if (this.logEntries.length > this.maxEntries) {
            this.logEntries = this.logEntries.slice(-this.maxEntries);
        }
    }

    rotateLog() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const rotatedFile = path.join(this.logDir, `audit-${timestamp}.log`);
            fs.renameSync(this.logFile, rotatedFile);
            this.logEntries = [];
        } catch (error) {
            console.error('Failed to rotate log:', error);
            fs.writeFileSync(this.logFile, '', 'utf8');
            this.logEntries = [];
        }
    }

    log(type, data) {
        const entry = {
            id: this.generateId(),
            type: type,
            data: data,
            timestamp: new Date().toISOString()
        };

        this.logEntries.push(entry);

        if (this.logEntries.length > this.maxEntries) {
            this.logEntries.shift();
        }

        this.appendToFile(entry);

        this.emit('new-log', entry);

        return entry;
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    appendToFile(entry) {
        try {
            this.ensureLogDir();
            fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n', 'utf8');

            const stat = fs.statSync(this.logFile);
            if (stat.size > this.maxFileSize) {
                this.rotateLog();
            }
        } catch (error) {
            console.error('Failed to write log:', error);
        }
    }

    getLogs(limit = 100, offset = 0, type = null) {
        let logs = [...this.logEntries];

        if (type) {
            logs = logs.filter(log => log.type === type);
        }

        logs.reverse();

        const paginatedLogs = logs.slice(offset, offset + limit);

        return {
            logs: paginatedLogs,
            total: logs.length,
            limit,
            offset
        };
    }

    clearLogs() {
        try {
            this.logEntries = [];
            if (fs.existsSync(this.logFile)) {
                fs.writeFileSync(this.logFile, '', 'utf8');
            }
            return { success: true, message: '日志已清除' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    exportLogs(format = 'json', dateRange = null) {
        let logs = [...this.logEntries];

        if (dateRange) {
            const { start, end } = dateRange;
            logs = logs.filter(log => {
                const logDate = new Date(log.timestamp);
                if (start && logDate < new Date(start)) return false;
                if (end && logDate > new Date(end)) return false;
                return true;
            });
        }

        switch (format) {
            case 'json':
                return {
                    format,
                    content: JSON.stringify(logs, null, 2),
                    filename: `audit-export-${Date.now()}.json`
                };

            case 'csv':
                const csvContent = this.convertToCSV(logs);
                return {
                    format,
                    content: csvContent,
                    filename: `audit-export-${Date.now()}.csv`
                };

            case 'txt':
                const txtContent = logs.map(log =>
                    `[${log.timestamp}] ${log.type}: ${JSON.stringify(log.data)}`
                ).join('\n');
                return {
                    format,
                    content: txtContent,
                    filename: `audit-export-${Date.now()}.txt`
                };

            default:
                return {
                    format: 'json',
                    content: JSON.stringify(logs, null, 2),
                    filename: `audit-export-${Date.now()}.json`
                };
        }
    }

    convertToCSV(logs) {
        const headers = ['timestamp', 'type', 'device_id', 'device_name', 'action', 'details'];
        const rows = logs.map(log => {
            const data = log.data || {};
            return [
                log.timestamp,
                log.type,
                data.deviceId || data.device || '',
                data.deviceName || '',
                data.type || '',
                JSON.stringify(data)
            ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
        });

        return [headers.join(','), ...rows].join('\n');
    }

    getLogStats() {
        const stats = {
            total: this.logEntries.length,
            byType: {},
            today: 0,
            last24h: 0
        };

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        for (const log of this.logEntries) {
            const logDate = new Date(log.timestamp);

            if (!stats.byType[log.type]) {
                stats.byType[log.type] = 0;
            }
            stats.byType[log.type]++;

            if (logDate >= todayStart) {
                stats.today++;
            }
            if (logDate >= last24h) {
                stats.last24h++;
            }
        }

        return stats;
    }
}

module.exports = { AuditLogger };
