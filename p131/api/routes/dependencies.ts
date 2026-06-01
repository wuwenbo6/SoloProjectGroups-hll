import { Router } from 'express';
import { dependencyController } from '../controllers/dependency.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/:pluginId/tree', authenticateToken, dependencyController.getDependencyTree);
router.get('/:pluginId/check-circular', authenticateToken, dependencyController.checkCircular);

export default router;
