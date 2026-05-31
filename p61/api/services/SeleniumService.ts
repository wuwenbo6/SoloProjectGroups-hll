import { Builder, By, until, WebDriver, WebElement } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { ExecutionResult, ActionStep, SelectorType } from '../../shared/types.ts';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SeleniumService {
  private async createDriver(): Promise<WebDriver> {
    const options = new chrome.Options();
    options.addArguments('--headless=new');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--window-size=1920,1080');
    options.addArguments('--disable-blink-features=AutomationControlled');

    return new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();
  }

  private async getLocator(selector: string, selectorType: SelectorType): Promise<By> {
    switch (selectorType) {
      case 'id':
        return By.id(selector);
      case 'name':
        return By.name(selector);
      case 'css':
        return By.css(selector);
      case 'xpath':
        return By.xpath(selector);
      case 'text':
        return By.xpath(`//*[text()="${selector}"]`);
      case 'containsText':
        return By.xpath(`//*[contains(text(), "${selector}")]`);
      case 'linkText':
        return By.linkText(selector);
      default:
        return By.css(selector);
    }
  }

  private async findElementWithFallback(
    driver: WebDriver,
    step: ActionStep,
    logs: string[]
  ): Promise<WebElement | null> {
    const allSelectors = [
      { selector: step.selector, type: step.selectorType },
      ...(step.alternativeSelectors || []),
    ];

    for (let i = 0; i < allSelectors.length; i++) {
      const alt = allSelectors[i];
      try {
        const locator = await this.getLocator(alt.selector, alt.type);
        const element = await driver.wait(until.elementLocated(locator), 3000);
        await driver.wait(until.elementIsVisible(element), 2000);

        if (i > 0) {
          logs.push(`[INFO] 使用备选定位器成功: ${alt.type}=${alt.selector}`);
        }

        return element;
      } catch (e) {
        if (i === 0) {
          logs.push(`[WARN] 主定位器失败: ${step.selectorType}=${step.selector}`);
        }
        if (i < allSelectors.length - 1) {
          logs.push(`[INFO] 尝试备选定位器 ${i + 1}: ${alt.type}=${alt.selector}`);
        }
      }
    }

    return null;
  }

  private async waitForNetworkIdle(driver: WebDriver, timeout: number = 5000): Promise<void> {
    try {
      await driver.executeAsyncScript((timeoutMs: number, done: () => void) => {
        if (typeof (window as any).jQuery !== 'undefined') {
          const checkAjax = () => {
            if ((window as any).jQuery.active === 0) {
              done();
            } else {
              setTimeout(checkAjax, 100);
            }
          };
          setTimeout(checkAjax, 50);
        } else {
          setTimeout(done, 500);
        }
      }, timeout);
    } catch {
      await driver.sleep(500);
    }
  }

  private async waitForElementStable(
    driver: WebDriver,
    element: WebElement,
    duration: number = 300
  ): Promise<void> {
    try {
      const initialRect = await element.getRect();
      await driver.sleep(duration);
      const finalRect = await element.getRect();

      if (
        initialRect.x !== finalRect.x ||
        initialRect.y !== finalRect.y ||
        initialRect.width !== finalRect.width ||
        initialRect.height !== finalRect.height
      ) {
        await this.waitForElementStable(driver, element, duration);
      }
    } catch {
      await driver.sleep(duration);
    }
  }

  private async executeWithRetry(
    driver: WebDriver,
    step: ActionStep,
    logs: string[],
    stepIndex: number
  ): Promise<boolean> {
    const retries = step.waitOptions?.retries ?? 3;
    const retryInterval = step.waitOptions?.retryInterval ?? 500;
    const timeout = step.waitOptions?.timeout ?? 15000;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          logs.push(`[RETRY] 第 ${attempt} 次重试...`);
          await driver.sleep(retryInterval);
        }

        const startTime = Date.now();
        let element: WebElement | null = null;

        if (step.type !== 'navigate' && step.type !== 'wait') {
          element = await this.findElementWithFallback(driver, step, logs);

          if (!element) {
            throw new Error('所有定位器都失败了');
          }

          if (step.waitOptions?.waitForStable) {
            await this.waitForElementStable(driver, element, 200);
          }
        }

        switch (step.type) {
          case 'click': {
            if (element) {
              await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"})', element);
              await driver.wait(until.elementIsEnabled(element), 3000);
              await element.click();
              logs.push(`[STEP ${stepIndex + 1}] 点击成功`);
            }
            break;
          }
          case 'input': {
            if (element) {
              await driver.executeScript('arguments[0].scrollIntoView({block: "center", behavior: "smooth"})', element);
              await element.clear();
              await element.sendKeys(step.value || '');
              logs.push(`[STEP ${stepIndex + 1}] 输入成功: ${step.value}`);
            }
            break;
          }
          case 'wait': {
            const waitTime = parseInt(step.value || '1000');
            await driver.sleep(waitTime);
            logs.push(`[STEP ${stepIndex + 1}] 等待 ${waitTime}ms`);
            break;
          }
          case 'waitForElement': {
            if (element) {
              logs.push(`[STEP ${stepIndex + 1}] 元素已出现`);
            }
            break;
          }
          case 'waitForNetworkIdle': {
            await this.waitForNetworkIdle(driver, timeout);
            logs.push(`[STEP ${stepIndex + 1}] 网络已空闲`);
            break;
          }
          case 'navigate': {
            await driver.get(step.value || '');
            logs.push(`[STEP ${stepIndex + 1}] 导航到: ${step.value}`);
            break;
          }
        }

        await this.waitForNetworkIdle(driver, 2000);
        return true;

      } catch (error: any) {
        if (attempt === retries) {
          throw error;
        }
      }
    }

    return false;
  }

  async executeSteps(url: string, steps: ActionStep[]): Promise<ExecutionResult> {
    const logs: string[] = [];
    const startTime = Date.now();
    let driver: WebDriver | null = null;

    try {
      logs.push('[INFO] 初始化Chrome浏览器...');
      driver = await this.createDriver();

      logs.push(`[INFO] 导航到: ${url}`);
      await driver.get(url);

      await this.waitForNetworkIdle(driver, 5000);

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        logs.push(`[STEP ${i + 1}] 执行: ${step.type} - ${step.selectorType}=${step.selector}`);

        await this.executeWithRetry(driver, step, logs, i);
      }

      logs.push('[INFO] 执行完成，正在截图...');
      const screenshot = await driver.takeScreenshot();

      const screenshotsDir = path.join(__dirname, '../../screenshots');
      try {
        await fs.access(screenshotsDir);
      } catch {
        await fs.mkdir(screenshotsDir, { recursive: true });
      }

      const screenshotPath = path.join(screenshotsDir, `screenshot_${Date.now()}.png`);
      await fs.writeFile(screenshotPath, Buffer.from(screenshot, 'base64'));
      logs.push(`[INFO] 截图已保存: ${screenshotPath}`);

      return {
        success: true,
        screenshot: `data:image/png;base64,${screenshot}`,
        logs,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      logs.push(`[ERROR] ${error.message}`);
      console.error('Selenium execution error:', error);

      let screenshot: string | undefined;
      if (driver) {
        try {
          screenshot = await driver.takeScreenshot();
          screenshot = `data:image/png;base64,${screenshot}`;
        } catch (e) {
          console.error('Failed to take error screenshot:', e);
        }
      }

      return {
        success: false,
        screenshot,
        logs,
        duration: Date.now() - startTime,
        error: error.message,
      };
    } finally {
      if (driver) {
        logs.push('[INFO] 关闭浏览器...');
        await driver.quit();
      }
    }
  }

  async generatePythonScript(url: string, steps: ActionStep[]): Promise<string> {
    let script = `from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

# 初始化Chrome浏览器
options = webdriver.ChromeOptions()
# options.add_argument('--headless=new')  # 取消注释以启用无头模式
driver = webdriver.Chrome(options=options)
driver.maximize_window()
wait = WebDriverWait(driver, 15)

def find_element_with_fallback(driver, primary_by, alternative_selectors):
    """尝试主定位器，如果失败则尝试备选定位器"""
    all_selectors = [(primary_by, "primary")] + [
        (get_by_locator(sel_type, sel), f"alt_{i}")
        for i, (sel_type, sel) in enumerate(alternative_selectors)
    ]
    
    for by, name in all_selectors:
        try:
            element = wait.until(EC.element_to_be_clickable(by))
            return element
        except Exception:
            continue
    raise Exception("所有定位器都失败了")

def get_by_locator(selector_type, selector):
    if selector_type == 'id':
        return By.ID, selector
    elif selector_type == 'name':
        return By.NAME, selector
    elif selector_type == 'css':
        return By.CSS_SELECTOR, selector
    elif selector_type == 'xpath':
        return By.XPATH, selector
    elif selector_type == 'text':
        return By.XPATH, f'//*[text()="{selector}"]'
    elif selector_type == 'containsText':
        return By.XPATH, f'//*[contains(text(), "{selector}")]'
    elif selector_type == 'linkText':
        return By.LINK_TEXT, selector
    return By.CSS_SELECTOR, selector

try:
    # 导航到目标页面
    driver.get("${this.escapeQuotes(url)}")
    time.sleep(1)

`;

    steps.forEach((step, index) => {
      script += `    # Step ${index + 1}: ${step.type} - ${step.elementDescription || step.selector}\n`;

      const byLocator = this.getPythonByLocator(step);

      if (step.alternativeSelectors && step.alternativeSelectors.length > 0) {
        const alts = step.alternativeSelectors.map((a) => `("${a.type}", "${this.escapeQuotes(a.selector)}")`).join(', ');
        script += `    alternatives = [${alts}]\n`;
        script += `    element = find_element_with_fallback(driver, ${byLocator}, alternatives)\n`;
      } else {
        switch (step.type) {
          case 'click':
            script += `    element = wait.until(EC.element_to_be_clickable((${byLocator})))\n`;
            break;
          case 'input':
            script += `    element = wait.until(EC.visibility_of_element_located((${byLocator})))\n`;
            break;
          default:
            script += `    element = wait.until(EC.presence_of_element_located((${byLocator})))\n`;
        }
      }

      switch (step.type) {
        case 'click':
          script += `    driver.execute_script("arguments[0].scrollIntoView({block: 'center'})", element)\n`;
          script += `    element.click()\n`;
          break;
        case 'input':
          script += `    driver.execute_script("arguments[0].scrollIntoView({block: 'center'})", element)\n`;
          script += `    element.clear()\n`;
          script += `    element.send_keys("${this.escapeQuotes(step.value || '')}")\n`;
          break;
        case 'wait':
          script += `    time.sleep(${(parseInt(step.value || '1000') / 1000).toFixed(1)})\n`;
          break;
        case 'waitForNetworkIdle':
          script += `    time.sleep(1)\n`;
          break;
        case 'navigate':
          script += `    driver.get("${this.escapeQuotes(step.value || '')}")\n`;
          break;
      }
      script += `    time.sleep(0.5)\n\n`;
    });

    script += `    # 截图保存
    driver.save_screenshot("result.png")
    print("执行完成！截图已保存为 result.png")

finally:
    # 关闭浏览器
    time.sleep(2)
    driver.quit()
`;

    return script;
  }

  async generateJavaScriptScript(url: string, steps: ActionStep[]): Promise<string> {
    let script = `const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function findElementWithFallback(driver, wait, primaryBy, alternativeSelectors) {
  const allSelectors = [
    { by: primaryBy, name: 'primary' },
    ...alternativeSelectors.map((s, i) => ({ by: getByLocator(s.type, s.selector), name: \`alt_\${i}\` }))
  ];
  
  for (const { by, name } of allSelectors) {
    try {
      const element = await wait.until(until.elementLocated(by));
      await wait.until(until.elementIsVisible(element));
      return element;
    } catch (e) {
      continue;
    }
  }
  throw new Error('所有定位器都失败了');
}

function getByLocator(type, selector) {
  switch (type) {
    case 'id': return By.id(selector);
    case 'name': return By.name(selector);
    case 'css': return By.css(selector);
    case 'xpath': return By.xpath(selector);
    case 'text': return By.xpath(\`//*[text()="\${selector}"]\`);
    case 'containsText': return By.xpath(\`//*[contains(text(), "\${selector}")]\`);
    case 'linkText': return By.linkText(selector);
    default: return By.css(selector);
  }
}

async function runTest() {
  // 初始化Chrome浏览器
  let options = new chrome.Options();
  // options.addArguments('--headless=new');  // 取消注释以启用无头模式
  
  let driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();
    
  const wait = driver.wait.bind(driver);
    
  try {
    await driver.manage().window().maximize();
    
    // 导航到目标页面
    await driver.get("${this.escapeQuotes(url)}");
    await driver.sleep(1000);

`;

    steps.forEach((step, index) => {
      script += `    // Step ${index + 1}: ${step.type} - ${step.elementDescription || step.selector}\n`;

      if (step.type === 'wait') {
        script += `    await driver.sleep(${step.value || '1000'});\n\n`;
        return;
      }

      if (step.type === 'navigate') {
        script += `    await driver.get("${this.escapeQuotes(step.value || '')}");\n`;
        script += `    await driver.sleep(500);\n\n`;
        return;
      }

      const byLocator = this.getJSByLocator(step);

      if (step.alternativeSelectors && step.alternativeSelectors.length > 0) {
        const alts = JSON.stringify(step.alternativeSelectors);
        script += `    let alternatives = ${alts};\n`;
        script += `    let element${index} = await findElementWithFallback(driver, driver.wait.bind(driver), ${byLocator}, alternatives);\n`;
      } else {
        script += `    let element${index} = await wait.until(until.elementLocated(${byLocator}), 10000);\n`;
        script += `    await wait.until(until.elementIsVisible(element${index}), 5000);\n`;
      }

      switch (step.type) {
        case 'click':
          script += `    await driver.executeScript("arguments[0].scrollIntoView({block: 'center'})", element${index});\n`;
          script += `    await element${index}.click();\n`;
          break;
        case 'input':
          script += `    await driver.executeScript("arguments[0].scrollIntoView({block: 'center'})", element${index});\n`;
          script += `    await element${index}.clear();\n`;
          script += `    await element${index}.sendKeys("${this.escapeQuotes(step.value || '')}");\n`;
          break;
      }
      script += `    await driver.sleep(500);\n\n`;
    });

    script += `    // 截图保存
    let screenshot = await driver.takeScreenshot();
    require('fs').writeFileSync('result.png', screenshot, 'base64');
    console.log("执行完成！截图已保存为 result.png");
    
  } catch (error) {
    console.error('执行失败:', error);
  } finally {
    // 关闭浏览器
    await driver.sleep(2000);
    await driver.quit();
  }
}

runTest();
`;

    return script;
  }

  private getPythonByLocator(step: ActionStep): string {
    switch (step.selectorType) {
      case 'id':
        return `By.ID, "${this.escapeQuotes(step.selector)}"`;
      case 'name':
        return `By.NAME, "${this.escapeQuotes(step.selector)}"`;
      case 'css':
        return `By.CSS_SELECTOR, "${this.escapeQuotes(step.selector)}"`;
      case 'xpath':
        return `By.XPATH, "${this.escapeQuotes(step.selector)}"`;
      case 'text':
        return `By.XPATH, '//*[text()="${this.escapeQuotes(step.selector)}"]'`;
      case 'containsText':
        return `By.XPATH, '//*[contains(text(), "${this.escapeQuotes(step.selector)}")]'`;
      case 'linkText':
        return `By.LINK_TEXT, "${this.escapeQuotes(step.selector)}"`;
      default:
        return `By.CSS_SELECTOR, "${this.escapeQuotes(step.selector)}"`;
    }
  }

  private getJSByLocator(step: ActionStep): string {
    switch (step.selectorType) {
      case 'id':
        return `By.id("${this.escapeQuotes(step.selector)}")`;
      case 'name':
        return `By.name("${this.escapeQuotes(step.selector)}")`;
      case 'css':
        return `By.css("${this.escapeQuotes(step.selector)}")`;
      case 'xpath':
        return `By.xpath("${this.escapeQuotes(step.selector)}")`;
      case 'text':
        return `By.xpath(\`//*[text()="${this.escapeQuotes(step.selector)}"]\`)`;
      case 'containsText':
        return `By.xpath(\`//*[contains(text(), "${this.escapeQuotes(step.selector)}")]\`)`;
      case 'linkText':
        return `By.linkText("${this.escapeQuotes(step.selector)}")`;
      default:
        return `By.css("${this.escapeQuotes(step.selector)}")`;
    }
  }

  private escapeQuotes(str: string): string {
    return str.replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/'/g, "\\'");
  }
}

export default new SeleniumService();
