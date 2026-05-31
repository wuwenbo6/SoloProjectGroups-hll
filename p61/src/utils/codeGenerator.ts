import { ActionStep, ScriptLanguage } from '../../shared/types';

export function generateScript(
  url: string,
  steps: ActionStep[],
  language: ScriptLanguage
): string {
  if (language === 'python') {
    return generatePythonScript(url, steps);
  }
  return generateJavaScriptScript(url, steps);
}

function generatePythonScript(url: string, steps: ActionStep[]): string {
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

def find_element_with_fallback(wait, primary_by, alternative_selectors):
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

def wait_for_network_idle(driver, timeout=5000):
    """等待网络空闲"""
    start = time.time()
    while time.time() - start < timeout / 1000:
        try:
            active = driver.execute_script("return window.jQuery ? window.jQuery.active : 0")
            if active == 0:
                break
        except:
            pass
        time.sleep(0.1)

try:
    # 导航到目标页面
    driver.get("${escapeQuotes(url)}")
    time.sleep(1)
    wait_for_network_idle(driver)

`;

  steps.forEach((step, index) => {
    script += `    # Step ${index + 1}: ${step.type} - ${step.elementDescription || step.selector}\n`;

    if (step.type === 'wait') {
      script += `    time.sleep(${(parseInt(step.value || '1000') / 1000).toFixed(1)})\n`;
      script += `    time.sleep(0.5)\n\n`;
      return;
    }

    if (step.type === 'navigate') {
      script += `    driver.get("${escapeQuotes(step.value || '')}")\n`;
      script += `    time.sleep(0.5)\n\n`;
      return;
    }

    if (step.type === 'waitForNetworkIdle') {
      script += `    wait_for_network_idle(driver)\n`;
      script += `    time.sleep(0.5)\n\n`;
      return;
    }

    const byLocator = getPythonByLocator(step);

    if (step.alternativeSelectors && step.alternativeSelectors.length > 0) {
      const alts = step.alternativeSelectors.map((a) => `("${a.type}", "${escapeQuotes(a.selector)}")`).join(', ');
      script += `    alternatives = [${alts}]\n`;
      script += `    element = find_element_with_fallback(wait, ${byLocator}, alternatives)\n`;
    } else {
      switch (step.type) {
        case 'click':
        case 'waitForElement':
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
        script += `    wait_for_network_idle(driver)\n`;
        break;
      case 'input':
        script += `    driver.execute_script("arguments[0].scrollIntoView({block: 'center'})", element)\n`;
        script += `    element.clear()\n`;
        script += `    element.send_keys("${escapeQuotes(step.value || '')}")\n`;
        break;
      case 'waitForElement':
        script += `    # 元素已定位\n`;
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

function generateJavaScriptScript(url: string, steps: ActionStep[]): string {
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

async function waitForNetworkIdle(driver, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const active = await driver.executeScript("return window.jQuery ? window.jQuery.active : 0");
      if (active === 0) break;
    } catch (e) {}
    await driver.sleep(100);
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
    await driver.get("${escapeQuotes(url)}");
    await driver.sleep(1000);
    await waitForNetworkIdle(driver);

`;

  steps.forEach((step, index) => {
    script += `    // Step ${index + 1}: ${step.type} - ${step.elementDescription || step.selector}\n`;

    if (step.type === 'wait') {
      script += `    await driver.sleep(${step.value || '1000'});\n`;
      script += `    await driver.sleep(500);\n\n`;
      return;
    }

    if (step.type === 'navigate') {
      script += `    await driver.get("${escapeQuotes(step.value || '')}");\n`;
      script += `    await driver.sleep(500);\n\n`;
      return;
    }

    if (step.type === 'waitForNetworkIdle') {
      script += `    await waitForNetworkIdle(driver);\n`;
      script += `    await driver.sleep(500);\n\n`;
      return;
    }

    const byLocator = getJSByLocator(step);

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
        script += `    await waitForNetworkIdle(driver);\n`;
        break;
      case 'input':
        script += `    await driver.executeScript("arguments[0].scrollIntoView({block: 'center'})", element${index});\n`;
        script += `    await element${index}.clear();\n`;
        script += `    await element${index}.sendKeys("${escapeQuotes(step.value || '')}");\n`;
        break;
      case 'waitForElement':
        script += `    // 元素已定位\n`;
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

function getPythonByLocator(step: ActionStep): string {
  switch (step.selectorType) {
    case 'id':
      return `By.ID, "${escapeQuotes(step.selector)}"`;
    case 'name':
      return `By.NAME, "${escapeQuotes(step.selector)}"`;
    case 'css':
      return `By.CSS_SELECTOR, "${escapeQuotes(step.selector)}"`;
    case 'xpath':
      return `By.XPATH, "${escapeQuotes(step.selector)}"`;
    case 'text':
      return `By.XPATH, '//*[text()="${escapeQuotes(step.selector)}"]'`;
    case 'containsText':
      return `By.XPATH, '//*[contains(text(), "${escapeQuotes(step.selector)}")]'`;
    case 'linkText':
      return `By.LINK_TEXT, "${escapeQuotes(step.selector)}"`;
    default:
      return `By.CSS_SELECTOR, "${escapeQuotes(step.selector)}"`;
  }
}

function getJSByLocator(step: ActionStep): string {
  switch (step.selectorType) {
    case 'id':
      return `By.id("${escapeQuotes(step.selector)}")`;
    case 'name':
      return `By.name("${escapeQuotes(step.selector)}")`;
    case 'css':
      return `By.css("${escapeQuotes(step.selector)}")`;
    case 'xpath':
      return `By.xpath("${escapeQuotes(step.selector)}")`;
    case 'text':
      return `By.xpath(\`//*[text()="${escapeQuotes(step.selector)}"]\`)`;
    case 'containsText':
      return `By.xpath(\`//*[contains(text(), "${escapeQuotes(step.selector)}")]\`)`;
    case 'linkText':
      return `By.linkText("${escapeQuotes(step.selector)}")`;
    default:
      return `By.css("${escapeQuotes(step.selector)}")`;
  }
}

function escapeQuotes(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/'/g, "\\'");
}
