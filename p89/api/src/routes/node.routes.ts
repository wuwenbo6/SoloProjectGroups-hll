import { Router } from 'express';
import { getNodes, getNodeStatus } from '../controllers/node.controller.js';

const router = Router();

router.get('/', getNodes);
router.get('/:node/status', getNodeStatus);

export default router;
