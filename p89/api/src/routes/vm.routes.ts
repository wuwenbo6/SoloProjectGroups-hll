import { Router } from 'express';
import { getVMs, getVM, createVM, startVM, stopVM, restartVM } from '../controllers/vm.controller.js';
import { getSnapshots, createSnapshot, rollbackSnapshot, deleteSnapshot } from '../controllers/snapshot.controller.js';
import { migrateVM } from '../controllers/migrate.controller.js';

const router = Router();

router.get('/', getVMs);
router.post('/', createVM);
router.get('/:node/:id', getVM);
router.post('/:node/:id/start', startVM);
router.post('/:node/:id/stop', stopVM);
router.post('/:node/:id/restart', restartVM);
router.get('/:node/:id/snapshots', getSnapshots);
router.post('/:node/:id/snapshots', createSnapshot);
router.post('/:node/:id/snapshots/:snapname/rollback', rollbackSnapshot);
router.delete('/:node/:id/snapshots/:snapname', deleteSnapshot);
router.post('/:node/:id/migrate', migrateVM);

export default router;
