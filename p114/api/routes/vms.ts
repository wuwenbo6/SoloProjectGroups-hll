import { Router } from 'express';
import { AppDataSource } from '../database';
import { VirtualMachineEntity } from '../entities/VirtualMachine';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const vmRepository = () => AppDataSource.getRepository(VirtualMachineEntity);

router.get('/', async (req, res) => {
  try {
    const vms = await vmRepository().find({
      order: { createdAt: 'DESC' },
    });
    res.json(vms);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get VM list' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, state = 'stopped' } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const vm = new VirtualMachineEntity();
    vm.id = uuidv4();
    vm.name = name;
    vm.state = state;
    vm.libvirtUuid = uuidv4();

    await vmRepository().save(vm);
    res.json(vm);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create VM' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const vm = await vmRepository().findOneBy({ id: req.params.id });
    if (!vm) {
      return res.status(404).json({ error: 'VM not found' });
    }
    res.json(vm);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get VM' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const vm = await vmRepository().findOneBy({ id: req.params.id });
    if (!vm) {
      return res.status(404).json({ error: 'VM not found' });
    }

    await vmRepository().remove(vm);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete VM' });
  }
});

export default router;
