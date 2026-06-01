import type { DataFlowGraph, DFGNode } from '@shared/types.js';

interface TimedNode extends DFGNode {
  earliestCycle: number;
  latestCycle: number;
  asapCycle: number;
  alapCycle: number;
  slack: number;
  criticalPath: boolean;
}

interface TimingAnalysisResult {
  nodes: TimedNode[];
  criticalPath: string[];
  criticalPathLength: number;
  latency: number;
  throughput: number;
  totalInstructions: number;
}

const INSTRUCTION_LATENCY: Record<string, number> = {
  'add': 1,
  'sub': 1,
  'mul': 3,
  'div': 12,
  'fadd': 3,
  'fsub': 3,
  'fmul': 5,
  'fdiv': 15,
  'load': 4,
  'store': 4,
  'icmp': 1,
  'fcmp': 1,
  'select': 1,
  'phi': 1,
  'br': 1,
  'ret': 1,
  'call': 10,
  'alloca': 1,
  'getelementptr': 1,
  'bitcast': 1,
  'zext': 1,
  'sext': 1,
  'trunc': 1,
  'and': 1,
  'or': 1,
  'xor': 1,
  'shl': 1,
  'lshr': 1,
  'ashr': 1,
};

function getInstructionLatency(instruction: string): number {
  const lower = instruction.toLowerCase();
  
  for (const [op, latency] of Object.entries(INSTRUCTION_LATENCY)) {
    if (lower.includes(op)) {
      return latency;
    }
  }
  
  return 1;
}

export function analyzeTiming(dfg: DataFlowGraph): TimingAnalysisResult {
  const nodes = new Map<string, TimedNode>();
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();

  for (const node of dfg.nodes) {
    nodes.set(node.id, {
      ...node,
      earliestCycle: 0,
      latestCycle: Infinity,
      asapCycle: 0,
      alapCycle: 0,
      slack: 0,
      criticalPath: false,
    });
    predecessors.set(node.id, []);
    successors.set(node.id, []);
  }

  for (const edge of dfg.edges) {
    predecessors.get(edge.target)?.push(edge.source);
    successors.get(edge.source)?.push(edge.target);
  }

  const visited = new Set<string>();
  const asapQueue: string[] = [];

  for (const [id, preds] of predecessors) {
    if (preds.length === 0) {
      asapQueue.push(id);
      const node = nodes.get(id)!;
      node.earliestCycle = 0;
      node.asapCycle = 0;
    }
  }

  while (asapQueue.length > 0) {
    const currentId = asapQueue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentNode = nodes.get(currentId)!;
    const latency = getInstructionLatency(currentNode.instruction);

    for (const succId of successors.get(currentId) || []) {
      const succNode = nodes.get(succId)!;
      const newCycle = currentNode.asapCycle + latency;
      
      if (newCycle > succNode.asapCycle) {
        succNode.asapCycle = newCycle;
        succNode.earliestCycle = newCycle;
      }

      const allPredsVisited = (predecessors.get(succId) || []).every(p => visited.has(p));
      if (allPredsVisited) {
        asapQueue.push(succId);
      }
    }
  }

  let maxCycle = 0;
  for (const node of nodes.values()) {
    maxCycle = Math.max(maxCycle, node.asapCycle);
  }

  visited.clear();
  const alapQueue: string[] = [];

  for (const [id, succs] of successors) {
    if (succs.length === 0) {
      alapQueue.push(id);
      const node = nodes.get(id)!;
      node.latestCycle = maxCycle;
      node.alapCycle = maxCycle;
    }
  }

  while (alapQueue.length > 0) {
    const currentId = alapQueue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentNode = nodes.get(currentId)!;
    const latency = getInstructionLatency(currentNode.instruction);

    for (const predId of predecessors.get(currentId) || []) {
      const predNode = nodes.get(predId)!;
      const newCycle = currentNode.alapCycle - latency;
      
      if (newCycle < predNode.alapCycle || predNode.alapCycle === 0) {
        predNode.alapCycle = newCycle;
        predNode.latestCycle = newCycle;
      }

      const allSuccsVisited = (successors.get(predId) || []).every(s => visited.has(s));
      if (allSuccsVisited) {
        alapQueue.push(predId);
      }
    }
  }

  for (const node of nodes.values()) {
    node.slack = node.alapCycle - node.asapCycle;
    node.criticalPath = node.slack === 0 && node.type === 'instruction';
  }

  const criticalPathNodes = Array.from(nodes.values())
    .filter(n => n.criticalPath)
    .sort((a, b) => a.asapCycle - b.asapCycle);

  const criticalPath = criticalPathNodes.map(n => n.id);

  return {
    nodes: Array.from(nodes.values()),
    criticalPath,
    criticalPathLength: criticalPathNodes.reduce((sum, n) => sum + getInstructionLatency(n.instruction), 0),
    latency: maxCycle,
    throughput: 1 / (maxCycle || 1),
    totalInstructions: dfg.nodes.filter(n => n.type === 'instruction').length,
  };
}

interface PipelineStage {
  cycle: number;
  instructions: TimedNode[];
}

export function generatePipelineSchedule(dfg: DataFlowGraph, initiationInterval: number = 1): PipelineStage[] {
  const timing = analyzeTiming(dfg);
  const stages: PipelineStage[] = [];

  for (let cycle = 0; cycle <= timing.latency; cycle += initiationInterval) {
    const instructions = timing.nodes.filter(
      n => n.type === 'instruction' && n.asapCycle <= cycle && n.alapCycle >= cycle
    );
    stages.push({ cycle, instructions });
  }

  return stages;
}

export function generateTimingReport(dfg: DataFlowGraph): string {
  const timing = analyzeTiming(dfg);
  
  const lines: string[] = [];
  lines.push('=== Timing Analysis Report ===');
  lines.push('');
  lines.push(`Total Instructions: ${timing.totalInstructions}`);
  lines.push(`Critical Path Length: ${timing.criticalPathLength} cycles`);
  lines.push(`Latency: ${timing.latency} cycles`);
  lines.push(`Throughput: ${timing.throughput.toFixed(4)} ops/cycle`);
  lines.push('');
  lines.push('--- Critical Path ---');
  
  for (const nodeId of timing.criticalPath) {
    const node = timing.nodes.find(n => n.id === nodeId);
    if (node) {
      lines.push(`  Cycle ${node.asapCycle}: ${node.instruction.slice(0, 60)}`);
    }
  }

  lines.push('');
  lines.push('--- Instruction Schedule ---');
  
  const sortedNodes = [...timing.nodes]
    .filter(n => n.type === 'instruction')
    .sort((a, b) => a.asapCycle - b.asapCycle);

  for (const node of sortedNodes) {
    const slackStr = node.criticalPath ? '(CRITICAL)' : `(slack: ${node.slack})`;
    lines.push(`  [${node.asapCycle}-${node.alapCycle}] ${node.valueName || node.id}: ${slackStr}`);
  }

  return lines.join('\n');
}
