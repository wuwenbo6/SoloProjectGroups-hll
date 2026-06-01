const coap = require('coap');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const FirmwareDB = require('./db');

class TokenBucket {
  constructor(capacity, refillRate) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  consume(tokens = 1) {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

class CoapServer {
  constructor() {
    this.server = coap.createServer();
    this.db = new FirmwareDB();
    
    this.maxConcurrentRequests = 10;
    this.currentRequests = 0;
    
    this.deviceRateLimiters = new Map();
    this.globalRateLimiter = new TokenBucket(100, 50);
    
    this.defaultRateLimit = { capacity: 10, refillRate: 5 };
    
    this.blockCache = new Map();
    this.cacheMaxSize = 50;
    
    this.setupRoutes();
  }

  getDeviceRateLimiter(deviceId) {
    if (!this.deviceRateLimiters.has(deviceId)) {
      this.deviceRateLimiters.set(
        deviceId,
        new TokenBucket(this.defaultRateLimit.capacity, this.defaultRateLimit.refillRate)
      );
    }
    return this.deviceRateLimiters.get(deviceId);
  }

  checkRateLimit(deviceId = 'unknown') {
    if (!this.globalRateLimiter.consume()) {
      return false;
    }
    
    if (deviceId !== 'unknown') {
      const deviceLimiter = this.getDeviceRateLimiter(deviceId);
      if (!deviceLimiter.consume()) {
        return false;
      }
    }
    
    return true;
  }

  async acquireRequestSlot() {
    while (this.currentRequests >= this.maxConcurrentRequests) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    this.currentRequests++;
  }

  releaseRequestSlot() {
    this.currentRequests = Math.max(0, this.currentRequests - 1);
  }

  getCachedBlock(cacheKey) {
    return this.blockCache.get(cacheKey);
  }

  setCachedBlock(cacheKey, data) {
    if (this.blockCache.size >= this.cacheMaxSize) {
      const firstKey = this.blockCache.keys().next().value;
      this.blockCache.delete(firstKey);
    }
    this.blockCache.set(cacheKey, data);
  }

  setupRoutes() {
    this.server.on('request', async (req, res) => {
      const urlParts = req.url.split('/').filter(Boolean);
      const endpoint = urlParts[0];

      try {
        switch (endpoint) {
          case 'register':
            await this.handleRequest(this.handleRegister, req, res, urlParts);
            break;
          case 'firmware':
            await this.handleRequest(this.handleFirmware, req, res, urlParts);
            break;
          case 'block':
            await this.handleRequest(this.handleBlock, req, res, urlParts);
            break;
          case 'delta-block':
            await this.handleRequest(this.handleDeltaBlock, req, res, urlParts);
            break;
          case 'progress':
            await this.handleRequest(this.handleProgress, req, res, urlParts);
            break;
          case 'complete':
            await this.handleRequest(this.handleComplete, req, res, urlParts);
            break;
          case 'rollback':
            await this.handleRequest(this.handleRollback, req, res, urlParts);
            break;
          case 'check':
            await this.handleRequest(this.handleCheckUpgrade, req, res, urlParts);
            break;
          default:
            res.code = '4.04';
            res.end('Not Found');
        }
      } catch (error) {
        console.error('CoAP request error:', error);
        res.code = '5.00';
        res.end('Internal Server Error');
      }
    });
  }

  async handleRequest(handler, req, res, urlParts) {
    try {
      await this.acquireRequestSlot();
      
      if (!this.checkRateLimit(this.extractDeviceId(req, urlParts))) {
        res.code = '4.29';
        res.end(JSON.stringify({ error: 'Rate limit exceeded, please retry later' }));
        return;
      }
      
      await handler.call(this, req, res, urlParts);
    } finally {
      this.releaseRequestSlot();
    }
  }

  extractDeviceId(req, urlParts) {
    try {
      if (urlParts[0] === 'check') {
        return urlParts[1] || 'unknown';
      }
      if (req.payload && req.payload.length > 0) {
        const data = JSON.parse(req.payload.toString());
        return data.deviceId || 'unknown';
      }
    } catch (e) {}
    return 'unknown';
  }

  async handleRegister(req, res) {
    if (req.method !== 'POST') {
      res.code = '4.05';
      return res.end('Method Not Allowed');
    }

    try {
      const data = JSON.parse(req.payload.toString());
      const { deviceId, name, version } = data;

      if (!deviceId) {
        res.code = '4.00';
        return res.end(JSON.stringify({ error: 'deviceId required' }));
      }

      await this.db.registerDevice(deviceId, name || '');
      if (version) {
        await this.db.updateDeviceStatus(deviceId, 'online', version);
      }

      res.code = '2.01';
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.code = '4.00';
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  }

  async handleCheckUpgrade(req, res, urlParts) {
    const deviceId = urlParts[1];
    if (!deviceId) {
      res.code = '4.00';
      return res.end(JSON.stringify({ error: 'deviceId required' }));
    }

    const activeUpgrade = await this.db.getActiveUpgrade(deviceId);
    if (activeUpgrade) {
      const firmware = await this.db.getFirmware(activeUpgrade.firmware_id);
      
      const response = {
        upgradeAvailable: true,
        recordId: activeUpgrade.id,
        firmwareId: activeUpgrade.firmware_id,
        version: firmware.version,
        totalBlocks: activeUpgrade.total_blocks,
        currentBlock: activeUpgrade.current_block,
        checksum: firmware.checksum,
        isDelta: firmware.is_delta === 1,
        previousVersion: activeUpgrade.previous_version
      };

      if (firmware.is_delta === 1) {
        response.deltaChecksum = firmware.delta_checksum;
        response.baseFirmwareId = firmware.base_firmware_id;
      }
      
      res.end(JSON.stringify(response));
    } else {
      res.end(JSON.stringify({ upgradeAvailable: false }));
    }
  }

  async handleDeltaBlock(req, res, urlParts) {
    if (req.method !== 'GET') {
      res.code = '4.05';
      return res.end('Method Not Allowed');
    }

    const recordId = parseInt(urlParts[1]);
    const blockNum = parseInt(urlParts[2]);

    if (!recordId || isNaN(blockNum)) {
      res.code = '4.00';
      return res.end(JSON.stringify({ error: 'Invalid parameters' }));
    }

    const cacheKey = `delta_${recordId}_${blockNum}`;
    const cached = this.getCachedBlock(cacheKey);
    if (cached) {
      return res.end(cached);
    }

    const record = await this.db.getUpgradeRecord(recordId);
    if (!record) {
      res.code = '4.04';
      return res.end(JSON.stringify({ error: 'Record not found' }));
    }

    const firmware = await this.db.getFirmware(record.firmware_id);
    if (!firmware || firmware.is_delta !== 1) {
      res.code = '4.04';
      return res.end(JSON.stringify({ error: 'Delta firmware not found' }));
    }

    if (blockNum >= firmware.delta_block_count) {
      res.code = '4.00';
      return res.end(JSON.stringify({ error: 'Block number out of range' }));
    }

    const baseFirmware = await this.db.getFirmware(firmware.base_firmware_id);
    const deltaFilename = `delta_${baseFirmware.version}_to_${firmware.version}.patch`;
    const deltaPath = path.join(config.firmwareDir, deltaFilename);
    if (!fs.existsSync(deltaPath)) {
      res.code = '4.04';
      return res.end(JSON.stringify({ error: 'Delta file not found' }));
    }

    const fd = fs.openSync(deltaPath, 'r');
    const buffer = Buffer.alloc(config.blockSize);
    const bytesRead = fs.readSync(fd, buffer, 0, config.blockSize, blockNum * config.blockSize);
    fs.closeSync(fd);

    const blockData = buffer.slice(0, bytesRead);
    const blockChecksum = crypto.createHash('md5').update(blockData).digest('hex');

    const response = JSON.stringify({
      block: blockNum,
      totalBlocks: firmware.delta_block_count,
      data: blockData.toString('base64'),
      checksum: blockChecksum,
      size: bytesRead,
      isDelta: true
    });

    this.setCachedBlock(cacheKey, response);
    res.end(response);
  }

  async handleRollback(req, res) {
    if (req.method !== 'POST') {
      res.code = '4.05';
      return res.end('Method Not Allowed');
    }

    try {
      const data = JSON.parse(req.payload.toString());
      const { recordId, success, errorMessage, deviceId } = data;

      if (!recordId) {
        res.code = '4.00';
        return res.end(JSON.stringify({ error: 'recordId required' }));
      }

      await this.db.recordRollback(recordId, success, errorMessage || null);
      
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.code = '4.00';
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  }

  async handleFirmware(req, res, urlParts) {
    const firmwareId = parseInt(urlParts[1]);
    if (!firmwareId) {
      res.code = '4.00';
      return res.end(JSON.stringify({ error: 'firmwareId required' }));
    }

    const firmware = await this.db.getFirmware(firmwareId);
    if (!firmware) {
      res.code = '4.04';
      return res.end(JSON.stringify({ error: 'Firmware not found' }));
    }

    res.end(JSON.stringify({
      id: firmware.id,
      version: firmware.version,
      name: firmware.name,
      size: firmware.size,
      checksum: firmware.checksum,
      blockCount: firmware.block_count,
      blockSize: config.blockSize
    }));
  }

  async handleBlock(req, res, urlParts) {
    if (req.method !== 'GET') {
      res.code = '4.05';
      return res.end('Method Not Allowed');
    }

    const recordId = parseInt(urlParts[1]);
    const blockNum = parseInt(urlParts[2]);

    if (!recordId || isNaN(blockNum)) {
      res.code = '4.00';
      return res.end(JSON.stringify({ error: 'Invalid parameters' }));
    }

    const cacheKey = `${recordId}_${blockNum}`;
    const cached = this.getCachedBlock(cacheKey);
    if (cached) {
      return res.end(cached);
    }

    const record = await this.db.getUpgradeRecord(recordId);
    if (!record) {
      res.code = '4.04';
      return res.end(JSON.stringify({ error: 'Record not found' }));
    }

    const firmware = await this.db.getFirmware(record.firmware_id);
    if (!firmware) {
      res.code = '4.04';
      return res.end(JSON.stringify({ error: 'Firmware not found' }));
    }

    if (blockNum >= firmware.block_count) {
      res.code = '4.00';
      return res.end(JSON.stringify({ error: 'Block number out of range' }));
    }

    const firmwarePath = path.join(config.firmwareDir, firmware.filename);
    if (!fs.existsSync(firmwarePath)) {
      res.code = '4.04';
      return res.end(JSON.stringify({ error: 'Firmware file not found' }));
    }

    const fd = fs.openSync(firmwarePath, 'r');
    const buffer = Buffer.alloc(config.blockSize);
    const bytesRead = fs.readSync(fd, buffer, 0, config.blockSize, blockNum * config.blockSize);
    fs.closeSync(fd);

    const blockData = buffer.slice(0, bytesRead);
    const blockChecksum = crypto.createHash('md5').update(blockData).digest('hex');

    const response = JSON.stringify({
      block: blockNum,
      totalBlocks: firmware.block_count,
      data: blockData.toString('base64'),
      checksum: blockChecksum,
      size: bytesRead
    });

    this.setCachedBlock(cacheKey, response);
    res.end(response);
  }

  async handleProgress(req, res) {
    if (req.method !== 'POST') {
      res.code = '4.05';
      return res.end('Method Not Allowed');
    }

    try {
      const data = JSON.parse(req.payload.toString());
      const { recordId, blockNum, deviceId } = data;

      if (!recordId || isNaN(blockNum)) {
        res.code = '4.00';
        return res.end(JSON.stringify({ error: 'Invalid parameters' }));
      }

      const record = await this.db.getUpgradeRecord(recordId);
      if (!record) {
        res.code = '4.04';
        return res.end(JSON.stringify({ error: 'Record not found' }));
      }

      await this.db.updateUpgradeProgress(recordId, blockNum);

      if (deviceId) {
        await this.db.updateDeviceStatus(deviceId, 'upgrading');
      }

      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.code = '4.00';
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  }

  async handleComplete(req, res) {
    if (req.method !== 'POST') {
      res.code = '4.05';
      return res.end('Method Not Allowed');
    }

    try {
      const data = JSON.parse(req.payload.toString());
      const { recordId, success, errorMessage, deviceId, version } = data;

      if (!recordId) {
        res.code = '4.00';
        return res.end(JSON.stringify({ error: 'recordId required' }));
      }

      const record = await this.db.getUpgradeRecord(recordId);
      if (!record) {
        res.code = '4.04';
        return res.end(JSON.stringify({ error: 'Record not found' }));
      }

      await this.db.completeUpgrade(recordId, success, errorMessage || null);

      if (deviceId) {
        if (success && version) {
          await this.db.updateDeviceStatus(deviceId, 'online', version);
        } else {
          await this.db.updateDeviceStatus(deviceId, success ? 'online' : 'error');
        }
      }

      for (let i = 0; i < record.total_blocks; i++) {
        this.blockCache.delete(`${recordId}_${i}`);
      }

      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      res.code = '4.00';
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  }

  notifyUpgrade(deviceId, firmwareId, recordId) {
    console.log(`Notify device ${deviceId} of upgrade ${firmwareId}, record ${recordId}`);
  }

  start(port = config.coapPort) {
    this.server.listen(port, () => {
      console.log(`CoAP server running on port ${port}`);
      console.log(`  - Max concurrent requests: ${this.maxConcurrentRequests}`);
      console.log(`  - Global rate limit: ${this.globalRateLimiter.capacity} tokens, ${this.globalRateLimiter.refillRate}/s`);
      console.log(`  - Per-device rate limit: ${this.defaultRateLimit.capacity} tokens, ${this.defaultRateLimit.refillRate}/s`);
      console.log(`  - Block cache size: ${this.cacheMaxSize}`);
    });
  }

  stop() {
    this.server.close();
    this.db.close();
  }
}

module.exports = CoapServer;
