import { Router } from 'express';
import { getLatestData, getConnectionStatus } from '../opcua/client.js';
import { getSensorDataByTimeRange, getRecentSensorData } from '../database/index.js';

const router = Router();

router.get('/realtime', (req, res) => {
  const data = getLatestData();
  res.json({
    success: true,
    data,
  });
});

router.get('/history', (req, res) => {
  try {
    const { startTime, endTime, limit = '100' } = req.query;

    let data;
    if (startTime && endTime) {
      data = getSensorDataByTimeRange(startTime as string, endTime as string);
    } else {
      data = getRecentSensorData(parseInt(limit as string));
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching history data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch history data',
    });
  }
});

router.get('/plc/status', (req, res) => {
  res.json({
    success: true,
    data: {
      connected: getConnectionStatus(),
    },
  });
});

export default router;
