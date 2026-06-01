import { Router } from 'express';
import { 
  getAllCameras, 
  getCamera, 
  getCameraStream 
} from '../controllers/cameraController.js';
import {
  getActiveRecordingHandler,
} from '../controllers/recordingController.js';

const router = Router();

router.get('/', getAllCameras);
router.get('/:id', getCamera);
router.get('/:id/stream', getCameraStream);
router.get('/:id/active-recording', getActiveRecordingHandler);

export default router;
