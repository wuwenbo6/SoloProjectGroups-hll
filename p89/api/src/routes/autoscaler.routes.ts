import { Router } from 'express';
import {
  getConfig,
  updateConfig,
  getHistory,
  startAutoScaler,
  stopAutoScaler,
} from '../controllers/autoscaler.controller.js';

const router = Router();

router.get('/config', getConfig);
router.put('/config', updateConfig);
router.get('/history', getHistory);
router.post('/start', startAutoScaler);
router.post('/stop', stopAutoScaler);

export default router;
