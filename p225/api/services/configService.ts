import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ArtNetConfig } from '../../shared/types.js';
import {
  DEFAULT_ARTNET_PORT,
  DEFAULT_BROADCAST_IP,
  DEFAULT_NET,
  DEFAULT_SWITCH,
  DEFAULT_UNIVERSE,
} from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

let configCache: ArtNetConfig | null = null;

async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function ensureConfigFile(): Promise<void> {
  await ensureDataDir();
  try {
    await fs.access(CONFIG_FILE);
  } catch {
    const defaultConfig: ArtNetConfig = {
      targetIp: DEFAULT_BROADCAST_IP,
      targetPort: DEFAULT_ARTNET_PORT,
      net: DEFAULT_NET,
      switch_: DEFAULT_SWITCH,
      universe: DEFAULT_UNIVERSE,
    };
    await fs.writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
  }
}

export async function getConfig(): Promise<ArtNetConfig> {
  if (configCache) return configCache;

  await ensureConfigFile();
  const data = await fs.readFile(CONFIG_FILE, 'utf-8');
  configCache = JSON.parse(data);
  return configCache!;
}

export async function updateConfig(
  newConfig: Partial<ArtNetConfig>
): Promise<ArtNetConfig> {
  const current = await getConfig();
  configCache = { ...current, ...newConfig };
  await fs.writeFile(CONFIG_FILE, JSON.stringify(configCache, null, 2));
  return configCache;
}
