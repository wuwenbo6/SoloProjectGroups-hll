import { Request, Response } from 'express';
import settingsRepository from '../repositories/SettingsRepository.ts';
import { SelectorStrategy } from '../../shared/types.ts';

export class SettingsController {
  async getSelectorStrategy(req: Request, res: Response) {
    try {
      const strategy = await settingsRepository.getSelectorStrategy();
      res.json(strategy);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async saveSelectorStrategy(req: Request, res: Response) {
    try {
      const strategy: SelectorStrategy = req.body;
      const saved = await settingsRepository.saveSelectorStrategy(strategy);
      res.json(saved);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default new SettingsController();
