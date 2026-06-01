import type { Scene, ArtNetConfig } from '../../shared/types';

const API_BASE = '/api';

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });

    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`API request failed: ${endpoint}`, err);
    return { success: false, error: 'Network error' };
  }
}

export async function getScenes(): Promise<Scene[]> {
  const res = await request<Scene[]>('/scenes');
  if (res.success && res.data) {
    return res.data as unknown as Scene[];
  }
  return [];
}

export async function getScene(id: string): Promise<Scene | null> {
  const res = await request<Scene>(`/scenes/${id}`);
  if (res.success && res.data) {
    return res.data as Scene;
  }
  return null;
}

export async function createScene(
  name: string,
  channels: number[]
): Promise<Scene | null> {
  const res = await request<Scene>('/scenes', {
    method: 'POST',
    body: JSON.stringify({ name, channels }),
  });
  if (res.success && res.data) {
    return res.data as Scene;
  }
  return null;
}

export async function deleteScene(id: string): Promise<boolean> {
  const res = await request(`/scenes/${id}`, {
    method: 'DELETE',
  });
  return res.success;
}

export async function getArtNetConfig(): Promise<ArtNetConfig | null> {
  const res = await request<ArtNetConfig>('/artnet-config');
  if (res.success && res.data) {
    return res.data as ArtNetConfig;
  }
  return null;
}

export async function updateArtNetConfig(
  config: Partial<ArtNetConfig>
): Promise<ArtNetConfig | null> {
  const body: Record<string, unknown> = {};
  if (config.targetIp !== undefined) body.ip = config.targetIp;
  if (config.targetPort !== undefined) body.port = config.targetPort;
  if (config.net !== undefined) body.net = config.net;
  if (config.switch_ !== undefined) body.switch_ = config.switch_;
  if (config.universe !== undefined) body.universe = config.universe;

  const res = await request<ArtNetConfig>('/artnet-config', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (res.success && res.data) {
    return res.data as ArtNetConfig;
  }
  return null;
}
