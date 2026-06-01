export interface CodeSnippet {
  id: number;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

export interface OptimizePass {
  name: string;
  description: string;
  category: 'transform' | 'analysis' | 'utility';
}

export interface CompileRequest {
  code: string;
  passes: string[];
}

export interface BasicBlock {
  id: string;
  label: string;
  instructions: string[];
  predecessors: string[];
  successors: string[];
  position?: { x: number; y: number };
}

export interface ControlFlowGraph {
  functionName: string;
  blocks: BasicBlock[];
  edges: { source: string; target: string; type: 'unconditional' | 'conditional' }[];
  entryBlock: string;
}

export interface DFGNode {
  id: string;
  instruction: string;
  type: 'instruction' | 'argument' | 'constant';
  valueName?: string;
}

export interface DataFlowGraph {
  nodes: DFGNode[];
  edges: { source: string; target: string; operandIndex: number }[];
}

export interface TimedNode extends DFGNode {
  earliestCycle: number;
  latestCycle: number;
  asapCycle: number;
  alapCycle: number;
  slack: number;
  criticalPath: boolean;
}

export interface TimingAnalysisResult {
  nodes: TimedNode[];
  criticalPath: string[];
  criticalPathLength: number;
  latency: number;
  throughput: number;
  totalInstructions: number;
}

export interface CompileResponse {
  success: boolean;
  error?: string;
  originalIR: string;
  optimizedIR: string;
  cfgs: ControlFlowGraph[];
  dfg: DataFlowGraph;
  timing?: TimingAnalysisResult;
}

export interface PassTemplateResponse {
  cppCode: string;
  cmakeCode: string;
}
