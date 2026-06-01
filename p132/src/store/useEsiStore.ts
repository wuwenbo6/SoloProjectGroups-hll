
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { 
  EsiConfig, 
  PdoEntry, 
  SlaveInfo, 
  defaultEsiConfig, 
  ValidationResult,
  ConfigTemplate,
  PdoType,
  DataType,
  DataTypeBitLength,
  CoEParameter,
  CoEAccessType,
  MultiSlaveProject,
  defaultMultiSlaveProject,
} from '../types';
import { validateEsiConfig } from '../utils/validator';

interface EsiStore {
  config: EsiConfig;
  validationResult: ValidationResult | null;
  isDirty: boolean;
  activeTemplate: ConfigTemplate | null;
  
  setConfigName: (name: string) => void;
  setSlaveInfo: (info: Partial<SlaveInfo>) => void;
  addPdoEntry: (type: PdoType, entry: Omit<PdoEntry, 'id'>) => boolean;
  removePdoEntry: (type: PdoType, id: string) => void;
  updatePdoEntry: (type: PdoType, id: string, updates: Partial<PdoEntry>) => boolean;
  reorderPdoEntries: (type: PdoType, fromIndex: number, toIndex: number) => void;
  setTxPdO: (entries: PdoEntry[]) => void;
  setRxPdO: (entries: PdoEntry[]) => void;
  
  addCoEParameter: (param: Omit<CoEParameter, 'id'>) => boolean;
  removeCoEParameter: (id: string) => void;
  updateCoEParameter: (id: string, updates: Partial<CoEParameter>) => boolean;
  setCoEParameters: (params: CoEParameter[]) => void;
  
  resetConfig: () => void;
  loadConfig: (config: EsiConfig) => void;
  loadTemplate: (template: ConfigTemplate) => void;
  clearActiveTemplate: () => void;
  validateConfig: () => ValidationResult;
  clearValidation: () => void;
}

export const useEsiStore = create<EsiStore>((set, get) => ({
  config: { ...defaultEsiConfig, id: uuidv4() },
  validationResult: null,
  isDirty: false,
  activeTemplate: null,

  setConfigName: (name: string) =>
    set((state) => ({
      config: { ...state.config, name, updatedAt: new Date() },
      isDirty: true,
    })),

  setSlaveInfo: (info: Partial<SlaveInfo>) =>
    set((state) => ({
      config: {
        ...state.config,
        slaveInfo: { ...state.config.slaveInfo, ...info },
        updatedAt: new Date(),
      },
      isDirty: true,
    })),

  addPdoEntry: (type: PdoType, entry: Omit<PdoEntry, 'id'>) => {
    const pdoKey = type === 'TxPDO' ? 'txPdO' : 'rxPdO';
    const currentEntries = get().config[pdoKey];
    
    const isDuplicate = currentEntries.some(
      (e) => e.index === entry.index && e.subIndex === entry.subIndex
    );
    
    if (isDuplicate) {
      return false;
    }
    
    const newEntry: PdoEntry = { ...entry, id: uuidv4() };
    set((state) => ({
      config: {
        ...state.config,
        [pdoKey]: [...state.config[pdoKey], newEntry],
        updatedAt: new Date(),
      },
      isDirty: true,
    }));
    return true;
  },

  removePdoEntry: (type: PdoType, id: string) => {
    const pdoKey = type === 'TxPDO' ? 'txPdO' : 'rxPdO';
    set((state) => ({
      config: {
        ...state.config,
        [pdoKey]: state.config[pdoKey].filter((e) => e.id !== id),
        updatedAt: new Date(),
      },
      isDirty: true,
    }));
  },

  updatePdoEntry: (type: PdoType, id: string, updates: Partial<PdoEntry>) => {
    const pdoKey = type === 'TxPDO' ? 'txPdO' : 'rxPdO';
    const currentEntries = get().config[pdoKey];
    
    if (updates.index !== undefined && updates.subIndex !== undefined) {
      const isDuplicate = currentEntries.some(
        (e) => 
          e.id !== id && 
          e.index === updates.index && 
          e.subIndex === updates.subIndex
      );
      
      if (isDuplicate) {
        return false;
      }
    }
    
    set((state) => ({
      config: {
        ...state.config,
        [pdoKey]: state.config[pdoKey].map((e) =>
          e.id === id ? { ...e, ...updates } : e
        ),
        updatedAt: new Date(),
      },
      isDirty: true,
    }));
    return true;
  },

  reorderPdoEntries: (type: PdoType, fromIndex: number, toIndex: number) => {
    const pdoKey = type === 'TxPDO' ? 'txPdO' : 'rxPdO';
    set((state) => {
      const entries = [...state.config[pdoKey]];
      const [removed] = entries.splice(fromIndex, 1);
      entries.splice(toIndex, 0, removed);
      return {
        config: {
          ...state.config,
          [pdoKey]: entries,
          updatedAt: new Date(),
        },
        isDirty: true,
      };
    });
  },

  setTxPdO: (entries: PdoEntry[]) =>
    set((state) => ({
      config: { ...state.config, txPdO: entries, updatedAt: new Date() },
      isDirty: true,
    })),

  setRxPdO: (entries: PdoEntry[]) =>
    set((state) => ({
      config: { ...state.config, rxPdO: entries, updatedAt: new Date() },
      isDirty: true,
    })),

  addCoEParameter: (param: Omit<CoEParameter, 'id'>) => {
    const currentParams = get().config.coeParameters;
    
    const isDuplicate = currentParams.some(
      (p) => p.index === param.index && p.subIndex === param.subIndex
    );
    
    if (isDuplicate) {
      return false;
    }
    
    const newParam: CoEParameter = { ...param, id: uuidv4() };
    set((state) => ({
      config: {
        ...state.config,
        coeParameters: [...state.config.coeParameters, newParam],
        updatedAt: new Date(),
      },
      isDirty: true,
    }));
    return true;
  },

  removeCoEParameter: (id: string) => {
    set((state) => ({
      config: {
        ...state.config,
        coeParameters: state.config.coeParameters.filter((p) => p.id !== id),
        updatedAt: new Date(),
      },
      isDirty: true,
    }));
  },

  updateCoEParameter: (id: string, updates: Partial<CoEParameter>) => {
    const currentParams = get().config.coeParameters;
    
    if (updates.index !== undefined && updates.subIndex !== undefined) {
      const isDuplicate = currentParams.some(
        (p) => 
          p.id !== id && 
          p.index === updates.index && 
          p.subIndex === updates.subIndex
      );
      
      if (isDuplicate) {
        return false;
      }
    }
    
    set((state) => ({
      config: {
        ...state.config,
        coeParameters: state.config.coeParameters.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
        updatedAt: new Date(),
      },
      isDirty: true,
    }));
    return true;
  },

  setCoEParameters: (params: CoEParameter[]) =>
    set((state) => ({
      config: { ...state.config, coeParameters: params, updatedAt: new Date() },
      isDirty: true,
    })),

  resetConfig: () =>
    set({
      config: { ...defaultEsiConfig, id: uuidv4() },
      validationResult: null,
      isDirty: false,
      activeTemplate: null,
    }),

  loadConfig: (config: EsiConfig) =>
    set({
      config: { ...config, id: uuidv4(), updatedAt: new Date() },
      validationResult: null,
      isDirty: true,
      activeTemplate: null,
    }),

  loadTemplate: (template: ConfigTemplate) =>
    set({
      config: { ...template.config, id: uuidv4(), updatedAt: new Date() },
      validationResult: null,
      isDirty: false,
      activeTemplate: template,
    }),

  clearActiveTemplate: () => set({ activeTemplate: null }),

  validateConfig: () => {
    const result = validateEsiConfig(get().config);
    set({ validationResult: result });
    return result;
  },

  clearValidation: () => set({ validationResult: null }),
}));

interface MultiSlaveStore {
  project: MultiSlaveProject;
  activeSlaveId: string | null;
  
  setProjectName: (name: string) => void;
  setProjectDescription: (description: string) => void;
  addSlave: (config?: EsiConfig) => string;
  removeSlave: (id: string) => void;
  updateSlave: (id: string, config: EsiConfig) => void;
  setActiveSlave: (id: string | null) => void;
  loadProject: (project: MultiSlaveProject) => void;
  resetProject: () => void;
}

export const useMultiSlaveStore = create<MultiSlaveStore>((set, get) => ({
  project: { ...defaultMultiSlaveProject, id: uuidv4() },
  activeSlaveId: null,

  setProjectName: (name: string) =>
    set((state) => ({
      project: { ...state.project, name, updatedAt: new Date() },
    })),

  setProjectDescription: (description: string) =>
    set((state) => ({
      project: { ...state.project, description, updatedAt: new Date() },
    })),

  addSlave: (config?: EsiConfig) => {
    const newConfig: EsiConfig = config 
      ? { ...config, id: uuidv4(), updatedAt: new Date() }
      : { ...defaultEsiConfig, id: uuidv4(), updatedAt: new Date() };
    
    set((state) => ({
      project: {
        ...state.project,
        slaves: [...state.project.slaves, newConfig],
        updatedAt: new Date(),
      },
      activeSlaveId: newConfig.id,
    }));
    
    return newConfig.id;
  },

  removeSlave: (id: string) => {
    set((state) => ({
      project: {
        ...state.project,
        slaves: state.project.slaves.filter((s) => s.id !== id),
        updatedAt: new Date(),
      },
      activeSlaveId: state.activeSlaveId === id ? null : state.activeSlaveId,
    }));
  },

  updateSlave: (id: string, config: EsiConfig) => {
    set((state) => ({
      project: {
        ...state.project,
        slaves: state.project.slaves.map((s) =>
          s.id === id ? { ...config, id, updatedAt: new Date() } : s
        ),
        updatedAt: new Date(),
      },
    }));
  },

  setActiveSlave: (id: string | null) =>
    set({ activeSlaveId: id }),

  loadProject: (project: MultiSlaveProject) =>
    set({
      project: { ...project, id: uuidv4(), updatedAt: new Date() },
      activeSlaveId: project.slaves.length > 0 ? project.slaves[0].id : null,
    }),

  resetProject: () =>
    set({
      project: { ...defaultMultiSlaveProject, id: uuidv4() },
      activeSlaveId: null,
    }),
}));

export const usePdoEntries = (type: PdoType) => {
  return useEsiStore((state) =>
    type === 'TxPDO' ? state.config.txPdO : state.config.rxPdO
  );
};

export const usePdoTotalBits = (type: PdoType) => {
  const entries = usePdoEntries(type);
  return entries.reduce((sum, entry) => sum + entry.bitLength, 0);
};

export const usePdoTotalBytes = (type: PdoType) => {
  const bits = usePdoTotalBits(type);
  return Math.ceil(bits / 8);
};

export const useActiveSlave = (): EsiConfig | null => {
  const { project, activeSlaveId } = useMultiSlaveStore();
  return project.slaves.find((s) => s.id === activeSlaveId) || null;
};

export { CoEAccessType, DataTypeBitLength };
