const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const lwm2mServer = require('./lwm2m-server');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

lwm2mServer.start();

wss.on('connection', (ws) => {
  console.log('[WebSocket] Client connected');
  
  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
  });
});

function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

lwm2mServer.on('device-registered', (device) => {
  broadcast({ type: 'device-registered', device });
});

lwm2mServer.on('device-wakeup', (data) => {
  broadcast({ type: 'device-wakeup', data });
});

lwm2mServer.on('device-offline', (endpoint) => {
  broadcast({ type: 'device-offline', endpoint });
});

lwm2mServer.on('sensor-data', (data) => {
  broadcast({ type: 'sensor-data', data });
});

lwm2mServer.on('command-created', (data) => {
  broadcast({ type: 'command-created', data });
});

lwm2mServer.on('command-acknowledged', (data) => {
  broadcast({ type: 'command-acknowledged', data });
});

lwm2mServer.on('command-retried', (data) => {
  broadcast({ type: 'command-retried', data });
});

lwm2mServer.on('command-failed', (data) => {
  broadcast({ type: 'command-failed', data });
});

lwm2mServer.on('batch-command-created', (data) => {
  broadcast({ type: 'batch-command-created', data });
});

lwm2mServer.on('observer-notify', (data) => {
  broadcast({ type: 'observer-notify', data });
});

app.post('/api/lwm2m/register', async (req, res) => {
  try {
    const { endpoint, name, lifetime, registrationParams, observers } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }
    const device = await lwm2mServer.registerDevice(endpoint, { 
      name, 
      lifetime, 
      registrationParams,
      observers 
    });
    res.json({ success: true, device });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/lwm2m/sleep', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }
    await db.markDeviceSleeping(endpoint);
    res.json({ success: true, message: 'Device marked as sleeping' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/lwm2m/wakeup', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }
    const wakeupData = await db.wakeupDevice(endpoint);
    if (!wakeupData) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json({ 
      success: true, 
      message: 'Device wakeup processed',
      device: wakeupData.device,
      pendingCommands: wakeupData.pendingCommands,
      observers: wakeupData.observers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/lwm2m/update', async (req, res) => {
  try {
    const { endpoint, temperature, latitude, longitude } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }
    const device = await lwm2mServer.handleDeviceUpdate(endpoint, {
      temperature,
      latitude,
      longitude
    });
    res.json({ success: true, device });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/lwm2m/commands/:endpoint', async (req, res) => {
  try {
    const commands = await lwm2mServer.getPendingCommandsForDelivery(req.params.endpoint);
    res.json({ commands });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/lwm2m/commands/:commandId/ack', async (req, res) => {
  try {
    const commandId = parseInt(req.params.commandId);
    await lwm2mServer.acknowledgeCommand(commandId);
    res.json({ success: true, message: 'Command acknowledged' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/lwm2m/deregister', async (req, res) => {
  try {
    const { endpoint } = req.body;
    await lwm2mServer.deregisterDevice(endpoint);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/lwm2m/observe', async (req, res) => {
  try {
    const { endpoint, resourcePath, token, contentFormat } = req.body;
    if (!endpoint || !resourcePath || !token) {
      return res.status(400).json({ error: 'Endpoint, resourcePath and token are required' });
    }
    const device = await db.getDeviceByEndpoint(endpoint);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    const observerId = await lwm2mServer.addObserver(device.id, resourcePath, token, contentFormat);
    res.json({ success: true, observerId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/lwm2m/cancel-observe', async (req, res) => {
  try {
    const { endpoint, resourcePath, token } = req.body;
    if (!endpoint || !resourcePath || !token) {
      return res.status(400).json({ error: 'Endpoint, resourcePath and token are required' });
    }
    const device = await db.getDeviceByEndpoint(endpoint);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    await lwm2mServer.removeObserver(device.id, resourcePath, token);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices', async (req, res) => {
  try {
    const devices = await db.getAllDevices();
    res.json({ devices });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices/:id', async (req, res) => {
  try {
    const device = await db.getDevice(req.params.id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    const observers = await db.getActiveObservers(device.id);
    res.json({ device, observers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices/:id/sensor-data', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const data = await db.getSensorData(req.params.id, limit);
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices/batch/restart', async (req, res) => {
  try {
    const { deviceIds, endpoints } = req.body;
    let targetEndpoints = endpoints || [];
    
    if (!targetEndpoints.length && deviceIds && deviceIds.length) {
      for (const id of deviceIds) {
        const device = await db.getDevice(id);
        if (device) {
          targetEndpoints.push(device.endpoint);
        }
      }
    }

    if (!Array.isArray(targetEndpoints) || targetEndpoints.length === 0) {
      return res.status(400).json({ error: 'endpoints or deviceIds array is required' });
    }

    const results = await lwm2mServer.sendBatchCommand(targetEndpoints, 'restart', null, { priority: 10 });
    res.json({ success: true, results, total: targetEndpoints.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices/batch/command', async (req, res) => {
  try {
    const { deviceIds, endpoints, command, payload, priority } = req.body;
    let targetEndpoints = endpoints || [];
    
    if (!targetEndpoints.length && deviceIds && deviceIds.length) {
      for (const id of deviceIds) {
        const device = await db.getDevice(id);
        if (device) {
          targetEndpoints.push(device.endpoint);
        }
      }
    }

    if (!Array.isArray(targetEndpoints) || targetEndpoints.length === 0) {
      return res.status(400).json({ error: 'endpoints or deviceIds array is required' });
    }
    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }

    const results = await lwm2mServer.sendBatchCommand(targetEndpoints, command, payload, { priority });
    res.json({ success: true, results, total: targetEndpoints.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices/:id/command', async (req, res) => {
  try {
    const { command, payload, priority, maxRetries } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }
    const device = await db.getDevice(req.params.id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    const commandId = await lwm2mServer.sendCommand(device.endpoint, command, payload, { priority, maxRetries });
    res.json({ success: true, commandId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices/:id/restart', async (req, res) => {
  try {
    const device = await db.getDevice(req.params.id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    const commandId = await lwm2mServer.sendCommand(device.endpoint, 'restart', null, { priority: 10, maxRetries: 3 });
    res.json({ success: true, commandId, message: 'Restart command sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/commands', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status;
    
    let commands;
    if (status) {
      commands = await db.getCommandsByStatus(status, limit);
    } else {
      commands = await db.getAllCommands(limit);
    }
    res.json({ commands });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/firmware', async (req, res) => {
  try {
    const firmware = await db.getAllFirmware(50);
    res.json({ firmware });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/firmware/active', async (req, res) => {
  try {
    const firmware = await db.getActiveFirmware();
    res.json({ firmware });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/firmware', async (req, res) => {
  try {
    const { version, name, description, filePath, fileSize, checksum } = req.body;
    if (!version) {
      return res.status(400).json({ error: 'Version is required' });
    }
    const result = await db.addFirmware(version, name, description, filePath, fileSize, checksum);
    res.json({ success: true, firmwareId: result.lastID });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/firmware/:id/activate', async (req, res) => {
  try {
    await db.setActiveFirmware(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices/:id/firmware/update', async (req, res) => {
  try {
    const { firmwareId } = req.body;
    if (!firmwareId) {
      return res.status(400).json({ error: 'firmwareId is required' });
    }
    const updateId = await lwm2mServer.startFirmwareUpdate(req.params.id, parseInt(firmwareId));
    res.json({ success: true, updateId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices/batch/firmware', async (req, res) => {
  try {
    const { deviceIds, firmwareId } = req.body;
    if (!Array.isArray(deviceIds) || !firmwareId) {
      return res.status(400).json({ error: 'deviceIds array and firmwareId are required' });
    }
    const results = await lwm2mServer.batchFirmwareUpdate(deviceIds, parseInt(firmwareId));
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/firmware/updates/:updateId/progress', async (req, res) => {
  try {
    const { progress } = req.body;
    await lwm2mServer.reportFirmwareProgress(parseInt(req.params.updateId), progress);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/firmware/updates/:updateId/fail', async (req, res) => {
  try {
    const { error } = req.body;
    await lwm2mServer.failFirmwareUpdate(parseInt(req.params.updateId), error || 'Unknown error');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices/:id/firmware/updates', async (req, res) => {
  try {
    const updates = await db.getDeviceFirmwareUpdates(req.params.id, 20);
    res.json({ updates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/webhooks', async (req, res) => {
  try {
    const webhooks = await db.getAllWebhooks();
    res.json({ webhooks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/webhooks', async (req, res) => {
  try {
    const { name, url, method, headers, events } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'name and url are required' });
    }
    const result = await db.addWebhook(name, url, method || 'POST', headers || {}, events || []);
    res.json({ success: true, webhookId: result.lastID });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/webhooks/:id', async (req, res) => {
  try {
    await db.deleteWebhook(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices/:id/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const level = req.query.level;
    const logs = await db.getDeviceLogs(req.params.id, limit, level);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 500;
    const logs = await db.getAllDeviceLogs(limit);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices/:id/logs/export', async (req, res) => {
  try {
    const format = req.query.format || 'csv';
    const startTime = req.query.startTime;
    const endTime = req.query.endTime;
    
    let logs;
    if (startTime && endTime) {
      logs = await db.getLogsByTimeRange(req.params.id, startTime, endTime);
    } else {
      logs = await db.getDeviceLogs(req.params.id, 1000);
    }

    const device = await db.getDevice(req.params.id);
    const filename = `device-logs-${req.params.id}-${Date.now()}`;

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json(logs);
    } else {
      const headers = ['timestamp', 'level', 'message', 'data'];
      const csvRows = [headers.join(',')];
      
      for (const log of logs) {
        const row = [
          log.timestamp,
          log.level,
          `"${(log.message || '').replace(/"/g, '""')}"`,
          `"${(log.data || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(csvRows.join('\n'));
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/logs/export', async (req, res) => {
  try {
    const format = req.query.format || 'csv';
    const limit = parseInt(req.query.limit) || 5000;
    const logs = await db.getAllDeviceLogs(limit);

    const filename = `all-device-logs-${Date.now()}`;

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json(logs);
    } else {
      const headers = ['timestamp', 'device_id', 'device_name', 'level', 'message', 'data'];
      const csvRows = [headers.join(',')];
      
      for (const log of logs) {
        const row = [
          log.timestamp,
          log.device_id,
          `"${(log.device_name || '').replace(/"/g, '""')}"`,
          log.level,
          `"${(log.message || '').replace(/"/g, '""')}"`,
          `"${(log.data || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(csvRows.join('\n'));
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

lwm2mServer.on('device-log', (data) => {
  broadcast({ type: 'device-log', data });
});

lwm2mServer.on('firmware-update-started', (data) => {
  broadcast({ type: 'firmware-update-started', data });
});

lwm2mServer.on('firmware-update-progress', (data) => {
  broadcast({ type: 'firmware-update-progress', data });
});

lwm2mServer.on('firmware-update-completed', (data) => {
  broadcast({ type: 'firmware-update-completed', data });
});

lwm2mServer.on('firmware-update-failed', (data) => {
  broadcast({ type: 'firmware-update-failed', data });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`NB-IoT Device Management System v3.0`);
  console.log(`========================================`);
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready`);
  console.log(`Features: FOTA, Webhooks, Log Export, Observer Persistence`);
  console.log(`========================================\n`);
});
