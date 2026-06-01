import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { SignLogEntry, SignLogExport, VersionInfo } from '../types';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'sign_logs.json');
let logEntries: SignLogEntry[] = [];

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, JSON.stringify([], null, 2));
  }
}

function loadLogs(): void {
  ensureLogDir();
  try {
    const data = fs.readFileSync(LOG_FILE, 'utf8');
    logEntries = JSON.parse(data);
  } catch (error) {
    logEntries = [];
  }
}

function saveLogs(): void {
  ensureLogDir();
  fs.writeFileSync(LOG_FILE, JSON.stringify(logEntries, null, 2));
}

export function generateLogId(): string {
  return 'LOG-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

export function addLogEntry(entry: Omit<SignLogEntry, 'id' | 'timestamp'>): SignLogEntry {
  loadLogs();
  
  const newEntry: SignLogEntry = {
    ...entry,
    id: generateLogId(),
    timestamp: Date.now(),
  };
  
  logEntries.unshift(newEntry);
  
  const MAX_LOG_ENTRIES = 1000;
  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries = logEntries.slice(0, MAX_LOG_ENTRIES);
  }
  
  saveLogs();
  return newEntry;
}

export function getLogEntries(limit?: number, offset?: number): SignLogEntry[] {
  loadLogs();
  let result = [...logEntries];
  
  if (offset) {
    result = result.slice(offset);
  }
  if (limit) {
    result = result.slice(0, limit);
  }
  
  return result;
}

export function getLogById(id: string): SignLogEntry | undefined {
  loadLogs();
  return logEntries.find(entry => entry.id === id);
}

export function searchLogs(
  filters: {
    operation?: string;
    status?: string;
    firmwareName?: string;
    certificateCN?: string;
    startDate?: number;
    endDate?: number;
  }
): SignLogEntry[] {
  loadLogs();
  
  return logEntries.filter(entry => {
    if (filters.operation && entry.operation !== filters.operation) return false;
    if (filters.status && entry.status !== filters.status) return false;
    if (filters.firmwareName && !entry.firmwareName.includes(filters.firmwareName)) return false;
    if (filters.certificateCN && !entry.certificateCN.includes(filters.certificateCN)) return false;
    if (filters.startDate && entry.timestamp < filters.startDate) return false;
    if (filters.endDate && entry.timestamp > filters.endDate) return false;
    return true;
  });
}

export function getLogStats(): {
  total: number;
  success: number;
  failed: number;
  signOps: number;
  verifyOps: number;
  last24h: number;
} {
  loadLogs();
  
  const now = Date.now();
  const last24h = now - 24 * 60 * 60 * 1000;
  
  return {
    total: logEntries.length,
    success: logEntries.filter(e => e.status === 'success').length,
    failed: logEntries.filter(e => e.status === 'failed').length,
    signOps: logEntries.filter(e => e.operation === 'sign').length,
    verifyOps: logEntries.filter(e => e.operation === 'verify').length,
    last24h: logEntries.filter(e => e.timestamp >= last24h).length,
  };
}

export function exportLogs(
  format: 'json' | 'csv' | 'txt',
  entries?: SignLogEntry[]
): string {
  loadLogs();
  const data = entries || logEntries;
  
  if (format === 'json') {
    const exportData: SignLogExport = {
      exportTime: Date.now(),
      totalEntries: data.length,
      exportedBy: 'web-interface',
      entries: data,
    };
    return JSON.stringify(exportData, null, 2);
  } else if (format === 'csv') {
    const headers = [
      'ID',
      'Timestamp',
      'Operation',
      'Status',
      'Firmware Name',
      'Firmware Size',
      'Firmware Hash',
      'Certificate CN',
      'Certificate Serial',
      'Sign Algorithm',
      'Encrypt Algorithm',
      'Package Filename',
      'Package Size',
      'Duration (ms)',
      'Error Message',
    ];
    
    const rows = data.map(entry => [
      entry.id,
      new Date(entry.timestamp).toISOString(),
      entry.operation,
      entry.status,
      `"${entry.firmwareName.replace(/"/g, '""')}"`,
      entry.firmwareSize,
      entry.firmwareHash,
      `"${entry.certificateCN.replace(/"/g, '""')}"`,
      entry.certificateSerial,
      entry.signAlgorithm,
      entry.encryptAlgorithm,
      entry.packageFilename ? `"${entry.packageFilename.replace(/"/g, '""')}"` : '',
      entry.packageSize || '',
      entry.durationMs || '',
      entry.errorMessage ? `"${entry.errorMessage.replace(/"/g, '""')}"` : '',
    ]);
    
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  } else {
    return data.map(entry => {
      let line = `[${new Date(entry.timestamp).toISOString()}] [${entry.id}]\n`;
      line += `  Operation: ${entry.operation.toUpperCase()} - ${entry.status.toUpperCase()}\n`;
      line += `  Firmware: ${entry.firmwareName} (${entry.firmwareSize} bytes)\n`;
      line += `  Hash: ${entry.firmwareHash}\n`;
      line += `  Certificate: ${entry.certificateCN} (${entry.certificateSerial})\n`;
      line += `  Algorithms: ${entry.signAlgorithm} / ${entry.encryptAlgorithm}\n`;
      if (entry.packageFilename) {
        line += `  Package: ${entry.packageFilename} (${entry.packageSize} bytes)\n`;
      }
      if (entry.durationMs) {
        line += `  Duration: ${entry.durationMs}ms\n`;
      }
      if (entry.errorMessage) {
        line += `  Error: ${entry.errorMessage}\n`;
      }
      if (entry.versionInfo) {
        line += `  Version: FW=${entry.versionInfo.firmwareVersion}, PKG=${entry.versionInfo.packageVersion}\n`;
      }
      line += '  ' + '-'.repeat(60) + '\n';
      return line;
    }).join('\n');
  }
}

export function clearLogs(): boolean {
  try {
    logEntries = [];
    saveLogs();
    return true;
  } catch (error) {
    return false;
  }
}

export function deleteLogEntry(id: string): boolean {
  loadLogs();
  const index = logEntries.findIndex(e => e.id === id);
  if (index !== -1) {
    logEntries.splice(index, 1);
    saveLogs();
    return true;
  }
  return false;
}

loadLogs();
