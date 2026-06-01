const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { diff, patch } = require('bsdiff-node');
const config = require('../config');
const FirmwareDB = require('./db');

class HttpServer {
  constructor(coapServer = null) {
    this.app = express();
    this.db = new FirmwareDB();
    this.coapServer = coapServer;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.ensureFirmwareDir();
  }

  ensureFirmwareDir() {
    if (!fs.existsSync(config.firmwareDir)) {
      fs.mkdirSync(config.firmwareDir, { recursive: true });
    }
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  setupRoutes() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, config.firmwareDir);
      },
      filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}_${file.originalname}`;
        cb(null, uniqueName);
      }
    });

    const upload = multer({
      storage,
      limits: { fileSize: config.maxFirmwareSize },
      fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.bin' || ext === '.hex') {
          cb(null, true);
        } else {
          cb(new Error('Only .bin and .hex files are allowed'));
        }
      }
    });

    this.app.post('/api/firmware/upload', upload.single('firmware'), async (req, res) => {
      try {
        const { version, name, description } = req.body;
        
        if (!version || !name) {
          return res.status(400).json({ error: 'Version and name are required' });
        }

        const firmwarePath = req.file.path;
        const fileBuffer = fs.readFileSync(firmwarePath);
        const checksum = crypto.createHash('md5').update(fileBuffer).digest('hex');
        const blockCount = Math.ceil(fileBuffer.length / config.blockSize);

        const result = await this.db.addFirmware(
          version,
          name,
          req.file.filename,
          req.file.size,
          checksum,
          blockCount,
          description || ''
        );

        res.json({
          success: true,
          firmware: {
            id: result.lastID,
            version,
            name,
            size: req.file.size,
            checksum,
            blockCount
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/firmware', async (req, res) => {
      const firmware = await this.db.getAllFirmware();
      res.json(firmware);
    });

    this.app.get('/api/firmware/:id', async (req, res) => {
      const firmware = await this.db.getFirmware(req.params.id);
      if (!firmware) {
        return res.status(404).json({ error: 'Firmware not found' });
      }
      res.json(firmware);
    });

    this.app.delete('/api/firmware/:id', async (req, res) => {
      const firmware = await this.db.getFirmware(req.params.id);
      if (!firmware) {
        return res.status(404).json({ error: 'Firmware not found' });
      }
      
      const filePath = path.join(config.firmwareDir, firmware.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      await this.db.run('DELETE FROM firmware WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    });

    this.app.get('/api/devices', async (req, res) => {
      const devices = await this.db.getAllDevices();
      res.json(devices);
    });

    this.app.get('/api/devices/:deviceId', async (req, res) => {
      const device = await this.db.getDevice(req.params.deviceId);
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }
      res.json(device);
    });

    this.app.post('/api/devices/register', async (req, res) => {
      const { deviceId, name } = req.body;
      if (!deviceId) {
        return res.status(400).json({ error: 'deviceId is required' });
      }
      await this.db.registerDevice(deviceId, name || '');
      res.json({ success: true });
    });

    this.app.post('/api/upgrade/start', async (req, res) => {
      const { deviceId, firmwareId, useDelta = false } = req.body;
      
      if (!deviceId || !firmwareId) {
        return res.status(400).json({ error: 'deviceId and firmwareId are required' });
      }

      const result = await this.db.startUpgrade(deviceId, firmwareId, useDelta);
      if (!result) {
        return res.status(404).json({ error: 'Firmware not found' });
      }

      if (this.coapServer) {
        this.coapServer.notifyUpgrade(deviceId, firmwareId, result.id);
      }

      res.json({ 
        success: true, 
        recordId: result.id, 
        totalBlocks: result.totalBlocks,
        isDelta: result.isDelta
      });
    });

    this.app.post('/api/upgrade/rollback/:recordId', async (req, res) => {
      const recordId = parseInt(req.params.recordId);
      
      try {
        await this.db.recordRollback(recordId, true, 'Manual rollback');
        res.json({ success: true, message: 'Rollback recorded' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/firmware/generate-delta', async (req, res) => {
      const { baseFirmwareId, targetFirmwareId } = req.body;
      
      if (!baseFirmwareId || !targetFirmwareId) {
        return res.status(400).json({ error: 'baseFirmwareId and targetFirmwareId are required' });
      }

      try {
        const baseFirmware = await this.db.getFirmware(baseFirmwareId);
        const targetFirmware = await this.db.getFirmware(targetFirmwareId);

        if (!baseFirmware || !targetFirmware) {
          return res.status(404).json({ error: 'Firmware not found' });
        }

        const basePath = path.join(config.firmwareDir, baseFirmware.filename);
        const targetPath = path.join(config.firmwareDir, targetFirmware.filename);

        if (!fs.existsSync(basePath) || !fs.existsSync(targetPath)) {
          return res.status(404).json({ error: 'Firmware file not found' });
        }

        const deltaFilename = `delta_${baseFirmware.version}_to_${targetFirmware.version}.patch`;
        const deltaPath = path.join(config.firmwareDir, deltaFilename);

        const baseData = fs.readFileSync(basePath);
        const targetData = fs.readFileSync(targetPath);

        console.log(`Generating delta: ${baseFirmware.version} -> ${targetFirmware.version}`);
        console.log(`  Base size: ${baseData.length} bytes`);
        console.log(`  Target size: ${targetData.length} bytes`);

        const deltaData = diff(baseData, targetData);
        fs.writeFileSync(deltaPath, deltaData);

        const deltaChecksum = crypto.createHash('md5').update(deltaData).digest('hex');
        const deltaBlockCount = Math.ceil(deltaData.length / config.blockSize);

        await this.db.addDeltaFirmware(
          baseFirmwareId,
          targetFirmwareId,
          deltaFilename,
          deltaData.length,
          deltaChecksum,
          deltaBlockCount
        );

        console.log(`  Delta size: ${deltaData.length} bytes (${Math.round((deltaData.length / targetData.length) * 100)}% of target)`);

        res.json({
          success: true,
          delta: {
            filename: deltaFilename,
            size: deltaData.length,
            checksum: deltaChecksum,
            blockCount: deltaBlockCount,
            reduction: Math.round((1 - deltaData.length / targetData.length) * 100)
          }
        });
      } catch (error) {
        console.error('Delta generation error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/statistics/summary', async (req, res) => {
      try {
        const stats = await this.db.getUpgradeStatistics();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/statistics/export', async (req, res) => {
      const format = req.query.format || 'json';
      const limit = parseInt(req.query.limit) || 1000;

      try {
        const records = await this.db.getAllUpgradeRecords(limit);
        const stats = await this.db.getUpgradeStatistics();

        if (format === 'csv') {
          const headers = ['id', 'device_id', 'device_name', 'firmware_version', 'firmware_name', 
                          'status', 'current_block', 'total_blocks', 'started_at', 'completed_at', 'error_message'];
          
          const csvRows = [headers.join(',')];
          
          records.forEach(r => {
            const row = headers.map(h => {
              let val = r[h] || '';
              if (typeof val === 'string' && val.includes(',')) {
                val = `"${val}"`;
              }
              return val;
            });
            csvRows.push(row.join(','));
          });
          
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="upgrade_records.csv"');
          res.send(csvRows.join('\n'));
        } else {
          res.json({
            statistics: stats,
            records: records
          });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/upgrade/history/:deviceId', async (req, res) => {
      const history = await this.db.getDeviceUpgradeHistory(req.params.deviceId);
      res.json(history);
    });

    this.app.get('/api/upgrade/status/:recordId', async (req, res) => {
      const record = await this.db.getUpgradeRecord(req.params.recordId);
      if (!record) {
        return res.status(404).json({ error: 'Record not found' });
      }
      res.json(record);
    });
  }

  start(port = config.httpPort) {
    this.server = this.app.listen(port, () => {
      console.log(`HTTP server running on port ${port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
    this.db.close();
  }
}

module.exports = HttpServer;
