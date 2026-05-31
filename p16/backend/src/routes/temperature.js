const express = require('express');
const fabricService = require('../services/fabric');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/record', authenticateToken, async (req, res) => {
  try {
    const { produceId, temperature, location, reader } = req.body;

    const reading = await fabricService.recordTemperature(
      produceId,
      parseFloat(temperature),
      location,
      reader || req.user.name
    );

    if (reading.temperature > 8) {
      console.log(`[ALERT] 温度超标 - 产品ID: ${produceId}, 温度: ${temperature}°C, 地点: ${location}`);
    }

    res.json(reading);
  } catch (error) {
    console.error('记录温度失败:', error);
    res.status(500).json({ error: error.message || '记录温度失败' });
  }
});

router.get('/:produceId', authenticateToken, async (req, res) => {
  try {
    const readings = await fabricService.getTemperatureHistory(req.params.produceId);
    res.json(readings);
  } catch (error) {
    console.error('获取温度记录失败:', error);
    res.status(500).json({ error: error.message || '获取温度记录失败' });
  }
});

router.get('/alerts/current', authenticateToken, async (req, res) => {
  try {
    const produces = await fabricService.getAllProduces();
    const alertProduces = produces.filter(p => p.status === 'TEMP_ALERT');
    
    const alerts = [];
    for (const produce of alertProduces) {
      const temps = await fabricService.getTemperatureHistory(produce.id);
      const lastTemp = temps[temps.length - 1];
      alerts.push({
        produceId: produce.id,
        produceName: produce.name,
        temperature: lastTemp?.temperature,
        location: lastTemp?.location,
        timestamp: lastTemp?.timestamp
      });
    }

    res.json(alerts);
  } catch (error) {
    console.error('获取温度告警失败:', error);
    res.status(500).json({ error: '获取温度告警失败' });
  }
});

module.exports = router;
