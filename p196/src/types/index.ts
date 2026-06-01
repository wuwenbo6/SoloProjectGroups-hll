export interface PrimeImplicant {
  binary: string;
  minterms: number[];
  isEssential: boolean;
}

export interface SimplifyStep {
  description: string;
  content: string;
}

export interface SimplifyResponse {
  success: boolean;
  expression: string;
  primeImplicants: PrimeImplicant[];
  essentialPrimes: PrimeImplicant[];
  steps: SimplifyStep[];
  error?: string;
}

export interface SharedTerm {
  binary: string;
  expression: string;
  usedBy: string[];
}

export interface OutputResult {
  name: string;
  expression: string;
  primeImplicants: PrimeImplicant[];
  essentialPrimes: PrimeImplicant[];
}

export interface MultiOutputResponse {
  success: boolean;
  outputs: OutputResult[];
  sharedTerms: SharedTerm[];
  verilog: string;
  steps: SimplifyStep[];
  error?: string;
}

export type CellValue = 0 | 1 | 2;

export type InputType = 'truthTable' | 'sumOfProducts';

export type OutputMode = 'single' | 'multi';

export const VARIABLE_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
