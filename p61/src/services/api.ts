import axios from 'axios';
import { TestCase, ExecutionResult, ScriptLanguage, SelectorStrategy, ActionStep, TestDataRow, DataDrivenExecutionResult } from '../../shared/types';

const API_BASE = '/api';

export const api = {
  cases: {
    getAll: async (): Promise<TestCase[]> => {
      const res = await axios.get(`${API_BASE}/cases`);
      return res.data;
    },
    getById: async (id: string): Promise<TestCase> => {
      const res = await axios.get(`${API_BASE}/cases/${id}`);
      return res.data;
    },
    create: async (data: Omit<TestCase, 'id' | 'createdAt' | 'updatedAt'>): Promise<TestCase> => {
      const res = await axios.post(`${API_BASE}/cases`, data);
      return res.data;
    },
    update: async (id: string, data: Partial<TestCase>): Promise<TestCase> => {
      const res = await axios.put(`${API_BASE}/cases/${id}`, data);
      return res.data;
    },
    delete: async (id: string): Promise<{ success: boolean }> => {
      const res = await axios.delete(`${API_BASE}/cases/${id}`);
      return res.data;
    },
  },
  settings: {
    getSelectorStrategy: async (): Promise<SelectorStrategy> => {
      const res = await axios.get(`${API_BASE}/settings/selector-strategy`);
      return res.data;
    },
    saveSelectorStrategy: async (strategy: SelectorStrategy): Promise<SelectorStrategy> => {
      const res = await axios.post(`${API_BASE}/settings/selector-strategy`, strategy);
      return res.data;
    },
  },
  execute: {
    run: async (url: string, steps: ActionStep[]): Promise<ExecutionResult> => {
      const res = await axios.post(`${API_BASE}/execute`, { url, steps });
      return res.data;
    },
    generateScript: async (url: string, steps: ActionStep[], language: ScriptLanguage): Promise<string> => {
      const res = await axios.post(`${API_BASE}/execute/generate-script`, { url, steps, language });
      return res.data.script;
    },
  },
  dataDriven: {
    parseCSV: async (csvContent: string): Promise<TestDataRow[]> => {
      const res = await axios.post(`${API_BASE}/data-driven/parse-csv`, { csvContent });
      return res.data.data;
    },
    generateCSV: async (headers: string[], data: TestDataRow[]): Promise<string> => {
      const res = await axios.post(`${API_BASE}/data-driven/generate-csv`, { headers, data });
      return res.data.csv;
    },
    execute: async (
      url: string,
      steps: ActionStep[],
      testData: TestDataRow[],
      parallel?: boolean,
      maxConcurrency?: number
    ): Promise<DataDrivenExecutionResult> => {
      const res = await axios.post(`${API_BASE}/data-driven/execute`, {
        url,
        steps,
        testData,
        parallel,
        maxConcurrency,
      });
      return res.data;
    },
    generateScript: async (
      url: string,
      steps: ActionStep[],
      testData: TestDataRow[],
      language: ScriptLanguage
    ): Promise<string> => {
      const res = await axios.post(`${API_BASE}/data-driven/generate-script`, {
        url,
        steps,
        testData,
        language,
      });
      return res.data.script;
    },
    extractVariables: async (steps: ActionStep[]): Promise<string[]> => {
      const res = await axios.post(`${API_BASE}/data-driven/extract-variables`, { steps });
      return res.data.variables;
    },
  },
};
