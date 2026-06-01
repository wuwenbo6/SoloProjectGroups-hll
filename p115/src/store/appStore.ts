import { create } from 'zustand';
import type { MappingRule, OpcuaNode, ServerStatus, SystemConfig, NodeHistory, HistoryQuery, SyncLog, SyncStatus } from '../../shared/types';
import { mappingApi, opcuaApi, configApi, historyApi, syncApi } from '../lib/api';

interface AppState {
  serverStatus: ServerStatus | null;
  mappingRules: MappingRule[];
  opcuaNodes: OpcuaNode | null;
  selectedNode: OpcuaNode | null;
  systemConfig: SystemConfig | null;
  historyData: NodeHistory[];
  syncStatus: SyncStatus | null;
  syncLogs: SyncLog[];
  loading: Record<string, boolean>;
  error: string | null;
  
  setLoading: (key: string, value: boolean) => void;
  setError: (error: string | null) => void;
  
  fetchServerStatus: () => Promise<void>;
  startServer: () => Promise<{ success: boolean; message?: string }>;
  stopServer: () => Promise<{ success: boolean; message?: string }>;
  restartServer: () => Promise<{ success: boolean; message?: string }>;
  
  fetchMappingRules: () => Promise<void>;
  createMappingRule: (rule: Omit<MappingRule, 'id' | 'createdAt' | 'updatedAt'>) => Promise<{ success: boolean; id?: number }>;
  updateMappingRule: (id: number, rule: Partial<MappingRule>) => Promise<boolean>;
  deleteMappingRule: (id: number) => Promise<boolean>;
  
  fetchOpcuaNodes: () => Promise<void>;
  fetchNodeDetails: (nodeId: string) => Promise<void>;
  selectNode: (node: OpcuaNode | null) => void;
  
  fetchConfig: () => Promise<void>;
  updateConfig: (config: Partial<SystemConfig>) => Promise<boolean>;
  
  fetchHistory: (query: HistoryQuery) => Promise<void>;
  fetchHistoryStats: (nodeId?: string) => Promise<{ totalRecords: number; firstRecord: string | null; lastRecord: string | null } | null>;
  cleanupHistory: (days?: number) => Promise<{ success: boolean; deletedCount?: number }>;
  
  fetchSyncStatus: () => Promise<void>;
  startSync: () => Promise<{ success: boolean; message?: string }>;
  stopSync: () => Promise<{ success: boolean; message?: string }>;
  modbusToUaSync: () => Promise<{ success: boolean; syncedCount?: number; errors?: string[] }>;
  uaToModbusSync: (nodeId: string, value: any) => Promise<{ success: boolean; message?: string }>;
  fetchSyncLogs: (limit?: number, status?: string) => Promise<void>;
  
  uploadExcel: (file: File) => Promise<{ success: boolean; data?: MappingRule[]; errors?: string[] }>;
  importRules: (rules: MappingRule[], replace?: boolean) => Promise<{ success: boolean; importedCount?: number }>;
}

export const useAppStore = create<AppState>((set, get) => ({
  serverStatus: null,
  mappingRules: [],
  opcuaNodes: null,
  selectedNode: null,
  systemConfig: null,
  historyData: [],
  syncStatus: null,
  syncLogs: [],
  loading: {},
  error: null,

  setLoading: (key, value) =>
    set((state) => ({ loading: { ...state.loading, [key]: value } })),
  
  setError: (error) => set({ error }),

  fetchServerStatus: async () => {
    get().setLoading('serverStatus', true);
    const result = await opcuaApi.getStatus();
    get().setLoading('serverStatus', false);
    if (result.success && result.data) {
      set({ serverStatus: result.data });
    }
  },

  startServer: async () => {
    get().setLoading('serverControl', true);
    const result = await opcuaApi.startServer();
    get().setLoading('serverControl', false);
    if (result.success) {
      await get().fetchServerStatus();
      return { success: true, message: result.data?.message };
    }
    return { success: false, message: result.error };
  },

  stopServer: async () => {
    get().setLoading('serverControl', true);
    const result = await opcuaApi.stopServer();
    get().setLoading('serverControl', false);
    if (result.success) {
      await get().fetchServerStatus();
      return { success: true, message: result.data?.message };
    }
    return { success: false, message: result.error };
  },

  restartServer: async () => {
    get().setLoading('serverControl', true);
    const result = await opcuaApi.restartServer();
    get().setLoading('serverControl', false);
    if (result.success) {
      await get().fetchServerStatus();
      return { success: true, message: result.data?.message };
    }
    return { success: false, message: result.error };
  },

  fetchMappingRules: async () => {
    get().setLoading('mappingRules', true);
    const result = await mappingApi.getRules();
    get().setLoading('mappingRules', false);
    if (result.success && result.data) {
      set({ mappingRules: result.data });
    }
  },

  createMappingRule: async (rule) => {
    get().setLoading('createRule', true);
    const result = await mappingApi.createRule(rule);
    get().setLoading('createRule', false);
    if (result.success && result.data) {
      await get().fetchMappingRules();
      return { success: true, id: result.data.id };
    }
    return { success: false };
  },

  updateMappingRule: async (id, rule) => {
    const result = await mappingApi.updateRule(id, rule);
    if (result.success) {
      await get().fetchMappingRules();
      return true;
    }
    return false;
  },

  deleteMappingRule: async (id) => {
    const result = await mappingApi.deleteRule(id);
    if (result.success) {
      await get().fetchMappingRules();
      return true;
    }
    return false;
  },

  fetchOpcuaNodes: async () => {
    get().setLoading('opcuaNodes', true);
    const result = await opcuaApi.getNodes();
    get().setLoading('opcuaNodes', false);
    if (result.success && result.data) {
      set({ opcuaNodes: result.data });
    }
  },

  fetchNodeDetails: async (nodeId) => {
    const result = await opcuaApi.getNode(nodeId);
    if (result.success && result.data) {
      set({ selectedNode: result.data });
    }
  },

  selectNode: (node) => set({ selectedNode: node }),

  fetchConfig: async () => {
    const result = await configApi.getConfig();
    if (result.success && result.data) {
      set({ systemConfig: result.data });
    }
  },

  updateConfig: async (config) => {
    const result = await configApi.updateConfig(config);
    if (result.success) {
      await get().fetchConfig();
      return true;
    }
    return false;
  },

  uploadExcel: async (file) => {
    get().setLoading('uploadExcel', true);
    const result = await mappingApi.uploadExcel(file);
    get().setLoading('uploadExcel', false);
    return {
      success: result.success,
      data: result.data,
      errors: result.errors,
    };
  },

  importRules: async (rules, replace = false, autoResolveConflict = true) => {
    get().setLoading('importRules', true);
    const result = await mappingApi.importRules(rules, replace, autoResolveConflict);
    get().setLoading('importRules', false);
    if (result.success && result.data) {
      await get().fetchMappingRules();
      return { 
        success: true, 
        successCount: result.data.successCount,
        failedCount: result.data.failedCount,
        totalCount: result.data.totalCount,
        messages: result.data.messages
      };
    }
    return { success: false, error: result.error };
  },

  fetchHistory: async (query) => {
    get().setLoading('history', true);
    const result = await historyApi.query(query);
    get().setLoading('history', false);
    if (result.success && result.data) {
      set({ historyData: result.data });
    }
  },

  fetchHistoryStats: async (nodeId) => {
    const result = await historyApi.getStats(nodeId);
    if (result.success && result.data) {
      return result.data;
    }
    return null;
  },

  cleanupHistory: async (days = 30) => {
    const result = await historyApi.cleanup(days);
    if (result.success && result.data) {
      return { success: true, deletedCount: result.data.deletedCount };
    }
    return { success: false };
  },

  fetchSyncStatus: async () => {
    const result = await syncApi.getStatus();
    if (result.success && result.data) {
      set({ syncStatus: result.data });
    }
  },

  startSync: async () => {
    const result = await syncApi.start();
    if (result.success) {
      await get().fetchSyncStatus();
      return { success: true, message: result.data?.message };
    }
    return { success: false, message: result.error };
  },

  stopSync: async () => {
    const result = await syncApi.stop();
    if (result.success) {
      await get().fetchSyncStatus();
      return { success: true, message: result.data?.message };
    }
    return { success: false, message: result.error };
  },

  modbusToUaSync: async () => {
    const result = await syncApi.modbusToUa();
    if (result.success && result.data) {
      return { success: true, syncedCount: result.data.syncedCount, errors: result.data.errors };
    }
    return { success: false };
  },

  uaToModbusSync: async (nodeId, value) => {
    const result = await syncApi.uaToModbus(nodeId, value);
    if (result.success) {
      return { success: true };
    }
    return { success: false, message: result.error };
  },

  fetchSyncLogs: async (limit = 100, status) => {
    const result = await syncApi.getLogs(limit, status);
    if (result.success && result.data) {
      set({ syncLogs: result.data });
    }
  },
}));
