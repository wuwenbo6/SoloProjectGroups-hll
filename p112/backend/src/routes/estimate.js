const express = require('express');
const router = express.Router();
const db = require('../db/sqlite');
const { estimateResources } = require('../services/hlsEstimator');
const { generateOptimizationTips } = require('../services/optimizer');

router.post('/', (req, res) => {
  const { code, codeName } = req.body;

  if (!code) {
    return res.status(400).json({
      success: false,
      error: '代码不能为空'
    });
  }

  const resources = estimateResources(code);
  const optimizationTips = generateOptimizationTips(code);

  const sql = `
    INSERT INTO estimations (code_name, code_content, lut, dsp, bram, optimization_tips)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    codeName || '未命名代码',
    code,
    resources.lut,
    resources.dsp,
    resources.bram,
    JSON.stringify(optimizationTips)
  ], function(err) {
    if (err) {
      console.error('数据库错误:', err);
      return res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }

    const allTips = [...optimizationTips, ...(resources.warnings || [])];

    res.json({
      success: true,
      data: {
        id: this.lastID,
        lut: resources.lut,
        dsp: resources.dsp,
        bram: resources.bram,
        optimizationTips: allTips
      }
    });
  });
});

module.exports = router;
