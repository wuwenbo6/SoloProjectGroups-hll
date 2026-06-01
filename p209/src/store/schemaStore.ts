import { create } from 'zustand';
import type { LdapObjectClass, LdapAttributeType, ExportSchemaLdifRequest } from '../../shared/types.js';
import { api } from '../lib/api.js';
import { useLdapStore } from './ldapStore.js';

interface SchemaState {
  objectClasses: LdapObjectClass[];
  attributeTypes: LdapAttributeType[];
  loading: boolean;
  error: string | null;
  selectedObjectClass: LdapObjectClass | null;
  selectedAttributeType: LdapAttributeType | null;
  searchQuery: string;
  filterType: 'all' | 'objectClass' | 'attributeType';
  isExporting: boolean;
  fetchSchema: () => Promise<void>;
  setSelectedObjectClass: (oc: LdapObjectClass | null) => void;
  setSelectedAttributeType: (at: LdapAttributeType | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterType: (type: 'all' | 'objectClass' | 'attributeType') => void;
  clearSchema: () => void;
  exportSchemaAsLdif: (format: 'add' | 'full', selectedOnly?: boolean) => Promise<string | null>;
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  objectClasses: [],
  attributeTypes: [],
  loading: false,
  error: null,
  selectedObjectClass: null,
  selectedAttributeType: null,
  searchQuery: '',
  filterType: 'all',
  isExporting: false,

  fetchSchema: async () => {
    const config = useLdapStore.getState().connectionConfig;
    if (!config) {
      set({ error: '请先配置连接参数', loading: false });
      return;
    }

    set({ loading: true, error: null });

    try {
      const result = await api.ldap.getSchema(config);
      
      if (result.success) {
        set({
          objectClasses: result.data.objectClasses,
          attributeTypes: result.data.attributeTypes,
          loading: false,
          error: null,
        });
      } else {
        set({
          loading: false,
          error: '获取 Schema 失败',
        });
      }
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  },

  setSelectedObjectClass: (oc: LdapObjectClass | null) => {
    set({ selectedObjectClass: oc, selectedAttributeType: null });
  },

  setSelectedAttributeType: (at: LdapAttributeType | null) => {
    set({ selectedAttributeType: at, selectedObjectClass: null });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  setFilterType: (type: 'all' | 'objectClass' | 'attributeType') => {
    set({ filterType: type });
  },

  exportSchemaAsLdif: async (format: 'add' | 'full', selectedOnly?: boolean) => {
    const state = get();
    set({ isExporting: true });

    try {
      let attributeTypes: LdapAttributeType[] = [];
      let objectClasses: LdapObjectClass[] = [];

      if (selectedOnly) {
        if (state.selectedAttributeType) {
          attributeTypes = [state.selectedAttributeType];
        }
        if (state.selectedObjectClass) {
          objectClasses = [state.selectedObjectClass];
        }
        if (attributeTypes.length === 0 && objectClasses.length === 0) {
          set({ isExporting: false });
          return null;
        }
      } else {
        attributeTypes = state.attributeTypes;
        objectClasses = state.objectClasses;
      }

      const result = await api.schema.exportLdif({
        attributeTypes,
        objectClasses,
        format,
      });

      set({ isExporting: false });
      return result.ldifContent;
    } catch (error) {
      set({ isExporting: false });
      return null;
    }
  },

  clearSchema: () => {
    set({
      objectClasses: [],
      attributeTypes: [],
      loading: false,
      error: null,
      selectedObjectClass: null,
      selectedAttributeType: null,
      searchQuery: '',
      filterType: 'all',
    });
  },
}));
