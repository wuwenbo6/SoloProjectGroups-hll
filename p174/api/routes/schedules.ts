import { Router } from 'express';
import {
  handleListSchedules,
  handleGetSchedule,
  handleCreateSchedule,
  handleUpdateSchedule,
  handleDeleteSchedule,
  handleToggleSchedule,
  handleReloadSchedules,
} from '../controllers/scheduleController.js';

const router = Router();

router.get('/', handleListSchedules);
router.get('/reload', handleReloadSchedules);
router.get('/:id', handleGetSchedule);
router.post('/', handleCreateSchedule);
router.put('/:id', handleUpdateSchedule);
router.patch('/:id/toggle', handleToggleSchedule);
router.delete('/:id', handleDeleteSchedule);

export default router;
