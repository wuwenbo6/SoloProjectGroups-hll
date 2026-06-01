import { create } from 'zustand';
import type {
  CodeSnippet,
  OptimizePass,
  CompileResponse,
  ControlFlowGraph,
  DataFlowGraph,
  TimingAnalysisResult,
  PassTemplateResponse,
} from '@shared/types';

interface LLVMState {
  code: string;
  selectedPasses: string[];
  availablePasses: OptimizePass[];
  snippets: CodeSnippet[];
  currentSnippetId: number | null;
  snippetName: string;
  compileResult: CompileResponse | null;
  isCompiling: boolean;
  isLoadingSnippets: boolean;
  error: string | null;
  activeView: 'ir' | 'cfg' | 'dfg' | 'timing' | 'pass-dev';
  selectedFunction: string;
  syncScroll: boolean;
  searchQuery: string;
  sidebarCollapsed: boolean;
  passTemplate: PassTemplateResponse | null;
  isExporting: boolean;

  setCode: (code: string) => void;
  setSnippetName: (name: string) => void;
  togglePass: (passName: string) => void;
  setSelectedPasses: (passes: string[]) => void;
  setAvailablePasses: (passes: OptimizePass[]) => void;
  setSnippets: (snippets: CodeSnippet[]) => void;
  setCurrentSnippetId: (id: number | null) => void;
  setCompileResult: (result: CompileResponse | null) => void;
  setIsCompiling: (isCompiling: boolean) => void;
  setIsLoadingSnippets: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setActiveView: (view: 'ir' | 'cfg' | 'dfg' | 'timing' | 'pass-dev') => void;
  setSelectedFunction: (func: string) => void;
  setSyncScroll: (sync: boolean) => void;
  setSearchQuery: (query: string) => void;
  toggleSidebar: () => void;
  loadSnippet: (snippet: CodeSnippet) => void;
  resetEditor: () => void;
  setPassTemplate: (template: PassTemplateResponse | null) => void;
  setIsExporting: (exporting: boolean) => void;
}

const DEFAULT_CODE = `int fib(int n) {
    if (n <= 1) {
        return n;
    }
    return fib(n - 1) + fib(n - 2);
}

int main() {
    int result = fib(10);
    return result;
}
`;

export const useLLVMStore = create<LLVMState>((set) => ({
  code: DEFAULT_CODE,
  selectedPasses: [],
  availablePasses: [],
  snippets: [],
  currentSnippetId: null,
  snippetName: '',
  compileResult: null,
  isCompiling: false,
  isLoadingSnippets: false,
  error: null,
  activeView: 'ir',
  selectedFunction: 'main',
  syncScroll: true,
  searchQuery: '',
  sidebarCollapsed: false,
  passTemplate: null,
  isExporting: false,

  setCode: (code) => set({ code }),
  setSnippetName: (snippetName) => set({ snippetName }),
  togglePass: (passName) =>
    set((state) => ({
      selectedPasses: state.selectedPasses.includes(passName)
        ? state.selectedPasses.filter((p) => p !== passName)
        : [...state.selectedPasses, passName],
    })),
  setSelectedPasses: (selectedPasses) => set({ selectedPasses }),
  setAvailablePasses: (availablePasses) => set({ availablePasses }),
  setSnippets: (snippets) => set({ snippets }),
  setCurrentSnippetId: (currentSnippetId) => set({ currentSnippetId }),
  setCompileResult: (compileResult) => set({ compileResult }),
  setIsCompiling: (isCompiling) => set({ isCompiling }),
  setIsLoadingSnippets: (isLoadingSnippets) => set({ isLoadingSnippets }),
  setError: (error) => set({ error }),
  setActiveView: (activeView) => set({ activeView }),
  setSelectedFunction: (selectedFunction) => set({ selectedFunction }),
  setSyncScroll: (syncScroll) => set({ syncScroll }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  loadSnippet: (snippet) =>
    set({
      code: snippet.code,
      snippetName: snippet.name,
      currentSnippetId: snippet.id,
      compileResult: null,
      error: null,
    }),
  resetEditor: () =>
    set({
      code: DEFAULT_CODE,
      snippetName: '',
      currentSnippetId: null,
      compileResult: null,
      error: null,
      selectedPasses: [],
    }),
  setPassTemplate: (passTemplate) => set({ passTemplate }),
  setIsExporting: (isExporting) => set({ isExporting }),
}));

export type { ControlFlowGraph, DataFlowGraph, TimingAnalysisResult };

