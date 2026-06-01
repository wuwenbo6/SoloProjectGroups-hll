import type { KconfigParseResult, ConfigValue, DiffResult, MinimalConfigResult, KconfigSymbol } from '../../shared/types';

const API_BASE = '/api/kconfig';

export async function parseDotConfig(content: string): Promise<ConfigValue> {
  const res = await fetch('/api/parse-dotconfig', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to parse dotconfig');
  return (await res.json()).values;
}

export async function compareConfigs(
  current: ConfigValue,
  reference: ConfigValue
): Promise<DiffResult> {
  const res = await fetch('/api/compare-configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current, reference }),
  });
  if (!res.ok) throw new Error('Failed to compare configs');
  return res.json();
}

export async function generateMinimalConfig(
  values: ConfigValue,
  symbols: Record<string, KconfigSymbol>
): Promise<MinimalConfigResult> {
  const res = await fetch('/api/minimal-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values, symbols }),
  });
  if (!res.ok) throw new Error('Failed to generate minimal config');
  return res.json();
}

export const apiClient = {
  async parseFile(file: File): Promise<KconfigParseResult> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/parse`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to parse Kconfig file');
    }

    return response.json();
  },

  async parseContent(content: string): Promise<KconfigParseResult> {
    const response = await fetch(`${API_BASE}/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      throw new Error('Failed to parse Kconfig content');
    }

    return response.json();
  },

  async loadSample(): Promise<KconfigParseResult> {
    const response = await fetch(`${API_BASE}/sample`);

    if (!response.ok) {
      throw new Error('Failed to load sample Kconfig');
    }

    return response.json();
  },

  async generateConfig(
    values: ConfigValue,
    symbols: Record<string, any>
  ): Promise<string> {
    const response = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values, symbols }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate .config');
    }

    const data = await response.json();
    return data.config;
  },

  async resolveDependencies(
    symbol: string,
    value: string | boolean,
    values: ConfigValue,
    symbols: Record<string, any>
  ): Promise<ConfigValue> {
    const response = await fetch(`${API_BASE}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ symbol, value, values, symbols }),
    });

    if (!response.ok) {
      throw new Error('Failed to resolve dependencies');
    }

    const data = await response.json();
    return data.values;
  },

  async validateDependencies(
    symbol: string,
    values: ConfigValue,
    symbols: Record<string, any>
  ): Promise<{ valid: boolean; unmetDeps: string[] }> {
    const response = await fetch(`${API_BASE}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ symbol, values, symbols }),
    });

    if (!response.ok) {
      throw new Error('Failed to validate dependencies');
    }

    return response.json();
  },

  async parseConfigFile(file: File): Promise<ConfigValue> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/parse-config`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('Failed to parse .config file');
    const data = await response.json();
    return data.values;
  },

  async compareConfigs(
    current: ConfigValue,
    reference: ConfigValue,
    symbols: Record<string, any>
  ): Promise<DiffResult> {
    const response = await fetch(`${API_BASE}/diff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current, reference, symbols }),
    });
    if (!response.ok) throw new Error('Failed to compare configs');
    return response.json();
  },

  async generateMinimal(
    values: ConfigValue,
    symbols: Record<string, any>
  ): Promise<MinimalConfigResult> {
    const response = await fetch(`${API_BASE}/minimal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values, symbols }),
    });
    if (!response.ok) throw new Error('Failed to generate minimal config');
    return response.json();
  },
};
