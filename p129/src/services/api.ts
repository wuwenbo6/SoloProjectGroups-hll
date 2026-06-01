import type {
  CodeSnippet,
  OptimizePass,
  CompileRequest,
  CompileResponse,
} from '@shared/types';

const API_BASE = '/api';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}

export async function compileCode(
  code: string,
  passes: string[]
): Promise<CompileResponse> {
  const body: CompileRequest = { code, passes };
  return request<CompileResponse>('/compile', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getPasses(): Promise<{
  success: boolean;
  passes: OptimizePass[];
}> {
  return request<{ success: boolean; passes: OptimizePass[] }>('/compile/passes');
}

export async function getToolchainStatus(): Promise<{
  success: boolean;
  clangAvailable: boolean;
  optAvailable: boolean;
  clangVersion?: string;
  optVersion?: string;
}> {
  return request<{
    success: boolean;
    clangAvailable: boolean;
    optAvailable: boolean;
    clangVersion?: string;
    optVersion?: string;
  }>('/compile/toolchain');
}

export async function getSnippets(
  query?: string
): Promise<{ success: boolean; data: CodeSnippet[] }> {
  const url = query ? `/codes?q=${encodeURIComponent(query)}` : '/codes';
  return request<{ success: boolean; data: CodeSnippet[] }>(url);
}

export async function getSnippet(
  id: number
): Promise<{ success: boolean; data: CodeSnippet }> {
  return request<{ success: boolean; data: CodeSnippet }>(`/codes/${id}`);
}

export async function createSnippet(
  name: string,
  code: string
): Promise<{ success: boolean; data: CodeSnippet }> {
  return request<{ success: boolean; data: CodeSnippet }>('/codes', {
    method: 'POST',
    body: JSON.stringify({ name, code }),
  });
}

export async function updateSnippet(
  id: number,
  name: string,
  code: string
): Promise<{ success: boolean; data: CodeSnippet }> {
  return request<{ success: boolean; data: CodeSnippet }>(`/codes/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, code }),
  });
}

export async function deleteSnippet(
  id: number
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(`/codes/${id}`, {
    method: 'DELETE',
  });
}
