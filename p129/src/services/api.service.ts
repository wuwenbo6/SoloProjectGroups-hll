import type { ControlFlowGraph, DataFlowGraph, PassTemplateResponse } from '@shared/types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export async function exportCFGToDot(cfg: ControlFlowGraph): Promise<Blob> {
  const response = await fetch(`${API_BASE}/compile/export/cfg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  
  if (!response.ok) {
    throw new Error('Failed to export CFG');
  }
  
  return await response.blob();
}

export async function exportDFGToDot(dfg: DataFlowGraph): Promise<Blob> {
  const response = await fetch(`${API_BASE}/compile/export/dfg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dfg),
  });
  
  if (!response.ok) {
    throw new Error('Failed to export DFG');
  }
  
  return await response.blob();
}

export async function generatePassTemplate(passName: string): Promise<PassTemplateResponse> {
  const response = await fetch(`${API_BASE}/compile/pass-template/${passName}`);
  
  if (!response.ok) {
    throw new Error('Failed to generate pass template');
  }
  
  return await response.json();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
