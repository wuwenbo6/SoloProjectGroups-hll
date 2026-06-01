import { Router } from 'express';
import { compileCode, getPasses, getToolchainStatus, exportCFGToDotFile, exportDFGToDotFile, generatePassTemplateFile } from '../controllers/compile.controller.js';

const router = Router();

router.post('/', compileCode);
router.get('/passes', getPasses);
router.get('/toolchain', getToolchainStatus);
router.post('/export/cfg', exportCFGToDotFile);
router.post('/export/dfg', exportDFGToDotFile);
router.get('/pass-template/:passName', generatePassTemplateFile);

export default router;
