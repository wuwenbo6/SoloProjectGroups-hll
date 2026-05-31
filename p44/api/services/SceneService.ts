import { v4 as uuidv4 } from 'uuid';
import { fileStorage } from './FileStorage.js';
import type { SceneMetadata, MaterialConfig, CameraState } from '../../shared/types.js';

export class SceneService {
  createScene(name: string, modelPath: string): SceneMetadata {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const scene: SceneMetadata = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      modelPath,
      materials: [],
      camera: {
        position: [0, 2, 5],
        target: [0, 0, 0],
        fov: 60
      }
    };
    
    fileStorage.writeScene(id, JSON.stringify(scene, null, 2));
    return scene;
  }

  getScene(id: string): SceneMetadata | null {
    const data = fileStorage.readScene(id);
    if (data) {
      return JSON.parse(data) as SceneMetadata;
    }
    return null;
  }

  updateScene(id: string, updates: Partial<SceneMetadata>): SceneMetadata | null {
    const scene = this.getScene(id);
    if (!scene) return null;

    const updated: SceneMetadata = {
      ...scene,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    fileStorage.writeScene(id, JSON.stringify(updated, null, 2));
    return updated;
  }

  deleteScene(id: string): boolean {
    const scene = this.getScene(id);
    if (!scene) return false;
    fileStorage.deleteScene(id);
    return true;
  }

  listScenes(): SceneMetadata[] {
    const ids = fileStorage.listScenes();
    return ids
      .map(id => this.getScene(id))
      .filter((s): s is SceneMetadata => s !== null)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  updateMaterials(sceneId: string, materials: MaterialConfig[]): SceneMetadata | null {
    return this.updateScene(sceneId, { materials });
  }

  updateCamera(sceneId: string, camera: CameraState): SceneMetadata | null {
    return this.updateScene(sceneId, { camera });
  }

  saveModelFile(sceneId: string, filename: string, buffer: Buffer): string {
    return fileStorage.writeModelFile(sceneId, filename, buffer);
  }
}

export const sceneService = new SceneService();
