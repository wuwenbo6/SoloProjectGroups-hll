import type { ParseResult } from '../../shared/types';

const BIGINT_FIELDS = new Set([
  'timestampNs',
  'fileSize',
  'timestamp'
]);

function deserializeValue(key: string, value: unknown): unknown {
  if (typeof value === 'string' && BIGINT_FIELDS.has(key) && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => deserializeValue(String(index), item));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = deserializeValue(k, v);
    }
    return result;
  }

  return value;
}

export function deserializeParseResult(data: unknown): ParseResult {
  return deserializeValue('', data) as ParseResult;
}
