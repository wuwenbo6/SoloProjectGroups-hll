const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const usb = require('usb');
const usbDetect = require('usb-detection');

let mainWindow;
let redirectedDevices = new Map();
let spiceConnection = null;
let redirectStats = {
  startTime: null,
  totalRedirects: 0,
  totalReleases: 0,
  totalDevicesEverRedirected: 0,
  totalBytesTransferred: 0,
  totalPacketsTransferred: 0,
  totalErrors: 0,
  totalBackpressureEvents: 0,
  totalIsoFrames: 0,
  totalIsoErrors: 0,
  redirectHistory: []
};

class TokenBucket {
  constructor(capacity, refillRate) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
    this.creditWindow = capacity;
    this.totalConsumed = 0;
    this.totalRefilled = 0;
    this.exhaustionCount = 0;
    this.onExhausted = null;
  }

  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.totalRefilled += newTokens;
    this.lastRefill = now;
  }

  consume(amount = 1) {
    this.refill();
    if (this.tokens >= amount) {
      this.tokens -= amount;
      this.totalConsumed += amount;
      return true;
    }
    this.exhaustionCount++;
    if (this.onExhausted) {
      this.onExhausted(amount, this.tokens);
    }
    return false;
  }

  getTokens() {
    this.refill();
    return this.tokens;
  }

  setCapacity(capacity) {
    this.capacity = capacity;
    this.creditWindow = capacity;
    this.tokens = Math.min(this.tokens, capacity);
  }

  setCreditWindow(window) {
    this.creditWindow = window;
  }

  getStats() {
    return {
      tokens: this.tokens,
      capacity: this.capacity,
      creditWindow: this.creditWindow,
      refillRate: this.refillRate,
      totalConsumed: this.totalConsumed,
      totalRefilled: this.totalRefilled,
      exhaustionCount: this.exhaustionCount,
      utilizationPercent: this.capacity > 0
        ? ((this.capacity - this.tokens) / this.capacity * 100).toFixed(1)
        : '0.0'
    };
  }
}

class USBChannel {
  constructor(channelId, device, endpoint) {
    this.id = channelId;
    this.device = device;
    this.endpoint = endpoint;
    this.channelType = 'bulk';
    this.status = 'idle';
    this.createdAt = new Date().toISOString();
    this.dataTransferred = 0;
    this.packetsTransferred = 0;
    this.errors = 0;
    this.lastTransferAt = null;
    this.backpressureCount = 0;

    this.tokenBucket = new TokenBucket(1000, 500);

    this.tokenBucket.onExhausted = (requested, available) => {
      this.backpressureCount++;
      redirectStats.totalBackpressureEvents++;
      if (mainWindow) {
        mainWindow.webContents.send('channel-backpressure', {
          channelId: this.id,
          requested,
          available,
          backpressureCount: this.backpressureCount
        });
      }
    };

    this.transferQueue = [];
    this.isProcessing = false;
    this.maxRetries = 5;
  }

  setTokenParameters(capacity, refillRate, creditWindow) {
    this.tokenBucket.setCapacity(capacity);
    this.tokenBucket.refillRate = refillRate;
    if (creditWindow !== undefined) {
      this.tokenBucket.setCreditWindow(creditWindow);
    }
  }

  getTokenCount() {
    return this.tokenBucket.getTokens();
  }

  getTokenStats() {
    return this.tokenBucket.getStats();
  }

  async submitTransfer(data) {
    return new Promise((resolve, reject) => {
      this.transferQueue.push({
        data,
        resolve,
        reject,
        timestamp: Date.now(),
        retries: 0
      });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.transferQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.status = 'transferring';

    while (this.transferQueue.length > 0) {
      const transfer = this.transferQueue[0];
      const dataSize = transfer.data.length;
      const tokensNeeded = Math.ceil(dataSize / 512);

      if (this.tokenBucket.consume(tokensNeeded)) {
        this.transferQueue.shift();
        try {
          const result = await this.performBulkTransfer(transfer.data);
          this.dataTransferred += dataSize;
          this.packetsTransferred++;
          this.lastTransferAt = new Date().toISOString();
          redirectStats.totalBytesTransferred += dataSize;
          redirectStats.totalPacketsTransferred++;
          transfer.resolve(result);
        } catch (error) {
          this.errors++;
          redirectStats.totalErrors++;
          transfer.reject(error);
        }
      } else {
        transfer.retries++;
        if (transfer.retries > this.maxRetries) {
          this.transferQueue.shift();
          this.errors++;
          redirectStats.totalErrors++;
          transfer.reject(new Error(
            `传输超时: 通道 ${this.id} 令牌耗尽, 需要 ${tokensNeeded}, 重试 ${this.maxRetries} 次后放弃`
          ));
        } else {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }
    }

    this.isProcessing = false;
    this.status = 'idle';
  }

  async performBulkTransfer(data) {
    await new Promise(resolve => setTimeout(resolve, 10));
    return {
      success: true,
      bytesTransferred: data.length,
      timestamp: new Date().toISOString()
    };
  }

  getStats() {
    return {
      id: this.id,
      channelType: this.channelType,
      status: this.status,
      endpoint: this.endpoint,
      createdAt: this.createdAt,
      dataTransferred: this.dataTransferred,
      packetsTransferred: this.packetsTransferred,
      errors: this.errors,
      lastTransferAt: this.lastTransferAt,
      queueLength: this.transferQueue.length,
      backpressureCount: this.backpressureCount,
      tokenStats: this.getTokenStats()
    };
  }

  close() {
    this.status = 'closed';
    for (const transfer of this.transferQueue) {
      transfer.reject(new Error(`通道 ${this.id} 已关闭`));
    }
    this.transferQueue = [];
  }
}

class ISOChannel extends USBChannel {
  constructor(channelId, device, endpoint) {
    super(channelId, device, endpoint);
    this.channelType = 'iso';
    this.frameSize = endpoint.maxPacketSize || 192;
    this.frameInterval = endpoint.interval || 1;
    this.framesPerBuffer = 8;
    this.currentFrame = 0;
    this.isoPacketsPerFrame = 1;
    this.isoErrors = 0;
    this.isoOverruns = 0;
    this.isoUnderruns = 0;
    this.frameSchedule = [];
    this.isStreaming = false;
    this.streamInterval = null;
    this.sampleRate = endpoint.sampleRate || 48000;
    this.bitsPerSample = endpoint.bitsPerSample || 16;
    this.channels = endpoint.channels || 2;
    this.latencyMs = 0;

    this.tokenBucket = new TokenBucket(2000, 2000);
    this.tokenBucket.onExhausted = (requested, available) => {
      this.backpressureCount++;
      this.isoOverruns++;
      redirectStats.totalBackpressureEvents++;
      if (mainWindow) {
        mainWindow.webContents.send('channel-backpressure', {
          channelId: this.id,
          requested,
          available,
          backpressureCount: this.backpressureCount,
          channelType: 'iso',
          isoOverruns: this.isoOverruns
        });
      }
    };
  }

  startStreaming() {
    if (this.isStreaming) return;
    this.isStreaming = true;
    this.status = 'streaming';

    const intervalMs = this.frameInterval;
    this.streamInterval = setInterval(() => {
      this._processFrame();
    }, intervalMs);

    if (mainWindow) {
      mainWindow.webContents.send('iso-stream-started', {
        channelId: this.id,
        frameSize: this.frameSize,
        sampleRate: this.sampleRate,
        bitsPerSample: this.bitsPerSample,
        channels: this.channels
      });
    }
  }

  stopStreaming() {
    if (!this.isStreaming) return;
    this.isStreaming = false;
    this.status = 'idle';

    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
    }

    if (mainWindow) {
      mainWindow.webContents.send('iso-stream-stopped', {
        channelId: this.id
      });
    }
  }

  _processFrame() {
    if (!this.isStreaming) return;

    const frameDataSize = this.frameSize * this.framesPerBuffer;
    const tokensNeeded = Math.ceil(frameDataSize / 512);

    if (this.tokenBucket.consume(tokensNeeded)) {
      this.dataTransferred += frameDataSize;
      this.packetsTransferred++;
      this.currentFrame++;
      this.lastTransferAt = new Date().toISOString();
      this.latencyMs = Math.max(0, this.latencyMs - 0.5);

      redirectStats.totalBytesTransferred += frameDataSize;
      redirectStats.totalPacketsTransferred++;
      redirectStats.totalIsoFrames++;

      const scheduleEntry = {
        frame: this.currentFrame,
        timestamp: Date.now(),
        size: frameDataSize,
        status: 'completed'
      };
      this.frameSchedule.push(scheduleEntry);
      if (this.frameSchedule.length > 100) {
        this.frameSchedule = this.frameSchedule.slice(-50);
      }
    } else {
      this.isoUnderruns++;
      redirectStats.totalIsoErrors++;

      this.frameSchedule.push({
        frame: this.currentFrame,
        timestamp: Date.now(),
        size: 0,
        status: 'underrun'
      });
    }
  }

  async submitISOTransfer(data) {
    const tokensNeeded = Math.ceil(data.length / 512);

    if (!this.tokenBucket.consume(tokensNeeded)) {
      this.isoOverruns++;
      redirectStats.totalIsoErrors++;
      return {
        success: false,
        message: `ISO 通道 ${this.id} 信用不足, 需要 ${tokensNeeded} 令牌`
      };
    }

    this.dataTransferred += data.length;
    this.packetsTransferred++;
    this.currentFrame++;
    this.lastTransferAt = new Date().toISOString();

    redirectStats.totalBytesTransferred += data.length;
    redirectStats.totalPacketsTransferred++;
    redirectStats.totalIsoFrames++;

    return {
      success: true,
      bytesTransferred: data.length,
      frame: this.currentFrame,
      timestamp: new Date().toISOString()
    };
  }

  getISOStats() {
    return {
      frameSize: this.frameSize,
      frameInterval: this.frameInterval,
      framesPerBuffer: this.framesPerBuffer,
      currentFrame: this.currentFrame,
      isoErrors: this.isoErrors,
      isoOverruns: this.isoOverruns,
      isoUnderruns: this.isoUnderruns,
      isStreaming: this.isStreaming,
      sampleRate: this.sampleRate,
      bitsPerSample: this.bitsPerSample,
      channels: this.channels,
      latencyMs: this.latencyMs,
      recentFrames: this.frameSchedule.slice(-10)
    };
  }

  getStats() {
    return {
      ...super.getStats(),
      channelType: this.channelType,
      isoStats: this.getISOStats()
    };
  }

  close() {
    this.stopStreaming();
    super.close();
  }
}

class USBChannelManager {
  constructor() {
    this.channels = new Map();
    this.channelCounter = 0;
  }

  createChannel(device, endpoint) {
    const channelId = `ch_${++this.channelCounter}`;
    const isIso = endpoint && endpoint.type === 'iso';
    const channel = isIso
      ? new ISOChannel(channelId, device, endpoint)
      : new USBChannel(channelId, device, endpoint);
    this.channels.set(channelId, channel);
    return channel;
  }

  getChannel(channelId) {
    return this.channels.get(channelId);
  }

  closeChannel(channelId) {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.close();
      this.channels.delete(channelId);
      return true;
    }
    return false;
  }

  getChannelsForDevice(deviceId) {
    return Array.from(this.channels.values()).filter(
      ch => ch.device && ch.device.id === deviceId
    );
  }

  getAllChannels() {
    return Array.from(this.channels.values()).map(ch => ch.getStats());
  }

  closeAllChannels() {
    for (const channel of this.channels.values()) {
      channel.close();
    }
    this.channels.clear();
  }
}

const channelManager = new USBChannelManager();

class RedirectedUSBDevice {
  constructor(vendorId, productId, deviceInfo) {
    this.vendorId = vendorId;
    this.productId = productId;
    this.id = `${vendorId}:${productId}`;
    this.deviceInfo = deviceInfo;
    this.channels = [];
    this.redirectedAt = new Date().toISOString();
    this.status = 'connected';
  }

  createChannel(endpoint) {
    const channel = channelManager.createChannel(this, endpoint);
    this.channels.push(channel.id);
    return channel;
  }

  getChannels() {
    return this.channels
      .map(id => channelManager.getChannel(id))
      .filter(ch => ch !== undefined);
  }

  closeAllChannels() {
    for (const channelId of this.channels) {
      channelManager.closeChannel(channelId);
    }
    this.channels = [];
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function getUSBDevices() {
  const devices = usb.getDeviceList();
  return devices.map(device => ({
    id: `${device.deviceDescriptor.idVendor}:${device.deviceDescriptor.idProduct}`,
    vendorId: device.deviceDescriptor.idVendor,
    productId: device.deviceDescriptor.idProduct,
    vendorName: getVendorName(device.deviceDescriptor.idVendor),
    productName: device.productDescriptor || '未知设备',
    deviceAddress: device.deviceAddress,
    busNumber: device.busNumber,
    deviceClass: device.deviceDescriptor.bDeviceClass,
    isAudioDevice: device.deviceDescriptor.bDeviceClass === 0x01,
    isRedirected: redirectedDevices.has(`${device.deviceDescriptor.idVendor}:${device.deviceDescriptor.idProduct}`)
  }));
}

function getVendorName(vendorId) {
  const vendorMap = {
    0x05ac: 'Apple Inc.',
    0x8087: 'Intel Corp.',
    0x1d6b: 'Linux Foundation',
    0x046d: 'Logitech Inc.',
    0x045e: 'Microsoft Corp.',
    0x0781: 'SanDisk Corp.',
    0x0951: 'Kingston Technology',
    0x18d1: 'Google Inc.',
    0x04f2: 'Chicony Electronics',
    0x0bda: 'Realtek Semiconductor',
    0x0403: 'Future Technology Devices',
    0x067b: 'Prolific Technology',
    0x0a5c: 'Broadcom Corp.',
    0x0489: 'Foxconn / Hon Hai',
    0x13d3: 'IMC Networks',
    0x0c45: 'Microdia',
    0x5986: 'Acer, Inc.',
    0x2232: 'Silicon Motion',
    0x0471: 'Philips',
    0x1e4e: 'Sharkoon',
    0x0d8c: 'C-Media Electronics',
    0x1395: 'Focusrite-Novation',
    0x1235: 'Focusrite-Novation',
    0x17cc: 'Native Instruments'
  };
  return vendorMap[vendorId] || `0x${vendorId.toString(16).padStart(4, '0')}`;
}

function getDeviceInfo(vendorId, productId) {
  const devices = usb.getDeviceList();
  return devices.find(d =>
    d.deviceDescriptor.idVendor === vendorId &&
    d.deviceDescriptor.idProduct === productId
  );
}

function createChannelsForDevice(redirectedDevice, deviceInfo) {
  const channelsCreated = [];
  try {
    const isAudio = deviceInfo && deviceInfo.deviceDescriptor &&
      deviceInfo.deviceDescriptor.bDeviceClass === 0x01;

    for (let i = 1; i <= 2; i++) {
      const channel = redirectedDevice.createChannel({
        address: i,
        type: 'bulk',
        direction: i % 2 === 0 ? 'in' : 'out'
      });
      channel.setTokenParameters(1000 + i * 200, 500 + i * 100, 1000 + i * 200);
      channelsCreated.push(channel.getStats());
    }

    if (isAudio) {
      const isoOutChannel = redirectedDevice.createChannel({
        address: 3,
        type: 'iso',
        direction: 'out',
        maxPacketSize: 192,
        interval: 1,
        sampleRate: 48000,
        bitsPerSample: 16,
        channels: 2
      });
      isoOutChannel.setTokenParameters(2000, 2000, 2000);
      channelsCreated.push(isoOutChannel.getStats());

      const isoInChannel = redirectedDevice.createChannel({
        address: 4,
        type: 'iso',
        direction: 'in',
        maxPacketSize: 192,
        interval: 1,
        sampleRate: 48000,
        bitsPerSample: 16,
        channels: 2
      });
      isoInChannel.setTokenParameters(2000, 2000, 2000);
      channelsCreated.push(isoInChannel.getStats());

      console.log(`为音频设备 ${redirectedDevice.id} 创建了 2 Bulk + 2 ISO 通道`);
    } else {
      const extraBulk = redirectedDevice.createChannel({
        address: 3,
        type: 'bulk',
        direction: 'out'
      });
      extraBulk.setTokenParameters(1600, 800, 1600);
      channelsCreated.push(extraBulk.getStats());
      console.log(`为设备 ${redirectedDevice.id} 创建了 3 个 Bulk 通道`);
    }
  } catch (error) {
    console.error('创建通道失败:', error);
  }
  return channelsCreated;
}

async function reenumerateDevice(device) {
  console.log('重新枚举设备:', device.id);
  await new Promise(resolve => setTimeout(resolve, 200));
  const freshDevices = usb.getDeviceList();
  const found = freshDevices.find(d =>
    d.deviceDescriptor.idVendor === device.vendorId &&
    d.deviceDescriptor.idProduct === device.productId
  );
  return {
    success: !!found,
    device: device,
    found: !!found,
    reenumeratedAt: new Date().toISOString()
  };
}

ipcMain.handle('get-usb-devices', () => {
  return getUSBDevices();
});

ipcMain.handle('connect-spice', async (event, connectionParams) => {
  try {
    spiceConnection = {
      host: connectionParams.host,
      port: connectionParams.port,
      password: connectionParams.password,
      connected: true,
      connectedAt: new Date().toISOString()
    };
    redirectStats.startTime = redirectStats.startTime || new Date().toISOString();
    return {
      success: true,
      message: `已连接到 SPICE 服务器 ${connectionParams.host}:${connectionParams.port}`,
      connection: spiceConnection
    };
  } catch (error) {
    return { success: false, message: `连接失败: ${error.message}` };
  }
});

ipcMain.handle('disconnect-spice', async () => {
  try {
    for (const [deviceId, device] of redirectedDevices) {
      await stopUsbRedirect(device.vendorId, device.productId);
    }
    spiceConnection = null;
    return { success: true, message: '已断开 SPICE 连接' };
  } catch (error) {
    return { success: false, message: `断开连接失败: ${error.message}` };
  }
});

ipcMain.handle('get-spice-connection', () => {
  return spiceConnection;
});

ipcMain.handle('redirect-usb-device', async (event, vendorId, productId) => {
  try {
    if (!spiceConnection || !spiceConnection.connected) {
      return { success: false, message: '请先连接到 SPICE 服务器' };
    }

    const deviceId = `${vendorId}:${productId}`;
    if (redirectedDevices.has(deviceId)) {
      return { success: false, message: '设备已在重定向中' };
    }

    const device = getDeviceInfo(vendorId, productId);
    if (!device) {
      return { success: false, message: '未找到指定设备' };
    }

    const result = await startUsbRedirect(vendorId, productId);

    if (result.success) {
      const redirectedDevice = new RedirectedUSBDevice(vendorId, productId, device);
      redirectedDevices.set(deviceId, redirectedDevice);

      const channels = createChannelsForDevice(redirectedDevice, device);

      const reenumResult = await reenumerateDevice({
        id: deviceId, vendorId, productId
      });

      result.channels = channels;
      result.reenumerated = reenumResult;

      redirectStats.totalRedirects++;
      redirectStats.totalDevicesEverRedirected++;
      redirectStats.redirectHistory.push({
        action: 'redirect',
        deviceId,
        vendorId,
        productId,
        timestamp: new Date().toISOString(),
        channelCount: channels.length
      });

      if (mainWindow) {
        mainWindow.webContents.send('channels-created', {
          deviceId,
          channels
        });
      }
    }

    return result;
  } catch (error) {
    return { success: false, message: `重定向失败: ${error.message}` };
  }
});

ipcMain.handle('release-usb-device', async (event, vendorId, productId) => {
  try {
    const deviceId = `${vendorId}:${productId}`;
    const redirectedDevice = redirectedDevices.get(deviceId);
    if (redirectedDevice) {
      redirectedDevice.closeAllChannels();
    }
    const result = await stopUsbRedirect(vendorId, productId);
    if (result.success) {
      redirectStats.totalReleases++;
      redirectStats.redirectHistory.push({
        action: 'release',
        deviceId,
        vendorId,
        productId,
        timestamp: new Date().toISOString()
      });
      redirectedDevices.delete(deviceId);
    }
    return result;
  } catch (error) {
    return { success: false, message: `释放设备失败: ${error.message}` };
  }
});

async function startUsbRedirect(vendorId, productId) {
  try {
    console.log(`Starting USB redirect: ${vendorId}:${productId}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return {
      success: true,
      message: `设备 0x${vendorId.toString(16).padStart(4, '0')}:0x${productId.toString(16).padStart(4, '0')} 已成功重定向到远程虚拟机`
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function stopUsbRedirect(vendorId, productId) {
  try {
    console.log(`Stopping USB redirect: ${vendorId}:${productId}`);
    await new Promise(resolve => setTimeout(resolve, 300));
    return {
      success: true,
      message: `设备 0x${vendorId.toString(16).padStart(4, '0')}:0x${productId.toString(16).padStart(4, '0')} 已成功释放`
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

ipcMain.handle('refresh-devices', () => {
  return getUSBDevices();
});

ipcMain.handle('get-device-channels', async (event, vendorId, productId) => {
  const deviceId = `${vendorId}:${productId}`;
  const redirectedDevice = redirectedDevices.get(deviceId);
  if (!redirectedDevice) {
    return { success: false, message: '设备未重定向' };
  }
  const channels = redirectedDevice.getChannels().map(ch => ch.getStats());
  return { success: true, channels };
});

ipcMain.handle('get-all-channels', async () => {
  return { success: true, channels: channelManager.getAllChannels() };
});

ipcMain.handle('create-usb-channel', async (event, vendorId, productId, endpointConfig) => {
  const deviceId = `${vendorId}:${productId}`;
  const redirectedDevice = redirectedDevices.get(deviceId);
  if (!redirectedDevice) {
    return { success: false, message: '设备未重定向' };
  }
  const channel = redirectedDevice.createChannel(endpointConfig || {});
  return { success: true, channel: channel.getStats(), message: '通道创建成功' };
});

ipcMain.handle('close-usb-channel', async (event, channelId) => {
  const success = channelManager.closeChannel(channelId);
  return { success, message: success ? '通道已关闭' : '通道不存在' };
});

ipcMain.handle('set-channel-token-params', async (event, channelId, capacity, refillRate, creditWindow) => {
  const channel = channelManager.getChannel(channelId);
  if (!channel) {
    return { success: false, message: '通道不存在' };
  }
  channel.setTokenParameters(capacity, refillRate, creditWindow);
  return { success: true, channel: channel.getStats(), message: '令牌参数已更新' };
});

ipcMain.handle('get-channel-stats', async (event, channelId) => {
  const channel = channelManager.getChannel(channelId);
  if (!channel) {
    return { success: false, message: '通道不存在' };
  }
  return { success: true, stats: channel.getStats() };
});

ipcMain.handle('submit-bulk-transfer', async (event, channelId, data) => {
  const channel = channelManager.getChannel(channelId);
  if (!channel) {
    return { success: false, message: '通道不存在' };
  }
  try {
    const result = await channel.submitTransfer(data);
    return {
      success: true,
      result,
      tokens: channel.getTokenCount(),
      tokenStats: channel.getTokenStats()
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('start-iso-stream', async (event, channelId) => {
  const channel = channelManager.getChannel(channelId);
  if (!channel || channel.channelType !== 'iso') {
    return { success: false, message: 'ISO 通道不存在' };
  }
  channel.startStreaming();
  return {
    success: true,
    message: `ISO 流已启动: ${channel.id}`,
    isoStats: channel.getISOStats()
  };
});

ipcMain.handle('stop-iso-stream', async (event, channelId) => {
  const channel = channelManager.getChannel(channelId);
  if (!channel || channel.channelType !== 'iso') {
    return { success: false, message: 'ISO 通道不存在' };
  }
  channel.stopStreaming();
  return {
    success: true,
    message: `ISO 流已停止: ${channel.id}`,
    isoStats: channel.getISOStats()
  };
});

ipcMain.handle('submit-iso-transfer', async (event, channelId, data) => {
  const channel = channelManager.getChannel(channelId);
  if (!channel || channel.channelType !== 'iso') {
    return { success: false, message: 'ISO 通道不存在' };
  }
  try {
    const result = await channel.submitISOTransfer(data);
    return {
      success: result.success,
      result,
      tokenStats: channel.getTokenStats(),
      isoStats: channel.getISOStats()
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-redirect-stats', async () => {
  return {
    success: true,
    stats: {
      ...redirectStats,
      currentRedirectedDevices: redirectedDevices.size,
      currentChannels: channelManager.getAllChannels().length,
      uptimeSeconds: redirectStats.startTime
        ? Math.floor((Date.now() - new Date(redirectStats.startTime).getTime()) / 1000)
        : 0,
      channels: channelManager.getAllChannels()
    }
  };
});

ipcMain.handle('export-stats', async () => {
  try {
    const statsData = {
      exportedAt: new Date().toISOString(),
      spiceConnection: spiceConnection ? {
        host: spiceConnection.host,
        port: spiceConnection.port,
        connectedAt: spiceConnection.connectedAt
      } : null,
      summary: {
        uptimeSeconds: redirectStats.startTime
          ? Math.floor((Date.now() - new Date(redirectStats.startTime).getTime()) / 1000)
          : 0,
        totalRedirects: redirectStats.totalRedirects,
        totalReleases: redirectStats.totalReleases,
        totalDevicesEverRedirected: redirectStats.totalDevicesEverRedirected,
        currentRedirectedDevices: redirectedDevices.size,
        totalBytesTransferred: redirectStats.totalBytesTransferred,
        totalPacketsTransferred: redirectStats.totalPacketsTransferred,
        totalErrors: redirectStats.totalErrors,
        totalBackpressureEvents: redirectStats.totalBackpressureEvents,
        totalIsoFrames: redirectStats.totalIsoFrames,
        totalIsoErrors: redirectStats.totalIsoErrors
      },
      channels: channelManager.getAllChannels(),
      currentDevices: Array.from(redirectedDevices.values()).map(d => ({
        id: d.id,
        vendorId: d.vendorId,
        productId: d.productId,
        redirectedAt: d.redirectedAt,
        channelCount: d.channels.length
      })),
      redirectHistory: redirectStats.redirectHistory
    };

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '导出重定向统计',
      defaultPath: `spice-usb-stats-${Date.now()}.json`,
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'CSV', extensions: ['csv'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (canceled || !filePath) {
      return { success: false, message: '已取消导出' };
    }

    if (filePath.endsWith('.csv')) {
      const csv = generateCSV(statsData);
      fs.writeFileSync(filePath, csv, 'utf-8');
    } else {
      fs.writeFileSync(filePath, JSON.stringify(statsData, null, 2), 'utf-8');
    }

    return { success: true, message: `统计已导出到: ${filePath}`, filePath };
  } catch (error) {
    return { success: false, message: `导出失败: ${error.message}` };
  }
});

function generateCSV(statsData) {
  const lines = [];
  lines.push('SPICE USB 重定向统计报告');
  lines.push(`导出时间,${statsData.exportedAt}`);
  lines.push('');

  lines.push('=== 汇总 ===');
  const s = statsData.summary;
  lines.push(`运行时间 (秒),${s.uptimeSeconds}`);
  lines.push(`总重定向次数,${s.totalRedirects}`);
  lines.push(`总释放次数,${s.totalReleases}`);
  lines.push(`曾重定向设备数,${s.totalDevicesEverRedirected}`);
  lines.push(`当前重定向设备数,${s.currentRedirectedDevices}`);
  lines.push(`总传输字节,${s.totalBytesTransferred}`);
  lines.push(`总传输包数,${s.totalPacketsTransferred}`);
  lines.push(`总错误数,${s.totalErrors}`);
  lines.push(`背压事件,${s.totalBackpressureEvents}`);
  lines.push(`ISO帧数,${s.totalIsoFrames}`);
  lines.push(`ISO错误数,${s.totalIsoErrors}`);
  lines.push('');

  lines.push('=== 通道详情 ===');
  lines.push('通道ID,类型,状态,端点,方向,已传输字节,包数,错误,背压,令牌容量,令牌剩余,ISO帧,ISO溢出,ISO欠载');
  for (const ch of statsData.channels) {
    const iso = ch.isoStats || {};
    lines.push([
      ch.id,
      ch.channelType || 'bulk',
      ch.status,
      ch.endpoint?.address || '',
      ch.endpoint?.direction || '',
      ch.dataTransferred,
      ch.packetsTransferred,
      ch.errors,
      ch.backpressureCount,
      ch.tokenStats?.capacity || 0,
      Math.floor(ch.tokenStats?.tokens || 0),
      iso.currentFrame || 0,
      iso.isoOverruns || 0,
      iso.isoUnderruns || 0
    ].join(','));
  }
  lines.push('');

  lines.push('=== 重定向历史 ===');
  lines.push('操作,设备ID,厂商ID,产品ID,时间戳,通道数');
  for (const h of statsData.redirectHistory) {
    lines.push([
      h.action,
      h.deviceId,
      h.vendorId,
      h.productId,
      h.timestamp,
      h.channelCount || ''
    ].join(','));
  }

  return lines.join('\n');
}

app.whenReady().then(() => {
  createWindow();
  usbDetect.startMonitoring();

  usbDetect.on('add', async (device) => {
    const deviceId = `${device.vendorId}:${device.productId}`;

    if (mainWindow) {
      mainWindow.webContents.send('usb-device-added', {
        id: deviceId,
        vendorId: device.vendorId,
        productId: device.productId,
        deviceName: device.deviceName || '未知设备',
        manufacturer: device.manufacturer || '未知厂商',
        serialNumber: device.serialNumber || '',
        isRedirected: false
      });
    }

    if (spiceConnection && spiceConnection.connected && !redirectedDevices.has(deviceId)) {
      console.log(`检测到新设备 ${deviceId}，已连接SPICE，自动创建通道`);

      const redirectedDevice = new RedirectedUSBDevice(
        device.vendorId, device.productId, null
      );
      redirectedDevices.set(deviceId, redirectedDevice);

      const channels = createChannelsForDevice(redirectedDevice, null);

      await reenumerateDevice({
        id: deviceId,
        vendorId: device.vendorId,
        productId: device.productId
      });

      redirectStats.totalRedirects++;
      redirectStats.totalDevicesEverRedirected++;
      redirectStats.redirectHistory.push({
        action: 'auto-redirect',
        deviceId,
        vendorId: device.vendorId,
        productId: device.productId,
        timestamp: new Date().toISOString(),
        channelCount: channels.length
      });

      if (mainWindow) {
        mainWindow.webContents.send('channels-created', {
          deviceId,
          channels
        });
        mainWindow.webContents.send('usb-device-updated', {
          id: deviceId,
          isRedirected: true
        });
      }
    }
  });

  usbDetect.on('remove', (device) => {
    const deviceId = `${device.vendorId}:${device.productId}`;

    if (mainWindow) {
      mainWindow.webContents.send('usb-device-removed', {
        id: deviceId,
        vendorId: device.vendorId,
        productId: device.productId
      });
    }

    const redirectedDevice = redirectedDevices.get(deviceId);
    if (redirectedDevice) {
      redirectedDevice.closeAllChannels();
      redirectedDevices.delete(deviceId);
      redirectStats.totalReleases++;
      redirectStats.redirectHistory.push({
        action: 'hot-unplug',
        deviceId,
        vendorId: device.vendorId,
        productId: device.productId,
        timestamp: new Date().toISOString()
      });
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  usbDetect.stopMonitoring();
  channelManager.closeAllChannels();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  usbDetect.stopMonitoring();
  channelManager.closeAllChannels();
});
