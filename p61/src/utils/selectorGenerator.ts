import { SelectorType, AlternativeSelector } from '../../shared/types';

export interface GeneratedSelectors {
  primary: { selector: string; type: SelectorType };
  alternatives: AlternativeSelector[];
}

function isDynamicId(id: string): boolean {
  const dynamicPatterns = [
    /^[a-z]+_\d+$/i,
    /^\d+$/,
    /^[a-f0-9]{8,}$/i,
    /uuid|guid|rand|random|temp|tmp|dynamic/i,
  ];
  return dynamicPatterns.some((pattern) => pattern.test(id));
}

function isStableClass(className: string): boolean {
  const unstablePatterns = [
    /active|hover|focus|selected|disabled|loading/i,
    /-\d+$/,
    /^[a-z]+_\d+$/i,
  ];
  return !unstablePatterns.some((pattern) => pattern.test(className));
}

function getStableClasses(element: Element): string[] {
  const classAttr = element.getAttribute('class');
  if (!classAttr) return [];

  return classAttr
    .split(/\s+/)
    .filter(Boolean)
    .filter((cls) => isStableClass(cls));
}

export function generateSelectors(element: Element): GeneratedSelectors {
  const alternatives: AlternativeSelector[] = [];
  const text = element.textContent?.trim() || '';

  if (element.id && !isDynamicId(element.id)) {
    alternatives.push({ selector: element.id, type: 'id', confidence: 0.95 });
  }

  const nameAttr = element.getAttribute('name');
  if (nameAttr) {
    alternatives.push({ selector: nameAttr, type: 'name', confidence: 0.85 });
  }

  if (text && text.length > 0 && text.length < 50) {
    alternatives.push({ selector: text, type: 'text', confidence: 0.8 });
    alternatives.push({ selector: text.substring(0, 20), type: 'containsText', confidence: 0.7 });
  }

  if (element.tagName.toLowerCase() === 'a' && text) {
    alternatives.push({ selector: text, type: 'linkText', confidence: 0.85 });
  }

  const stableClasses = getStableClasses(element);
  if (stableClasses.length > 0) {
    const classSelector = stableClasses.slice(0, 3).map((c) => `.${c}`).join('');
    alternatives.push({ selector: classSelector, type: 'css', confidence: 0.75 });
  }

  const testId = element.getAttribute('data-testid') || element.getAttribute('data-test-id');
  if (testId) {
    alternatives.push({ selector: `[data-testid="${testId}"]`, type: 'css', confidence: 0.9 });
  }

  const placeholder = element.getAttribute('placeholder');
  if (placeholder) {
    alternatives.push({ selector: `[placeholder="${placeholder}"]`, type: 'css', confidence: 0.7 });
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    alternatives.push({ selector: `[aria-label="${ariaLabel}"]`, type: 'css', confidence: 0.75 });
  }

  const role = element.getAttribute('role');
  if (role && stableClasses.length === 0 && !element.id) {
    const roleSelector = role ? `[role="${role}"]` : '';
    if (roleSelector) {
      alternatives.push({ selector: roleSelector, type: 'css', confidence: 0.5 });
    }
  }

  alternatives.push({ selector: generateXPath(element, false), type: 'xpath', confidence: 0.65 });
  alternatives.push({ selector: generateXPath(element, true), type: 'xpath', confidence: 0.55 });

  alternatives.sort((a, b) => b.confidence - a.confidence);

  const primary = alternatives.length > 0
    ? { selector: alternatives[0].selector, type: alternatives[0].type }
    : { selector: generateCssSelector(element), type: 'css' as SelectorType };

  return {
    primary,
    alternatives: alternatives.slice(0, 5),
  };
}

function generateCssSelector(element: Element): string {
  if (element.id && !isDynamicId(element.id)) {
    return `#${element.id}`;
  }

  const path: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();

    if (current.id && !isDynamicId(current.id)) {
      path.unshift(`#${current.id}`);
      break;
    }

    const stableClasses = getStableClasses(current);
    if (stableClasses.length > 0) {
      selector += '.' + stableClasses.slice(0, 2).join('.');
    }

    const parent = current.parentNode;
    if (parent) {
      const siblings = Array.from(parent.childNodes).filter(
        (n) => n.nodeType === Node.ELEMENT_NODE && n.tagName === current.tagName
      );
      if (siblings.length > 1 && stableClasses.length === 0) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

function generateXPath(element: Element, useIndex: boolean = false): string {
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();

    if (current.id && !isDynamicId(current.id)) {
      path.unshift(`//*[@id="${current.id}"]`);
      break;
    }

    const text = current.textContent?.trim();
    if (text && text.length > 0 && text.length < 30 && useIndex === false) {
      path.unshift(`//*[contains(text(), "${text.substring(0, 20)}")]`);
      break;
    }

    const parent = current.parentNode;
    if (parent) {
      const siblings = Array.from(parent.childNodes).filter(
        (n) => n.nodeType === Node.ELEMENT_NODE && n.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `[${index}]`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  if (!path[0]?.startsWith('//')) {
    path.unshift('');
  }

  return path.join('/');
}

export function getBestSelector(generated: GeneratedSelectors): { selector: string; type: SelectorType } {
  return generated.primary;
}

export function getElementDescription(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const text = element.textContent?.trim().slice(0, 50) || '';
  const id = element.id && !isDynamicId(element.id) ? `#${element.id}` : '';

  const stableClasses = getStableClasses(element);
  const classes = stableClasses.length > 0 ? '.' + stableClasses.slice(0, 2).join('.') : '';

  if (text) {
    return `${tag}${id}${classes} - "${text}"`;
  }
  return `${tag}${id}${classes}`;
}
