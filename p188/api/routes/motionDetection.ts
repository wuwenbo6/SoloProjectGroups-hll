import { Router } from 'express';
import {
  getMotionConfigHandler,
  updateMotionConfigHandler,
  getMotionStatusHandler,
  getMotionEventsHandler,
  toggleRegionHandler,
  addRegionHandler,
  removeRegionHandler,
  smartSearchHandler,
} from '../controllers/motionDetectionController.js';

const router = Router();

router.get('/config', getMotionConfigHandler);
router.put('/config', updateMotionConfigHandler);
router.get('/status', getMotionStatusHandler);
router.get('/events', getMotionEventsHandler);
router.post('/regions', addRegionHandler);
router.put('/regions/:regionId', toggleRegionHandler);
router.delete('/regions/:regionId', removeRegionHandler);
router.get('/search', smartSearchHandler);

export default router;
