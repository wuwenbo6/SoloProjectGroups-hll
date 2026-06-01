import { Request, Response } from 'express';
import { proxmoxService } from '../services/proxmox.service.js';
import { logService } from '../services/log.service.js';

const currentUser = 'admin';

export const getSnapshots = async (req: Request, res: Response) => {
  try {
    const { node, id } = req.params;
    const snapshots = await proxmoxService.getSnapshots(node, parseInt(id));
    res.json({ success: true, data: snapshots });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get snapshots' });
  }
};

export const createSnapshot = async (req: Request, res: Response) => {
  try {
    const { node, id } = req.params;
    const { snapname, description } = req.body;
    const vmid = parseInt(id);
    const result = await proxmoxService.createSnapshot(node, vmid, snapname, description);
    await logService.log(
      currentUser,
      'create_snapshot',
      'snapshot',
      `${node}/${vmid}/${snapname}`,
      result ? 'success' : 'failed',
      `Create snapshot ${snapname} for VM ${vmid}`
    );
    res.json({ success: result });
  } catch (error: any) {
    const { node, id } = req.params;
    await logService.log(
      currentUser,
      'create_snapshot',
      'snapshot',
      `${node}/${id}`,
      'failed',
      error.message
    );
    res.status(500).json({ success: false, error: 'Failed to create snapshot' });
  }
};

export const rollbackSnapshot = async (req: Request, res: Response) => {
  try {
    const { node, id, snapname } = req.params;
    const { preserveNetwork = true } = req.body;
    const vmid = parseInt(id);
    const result = await proxmoxService.rollbackSnapshot(node, vmid, snapname, preserveNetwork);
    await logService.log(
      currentUser,
      'rollback_snapshot',
      'snapshot',
      `${node}/${vmid}/${snapname}`,
      result ? 'success' : 'failed',
      `Rollback to snapshot ${snapname} for VM ${vmid}${preserveNetwork ? ' (network preserved)' : ''}`
    );
    res.json({ success: result, message: preserveNetwork ? 'Network configuration preserved' : 'Rollback completed' });
  } catch (error: any) {
    const { node, id, snapname } = req.params;
    await logService.log(
      currentUser,
      'rollback_snapshot',
      'snapshot',
      `${node}/${id}/${snapname}`,
      'failed',
      error.message
    );
    res.status(500).json({ success: false, error: error.message || 'Failed to rollback snapshot' });
  }
};

export const deleteSnapshot = async (req: Request, res: Response) => {
  try {
    const { node, id, snapname } = req.params;
    const vmid = parseInt(id);
    const result = await proxmoxService.deleteSnapshot(node, vmid, snapname);
    await logService.log(
      currentUser,
      'delete_snapshot',
      'snapshot',
      `${node}/${vmid}/${snapname}`,
      result ? 'success' : 'failed',
      `Delete snapshot ${snapname} for VM ${vmid}`
    );
    res.json({ success: result });
  } catch (error: any) {
    const { node, id, snapname } = req.params;
    await logService.log(
      currentUser,
      'delete_snapshot',
      'snapshot',
      `${node}/${id}/${snapname}`,
      'failed',
      error.message
    );
    res.status(500).json({ success: false, error: 'Failed to delete snapshot' });
  }
};
