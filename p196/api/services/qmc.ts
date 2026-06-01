export interface PrimeImplicant {
  binary: string;
  minterms: number[];
  isEssential: boolean;
}

export interface SimplifyStep {
  description: string;
  content: string;
}

export interface SimplifyResult {
  expression: string;
  primeImplicants: PrimeImplicant[];
  essentialPrimes: PrimeImplicant[];
  steps: SimplifyStep[];
}

export interface OutputFunction {
  name: string;
  minterms: number[];
  dontCare: number[];
  result?: SimplifyResult;
}

export interface MultiOutputRequest {
  variableCount: number;
  outputs: OutputFunction[];
  shareTerms: boolean;
}

export interface MultiOutputResult {
  success: boolean;
  outputs: {
    name: string;
    expression: string;
    primeImplicants: PrimeImplicant[];
    essentialPrimes: PrimeImplicant[];
  }[];
  sharedTerms: {
    binary: string;
    expression: string;
    usedBy: string[];
  }[];
  verilog: string;
  steps: SimplifyStep[];
  error?: string;
}

interface Implicant {
  binary: string;
  minterms: number[];
  used: boolean;
}

function numToBinary(n: number, bits: number): string {
  return n.toString(2).padStart(bits, '0');
}

function countOnes(s: string): number {
  return s.split('').filter(c => c === '1').length;
}

function differByOne(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff++;
    if (diff > 1) return false;
  }
  return diff === 1;
}

function combine(a: string, b: string): string {
  let result = '';
  for (let i = 0; i < a.length; i++) {
    result += a[i] !== b[i] ? '-' : a[i];
  }
  return result;
}

export function binaryToExpression(binary: string, variables: string[]): string {
  const terms: string[] = [];
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === '0') {
      terms.push(variables[i] + "'");
    } else if (binary[i] === '1') {
      terms.push(variables[i]);
    }
  }
  return terms.length > 0 ? terms.join('') : '1';
}

function binaryToVerilogExpression(binary: string, variables: string[]): string {
  const terms: string[] = [];
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === '0') {
      terms.push('~' + variables[i].toLowerCase());
    } else if (binary[i] === '1') {
      terms.push(variables[i].toLowerCase());
    }
  }
  return terms.length > 0 ? terms.join(' & ') : '1\'b1';
}

function generatePrimeImplicants(
  minterms: number[],
  dontCare: number[],
  variableCount: number,
  steps?: SimplifyStep[]
): Implicant[] {
  const allTerms = [...new Set([...minterms, ...dontCare])].sort((a, b) => a - b);
  const onlyMinterms = [...new Set(minterms)].sort((a, b) => a - b);

  if (onlyMinterms.length === 0 || onlyMinterms.length === Math.pow(2, variableCount)) {
    return [];
  }

  let currentImplicants: Implicant[] = allTerms.map(m => ({
    binary: numToBinary(m, variableCount),
    minterms: [m],
    used: false,
  }));

  const allPrimeImplicants: Implicant[] = [];
  let iteration = 1;

  while (currentImplicants.length > 0) {
    const groups: Map<number, Implicant[]> = new Map();
    for (const imp of currentImplicants) {
      const ones = countOnes(imp.binary);
      if (!groups.has(ones)) groups.set(ones, []);
      groups.get(ones)!.push(imp);
    }

    const nextImplicants: Implicant[] = [];
    const sortedKeys = [...groups.keys()].sort((a, b) => a - b);
    const usedSet = new Set<string>();

    for (let i = 0; i < sortedKeys.length - 1; i++) {
      const groupA = groups.get(sortedKeys[i])!;
      const groupB = groups.get(sortedKeys[i + 1])!;

      for (const impA of groupA) {
        for (const impB of groupB) {
          if (differByOne(impA.binary, impB.binary)) {
            const combined = combine(impA.binary, impB.binary);
            const mergedMinterms = [...new Set([...impA.minterms, ...impB.minterms])].sort((a, b) => a - b);
            const key = combined + ':' + mergedMinterms.join(',');

            if (!usedSet.has(key)) {
              usedSet.add(key);
              nextImplicants.push({
                binary: combined,
                minterms: mergedMinterms,
                used: false,
              });
            }
            impA.used = true;
            impB.used = true;
          }
        }
      }
    }

    const unusedImplicants = currentImplicants.filter(imp => !imp.used);
    for (const imp of unusedImplicants) {
      const isDupe = allPrimeImplicants.some(
        p => p.binary === imp.binary && 
        p.minterms.length === imp.minterms.length &&
        p.minterms.every((m, i) => m === imp.minterms[i])
      );
      if (!isDupe) {
        allPrimeImplicants.push(imp);
      }
    }

    if (steps) {
      const groupStr = sortedKeys
        .map(k => {
          const imps = groups.get(k)!.map(i => i.binary).join(', ');
          return `  ${k}个1: ${imps}`;
        })
        .join('\n');

      const combinedStr = nextImplicants.length > 0
        ? nextImplicants.map(i => `${i.binary} (m${i.minterms.join(',m')})`).join(', ')
        : '无';

      steps.push({
        description: `第${iteration}轮合并`,
        content: `分组:\n${groupStr}\n\n合并结果: ${combinedStr}`,
      });
    }

    currentImplicants = nextImplicants;
    iteration++;
  }

  return allPrimeImplicants;
}

function selectPrimeCovering(
  allPrimeImplicants: Implicant[],
  minterms: number[],
  dontCare: number[]
): { selected: Implicant[]; steps: SimplifyStep[] } {
  const steps: SimplifyStep[] = [];
  const onlyMinterms = [...new Set(minterms)].sort((a, b) => a - b);

  if (onlyMinterms.length === 0) {
    return { selected: [], steps: [{ description: '无最小项', content: '输出恒为0' }] };
  }

  const maxVal = Math.max(...onlyMinterms);
  if (onlyMinterms.length === Math.pow(2, Math.floor(Math.log2(maxVal)) + 1)) {
    return { selected: [{ binary: '-'.repeat(Math.floor(Math.log2(maxVal)) + 1), minterms: onlyMinterms, used: false }], steps: [{ description: '所有最小项均为1', content: '输出恒为1' }] };
  }

  const primeChart: Map<number, number[]> = new Map();
  for (let pi = 0; pi < allPrimeImplicants.length; pi++) {
    for (const m of allPrimeImplicants[pi].minterms) {
      if (onlyMinterms.includes(m)) {
        if (!primeChart.has(m)) primeChart.set(m, []);
        primeChart.get(m)!.push(pi);
      }
    }
  }

  const essentialPrimeIndices: Set<number> = new Set();
  const coveredMinterms: Set<number> = new Set();

  for (const [minterm, coveringPrimes] of primeChart) {
    if (coveringPrimes.length === 1) {
      essentialPrimeIndices.add(coveringPrimes[0]);
      for (const m of allPrimeImplicants[coveringPrimes[0]].minterms) {
        if (onlyMinterms.includes(m)) coveredMinterms.add(m);
      }
    }
  }

  const essentialStr = essentialPrimeIndices.size > 0
    ? [...essentialPrimeIndices]
        .map(i => allPrimeImplicants[i])
        .map(p => `${p.binary} (覆盖 m${p.minterms.join(',m')})`)
        .join('\n')
    : '无';

  steps.push({
    description: '本质素项',
    content: `本质素项 (仅由一个素项覆盖的最小项对应的素项):\n${essentialStr}`,
  });

  const uncovered = onlyMinterms.filter(m => !coveredMinterms.has(m));

  if (uncovered.length > 0) {
    const remainingChart: Map<number, number[]> = new Map();
    const remainingPrimeIndices: Set<number> = new Set();

    for (const m of uncovered) {
      const covering = primeChart.get(m) || [];
      remainingChart.set(m, covering);
      for (const pi of covering) {
        if (!essentialPrimeIndices.has(pi)) {
          remainingPrimeIndices.add(pi);
        }
      }
    }

    const selectedIndices = selectMinimalCovering(
      [...remainingPrimeIndices],
      uncovered,
      allPrimeImplicants
    );

    for (const idx of selectedIndices) {
      essentialPrimeIndices.add(idx);
      for (const m of allPrimeImplicants[idx].minterms) {
        if (onlyMinterms.includes(m)) coveredMinterms.add(m);
      }
    }

    if (selectedIndices.length > 0) {
      const petrickStr = selectedIndices
        .map(i => allPrimeImplicants[i])
        .map(p => `${p.binary} (覆盖 m${p.minterms.join(',m')})`)
        .join('\n');
      steps.push({
        description: 'Petrick方法选择附加素项',
        content: `使用Petrick方法选择最少素项覆盖剩余最小项 {${uncovered.join(', ')}}:\n${petrickStr}`,
      });
    }
  }

  const selected = [...essentialPrimeIndices].map(i => allPrimeImplicants[i]);
  return { selected, steps };
}

function selectMinimalCovering(
  primeIndices: number[],
  uncovered: number[],
  allPrimes: Implicant[]
): number[] {
  if (uncovered.length === 0) return [];

  let bestCover: number[] | null = null;

  function backtrack(
    idx: number,
    selected: number[],
    covered: Set<number>
  ): void {
    if (covered.size === uncovered.length) {
      if (bestCover === null || selected.length < bestCover.length) {
        bestCover = [...selected];
      }
      return;
    }

    if (idx >= primeIndices.length) return;

    if (bestCover !== null && selected.length >= bestCover.length) return;

    const pi = primeIndices[idx];
    const newCovered = new Set(covered);
    for (const m of allPrimes[pi].minterms) {
      if (uncovered.includes(m)) newCovered.add(m);
    }

    backtrack(idx + 1, [...selected, pi], newCovered);
    backtrack(idx + 1, selected, covered);
  }

  backtrack(0, [], new Set());
  return bestCover || [];
}

export function simplify(
  minterms: number[],
  dontCare: number[],
  variableCount: number
): SimplifyResult {
  const steps: SimplifyStep[] = [];
  const variables = 'ABCDEFGHIJKLMNOP'.slice(0, variableCount).split('');
  const onlyMinterms = [...new Set(minterms)].sort((a, b) => a - b);

  if (onlyMinterms.length === 0) {
    return {
      expression: '0',
      primeImplicants: [],
      essentialPrimes: [],
      steps: [{ description: '无最小项', content: '输出恒为0' }],
    };
  }

  if (onlyMinterms.length === Math.pow(2, variableCount)) {
    return {
      expression: '1',
      primeImplicants: [],
      essentialPrimes: [],
      steps: [{ description: '所有最小项均为1', content: '输出恒为1' }],
    };
  }

  steps.push({
    description: '输入最小项',
    content: `最小项: {${onlyMinterms.join(', ')}}${dontCare.length > 0 ? `\n无关项: {${dontCare.join(', ')}}` : ''}`,
  });

  const allPrimeImplicants = generatePrimeImplicants(minterms, dontCare, variableCount, steps);

  const primeStr = allPrimeImplicants
    .map(p => `${p.binary} (覆盖 m${p.minterms.join(',m')})`)
    .join('\n');
  steps.push({
    description: '所有素项',
    content: `共找到 ${allPrimeImplicants.length} 个素项:\n${primeStr}`,
  });

  const { selected: finalPrimes, steps: selectSteps } = selectPrimeCovering(
    allPrimeImplicants,
    minterms,
    dontCare
  );
  steps.push(...selectSteps);

  const expressions = finalPrimes.map(p => binaryToExpression(p.binary, variables));
  const finalExpression = expressions.length > 0 ? expressions.join(' + ') : '0';

  const essentialPrimeIndices = new Set(
    finalPrimes.map(fp => allPrimeImplicants.findIndex(p => p.binary === fp.binary))
  );

  const primeImplicants: PrimeImplicant[] = allPrimeImplicants.map(p => ({
    binary: p.binary,
    minterms: [...p.minterms],
    isEssential: essentialPrimeIndices.has(allPrimeImplicants.indexOf(p)),
  }));

  const essentialPrimes: PrimeImplicant[] = finalPrimes.map(p => ({
    binary: p.binary,
    minterms: [...p.minterms],
    isEssential: true,
  }));

  steps.push({
    description: '最终化简结果',
    content: `最简与或式: F = ${finalExpression}`,
  });

  return {
    expression: finalExpression,
    primeImplicants,
    essentialPrimes,
    steps,
  };
}

export function simplifyMultiOutput(
  request: MultiOutputRequest
): MultiOutputResult {
  const { variableCount, outputs, shareTerms } = request;
  const variables = 'ABCDEFGHIJKLMNOP'.slice(0, variableCount).split('');
  const steps: SimplifyStep[] = [];
  const allSharedTerms: { binary: string; expression: string; usedBy: string[] }[] = [];

  steps.push({
    description: '多输出函数化简',
    content: `变量数: ${variableCount}\n输出函数: ${outputs.map(o => o.name).join(', ')}\n共享项: ${shareTerms ? '启用' : '禁用'}`,
  });

  if (shareTerms) {
    const allMinterms = new Map<number, Set<string>>();
    const allDontCare = new Set<number>();

    for (const output of outputs) {
      for (const m of output.minterms) {
        if (!allMinterms.has(m)) allMinterms.set(m, new Set());
        allMinterms.get(m)!.add(output.name);
      }
      for (const d of output.dontCare) {
        allDontCare.add(d);
      }
    }

    steps.push({
      description: '生成全局素项库',
      content: `合并所有输出的最小项，生成共享素项库...`,
    });

    const allMintermNumbers = [...allMinterms.keys()];
    const allDontCareNumbers = [...allDontCare];
    const globalPrimes = generatePrimeImplicants(allMintermNumbers, allDontCareNumbers, variableCount, steps);

    steps.push({
      description: '全局素项库',
      content: `共生成 ${globalPrimes.length} 个候选共享素项:\n${
        globalPrimes.map(p => `${p.binary} (m${p.minterms.join(',m')})`).join('\n')
      }`,
    });

    const primeUsage = new Map<string, { prime: Implicant; outputs: Set<string> }>();
    for (const prime of globalPrimes) {
      const covers = new Set<string>();
      for (const m of prime.minterms) {
        if (allMinterms.has(m)) {
          for (const outName of allMinterms.get(m)!) {
            covers.add(outName);
          }
        }
      }
      if (covers.size > 0) {
        primeUsage.set(prime.binary, { prime, outputs: covers });
      }
    }

    const resultOutputs: MultiOutputResult['outputs'] = [];

    for (const output of outputs) {
      steps.push({
        description: `处理输出 ${output.name}`,
        content: `最小项: {${output.minterms.join(', ')}}${output.dontCare.length > 0 ? `\n无关项: {${output.dontCare.join(', ')}}` : ''}`,
      });

      if (output.minterms.length === 0) {
        resultOutputs.push({
          name: output.name,
          expression: '0',
          primeImplicants: [],
          essentialPrimes: [],
        });
        continue;
      }

      if (output.minterms.length === Math.pow(2, variableCount)) {
        resultOutputs.push({
          name: output.name,
          expression: '1',
          primeImplicants: [],
          essentialPrimes: [],
        });
        continue;
      }

      const outputPrimes: Implicant[] = [];
      for (const [binary, usage] of primeUsage) {
        if (usage.outputs.has(output.name)) {
          const relevantMinterms = usage.prime.minterms.filter(
            m => output.minterms.includes(m) || output.dontCare.includes(m)
          );
          if (relevantMinterms.length > 0) {
            outputPrimes.push({ ...usage.prime, minterms: relevantMinterms });
          }
        }
      }

      const localPrimes = generatePrimeImplicants(output.minterms, output.dontCare, variableCount);
      for (const lp of localPrimes) {
        const exists = outputPrimes.some(op => op.binary === lp.binary);
        if (!exists) {
          outputPrimes.push(lp);
        }
      }

      const { selected: finalPrimes } = selectPrimeCovering(outputPrimes, output.minterms, output.dontCare);

      const expressions = finalPrimes.map(p => binaryToExpression(p.binary, variables));
      const finalExpression = expressions.length > 0 ? expressions.join(' + ') : '0';

      for (const fp of finalPrimes) {
        const expr = binaryToExpression(fp.binary, variables);
        let found = allSharedTerms.find(t => t.binary === fp.binary);
        if (!found) {
          found = { binary: fp.binary, expression: expr, usedBy: [] };
          allSharedTerms.push(found);
        }
        if (!found.usedBy.includes(output.name)) {
          found.usedBy.push(output.name);
        }
      }

      const outputAllPrimes: PrimeImplicant[] = outputPrimes.map(p => ({
        binary: p.binary,
        minterms: [...p.minterms],
        isEssential: finalPrimes.some(fp => fp.binary === p.binary),
      }));

      const outputEssential: PrimeImplicant[] = finalPrimes.map(p => ({
        binary: p.binary,
        minterms: [...p.minterms],
        isEssential: true,
      }));

      resultOutputs.push({
        name: output.name,
        expression: finalExpression,
        primeImplicants: outputAllPrimes,
        essentialPrimes: outputEssential,
      });

      steps.push({
        description: `输出 ${output.name} 化简结果`,
        content: `${output.name} = ${finalExpression}`,
      });
    }

    const verilog = generateVerilog(variables, resultOutputs, allSharedTerms, shareTerms);

    return {
      success: true,
      outputs: resultOutputs,
      sharedTerms: allSharedTerms.filter(t => t.usedBy.length >= 2),
      verilog,
      steps,
    };
  } else {
    const resultOutputs: MultiOutputResult['outputs'] = [];

    for (const output of outputs) {
      steps.push({
        description: `处理输出 ${output.name}`,
        content: `最小项: {${output.minterms.join(', ')}}${output.dontCare.length > 0 ? `\n无关项: {${output.dontCare.join(', ')}}` : ''}`,
      });

      const result = simplify(output.minterms, output.dontCare, variableCount);

      for (const prime of result.essentialPrimes) {
        const expr = binaryToExpression(prime.binary, variables);
        let found = allSharedTerms.find(t => t.binary === prime.binary);
        if (!found) {
          found = { binary: prime.binary, expression: expr, usedBy: [] };
          allSharedTerms.push(found);
        }
        if (!found.usedBy.includes(output.name)) {
          found.usedBy.push(output.name);
        }
      }

      resultOutputs.push({
        name: output.name,
        expression: result.expression,
        primeImplicants: result.primeImplicants,
        essentialPrimes: result.essentialPrimes,
      });

      steps.push({
        description: `输出 ${output.name} 化简结果`,
        content: `${output.name} = ${result.expression}`,
      });
    }

    const verilog = generateVerilog(variables, resultOutputs, allSharedTerms.filter(t => t.usedBy.length >= 2), shareTerms);

    return {
      success: true,
      outputs: resultOutputs,
      sharedTerms: allSharedTerms.filter(t => t.usedBy.length >= 2),
      verilog,
      steps,
    };
  }
}

export function generateVerilog(
  variables: string[],
  outputs: {
    name: string;
    expression: string;
    essentialPrimes: { binary: string; minterms: number[] }[];
  }[],
  sharedTerms: { binary: string; expression: string; usedBy: string[] }[],
  useSharedTerms: boolean
): string {
  const inputPorts = variables.map(v => v.toLowerCase()).join(', ');
  const outputPorts = outputs.map(o => o.name.toLowerCase()).join(', ');

  let verilog = 'module boolean_simplifier(\n';
  verilog += `  input ${inputPorts},\n`;
  verilog += `  output reg ${outputPorts}\n`;
  verilog += ');\n\n';

  if (useSharedTerms && sharedTerms.length > 0) {
    verilog += '  // 共享项定义\n';
    for (let i = 0; i < sharedTerms.length; i++) {
      const term = sharedTerms[i];
      const termName = `term_${i}`;
      const verilogExpr = binaryToVerilogExpression(term.binary, variables);
      verilog += `  wire ${termName};\n`;
      verilog += `  assign ${termName} = ${verilogExpr};\n`;
    }
    verilog += '\n';
  }

  verilog += '  always @(*)\n';
  verilog += '  begin\n';

  for (const output of outputs) {
    const outName = output.name.toLowerCase();

    if (output.expression === '0') {
      verilog += `    ${outName} = 1'b0;\n`;
    } else if (output.expression === '1') {
      verilog += `    ${outName} = 1'b1;\n`;
    } else {
      let verilogExpr: string;
      if (useSharedTerms && sharedTerms.length > 0) {
        const usedTerms: string[] = [];
        for (let i = 0; i < sharedTerms.length; i++) {
          if (sharedTerms[i].usedBy.includes(output.name)) {
            usedTerms.push(`term_${i}`);
          }
        }
        const usedBinaries = sharedTerms.filter(t => t.usedBy.includes(output.name)).map(t => t.binary);
        const standalone = output.essentialPrimes
          .filter(p => !usedBinaries.includes(p.binary))
          .map(p => binaryToVerilogExpression(p.binary, variables));
        const allTerms = [...usedTerms, ...standalone];
        verilogExpr = allTerms.join(' | ');
      } else {
        const terms = output.essentialPrimes.map(p => binaryToVerilogExpression(p.binary, variables));
        verilogExpr = terms.join(' | ');
      }
      verilog += `    ${outName} = ${verilogExpr};\n`;
    }
  }

  verilog += '  end\n\n';
  verilog += 'endmodule\n';

  return verilog;
}
