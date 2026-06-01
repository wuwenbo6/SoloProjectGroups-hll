const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crc32 = require('crc/crc32');
const config = require('./config.json');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const firmwarePath = path.join(__dirname, config.firmware.path);
const firmwareBuffer = fs.readFileSync(firmwarePath);
const firmwareCrc32 = crc32(firmwareBuffer).toString(16).toUpperCase();

const STATUS_SUCCESS = 0x00;
const STATUS_NO_IMAGE_AVAILABLE = 0x98;
const STATUS_ABORT = 0x95;

const devices = new Map();
const upgradeSessions = new Map();
const upgradeStats = new Map();
const groupUpgradeTasks = new Map();
let groupTaskCounter = 0;

function getBlockNumber(offset, blockSize) {
  return Math.floor(offset / blockSize);
}

function getOffsetFromBlockNumber(blockNumber, blockSize) {
  return blockNumber * blockSize;
}

function broadcastToClients(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function getDeviceList() {
  return Array.from(devices.values()).map((d) => ({
    ieeeAddress: d.ieeeAddress,
    shortAddress: d.shortAddress,
    manufacturerId: d.manufacturerId,
    imageType: d.imageType,
    currentVersion: d.currentVersion,
    status: d.status,
    upgradeProgress: d.upgradeProgress || 0,
  }));
}

function initDeviceStats(ieeeAddress) {
  if (!upgradeStats.has(ieeeAddress)) {
    upgradeStats.set(ieeeAddress, {
      ieeeAddress,
      totalAttempts: 0,
      successes: 0,
      failures: 0,
      retries: 0,
      lastStatus: null,
      lastError: null,
      lastAttemptTime: null,
      lastDuration: null,
      history: [],
    });
  }
  return upgradeStats.get(ieeeAddress);
}

function recordUpgradeAttempt(ieeeAddress, result, duration, error) {
  const stats = initDeviceStats(ieeeAddress);
  stats.totalAttempts++;
  stats.lastStatus = result;
  stats.lastAttemptTime = new Date().toISOString();
  stats.lastDuration = duration;

  if (result === 'success') {
    stats.successes++;
  } else {
    stats.failures++;
    stats.lastError = error || 'Unknown error';
  }

  stats.history.push({
    result,
    duration,
    error: error || null,
    timestamp: stats.lastAttemptTime,
  });

  broadcastToClients({
    type: 'statsUpdate',
    stats: getAggregatedStats(),
  });
}

function recordRetry(ieeeAddress) {
  const stats = initDeviceStats(ieeeAddress);
  stats.retries++;
}

function getAggregatedStats() {
  const allStats = Array.from(upgradeStats.values());
  const total = allStats.reduce((acc, s) => ({
    totalAttempts: acc.totalAttempts + s.totalAttempts,
    successes: acc.successes + s.successes,
    failures: acc.failures + s.failures,
    retries: acc.retries + s.retries,
  }), { totalAttempts: 0, successes: 0, failures: 0, retries: 0 });

  return {
    ...total,
    successRate: total.totalAttempts > 0
      ? ((total.successes / total.totalAttempts) * 100).toFixed(1)
      : '0.0',
    devices: allStats,
  };
}

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.send(JSON.stringify({
    type: 'deviceList',
    devices: getDeviceList(),
  }));

  ws.send(JSON.stringify({
    type: 'firmwareInfo',
    firmware: {
      version: config.firmware.version,
      size: firmwareBuffer.length,
      crc32: firmwareCrc32,
      blockSize: config.ota.blockSize,
    },
  }));

  ws.send(JSON.stringify({
    type: 'statsUpdate',
    stats: getAggregatedStats(),
  }));

  ws.send(JSON.stringify({
    type: 'groupTasks',
    tasks: Array.from(groupUpgradeTasks.values()),
  }));

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

function registerDevice(deviceInfo) {
  const device = {
    ieeeAddress: deviceInfo.ieeeAddress,
    shortAddress: deviceInfo.shortAddress,
    manufacturerId: deviceInfo.manufacturerId,
    imageType: deviceInfo.imageType,
    currentVersion: deviceInfo.currentVersion,
    status: 'idle',
    upgradeProgress: 0,
    lastSeen: Date.now(),
  };

  devices.set(deviceInfo.ieeeAddress, device);
  initDeviceStats(deviceInfo.ieeeAddress);
  
  broadcastToClients({
    type: 'deviceList',
    devices: getDeviceList(),
  });

  return device;
}

function updateDeviceStatus(ieeeAddress, status, progress = null) {
  const device = devices.get(ieeeAddress);
  if (device) {
    device.status = status;
    if (progress !== null) {
      device.upgradeProgress = progress;
    }
    device.lastSeen = Date.now();
    
    broadcastToClients({
      type: 'deviceUpdate',
      device: {
        ieeeAddress: device.ieeeAddress,
        shortAddress: device.shortAddress,
        manufacturerId: device.manufacturerId,
        imageType: device.imageType,
        currentVersion: device.currentVersion,
        status: device.status,
        upgradeProgress: device.upgradeProgress,
      },
    });
  }
}

function handleQueryNextImage(req) {
  const { ieeeAddress, manufacturerId, imageType, currentVersion } = req.body;

  let device = devices.get(ieeeAddress);
  if (!device) {
    device = registerDevice(req.body);
  } else {
    device.manufacturerId = manufacturerId;
    device.imageType = imageType;
    device.currentVersion = currentVersion;
    device.lastSeen = Date.now();
  }

  if (manufacturerId !== config.firmware.manufacturerId ||
      imageType !== config.firmware.imageType) {
    return {
      status: STATUS_NO_IMAGE_AVAILABLE,
      manufacturerId,
      imageType,
      fileVersion: currentVersion,
      imageSize: 0,
    };
  }

  if (currentVersion >= config.firmware.fileVersion) {
    updateDeviceStatus(ieeeAddress, 'up-to-date', 100);
    return {
      status: STATUS_NO_IMAGE_AVAILABLE,
      manufacturerId,
      imageType,
      fileVersion: currentVersion,
      imageSize: 0,
    };
  }

  const existingSession = upgradeSessions.get(ieeeAddress);
  let resumeOffset = 0;
  let isResume = false;

  if (existingSession && existingSession.confirmedOffset > 0) {
    resumeOffset = existingSession.confirmedOffset;
    isResume = true;
    console.log(`Resuming upgrade for ${ieeeAddress} from offset ${resumeOffset} (block ${getBlockNumber(resumeOffset, config.ota.blockSize)})`);
  }

  const session = {
    currentOffset: resumeOffset,
    confirmedOffset: resumeOffset,
    lastSentOffset: resumeOffset,
    totalSize: firmwareBuffer.length,
    blockSize: config.ota.blockSize,
    startTime: isResume ? existingSession.startTime : Date.now(),
    retries: 0,
    waitingForAck: false,
    lastBlockNumber: getBlockNumber(resumeOffset, config.ota.blockSize),
    totalBlocks: Math.ceil(firmwareBuffer.length / config.ota.blockSize),
  };

  upgradeSessions.set(ieeeAddress, session);

  const progress = Math.round((resumeOffset / firmwareBuffer.length) * 100);
  updateDeviceStatus(ieeeAddress, 'upgrading', progress);

  if (!isResume) {
    broadcastToClients({
      type: 'upgradeStart',
      device: {
        ieeeAddress,
        fromVersion: currentVersion,
        toVersion: config.firmware.version,
        size: firmwareBuffer.length,
        totalBlocks: session.totalBlocks,
      },
    });
  } else {
    broadcastToClients({
      type: 'upgradeResumed',
      device: {
        ieeeAddress,
        resumeBlock: session.lastBlockNumber,
        totalBlocks: session.totalBlocks,
        resumeOffset,
        progress,
      },
    });
  }

  return {
    status: STATUS_SUCCESS,
    manufacturerId: config.firmware.manufacturerId,
    imageType: config.firmware.imageType,
    fileVersion: config.firmware.fileVersion,
    imageSize: firmwareBuffer.length,
    resumeOffset,
    resumeBlockNumber: session.lastBlockNumber,
    isResume,
  };
}

function handleImageBlockRequest(req) {
  const { ieeeAddress, fileVersion, offset, maxBlockSize, blockNumber } = req.body;

  const device = devices.get(ieeeAddress);
  if (!device) {
    return { status: STATUS_ABORT };
  }

  const session = upgradeSessions.get(ieeeAddress);
  if (!session) {
    return { status: STATUS_ABORT };
  }

  if (fileVersion !== config.firmware.fileVersion) {
    return { status: STATUS_ABORT };
  }

  const blockSize = Math.min(maxBlockSize || config.ota.blockSize, config.ota.blockSize);
  
  let requestOffset = offset;
  if (blockNumber !== undefined && blockNumber !== null) {
    requestOffset = getOffsetFromBlockNumber(blockNumber, blockSize);
  }

  if (requestOffset >= firmwareBuffer.length) {
    return { status: STATUS_ABORT };
  }

  const dataSize = Math.min(blockSize, firmwareBuffer.length - requestOffset);
  const actualBlockNumber = getBlockNumber(requestOffset, blockSize);

  const blockData = firmwareBuffer.slice(requestOffset, requestOffset + dataSize);
  const progress = Math.round(((requestOffset + dataSize) / firmwareBuffer.length) * 100);

  session.lastSentOffset = requestOffset + dataSize;
  session.lastBlockNumber = actualBlockNumber;
  session.waitingForAck = true;

  updateDeviceStatus(ieeeAddress, 'upgrading', progress);

  broadcastToClients({
    type: 'progressUpdate',
    device: {
      ieeeAddress,
      offset: requestOffset + dataSize,
      total: firmwareBuffer.length,
      progress,
      blockSize: dataSize,
      blockNumber: actualBlockNumber,
      totalBlocks: session.totalBlocks,
    },
  });

  return {
    status: STATUS_SUCCESS,
    manufacturerId: config.firmware.manufacturerId,
    imageType: config.firmware.imageType,
    fileVersion: config.firmware.fileVersion,
    offset: requestOffset,
    blockNumber: actualBlockNumber,
    dataSize,
    data: blockData.toString('base64'),
  };
}

function handleBlockAck(req) {
  const { ieeeAddress, fileVersion, blockNumber, offset, status } = req.body;

  const device = devices.get(ieeeAddress);
  if (!device) {
    return { status: STATUS_ABORT };
  }

  const session = upgradeSessions.get(ieeeAddress);
  if (!session) {
    return { status: STATUS_ABORT };
  }

  if (status !== STATUS_SUCCESS) {
    session.retries++;
    recordRetry(ieeeAddress);
    console.log(`Block ack failed for ${ieeeAddress}, retries: ${session.retries}`);
    return { status: STATUS_ABORT };
  }

  let confirmedOffset = offset;
  let confirmedBlockNumber = blockNumber;

  if (offset === undefined || offset === null) {
    confirmedOffset = getOffsetFromBlockNumber(blockNumber, session.blockSize) + session.blockSize;
    confirmedBlockNumber = blockNumber;
  }

  if (confirmedOffset > session.confirmedOffset) {
    session.confirmedOffset = confirmedOffset;
  }

  session.waitingForAck = false;
  session.retries = 0;

  const progress = Math.round((session.confirmedOffset / firmwareBuffer.length) * 100);

  updateDeviceStatus(ieeeAddress, 'upgrading', progress);

  broadcastToClients({
    type: 'blockAck',
    device: {
      ieeeAddress,
      blockNumber: confirmedBlockNumber,
      confirmedOffset: session.confirmedOffset,
      progress,
    },
  });

  return {
    status: STATUS_SUCCESS,
    nextBlockNumber: confirmedBlockNumber + 1,
    nextOffset: session.confirmedOffset,
    progress,
  };
}

function handleUpgradeEnd(req) {
  const { ieeeAddress, status, fileVersion, imageCrc } = req.body;

  const device = devices.get(ieeeAddress);
  if (!device) {
    return { status: STATUS_ABORT };
  }

  const session = upgradeSessions.get(ieeeAddress);
  const duration = session ? Date.now() - session.startTime : 0;
  
  if (status === STATUS_SUCCESS) {
    const calculatedCrc = parseInt(firmwareCrc32, 16);
    const receivedCrc = parseInt(imageCrc, 16);

    if (calculatedCrc === receivedCrc || !imageCrc) {
      updateDeviceStatus(ieeeAddress, 'complete', 100);
      device.currentVersion = fileVersion;

      recordUpgradeAttempt(ieeeAddress, 'success', duration);

      broadcastToClients({
        type: 'upgradeComplete',
        device: {
          ieeeAddress,
          newVersion: config.firmware.version,
          crc32: firmwareCrc32,
          duration,
        },
      });

      updateGroupTaskDevice(ieeeAddress, 'success');

      setTimeout(() => {
        updateDeviceStatus(ieeeAddress, 'restarting', 100);
        
        broadcastToClients({
          type: 'deviceRestart',
          device: {
            ieeeAddress,
            message: 'Device is restarting to apply firmware update',
          },
        });

        setTimeout(() => {
          updateDeviceStatus(ieeeAddress, 'idle', 0);
          upgradeSessions.delete(ieeeAddress);
        }, 3000);
      }, 1000);

      return {
        status: STATUS_SUCCESS,
        manufacturerId: config.firmware.manufacturerId,
        imageType: config.firmware.imageType,
        fileVersion: config.firmware.fileVersion,
        currentTime: Date.now(),
        requestTime: 500,
      };
    } else {
      updateDeviceStatus(ieeeAddress, 'error', 0);
      recordUpgradeAttempt(ieeeAddress, 'failure', duration, 'CRC mismatch');
      updateGroupTaskDevice(ieeeAddress, 'failure', 'CRC mismatch');
      return { status: STATUS_ABORT };
    }
  } else {
    updateDeviceStatus(ieeeAddress, 'error', 0);
    recordUpgradeAttempt(ieeeAddress, 'failure', duration, `Device reported error: 0x${status.toString(16)}`);
    updateGroupTaskDevice(ieeeAddress, 'failure', `Device error: 0x${status.toString(16)}`);
    upgradeSessions.delete(ieeeAddress);
    return { status: STATUS_ABORT };
  }
}

function updateGroupTaskDevice(ieeeAddress, result, error) {
  for (const task of groupUpgradeTasks.values()) {
    const dev = task.devices.find(d => d.ieeeAddress === ieeeAddress);
    if (dev && dev.status === 'pending') {
      dev.status = result;
      dev.error = error || null;
      dev.completedAt = new Date().toISOString();

      task.completed++;
      if (result === 'failure') {
        task.failed++;
      }

      checkGroupTaskComplete(task);
      break;
    }
  }
}

function checkGroupTaskComplete(task) {
  if (task.completed >= task.devices.length) {
    task.status = 'completed';
    task.completedAt = new Date().toISOString();

    broadcastToClients({
      type: 'groupTaskComplete',
      task: {
        id: task.id,
        status: task.status,
        total: task.devices.length,
        completed: task.completed,
        failed: task.failed,
        duration: Date.now() - task.startTime,
      },
    });

    console.log(`Group task ${task.id} completed: ${task.completed - task.failed} success, ${task.failed} failed`);
  }

  broadcastToClients({
    type: 'groupTaskUpdate',
    task: getGroupTaskSummary(task),
  });
}

function getGroupTaskSummary(task) {
  return {
    id: task.id,
    status: task.status,
    total: task.devices.length,
    completed: task.completed,
    failed: task.failed,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    devices: task.devices.map(d => ({
      ieeeAddress: d.ieeeAddress,
      status: d.status,
      error: d.error,
    })),
  };
}

app.post('/api/ota/query_next_image', (req, res) => {
  console.log('Received Query Next Image:', req.body);
  const response = handleQueryNextImage(req);
  console.log('Sending Query Response:', { status: response.status, imageSize: response.imageSize });
  res.json(response);
});

app.post('/api/ota/image_block', (req, res) => {
  const { ieeeAddress, offset } = req.body;
  const response = handleImageBlockRequest(req);
  res.json(response);
});

app.post('/api/ota/upgrade_end', (req, res) => {
  const response = handleUpgradeEnd(req);
  res.json(response);
});

app.post('/api/ota/block_ack', (req, res) => {
  const { ieeeAddress, blockNumber } = req.body;
  const response = handleBlockAck(req);
  res.json(response);
});

app.post('/api/group_upgrade', (req, res) => {
  const { deviceAddresses } = req.body;

  if (!deviceAddresses || !Array.isArray(deviceAddresses) || deviceAddresses.length === 0) {
    return res.status(400).json({ error: 'deviceAddresses array is required' });
  }

  const taskId = `group_${++groupTaskCounter}`;
  const task = {
    id: taskId,
    status: 'in_progress',
    total: deviceAddresses.length,
    completed: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    startTime: Date.now(),
    devices: deviceAddresses.map(addr => ({
      ieeeAddress: addr,
      status: 'pending',
      error: null,
      completedAt: null,
    })),
  };

  groupUpgradeTasks.set(taskId, task);

  broadcastToClients({
    type: 'groupTaskStart',
    task: getGroupTaskSummary(task),
  });

  console.log(`Group upgrade started: ${taskId} with ${deviceAddresses.length} devices`);

  res.json({
    taskId,
    status: task.status,
    totalDevices: deviceAddresses.length,
    message: `Group upgrade initiated for ${deviceAddresses.length} devices`,
  });
});

app.get('/api/group_tasks', (req, res) => {
  const tasks = Array.from(groupUpgradeTasks.values()).map(getGroupTaskSummary);
  res.json({ tasks });
});

app.get('/api/group_tasks/:taskId', (req, res) => {
  const task = groupUpgradeTasks.get(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(getGroupTaskSummary(task));
});

app.get('/api/stats', (req, res) => {
  res.json(getAggregatedStats());
});

app.get('/api/stats/export/json', (req, res) => {
  const stats = getAggregatedStats();
  const exportData = {
    exportTime: new Date().toISOString(),
    firmware: {
      version: config.firmware.version,
      size: firmwareBuffer.length,
      crc32: firmwareCrc32,
    },
    summary: {
      totalAttempts: stats.totalAttempts,
      successes: stats.successes,
      failures: stats.failures,
      retries: stats.retries,
      successRate: stats.successRate,
    },
    devices: stats.devices.map(d => ({
      ieeeAddress: d.ieeeAddress,
      totalAttempts: d.totalAttempts,
      successes: d.successes,
      failures: d.failures,
      retries: d.retries,
      lastStatus: d.lastStatus,
      lastError: d.lastError,
      lastAttemptTime: d.lastAttemptTime,
      lastDuration: d.lastDuration,
      history: d.history,
    })),
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=ota-stats.json');
  res.json(exportData);
});

app.get('/api/stats/export/csv', (req, res) => {
  const stats = getAggregatedStats();
  const headers = [
    'IEEE Address',
    'Total Attempts',
    'Successes',
    'Failures',
    'Retries',
    'Success Rate (%)',
    'Last Status',
    'Last Error',
    'Last Attempt Time',
    'Last Duration (ms)',
  ];

  const rows = stats.devices.map(d => [
    d.ieeeAddress,
    d.totalAttempts,
    d.successes,
    d.failures,
    d.retries,
    d.totalAttempts > 0 ? ((d.successes / d.totalAttempts) * 100).toFixed(1) : '0.0',
    d.lastStatus || '',
    d.lastError || '',
    d.lastAttemptTime || '',
    d.lastDuration || '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => {
      const str = String(cell);
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')),
  ].join('\n');

  const BOM = '\uFEFF';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=ota-stats.csv');
  res.send(BOM + csvContent);
});

app.get('/api/devices', (req, res) => {
  res.json({ devices: getDeviceList() });
});

app.get('/api/firmware', (req, res) => {
  res.json({
    version: config.firmware.version,
    size: firmwareBuffer.length,
    crc32: firmwareCrc32,
    blockSize: config.ota.blockSize,
    manufacturerId: config.firmware.manufacturerId,
    imageType: config.firmware.imageType,
  });
});

const PORT = config.server.port;
server.listen(PORT, () => {
  console.log(`ZigBee OTA Server running on http://localhost:${PORT}`);
  console.log(`WebSocket Server running on ws://localhost:${PORT}`);
  console.log(`Firmware version: ${config.firmware.version} (${firmwareBuffer.length} bytes)`);
  console.log(`Firmware CRC32: ${firmwareCrc32}`);
  console.log(`Block size: ${config.ota.blockSize} bytes`);
});
