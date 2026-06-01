const express = require('express');
const router = express.Router();
const { estimateResources, generateReport, generateHTMLReport } = require('../services/hlsEstimator');

router.post('/json', (req, res) => {
  try {
    const { code, codeName, options } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: '代码不能为空'
      });
    }

    const resources = estimateResources(code, options);
    const report = generateReport(code, resources, {
      name: codeName || '未命名设计'
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${codeName || 'hls_report'}.json"`);
    
    res.json(report);
  } catch (error) {
    console.error('生成JSON报告错误:', error);
    res.status(500).json({
      success: false,
      error: '生成报告失败'
    });
  }
});

router.post('/html', (req, res) => {
  try {
    const { code, codeName, options } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: '代码不能为空'
      });
    }

    const resources = estimateResources(code, options);
    const reportData = generateReport(code, resources, {
      name: codeName || '未命名设计'
    });
    const htmlReport = generateHTMLReport(reportData);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${codeName || 'hls_report'}.html"`);
    
    res.send(htmlReport);
  } catch (error) {
    console.error('生成HTML报告错误:', error);
    res.status(500).json({
      success: false,
      error: '生成报告失败'
    });
  }
});

module.exports = router;
