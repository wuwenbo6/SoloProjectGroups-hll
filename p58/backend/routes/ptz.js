const express = require('express');
const router = express.Router();
const PTZService = require('../services/PTZService');

router.post('/move', async (req, res) => {
  try {
    const { cameraId, direction, speed = 0.5 } = req.body;
    
    if (!cameraId || !direction) {
      return res.status(400).json({ success: false, error: 'cameraId and direction are required' });
    }

    const result = await PTZService.move(cameraId, direction, speed);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/stop', async (req, res) => {
  try {
    const { cameraId } = req.body;
    
    if (!cameraId) {
      return res.status(400).json({ success: false, error: 'cameraId is required' });
    }

    const result = await PTZService.stop(cameraId);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/zoom', async (req, res) => {
  try {
    const { cameraId, direction, speed = 0.5 } = req.body;
    
    if (!cameraId || !direction) {
      return res.status(400).json({ success: false, error: 'cameraId and direction are required' });
    }

    if (!['in', 'out'].includes(direction)) {
      return res.status(400).json({ success: false, error: 'direction must be "in" or "out"' });
    }

    const result = await PTZService.zoom(cameraId, direction, speed);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/home', async (req, res) => {
  try {
    const { cameraId } = req.body;
    
    if (!cameraId) {
      return res.status(400).json({ success: false, error: 'cameraId is required' });
    }

    const result = await PTZService.gotoHomePosition(cameraId);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/presets/:cameraId', async (req, res) => {
  try {
    const { cameraId } = req.params;
    
    const presets = await PTZService.getPresets(cameraId);
    res.json({ success: true, presets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/preset', async (req, res) => {
  try {
    const { cameraId, presetToken, speed = 0.5 } = req.body;
    
    if (!cameraId || !presetToken) {
      return res.status(400).json({ success: false, error: 'cameraId and presetToken are required' });
    }

    const result = await PTZService.gotoPreset(cameraId, presetToken, speed);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
