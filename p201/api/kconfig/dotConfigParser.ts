import type { ConfigValue } from '../../shared/types';

export function parseDotConfig(content: string): ConfigValue {
  const values: ConfigValue = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^CONFIG_(\w+)=(.+)$/);
    if (match) {
      const [, name, rawValue] = match;
      let value: string | boolean | number;

      if (rawValue === 'y') value = true;
      else if (rawValue === 'n') value = false;
      else if (rawValue === 'm') value = 'm';
      else if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        value = rawValue.slice(1, -1);
      } else if (/^-?\d+$/.test(rawValue)) {
        value = parseInt(rawValue, 10);
      } else if (/^0x[0-9a-fA-F]+$/.test(rawValue)) {
        value = parseInt(rawValue, 16);
      } else {
        value = rawValue;
      }

      values[name] = value;
    }
  }

  return values;
}
