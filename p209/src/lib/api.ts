import type {
  LdapConnectionConfig,
  LdapAttributeType,
  LdapObjectClass,
  NewAttributeDefinition,
  SchemaGenerateRequest,
  SchemaGenerateResponse,
  SchemaDeployRequest,
  SchemaDeployResponse,
  ConnectTestResponse,
  ReindexRequest,
  ReindexResponse,
  CompatibilityCheckRequest,
  CompatibilityCheckResponse,
  ExportSchemaLdifRequest,
} from '../../shared/types.js';

const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `HTTP ${response.status}`);
  }
  return data;
}

export const api = {
  ldap: {
    connect: (config: LdapConnectionConfig): Promise<ConnectTestResponse> =>
      request('/ldap/connect', {
        method: 'POST',
        body: JSON.stringify(config),
      }),

    getSchema: (config: LdapConnectionConfig): Promise<{ success: boolean; data: { objectClasses: LdapObjectClass[]; attributeTypes: LdapAttributeType[] } }> => {
      const params = new URLSearchParams({
        host: config.host,
        port: String(config.port),
        baseDn: config.baseDn,
        bindDn: config.bindDn,
        bindPassword: config.bindPassword,
        useTls: String(config.useTls),
      });
      return request(`/ldap/schema?${params.toString()}`);
    },

    getObjectClasses: (config: LdapConnectionConfig): Promise<{ success: boolean; data: LdapObjectClass[] }> => {
      const params = new URLSearchParams({
        host: config.host,
        port: String(config.port),
        baseDn: config.baseDn,
        bindDn: config.bindDn,
        bindPassword: config.bindPassword,
        useTls: String(config.useTls),
      });
      return request(`/ldap/schema/objectclasses?${params.toString()}`);
    },

    getAttributeTypes: (config: LdapConnectionConfig): Promise<{ success: boolean; data: LdapAttributeType[] }> => {
      const params = new URLSearchParams({
        host: config.host,
        port: String(config.port),
        baseDn: config.baseDn,
        bindDn: config.bindDn,
        bindPassword: config.bindPassword,
        useTls: String(config.useTls),
      });
      return request(`/ldap/schema/attributetypes?${params.toString()}`);
    },
  },

  schema: {
    generate: (
      requestData: SchemaGenerateRequest,
      existingAttributeNames: string[],
      existingObjectClassNames: string[]
    ): Promise<SchemaGenerateResponse> =>
      request('/schema/generate', {
        method: 'POST',
        body: JSON.stringify({
          ...requestData,
          existingAttributeNames,
          existingObjectClassNames,
        }),
      }),

    validate: (content: string, type: 'ldif' | 'schema'): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> =>
      request('/schema/validate', {
        method: 'POST',
        body: JSON.stringify({ content, type }),
      }),

    deploy: (requestData: SchemaDeployRequest): Promise<SchemaDeployResponse> =>
      request('/schema/deploy', {
        method: 'POST',
        body: JSON.stringify(requestData),
      }),

    download: (content: string, filename: string, type: 'ldif' | 'schema'): Promise<void> => {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      return Promise.resolve();
    },

    reindex: (requestData: ReindexRequest): Promise<ReindexResponse> =>
      request('/schema/reindex', {
        method: 'POST',
        body: JSON.stringify(requestData),
      }),

    compatibilityCheck: (requestData: CompatibilityCheckRequest): Promise<CompatibilityCheckResponse> =>
      request('/schema/compatibility-check', {
        method: 'POST',
        body: JSON.stringify(requestData),
      }),

    exportLdif: (requestData: ExportSchemaLdifRequest): Promise<{ success: boolean; ldifContent: string }> =>
      request('/schema/export-ldif', {
        method: 'POST',
        body: JSON.stringify(requestData),
      }),
  },
};
