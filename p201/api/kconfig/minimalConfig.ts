import type { ConfigValue, KconfigSymbol, MinimalConfigResult } from '../../shared/types';
import { generateConfigContent } from './generator';

export function generateMinimalConfig(
  values: ConfigValue,
  symbols: Record<string, KconfigSymbol>
): MinimalConfigResult {
  const activeSyms = new Set<string>();
  for (const [name, value] of Object.entries(values)) {
    if (value === true || value === 'y' || value === 'm' ||
        (typeof value === 'string' && value && value !== 'n') ||
        (typeof value === 'number' && !isNaN(value))) {
      activeSyms.add(name);
    }
  }

  const needed = new Set<string>();
  const visiting = new Set<string>();

  function collect(name: string) {
    if (needed.has(name)) return;
    if (visiting.has(name)) return;
    visiting.add(name);
    const sym = symbols[name];
    if (sym) {
      for (const dep of sym.dependencies) collect(dep);
    }
    needed.add(name);
    visiting.delete(name);
  }

  for (const name of activeSyms) collect(name);

  const minimalValues: ConfigValue = {};
  const removedSymbols: string[] = [];

  for (const [name, value] of Object.entries(values)) {
    if (needed.has(name)) {
      minimalValues[name] = value;
    } else {
      removedSymbols.push(name);
    }
  }

  const config = generateConfigContent(minimalValues, symbols);

  return {
    values: minimalValues,
    removedCount: removedSymbols.length,
    keptCount: Object.keys(minimalValues).length,
    removedSymbols,
    config,
  };
}
