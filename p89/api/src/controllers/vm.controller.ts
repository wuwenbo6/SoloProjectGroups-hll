import { Request, Response } from 'express';
import { proxmoxService } from '../services/proxmox.service.js';
import { logService } from '../services/log.service.js';
import type { CreateVMParams } from '../../../shared/types.js';

const currentUser = 'admin';

export const getVMs = async (req: Request, res: Response) => {
  try {
    const vms = await proxmoxService.getVMs();
    res.json({ success: true, data: vms });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get VMs' });
  }
};

export const getVM = async (req: Request, res: Response) => {
  try {
    const { node, id } = req.params;
    const vm = await proxmoxService.getVM(node, parseInt(id));
    if (vm) {
      res.json({ success: true, data: vm });
    } else {
      res.status(404).json({ success: false, error: 'VM not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get VM' });
  }
};

export const createVM = async (req: Request, res: Response) => {
  try {
    const params: CreateVMParams = req.body;
    const result = await proxmoxService.createVM(params);
    await logService.log(
      currentUser,
      'create',
      'vm',
      params.name,
      result ? 'success' : 'failed',
      `Create VM ${params.name} on ${params.node}`
    );
    res.json({ success: result });
  } catch (error: any) {
    await logService.log(
      currentUser,
      'create',
      'vm',
      req.body.name,
      'failed',
      error.message
    );
    res.status(500).json({ success: false, error: 'Failed to create VM' });
  }
};

export const startVM = async (req: Request, res: Response) => {
  try {
    const { node, id } = req.params;
    const vmid = parseInt(id);
    const result = await proxmoxService.startVM(node, vmid);
    await logService.log(
      currentUser,
      'start',
      'vm',
      `${node}/${vmid}`,
      result ? 'success' : 'failed',
      `Start VM ${vmid} on ${node}`
    );
    res.json({ success: result });
  } catch (error: any) {
    const { node, id } = req.params;
    await logService.log(
      currentUser,
      'start',
      'vm',
      `${node}/${id}`,
      'failed',
      error.message
    );
    res.status(500).json({ success: false, error: 'Failed to start VM' });
  }
};

export const stopVM = async (req: Request, res: Response) => {
  try {
    const { node, id } = req.params;
    const vmid = parseInt(id);
    const result = await proxmoxService.stopVM(node, vmid);
    await logService.log(
      currentUser,
      'stop',
      'vm',
      `${node}/${vmid}`,
      result ? 'success' : 'failed',
      `Stop VM ${vmid} on ${node}`
    );
    res.json({ success: result });
  } catch (error: any) {
    const { node, id } = req.params;
    await logService.log(
      currentUser,
      'stop',
      'vm',
      `${node}/${id}`,
      'failed',
      error.message
    );
    res.status(500).json({ success: false, error: 'Failed to stop VM' });
  }
};

export const restartVM = async (req: Request, res: Response) => {
  try {
    const { node, id } = req.params;
    const vmid = parseInt(id);
    const result = await proxmoxService.restartVM(node, vmid);
    await logService.log(
      currentUser,
      'restart',
      'vm',
      `${node}/${vmid}`,
      result ? 'success' : 'failed',
      `Restart VM ${vmid} on ${node}`
    );
    res.json({ success: result });
  } catch (error: any) {
    const { node, id } = req.params;
    await logService.log(
      currentUser,
      'restart',
      'vm',
      `${node}/${id}`,
      'failed',
      error.message
    );
    res.status(500).json({ success: false, error: 'Failed to restart VM' });
  }
};
