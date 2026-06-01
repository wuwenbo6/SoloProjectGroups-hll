import { Router } from 'express';
import {
  createExportHandler,
  getExportTaskHandler,
  getAllExportsHandler,
  downloadExportHandler,
  deleteExportHandler,
} from '../controllers/exportController.js';

const router = Router();

router.post('/:recordingId', createExportHandler);
router.get('/', getAllExportsHandler);
router.get('/task/:taskId', getExportTaskHandler);
router.get('/download/:taskId', downloadExportHandler);
router.delete('/:taskId', deleteExportHandler);

export default router;
