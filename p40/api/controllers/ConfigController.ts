import { Request, Response } from 'express';
import { dbService } from '../services/DatabaseService';
import { serialService } from '../services/SerialService';

export const getConfig = (req: Request, res: Response) => {
  try {
    const configs = dbService.getAllConfigs();
    res.json(configs);
  } catch (err) {
    console.error('Failed to get config:', err);
    res.status(500).json({ error: 'Failed to get config' });
  }
};

export const updateConfig = (req: Request, res: Response) => {
  const { configKey, configValue } = req.body;

  if (!configKey) {
    return res.status(400).json({ error: 'configKey is required' });
  }

  try {
    dbService.setConfig(configKey, configValue);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update config:', err);
    res.status(500).json({ error: 'Failed to update config' });
  }
};

export const getSerialPorts = async (req: Request, res: Response) => {
  try {
    const ports = await serialService.listPorts();
    res.json({ ports });
  } catch (err) {
    console.error('Failed to get serial ports:', err);
    res.status(500).json({ error: 'Failed to get serial ports' });
  }
};
