const express = require('express');
const router = express.Router();
const ldapService = require('../services/ldapService');
const { requireAuth } = require('../middleware/auth');

router.get('/tree', requireAuth, async (req, res) => {
  try {
    const tree = await ldapService.getDirectoryTree(req.session.ldapConfig);
    res.json({
      success: true,
      tree
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || '获取目录树失败'
    });
  }
});

module.exports = router;
