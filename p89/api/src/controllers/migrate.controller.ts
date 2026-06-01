import { Request, Response } from 'express';
import { proxmoxService } from '../services/proxmox.service.js';
import { logService } from '../services/log.service.js';
import type { MigrateParams } from '../../../shared/types.js';

const currentUser = 'admin';

export const migrateVM = async (req: Request, res: Response) => {
  try {
    const { node, id } = req.params;
    const params: MigrateParams = req.body;
    const vmid = parseInt(id);
    const result = await proxmoxService.migrateVM(node, vmid, params);
    await logService.log(
      currentUser,
      'migrate',
      'vm',
      `${node}/${vmid}`,
      result ? 'success' : 'failed',
      `Migrate VM ${vmid} from ${node} to ${params.target}`
    );
    res.json({ success: result });
  } catch (error: any) {
    const { node, id } = req.params;
    await logService.log(
      currentUser,
      'migrate',
      'vm',
      `${node}/${id}`,
      'failed',
      error.message
    );
    res.status(500).json({ success: false, error: 'Failed to migrate VM' });
  }
};
