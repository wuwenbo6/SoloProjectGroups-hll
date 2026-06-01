const EventEmitter = require('events');
const http = require('http');
const https = require('https');
const db = require('./database');

class LwM2MServer extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map();
    this.pendingObservers = new Map();
    this.commandDeliveryTimeout = 300000;
    this.wakeupCommandBatchSize = 10;
    this.webhookQueue = [];
    this.isProcessingWebhooks = false;
  }

  async registerDevice(endpoint, options = {}) {
    const device = await db.registerDevice(endpoint, options.name, options.registrationParams);
    this.devices.set(endpoint, {
      ...device,
      registeredAt: new Date(),
      lifetime: options.lifetime || 86400
    });

    if (options.observers && options.observers.length > 0) {
      for (const obs of options.observers) {
        await db.addObserver(device.id, obs.resourcePath, obs.token, obs.contentFormat);
      }
    }

    this.emit('device-registered', device);
    console.log(`[LwM2M] Device registered: ${endpoint}`);
    return device;
  }

  async handleDeviceUpdate(endpoint, data) {
    let device = await db.getDeviceByEndpoint(endpoint);

    if (!device) {
      console.log(`[LwM2M] Unknown device ${endpoint}, auto-registering`);
      return this.registerDevice(endpoint);
    }

    if (device.is_sleeping) {
      console.log(`[LwM2M] Device ${endpoint} waking up from sleep`);
      const wakeupData = await db.wakeupDevice(endpoint);
      device = wakeupData.device;
      
      if (wakeupData.pendingCommands.length > 0) {
        console.log(`[LwM2M] Delivering ${wakeupData.pendingCommands.length} pending commands to ${endpoint}`);
        for (const cmd of wakeupData.pendingCommands) {
          await db.markCommandDelivering(cmd.id);
        }
      }

      this.emit('device-wakeup', {
        device,
        pendingCommands: wakeupData.pendingCommands,
        observers: wakeupData.observers
      });
    } else {
      await db.updateDeviceStatus(endpoint, 'online');
    }

    if (data.temperature !== undefined || (data.latitude !== undefined && data.longitude !== undefined)) {
      await db.insertSensorData(
        device.id,
        data.temperature !== undefined ? data.temperature : null,
        data.latitude,
        data.longitude
      );

      if (data.latitude !== undefined && data.longitude !== undefined) {
        await db.updateDeviceLocation(endpoint, data.latitude, data.longitude);
      }

      const observers = await db.getActiveObservers(device.id);
      for (const obs of observers) {
        await db.updateObserverLastNotify(obs.id);
        this.emit('observer-notify', {
          observer: obs,
          device,
          data: { temperature: data.temperature, latitude: data.latitude, longitude: data.longitude }
        });
      }

      const sensorData = {
        deviceId: device.id,
        endpoint,
        temperature: data.temperature,
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: new Date()
      };

      this.emit('sensor-data', sensorData);
      await this.log(device.id, 'info', 'Sensor data received', {
        temperature: data.temperature,
        latitude: data.latitude,
        longitude: data.longitude
      });
      await this.triggerWebhook('sensor-data', sensorData);
    }

    return db.getDeviceByEndpoint(endpoint);
  }

  async sendCommand(endpoint, command, payload = null, options = {}) {
    const device = await db.getDeviceByEndpoint(endpoint);
    if (!device) {
      throw new Error('Device not found');
    }

    const priority = options.priority || 0;
    const maxRetries = options.maxRetries || 3;

    const result = await db.createCommand(device.id, command, payload, priority, maxRetries);
    const commandId = result.lastID;

    if (!device.is_sleeping && device.status === 'online') {
      await db.markCommandDelivering(commandId);
      console.log(`[LwM2M] Command queued for ${endpoint}: ${command} (ID: ${commandId})`);
    } else {
      console.log(`[LwM2M] Command ${commandId} queued for offline/sleeping device ${endpoint}`);
    }

    this.emit('command-created', {
      deviceId: device.id,
      endpoint,
      command,
      commandId
    });

    return commandId;
  }

  async sendBatchCommand(endpoints, command, payload = null, options = {}) {
    const results = [];
    const priority = options.priority || 0;

    for (const endpoint of endpoints) {
      try {
        const device = await db.getDeviceByEndpoint(endpoint);
        if (!device) {
          results.push({ endpoint, error: 'Device not found', success: false });
          continue;
        }

        const maxRetries = options.maxRetries || 3;
        const result = await db.createCommand(device.id, command, payload, priority, maxRetries);
        const commandId = result.lastID;

        if (!device.is_sleeping && device.status === 'online') {
          await db.markCommandDelivering(commandId);
        }

        this.emit('command-created', {
          deviceId: device.id,
          endpoint,
          command,
          commandId
        });

        results.push({ endpoint, commandId, success: true });
      } catch (error) {
        console.error(`[LwM2M] Batch command error for ${endpoint}:`, error.message);
        results.push({ endpoint, error: error.message, success: false });
      }
    }

    this.emit('batch-command-created', { command, results });
    console.log(`[LwM2M] Batch command "${command}" sent to ${results.filter(r => r.success).length}/${endpoints.length} devices`);

    return results;
  }

  async getPendingCommandsForDelivery(endpoint) {
    const device = await db.getDeviceByEndpoint(endpoint);
    if (!device) return [];

    const commands = await db.getPendingCommandsForDelivery(device.id);
    for (const cmd of commands) {
      await db.markCommandDelivering(cmd.id);
    }

    return commands;
  }

  async acknowledgeCommand(commandId) {
    await db.acknowledgeCommand(commandId);
    this.emit('command-acknowledged', { commandId });
    console.log(`[LwM2M] Command ${commandId} acknowledged`);
  }

  async checkStaleCommands() {
    const staleCommands = await db.getStaleCommands(this.commandDeliveryTimeout);

    for (const cmd of staleCommands) {
      const device = await db.getDevice(cmd.device_id);
      const result = await db.retryCommand(cmd.id);

      if (result.changes > 0) {
        console.log(`[LwM2M] Retrying command ${cmd.id} for ${device?.endpoint} (attempt ${cmd.retry_count + 1})`);
        this.emit('command-retried', { commandId: cmd.id, endpoint: device?.endpoint });
      } else {
        console.log(`[LwM2M] Command ${cmd.id} failed after max retries`);
        this.emit('command-failed', { commandId: cmd.id, endpoint: device?.endpoint, error: 'Max retries exceeded' });
      }
    }

    return staleCommands.length;
  }

  async addObserver(deviceId, resourcePath, token, contentFormat = null) {
    const result = await db.addObserver(deviceId, resourcePath, token, contentFormat);
    console.log(`[LwM2M] Observer added for device ${deviceId}: ${resourcePath}`);
    return result.lastID;
  }

  async removeObserver(deviceId, resourcePath, token) {
    await db.removeObserver(deviceId, resourcePath, token);
    console.log(`[LwM2M] Observer removed for device ${deviceId}: ${resourcePath}`);
  }

  async getActiveObservers(deviceId) {
    return db.getActiveObservers(deviceId);
  }

  async deregisterDevice(endpoint) {
    await db.deregisterDevice(endpoint);
    this.devices.delete(endpoint);
    this.emit('device-deregistered', endpoint);
    console.log(`[LwM2M] Device deregistered: ${endpoint}`);
  }

  async log(deviceId, level, message, data = null) {
    await db.addDeviceLog(deviceId, level, message, data);
    this.emit('device-log', { deviceId, level, message, data, timestamp: new Date() });
  }

  async sendHttpRequest(url, method, headers, payload) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const lib = urlObj.protocol === 'https:' ? https : http;
      const data = JSON.stringify(payload);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...headers
        }
      };

      const req = lib.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  async triggerWebhook(event, payload) {
    const webhooks = await db.getActiveWebhooks();
    
    for (const webhook of webhooks) {
      try {
        const events = JSON.parse(webhook.events || '[]');
        const headers = JSON.parse(webhook.headers || '{}');
        
        if (events.length === 0 || events.includes(event) || events.includes('*')) {
          this.webhookQueue.push({
            webhook,
            event,
            payload,
            retries: 0
          });
          this.processWebhookQueue();
        }
      } catch (error) {
        console.error(`[Webhook] Error processing webhook ${webhook.id}:`, error.message);
      }
    }
  }

  async processWebhookQueue() {
    if (this.isProcessingWebhooks || this.webhookQueue.length === 0) return;

    this.isProcessingWebhooks = true;

    while (this.webhookQueue.length > 0) {
      const item = this.webhookQueue.shift();
      
      try {
        const headers = JSON.parse(item.webhook.headers || '{}');
        const result = await this.sendHttpRequest(
          item.webhook.url,
          item.webhook.method,
          headers,
          { event: item.event, data: item.payload, timestamp: new Date().toISOString() }
        );
        
        if (result.status >= 200 && result.status < 300) {
          console.log(`[Webhook] ${item.webhook.name}: ${item.event} sent successfully (${result.status})`);
        } else if (item.retries < 3) {
          item.retries++;
          this.webhookQueue.push(item);
          console.log(`[Webhook] ${item.webhook.name}: Retry ${item.retries} (status ${result.status})`);
        }
      } catch (error) {
        if (item.retries < 3) {
          item.retries++;
          this.webhookQueue.push(item);
          console.log(`[Webhook] ${item.webhook.name}: Retry ${item.retries} (${error.message})`);
        } else {
          console.error(`[Webhook] ${item.webhook.name}: Failed after 3 retries (${error.message})`);
        }
      }
    }

    this.isProcessingWebhooks = false;
  }

  async startFirmwareUpdate(deviceId, firmwareId) {
    const firmware = await db.getFirmware(firmwareId);
    if (!firmware) {
      throw new Error('Firmware not found');
    }

    const result = await db.createFirmwareUpdate(deviceId, firmwareId);
    const updateId = result.lastID;

    await this.log(deviceId, 'info', `Starting firmware update to ${firmware.version}`, { firmwareId, updateId });

    const device = await db.getDevice(deviceId);
    if (device) {
      await this.sendCommand(device.endpoint, 'firmware_update', {
        firmwareId,
        version: firmware.version,
        checksum: firmware.checksum
      }, { priority: 20 });
    }

    this.emit('firmware-update-started', { deviceId, firmwareId, updateId });
    return updateId;
  }

  async reportFirmwareProgress(updateId, progress) {
    if (progress >= 100) {
      await db.updateFirmwareProgress(updateId, 100);
      const update = (await allQuery('SELECT * FROM firmware_updates WHERE id = ?', [updateId]))[0];
      if (update) {
        await this.log(update.device_id, 'info', 'Firmware update completed', { updateId });
        this.emit('firmware-update-completed', { updateId, deviceId: update.device_id });
      }
    } else {
      await db.updateFirmwareProgress(updateId, progress);
      this.emit('firmware-update-progress', { updateId, progress });
    }
  }

  async failFirmwareUpdate(updateId, errorMessage) {
    await db.failFirmwareUpdate(updateId, errorMessage);
    const update = (await allQuery('SELECT * FROM firmware_updates WHERE id = ?', [updateId]))[0];
    if (update) {
      await this.log(update.device_id, 'error', `Firmware update failed: ${errorMessage}`, { updateId });
      this.emit('firmware-update-failed', { updateId, deviceId: update.device_id, error: errorMessage });
    }
  }

  async batchFirmwareUpdate(deviceIds, firmwareId) {
    const results = [];
    for (const deviceId of deviceIds) {
      try {
        const updateId = await this.startFirmwareUpdate(deviceId, firmwareId);
        results.push({ deviceId, updateId, success: true });
      } catch (error) {
        results.push({ deviceId, error: error.message, success: false });
      }
    }
    return results;
  }

  async checkDeviceLifetime() {
    const now = Date.now();
    const timeout = 300000;

    const allDevices = await db.getAllDevices();
    for (const device of allDevices) {
      if (device.last_seen && !device.is_sleeping) {
        const lastSeen = new Date(device.last_seen).getTime();
        if (now - lastSeen > timeout && device.status === 'online') {
          await db.updateDeviceStatus(device.endpoint, 'offline');
          this.emit('device-offline', device.endpoint);
          console.log(`[LwM2M] Device timed out: ${device.endpoint}`);
        }
      }
    }
  }

  start() {
    setInterval(() => this.checkDeviceLifetime(), 60000);
    setInterval(() => this.checkStaleCommands(), 120000);
    console.log('[LwM2M] LwM2M server started with Observer and Command Retry support');
  }
}

module.exports = new LwM2MServer();
