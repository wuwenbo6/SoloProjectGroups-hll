import express from 'express';
import settingsController from '../controllers/SettingsController.ts';

const router = express.Router();

router.get('/selector-strategy', settingsController.getSelectorStrategy.bind(settingsController));
router.post('/selector-strategy', settingsController.saveSelectorStrategy.bind(settingsController));

export default router;
