import express from 'express';
import executionController from '../controllers/ExecutionController.ts';

const router = express.Router();

router.post('/', executionController.execute.bind(executionController));
router.post('/generate-script', executionController.generateScript.bind(executionController));

export default router;
