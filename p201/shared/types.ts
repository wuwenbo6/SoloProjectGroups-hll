export interface KconfigNode {
  id: string;
  type: 'config' | 'menu' | 'choice' | 'comment';
  name?: string;
  prompt?: string;
  help?: string;
  configType?: 'bool' | 'tristate' | 'string' | 'int' | 'hex';
  defaultValue?: string;
  dependsOn?: string[];
  select?: string[];
  implies?: string[];
  children?: KconfigNode[];
  choiceOptions?: KconfigNode[];
  optional?: boolean;
}

export interface KconfigSymbol {
  name: string;
  type: 'bool' | 'tristate' | 'string' | 'int' | 'hex';
  value: string | boolean;
  dependencies: string[];
  reverseDependencies: string[];
  selectedBy: string[];
  impliedBy: string[];
  prompt?: string;
  help?: string;
  defaultValue?: string;
}

export interface KconfigParseResult {
  tree: KconfigNode[];
  symbols: Record<string, KconfigSymbol>;
}

export interface ConfigValue {
  [symbolName: string]: string | boolean | number;
}

export interface DependencyCheckResult {
  valid: boolean;
  unmetDeps: string[];
}

export type DiffType = 'added' | 'removed' | 'modified' | 'unchanged';

export interface DiffItem {
  name: string;
  type: DiffType;
  currentValue: string | boolean | number | undefined;
  referenceValue: string | boolean | number | undefined;
}

export interface DiffResult {
  items: DiffItem[];
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchangedCount: number;
}

export interface MinimalConfigResult {
  values: ConfigValue;
  removedCount: number;
  keptCount: number;
  removedSymbols: string[];
  config: string;
}
