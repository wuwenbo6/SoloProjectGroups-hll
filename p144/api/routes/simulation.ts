import express from 'express';
import { SimulationController } from '../controllers/SimulationController';

const router = express.Router();
const controller = new SimulationController();

router.post('/init', (req, res) => {
  try {
    controller.init(req.body);
    res.json({ success: true, message: 'Simulation initialized' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/step', (req, res) => {
  try {
    const result = controller.step();
    if (result) {
      res.json({
        success: true,
        result,
        currentSlot: controller.getCurrentSlot(),
      });
    } else {
      res.status(400).json({ success: false, error: 'Simulation not initialized' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/run', (req, res) => {
  try {
    const { numSlots } = req.body;
    const result = controller.run(numSlots);
    if (result) {
      res.json({ success: true, result });
    } else {
      res.status(400).json({ success: false, error: 'Simulation not initialized' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/reset', (req, res) => {
  try {
    controller.reset();
    res.json({ success: true, message: 'Simulation reset' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/result', (req, res) => {
  try {
    const result = controller.getResult();
    if (result) {
      res.json({ success: true, result });
    } else {
      res.status(400).json({ success: false, error: 'Simulation not initialized' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/compare', (req, res) => {
  try {
    const { config, algorithm1, algorithm2 } = req.body;
    const result = controller.compareAlgorithms(config, algorithm1, algorithm2);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/report', (req, res) => {
  try {
    const format = (req.query.format as string) || 'json';
    const report = controller.generateReport(format as any);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="simulation_report_${Date.now()}.csv"`);
      res.send(report as string);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.json({ success: true, report });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
