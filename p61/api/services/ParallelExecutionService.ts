import { ActionStep, ExecutionResult, TestDataRow, DataDrivenExecutionResult } from '../../shared/types.ts';
import seleniumService from './SeleniumService.ts';
import csvParserService from './CSVParserService.ts';
import junitReportService from './JUnitReportService.ts';

export class ParallelExecutionService {
  async executeSequential(
    url: string,
    baseSteps: ActionStep[],
    testDataList: TestDataRow[]
  ): Promise<DataDrivenExecutionResult> {
    const startTime = Date.now();
    const results: (ExecutionResult & { testData: TestDataRow })[] = [];

    for (let i = 0; i < testDataList.length; i++) {
      const testData = testDataList[i];
      const steps = csvParserService.replaceVariables(baseSteps, testData);
      const result = await seleniumService.executeSteps(url, steps);
      results.push({ ...result, testData, testIndex: i });
    }

    const duration = Date.now() - startTime;
    const { xml } = junitReportService.generateDataDrivenReport(
      'DataDrivenTest',
      results,
      duration
    );

    return {
      totalTests: testDataList.length,
      passedTests: results.filter((r) => r.success).length,
      failedTests: results.filter((r) => !r.success).length,
      duration,
      results,
      junitReport: xml,
    };
  }

  async executeParallel(
    url: string,
    baseSteps: ActionStep[],
    testDataList: TestDataRow[],
    maxConcurrency: number = 3
  ): Promise<DataDrivenExecutionResult> {
    const startTime = Date.now();
    const results: (ExecutionResult & { testData: TestDataRow })[] = [];
    const queue = [...testDataList];
    let activeWorkers = 0;
    let completedCount = 0;

    return new Promise((resolve) => {
      const processNext = async () => {
        while (queue.length > 0 && activeWorkers < maxConcurrency) {
          const testData = queue.shift()!;
          const testIndex = testDataList.indexOf(testData);
          activeWorkers++;

          (async () => {
            try {
              const steps = csvParserService.replaceVariables(baseSteps, testData);
              const result = await seleniumService.executeSteps(url, steps);
              results[testIndex] = { ...result, testData, testIndex };
            } catch (error: any) {
              results[testIndex] = {
                success: false,
                logs: [`[ERROR] ${error.message}`],
                duration: 0,
                error: error.message,
                testData,
                testIndex,
              };
            } finally {
              activeWorkers--;
              completedCount++;
              processNext();
            }
          })();
        }

        if (completedCount === testDataList.length) {
          const duration = Date.now() - startTime;
          const { xml } = junitReportService.generateDataDrivenReport(
            'DataDrivenTest',
            results.filter(Boolean),
            duration
          );

          resolve({
            totalTests: testDataList.length,
            passedTests: results.filter((r) => r?.success).length,
            failedTests: results.filter((r) => r && !r.success).length,
            duration,
            results: results.filter(Boolean),
            junitReport: xml,
          });
        }
      };

      processNext();
    });
  }

  async execute(
    url: string,
    steps: ActionStep[],
    testDataList: TestDataRow[],
    parallel: boolean = false,
    maxConcurrency: number = 3
  ): Promise<DataDrivenExecutionResult> {
    if (testDataList.length === 0) {
      const result = await seleniumService.executeSteps(url, steps);
      return {
        totalTests: 1,
        passedTests: result.success ? 1 : 0,
        failedTests: result.success ? 0 : 1,
        duration: result.duration,
        results: [{ ...result, testData: {} }],
      };
    }

    if (parallel) {
      return this.executeParallel(url, steps, testDataList, maxConcurrency);
    } else {
      return this.executeSequential(url, steps, testDataList);
    }
  }

  async generateDataDrivenScript(
    url: string,
    steps: ActionStep[],
    testData: TestDataRow[],
    language: 'python' | 'javascript'
  ): Promise<string> {
    if (language === 'python') {
      return junitReportService.generatePythonScriptWithReporting(url, steps, testData);
    }
    return this.generateJavaScriptDataDrivenScript(url, steps, testData);
  }

  private generateJavaScriptDataDrivenScript(
    url: string,
    steps: ActionStep[],
    testData: TestDataRow[]
  ): string {
    return `const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const { execSync } = require('child_process');

const testDataList = ${JSON.stringify(testData, null, 2)};
const results = [];

async function runTest(testData, index) {
  let driver;
  const startTime = Date.now();
  const logs = [];
  
  try {
    let options = new chrome.Options();
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();
    
    const wait = driver.wait.bind(driver);
    await driver.manage().window().maximize();
    await driver.get("${this.escapeQuotes(url)}");
    
${this.generateStepCode(steps)}
    
    const duration = Date.now() - startTime;
    return {
      name: \`Test \${index + 1}\`,
      success: true,
      duration: duration / 1000,
      logs: logs.join('\\n')
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      name: \`Test \${index + 1}\`,
      success: false,
      duration: duration / 1000,
      error: error.message,
      logs: logs.join('\\n') + '\\n' + error.stack
    };
  } finally {
    if (driver) await driver.quit();
  }
}

async function runAllTests() {
  for (let i = 0; i < testDataList.length; i++) {
    console.log(\`Running test \${i + 1}/\${testDataList.length}\`);
    const result = await runTest(testDataList[i], i);
    results.push(result);
    console.log(\`  \${result.success ? 'PASS' : 'FAIL'}: \${result.name} (\${result.duration.toFixed(2)}s)\`);
  }
  
  generateJUnitReport(results);
  console.log('\\nJUnit report generated: junit-report.xml');
}

function generateJUnitReport(results) {
  const failures = results.filter(r => !r.success).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\\n';
  xml += \`<testsuite name="DataDrivenTests" tests="\${results.length}" failures="\${failures}" time="\${totalTime.toFixed(3)}">\\n\`;
  
  results.forEach(r => {
    xml += \`  <testcase name="\${r.name}" time="\${r.duration.toFixed(3)}">\\n\`;
    if (!r.success) {
      xml += \`    <failure message="\${r.error.replace(/"/g, '&quot;')}">\`;
      xml += \`<![CDATA[\${r.logs}]]></failure>\\n\`;
    }
    xml += '  </testcase>\\n';
  });
  
  xml += '</testsuite>';
  
  fs.writeFileSync('junit-report.xml', xml);
}

runAllTests().catch(console.error);
`;
  }

  private generateStepCode(steps: ActionStep[]): string {
    return steps
      .map((step, i) => {
        let code = `    // Step ${i + 1}: ${step.type}\n`;
        const selector = this.escapeQuotes(step.selector);

        if (step.type === 'click') {
          code += `    let el${i} = await wait.until(until.elementLocated(By.css("${selector}")), 10000);\n`;
          code += `    await el${i}.click();\n`;
        } else if (step.type === 'input') {
          code += `    let el${i} = await wait.until(until.elementLocated(By.css("${selector}")), 10000);\n`;
          code += `    await el${i}.sendKeys(testData["${this.escapeQuotes(step.value || '')}"]);\n`;
        }
        return code;
      })
      .join('');
  }

  private escapeQuotes(str: string): string {
    return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}

export default new ParallelExecutionService();
