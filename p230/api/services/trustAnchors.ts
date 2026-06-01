import { TrustAnchor, DSRecord } from '../../shared/types';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'trust-anchors.json');

let anchors: TrustAnchor[] = [];
let loaded = false;

function loadAnchors(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      anchors = JSON.parse(data);
    } else {
      anchors = getDefaultAnchors();
      saveAnchors();
    }
  } catch {
    anchors = getDefaultAnchors();
    saveAnchors();
  }
}

function saveAnchors(): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(anchors, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

function getDefaultAnchors(): TrustAnchor[] {
  return [
    {
      id: 'root-ks1',
      domain: '.',
      keyTag: 20326,
      algorithm: 8,
      digestType: 2,
      digest: 'E06D44B80B8F1D39A95C0B0D7C65D08458E880409BBC683458104237C7F8EC9D',
      description: '根区域 KSK-2024 (RSASHA256 / SHA-256)',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'root-ks2',
      domain: '.',
      keyTag: 38696,
      algorithm: 8,
      digestType: 2,
      digest: '683D013298E7CE367D5A3A33F21A6D9B4B9E6D2E6E9B3E0F7A3D1A8B4C6E2F8',
      description: '根区域备用 KSK (RSASHA256 / SHA-256)',
      createdAt: new Date().toISOString(),
    },
  ];
}

export function getAllAnchors(): TrustAnchor[] {
  loadAnchors();
  return [...anchors];
}

export function getAnchorById(id: string): TrustAnchor | undefined {
  loadAnchors();
  return anchors.find(a => a.id === id);
}

export function getAnchorsForDomain(domain: string): TrustAnchor[] {
  loadAnchors();
  if (domain === '.' || domain === '') return anchors;
  return anchors.filter(a => a.domain === '.' || a.domain === domain);
}

export function anchorToDSRecord(anchor: TrustAnchor): DSRecord {
  return {
    name: anchor.domain === '.' ? '.' : anchor.domain,
    type: 'DS',
    ttl: 0,
    data: `${anchor.keyTag} ${anchor.algorithm} ${anchor.digestType} ${anchor.digest}`,
    keyTag: anchor.keyTag,
    algorithm: anchor.algorithm,
    digestType: anchor.digestType,
    digest: anchor.digest,
  };
}

export function addAnchor(anchor: Omit<TrustAnchor, 'id' | 'createdAt'>): TrustAnchor {
  loadAnchors();
  const newAnchor: TrustAnchor = {
    ...anchor,
    id: `anchor-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  anchors.push(newAnchor);
  saveAnchors();
  return newAnchor;
}

export function removeAnchor(id: string): boolean {
  loadAnchors();
  const index = anchors.findIndex(a => a.id === id);
  if (index < 0) return false;
  anchors.splice(index, 1);
  saveAnchors();
  return true;
}

export function updateAnchor(id: string, updates: Partial<Omit<TrustAnchor, 'id' | 'createdAt'>>): TrustAnchor | null {
  loadAnchors();
  const index = anchors.findIndex(a => a.id === id);
  if (index < 0) return null;
  anchors[index] = { ...anchors[index], ...updates };
  saveAnchors();
  return anchors[index];
}
