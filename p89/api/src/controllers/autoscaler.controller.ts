import { Request, Response } from 'express';
import { autoScalerService } from '../services/autoscaler.service.js';

export const getConfig = async (req: Request, res: Response) => {
  try {
    const config = autoScalerService.getConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get autoscaler config' });
  }
};

export const updateConfig = async (req: Request, res: Response) => {
  try {
    autoScalerService.updateConfig(req.body);
    const config = autoScalerService.getConfig();
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update autoscaler config' });
  }
};

export const getHistory = async (req: Request, res: Response) => {
  try {
    const history = autoScalerService.getHistory();
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get autoscaler history' });
  }
};

export const startAutoScaler = async (req: Request, res: Response) => {
  try {
    autoScalerService.start();
    res.json({ success: true, message: 'AutoScaler started' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to start autoscaler' });
  }
};

export const stopAutoScaler = async (req: Request, res: Response) => {
  try {
    autoScalerService.stop();
    res.json({ success: true, message: 'AutoScaler stopped' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to stop autoscaler' });
  }
};
