import express, { type Request, type Response } from 'express';
import {
  getAllScenes,
  getSceneById,
  createScene,
  deleteScene,
} from '../services/sceneService.js';
import { CHANNEL_COUNT } from '../../shared/types.js';

const router = express.Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const scenes = await getAllScenes();
    res.json({
      success: true,
      data: scenes,
    });
  } catch (err) {
    console.error('Get scenes error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get scenes',
    });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const scene = await getSceneById(id);

    if (!scene) {
      res.status(404).json({
        success: false,
        error: 'Scene not found',
      });
      return;
    }

    res.json({
      success: true,
      data: scene,
    });
  } catch (err) {
    console.error('Get scene error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get scene',
    });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, channels } = req.body as {
      name: string;
      channels: number[];
    };

    if (!name || typeof name !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Scene name is required',
      });
      return;
    }

    if (!Array.isArray(channels) || channels.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Channels data is required',
      });
      return;
    }

    const normalizedChannels = new Array(CHANNEL_COUNT).fill(0);
    for (let i = 0; i < Math.min(channels.length, CHANNEL_COUNT); i++) {
      const val = Number(channels[i]);
      normalizedChannels[i] = isNaN(val) ? 0 : Math.max(0, Math.min(255, val));
    }

    const scene = await createScene(name.trim(), normalizedChannels);

    res.status(201).json({
      success: true,
      data: scene,
    });
  } catch (err) {
    console.error('Create scene error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to create scene',
    });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await deleteScene(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Scene not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { deleted: true },
    });
  } catch (err) {
    console.error('Delete scene error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete scene',
    });
  }
});

export default router;
