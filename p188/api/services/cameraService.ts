import { getDatabase } from '../db/database.js';
import type { Camera } from '../../shared/types.js';

export function getCameras(): Camera[] {
  const db = getDatabase();
  return db.cameras.getAll();
}

export function getCameraById(id: string): Camera | null {
  const db = getDatabase();
  return db.cameras.getById(id) || null;
}

export function updateCameraStatus(id: string, status: Camera['status']): void {
  const db = getDatabase();
  db.cameras.update(id, { status });
}
