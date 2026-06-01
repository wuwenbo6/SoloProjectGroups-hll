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
}

export interface MultiOutputRequest {
  variableCount: number;
  outputs: OutputFunction[];
  shareTerms: boolean;
}

export interface MultiOutputResult {
  success: boolean;
  outputs: { name: string; expression: string; primeImplicants: PrimeImplicant[]; essentialPrimes: PrimeImplicant[] }[];
  sharedTerms: { binary: string; expression: string; usedBy: string[] }[];
  verilog: string;
  steps: SimplifyStep[];
  error?: string;
}

function numToBinary(n: number, bits: number): string {
  return n.toString(2).padStart(bits, "0");
}

function binaryToNum(b: string): number {
  return parseInt(b, 2);
}

export function binaryToExpression(binary: string, variables: string[]): string {
  const terms: string[] = [];
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === "0") terms.push(variables[i] + "'");
    else if (binary[i] === "1") terms.push(variables[i]);
  }
  return terms.length > 0 ? terms.join("") : "1";
}

function binaryToVerilogExpression(binary: string, variables: string[]): string {
  const terms: string[] = [];
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === "0") terms.push("~" + variables[i].toLowerCase());
    else if (binary[i] === "1") terms.push(variables[i].toLowerCase());
  }
  return terms.length > 0 ? terms.join(" & ") : "1'b1";
}

function getMinterms(cube: string): number[] {
  const results: number[] = [];
  const vars = cube.length;
  const dashes: number[] = [];
  for (let i = 0; i < vars; i++) if (cube[i] === "-") dashes.push(i);
  const base = binaryToNum(cube.replace(/-/g, "0"));
  for (let i = 0; i < (1 << dashes.length); i++) {
    let num = base;
    for (let j = 0; j < dashes.length; j++) {
      if (i & (1 << j)) num |= 1 << (vars - 1 - dashes[j]);
    }
    results.push(num);
  }
  return results;
}

function isValidExpansion(cube: string, varIndex: number, onSet: Set<number>, dcSet: Set<number>): boolean {
  const newCube = cube.substring(0, varIndex) + "-" + cube.substring(varIndex + 1);
  const covered = getMinterms(newCube);
  for (const m of covered) {
    if (!onSet.has(m) && !dcSet.has(m)) return false;
  }
  return true;
}

function expandCube(cube: string, onSet: Set<number>, dcSet: Set<number>): string {
  let result = cube;
  const numVars = cube.length;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < numVars; i++) {
      if (result[i] !== "-" && isValidExpansion(result, i, onSet, dcSet)) {
        result = result.substring(0, i) + "-" + result.substring(i + 1);
        changed = true;
        break;
      }
    }
  }
  return result;
}

function combineCubes(a: string, b: string): string | null {
  let diff = 0;
  let result = "";
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      if (a[i] === "-" || b[i] === "-") return null;
      diff++;
      if (diff > 1) return null;
      result += "-";
    } else {
      result += a[i];
    }
  }
  return diff === 1 ? result : null;
}

function generatePrimeImplicants(onSet: Set<number>, dcSet: Set<number>, numVars: number, steps: SimplifyStep[]): string[] {
  const primes: Set<string> = new Set();
  const onAndDc = new Set([...onSet, ...dcSet]);
  let currentCubes: string[] = [];
  for (const m of onSet) {
    currentCubes.push(numToBinary(m, numVars));
  }
  let iteration = 1;
  while (currentCubes.length > 0 && iteration <= 15) {
    const expanded: string[] = [];
    for (const cube of currentCubes) {
      const e = expandCube(cube, onSet, dcSet);
      if (!primes.has(e)) {
        primes.add(e);
        expanded.push(e);
      }
    }
    const nextCubes: Set<string> = new Set();
    for (let i = 0; i < expanded.length; i++) {
      for (let j = i + 1; j < expanded.length; j++) {
        const combined = combineCubes(expanded[i], expanded[j]);
        if (combined !== null) {
          const covered = getMinterms(combined);
          const valid = covered.every(m => onAndDc.has(m));
          if (valid && !primes.has(combined)) {
            nextCubes.add(combined);
          }
        }
      }
    }
    if (iteration <= 2) {
      steps.push({
        description: "Prime Implicant Generation - Iteration " + iteration,
        content: "Initial cubes: " + currentCubes.length + ", expanded primes: " + expanded.length + ", combined for next iteration: " + nextCubes.size,
      });
    }
    currentCubes = [...nextCubes];
    iteration++;
  }
  return [...primes];
}

function findEssentialPrimes(primes: string[], onSet: Set<number>, steps: SimplifyStep[]): string[] {
  const coverage: Map<number, string[]> = new Map();
  for (const m of onSet) coverage.set(m, []);
  for (const prime of primes) {
    const minterms = getMinterms(prime);
    for (const m of minterms) {
      if (onSet.has(m)) coverage.get(m)!.push(prime);
    }
  }
  const essentials: Set<string> = new Set();
  for (const [_m, covering] of coverage) {
    if (covering.length === 1) essentials.add(covering[0]);
  }
  steps.push({
    description: "Identify Essential Prime Implicants",
    content: "Found " + essentials.size + " essential prime implicants",
  });
  return [...essentials];
}

function selectMinimalCover(primes: string[], essentials: string[], onSet: Set<number>, steps: SimplifyStep[]): string[] {
  const covered = new Set<number>();
  for (const ep of essentials) {
    for (const m of getMinterms(ep)) {
      if (onSet.has(m)) covered.add(m);
    }
  }
  const uncovered = [...onSet].filter(m => !covered.has(m));
  if (uncovered.length === 0) return essentials;
  const remaining = primes.filter(p => !essentials.includes(p));
  const result = [...essentials];
  const stillUncovered = new Set(uncovered);
  let iterations = 0;
  while (stillUncovered.size > 0 && iterations < 5000) {
    iterations++;
    let bestPrime: string | null = null;
    let bestScore = -Infinity;
    for (const p of remaining) {
      if (!result.includes(p)) {
        const mt = getMinterms(p);
        const covers = mt.filter(m => stillUncovered.has(m));
        const literals = p.split("").filter(c => c !== "-").length;
        const score = covers.length * 1000 - literals;
        if (score > bestScore && covers.length > 0) {
          bestScore = score;
          bestPrime = p;
        }
      }
    }
    if (bestPrime === null) break;
    result.push(bestPrime);
    for (const m of getMinterms(bestPrime)) {
      if (onSet.has(m)) stillUncovered.delete(m);
    }
  }
  steps.push({
    description: "Heuristic Prime Implicant Cover Selection",
    content: "Remaining uncovered minterms: " + uncovered.length + ", selected " + (result.length - essentials.length) + " additional prime implicants",
  });
  return result;
}

export function simplify(minterms: number[], dontCare: number[], variableCount: number): SimplifyResult {
  const steps: SimplifyStep[] = [];
  const variables = "ABCDEFGHIJKL".slice(0, variableCount).split("");
  const onSet = new Set(minterms);
  const dcSet = new Set(dontCare);
  const onlyMinterms = [...new Set(minterms)].sort((a, b) => a - b);
  if (onlyMinterms.length === 0) {
    return { expression: "0", primeImplicants: [], essentialPrimes: [], steps: [{ description: "No Minterms", content: "Output is always 0" }] };
  }
  if (onlyMinterms.length === Math.pow(2, variableCount)) {
    return { expression: "1", primeImplicants: [], essentialPrimes: [], steps: [{ description: "All Minterms Are 1", content: "Output is always 1" }] };
  }
  steps.push({ description: "Input", content: "Variables: " + variableCount + "\nMinterms: {" + onlyMinterms.join(", ") + "}\nDon't cares: {" + dontCare.join(", ") + "}" });
  steps.push({ description: "Espresso Algorithm Start", content: "Using heuristic method for boolean function simplification. Don't cares participate in prime expansion but are not required to be covered." });
  const primes = generatePrimeImplicants(onSet, dcSet, variableCount, steps);
  steps.push({ description: "Prime Implicant Generation Complete", content: "Generated " + primes.length + " prime implicants total" });
  const essentials = findEssentialPrimes(primes, onSet, steps);
  const finalPrimes = selectMinimalCover(primes, essentials, onSet, steps);
  const expressions = finalPrimes.map(p => binaryToExpression(p, variables));
  const finalExpression = expressions.length > 0 ? expressions.join(" + ") : "0";
  const finalSet = new Set(finalPrimes);
  const primeImplicants: PrimeImplicant[] = primes.map(p => ({
    binary: p, minterms: getMinterms(p).filter(m => onSet.has(m)), isEssential: finalSet.has(p),
  }));
  const essentialPrimes: PrimeImplicant[] = finalPrimes.map(p => ({
    binary: p, minterms: getMinterms(p).filter(m => onSet.has(m)), isEssential: true,
  }));
  steps.push({ description: "Final Simplification Result", content: "Minimal SOP: F = " + finalExpression });
  return { expression: finalExpression, primeImplicants, essentialPrimes, steps };
}

export function generateVerilog(
  variables: string[], outputs: { name: string; expression: string; essentialPrimes: { binary: string; minterms: number[] }[] }[],
  sharedTerms: { binary: string; expression: string; usedBy: string[] }[], useSharedTerms: boolean
): string {
  const inputPorts = variables.map(v => v.toLowerCase()).join(", ");
  const outputPorts = outputs.map(o => o.name.toLowerCase()).join(", ");
  let verilog = "module boolean_simplifier(\n";
  verilog += "  input " + inputPorts + ",\n";
  verilog += "  output reg " + outputPorts + "\n";
  verilog += ");\n\n";
  if (useSharedTerms && sharedTerms.length > 0) {
    verilog += "  // Shared term definitions\n";
    for (let i = 0; i < sharedTerms.length; i++) {
      const term = sharedTerms[i];
      const termName = "term_" + i;
      const expr = binaryToVerilogExpression(term.binary, variables);
      verilog += "  wire " + termName + ";\n";
      verilog += "  assign " + termName + " = " + expr + ";\n";
    }
    verilog += "\n";
  }
  verilog += "  always @(*)\n";
  verilog += "  begin\n";
  for (const output of outputs) {
    const outName = output.name.toLowerCase();
    if (output.expression === "0") {
      verilog += "    " + outName + " = 1'b0;\n";
    } else if (output.expression === "1") {
      verilog += "    " + outName + " = 1'b1;\n";
    } else {
      let expr: string;
      if (useSharedTerms && sharedTerms.length > 0) {
        const used: string[] = [];
        for (let i = 0; i < sharedTerms.length; i++) {
          if (sharedTerms[i].usedBy.includes(output.name)) used.push("term_" + i);
        }
        const usedBins = sharedTerms.filter(t => t.usedBy.includes(output.name)).map(t => t.binary);
        const standalone = output.essentialPrimes.filter(p => !usedBins.includes(p.binary)).map(p => binaryToVerilogExpression(p.binary, variables));
        expr = [...used, ...standalone].join(" | ");
      } else {
        const terms = output.essentialPrimes.map(p => binaryToVerilogExpression(p.binary, variables));
        expr = terms.join(" | ");
      }
      verilog += "    " + outName + " = " + expr + ";\n";
    }
  }
  verilog += "  end\n\n";
  verilog += "endmodule\n";
  return verilog;
}

export function multiOutputSimplify(
  variableCount: number,
  outputs: OutputFunction[],
  shareTerms: boolean
): MultiOutputResult {
  const variables = "ABCDEFGHIJKL".slice(0, variableCount).split("");
  const steps: SimplifyStep[] = [];
  const outputResults: { name: string; expression: string; primeImplicants: PrimeImplicant[]; essentialPrimes: PrimeImplicant[] }[] = [];

  steps.push({
    description: "Multi-Output Simplification Start",
    content: "Processing " + outputs.length + " output functions with " + variableCount + " variables. Term sharing: " + (shareTerms ? "enabled" : "disabled"),
  });

  const allPrimeImplicants: Map<string, { binary: string; usedBy: string[] }> = new Map();

  for (const output of outputs) {
    const result = simplify(output.minterms, output.dontCare, variableCount);
    outputResults.push({
      name: output.name,
      expression: result.expression,
      primeImplicants: result.primeImplicants,
      essentialPrimes: result.essentialPrimes,
    });

    steps.push({
      description: "Processed output: " + output.name,
      content: "Expression: " + output.name + " = " + result.expression + " | Prime implicants: " + result.primeImplicants.length,
    });

    for (const pi of result.essentialPrimes) {
      if (!allPrimeImplicants.has(pi.binary)) {
        allPrimeImplicants.set(pi.binary, { binary: pi.binary, usedBy: [] });
      }
      const entry = allPrimeImplicants.get(pi.binary)!;
      if (!entry.usedBy.includes(output.name)) {
        entry.usedBy.push(output.name);
      }
    }
  }

  const sharedTerms: { binary: string; expression: string; usedBy: string[] }[] = [];

  if (shareTerms) {
    for (const [binary, entry] of allPrimeImplicants) {
      if (entry.usedBy.length >= 2) {
        sharedTerms.push({
          binary,
          expression: binaryToExpression(binary, variables),
          usedBy: [...entry.usedBy],
        });
      }
    }
    steps.push({
      description: "Shared Prime Implicants Found",
      content: "Found " + sharedTerms.length + " prime implicants shared by 2 or more outputs",
    });
  }

  const verilogOutputs = outputResults.map(o => ({
    name: o.name,
    expression: o.expression,
    essentialPrimes: o.essentialPrimes,
  }));

  const verilog = generateVerilog(variables, verilogOutputs, sharedTerms, shareTerms);

  steps.push({
    description: "Multi-Output Simplification Complete",
    content: "Generated Verilog module with " + outputs.length + " outputs" + (shareTerms ? " and " + sharedTerms.length + " shared terms" : ""),
  });

  return {
    success: true,
    outputs: outputResults,
    sharedTerms,
    verilog,
    steps,
  };
}
