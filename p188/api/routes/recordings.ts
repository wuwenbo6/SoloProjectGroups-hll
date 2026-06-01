import { Router } from 'express';
import { 
  getRecordingsHandler, 
  getRecordingHandler, 
  streamRecordingHandler,
  getRecordingSegmentsHandler,
  getLatestSegmentHandler,
  streamLatestSegmentHandler,
  getSegmentByTimeHandler,
  getRecordingIndexHandler,
  getNearestIndexEntryHandler,
  streamAtTimeHandler,
  getSegmentInfoHandler,
} from '../controllers/recordingController.js';

const router = Router();

router.get('/segment-info', getSegmentInfoHandler);
router.get('/', getRecordingsHandler);
router.get('/:id', getRecordingHandler);
router.get('/:id/video', streamRecordingHandler);
router.get('/:id/segments', getRecordingSegmentsHandler);
router.get('/:id/segments/latest', getLatestSegmentHandler);
router.get('/:id/segments/latest/video', streamLatestSegmentHandler);
router.get('/:id/segments/at/:timestamp', getSegmentByTimeHandler);
router.get('/:id/segments/stream/:timestamp', streamAtTimeHandler);
router.get('/:id/index', getRecordingIndexHandler);
router.get('/:id/index/nearest/:timestamp', getNearestIndexEntryHandler);

export default router;
