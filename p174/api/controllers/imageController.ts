import { Request, Response } from 'express';
import {
  listImages,
  getImageDetail,
  getPoolStats,
} from '../services/imageService.js';
import {
  createSnapshot,
  rollbackSnapshot,
  deleteSnapshot,
  protectSnapshot,
  unprotectSnapshot,
  cloneSnapshot,
  getSnapshotTree,
} from '../services/snapshotService.js';
import type { ApiResponse } from '../types.js';

export async function handleListImages(req: Request, res: Response): Promise<void> {
  try {
    const { pool } = req.query;
    const images = await listImages(pool as string | undefined);
    const response: ApiResponse<typeof images> = { success: true, data: images };
    res.status(200).json(response);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list images',
    });
  }
}

export async function handleGetImageDetail(req: Request, res: Response): Promise<void> {
  try {
    const { pool, name } = req.params;
    const detail = await getImageDetail(pool, name);
    res.status(200).json({ success: true, data: detail });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get image detail',
    });
  }
}

export async function handleCreateSnapshot(req: Request, res: Response): Promise<void> {
  try {
    const { pool, name } = req.params;
    const { snapshotName } = req.body;
    if (!snapshotName) {
      res.status(400).json({ success: false, error: 'snapshotName is required' });
      return;
    }
    const result = await createSnapshot(pool, name, snapshotName);
    res.status(200).json({ success: true, message: result.message });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create snapshot',
    });
  }
}

export async function handleRollbackSnapshot(req: Request, res: Response): Promise<void> {
  try {
    const { pool, name, snap } = req.params;
    const result = await rollbackSnapshot(pool, name, snap);
    res.status(200).json({ success: true, message: result.message });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to rollback snapshot',
    });
  }
}

export async function handleDeleteSnapshot(req: Request, res: Response): Promise<void> {
  try {
    const { pool, name, snap } = req.params;
    const { force } = req.body || {};
    const result = await deleteSnapshot(pool, name, snap, force);
    res.status(200).json({ success: true, message: result.message });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete snapshot',
    });
  }
}

export async function handleProtectSnapshot(req: Request, res: Response): Promise<void> {
  try {
    const { pool, name, snap } = req.params;
    const result = await protectSnapshot(pool, name, snap);
    res.status(200).json({ success: true, message: result.message });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to protect snapshot',
    });
  }
}

export async function handleUnprotectSnapshot(req: Request, res: Response): Promise<void> {
  try {
    const { pool, name, snap } = req.params;
    const result = await unprotectSnapshot(pool, name, snap);
    res.status(200).json({ success: true, message: result.message });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to unprotect snapshot',
    });
  }
}

export async function handleCloneSnapshot(req: Request, res: Response): Promise<void> {
  try {
    const { pool, name, snap } = req.params;
    const { newPool, newImageName, size } = req.body;
    if (!newPool || !newImageName) {
      res.status(400).json({ success: false, error: 'newPool and newImageName are required' });
      return;
    }
    const result = await cloneSnapshot(pool, name, snap, newPool, newImageName, size);
    res.status(200).json({ success: true, message: result.message });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clone snapshot',
    });
  }
}

export async function handleGetSnapshotTree(req: Request, res: Response): Promise<void> {
  try {
    const tree = await getSnapshotTree();
    res.status(200).json({ success: true, data: tree });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get snapshot tree',
    });
  }
}

export async function handleGetPoolStats(req: Request, res: Response): Promise<void> {
  try {
    const stats = await getPoolStats();
    res.status(200).json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get pool stats',
    });
  }
}
