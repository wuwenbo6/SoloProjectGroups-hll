const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('./database');
const DroneSimulator = require('./droneSimulator');
const apiRoutes = require('./api');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'waypoints-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('只允许CSV文件'));
    }
  }
});

const db = new Database();
const droneSimulator = new DroneSimulator(wss, db);

app.use('/api', apiRoutes(db, upload, droneSimulator));

wss.on('connection', (ws) => {
  console.log('新的WebSocket连接已建立');
  
  ws.send(JSON.stringify({
    type: 'connection',
    status: 'connected',
    timestamp: Date.now()
  }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleClientMessage(ws, message);
    } catch (error) {
      console.error('解析WebSocket消息失败:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket连接已关闭');
  });

  ws.on('error', (error) => {
    console.error('WebSocket错误:', error);
  });
});

function handleClientMessage(ws, message) {
  switch (message.type) {
    case 'get_drones':
      ws.send(JSON.stringify({
        type: 'drones_status',
        drones: droneSimulator.getDronesStatus()
      }));
      break;
    case 'set_drone_count':
      droneSimulator.setDroneCount(message.count);
      broadcastDronesStatus();
      break;
    case 'start_fly':
      droneSimulator.startFlight();
      broadcastFlightStatus('started');
      break;
    case 'pause_fly':
      droneSimulator.pauseFlight();
      broadcastFlightStatus('paused');
      break;
    case 'stop_fly':
      droneSimulator.stopFlight();
      broadcastFlightStatus('stopped');
      break;
    case 'return_home':
      droneSimulator.returnHome();
      broadcastFlightStatus('returning_home');
      break;
    case 'set_speed':
      droneSimulator.setSpeed(message.speed);
      break;
    case 'set_waypoints':
      droneSimulator.setWaypoints(message.waypoints);
      break;
    case 'set_formation':
      droneSimulator.setFormation(message.positions);
      break;
    case 'set_lights':
      droneSimulator.setLights(message.lightConfig);
      broadcastLightConfig(message.lightConfig);
      break;
    case 'set_collision_avoidance':
      droneSimulator.setCollisionAvoidance(message.enabled);
      break;
    default:
      console.log('未知消息类型:', message.type);
  }
}

function broadcastDronesStatus() {
  const status = JSON.stringify({
    type: 'drones_status',
    drones: droneSimulator.getDronesStatus(),
    timestamp: Date.now()
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(status);
    }
  });
}

function broadcastFlightStatus(status) {
  const message = JSON.stringify({
    type: 'flight_status',
    status: status,
    timestamp: Date.now()
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastLightConfig(config) {
  const message = JSON.stringify({
    type: 'light_config',
    config: config,
    timestamp: Date.now()
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

droneSimulator.on('drones_update', broadcastDronesStatus);

server.listen(PORT, () => {
  console.log(`无人机编队服务器运行在端口 ${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`API: http://localhost:${PORT}/api`);
});

process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  droneSimulator.stop();
  db.close();
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});
