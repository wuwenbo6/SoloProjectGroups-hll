const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const db = require('./database');
const { EnhancedPositioning } = require('./enhancedPositioning');
const { 
  ParticleFilterManager, 
  AutoFingerprintGenerator, 
  HeatmapGenerator 
} = require('./advancedFeatures');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

const positioning = new EnhancedPositioning();
positioning.initCrowdsourcing();

const particleFilterManager = new ParticleFilterManager();
const heatmapGenerator = new HeatmapGenerator();

let beaconsCache = [];
db.all('SELECT * FROM beacons', (err, rows) => {
  if (!err) beaconsCache = rows;
});

const autoFingerprintGenerator = new AutoFingerprintGenerator(beaconsCache);

wss.on('connection', (ws) => {
  console.log('Client connected via WebSocket');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'rssi_data') {
        handlePositioning(data);
      }
    } catch (e) {
      console.error('WebSocket message error:', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

async function handlePositioning(data) {
  const { tagId, rssiData, floor = 1, useParticleFilter = false } = data;
  
  const bayesianPos = positioning.findPosition(tagId, rssiData, floor);
  
  let finalPos = bayesianPos;
  let particles = null;
  
  if (useParticleFilter) {
    const pfResult = particleFilterManager.filter(tagId, rssiData, positioning.fingerprints, bayesianPos);
    finalPos = {
      x: pfResult.x,
      y: pfResult.y,
      floor,
      confidence: bayesianPos.confidence,
      variance: pfResult.variance,
      effectiveParticles: pfResult.effectiveParticles,
      rawPosition: bayesianPos.rawPosition
    };
    particles = pfResult.particles.slice(0, 100);
  }
  
  db.run(`
    INSERT INTO trajectories (tag_id, x, y, floor, confidence)
    VALUES (?, ?, ?, ?, ?)
  `, [tagId, finalPos.x, finalPos.y, floor, finalPos.confidence]);

  rssiData.forEach(meas => {
    db.run(`
      INSERT INTO raw_rssi_data (tag_id, beacon_mac, rssi)
      VALUES (?, ?, ?)
    `, [tagId, meas.beaconMac, meas.rssi]);
  });

  broadcast({
    type: 'position_update',
    tagId,
    position: finalPos,
    particles,
    timestamp: new Date().toISOString()
  });

  return finalPos;
}

app.post('/api/rssi', async (req, res) => {
  try {
    const { tagId, rssiData, floor = 1 } = req.body;
    
    if (!tagId || !rssiData || !Array.isArray(rssiData)) {
      return res.status(400).json({ error: 'Invalid request format' });
    }

    const position = await handlePositioning({ tagId, rssiData, floor });
    res.json({ success: true, position });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fingerprint', async (req, res) => {
  try {
    const { locationX, locationY, floor = 1, beaconMac, rssi } = req.body;
    
    await positioning.updateFingerprint(locationX, locationY, floor, beaconMac, rssi);
    res.json({ success: true, message: 'Fingerprint updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fingerprint/batch', async (req, res) => {
  try {
    const { locationX, locationY, floor = 1, rssiData } = req.body;
    
    await positioning.batchUpdateFingerprint(locationX, locationY, floor, rssiData);
    res.json({ success: true, message: 'Fingerprints updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/beacons', (req, res) => {
  db.all('SELECT * FROM beacons', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/fingerprints', (req, res) => {
  const { floor = 1 } = req.query;
  db.all(`
    SELECT f.*, b.mac_address, b.name as beacon_name
    FROM fingerprints f
    JOIN beacons b ON f.beacon_id = b.id
    WHERE f.floor = ?
  `, [floor], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/trajectories', (req, res) => {
  const { tagId, limit = 100 } = req.query;
  let query = 'SELECT * FROM trajectories';
  let params = [];
  
  if (tagId) {
    query += ' WHERE tag_id = ?';
    params.push(tagId);
  }
  
  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(parseInt(limit));

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows.reverse());
  });
});

app.get('/api/fingerprint/locations', (req, res) => {
  const { floor = 1 } = req.query;
  db.all(`
    SELECT DISTINCT location_x, location_y, floor
    FROM fingerprints
    WHERE floor = ?
    ORDER BY location_x, location_y
  `, [floor], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/beacons', (req, res) => {
  const { id, mac_address, name, x, y, floor = 1 } = req.body;
  db.run(`
    INSERT INTO beacons (id, mac_address, name, x, y, floor)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, mac_address, name, x, y, floor], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, id: this.lastID });
  });
});

app.post('/api/fingerprint/initialize', async (req, res) => {
  try {
    const gridSize = 2;
    const maxX = 10;
    const maxY = 10;
    const floor = 1;

    const beaconBaseRSSI = {
      'AA:BB:CC:DD:EE:01': { x: 0, y: 0, baseRSSI: -40 },
      'AA:BB:CC:DD:EE:02': { x: 10, y: 0, baseRSSI: -40 },
      'AA:BB:CC:DD:EE:03': { x: 0, y: 10, baseRSSI: -40 },
      'AA:BB:CC:DD:EE:04': { x: 10, y: 10, baseRSSI: -40 }
    };

    for (let x = 0; x <= maxX; x += gridSize) {
      for (let y = 0; y <= maxY; y += gridSize) {
        for (const [mac, beacon] of Object.entries(beaconBaseRSSI)) {
          const distance = Math.sqrt(Math.pow(x - beacon.x, 2) + Math.pow(y - beacon.y, 2));
          const simulatedRSSI = beacon.baseRSSI - 20 * Math.log10(Math.max(distance, 1));
          const noisyRSSI = simulatedRSSI + (Math.random() - 0.5) * 10;
          
          await positioning.updateFingerprint(x, y, floor, mac, noisyRSSI);
        }
      }
    }

    res.json({ success: true, message: 'Sample fingerprints initialized' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/positioning/options', async (req, res) => {
  try {
    await positioning.setOptions(req.body);
    res.json({ success: true, message: 'Options updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/positioning/options', (req, res) => {
  res.json({
    useInterpolation: positioning.useInterpolation,
    useKalman: positioning.useKalman,
    useRSSIPreprocessing: positioning.useRSSIPreprocessing,
    useCrowdsourcing: positioning.useCrowdsourcing
  });
});

app.post('/api/fingerprint/interpolate', async (req, res) => {
  try {
    const { gridSize = 1, maxX = 10, maxY = 10, floor = 1 } = req.body;
    const interpolator = positioning.interpolator;
    const interpolated = interpolator.generateInterpolatedFingerprints(gridSize, maxX, maxY, floor);
    
    for (const fp of interpolated) {
      for (const [beaconMac, beaconData] of fp.beacons.entries()) {
        await new Promise((resolve, reject) => {
          db.get('SELECT id FROM beacons WHERE mac_address = ?', [beaconMac], (err, beacon) => {
            if (err || !beacon) { resolve(); return; }
            
            db.get(`
              SELECT id FROM fingerprints 
              WHERE location_x = ? AND location_y = ? AND floor = ? AND beacon_id = ?
            `, [fp.x, fp.y, floor, beacon.id], (err, existing) => {
              if (err) { reject(err); return; }
              
              if (!existing) {
                db.run(`
                  INSERT INTO fingerprints (location_x, location_y, floor, beacon_id, rssi_mean, rssi_std, sample_count)
                  VALUES (?, ?, ?, ?, ?, ?, 1)
                `, [fp.x, fp.y, floor, beacon.id, beaconData.mean, beaconData.std], (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              } else {
                resolve();
              }
            });
          });
        });
      }
    }
    
    await positioning.loadFingerprints();
    res.json({ success: true, count: interpolated.length, message: 'Interpolated fingerprints added' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/fingerprint/generate-simulated', async (req, res) => {
  try {
    const { 
      gridSize = 1, 
      maxX = 10, 
      maxY = 10, 
      floor = 1, 
      method = 'logdistance',
      pathLossExponent = 2.5,
      shadowingStd = 4
    } = req.body;

    autoFingerprintGenerator.pathLossExponent = pathLossExponent;
    autoFingerprintGenerator.shadowingStd = shadowingStd;
    
    const fingerprints = autoFingerprintGenerator.generateGrid(gridSize, maxX, maxY, floor, method);
    
    let count = 0;
    for (const fp of fingerprints) {
      for (const bd of fp.beaconData) {
        await new Promise((resolve, reject) => {
          db.get('SELECT id FROM beacons WHERE mac_address = ?', [bd.beaconMac], (err, beacon) => {
            if (err || !beacon) { resolve(); return; }
            
            db.get(`
              SELECT id FROM fingerprints 
              WHERE location_x = ? AND location_y = ? AND floor = ? AND beacon_id = ?
            `, [fp.x, fp.y, floor, beacon.id], (err, existing) => {
              if (err) { reject(err); return; }
              
              if (!existing) {
                db.run(`
                  INSERT INTO fingerprints (location_x, location_y, floor, beacon_id, rssi_mean, rssi_std, sample_count)
                  VALUES (?, ?, ?, ?, ?, ?, 5)
                `, [fp.x, fp.y, floor, beacon.id, bd.mean, bd.std], (err) => {
                  if (err) reject(err);
                  else { count++; resolve(); }
                });
              } else {
                db.run(`
                  UPDATE fingerprints 
                  SET rssi_mean = ?, rssi_std = ?, sample_count = 5, updated_at = CURRENT_TIMESTAMP
                  WHERE location_x = ? AND location_y = ? AND floor = ? AND beacon_id = ?
                `, [bd.mean, bd.std, fp.x, fp.y, floor, beacon.id], (err) => {
                  if (err) reject(err);
                  else { count++; resolve(); }
                });
              }
            });
          });
        });
      }
    }
    
    await positioning.loadFingerprints();
    res.json({ 
      success: true, 
      count, 
      locations: fingerprints.length,
      message: `Generated ${count} simulated fingerprints at ${fingerprints.length} locations` 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/heatmap/error', async (req, res) => {
  try {
    const { tagId, gridSize = 0.5, floor = 1 } = req.body;
    
    db.all(`
      SELECT t.x as estimatedX, t.y as estimatedY, t.timestamp
      FROM trajectories t
      WHERE t.floor = ? ${tagId ? 'AND t.tag_id = ?' : ''}
      ORDER BY t.timestamp DESC
      LIMIT 500
    `, tagId ? [floor, tagId] : [floor], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const positionsWithTrue = rows.map((row, i, arr) => ({
        estimatedX: row.estimatedX,
        estimatedY: row.estimatedY,
        trueX: arr[Math.min(i + 5, arr.length - 1)]?.estimatedX || row.estimatedX,
        trueY: arr[Math.min(i + 5, arr.length - 1)]?.estimatedY || row.estimatedY
      }));
      
      const heatmap = heatmapGenerator.generateErrorHeatmap(positionsWithTrue, gridSize, 10, 10);
      res.json(heatmap);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/heatmap/rssi', async (req, res) => {
  try {
    const { beaconMac, gridSize = 0.5, floor = 1 } = req.body;
    
    db.all(`
      SELECT f.location_x, f.location_y, f.rssi_mean, b.mac_address
      FROM fingerprints f
      JOIN beacons b ON f.beacon_id = b.id
      WHERE f.floor = ? ${beaconMac ? 'AND b.mac_address = ?' : ''}
    `, beaconMac ? [floor, beaconMac] : [floor], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (beaconMac) {
        const heatmap = heatmapGenerator.generateRSSIHeatmap(beaconMac, rows, gridSize, 10, 10);
        res.json(heatmap);
      } else {
        const beaconMacs = [...new Set(rows.map(r => r.mac_address))];
        const heatmaps = {};
        beaconMacs.forEach(mac => {
          heatmaps[mac] = heatmapGenerator.generateRSSIHeatmap(mac, rows, gridSize, 10, 10);
        });
        res.json({ heatmaps, beaconMacs });
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/heatmap/export/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { beaconMac, tagId, format = 'json' } = req.query;
    
    if (type === 'rssi' && beaconMac) {
      db.all(`
        SELECT f.location_x, f.location_y, f.rssi_mean, b.mac_address
        FROM fingerprints f
        JOIN beacons b ON f.beacon_id = b.id
        WHERE b.mac_address = ?
      `, [beaconMac], (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        
        const heatmap = heatmapGenerator.generateRSSIHeatmap(beaconMac, rows, 0.5, 10, 10);
        
        if (format === 'ppm') {
          res.setHeader('Content-Type', 'text/plain');
          res.setHeader('Content-Disposition', `attachment; filename="rssi_heatmap_${beaconMac.replace(/:/g, '')}.ppm"`);
          res.send(heatmapGenerator.generatePNG(heatmap, 'rssi'));
        } else {
          res.json(heatmap);
        }
      });
    } else if (type === 'error') {
      db.all(`
        SELECT t.x as estimatedX, t.y as estimatedY
        FROM trajectories t
        ${tagId ? 'WHERE t.tag_id = ?' : ''}
        ORDER BY t.timestamp DESC
        LIMIT 500
      `, tagId ? [tagId] : [], (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        
        const positionsWithTrue = rows.map((row, i, arr) => ({
          estimatedX: row.estimatedX,
          estimatedY: row.estimatedY,
          trueX: arr[Math.min(i + 3, arr.length - 1)]?.estimatedX || row.estimatedX,
          trueY: arr[Math.min(i + 3, arr.length - 1)]?.estimatedY || row.estimatedY
        }));
        
        const heatmap = heatmapGenerator.generateErrorHeatmap(positionsWithTrue, 0.5, 10, 10);
        
        if (format === 'ppm') {
          res.setHeader('Content-Type', 'text/plain');
          res.setHeader('Content-Disposition', `attachment; filename="error_heatmap.ppm"`);
          res.send(heatmapGenerator.generatePNG(heatmap, 'error'));
        } else {
          res.json(heatmap);
        }
      });
    } else {
      res.status(400).json({ error: 'Invalid heatmap type' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/particlefilter/reset', (req, res) => {
  const { tagId } = req.body;
  if (tagId) {
    particleFilterManager.reset(tagId);
  } else {
    particleFilterManager.resetAll();
  }
  res.json({ success: true, message: tagId ? `Filter reset for ${tagId}` : 'All filters reset' });
});

app.use(express.static('../frontend'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});