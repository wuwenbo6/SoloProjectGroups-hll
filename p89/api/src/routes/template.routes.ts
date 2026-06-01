import { Router } from 'express';
import { getTemplates, cloneVM, convertToTemplate } from '../controllers/template.controller.js';

const router = Router();

router.get('/', getTemplates);
router.post('/:node/:id/clone', cloneVM);
router.post('/:node/:id/template', convertToTemplate);

export default router;
