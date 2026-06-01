const fs = require('fs');

const espressoCode = `export interface PrimeImplicant {
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
  expression: string;
  primeImplicants: PrimeImplicant[];
  essentialPrimes: PrimeImplicant[];
}

export interface MultiOutputRequest {
  variableCount: number;
  outputs: Array<{
    name: string;
    minterms: number[];
    dontCare: number[];
  }>;
  useSharedTerms?: boolean;
}

export interface MultiOutputResult {
  outputs: OutputFunction[];
  sharedTerms: PrimeImplicant[];
  verilog: string;
  steps: SimplifyStep[];
}

const VARIABLES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export function numToBinary(num: number, bits: number): string {
  return num.toString(2).padStart(bits, '0');
}

export function binaryToNum(binary: string): number {
  return parseInt(binary, 2);
}

export function binaryToExpression(binary: string, variables: string[] = VARIABLES): string {
  const terms: string[] = [];
  for (let i = 0; i < binary.length; i++) {
    const bit = binary[i];
    const variable = variables[i] || \`X\${i}\`;
    if (bit === '0') {
      terms.push(\`\${variable}'\`);
    } else if (bit === '1') {
      terms.push(variable);
    }
  }
  return terms.join('');
}

export function binaryToVerilogExpression(binary: string, variables: string[] = VARIABLES): string {
  const terms: string[] = [];
  for (let i = 0; i < binary.length; i++) {
    const bit = binary[i];
    const variable = variables[i] || \`x[\${i}]\`;
    if (bit === '0') {
      terms.push(\`~\${variable}\`);
    } else if (bit === '1') {
      terms.push(variable);
    }
  }
  if (terms.length === 0) {
    return "1'b1";
  }
  return terms.join(' & ');
}

export function getMinterms(cube: string, numVars: number): number[] {
  const wildcardPositions: number[] = [];
  for (let i = 0; i < cube.length; i++) {
    if (cube[i] === '-') {
      wildcardPositions.push(i);
    }
  }

  const baseBinary = cube.replace(/-/g, '0');
  const baseNum = binaryToNum(baseBinary);
  const numWildcards = wildcardPositions.length;
  const numCombinations = 1 << numWildcards;
  const minterms: number[] = [];

  for (let combo = 0; combo < numCombinations; combo++) {
    let minterm = baseNum;
    for (let w = 0; w < numWildcards; w++) {
      if (combo & (1 << (numWildcards - 1 - w))) {
        const bitPosition = numVars - 1 - wildcardPositions[w];
        minterm |= (1 << bitPosition);
      }
    }
    minterms.push(minterm);
  }

  return minterms.sort((a, b) => a - b);
}

export function combine(cube1: string, cube2: string): string | null {
  if (cube1.length !== cube2.length) {
    return null;
  }

  let diffCount = 0;
  let diffPosition = -1;

  for (let i = 0; i < cube1.length; i++) {
    const b1 = cube1[i];
    const b2 = cube2[i];

    if (b1 === '-' || b2 === '-') {
      if (b1 !== b2) {
        return null;
      }
    } else if (b1 !== b2) {
      diffCount++;
      diffPosition = i;
      if (diffCount > 1) {
        return null;
      }
    }
  }

  if (diffCount !== 1) {
    return null;
  }

  const chars = cube1.split('');
  chars[diffPosition] = '-';
  return chars.join('');
}

export function expandCube(
  cube: string,
  onSet: Set<number>,
  dcSet: Set<number>,
  numVars: number
): string {
  let current = cube;
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < current.length; i++) {
      if (current[i] === '-') {
        continue;
      }

      const chars = current.split('');
      chars[i] = '-';
      const candidate = chars.join('');
      const candidateMinterms = getMinterms(candidate, numVars);

      const allValid = candidateMinterms.every(m => onSet.has(m) || dcSet.has(m));
      const hasOnSet = candidateMinterms.some(m => onSet.has(m));

      if (allValid && hasOnSet) {
        current = candidate;
        changed = true;
      }
    }
  }

  return current;
}
`;

fs.writeFileSync('/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p196/api/services/espresso.ts', espressoCode);
console.log('Part 1 written successfully');
