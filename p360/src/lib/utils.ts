import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ParsedResumeToken {
  term: number;
  optime: { ts: number; inc: number };
  timestamp: number;
}

export function parseResumeToken(token: string): ParsedResumeToken | null {
  try {
    const decoded = typeof atob === 'function'
      ? atob(token)
      : Buffer.from(token, 'base64').toString();
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;
    const term = parseInt(parts[0]);
    const ts = parseInt(parts[1]);
    const inc = parseInt(parts[2]);
    if (isNaN(term) || isNaN(ts) || isNaN(inc)) return null;
    return {
      term,
      optime: { ts, inc },
      timestamp: ts * 1000,
    };
  } catch {
    return null;
  }
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

export function formatOptime(optime: { ts: number; inc: number }): string {
  return `${optime.ts}:${optime.inc}`;
}

export function formatTokenDisplay(token: string): string {
  const parsed = parseResumeToken(token);
  if (!parsed) return token;
  return `term=${parsed.term} ts=${parsed.optime.ts} inc=${parsed.optime.inc}`;
}

export const ERROR_CODE_LABELS: Record<number, { label: string; color: string }> = {
  40601: { label: 'INVALID_TOKEN', color: 'red' },
  40602: { label: 'TOKEN_EXPIRED', color: 'orange' },
  40603: { label: 'TERM_MISMATCH', color: 'purple' },
  40604: { label: 'FUTURE_TOKEN', color: 'blue' },
};

export function getErrorCodeInfo(code: number) {
  return ERROR_CODE_LABELS[code] || { label: `ERROR_${code}`, color: 'zinc' };
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
