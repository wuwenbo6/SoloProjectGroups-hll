import type { ACE } from '../../shared/types.js';
import { INHERITANCE_FLAGS } from '../../shared/types.js';

export function parseNFS4ACL(output: string): ACE[] {
  const aces: ACE[] = [];
  const lines = output.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('$')) {
      continue;
    }

    const ace = parseACELine(trimmed);
    if (ace) {
      aces.push(ace);
    }
  }

  return sortACEs(aces);
}

function parseACELine(line: string): ACE | null {
  const parts = line.split(':');
  
  if (parts.length < 4) {
    return null;
  }

  const type = parts[0] as 'A' | 'D';
  if (type !== 'A' && type !== 'D') {
    return null;
  }

  const flags = parts[1];
  const principal = parts[2];
  const permissionsStr = parts[3];

  const permissions = permissionsStr.split('').filter(p => p.trim() !== '');

  return {
    type,
    flags,
    principal,
    permissions,
  };
}

export function isInheritedACE(ace: ACE): boolean {
  return INHERITANCE_FLAGS.some((f) => ace.flags.includes(f));
}

export function sortACEs(aces: ACE[]): ACE[] {
  return [...aces].sort((a, b) => {
    const aInherited = isInheritedACE(a);
    const bInherited = isInheritedACE(b);

    if (aInherited && !bInherited) return -1;
    if (!aInherited && bInherited) return 1;

    if (a.type === 'D' && b.type === 'A') return -1;
    if (a.type === 'A' && b.type === 'D') return 1;

    return 0;
  });
}

export function serializeACEToCommand(ace: ACE): string {
  const permissions = ace.permissions.join('');
  return `${ace.type}:${ace.flags}:${ace.principal}:${permissions}`;
}

export function serializeACLsToCommand(aces: ACE[]): string {
  return aces.map(serializeACEToCommand).join(',');
}

export function serializeACEForDisplay(ace: ACE): string {
  const typeLabel = ace.type === 'A' ? 'Allow' : 'Deny';
  const perms = ace.permissions.join('');
  return `${typeLabel}:${ace.flags}:${ace.principal}:${perms}`;
}

export function validateACE(ace: ACE): boolean {
  if (!ace.type || (ace.type !== 'A' && ace.type !== 'D')) {
    return false;
  }
  if (!ace.principal || ace.principal.trim() === '') {
    return false;
  }
  if (!Array.isArray(ace.permissions) || ace.permissions.length === 0) {
    return false;
  }
  return true;
}

export function createEmptyACE(): ACE {
  return {
    type: 'A',
    flags: '',
    principal: '',
    permissions: [],
  };
}

export function exportAsGetfacl(aces: ACE[], path: string): string {
  const lines: string[] = [
    `# file: ${path}`,
    `# NFSv4 ACL - ${aces.length} entries`,
    '',
  ];
  for (const ace of aces) {
    lines.push(`${ace.type}:${ace.flags}:${ace.principal}:${ace.permissions.join('')}`);
  }
  return lines.join('\n');
}

export function exportAsSetfacl(aces: ACE[], path: string): string {
  const spec = aces
    .map((ace) => `${ace.type}:${ace.flags}:${ace.principal}:${ace.permissions.join('')}`)
    .join(',');
  return `nfs4_setfacl -m ${spec} ${path}`;
}
