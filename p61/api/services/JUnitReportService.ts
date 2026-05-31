import {
  JUnitReport,
  JUnitTestSuite,
  JUnitTestCase,
  ExecutionResult,
  TestDataRow,
} from '../../shared/types.ts';

export class JUnitReportService {
  generateReport(
    testSuiteName: string,
    results: (ExecutionResult & { testData: TestDataRow; testName: string })[],
    totalDuration: number
  ): JUnitReport {
    const testcases: JUnitTestCase[] = results.map((result) => ({
      name: result.testName,
      classname: testSuiteName,
      time: result.duration / 1000,
      failure: !result.success
        ? {
            message: result.error || 'Test failed',
            type: 'AssertionError',
            content: result.logs.join('\n'),
          }
        : undefined,
      systemOut: result.logs.join('\n'),
    }));

    const testSuite: JUnitTestSuite = {
      name: testSuiteName,
      tests: results.length,
      failures: results.filter((r) => !r.success).length,
      errors: 0,
      skipped: 0,
      time: totalDuration / 1000,
      timestamp: new Date().toISOString(),
      testcases,
    };

    return {
      testsuites: [testSuite],
    };
  }

  generateXML(report: JUnitReport): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';

    report.testsuites.forEach((suite) => {
      xml += `<testsuite name="${this.escapeXML(suite.name)}" tests="${suite.tests}" failures="${suite.failures}" errors="${suite.errors}" skipped="${suite.skipped}" time="${suite.time.toFixed(3)}" timestamp="${suite.timestamp}">\n`;

      suite.testcases.forEach((tc) => {
        xml += `  <testcase name="${this.escapeXML(tc.name)}" classname="${this.escapeXML(tc.classname)}" time="${tc.time.toFixed(3)}">\n`;

        if (tc.failure) {
          xml += `    <failure message="${this.escapeXML(tc.failure.message)}" type="${this.escapeXML(tc.failure.type)}">\n`;
          xml += `<![CDATA[${tc.failure.content}]]>\n`;
          xml += `    </failure>\n`;
        }

        if (tc.systemOut) {
          xml += `    <system-out><![CDATA[${tc.systemOut}]]></system-out>\n`;
        }

        xml += `  </testcase>\n`;
      });

      xml += `</testsuite>\n`;
    });

    return xml;
  }

  generateDataDrivenReport(
    baseTestCaseName: string,
    results: (ExecutionResult & { testData: TestDataRow })[],
    totalDuration: number
  ): { report: JUnitReport; xml: string } {
    const namedResults = results.map((result, index) => ({
      ...result,
      testName: this.generateTestName(baseTestCaseName, result.testData, index),
    }));

    const report = this.generateReport(baseTestCaseName, namedResults, totalDuration);
    const xml = this.generateXML(report);

    return { report, xml };
  }

  private generateTestName(baseName: string, testData: TestDataRow, index: number): string {
    const dataKeys = Object.keys(testData);
    if (dataKeys.length > 0) {
      const dataStr = dataKeys.map((k) => `${k}=${testData[k]}`).join(', ');
      return `${baseName} [${index + 1}] - ${dataStr}`;
    }
    return `${baseName} [${index + 1}]`;
  }

  private escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  generatePythonScriptWithReporting(
    url: string,
    steps: any[],
    testData: any[]
  ): string {
    return `import unittest
import csv
import io
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import xml.etree.ElementTree as ET
from xml.dom import minidom

class DataDrivenTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.driver = webdriver.Chrome()
        cls.driver.maximize_window()
        cls.wait = WebDriverWait(cls.driver, 15)
        cls.test_results = []

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()
        cls.generate_junit_report()

    @classmethod
    def generate_junit_report(cls):
        testsuite = ET.Element('testsuite')
        testsuite.set('name', 'DataDrivenTests')
        testsuite.set('tests', str(len(cls.test_results)))
        
        total_time = sum(r.get('duration', 0) for r in cls.test_results)
        testsuite.set('time', f"{total_time:.3f}")
        testsuite.set('failures', str(len([r for r in cls.test_results if not r.get('success', True)])))
        
        for result in cls.test_results:
            testcase = ET.SubElement(testsuite, 'testcase')
            testcase.set('name', result.get('name', 'unknown'))
            testcase.set('time', f"{result.get('duration', 0):.3f}")
            
            if not result.get('success', True):
                failure = ET.SubElement(testcase, 'failure')
                failure.set('message', result.get('error', 'Test failed'))
                failure.text = result.get('logs', '')
        
        xml_str = ET.tostring(testsuite, encoding='unicode')
        pretty_xml = minidom.parseString(xml_str).toprettyxml(indent='  ')
        
        with open('junit-report.xml', 'w', encoding='utf-8') as f:
            f.write(pretty_xml)

def run_test(test_data):
    driver = DataDrivenTest.driver
    wait = DataDrivenTest.wait
    start_time = time.time()
    logs = []
    
    try:
        driver.get("${this.escapeXML(url)}")
        time.sleep(1)
        
${this.generatePythonTestSteps(steps)}
        
        duration = time.time() - start_time
        return {'success': True, 'duration': duration, 'logs': '\\n'.join(logs)}
    except Exception as e:
        duration = time.time() - start_time
        return {'success': False, 'duration': duration, 'logs': str(e), 'error': str(e)}

test_data_list = ${JSON.stringify(testData, null, 4).replace(/"(\w+)":/g, "'\\1':")}

for i, test_data in enumerate(test_data_list):
    def make_test(data, index):
        def test(self):
            result = run_test(data)
            result['name'] = f"test_case_{index + 1}"
            DataDrivenTest.test_results.append(result)
            self.assertTrue(result['success'], result.get('error', ''))
        return test
    
    test_name = f"test_data_{i + 1}"
    setattr(DataDrivenTest, test_name, make_test(test_data, i))

if __name__ == '__main__':
    unittest.main(verbosity=2)
`;
  }

  private generatePythonTestSteps(steps: any[]): string {
    return steps.map((step, i) => {
      return `        # Step ${i + 1}: ${step.type}
        element = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "${this.escapeXML(step.selector)}")))
        ${step.type === 'click' ? 'element.click()' : `element.send_keys("${this.escapeXML(step.value || '')}")`}`;
    }).join('\n\n');
  }
}

export default new JUnitReportService();
