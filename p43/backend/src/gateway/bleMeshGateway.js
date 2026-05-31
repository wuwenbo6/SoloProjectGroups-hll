const mqtt = require('mqtt');
const EventEmitter = require('events');

class BleMeshGateway extends EventEmitter {
  constructor(brokerUrl = 'mqtt://localhost:1883') {
    super();
    this.brokerUrl = brokerUrl;
    this.client = null;
    this.devices = new Map();
    this.gatewayId = 'ble-gateway-001';
    this.connected = false;

    this.commandQueue = [];
    this.isProcessingQueue = false;
    this.batchSize = 20;
    this.commandDelay = 50;

    this.pendingStatusUpdates = new Map();
    this.statusBatchTimer = null;
    this.statusBatchInterval = 500;
    this.maxBatchSize = 50;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(this.brokerUrl, {
        clientId: this.gatewayId,
        clean: true
      });

      this.client.on('connect', () => {
        console.log(`BLE Mesh Gateway ${this.gatewayId} connected to MQTT broker`);
        this.connected = true;
        this.setupSubscriptions();
        this.initializeDevices();
        resolve();
      });

      this.client.on('error', (error) => {
        console.error('BLE Mesh Gateway error:', error);
        reject(error);
      });

      this.client.on('close', () => {
        this.connected = false;
        console.log('BLE Mesh Gateway disconnected');
      });
    });
  }

  setupSubscriptions() {
    this.client.subscribe('blemesh/command/#');
    this.client.subscribe('blemesh/control/+');

    this.client.on('message', (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        this.handleIncomingMessage(topic, data);
      } catch (e) {
        console.error('Failed to parse MQTT message:', e.message);
      }
    });
  }

  initializeDevices() {
    const deviceCount = 200;
    const areas = ['会议室A', '会议室B', '办公区A', '办公区B', '走廊', '大厅', '休息区'];
    
    for (let i = 1; i <= deviceCount; i++) {
      const device = {
        id: `light-${String(i).padStart(3, '0')}`,
        name: `灯具 ${i}`,
        area: areas[Math.floor(Math.random() * areas.length)],
        brightness: Math.floor(Math.random() * 100),
        colorTemperature: 3000 + Math.floor(Math.random() * 3000),
        online: true,
        lastUpdate: new Date().toISOString()
      };
      this.devices.set(device.id, device);
    }

    console.log(`Initialized ${this.devices.size} BLE Mesh devices`);
    this.publishDeviceList();
    this.startStatusUpdates();
  }

  handleIncomingMessage(topic, data) {
    if (topic.startsWith('blemesh/command/')) {
      this.handleCommand(topic, data);
    } else if (topic.startsWith('blemesh/control/')) {
      this.handleControl(topic, data);
    }
  }

  handleCommand(topic, data) {
    const command = topic.split('/').pop();
    
    switch (command) {
      case 'get-devices':
        this.publishDeviceList();
        break;
      case 'set-scene':
        this.applyScene(data.sceneId, data.deviceIds, data.areas);
        break;
      default:
        console.log('Unknown command:', command);
    }
  }

  handleControl(topic, data) {
    const deviceId = topic.split('/').pop();
    
    if (deviceId === 'all') {
      this.controlAllDevices(data);
    } else if (this.devices.has(deviceId)) {
      this.enqueueCommand(deviceId, data);
    } else {
      console.log(`Device ${deviceId} not found`);
    }
  }

  enqueueCommand(deviceId, data) {
    this.commandQueue.push({
      deviceId,
      data,
      timestamp: Date.now(),
      retries: 0
    });

    if (!this.isProcessingQueue) {
      this.processCommandQueue();
    }
  }

  async processCommandQueue() {
    if (this.commandQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }

    this.isProcessingQueue = true;

    const batch = this.commandQueue.splice(0, this.batchSize);

    for (const command of batch) {
      try {
        this.executeCommand(command);
      } catch (error) {
        console.error(`Failed to execute command for ${command.deviceId}:`, error.message);
        
        if (command.retries < 3) {
          command.retries++;
          this.commandQueue.push(command);
        }
      }
      
      await this.sleep(this.commandDelay);
    }

    setImmediate(() => this.processCommandQueue());
  }

  executeCommand(command) {
    const { deviceId, data } = command;
    
    if (!this.devices.has(deviceId)) {
      throw new Error(`Device ${deviceId} not found`);
    }

    const device = this.devices.get(deviceId);
    
    let updated = false;
    if (data.brightness !== undefined && device.brightness !== data.brightness) {
      device.brightness = Math.max(0, Math.min(100, data.brightness));
      updated = true;
    }
    if (data.colorTemperature !== undefined && device.colorTemperature !== data.colorTemperature) {
      device.colorTemperature = Math.max(2700, Math.min(6500, data.colorTemperature));
      updated = true;
    }
    if (data.online !== undefined && device.online !== data.online) {
      device.online = data.online;
      updated = true;
    }
    
    if (updated) {
      device.lastUpdate = new Date().toISOString();
      this.queueStatusUpdate(deviceId, device);
      this.emit('deviceUpdated', device);
    }
  }

  controlAllDevices(data) {
    const deviceIds = Array.from(this.devices.keys());
    console.log(`Queueing control command for ${deviceIds.length} devices`);
    
    deviceIds.forEach(deviceId => {
      this.enqueueCommand(deviceId, data);
    });
  }

  applyScene(sceneId, deviceIds = null, areas = null) {
    const scenes = {
      'meeting': { brightness: 80, colorTemperature: 4500 },
      'off-duty': { brightness: 10, colorTemperature: 3000 },
      'presentation': { brightness: 50, colorTemperature: 4000 },
      'lunch': { brightness: 30, colorTemperature: 3500 },
      'all-on': { brightness: 100, colorTemperature: 4000 },
      'all-off': { brightness: 0, colorTemperature: 4000 }
    };

    const scene = scenes[sceneId];
    if (!scene) {
      console.log(`Scene ${sceneId} not found`);
      return;
    }

    let targets;
    if (deviceIds && deviceIds.length > 0) {
      targets = deviceIds.filter(id => this.devices.has(id));
    } else if (areas && areas.length > 0) {
      targets = Array.from(this.devices.values())
        .filter(d => areas.includes(d.area))
        .map(d => d.id);
    } else {
      targets = Array.from(this.devices.keys());
    }

    console.log(`Queueing scene ${sceneId} for ${targets.length} devices`);
    
    targets.forEach(deviceId => {
      this.enqueueCommand(deviceId, scene);
    });
  }

  queueStatusUpdate(deviceId, device) {
    this.pendingStatusUpdates.set(deviceId, { ...device });

    if (!this.statusBatchTimer) {
      this.statusBatchTimer = setTimeout(() => {
        this.flushStatusBatch();
      }, this.statusBatchInterval);
    }

    if (this.pendingStatusUpdates.size >= this.maxBatchSize) {
      this.flushStatusBatch();
    }
  }

  flushStatusBatch() {
    if (this.statusBatchTimer) {
      clearTimeout(this.statusBatchTimer);
      this.statusBatchTimer = null;
    }

    if (this.pendingStatusUpdates.size === 0) {
      return;
    }

    const updates = Array.from(this.pendingStatusUpdates.values());
    
    try {
      this.client.publish('blemesh/status/batch', JSON.stringify(updates));
    } catch (error) {
      console.error('Failed to publish batch status:', error.message);
      
      updates.forEach(device => {
        this.client.publish(`blemesh/status/${device.id}`, JSON.stringify(device));
      });
    }

    this.pendingStatusUpdates.clear();
  }

  publishDeviceList() {
    const deviceList = Array.from(this.devices.values());
    this.client.publish('blemesh/status/devices', JSON.stringify(deviceList));
  }

  publishDeviceStatus(deviceId, device) {
    this.client.publish(`blemesh/status/${deviceId}`, JSON.stringify(device));
  }

  startStatusUpdates() {
    setInterval(() => {
      const deviceIds = Array.from(this.devices.keys());
      const randomDevice = deviceIds[Math.floor(Math.random() * deviceIds.length)];
      const device = this.devices.get(randomDevice);
      
      if (Math.random() < 0.1) {
        device.online = Math.random() > 0.05;
        device.lastUpdate = new Date().toISOString();
        this.queueStatusUpdate(randomDevice, device);
      }
    }, 5000);
  }

  getDevices() {
    return Array.from(this.devices.values());
  }

  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  disconnect() {
    if (this.statusBatchTimer) {
      clearTimeout(this.statusBatchTimer);
    }
    this.flushStatusBatch();
    
    if (this.client) {
      this.client.end();
    }
  }
}

module.exports = BleMeshGateway;
