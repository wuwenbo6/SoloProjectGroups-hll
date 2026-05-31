import express from 'express';
import { sceneService } from '../services/SceneService.js';
import type { SceneMetadata, MaterialConfig, CameraState } from '../../shared/types.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const scenes = sceneService.listScenes();
    res.json({ success: true, data: { scenes } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const scene = sceneService.getScene(req.params.id);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    res.json({ success: true, data: scene });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, modelPath } = req.body as { name: string; modelPath: string };
    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    const scene = sceneService.createScene(name, modelPath || '');
    res.json({ success: true, data: scene });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const updates = req.body as Partial<SceneMetadata>;
    const scene = sceneService.updateScene(req.params.id, updates);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    res.json({ success: true, data: scene });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const success = sceneService.deleteScene(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id/materials', (req, res) => {
  try {
    const { materials } = req.body as { materials: MaterialConfig[] };
    const scene = sceneService.updateMaterials(req.params.id, materials);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    res.json({ success: true, data: scene });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id/camera', (req, res) => {
  try {
    const camera = req.body as CameraState;
    const scene = sceneService.updateCamera(req.params.id, camera);
    if (!scene) {
      return res.status(404).json({ success: false, error: 'Scene not found' });
    }
    res.json({ success: true, data: scene });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
