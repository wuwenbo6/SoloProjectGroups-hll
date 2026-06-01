import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import type { Scene } from '../../shared/types.js';
import { CHANNEL_COUNT } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const SCENES_FILE = path.join(DATA_DIR, 'scenes.json');

interface SceneData {
  scenes: Scene[];
}

let cache: SceneData | null = null;

async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function ensureScenesFile(): Promise<void> {
  await ensureDataDir();
  try {
    await fs.access(SCENES_FILE);
  } catch {
    const emptyData: SceneData = { scenes: [] };
    await fs.writeFile(SCENES_FILE, JSON.stringify(emptyData, null, 2));
  }
}

async function readScenes(): Promise<SceneData> {
  if (cache) return cache;

  await ensureScenesFile();
  const data = await fs.readFile(SCENES_FILE, 'utf-8');
  cache = JSON.parse(data);
  return cache!;
}

async function writeScenes(data: SceneData): Promise<void> {
  cache = data;
  await fs.writeFile(SCENES_FILE, JSON.stringify(data, null, 2));
}

export async function getAllScenes(): Promise<Scene[]> {
  const data = await readScenes();
  return data.scenes;
}

export async function getSceneById(id: string): Promise<Scene | undefined> {
  const data = await readScenes();
  return data.scenes.find((s) => s.id === id);
}

export async function createScene(
  name: string,
  channels: number[]
): Promise<Scene> {
  const data = await readScenes();
  const normalizedChannels = new Array(CHANNEL_COUNT).fill(0);
  for (let i = 0; i < Math.min(channels.length, CHANNEL_COUNT); i++) {
    normalizedChannels[i] = Math.max(0, Math.min(255, Math.floor(channels[i])));
  }

  const scene: Scene = {
    id: randomUUID(),
    name,
    channels: normalizedChannels,
    createdAt: new Date().toISOString(),
  };

  data.scenes.unshift(scene);
  await writeScenes(data);
  return scene;
}

export async function deleteScene(id: string): Promise<boolean> {
  const data = await readScenes();
  const index = data.scenes.findIndex((s) => s.id === id);
  if (index === -1) return false;
  data.scenes.splice(index, 1);
  await writeScenes(data);
  return true;
}
