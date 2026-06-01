import type { Request, Response } from 'express';
import { getCameras, getCameraById } from '../services/cameraService.js';

export async function getAllCameras(req: Request, res: Response) {
  try {
    const cameras = getCameras();
    res.json(cameras);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cameras' });
  }
}

export async function getCamera(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const camera = getCameraById(id);
    
    if (!camera) {
      res.status(404).json({ error: 'Camera not found' });
      return;
    }
    
    res.json(camera);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get camera' });
  }
}

export async function getCameraStream(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const camera = getCameraById(id);
    
    if (!camera) {
      res.status(404).json({ error: 'Camera not found' });
      return;
    }

    res.json({ 
      cameraId: id,
      status: camera.status,
      streamUrl: `/api/cameras/${id}/stream.m3u8`,
      previewUrl: `https://picsum.photos/seed/${id}/800/450?t=${Date.now()}`
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get camera stream' });
  }
}
