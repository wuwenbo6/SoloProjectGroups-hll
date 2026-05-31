import { ActionStep, SelectorType, AlternativeSelector } from '../../shared/types';
import { generateSelectors, getElementDescription, GeneratedSelectors } from './selectorGenerator';

export class Recorder {
  private isRecording: boolean = false;
  private iframe: HTMLIFrameElement | null = null;
  private onStepRecorded: (step: ActionStep) => void;
  private onElementHover: (element: Element | null, selectors?: GeneratedSelectors) => void;
  private selectorPriority: SelectorType[];
  private hoverOverlay: HTMLDivElement | null = null;
  private hoverInfo: HTMLDivElement | null = null;

  constructor(
    onStepRecorded: (step: ActionStep) => void,
    onElementHover: (element: Element | null, selectors?: GeneratedSelectors) => void,
    selectorPriority: SelectorType[]
  ) {
    this.onStepRecorded = onStepRecorded;
    this.onElementHover = onElementHover;
    this.selectorPriority = selectorPriority;
  }

  setSelectorPriority(priority: SelectorType[]) {
    this.selectorPriority = priority;
  }

  start(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
    this.isRecording = true;
    this.attachListeners();
  }

  stop() {
    this.isRecording = false;
    this.detachListeners();
    this.removeHoverOverlay();
  }

  private attachListeners() {
    if (!this.iframe?.contentDocument) return;

    const doc = this.iframe.contentDocument;

    this.createHoverOverlay();

    doc.addEventListener('click', this.handleClick, true);
    doc.addEventListener('input', this.handleInput, true);
    doc.addEventListener('mouseover', this.handleMouseOver, true);
    doc.addEventListener('mouseout', this.handleMouseOut, true);
  }

  private detachListeners() {
    if (!this.iframe?.contentDocument) return;

    const doc = this.iframe.contentDocument;

    doc.removeEventListener('click', this.handleClick, true);
    doc.removeEventListener('input', this.handleInput, true);
    doc.removeEventListener('mouseover', this.handleMouseOver, true);
    doc.removeEventListener('mouseout', this.handleMouseOut, true);
  }

  private createHoverOverlay() {
    if (!this.iframe?.contentDocument) return;

    const doc = this.iframe.contentDocument;

    this.hoverOverlay = doc.createElement('div');
    this.hoverOverlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      background: rgba(22, 93, 255, 0.3);
      border: 2px solid #165DFF;
      z-index: 999999;
      display: none;
      transition: all 0.1s ease;
    `;
    doc.body.appendChild(this.hoverOverlay);

    this.hoverInfo = doc.createElement('div');
    this.hoverInfo.style.cssText = `
      position: fixed;
      pointer-events: none;
      background: #165DFF;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-family: monospace;
      z-index: 1000000;
      display: none;
      white-space: nowrap;
    `;
    doc.body.appendChild(this.hoverInfo);
  }

  private removeHoverOverlay() {
    if (this.hoverOverlay?.parentNode) {
      this.hoverOverlay.parentNode.removeChild(this.hoverOverlay);
    }
    if (this.hoverInfo?.parentNode) {
      this.hoverInfo.parentNode.removeChild(this.hoverInfo);
    }
    this.hoverOverlay = null;
    this.hoverInfo = null;
  }

  private handleMouseOver = (e: MouseEvent) => {
    if (!this.isRecording || !this.hoverOverlay || !this.hoverInfo) return;

    const element = e.target as Element;
    const rect = element.getBoundingClientRect();

    this.hoverOverlay.style.display = 'block';
    this.hoverOverlay.style.left = rect.left + 'px';
    this.hoverOverlay.style.top = rect.top + 'px';
    this.hoverOverlay.style.width = rect.width + 'px';
    this.hoverOverlay.style.height = rect.height + 'px';

    const selectors = generateSelectors(element);

    this.hoverInfo.style.display = 'block';
    this.hoverInfo.style.left = rect.left + 'px';
    this.hoverInfo.style.top = (rect.top - 28) + 'px';
    this.hoverInfo.textContent = `${selectors.primary.type}: ${selectors.primary.selector.substring(0, 40)}`;

    this.onElementHover(element, selectors);
  };

  private handleMouseOut = () => {
    if (this.hoverOverlay) this.hoverOverlay.style.display = 'none';
    if (this.hoverInfo) this.hoverInfo.style.display = 'none';
    this.onElementHover(null);
  };

  private handleClick = (e: MouseEvent) => {
    if (!this.isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    const element = e.target as Element;
    const selectors = generateSelectors(element);

    const step: ActionStep = {
      id: this.generateId(),
      type: 'click',
      selector: selectors.primary.selector,
      selectorType: selectors.primary.type,
      alternativeSelectors: selectors.alternatives,
      value: element.textContent?.trim() || '',
      timestamp: Date.now(),
      elementDescription: getElementDescription(element),
      waitOptions: {
        timeout: 15000,
        retries: 3,
        retryInterval: 500,
        waitForStable: true,
      },
    };

    this.onStepRecorded(step);
  };

  private handleInput = (e: Event) => {
    if (!this.isRecording) return;

    const element = e.target as HTMLInputElement;
    const selectors = generateSelectors(element);

    const step: ActionStep = {
      id: this.generateId(),
      type: 'input',
      selector: selectors.primary.selector,
      selectorType: selectors.primary.type,
      alternativeSelectors: selectors.alternatives,
      value: element.value,
      timestamp: Date.now(),
      elementDescription: getElementDescription(element),
      waitOptions: {
        timeout: 15000,
        retries: 3,
        retryInterval: 500,
        waitForStable: true,
      },
    };

    this.onStepRecorded(step);
  };

  private generateId(): string {
    return 'step_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  destroy() {
    this.stop();
  }
}
