export interface MethodInfo {
  name: string;
  fullMethod: string;
  inputType: string;
  outputType: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  isServerStreaming: boolean;
  isClientStreaming: boolean;
}

export interface InvokeResponse {
  response?: string;
  error?: string;
  status: string;
  duration: string;
}

export interface SchemaResponse {
  template: string;
  inputType: string;
  outputType: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface TestCase {
  id: string;
  name: string;
  address: string;
  tls: boolean;
  method: string;
  requestJson: string;
  timeout: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProtoExportResponse {
  files: Record<string, string>;
  service: string;
}

const API_BASE = '/api';

async function request<T>(url: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(API_BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok && data.error) {
    throw new Error(data.error);
  }
  return data as T;
}

async function getRequest<T>(url: string): Promise<T> {
  const res = await fetch(API_BASE + url);
  const data = await res.json();
  if (!res.ok && data.error) {
    throw new Error(data.error);
  }
  return data as T;
}

export async function connect(address: string, tls: boolean): Promise<string[]> {
  const data = await request<{ services: string[] }>('/connect', { address, tls });
  return data.services;
}

export async function getServices(
  address: string,
  tls: boolean,
  service: string
): Promise<MethodInfo[]> {
  const data = await request<{ methods: MethodInfo[] }>('/services', {
    address,
    tls,
    service,
  });
  return data.methods;
}

export async function getSchema(
  address: string,
  tls: boolean,
  method: string
): Promise<SchemaResponse> {
  return request<SchemaResponse>('/schema', {
    address,
    tls,
    method,
  });
}

export async function invoke(
  address: string,
  tls: boolean,
  method: string,
  requestJson: string,
  timeout: number
): Promise<InvokeResponse> {
  return request<InvokeResponse>('/invoke', {
    address,
    tls,
    method,
    requestJson,
    timeout,
  });
}

export async function listTestCases(): Promise<TestCase[]> {
  return getRequest<TestCase[]>('/testcases');
}

export async function saveTestCase(tc: Partial<TestCase>): Promise<TestCase> {
  return request<TestCase>('/testcases/save', tc);
}

export async function deleteTestCase(id: string): Promise<void> {
  await request<{ status: string }>('/testcases/delete', { id });
}

export async function exportProto(
  address: string,
  tls: boolean,
  service: string
): Promise<ProtoExportResponse> {
  return request<ProtoExportResponse>('/proto/export', {
    address,
    tls,
    service,
  });
}
