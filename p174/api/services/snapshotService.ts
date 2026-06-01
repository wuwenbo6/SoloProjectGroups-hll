import { executeRbdCommand } from './rbdService.js';
import type { RbdSnapshot, SnapshotTreeNode } from '../types.js';
import { getImageDetail, getSnapshotChildren } from './imageService.js';

export async function createSnapshot(
  pool: string,
  imageName: string,
  snapshotName: string
): Promise<{ success: boolean; message: string }> {
  await executeRbdCommand(`snap create ${pool}/${imageName}@${snapshotName}`);
  return {
    success: true,
    message: `Snapshot ${snapshotName} created successfully for image ${pool}/${imageName}`,
  };
}

export async function rollbackSnapshot(
  pool: string,
  imageName: string,
  snapshotName: string
): Promise<{ success: boolean; message: string }> {
  await executeRbdCommand(`snap rollback ${pool}/${imageName}@${snapshotName}`);
  await executeRbdCommand(`cache flush ${pool}/${imageName}`);
  return {
    success: true,
    message: `Image ${pool}/${imageName} rolled back to snapshot ${snapshotName}, cache flushed`,
  };
}

export async function deleteSnapshot(
  pool: string,
  imageName: string,
  snapshotName: string,
  force: boolean = false
): Promise<{ success: boolean; message: string }> {
  if (force) {
    try {
      await executeRbdCommand(`snap unprotect ${pool}/${imageName}@${snapshotName}`);
    } catch (e: any) {
      if (!e.message?.includes('snap is not protected')) {
        throw e;
      }
    }
  }
  await executeRbdCommand(`snap rm ${pool}/${imageName}@${snapshotName}`);
  return {
    success: true,
    message: `Snapshot ${snapshotName} deleted from image ${pool}/${imageName}`,
  };
}

export async function protectSnapshot(
  pool: string,
  imageName: string,
  snapshotName: string
): Promise<{ success: boolean; message: string }> {
  await executeRbdCommand(`snap protect ${pool}/${imageName}@${snapshotName}`);
  return {
    success: true,
    message: `Snapshot ${snapshotName} protected`,
  };
}

export async function unprotectSnapshot(
  pool: string,
  imageName: string,
  snapshotName: string
): Promise<{ success: boolean; message: string }> {
  await executeRbdCommand(`snap unprotect ${pool}/${imageName}@${snapshotName}`);
  return {
    success: true,
    message: `Snapshot ${snapshotName} unprotected`,
  };
}

export async function cloneSnapshot(
  pool: string,
  imageName: string,
  snapshotName: string,
  newPool: string,
  newImageName: string,
  size?: number
): Promise<{ success: boolean; message: string }> {
  let cmd = `clone ${pool}/${imageName}@${snapshotName} ${newPool}/${newImageName} --sparse`;
  if (size && size > 0) {
    cmd += ` --size ${size}`;
  }
  await executeRbdCommand(cmd);
  return {
    success: true,
    message: `Cloned snapshot ${snapshotName} to new image ${newPool}/${newImageName}${size ? ` (size: ${size} bytes)` : ''}`,
  };
}

export async function getSnapshotTree(): Promise<SnapshotTreeNode[]> {
  const { listImages, getImageDetail: getDetail, getSnapshotChildren: getChildren } = await import('./imageService.js');
  const images = await listImages();
  const tree: SnapshotTreeNode[] = [];

  for (const image of images) {
    try {
      const detail = await getDetail(image.pool, image.name);
      const imageNode: SnapshotTreeNode = {
        id: `${image.pool}/${image.name}`,
        type: 'image',
        name: image.name,
        pool: image.pool,
        size: image.size,
        timestamp: detail.createTime,
        children: [],
        level: 0,
      };

      for (const snap of detail.snapshots) {
        const snapNode: SnapshotTreeNode = {
          id: `${image.pool}/${image.name}@${snap.name}`,
          type: 'snapshot',
          name: snap.name,
          size: snap.size,
          timestamp: snap.timestamp,
          isProtected: snap.isProtected,
          parent: imageNode.id,
          children: [],
          level: 1,
        };

        const children = await getChildren(image.pool, image.name, snap.name);
        for (const child of children) {
          const [childPool, childName] = child.split('/');
          const childNode: SnapshotTreeNode = {
            id: child,
            type: 'image',
            name: childName || child,
            pool: childPool || image.pool,
            parent: snapNode.id,
            children: [],
            level: 2,
          };
          snapNode.children!.push(childNode);
        }

        imageNode.children!.push(snapNode);
      }

      tree.push(imageNode);
    } catch (e) {
      console.error(`Failed to process image ${image.pool}/${image.name}:`, e);
    }
  }

  return tree;
}
