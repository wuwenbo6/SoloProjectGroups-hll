const express = require('express');
const pdfGenerator = require('../services/pdf-generator');
const fabricService = require('../services/fabric');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { runInsert, runQuery } = require('../database/db');

const router = express.Router();

router.get('/:produceId', authenticateToken, async (req, res) => {
  try {
    const { produceId } = req.params;
    const history = await fabricService.getProduceHistory(produceId);
    const temperatures = await fabricService.getTemperatureHistory(produceId);

    const certificateData = {
      produceId,
      certificateId: `CERT-${Date.now()}`,
      produce: history.produce,
      transfers: history.transfers,
      reports: history.reports,
      temperatures: temperatures || []
    };

    const certPath = await pdfGenerator.generateTraceabilityCertificate(certificateData);
    const fileName = `traceability-certificate-${produceId}.pdf`;

    await runInsert(
      'INSERT INTO certificates (certificate_id, produce_id, file_path, generated_by) VALUES (?, ?, ?, ?)',
      [certificateData.certificateId, produceId, certPath, req.user.username]
    );

    res.download(certPath, fileName, (err) => {
      if (err) {
        console.error('下载证书失败:', err);
        res.status(500).json({ error: '下载证书失败' });
      }
    });
  } catch (error) {
    console.error('生成证书失败:', error);
    res.status(500).json({ error: error.message || '生成证书失败' });
  }
});

router.get('/preview/:produceId', authenticateToken, async (req, res) => {
  try {
    const { produceId } = req.params;
    const history = await fabricService.getProduceHistory(produceId);
    const temperatures = await fabricService.getTemperatureHistory(produceId);

    const certificateData = {
      produceId,
      certificateId: `CERT-${Date.now()}`,
      produce: history.produce,
      transfers: history.transfers,
      reports: history.reports,
      temperatures: temperatures || []
    };

    const certPath = await pdfGenerator.generateTraceabilityCertificate(certificateData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificate-${produceId}.pdf"`);
    
    const fs = require('fs');
    const fileStream = fs.createReadStream(certPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('预览证书失败:', error);
    res.status(500).json({ error: error.message || '预览证书失败' });
  }
});

router.get('/list/:produceId', authenticateToken, async (req, res) => {
  try {
    const certificates = await runQuery(
      'SELECT * FROM certificates WHERE produce_id = ? ORDER BY created_at DESC',
      [req.params.produceId]
    );
    res.json(certificates);
  } catch (error) {
    console.error('获取证书列表失败:', error);
    res.status(500).json({ error: '获取证书列表失败' });
  }
});

module.exports = router;
