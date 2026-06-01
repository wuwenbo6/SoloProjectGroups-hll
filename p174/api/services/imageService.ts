import { executeRbdCommand, parseJsonOutput } from './rbdService.js';
import type { RbdImage, RbdImageDetail } from '../types.js';

export async function listImages(pool?: string): Promise<RbdImage[]> {
  const args = pool
    ? `ls -p ${pool} --format json`
    : `ls --format json`;

  const result = await executeRbdCommand(args);
  const data = parseJsonOutput(result.stdout);

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((item: any) => ({
    name: item.image || item.name,
    pool: item.pool || pool || 'rbd',
    size: item.size || 0,
    format: item.format || 2,
    snapshotCount: item.snapshots || 0,
    provisionedSize: 0,
  }));
}

export async function getImageDetail(pool: string, name: string): Promise<RbdImageDetail> {
  const result = await executeRbdCommand(`info ${pool}/${name} --format json`);
  const data = parseJsonOutput(result.stdout);

  const snapshots = (data.snapshots || []).map((snap: any) => ({
    id: snap.id,
    name: snap.name,
    size: snap.size,
    timestamp: snap.timestamp,
    isProtected: snap['is protected'] === 'true',
    children: [],
  }));

  return {
    name: data.name || name,
    pool: data.pool || pool,
    size: data.size || 0,
    format: data.format || 2,
    snapshotCount: snapshots.length,
    provisionedSize: 0,
    features: (data.features || '').split(',').map((f: string) => f.trim()).filter(Boolean),
    createTime: data['create time'] || '',
    snapshots,
  };
}

export async function getSnapshotChildren(pool: string, imageName: string, snapName: string): Promise<string[]> {
  try {
    const result = await executeRbdCommand(`children ${pool}/${imageName}@${snapName} --format json`);
    const data = parseJsonOutput(result.stdout);
    if (Array.isArray(data)) {
      return data.map((child: any) => child.pool ? `${child.pool}/${child.name}` : child);
    }
    return [];
  } catch {
    return [];
  }
}

export async function getPoolStats(): Promise<{ totalBytes: number; usedBytes: number; availableBytes: number }> {
  try {
    const result = await executeRbdCommand(`df --format json`);
    const data = parseJsonOutput(result.stdout);
    if (Array.isArray(data) && data.length > 0) {
      const pool = data[0];
      return {
        totalBytes: pool.total || 0,
        usedBytes: pool.used || 0,
        availableBytes: pool.avail || 0,
      };
    }
    return { totalBytes: 0, usedBytes: 0, availableBytes: 0 };
  } catch {
    return { totalBytes: 0, usedBytes: 0, availableBytes: 0 };
  }
}
