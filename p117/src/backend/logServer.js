const express = require('express');
const path = require('path');
const fs = require('fs');

class LogServer {
    constructor(auditLogger, dataDir) {
        this.auditLogger = auditLogger;
        this.dataDir = dataDir;
        this.app = express();
        this.server = null;
        this.configureRoutes();
    }

    configureRoutes() {
        this.app.use(express.json());

        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            next();
        });

        this.app.get('/api/logs', (req, res) => {
            const { limit = 100, offset = 0, type, format, start, end } = req.query;

            try {
                if (format) {
                    const dateRange = start || end ? { start, end } : null;
                    const result = this.auditLogger.exportLogs(format, dateRange);
                    res.setHeader('Content-Type', this.getContentType(format));
                    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
                    res.send(result.content);
                } else {
                    const result = this.auditLogger.getLogs(
                        parseInt(limit),
                        parseInt(offset),
                        type
                    );
                    res.json(result);
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/logs/stats', (req, res) => {
            try {
                const stats = this.auditLogger.getLogStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.delete('/api/logs', (req, res) => {
            try {
                const result = this.auditLogger.clearLogs();
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/devices', (req, res) => {
            try {
                const devicesFile = path.join(this.dataDir, 'devices.json');
                if (fs.existsSync(devicesFile)) {
                    const devices = JSON.parse(fs.readFileSync(devicesFile, 'utf8'));
                    res.json(devices);
                } else {
                    res.json([]);
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/policies', (req, res) => {
            try {
                const policiesFile = path.join(this.dataDir, 'policies.json');
                if (fs.existsSync(policiesFile)) {
                    const policies = JSON.parse(fs.readFileSync(policiesFile, 'utf8'));
                    res.json(policies);
                } else {
                    res.json({ mode: 'whitelist', whitelist: [], blacklist: [] });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'running',
                timestamp: new Date().toISOString(),
                service: 'USB Guardian Log Server'
            });
        });
    }

    getContentType(format) {
        switch (format) {
            case 'json':
                return 'application/json';
            case 'csv':
                return 'text/csv';
            case 'txt':
                return 'text/plain';
            default:
                return 'application/octet-stream';
        }
    }

    start(port = 3000) {
        try {
            this.server = this.app.listen(port, '127.0.0.1', () => {
                console.log(`Log server running on http://127.0.0.1:${port}`);
            });
            return true;
        } catch (error) {
            console.error('Failed to start log server:', error);
            return false;
        }
    }

    stop() {
        if (this.server) {
            this.server.close(() => {
                console.log('Log server stopped');
            });
            this.server = null;
        }
    }
}

module.exports = { LogServer };
