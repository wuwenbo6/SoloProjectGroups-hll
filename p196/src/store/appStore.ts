import { create } from 'zustand';
import type { SimplifyResponse, CellValue, InputType, OutputMode, MultiOutputResponse } from '@/types';

interface AppState {
  variableCount: number;
  inputType: InputType;
  truthTable: CellValue[];
  minterms: string;
  dontCare: string;
  result: SimplifyResponse | null;
  isLoading: boolean;
  error: string | null;
  outputMode: OutputMode;
  outputCount: number;
  outputNames: string[];
  truthTables: CellValue[][];
  multiResult: MultiOutputResponse | null;
  setVariableCount: (n: number) => void;
  setInputType: (type: InputType) => void;
  setTruthTableCell: (index: number, value: CellValue) => void;
  setMinterms: (value: string) => void;
  setDontCare: (value: string) => void;
  simplify: () => Promise<void>;
  reset: () => void;
  setOutputMode: (mode: OutputMode) => void;
  setOutputCount: (n: number) => void;
  setOutputName: (index: number, name: string) => void;
  setMultiTruthTableCell: (outputIndex: number, rowIndex: number, value: CellValue) => void;
  simplifyMulti: () => Promise<void>;
  resetMulti: () => void;
}

const createInitialTruthTable = (n: number): CellValue[] => {
  return new Array(Math.pow(2, n)).fill(0) as CellValue[];
};

const createInitialTruthTables = (variableCount: number, outputCount: number): CellValue[][] => {
  return Array.from({ length: outputCount }, () => createInitialTruthTable(variableCount));
};

const createInitialOutputNames = (count: number): string[] => {
  return Array.from({ length: count }, (_, i) => `F${i + 1}`);
};

export const useAppStore = create<AppState>((set, get) => ({
  variableCount: 4,
  inputType: 'truthTable',
  truthTable: createInitialTruthTable(4),
  minterms: '',
  dontCare: '',
  result: null,
  isLoading: false,
  error: null,
  outputMode: 'single',
  outputCount: 2,
  outputNames: createInitialOutputNames(2),
  truthTables: createInitialTruthTables(4, 2),
  multiResult: null,

  setVariableCount: (n: number) => {
    const clamped = Math.max(2, Math.min(12, n));
    const state = get();
    set({
      variableCount: clamped,
      truthTable: createInitialTruthTable(clamped),
      truthTables: createInitialTruthTables(clamped, state.outputCount),
      result: null,
      multiResult: null,
      error: null,
    });
  },

  setInputType: (type: InputType) => {
    set({ inputType: type, result: null, error: null });
  },

  setTruthTableCell: (index: number, value: CellValue) => {
    const table = [...get().truthTable];
    table[index] = value;
    set({ truthTable: table, result: null, error: null });
  },

  setMinterms: (value: string) => {
    set({ minterms: value, result: null, error: null });
  },

  setDontCare: (value: string) => {
    set({ dontCare: value, result: null, error: null });
  },

  simplify: async () => {
    const state = get();
    set({ isLoading: true, error: null });

    if (state.variableCount < 2 || state.variableCount > 12) {
      set({ isLoading: false, error: 'Variable count must be between 2 and 12' });
      return;
    }

    try {
      let requestBody: Record<string, unknown>;

      if (state.inputType === 'truthTable') {
        requestBody = {
          variableCount: state.variableCount,
          inputType: 'truthTable',
          truthTable: state.truthTable,
        };
      } else {
        const parseNumbers = (s: string): number[] => {
          return s
            .split(/[,\s;]+/)
            .filter(v => v.trim() !== '')
            .map(v => parseInt(v.trim(), 10))
            .filter(v => !isNaN(v));
        };

        const minterms = parseNumbers(state.minterms);
        const dontCare = parseNumbers(state.dontCare);
        const maxMinterm = Math.pow(2, state.variableCount) - 1;

        if (minterms.length === 0) {
          set({ isLoading: false, error: 'Please enter at least one minterm' });
          return;
        }

        const invalidMinterms = minterms.filter(m => m < 0 || m > maxMinterm);
        if (invalidMinterms.length > 0) {
          set({ isLoading: false, error: `Minterms must be between 0-${maxMinterm}, invalid values: ${invalidMinterms.join(', ')}` });
          return;
        }

        const invalidDontCare = dontCare.filter(d => d < 0 || d > maxMinterm);
        if (invalidDontCare.length > 0) {
          set({ isLoading: false, error: `Don't care terms must be between 0-${maxMinterm}, invalid values: ${invalidDontCare.join(', ')}` });
          return;
        }

        requestBody = {
          variableCount: state.variableCount,
          inputType: 'sumOfProducts',
          minterms,
          dontCare,
        };
      }

      const response = await fetch('/api/simplify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data: SimplifyResponse = await response.json();

      if (!response.ok || !data.success) {
        set({
          isLoading: false,
          error: data.error || 'Simplification failed, please check your input',
        });
        return;
      }

      set({ result: data, isLoading: false });
    } catch {
      set({ isLoading: false, error: 'Network error, please check server connection' });
    }
  },

  reset: () => {
    set({
      truthTable: createInitialTruthTable(get().variableCount),
      minterms: '',
      dontCare: '',
      result: null,
      error: null,
    });
  },

  setOutputMode: (mode: OutputMode) => {
    set({ outputMode: mode, result: null, multiResult: null, error: null });
  },

  setOutputCount: (n: number) => {
    const clamped = Math.max(2, Math.min(8, n));
    const state = get();
    const currentNames = [...state.outputNames];
    const currentTables = [...state.truthTables];
    
    while (currentNames.length < clamped) {
      currentNames.push(`F${currentNames.length + 1}`);
    }
    while (currentTables.length < clamped) {
      currentTables.push(createInitialTruthTable(state.variableCount));
    }
    
    set({
      outputCount: clamped,
      outputNames: currentNames.slice(0, clamped),
      truthTables: currentTables.slice(0, clamped),
      multiResult: null,
      error: null,
    });
  },

  setOutputName: (index: number, name: string) => {
    const names = [...get().outputNames];
    names[index] = name;
    set({ outputNames: names, multiResult: null });
  },

  setMultiTruthTableCell: (outputIndex: number, rowIndex: number, value: CellValue) => {
    const tables = get().truthTables.map(table => [...table]);
    tables[outputIndex][rowIndex] = value;
    set({ truthTables: tables, multiResult: null, error: null });
  },

  simplifyMulti: async () => {
    const state = get();
    set({ isLoading: true, error: null });

    if (state.variableCount < 2 || state.variableCount > 12) {
      set({ isLoading: false, error: 'Variable count must be between 2 and 12' });
      return;
    }

    if (state.outputCount < 2 || state.outputCount > 8) {
      set({ isLoading: false, error: 'Output count must be between 2 and 8' });
      return;
    }

    try {
      const requestBody = {
        variableCount: state.variableCount,
        outputCount: state.outputCount,
        outputNames: state.outputNames,
        truthTables: state.truthTables,
      };

      const response = await fetch('/api/multi-output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data: MultiOutputResponse = await response.json();

      if (!response.ok || !data.success) {
        set({
          isLoading: false,
          error: data.error || 'Multi-output simplification failed, please check your input',
        });
        return;
      }

      set({ multiResult: data, isLoading: false });
    } catch {
      set({ isLoading: false, error: 'Network error, please check server connection' });
    }
  },

  resetMulti: () => {
    const state = get();
    set({
      truthTables: createInitialTruthTables(state.variableCount, state.outputCount),
      multiResult: null,
      error: null,
    });
  },
}));
