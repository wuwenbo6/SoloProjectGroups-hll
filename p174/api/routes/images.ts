import { Router } from 'express';
import {
  handleListImages,
  handleGetImageDetail,
  handleCreateSnapshot,
  handleRollbackSnapshot,
  handleDeleteSnapshot,
  handleProtectSnapshot,
  handleUnprotectSnapshot,
  handleCloneSnapshot,
  handleGetSnapshotTree,
  handleGetPoolStats,
} from '../controllers/imageController.js';
import { handleExportDiff } from '../controllers/exportController.js';

const router = Router();

router.get('/', handleListImages);
router.get('/stats', handleGetPoolStats);
router.get('/snapshot-tree', handleGetSnapshotTree);
router.get('/:pool/:name', handleGetImageDetail);
router.post('/:pool/:name/snapshots', handleCreateSnapshot);
router.post('/:pool/:name/snapshots/:snap/rollback', handleRollbackSnapshot);
router.delete('/:pool/:name/snapshots/:snap', handleDeleteSnapshot);
router.post('/:pool/:name/snapshots/:snap/protect', handleProtectSnapshot);
router.post('/:pool/:name/snapshots/:snap/unprotect', handleUnprotectSnapshot);
router.post('/:pool/:name/snapshots/:snap/clone', handleCloneSnapshot);
router.post('/:pool/:name/export-diff', handleExportDiff);

export default router;
