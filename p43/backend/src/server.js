require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');

const { initDatabase } = require('./models');
const MqttBroker = require('./mqtt/broker');
const BleMeshGateway = require('./gateway/bleMeshGateway');
const createRoutes = require('./routes');
const Scheduler = require('./services/Scheduler');
const AutomationEngine = require('./services/AutomationEngine');
const logService = require('./services/LogService');
const energyService = require('./services/EnergyService');
const daylightService = require('./services/DaylightService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let mqttBroker;
let mqttClient;
let bleGateway;
let scheduler;
let automationEngine;

async function startServer() {
  try {
    await initDatabase();

    mqttBroker = new MqttBroker();
    mqttBroker.start();

    await new Promise(resolve => setTimeout(resolve, 1000));

    mqttClient = mqtt.connect('mqtt://localhost:1883', {
      clientId: 'backend-server',
      clean: true
    });

    mqttClient.on('connect', () => {
      console.log('Backend MQTT client connected');
      
      mqttClient.subscribe('blemesh/status/#');
    });

    mqttClient.on('message', (topic, message) => {
      if (topic.startsWith('blemesh/status/')) {
        try {
          const data = JSON.parse(message.toString());
          
          if (topic === 'blemesh/status/batch') {
            io.emit('deviceStatusBatch', data);
          } else if (topic === 'blemesh/status/devices') {
            io.emit('deviceList', data);
          } else {
            io.emit('deviceStatus', data);
          }
        } catch (e) {
          console.error('Failed to parse status message:', e.message);
        }
      }
    });

    bleGateway = new BleMeshGateway('mqtt://localhost:1883');
    await bleGateway.connect();

    scheduler = new Scheduler(mqttClient, bleGateway);
    await scheduler.start();

    automationEngine = new AutomationEngine(mqttClient, bleGateway);
    automationEngine.start();

    const devices = bleGateway.getDevices();
    energyService.start(devices);

    daylightService.start(mqttClient, bleGateway);

    bleGateway.on('deviceUpdated', (device) => {
      energyService.updateDeviceState(device.id, device.brightness, device.online, device.area);
    });

    const routes = createRoutes(mqttClient, bleGateway, scheduler, automationEngine, logService, energyService, daylightService);
    app.use('/api', routes);

    app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        mqttConnected: mqttClient.connected,
        gatewayConnected: bleGateway.connected,
        deviceCount: bleGateway.devices.size
      });
    });

    io.on('connection', (socket) => {
      console.log('Client connected via Socket.io');
      
      socket.on('controlDevice', (data) => {
        mqttClient.publish(`blemesh/control/${data.deviceId}`, JSON.stringify(data));
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected from Socket.io');
      });
    });

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API: http://localhost:${PORT}/api`);
      console.log(`Socket.io: ws://localhost:${PORT}`);
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
    await bleGateway.applyScene('meeting');

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  
  if (scheduler) scheduler.stop();
  if (automationEngine) automationEngine.stop();
  if (daylightService) daylightService.stop();
  if (energyService) energyService.stop();
  if (bleGateway) bleGateway.disconnect();
  if (mqttClient) mqttClient.end();
  if (mqttBroker) mqttBroker.stop();
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

startServer();
