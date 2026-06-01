import { create } from 'zustand';
import type { LdapConnectionConfig } from '../../shared/types.js';
import { api } from '../lib/api.js';

interface LdapState {
  connectionConfig: LdapConnectionConfig | null;
  isConnected: boolean;
  connectionError: string | null;
  isTesting: boolean;
  serverInfo: {
    vendorName?: string;
    vendorVersion?: string;
    namingContexts?: string[];
    supportedLDAPVersion?: string[];
  } | null;
  setConnectionConfig: (config: LdapConnectionConfig) => void;
  testConnection: () => Promise<boolean>;
  clearConnection: () => void;
}

const defaultConfig: LdapConnectionConfig = {
  host: 'localhost',
  port: 389,
  baseDn: 'dc=example,dc=com',
  bindDn: 'cn=admin,dc=example,dc=com',
  bindPassword: '',
  useTls: false,
};

export const useLdapStore = create<LdapState>((set, get) => ({
  connectionConfig: defaultConfig,
  isConnected: false,
  connectionError: null,
  isTesting: false,
  serverInfo: null,

  setConnectionConfig: (config: LdapConnectionConfig) => {
    set({ connectionConfig: config });
  },

  testConnection: async () => {
    const config = get().connectionConfig;
    if (!config) {
      set({ connectionError: '请先配置连接参数', isConnected: false });
      return false;
    }

    set({ isTesting: true, connectionError: null });

    try {
      const result = await api.ldap.connect(config);
      
      if (result.success) {
        set({
          isConnected: true,
          isTesting: false,
          serverInfo: result.serverInfo || null,
          connectionError: null,
        });
        return true;
      } else {
        set({
          isConnected: false,
          isTesting: false,
          connectionError: result.message,
          serverInfo: null,
        });
        return false;
      }
    } catch (error) {
      set({
        isConnected: false,
        isTesting: false,
        connectionError: error instanceof Error ? error.message : '未知错误',
        serverInfo: null,
      });
      return false;
    }
  },

  clearConnection: () => {
    set({
      connectionConfig: defaultConfig,
      isConnected: false,
      connectionError: null,
      serverInfo: null,
    });
  },
}));
