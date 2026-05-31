const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

module.exports = function(db, upload, droneSimulator) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  router.get('/drones', (req, res) => {
    res.json({
      drones: droneSimulator.getDronesStatus(),
      count: droneSimulator.drones.size
    });
  });

  router.post('/drones/count', (req, res) => {
    const { count } = req.body;
    if (!count || count < 1 || count > 100) {
      return res.status(400).json({ error: '无人机数量必须在1-100之间' });
    }
    droneSimulator.setDroneCount(count);
    res.json({ success: true, count: droneSimulator.drones.size });
  });

  router.get('/formations', async (req, res) => {
    try {
      const formations = await db.getAllFormations();
      res.json({ formations });
    } catch (error) {
      console.error('获取编队方案失败:', error);
      res.status(500).json({ error: '获取编队方案失败' });
    }
  });

  router.get('/formations/:id', async (req, res) => {
    try {
      const formation = await db.getFormation(req.params.id);
      if (!formation) {
        return res.status(404).json({ error: '编队方案不存在' });
      }
      res.json({ formation });
    } catch (error) {
      console.error('获取编队方案失败:', error);
      res.status(500).json({ error: '获取编队方案失败' });
    }
  });

  router.post('/formations', async (req, res) => {
    try {
      const { name, description, droneCount, positions, waypoints, lightConfig } = req.body;
      
      if (!name || !droneCount || !positions) {
        return res.status(400).json({ error: '缺少必要参数' });
      }

      const formation = await db.saveFormation(name, description, droneCount, positions, waypoints, lightConfig);
      res.json({ success: true, formation });
    } catch (error) {
      console.error('保存编队方案失败:', error);
      res.status(500).json({ error: '保存编队方案失败' });
    }
  });

  router.put('/formations/:id', async (req, res) => {
    try {
      const { name, description, droneCount, positions, waypoints, lightConfig } = req.body;
      
      if (!name || !droneCount || !positions) {
        return res.status(400).json({ error: '缺少必要参数' });
      }

      const success = await db.updateFormation(req.params.id, name, description, droneCount, positions, waypoints, lightConfig);
      
      if (!success) {
        return res.status(404).json({ error: '编队方案不存在' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('更新编队方案失败:', error);
      res.status(500).json({ error: '更新编队方案失败' });
    }
  });

  router.delete('/formations/:id', async (req, res) => {
    try {
      const success = await db.deleteFormation(req.params.id);
      if (!success) {
        return res.status(404).json({ error: '编队方案不存在' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('删除编队方案失败:', error);
      res.status(500).json({ error: '删除编队方案失败' });
    }
  });

  router.post('/waypoints/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const waypoints = [];
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        const wp = {
          x: parseFloat(row.x || row.lat || row.latitude || 0),
          y: parseFloat(row.y || row.lng || row.lon || row.longitude || 0),
          z: parseFloat(row.z || row.alt || row.altitude || 10),
          speed: parseFloat(row.speed) || null
        };
        waypoints.push(wp);
      })
      .on('end', () => {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('删除临时文件失败:', err);
        });
        
        res.json({
          success: true,
          waypoints: waypoints,
          count: waypoints.length,
          filename: req.file.originalname
        });
      })
      .on('error', (error) => {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('删除临时文件失败:', err);
        });
        res.status(500).json({ error: '解析CSV文件失败' });
      });
  });

  router.post('/waypoints/load', (req, res) => {
    const { waypoints } = req.body;
    if (!waypoints || !Array.isArray(waypoints)) {
      return res.status(400).json({ error: '航点数据格式错误' });
    }
    droneSimulator.setWaypoints(waypoints);
    res.json({ success: true, count: waypoints.length });
  });

  router.post('/lights', (req, res) => {
    const { mode, color, frequency } = req.body;
    droneSimulator.setLights({ mode, color, frequency });
    res.json({ success: true, config: { mode, color, frequency } });
  });

  router.post('/formation/apply', (req, res) => {
    const { positions } = req.body;
    if (!positions || !Array.isArray(positions)) {
      return res.status(400).json({ error: '编队位置数据格式错误' });
    }
    droneSimulator.setFormation(positions);
    res.json({ success: true });
  });

  router.post('/flight/start', (req, res) => {
    droneSimulator.startFlight();
    res.json({ success: true, status: 'started' });
  });

  router.post('/flight/pause', (req, res) => {
    droneSimulator.pauseFlight();
    res.json({ success: true, status: 'paused' });
  });

  router.post('/flight/stop', (req, res) => {
    droneSimulator.stopFlight();
    res.json({ success: true, status: 'stopped' });
  });

  router.post('/flight/return', (req, res) => {
    droneSimulator.returnHome();
    res.json({ success: true, status: 'returning' });
  });

  router.post('/flight/speed', (req, res) => {
    const { speed } = req.body;
    if (!speed || speed < 0.1 || speed > 5) {
      return res.status(400).json({ error: '速度必须在0.1-5之间' });
    }
    droneSimulator.setSpeed(speed);
    res.json({ success: true, speed });
  });

  router.get('/logs/:droneId', async (req, res) => {
    const { limit } = req.query;
    const logs = await db.getFlightLogs(req.params.droneId, parseInt(limit) || 100);
    res.json({ logs });
  });

  router.get('/export/kml', (req, res) => {
    try {
      const kml = droneSimulator.exportKML();
      res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
      res.setHeader('Content-Disposition', `attachment; filename="drone_swarm_${Date.now()}.kml"`);
      res.send(kml);
    } catch (error) {
      console.error('导出KML失败:', error);
      res.status(500).json({ error: '导出KML失败' });
    }
  });

  router.post('/export/kml/download', (req, res) => {
    try {
      const kml = droneSimulator.exportKML();
      res.json({
        success: true,
        kml: kml,
        filename: `drone_swarm_${Date.now()}.kml`
      });
    } catch (error) {
      console.error('导出KML失败:', error);
      res.status(500).json({ error: '导出KML失败' });
    }
  });

  return router;
};
