import { Router } from 'express';
import { swtpmService } from '../services/SwtpmService';

const router = Router();

router.post('/encrypt', async (req, res) => {
  try {
    const { vtpmId, data, keyType = 'EK' } = req.body;
    if (!vtpmId || !data) {
      return res.status(400).json({ error: 'vtpmId and data are required' });
    }

    const result = await swtpmService.encrypt(vtpmId, data, keyType);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to encrypt data' });
  }
});

router.post('/decrypt', async (req, res) => {
  try {
    const { vtpmId, data, keyType = 'EK' } = req.body;
    if (!vtpmId || !data) {
      return res.status(400).json({ error: 'vtpmId and data are required' });
    }

    const result = await swtpmService.decrypt(vtpmId, data, keyType);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to decrypt data' });
  }
});

router.post('/sign', async (req, res) => {
  try {
    const { vtpmId, data } = req.body;
    if (!vtpmId || !data) {
      return res.status(400).json({ error: 'vtpmId and data are required' });
    }

    const result = await swtpmService.sign(vtpmId, data);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to sign data' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { vtpmId, data, signature } = req.body;
    if (!vtpmId || !data || !signature) {
      return res.status(400).json({ error: 'vtpmId, data, and signature are required' });
    }

    const valid = await swtpmService.verify(vtpmId, data, signature);
    res.json({ success: true, valid });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to verify signature' });
  }
});

export default router;
