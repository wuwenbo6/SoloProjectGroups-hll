import { ALGORITHM_NAMES, DIGEST_TYPE_NAMES } from '../types';

export function getAlgorithmName(algorithm: number): string {
  return ALGORITHM_NAMES[algorithm] || `Unknown (${algorithm})`;
}

export function getDigestTypeName(digestType: number): string {
  return DIGEST_TYPE_NAMES[digestType] || `Unknown (${digestType})`;
}

export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
