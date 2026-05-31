const express = require('express');
const QRCode = require('qrcode');

const router = express.Router();

router.get('/generate/:produceId', async (req, res) => {
  try {
    const { produceId } = req.params;
    const { size = 300 } = req.query;
    
    const traceURL = `${req.protocol}://${req.get('host')}/trace/${produceId}`;
    
    const qrDataURL = await QRCode.toDataURL(traceURL, {
      width: parseInt(size),
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      produceId,
      qrCode: qrDataURL,
      traceURL
    });
  } catch (error) {
    console.error('生成二维码失败:', error);
    res.status(500).json({ error: '生成二维码失败' });
  }
});

router.get('/download/:produceId', async (req, res) => {
  try {
    const { produceId } = req.params;
    const traceURL = `${req.protocol}://${req.get('host')}/trace/${produceId}`;
    
    const qrBuffer = await QRCode.toBuffer(traceURL, {
      width: 300,
      margin: 2
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="qrcode-${produceId}.png"`);
    res.send(qrBuffer);
  } catch (error) {
    console.error('下载二维码失败:', error);
    res.status(500).json({ error: '下载二维码失败' });
  }
});

module.exports = router;
