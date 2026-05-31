import { create } from 'zustand';
import { ActionStep, TestCase, ExecutionResult, ScriptLanguage, SelectorType, TestDataRow, DataDrivenExecutionResult } from '../../shared/types';

interface AppState {
  targetUrl: string;
  setTargetUrl: (url: string) => void;

  isRecording: boolean;
  setIsRecording: (recording: boolean) => void;

  steps: ActionStep[];
  addStep: (step: ActionStep) => void;
  removeStep: (stepId: string) => void;
  clearSteps: () => void;
  updateStep: (stepId: string, updates: Partial<ActionStep>) => void;

  scriptLanguage: ScriptLanguage;
  setScriptLanguage: (lang: ScriptLanguage) => void;

  generatedScript: string;
  setGeneratedScript: (script: string) => void;

  isExecuting: boolean;
  setIsExecuting: (executing: boolean) => void;

  executionResult: ExecutionResult | null;
  setExecutionResult: (result: ExecutionResult | null) => void;

  testCases: TestCase[];
  setTestCases: (cases: TestCase[]) => void;

  selectedTestCase: TestCase | null;
  setSelectedTestCase: (testCase: TestCase | null) => void;

  selectorPriority: SelectorType[];
  setSelectorPriority: (priority: SelectorType[]) => void;

  activeTab: 'script' | 'execute' | 'cases' | 'settings' | 'data-driven';
  setActiveTab: (tab: 'script' | 'execute' | 'cases' | 'settings' | 'data-driven') => void;

  testData: TestDataRow[];
  setTestData: (data: TestDataRow[]) => void;

  parallelExecution: boolean;
  setParallelExecution: (enabled: boolean) => void;

  maxConcurrency: number;
  setMaxConcurrency: (num: number) => void;

  dataDrivenResult: DataDrivenExecutionResult | null;
  setDataDrivenResult: (result: DataDrivenExecutionResult | null) => void;

  isDataDrivenExecuting: boolean;
  setIsDataDrivenExecuting: (executing: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  targetUrl: 'https://example.com',
  setTargetUrl: (url) => set({ targetUrl: url }),

  isRecording: false,
  setIsRecording: (recording) => set({ isRecording: recording }),

  steps: [],
  addStep: (step) => set((state) => ({ steps: [...state.steps, step] })),
  removeStep: (stepId) => set((state) => ({ steps: state.steps.filter((s) => s.id !== stepId) })),
  clearSteps: () => set({ steps: [] }),
  updateStep: (stepId, updates) =>
    set((state) => ({
      steps: state.steps.map((s) => (s.id === stepId ? { ...s, ...updates } : s)),
    })),

  scriptLanguage: 'python',
  setScriptLanguage: (lang) => set({ scriptLanguage: lang }),

  generatedScript: '',
  setGeneratedScript: (script) => set({ generatedScript: script }),

  isExecuting: false,
  setIsExecuting: (executing) => set({ isExecuting: executing }),

  executionResult: null,
  setExecutionResult: (result) => set({ executionResult: result }),

  testCases: [],
  setTestCases: (cases) => set({ testCases: cases }),

  selectedTestCase: null,
  setSelectedTestCase: (testCase) => set({ selectedTestCase: testCase }),

  selectorPriority: ['id', 'name', 'css', 'xpath'],
  setSelectorPriority: (priority) => set({ selectorPriority: priority }),

  activeTab: 'script',
  setActiveTab: (tab) => set({ activeTab: tab }),

  testData: [],
  setTestData: (data) => set({ testData: data }),

  parallelExecution: false,
  setParallelExecution: (enabled) => set({ parallelExecution: enabled }),

  maxConcurrency: 3,
  setMaxConcurrency: (num) => set({ maxConcurrency: num }),

  dataDrivenResult: null,
  setDataDrivenResult: (result) => set({ dataDrivenResult: result }),

  isDataDrivenExecuting: false,
  setIsDataDrivenExecuting: (executing) => set({ isDataDrivenExecuting: executing }),
}));
