import { create } from 'zustand';
import { MethodInfo, InvokeResponse, SchemaResponse, TestCase } from '@/utils/api';

interface GrpcState {
  address: string;
  tls: boolean;
  timeout: number;
  services: string[];
  expandedServices: Set<string>;
  selectedMethod: MethodInfo | null;
  requestJson: string;
  response: InvokeResponse | null;
  schema: SchemaResponse | null;
  loading: boolean;
  error: string | null;
  serviceMethods: Record<string, MethodInfo[]>;
  testCases: TestCase[];
  showTestCasePanel: boolean;
  showProtoModal: boolean;
  protoContent: Record<string, string>;
  protoExportService: string;

  setAddress: (addr: string) => void;
  setTLS: (tls: boolean) => void;
  setTimeout: (t: number) => void;
  setServices: (services: string[]) => void;
  toggleService: (service: string) => void;
  selectMethod: (method: MethodInfo | null) => void;
  setRequestJson: (json: string) => void;
  setResponse: (resp: InvokeResponse | null) => void;
  setSchema: (schema: SchemaResponse | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setServiceMethods: (service: string, methods: MethodInfo[]) => void;
  setTestCases: (cases: TestCase[]) => void;
  addTestCase: (tc: TestCase) => void;
  removeTestCase: (id: string) => void;
  toggleTestCasePanel: () => void;
  setShowProtoModal: (show: boolean) => void;
  setProtoContent: (content: Record<string, string>, service: string) => void;
  reset: () => void;
}

export const useGrpcStore = create<GrpcState>((set) => ({
  address: 'localhost:50051',
  tls: false,
  timeout: 10,
  services: [],
  expandedServices: new Set(),
  selectedMethod: null,
  requestJson: '{}',
  response: null,
  schema: null,
  loading: false,
  error: null,
  serviceMethods: {},
  testCases: [],
  showTestCasePanel: false,
  showProtoModal: false,
  protoContent: {},
  protoExportService: '',

  setAddress: (addr) => set({ address: addr }),
  setTLS: (tls) => set({ tls }),
  setTimeout: (t) => set({ timeout: t }),
  setServices: (services) => set({ services }),
  toggleService: (service) =>
    set((state) => {
      const next = new Set(state.expandedServices);
      if (next.has(service)) {
        next.delete(service);
      } else {
        next.add(service);
      }
      return { expandedServices: next };
    }),
  selectMethod: (method) => set({ selectedMethod: method, response: null }),
  setRequestJson: (json) => set({ requestJson: json }),
  setResponse: (resp) => set({ response: resp }),
  setSchema: (schema) => set({ schema }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setServiceMethods: (service, methods) =>
    set((state) => ({
      serviceMethods: { ...state.serviceMethods, [service]: methods },
    })),
  setTestCases: (cases) => set({ testCases: cases }),
  addTestCase: (tc) =>
    set((state) => ({ testCases: [tc, ...state.testCases] })),
  removeTestCase: (id) =>
    set((state) => ({ testCases: state.testCases.filter((tc) => tc.id !== id) })),
  toggleTestCasePanel: () =>
    set((state) => ({ showTestCasePanel: !state.showTestCasePanel })),
  setShowProtoModal: (show) => set({ showProtoModal: show }),
  setProtoContent: (content, service) =>
    set({ protoContent: content, protoExportService: service }),
  reset: () =>
    set({
      services: [],
      expandedServices: new Set(),
      selectedMethod: null,
      requestJson: '{}',
      response: null,
      schema: null,
      error: null,
      serviceMethods: {},
    }),
}));
