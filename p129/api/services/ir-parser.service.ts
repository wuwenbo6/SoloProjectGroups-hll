import type {
  ControlFlowGraph,
  BasicBlock,
  DataFlowGraph,
  DFGNode,
} from '@shared/types.js';

interface FunctionIR {
  name: string;
  signature: string;
  body: string[];
}

function splitFunctions(ir: string): FunctionIR[] {
  const functions: FunctionIR[] = [];
  const lines = ir.split('\n');
  let currentFunc: FunctionIR | null = null;
  let braceCount = 0;
  let inFunctionBody = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('define ') || trimmed.startsWith('declare ')) {
      if (trimmed.startsWith('define ')) {
        const nameMatch = trimmed.match(/define\s+[^@]+@(\w+)/);
        if (nameMatch) {
          currentFunc = {
            name: nameMatch[1],
            signature: trimmed,
            body: [],
          };
          braceCount = 0;
          inFunctionBody = false;
          if (trimmed.includes('{')) {
            braceCount++;
            inFunctionBody = true;
          }
        }
      }
      continue;
    }

    if (currentFunc && inFunctionBody) {
      if (trimmed.includes('{')) braceCount++;
      if (trimmed.includes('}')) braceCount--;
      if (braceCount === 0 && trimmed === '}') {
        functions.push(currentFunc);
        currentFunc = null;
        inFunctionBody = false;
      } else if (trimmed !== '{' && trimmed !== '}') {
        currentFunc.body.push(line);
      }
    } else if (currentFunc && trimmed.includes('{')) {
      braceCount++;
      inFunctionBody = true;
    }
  }

  return functions;
}

function parseBasicBlocks(func: FunctionIR): BasicBlock[] {
  const blocks: BasicBlock[] = [];
  let currentBlock: BasicBlock | null = null;

  for (const line of func.body) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '{' || trimmed === '}') continue;

    const labelMatch = trimmed.match(/^(\w+):\s*(;.*)?$/);
    if (labelMatch) {
      const label = labelMatch[1];
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        id: `${func.name}_${label}`,
        label,
        instructions: [],
        predecessors: [],
        successors: [],
      };
      continue;
    }

    if (!currentBlock) {
      currentBlock = {
        id: `${func.name}_entry`,
        label: 'entry',
        instructions: [],
        predecessors: [],
        successors: [],
      };
    }

    if (trimmed && !trimmed.startsWith(';')) {
      currentBlock.instructions.push(trimmed);
    }
  }

  if (currentBlock) blocks.push(currentBlock);
  return blocks;
}

function extractSuccessors(block: BasicBlock): { target: string; type: 'unconditional' | 'conditional' }[] {
  const successors: { target: string; type: 'unconditional' | 'conditional' }[] = [];
  const funcName = block.id.split('_')[0];

  for (const inst of block.instructions) {
    const trimmed = inst.trim();

    const brMatch = trimmed.match(/^br\s+label\s+%(\w+)\s*$/);
    if (brMatch) {
      successors.push({ target: `${funcName}_${brMatch[1]}`, type: 'unconditional' });
      continue;
    }

    const condBrMatch = trimmed.match(/^br\s+.+?label\s+%(\w+),\s*label\s+%(\w+)/);
    if (condBrMatch) {
      successors.push({ target: `${funcName}_${condBrMatch[1]}`, type: 'conditional' });
      successors.push({ target: `${funcName}_${condBrMatch[2]}`, type: 'conditional' });
      continue;
    }

    const switchMatch = trimmed.match(/^switch\s+\S+[^[]*\[([^\]]+)\]/);
    if (switchMatch) {
      const cases = switchMatch[1].match(/label\s+%(\w+)/g);
      if (cases) {
        for (const c of cases) {
          const labelMatch = c.match(/label\s+%(\w+)/);
          if (labelMatch) {
            successors.push({ target: `${funcName}_${labelMatch[1]}`, type: 'conditional' });
          }
        }
      }
    }
  }

  return successors;
}

export function parseCFG(ir: string): ControlFlowGraph[] {
  const cfgs: ControlFlowGraph[] = [];
  const functions = splitFunctions(ir);

  for (const func of functions) {
    const blocks = parseBasicBlocks(func);
    const edges: ControlFlowGraph['edges'] = [];
    const blockMap = new Map(blocks.map((b) => [b.id, b]));

    for (const block of blocks) {
      const succs = extractSuccessors(block);
      block.successors = succs.map((s) => s.target);

      for (const succ of succs) {
        edges.push({ source: block.id, target: succ.target, type: succ.type });
        const targetBlock = blockMap.get(succ.target);
        if (targetBlock && !targetBlock.predecessors.includes(block.id)) {
          targetBlock.predecessors.push(block.id);
        }
      }
    }

    const entryBlock = blocks.length > 0 ? blocks[0].id : '';

    cfgs.push({
      functionName: func.name,
      blocks: layoutBlocks(blocks, edges),
      edges,
      entryBlock,
    });
  }

  return cfgs;
}

function layoutBlocks(
  blocks: BasicBlock[],
  edges: ControlFlowGraph['edges']
): BasicBlock[] {
  const blockWidth = 200;
  const blockHeight = 120;
  const levelGap = 180;
  const nodeGap = 40;

  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const queue: string[] = [];

  if (blocks.length > 0) {
    queue.push(blocks[0].id);
    levels.set(blocks[0].id, 0);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const currentLevel = levels.get(current) || 0;
    const succs = edges.filter((e) => e.source === current);

    for (const succ of succs) {
      if (!levels.has(succ.target) || levels.get(succ.target)! <= currentLevel) {
        levels.set(succ.target, currentLevel + 1);
      }
      if (!visited.has(succ.target)) {
        queue.push(succ.target);
      }
    }
  }

  for (const block of blocks) {
    if (!levels.has(block.id)) {
      levels.set(block.id, 0);
    }
  }

  const levelBlocks = new Map<number, BasicBlock[]>();
  for (const block of blocks) {
    const level = levels.get(block.id) || 0;
    if (!levelBlocks.has(level)) levelBlocks.set(level, []);
    levelBlocks.get(level)!.push(block);
  }

  for (const [level, levelBlockList] of levelBlocks) {
    const totalWidth = levelBlockList.length * blockWidth + (levelBlockList.length - 1) * nodeGap;
    let x = -totalWidth / 2;

    for (const block of levelBlockList) {
      block.position = {
        x,
        y: level * (blockHeight + levelGap),
      };
      x += blockWidth + nodeGap;
    }
  }

  return blocks;
}

export function parseDFG(ir: string): DataFlowGraph {
  const nodes: DFGNode[] = [];
  const edges: DataFlowGraph['edges'] = [];
  const valueMap = new Map<string, string>();

  const functions = splitFunctions(ir);
  let nodeIdCounter = 0;

  for (const func of functions) {
    const argMatch = func.signature.match(/define\s+[^(]+\(([^)]+)\)/);
    if (argMatch) {
      const args = argMatch[1].split(',').map((a) => a.trim());
      for (const arg of args) {
        const argNameMatch = arg.match(/%(\w+)/);
        if (argNameMatch) {
          const nodeId = `arg_${nodeIdCounter++}`;
          nodes.push({
            id: nodeId,
            instruction: arg,
            type: 'argument',
            valueName: argNameMatch[1],
          });
          valueMap.set(`%${argNameMatch[1]}`, nodeId);
        }
      }
    }

    for (const line of func.body) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed === '{' || trimmed === '}') continue;

      const labelMatch = trimmed.match(/^(\w+):\s*(;.*)?$/);
      if (labelMatch) continue;

      const assignMatch = trimmed.match(/^%(\w+)\s*=\s*(.+)$/);
      if (assignMatch) {
        const valueName = assignMatch[1];
        const instruction = assignMatch[2];
        const nodeId = `inst_${nodeIdCounter++}`;

        nodes.push({
          id: nodeId,
          instruction: trimmed,
          type: 'instruction',
          valueName,
        });
        valueMap.set(`%${valueName}`, nodeId);

        const operands = instruction.match(/%(\w+)/g) || [];
        for (let i = 0; i < operands.length; i++) {
          const operand = operands[i];
          const sourceNodeId = valueMap.get(operand);
          if (sourceNodeId) {
            edges.push({
              source: sourceNodeId,
              target: nodeId,
              operandIndex: i,
            });
          }
        }

        const constants = instruction.match(/\bi32\s+(-?\d+)/g);
        if (constants) {
          for (const constant of constants) {
            const constNodeId = `const_${nodeIdCounter++}`;
            nodes.push({
              id: constNodeId,
              instruction: constant,
              type: 'constant',
            });
            edges.push({
              source: constNodeId,
              target: nodeId,
              operandIndex: edges.length,
            });
          }
        }
      }
    }
  }

  return { nodes, edges };
}

export function parseCompileResult(
  originalIR: string,
  optimizedIR: string
): {
  cfgs: ControlFlowGraph[];
  dfg: DataFlowGraph;
} {
  const cfgs = parseCFG(optimizedIR || originalIR);
  const dfg = parseDFG(optimizedIR || originalIR);

  return { cfgs, dfg };
}
