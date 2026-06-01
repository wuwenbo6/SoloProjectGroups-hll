import { Router } from 'express';
import { developmentController } from '../controllers/development.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/drafts', authenticateToken, developmentController.getDrafts);
router.post('/drafts', authenticateToken, developmentController.createDraft);
router.put('/drafts/:id', authenticateToken, developmentController.updateDraft);
router.post('/drafts/:id/publish', authenticateToken, developmentController.publishDraft);

router.post('/:pluginId/rollback/:versionId', authenticateToken, developmentController.rollbackVersion);

router.get('/:pluginId/dependencies/export', authenticateToken, developmentController.exportDependencyGraph);
router.get('/:pluginId/dependencies/preview', authenticateToken, developmentController.previewDependencyGraph);

export default router;
