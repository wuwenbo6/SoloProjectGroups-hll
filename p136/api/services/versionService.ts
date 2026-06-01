import crypto from 'crypto';
import type { VersionInfo, CertInfo } from '../types';

export function generateVersionHash(firmwareName: string, timestamp: number): string {
  const hash = crypto.createHash('md5');
  hash.update(firmwareName + timestamp);
  return hash.digest('hex').substring(0, 8).toUpperCase();
}

export function generateBuildNumber(): number {
  const epoch = new Date('2020-01-01').getTime();
  return Math.floor((Date.now() - epoch) / 1000 / 60);
}

export function createVersionInfo(
  firmwareName: string,
  certInfo: CertInfo,
  customVersion?: Partial<VersionInfo>
): VersionInfo {
  const timestamp = Date.now();
  const keyVersion = generateVersionHash(certInfo.serialNumber, timestamp);
  const firmwareVersion = customVersion?.firmwareVersion || generateVersionHash(firmwareName, timestamp);
  
  return {
    firmwareVersion,
    packageVersion: customVersion?.packageVersion || '1.0.0',
    keyVersion,
    hardwareVersion: customVersion?.hardwareVersion,
    buildNumber: customVersion?.buildNumber || generateBuildNumber(),
    revision: customVersion?.revision,
    changelog: customVersion?.changelog,
  };
}

export function parseFirmwareVersion(filename: string): string | null {
  const versionRegex = /v?(\d+\.\d+\.\d+)/;
  const match = filename.match(versionRegex);
  return match ? match[1] : null;
}

export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  
  return 0;
}

export function validateVersionFormat(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

export function formatVersionInfo(version: VersionInfo): string {
  let result = `Firmware: ${version.firmwareVersion}\n`;
  result += `Package: ${version.packageVersion}\n`;
  result += `Key: ${version.keyVersion}\n`;
  if (version.hardwareVersion) result += `Hardware: ${version.hardwareVersion}\n`;
  if (version.buildNumber) result += `Build: ${version.buildNumber}\n`;
  if (version.revision) result += `Revision: ${version.revision}\n`;
  return result;
}

export function incrementVersion(version: string, type: 'major' | 'minor' | 'patch' = 'patch'): string {
  const parts = version.split('.').map(Number);
  parts[0] = parts[0] || 0;
  parts[1] = parts[1] || 0;
  parts[2] = parts[2] || 0;
  
  if (type === 'major') {
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
  } else if (type === 'minor') {
    parts[1]++;
    parts[2] = 0;
  } else {
    parts[2]++;
  }
  
  return parts.join('.');
}
