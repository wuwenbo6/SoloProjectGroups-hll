import os

BASE = '/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p201'

files = {}

files['src/utils/api.ts'] = """import type { KconfigParseResult, ConfigValue, KconfigSymbol, DependencyCheckResult } from '../../shared/types';

const API_BASE = '/api/kconfig';

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API error: ${response.status}`);
  }
  return response.json();
}

export async function parseKconfig(file: File): Promise<KconfigParseResult> {
  const formData = new FormData();
  formData.append('file', file);
  return fetchApi<KconfigParseResult>(`${API_BASE}/parse`, {
    method: 'POST',
    body: formData,
  });
}

export async function getSample(): Promise<KconfigParseResult> {
  return fetchApi<KconfigParseResult>(`${API_BASE}/sample`);
}

export async function generateConfig(
  values: ConfigValue,
  symbols: Record<string, KconfigSymbol>
): Promise<string> {
  const result = await fetchApi<{ config: string }>(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values, symbols }),
  });
  return result.config;
}

export async function validateDependency(
  symbol: string,
  values: ConfigValue,
  symbols: Record<string, KconfigSymbol>
): Promise<DependencyCheckResult> {
  return fetchApi<DependencyCheckResult>(`${API_BASE}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, values, symbols }),
  });
}
"""

for rel_path, content in files.items():
    full_path = os.path.join(BASE, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w') as f:
        f.write(content)
    print(f'Written: {rel_path}')
