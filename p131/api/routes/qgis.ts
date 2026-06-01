import { Router } from 'express';
import { qgisController } from '../controllers/qgis.controller';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/servers', authenticateToken, requireAdmin, qgisController.getServers);
router.post('/servers', authenticateToken, requireAdmin, qgisController.addServer);
router.put('/servers/:id', authenticateToken, requireAdmin, qgisController.updateServer);
router.delete('/servers/:id', authenticateToken, requireAdmin, qgisController.deleteServer);
router.get('/servers/:id/status', authenticateToken, requireAdmin, qgisController.checkServerStatus);

router.get('/:serverId/plugins', authenticateToken, requireAdmin, qgisController.getInstalledPlugins);
router.post('/:serverId/install/:pluginId', authenticateToken, requireAdmin, qgisController.installPlugin);
router.post('/:serverId/activate/:pluginId', authenticateToken, requireAdmin, qgisController.activatePlugin);
router.post('/:serverId/uninstall/:pluginId', authenticateToken, requireAdmin, qgisController.uninstallPlugin);

export default router;
