import { SimulationParams } from '../types';

const API_BASE = '/api';

export async function fetchSavedParams(): Promise<SimulationParams[]> {
  const response = await fetch(`${API_BASE}/parameters`);
  if (!response.ok) {
    throw new Error('Failed to fetch parameters');
  }
  return response.json();
}

export async function saveParams(name: string, params: Omit<SimulationParams, 'id' | 'createdAt'>): Promise<SimulationParams> {
  const response = await fetch(`${API_BASE}/parameters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, ...params }),
  });
  if (!response.ok) {
    throw new Error('Failed to save parameters');
  }
  return response.json();
}

export async function deleteParams(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/parameters/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete parameters');
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
