const express = require('express');
const router = express.Router();
const AnalyticsService = require('../services/AnalyticsService');

router.get('/detections', (req, res) => {
  try {
    const { camera_id, detection_type, limit = 100, offset = 0 } = req.query;
    const detections = AnalyticsService.getDetections(
      camera_id ? parseInt(camera_id) : null,
      detection_type,
      parseInt(limit),
      parseInt(offset)
    );
    res.json({ success: true, detections });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/detect/faces', async (req, res) => {
  try {
    const { camera_id, image_path } = req.body;
    
    if (!camera_id) {
      return res.status(400).json({ success: false, error: 'camera_id is required' });
    }

    const faces = await AnalyticsService.detectFaces(camera_id, image_path);
    res.json({ success: true, faces });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/detect/license-plates', async (req, res) => {
  try {
    const { camera_id, image_path } = req.body;
    
    if (!camera_id) {
      return res.status(400).json({ success: false, error: 'camera_id is required' });
    }

    const plates = await AnalyticsService.detectLicensePlates(camera_id, image_path);
    res.json({ success: true, license_plates: plates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/detect/all', async (req, res) => {
  try {
    const { camera_id, snapshot = false } = req.body;
    
    if (!camera_id) {
      return res.status(400).json({ success: false, error: 'camera_id is required' });
    }

    const result = await AnalyticsService.detect(camera_id, { snapshot });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/continuous/start', (req, res) => {
  try {
    const { camera_id, interval, types } = req.body;
    
    if (!camera_id) {
      return res.status(400).json({ success: false, error: 'camera_id is required' });
    }

    const result = AnalyticsService.startContinuousAnalysis(camera_id, {
      interval: interval ? parseInt(interval) : undefined,
      types
    });
    
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/continuous/stop', (req, res) => {
  try {
    const { camera_id } = req.body;
    
    if (!camera_id) {
      return res.status(400).json({ success: false, error: 'camera_id is required' });
    }

    const result = AnalyticsService.stopContinuousAnalysis(camera_id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/continuous/active', (req, res) => {
  try {
    const active = AnalyticsService.getActiveAnalyses();
    res.json({ success: true, active });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
