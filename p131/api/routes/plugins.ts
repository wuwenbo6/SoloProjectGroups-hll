import { Router } from 'express';
import { pluginController } from '../controllers/plugin.controller';
import { ratingController } from '../controllers/rating.controller';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/', pluginController.getPlugins);
router.get('/categories', pluginController.getCategories);
router.get('/:id', pluginController.getPlugin);
router.get('/:id/versions', pluginController.getPluginVersions);
router.get('/:id/download', pluginController.downloadPlugin);
router.delete('/:id', authenticateToken, requireAdmin, pluginController.deletePlugin);

router.get('/:id/ratings', ratingController.getRatings);
router.post('/:id/rate', authenticateToken, ratingController.addRating);
router.get('/:id/my-rating', authenticateToken, ratingController.getUserRating);
router.delete('/ratings/:ratingId', authenticateToken, ratingController.deleteRating);

export default router;
