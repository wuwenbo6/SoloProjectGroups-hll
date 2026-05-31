import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_ROOT = path.join(__dirname, '../../storage');
const SCENES_DIR = path.join(STORAGE_ROOT, 'scenes');
const MODELS_DIR = path.join(SCENES_DIR, 'models');
const EXPORTS_DIR = path.join(STORAGE_ROOT, 'exports');

export class FileStorage {
  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    [STORAGE_ROOT, SCENES_DIR, MODELS_DIR, EXPORTS_DIR].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  getScenePath(sceneId: string): string {
    return path.join(SCENES_DIR, `${sceneId}.json`);
  }

  getModelDir(sceneId: string): string {
    const dir = path.join(MODELS_DIR, sceneId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  getExportPath(exportId: string, format: string): string {
    return path.join(EXPORTS_DIR, `${exportId}.${format}`);
  }

  readScene(sceneId: string): string | null {
    const scenePath = this.getScenePath(sceneId);
    if (fs.existsSync(scenePath)) {
      return fs.readFileSync(scenePath, 'utf-8');
    }
    return null;
  }

  writeScene(sceneId: string, data: string): void {
    fs.writeFileSync(this.getScenePath(sceneId), data, 'utf-8');
  }

  deleteScene(sceneId: string): void {
    const scenePath = this.getScenePath(sceneId);
    if (fs.existsSync(scenePath)) {
      fs.unlinkSync(scenePath);
    }
    const modelDir = path.join(MODELS_DIR, sceneId);
    if (fs.existsSync(modelDir)) {
      fs.rmSync(modelDir, { recursive: true, force: true });
    }
  }

  listScenes(): string[] {
    if (!fs.existsSync(SCENES_DIR)) return [];
    return fs.readdirSync(SCENES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }

  writeModelFile(sceneId: string, filename: string, buffer: Buffer): string {
    const modelDir = this.getModelDir(sceneId);
    const filePath = path.join(modelDir, filename);
    fs.writeFileSync(filePath, buffer);
    return `/models/${sceneId}/${filename}`;
  }

  getModelFilePath(sceneId: string, filename: string): string {
    return path.join(MODELS_DIR, sceneId, filename);
  }

  writeExport(exportId: string, format: string, buffer: Buffer): string {
    const exportPath = this.getExportPath(exportId, format);
    fs.writeFileSync(exportPath, buffer);
    return `/exports/${exportId}.${format}`;
  }
}

export const fileStorage = new FileStorage();
