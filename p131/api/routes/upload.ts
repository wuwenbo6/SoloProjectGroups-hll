import { Router } from 'express';
import { uploadController } from '../controllers/upload.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/', authenticateToken, uploadController.uploadPlugin);
router.post('/validate', authenticateToken, uploadController.validatePlugin);

export default router;
