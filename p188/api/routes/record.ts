import { Router } from 'express';
import { 
  startRecordingHandler, 
  stopRecordingHandler, 
  getRecordingStatusHandler 
} from '../controllers/recordingController.js';

const router = Router();

router.post('/start', startRecordingHandler);
router.post('/stop', stopRecordingHandler);
router.get('/status', getRecordingStatusHandler);

export default router;
