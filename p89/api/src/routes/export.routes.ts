import { Router } from 'express';
import { exportLogsCSV, exportLogsJSON } from '../controllers/export.controller.js';

const router = Router();

router.get('/logs/csv', exportLogsCSV);
router.get('/logs/json', exportLogsJSON);

export default router;
