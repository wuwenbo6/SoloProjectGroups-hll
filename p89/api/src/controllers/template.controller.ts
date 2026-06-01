import { Request, Response } from 'express';
import { proxmoxService } from '../services/proxmox.service.js';
import { logService } from '../services/log.service.js';

const currentUser = 'admin';

export const getTemplates = async (req: Request, res: Response) => {
  try {
    const templates = await proxmoxService.getTemplates();
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get templates' });
  }
};

export const cloneVM = async (req: Request, res: Response) => {
  try {
    const { node, id } = req.params;
    const { newid, name, target, full, storage, format } = req.body;
    const vmid = parseInt(id);
    
    const result = await proxmoxService.cloneVM(node, vmid, newid, {
      name,
      target,
      full,
      storage,
      format,
    });
    
    await logService.log(
      currentUser,
      'clone',
      'vm',
      `${node}/${vmid}->${newid}`,
      result ? 'success' : 'failed',
      `Clone VM ${vmid} to ${newid}${name ? ` (${name})` : ''}`
    );
    
    res.json({ success: result });
  } catch (error: any) {
    const { node, id } = req.params;
    await logService.log(
      currentUser,
      'clone',
      'vm',
      `${node}/${id}`,
      'failed',
      error.message
    );
    res.status(500).json({ success: false, error: error.message || 'Failed to clone VM' });
  }
};

export const convertToTemplate = async (req: Request, res: Response) => {
  try {
    const { node, id } = req.params;
    const vmid = parseInt(id);
    
    const result = await proxmoxService.convertToTemplate(node, vmid);
    
    await logService.log(
      currentUser,
      'convert_template',
      'vm',
      `${node}/${vmid}`,
      result ? 'success' : 'failed',
      `Convert VM ${vmid} to template`
    );
    
    res.json({ success: result });
  } catch (error: any) {
    const { node, id } = req.params;
    await logService.log(
      currentUser,
      'convert_template',
      'vm',
      `${node}/${id}`,
      'failed',
      error.message
    );
    res.status(500).json({ success: false, error: error.message || 'Failed to convert to template' });
  }
};
