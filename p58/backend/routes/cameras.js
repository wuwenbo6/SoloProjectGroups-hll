const express = require('express');
const router = express.Router();
const db = require('../database/init');
const OnvifService = require('../services/OnvifService');

router.get('/discover', async (req, res) => {
  try {
    const devices = await OnvifService.discoverDevices();
    res.json({ success: true, devices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/', (req, res) => {
  try {
    const cameras = db.prepare('SELECT * FROM cameras ORDER BY created_at DESC').all();
    res.json({ success: true, cameras });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(req.params.id);
    if (!camera) {
      return res.status(404).json({ success: false, error: 'Camera not found' });
    }
    res.json({ success: true, camera });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { ip_address, port = 80, username = '', password = '', name = '' } = req.body;
    
    if (!ip_address) {
      return res.status(400).json({ success: false, error: 'IP address is required' });
    }

    let deviceInfo = {};
    let rtspUri = '';
    let ptzSupported = 0;

    try {
      const cam = await OnvifService.connectCamera(ip_address, port, username, password);
      deviceInfo = await OnvifService.getDeviceInfo(cam);
      ptzSupported = OnvifService.hasPTZSupport(cam) ? 1 : 0;
      
      const profiles = await OnvifService.getCameraProfiles(cam);
      if (profiles && profiles.length > 0) {
        rtspUri = await OnvifService.getStreamUri(cam, profiles[0].$.token);
      }
    } catch (connectError) {
      console.log('Could not connect to camera:', connectError.message);
    }

    const result = db.prepare(`
      INSERT INTO cameras 
      (name, ip_address, port, username, password, manufacturer, model, serial_number, firmware_version, rtsp_uri, ptz_supported)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name || deviceInfo.model || ip_address,
      ip_address,
      port,
      username,
      password,
      deviceInfo.manufacturer || '',
      deviceInfo.model || '',
      deviceInfo.serialNumber || '',
      deviceInfo.firmwareVersion || '',
      rtspUri,
      ptzSupported
    );

    const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, camera });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(400).json({ success: false, error: 'Camera with this IP and port already exists' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, ip_address, port, username, password } = req.body;
    const cameraId = req.params.id;

    const existing = db.prepare('SELECT * FROM cameras WHERE id = ?').get(cameraId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Camera not found' });
    }

    db.prepare(`
      UPDATE cameras 
      SET name = COALESCE(?, name),
          ip_address = COALESCE(?, ip_address),
          port = COALESCE(?, port),
          username = COALESCE(?, username),
          password = COALESCE(?, password),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, ip_address, port, username, password, cameraId);

    const camera = db.prepare('SELECT * FROM cameras WHERE id = ?').get(cameraId);
    res.json({ success: true, camera });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM cameras WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Camera not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
