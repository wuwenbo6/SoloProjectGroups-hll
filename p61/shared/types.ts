export type ActionType = 'click' | 'input' | 'navigate' | 'wait' | 'waitForElement' | 'waitForNetworkIdle';
export type SelectorType = 'css' | 'xpath' | 'id' | 'name' | 'text' | 'containsText' | 'linkText';

export interface AlternativeSelector {
  selector: string;
  selectorType: SelectorType;
  confidence: number;
}

export interface ActionStep {
  id: string;
  type: ActionType;
  selector: string;
  selectorType: SelectorType;
  value?: string;
  timestamp: number;
  elementDescription?: string;
  alternativeSelectors?: AlternativeSelector[];
  waitOptions?: {
    timeout?: number;
    retries?: number;
    retryInterval?: number;
    waitForStable?: boolean;
  };
}

export interface TestCase {
  id: string;
  name: string;
  description: string;
  url: string;
  steps: ActionStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionResult {
  success: boolean;
  screenshot?: string;
  logs: string[];
  duration: number;
  error?: string;
  testName?: string;
  testIndex?: number;
}

export interface SelectorStrategy {
  priority: SelectorType[];
}

export type ScriptLanguage = 'python' | 'javascript';

export interface TestDataRow {
  [key: string]: string;
}

export interface DataDrivenConfig {
  enabled: boolean;
  csvContent?: string;
  testData: TestDataRow[];
  variableMapping: {
    stepId: string;
    variableName: string;
  }[];
  parallel: boolean;
  maxConcurrency: number;
}

export interface DataDrivenExecutionResult {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
  results: (ExecutionResult & { testData: TestDataRow })[];
  junitReport?: string;
}

export interface JUnitTestCase {
  name: string;
  classname: string;
  time: number;
  failure?: {
    message: string;
    type: string;
    content: string;
  };
  systemOut?: string;
}

export interface JUnitTestSuite {
  name: string;
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  time: number;
  timestamp: string;
  testcases: JUnitTestCase[];
}

export interface JUnitReport {
  testsuites: JUnitTestSuite[];
}
