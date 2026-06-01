const express = require('express');
const router = express.Router();
const db = require('../db/sqlite');

router.get('/', (req, res) => {
  const sql = `
    SELECT id, code_name, lut, dsp, bram, created_at
    FROM estimations
    ORDER BY created_at DESC
    LIMIT 50
  `;

  db.all(sql, [], (err, records) => {
    if (err) {
      console.error('获取历史记录错误:', err);
      return res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }

    res.json({
      success: true,
      data: records
    });
  });
});

router.get('/:id', (req, res) => {
  const { id } = req.params;

  const sql = `SELECT * FROM estimations WHERE id = ?`;

  db.get(sql, [id], (err, record) => {
    if (err) {
      console.error('获取历史详情错误:', err);
      return res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        error: '记录不存在'
      });
    }

    record.optimization_tips = JSON.parse(record.optimization_tips || '[]');

    res.json({
      success: true,
      data: record
    });
  });
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;

  const sql = `DELETE FROM estimations WHERE id = ?`;

  db.run(sql, [id], function(err) {
    if (err) {
      console.error('删除历史记录错误:', err);
      return res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }

    if (this.changes === 0) {
      return res.status(404).json({
        success: false,
        error: '记录不存在'
      });
    }

    res.json({
      success: true,
      message: '删除成功'
    });
  });
});

module.exports = router;
