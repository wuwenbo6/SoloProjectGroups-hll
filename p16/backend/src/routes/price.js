const express = require('express');
const fabricService = require('../services/fabric');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/set', authenticateToken, requireRole('farm', 'factory'), async (req, res) => {
  try {
    const { produceId, price, currency, ownerOrg } = req.body;

    const priceData = await fabricService.setPrivatePrice(
      produceId,
      parseFloat(price),
      currency || 'CNY',
      ownerOrg
    );

    res.json(priceData);
  } catch (error) {
    console.error('设置价格失败:', error);
    res.status(500).json({ error: error.message || '设置价格失败' });
  }
});

router.get('/:produceId', authenticateToken, requireRole('farm', 'factory', 'logistics'), async (req, res) => {
  try {
    const priceData = await fabricService.getPrivatePrice(req.params.produceId);
    res.json(priceData);
  } catch (error) {
    console.error('获取价格失败:', error);
    res.status(404).json({ error: error.message || '价格数据不存在或无权限访问' });
  }
});

module.exports = router;
