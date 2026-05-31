const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const {
  initDatabase,
  getAllAPs,
  getAPsByFloor,
  addAP,
  deleteAP,
  addPositionHistory,
  getPositionHistory,
  getAllRecentPositions,
  addFingerprint,
  getBuilding,
  getHeatmapData,
  getDeviceIds,
  getPositionsByTimeRange
} = require('./database');
const { 
  trilaterate, 
  measurementFilter, 
  positionSmoother 
} = require('./trilateration');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('../web'));

initDatabase();

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(ws, data);
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected');
  });
});

function handleWebSocketMessage(ws, data) {
  switch (data.type) {
    case 'position_update':
      broadcast(data);
      break;
    case 'ap_update':
      broadcast({ type: 'ap_updated' });
      break;
  }
}

function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

app.get('/api/aps', async (req, res) => {
  try {
    const { floor } = req.query;
    let aps;
    if (floor !== undefined) {
      aps = await getAPsByFloor(parseInt(floor));
    } else {
      aps = await getAllAPs();
    }
    res.json(aps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/aps', async (req, res) => {
  try {
    const ap = await addAP(req.body);
    broadcast({ type: 'ap_updated' });
    res.json(ap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/aps/:id', async (req, res) => {
  try {
    const changes = await deleteAP(req.params.id);
    if (changes === 0) {
      res.status(404).json({ error: 'AP not found' });
    } else {
      broadcast({ type: 'ap_updated' });
      res.json({ success: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/locate', async (req, res) => {
  try {
    const { device_id, measurements, floor } = req.body;
    
    if (!measurements || measurements.length === 0) {
      return res.status(400).json({ error: 'No measurements provided' });
    }

    const allAps = await getAllAPs();
    const apMap = new Map(allAps.map(ap => [ap.bssid.toUpperCase(), ap]));
    
    const filteredMeasurements = measurements.map(m => ({
      ...m,
      filteredDistance: measurementFilter.filter(m.bssid, m.distance)
    }));

    for (const m of filteredMeasurements) {
      await addFingerprint({
        bssid: m.bssid,
        distance: m.filteredDistance,
        rssi: m.rssi,
        floor: floor || 1
      });
    }

    const apData = filteredMeasurements
      .filter(m => apMap.has(m.bssid.toUpperCase()))
      .map(m => ({
        ...apMap.get(m.bssid.toUpperCase()),
        distance: m.filteredDistance
      }));

    if (apData.length === 0) {
      return res.status(400).json({ 
        error: 'No matching APs found',
        measured_count: measurements.length
      });
    }

    const rawPosition = trilaterate(apData);
    
    if (!rawPosition) {
      return res.status(400).json({ 
        error: 'Position calculation failed',
        ap_count: apData.length
      });
    }

    const pdr_x = req.body.pdr_x;
    const pdr_y = req.body.pdr_y;
    const pdr_z = req.body.pdr_z;
    const hasPdrData = pdr_x !== undefined && pdr_y !== undefined;

    let finalPosition = { ...rawPosition };
    let fusionSource = rawPosition.source;

    if (hasPdrData) {
      const fusionWeight = Math.max(0.2, Math.min(0.8, 0.3 + apData.length * 0.1));
      finalPosition.x = rawPosition.x * fusionWeight + pdr_x * (1 - fusionWeight);
      finalPosition.y = rawPosition.y * fusionWeight + pdr_y * (1 - fusionWeight);
      finalPosition.z = rawPosition.z * fusionWeight + (pdr_z || 0) * (1 - fusionWeight);
      fusionSource = 'wifi_pdr_fusion';
    }

    const smoothedPosition = positionSmoother.smooth(device_id, finalPosition);
    const finalFloor = floor || Math.round(smoothedPosition.z / 3) || 1;

    const result = await addPositionHistory({
      device_id,
      x: smoothedPosition.x,
      y: smoothedPosition.y,
      z: smoothedPosition.z,
      floor: finalFloor,
      accuracy: rawPosition.accuracy
    });

    const responseData = {
      ...result,
      source: fusionSource,
      ap_used: apData.length,
      pdr_used: hasPdrData,
      raw_wifi_position: {
        x: rawPosition.x,
        y: rawPosition.y,
        z: rawPosition.z
      }
    };

    broadcast({
      type: 'position_update',
      position: result
    });

    res.json(responseData);
  } catch (err) {
    console.error('Locate error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/:deviceId', async (req, res) => {
  try {
    const { limit } = req.query;
    const history = await getPositionHistory(req.params.deviceId, limit ? parseInt(limit) : 100);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/positions/recent', async (req, res) => {
  try {
    const { limit } = req.query;
    const positions = await getAllRecentPositions(limit ? parseInt(limit) : 50);
    res.json(positions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/building', async (req, res) => {
  try {
    const building = await getBuilding();
    res.json(building);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/heatmap', async (req, res) => {
  try {
    const { floor, hours } = req.query;
    const data = await getHeatmapData(
      floor !== undefined ? parseInt(floor) : null,
      hours ? parseInt(hours) : 24
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/devices', async (req, res) => {
  try {
    const devices = await getDeviceIds();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/export/gpx', async (req, res) => {
  try {
    const { deviceId, startTime, endTime } = req.query;
    
    const start = startTime || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const end = endTime || new Date().toISOString();
    
    const positions = await getPositionsByTimeRange(start, end, deviceId);
    
    let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n';
    gpx += '<gpx version="1.1" creator="Indoor Positioning System">\n';
    gpx += '  <metadata>\n';
    gpx += '    <name>Indoor Positioning Track</name>\n';
    gpx += `    <time>${new Date().toISOString()}</time>\n`;
    gpx += '  </metadata>\n';
    gpx += '  <trk>\n';
    gpx += '    <name>Indoor Track</name>\n';
    gpx += '    <trkseg>\n';
    
    positions.forEach(pos => {
      const lon = pos.x / 100000;
      const lat = pos.y / 100000;
      gpx += `      <trkpt lat="${lat}" lon="${lon}">\n`;
      gpx += `        <ele>${pos.z}</ele>\n`;
      gpx += `        <time>${pos.created_at}</time>\n`;
      gpx += `        <cmt>Floor: ${pos.floor}, Accuracy: ${pos.accuracy}m</cmt>\n`;
      gpx += '      </trkpt>\n';
    });
    
    gpx += '    </trkseg>\n';
    gpx += '  </trk>\n';
    gpx += '</gpx>';
    
    res.setHeader('Content-Type', 'application/gpx+xml');
    res.setHeader('Content-Disposition', `attachment; filename="track_${Date.now()}.gpx"`);
    res.send(gpx);
  } catch (err) {
    console.error('GPX export error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/init-demo-data', async (req, res) => {
  try {
    const demoAPs = [
      { id: 'ap1', bssid: '00:11:22:33:44:01', name: 'AP-NorthWest', x: 5, y: 5, z: 0, floor: 1 },
      { id: 'ap2', bssid: '00:11:22:33:44:02', name: 'AP-NorthEast', x: 45, y: 5, z: 0, floor: 1 },
      { id: 'ap3', bssid: '00:11:22:33:44:03', name: 'AP-SouthWest', x: 5, y: 25, z: 0, floor: 1 },
      { id: 'ap4', bssid: '00:11:22:33:44:04', name: 'AP-SouthEast', x: 45, y: 25, z: 0, floor: 1 },
      { id: 'ap5', bssid: '00:11:22:33:44:05', name: 'AP-Center', x: 25, y: 15, z: 0, floor: 1 },
      { id: 'ap6', bssid: '00:11:22:33:44:06', name: 'AP-F2-NW', x: 5, y: 5, z: 3, floor: 2 },
      { id: 'ap7', bssid: '00:11:22:33:44:07', name: 'AP-F2-NE', x: 45, y: 5, z: 3, floor: 2 },
      { id: 'ap8', bssid: '00:11:22:33:44:08', name: 'AP-F2-SW', x: 5, y: 25, z: 3, floor: 2 },
    ];

    for (const ap of demoAPs) {
      await addAP(ap);
    }

    res.json({ message: 'Demo data initialized', aps: demoAPs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`HTTP: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
});
