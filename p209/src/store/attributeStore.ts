import { create } from 'zustand';
import type { NewAttributeDefinition, SchemaGenerateRequest, SchemaGenerateResponse, SchemaDeployResponse, DbIndexConfig, ReindexResponse, CompatibilityConflict } from '../../shared/types.js';
import { DEFAULT_ATTRIBUTE } from '../../shared/types.js';
import { api } from '../lib/api.js';
import { useLdapStore } from './ldapStore.js';
import { useSchemaStore } from './schemaStore.js';

interface AttributeState {
  draftAttributes: NewAttributeDefinition[];
  generatedLdif: string | null;
  generatedSchemaFile: string | null;
  generatedIndexConfig: string | null;
  indexConfigs: DbIndexConfig[];
  isGenerating: boolean;
  isDeploying: boolean;
  isReindexing: boolean;
  generateErrors: string[];
  generateWarnings: string[];
  deployResult: SchemaDeployResponse | null;
  reindexResult: ReindexResponse | null;
  compatibilityConflicts: CompatibilityConflict[];
  isCheckingCompatibility: boolean;
  compatibilitySummary: string | null;
  objectClassName: string;
  objectClassOid: string;
  objectClassType: 'structural' | 'auxiliary';
  createObjectClass: boolean;
  addDraftAttribute: () => void;
  removeDraftAttribute: (index: number) => void;
  updateDraftAttribute: (index: number, attr: Partial<NewAttributeDefinition>) => void;
  clearDraftAttributes: () => void;
  setGeneratedLdif: (ldif: string | null) => void;
  generateSchema: () => Promise<boolean>;
  deploySchema: (restartRequired: boolean) => Promise<boolean>;
  downloadLdif: () => Promise<void>;
  downloadSchemaFile: () => Promise<void>;
  downloadIndexConfig: () => Promise<void>;
  reindex: (databaseDn?: string) => Promise<boolean>;
  setObjectClassName: (name: string) => void;
  setObjectClassOid: (oid: string) => void;
  setObjectClassType: (type: 'structural' | 'auxiliary') => void;
  setCreateObjectClass: (create: boolean) => void;
  clearDeployResult: () => void;
  clearReindexResult: () => void;
  checkCompatibility: () => Promise<boolean>;
  clearCompatibilityResult: () => void;
}

export const useAttributeStore = create<AttributeState>((set, get) => ({
  draftAttributes: [{ ...DEFAULT_ATTRIBUTE }],
  generatedLdif: null,
  generatedSchemaFile: null,
  generatedIndexConfig: null,
  indexConfigs: [],
  isGenerating: false,
  isDeploying: false,
  isReindexing: false,
  generateErrors: [],
  generateWarnings: [],
  deployResult: null,
  reindexResult: null,
  compatibilityConflicts: [],
  isCheckingCompatibility: false,
  compatibilitySummary: null,
  objectClassName: '',
  objectClassOid: '',
  objectClassType: 'auxiliary',
  createObjectClass: false,

  addDraftAttribute: () => {
    set((state) => ({
      draftAttributes: [...state.draftAttributes, { ...DEFAULT_ATTRIBUTE }],
    }));
  },

  removeDraftAttribute: (index: number) => {
    set((state) => ({
      draftAttributes: state.draftAttributes.filter((_, i) => i !== index),
    }));
  },

  updateDraftAttribute: (index: number, attr: Partial<NewAttributeDefinition>) => {
    set((state) => ({
      draftAttributes: state.draftAttributes.map((a, i) =>
        i === index ? { ...a, ...attr } : a
      ),
    }));
  },

  clearDraftAttributes: () => {
    set({
      draftAttributes: [{ ...DEFAULT_ATTRIBUTE }],
      generatedLdif: null,
      generatedSchemaFile: null,
      generatedIndexConfig: null,
      indexConfigs: [],
      generateErrors: [],
      generateWarnings: [],
      deployResult: null,
      reindexResult: null,
      objectClassName: '',
      objectClassOid: '',
      objectClassType: 'auxiliary',
      createObjectClass: false,
    });
  },

  setGeneratedLdif: (ldif: string | null) => {
    set({ generatedLdif: ldif });
  },

  generateSchema: async () => {
    const state = get();
    const ldapState = useLdapStore.getState();
    const schemaState = useSchemaStore.getState();

    if (!ldapState.isConnected || !ldapState.connectionConfig) {
      set({
        generateErrors: ['请先连接到 LDAP 服务器'],
        generateWarnings: [],
      });
      return false;
    }

    const validAttrs = state.draftAttributes.filter((a) => a.name.trim() && a.oid.trim());
    if (validAttrs.length === 0) {
      set({
        generateErrors: ['至少需要一个有效的属性定义（名称和 OID 不能为空）'],
        generateWarnings: [],
      });
      return false;
    }

    if (state.createObjectClass && (!state.objectClassName.trim() || !state.objectClassOid.trim())) {
      set({
        generateErrors: ['创建 ObjectClass 时，名称和 OID 不能为空'],
        generateWarnings: [],
      });
      return false;
    }

    const existingAttributeNames = schemaState.attributeTypes.flatMap((at) =>
      at.name.map((n) => n.toLowerCase())
    );
    const existingObjectClassNames = schemaState.objectClasses.flatMap((oc) =>
      oc.name.map((n) => n.toLowerCase())
    );

    const request: SchemaGenerateRequest = {
      attributes: validAttrs,
    };

    if (state.createObjectClass) {
      request.objectClassName = state.objectClassName;
      request.objectClassOid = state.objectClassOid;
      request.objectClassType = state.objectClassType;
    }

    set({ isGenerating: true, generateErrors: [], generateWarnings: [] });

    try {
      const result: SchemaGenerateResponse = await api.schema.generate(
        request,
        existingAttributeNames,
        existingObjectClassNames
      );

      if (result.errors.length > 0) {
        set({
          isGenerating: false,
          generateErrors: result.errors,
          generateWarnings: result.warnings,
          generatedLdif: null,
          generatedSchemaFile: null,
          generatedIndexConfig: null,
          indexConfigs: [],
        });
        return false;
      }

      set({
        isGenerating: false,
        generateErrors: result.errors,
        generateWarnings: result.warnings,
        generatedLdif: result.ldifContent,
        generatedSchemaFile: result.schemaFileContent,
        generatedIndexConfig: result.indexConfigContent,
        indexConfigs: result.indexConfigs,
      });
      return true;
    } catch (error) {
      set({
        isGenerating: false,
        generateErrors: [error instanceof Error ? error.message : '生成 Schema 失败'],
        generateWarnings: [],
        generatedLdif: null,
        generatedSchemaFile: null,
        generatedIndexConfig: null,
        indexConfigs: [],
      });
      return false;
    }
  },

  deploySchema: async (restartRequired: boolean) => {
    const state = get();
    const ldapState = useLdapStore.getState();

    if (!state.generatedLdif) {
      set({
        deployResult: {
          success: false,
          message: '请先生成 Schema',
          restartRequired: false,
          deployLog: [],
        },
      });
      return false;
    }

    if (!ldapState.connectionConfig) {
      set({
        deployResult: {
          success: false,
          message: '缺少连接配置',
          restartRequired: false,
          deployLog: [],
        },
      });
      return false;
    }

    set({ isDeploying: true, deployResult: null });

    try {
      const result = await api.schema.deploy({
        ldifContent: state.generatedLdif,
        connectionConfig: ldapState.connectionConfig,
        restartRequired,
      });

      set({
        isDeploying: false,
        deployResult: result,
      });
      return result.success;
    } catch (error) {
      set({
        isDeploying: false,
        deployResult: {
          success: false,
          message: error instanceof Error ? error.message : '部署失败',
          restartRequired: false,
          deployLog: [error instanceof Error ? error.message : '部署失败'],
        },
      });
      return false;
    }
  },

  downloadLdif: async () => {
    const state = get();
    if (!state.generatedLdif) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `schema-${timestamp}.ldif`;
    await api.schema.download(state.generatedLdif, filename, 'ldif');
  },

  downloadSchemaFile: async () => {
    const state = get();
    if (!state.generatedSchemaFile) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `custom-${timestamp}.schema`;
    await api.schema.download(state.generatedSchemaFile, filename, 'schema');
  },

  setObjectClassName: (name: string) => {
    set({ objectClassName: name });
  },

  setObjectClassOid: (oid: string) => {
    set({ objectClassOid: oid });
  },

  setObjectClassType: (type: 'structural' | 'auxiliary') => {
    set({ objectClassType: type });
  },

  setCreateObjectClass: (create: boolean) => {
    set({ createObjectClass: create });
  },

  clearDeployResult: () => {
    set({ deployResult: null });
  },

  downloadIndexConfig: async () => {
    const state = get();
    if (!state.generatedIndexConfig) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `index-config-${timestamp}.ldif`;
    await api.schema.download(state.generatedIndexConfig, filename, 'ldif');
  },

  reindex: async (databaseDn?: string) => {
    const state = get();
    const ldapState = useLdapStore.getState();

    const attributeNames = state.indexConfigs.map((ic) => ic.attributeName);
    if (attributeNames.length === 0) {
      set({
        reindexResult: {
          success: false,
          message: '没有需要建立索引的属性',
          restartRequired: false,
          log: [],
        },
      });
      return false;
    }

    if (!ldapState.connectionConfig) {
      set({
        reindexResult: {
          success: false,
          message: '缺少连接配置',
          restartRequired: false,
          log: [],
        },
      });
      return false;
    }

    set({ isReindexing: true, reindexResult: null });

    try {
      const result = await api.schema.reindex({
        attributeNames,
        connectionConfig: ldapState.connectionConfig,
        databaseDn,
      });

      set({
        isReindexing: false,
        reindexResult: result,
      });
      return result.success;
    } catch (error) {
      set({
        isReindexing: false,
        reindexResult: {
          success: false,
          message: error instanceof Error ? error.message : '重新索引失败',
          restartRequired: false,
          log: [error instanceof Error ? error.message : '重新索引失败'],
        },
      });
      return false;
    }
  },

  clearReindexResult: () => {
    set({ reindexResult: null });
  },

  checkCompatibility: async () => {
    const state = get();
    const schemaState = useSchemaStore.getState();

    const validAttrs = state.draftAttributes.filter((a) => a.name.trim() && a.oid.trim());
    if (validAttrs.length === 0) {
      set({
        compatibilityConflicts: [],
        compatibilitySummary: '至少需要一个有效的属性定义才能进行兼容性检查',
        isCheckingCompatibility: false,
      });
      return false;
    }

    set({ isCheckingCompatibility: true, compatibilityConflicts: [], compatibilitySummary: null });

    try {
      const result = await api.schema.compatibilityCheck({
        attributes: validAttrs,
        objectClassName: state.createObjectClass ? state.objectClassName : undefined,
        objectClassOid: state.createObjectClass ? state.objectClassOid : undefined,
        existingAttributeTypes: schemaState.attributeTypes,
        existingObjectClasses: schemaState.objectClasses,
      });

      set({
        isCheckingCompatibility: false,
        compatibilityConflicts: result.conflicts,
        compatibilitySummary: result.summary,
      });
      return result.compatible;
    } catch (error) {
      set({
        isCheckingCompatibility: false,
        compatibilityConflicts: [],
        compatibilitySummary: error instanceof Error ? error.message : '兼容性检查失败',
      });
      return false;
    }
  },

  clearCompatibilityResult: () => {
    set({ compatibilityConflicts: [], compatibilitySummary: null });
  },
}));
