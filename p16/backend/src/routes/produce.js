const express = require('express');
const fabricService = require('../services/fabric');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const produces = await fabricService.getAllProduces();
    res.json(produces);
  } catch (error) {
    console.error('获取农产品列表失败:', error);
    res.status(500).json({ error: '获取农产品列表失败' });
  }
});

router.post('/', authenticateToken, requireRole('farm', 'factory'), async (req, res) => {
  try {
    const { id, name, batchNumber, quantity, unit, owner, ownerRole, imageURL } = req.body;
    
    const produce = await fabricService.createProduce({
      id,
      name,
      batchNumber,
      quantity: parseFloat(quantity),
      unit,
      owner: owner || req.user.name,
      ownerRole: ownerRole || req.user.role,
      imageURL
    });

    res.json(produce);
  } catch (error) {
    console.error('创建农产品失败:', error);
    res.status(500).json({ error: error.message || '创建农产品失败' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const produce = await fabricService.readProduce(req.params.id);
    res.json(produce);
  } catch (error) {
    console.error('获取农产品信息失败:', error);
    res.status(404).json({ error: error.message || '农产品不存在' });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const history = await fabricService.getProduceHistory(req.params.id);
    res.json(history);
  } catch (error) {
    console.error('获取溯源历史失败:', error);
    res.status(404).json({ error: error.message || '获取溯源历史失败' });
  }
});

router.post('/:id/transfer', authenticateToken, requireRole('farm', 'factory', 'logistics'), async (req, res) => {
  try {
    const { newOwner, newOwnerRole, location, remark } = req.body;
    
    const produce = await fabricService.transferProduce(
      req.params.id,
      newOwner,
      newOwnerRole,
      location,
      remark
    );

    res.json(produce);
  } catch (error) {
    console.error('流转农产品失败:', error);
    res.status(500).json({ error: error.message || '流转农产品失败' });
  }
});

router.post('/:id/report', authenticateToken, requireRole('inspector', 'factory'), async (req, res) => {
  try {
    const { reportID, inspector, items, results, conclusion, reportURL } = req.body;
    
    const report = await fabricService.addInspectionReport(
      reportID || 'RPT' + Date.now(),
      req.params.id,
      inspector || req.user.name,
      JSON.stringify(items),
      JSON.stringify(results),
      conclusion,
      reportURL
    );

    res.json(report);
  } catch (error) {
    console.error('添加检测报告失败:', error);
    res.status(500).json({ error: error.message || '添加检测报告失败' });
  }
});

router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const produce = await fabricService.updateProduceStatus(req.params.id, status);
    res.json(produce);
  } catch (error) {
    console.error('更新状态失败:', error);
    res.status(500).json({ error: error.message || '更新状态失败' });
  }
});

module.exports = router;
