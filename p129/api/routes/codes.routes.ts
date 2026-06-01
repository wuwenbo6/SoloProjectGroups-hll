import { Router } from 'express';
import {
  listSnippets,
  getSnippet,
  createNewSnippet,
  updateExistingSnippet,
  deleteExistingSnippet,
} from '../controllers/codes.controller.js';

const router = Router();

router.get('/', listSnippets);
router.get('/:id', getSnippet);
router.post('/', createNewSnippet);
router.put('/:id', updateExistingSnippet);
router.delete('/:id', deleteExistingSnippet);

export default router;
