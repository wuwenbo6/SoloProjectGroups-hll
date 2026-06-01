import { Request, Response } from 'express';
import { proxmoxService } from '../services/proxmox.service.js';
import { logService } from '../services/log.service.js';

export const getNodes = async (req: Request, res: Response) => {
  try {
    const nodes = await proxmoxService.getNodes();
    res.json({ success: true, data: nodes });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get nodes' });
  }
};

export const getNodeStatus = async (req: Request, res: Response) => {
  try {
    const { node } = req.params;
    const status = await proxmoxService.getNodeStatus(node);
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get node status' });
  }
};
