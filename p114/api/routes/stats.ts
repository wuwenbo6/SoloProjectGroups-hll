import { Router } from 'express';
import { AppDataSource } from '../database';
import { VTPMEntity } from '../entities/VTPM';
import { VirtualMachineEntity } from '../entities/VirtualMachine';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const vtpmRepository = AppDataSource.getRepository(VTPMEntity);
    const vmRepository = AppDataSource.getRepository(VirtualMachineEntity);

    const [vtpms, vms] = await Promise.all([
      vtpmRepository.find(),
      vmRepository.find(),
    ]);

    const stats = {
      totalVtpm: vtpms.length,
      availableVtpm: vtpms.filter(v => v.status === 'available').length,
      assignedVtpm: vtpms.filter(v => v.status === 'assigned').length,
      errorVtpm: vtpms.filter(v => v.status === 'error').length,
      totalVms: vms.length,
      vmsWithVtpm: vms.filter(v => v.vtpmId).length,
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
