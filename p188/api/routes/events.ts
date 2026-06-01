import { Router } from 'express';
import { 
  createEventHandler, 
  getEventsHandler, 
  getEventHandler, 
  updateEventHandler, 
  deleteEventHandler 
} from '../controllers/eventController.js';

const router = Router();

router.post('/', createEventHandler);
router.get('/', getEventsHandler);
router.get('/:id', getEventHandler);
router.put('/:id', updateEventHandler);
router.delete('/:id', deleteEventHandler);

export default router;
