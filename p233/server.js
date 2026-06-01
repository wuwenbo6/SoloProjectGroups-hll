const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const RIPv2Router = require('./router');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const routers = new Map();
const updateLogs = [];
const interfaceLogs = [];
const authLogs = [];
const MAX_LOGS = 100;

const SHARED_KEY_CHAIN = [
  { keyId: 1, key: 'ripv2-sim-secret-01' },
  { keyId: 2, key: 'ripv2-sim-secret-02' },
  { keyId: 3, key: 'ripv2-sim-backup-03' }
];

function initRouters() {
  const routerA = new RIPv2Router('Router-A', 5001, { keyChain: SHARED_KEY_CHAIN });
  routerA.addInterface('eth0', '192.168.1.0/24');
  routerA.addInterface('eth1', '10.0.0.0/24');
  routerA.addDirectlyConnectedNetwork('192.168.1.0/24', 'Direct', 1, 'eth0');
  routerA.addDirectlyConnectedNetwork('10.0.0.0/24', 'Direct', 1, 'eth1');
  routerA.addNeighbor('Router-B', '127.0.0.1', 5002);
  routerA.addNeighbor('Router-C', '127.0.0.1', 5003);

  const routerB = new RIPv2Router('Router-B', 5002, { keyChain: SHARED_KEY_CHAIN });
  routerB.addInterface('eth0', '192.168.2.0/24');
  routerB.addInterface('eth1', '172.16.0.0/24');
  routerB.addDirectlyConnectedNetwork('192.168.2.0/24', 'Direct', 1, 'eth0');
  routerB.addDirectlyConnectedNetwork('172.16.0.0/24', 'Direct', 1, 'eth1');
  routerB.addNeighbor('Router-A', '127.0.0.1', 5001);
  routerB.addNeighbor('Router-D', '127.0.0.1', 5004);

  const routerC = new RIPv2Router('Router-C', 5003, { keyChain: SHARED_KEY_CHAIN });
  routerC.addInterface('eth0', '192.168.3.0/24');
  routerC.addInterface('eth1', '10.1.0.0/24');
  routerC.addDirectlyConnectedNetwork('192.168.3.0/24', 'Direct', 1, 'eth0');
  routerC.addDirectlyConnectedNetwork('10.1.0.0/24', 'Direct', 1, 'eth1');
  routerC.addNeighbor('Router-A', '127.0.0.1', 5001);
  routerC.addNeighbor('Router-D', '127.0.0.1', 5004);

  const routerD = new RIPv2Router('Router-D', 5004, { keyChain: SHARED_KEY_CHAIN });
  routerD.addInterface('eth0', '192.168.4.0/24');
  routerD.addInterface('eth1', '172.17.0.0/24');
  routerD.addDirectlyConnectedNetwork('192.168.4.0/24', 'Direct', 1, 'eth0');
  routerD.addDirectlyConnectedNetwork('172.17.0.0/24', 'Direct', 1, 'eth1');
  routerD.addNeighbor('Router-B', '127.0.0.1', 5002);
  routerD.addNeighbor('Router-C', '127.0.0.1', 5003);

  [routerA, routerB, routerC, routerD].forEach(router => {
    routers.set(router.routerId, router);
    
    router.on('updateSent', (log) => {
      addUpdateLog(log);
      broadcastToClients({ type: 'updateSent', data: log });
    });

    router.on('updateReceived', (log) => {
      addUpdateLog(log);
      broadcastToClients({ type: 'updateReceived', data: log });
    });

    router.on('routeChanged', (data) => {
      broadcastToClients({ type: 'routeChanged', data });
      broadcastRoutingTables();
    });

    router.on('interfaceChanged', (data) => {
      addInterfaceLog(data);
      broadcastToClients({ type: 'interfaceChanged', data });
      broadcastRoutingTables();
    });

    router.on('authEvent', (data) => {
      addAuthLog(data);
      broadcastToClients({ type: 'authEvent', data });
    });

    router.start();
  });
}

function addInterfaceLog(log) {
  interfaceLogs.unshift(log);
  if (interfaceLogs.length > MAX_LOGS) {
    interfaceLogs.pop();
  }
}

function addAuthLog(log) {
  authLogs.unshift(log);
  if (authLogs.length > MAX_LOGS) {
    authLogs.pop();
  }
}

function addUpdateLog(log) {
  updateLogs.unshift(log);
  if (updateLogs.length > MAX_LOGS) {
    updateLogs.pop();
  }
}

function broadcastToClients(message) {
  const msgStr = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msgStr);
    }
  });
}

function broadcastRoutingTables() {
  const tables = [];
  routers.forEach(router => {
    tables.push(router.getInfo());
  });
  broadcastToClients({ type: 'routingTables', data: tables });
}

app.post('/api/interface/:routerId/:interfaceName/:status', (req, res) => {
  const { routerId, interfaceName, status } = req.params;
  
  const router = routers.get(routerId);
  if (!router) {
    return res.status(404).json({ error: 'Router not found' });
  }

  if (status !== 'up' && status !== 'down') {
    return res.status(400).json({ error: 'Invalid status. Must be "up" or "down"' });
  }

  const success = router.setInterfaceStatus(interfaceName, status);
  if (success) {
    res.json({ 
      success: true, 
      routerId, 
      interfaceName, 
      status,
      message: `Interface ${interfaceName} set to ${status}`
    });
  } else {
    res.status(400).json({ 
      success: false, 
      error: 'Failed to change interface status' 
    });
  }
});

app.get('/api/routers', (req, res) => {
  const routerInfos = [];
  routers.forEach(router => {
    routerInfos.push(router.getInfo());
  });
  res.json(routerInfos);
});

app.get('/api/export/zebra/:routerId', (req, res) => {
  const { routerId } = req.params;
  const router = routers.get(routerId);
  if (!router) {
    return res.status(404).json({ error: 'Router not found' });
  }
  const config = router.exportZebraConfig();
  const hostname = routerId.toLowerCase().replace(/[^a-z0-9]/g, '-');
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="${hostname}-zebra.conf"`);
  res.send(config);
});

app.post('/api/auth/key/:routerId/:keyId', (req, res) => {
  const { routerId, keyId } = req.params;
  const router = routers.get(routerId);
  if (!router) {
    return res.status(404).json({ error: 'Router not found' });
  }
  const keyIdNum = parseInt(keyId);
  const success = router.setAuthKeyId(keyIdNum);
  if (success) {
    res.json({ success: true, routerId, activeKeyId: keyIdNum });
  } else {
    res.status(400).json({ success: false, error: 'Key ID not found' });
  }
});

wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');

  const initialTables = [];
  routers.forEach(router => {
    initialTables.push(router.getInfo());
  });
  ws.send(JSON.stringify({ type: 'routingTables', data: initialTables }));
  ws.send(JSON.stringify({ type: 'updateLogs', data: updateLogs }));
  ws.send(JSON.stringify({ type: 'interfaceLogs', data: interfaceLogs }));
  ws.send(JSON.stringify({ type: 'authLogs', data: authLogs }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'setInterfaceStatus') {
        const { routerId, interfaceName, status } = data;
        const router = routers.get(routerId);
        
        if (router && (status === 'up' || status === 'down')) {
          router.setInterfaceStatus(interfaceName, status);
        }
      }

      if (data.type === 'setAuthKey') {
        const { routerId, keyId } = data;
        const router = routers.get(routerId);
        if (router) {
          router.setAuthKeyId(keyId);
          broadcastRoutingTables();
        }
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  initRouters();
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  routers.forEach(router => router.stop());
  process.exit(0);
});
