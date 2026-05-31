import express from 'express';
import testCaseController from '../controllers/TestCaseController.ts';

const router = express.Router();

router.get('/', testCaseController.getAll.bind(testCaseController));
router.get('/:id', testCaseController.getById.bind(testCaseController));
router.post('/', testCaseController.create.bind(testCaseController));
router.put('/:id', testCaseController.update.bind(testCaseController));
router.delete('/:id', testCaseController.delete.bind(testCaseController));

export default router;
