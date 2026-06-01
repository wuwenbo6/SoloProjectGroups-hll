import {
  hexToUint8Array,
  uint8ArrayToHex,
  decodeCbor,
  encodeCbor,
  toDiagnosticNotation,
  toTreeNode,
  parseDiagnosticNotation,
  EXAMPLES,
} from './cbor';
import type { TreeNode, CborValue } from './cbor';
import {
  cborValueToYaml,
  validateCborAgainstCDDL,
  CDDL_EXAMPLES,
} from './cddl';

let currentDiagnosticOutput = '';
let currentEncodedHex = '';
let currentEncodedBytes: Uint8Array | null = null;
let currentCborValue: CborValue | null = null;
let yamlPreviewShown = false;

const $ = (selector: string): HTMLElement | null =>
  document.querySelector(selector);

const $$ = (selector: string): HTMLElement[] =>
  Array.from(document.querySelectorAll(selector));

function formatHexDisplay(hex: string): string {
  return hex.replace(/(.{2})/g, '$1 ').trim().toUpperCase();
}

function formatDiagnosticWithSyntax(text: string): string {
  let result = text
    .replace(/(h'[^']*')/g, '<span class="bytes-val">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="str-val">$1</span>')
    .replace(/(\b\d+\.?\d*(?:[eE][+\-]?\d+)?\b)/g, '<span class="num-val">$1</span>')
    .replace(/\b(true|false|null|undefined|NaN|Infinity|-Infinity)\b/g, '<span class="bool-val">$1</span>')
    .replace(/(\b\d+\()/g, '<span class="tag-val">$1</span>')
    .replace(/(\))/g, '<span class="tag-val">$1</span>')
    .replace(/([{}\[\]:,])/g, '<span class="punct-val">$1</span>');
  return result;
}

function showError(message: string) {
  const toast = $('#error-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

function handleDecode(hex: string) {
  const diagnosticOutput = $('#diagnostic-output') as HTMLElement;
  const treeContainer = $('#tree-container') as HTMLElement;
  const hexInput = $('#hex-input') as HTMLTextAreaElement;
  const swapToEncode = $('#swap-to-encode') as HTMLButtonElement;
  const copyDiagnostic = $('#copy-diagnostic') as HTMLButtonElement;
  const exportYaml = $('#export-yaml') as HTMLButtonElement;
  const validateCddl = $('#validate-cddl') as HTMLButtonElement;
  const decodeByteCount = $('#decode-byte-count') as HTMLElement;
  const hexInputEl = $('#hex-input') as HTMLTextAreaElement;
  const validationResult = $('#validation-result') as HTMLElement;

  const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '');
  decodeByteCount.textContent = `${cleanHex.length / 2} bytes`;

  if (yamlPreviewShown) {
    const existingPreview = document.querySelector('.yaml-preview');
    if (existingPreview) existingPreview.remove();
    yamlPreviewShown = false;
  }

  if (validationResult) {
    validationResult.innerHTML = '';
  }

  if (!cleanHex.trim()) {
    diagnosticOutput.innerHTML = '<span class="placeholder">解码结果将在此处显示...</span>';
    treeContainer.innerHTML = '<span class="placeholder">解码后查看解析树结构...</span>';
    currentDiagnosticOutput = '';
    currentCborValue = null;
    swapToEncode.disabled = true;
    copyDiagnostic.disabled = true;
    exportYaml.disabled = true;
    validateCddl.disabled = true;
    hexInputEl.classList.remove('error');
    return;
  }

  try {
    const bytes = hexToUint8Array(cleanHex);
    const cborValue = decodeCbor(bytes);
    const diagnostic = toDiagnosticNotation(cborValue);
    const tree = toTreeNode(cborValue);

    currentDiagnosticOutput = diagnostic;
    currentCborValue = cborValue;
    diagnosticOutput.innerHTML = formatDiagnosticWithSyntax(diagnostic);
    treeContainer.innerHTML = renderTree(tree);
    swapToEncode.disabled = false;
    copyDiagnostic.disabled = false;
    exportYaml.disabled = false;
    validateCddl.disabled = false;
    hexInputEl.classList.remove('error');
  } catch (err) {
    const msg = err instanceof Error ? err.message : '解码失败';
    diagnosticOutput.innerHTML = `<span style="color: var(--red)">错误: ${msg}</span>`;
    treeContainer.innerHTML = '<span class="placeholder">解码后查看解析树结构...</span>';
    hexInputEl.classList.add('error');
    currentDiagnosticOutput = '';
    currentCborValue = null;
    swapToEncode.disabled = true;
    copyDiagnostic.disabled = true;
    exportYaml.disabled = true;
    validateCddl.disabled = true;
  }
}

function renderTree(node: TreeNode, depth: number = 0): string {
  const hasChildren = node.children && node.children.length > 0;

  const typeColors: Record<string, string> = {
    uint: 'tree-type-uint',
    negint: 'tree-type-negint',
    bytes: 'tree-type-bytes',
    text: 'tree-type-text',
    array: 'tree-type-array',
    map: 'tree-type-map',
    tag: 'tree-type-tag',
    float: 'tree-type-float',
    simple: 'tree-type-simple',
    false: 'tree-type-false',
    true: 'tree-type-true',
    null: 'tree-type-null',
    undefined: 'tree-type-undefined',
  };

  const typeClass = typeColors[node.type] || 'tree-type-simple';

  let html = `<div class="tree-node" style="padding-left: ${depth * 16}px">`;
  html += `<div class="tree-node-content" onclick="toggleTreeNode(this)" data-expanded="${depth < 2}">`;

  if (hasChildren) {
    html += `<span class="tree-toggle">${depth < 2 ? '▼' : '▶'}</span>`;
  } else {
    html += `<span class="tree-spacer"></span>`;
  }

  html += `<span class="tree-label">${escapeHtml(node.label)}</span>`;
  html += `<span class="tree-type ${typeClass}">${node.type}</span>`;

  if (node.value) {
    html += `<span class="tree-value">${escapeHtml(node.value)}</span>`;
  }

  html += '</div>';

  if (hasChildren) {
    html += `<div class="tree-children" style="display: ${depth < 2 ? 'block' : 'none'}">`;
    for (const child of node.children!) {
      html += renderTree(child, depth + 1);
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

(window as any).toggleTreeNode = function (el: HTMLElement) {
  const children = el.parentElement?.querySelector(':scope > .tree-children') as HTMLElement | null;
  const toggle = el.querySelector('.tree-toggle') as HTMLElement | null;
  const expanded = el.dataset.expanded === 'true';

  if (children && toggle) {
    if (expanded) {
      children.style.display = 'none';
      toggle.textContent = '▶';
      el.dataset.expanded = 'false';
    } else {
      children.style.display = 'block';
      toggle.textContent = '▼';
      el.dataset.expanded = 'true';
    }
  }
};

function handleEncode(input: string) {
  const hexOutput = $('#hex-output') as HTMLElement;
  const swapToDecode = $('#swap-to-decode') as HTMLButtonElement;
  const copyHex = $('#copy-hex') as HTMLButtonElement;
  const downloadBin = $('#download-bin') as HTMLButtonElement;
  const encodeByteCount = $('#encode-byte-count') as HTMLElement;
  const encodeInputEl = $('#encode-input') as HTMLTextAreaElement;

  if (!input.trim()) {
    hexOutput.innerHTML = '<span class="placeholder">编码结果将在此处显示...</span>';
    currentEncodedHex = '';
    currentEncodedBytes = null;
    swapToDecode.disabled = true;
    copyHex.disabled = true;
    downloadBin.disabled = true;
    encodeByteCount.textContent = '0 bytes';
    encodeInputEl.classList.remove('error');
    return;
  }

  try {
    const cborValue = parseDiagnosticNotation(input);
    const bytes = encodeCbor(cborValue);
    const hex = uint8ArrayToHex(bytes);

    currentEncodedHex = hex;
    currentEncodedBytes = bytes;
    hexOutput.innerHTML = `<span class="num-val">${formatHexDisplay(hex)}</span>`;
    encodeByteCount.textContent = `${bytes.length} bytes`;
    swapToDecode.disabled = false;
    copyHex.disabled = false;
    downloadBin.disabled = false;
    encodeInputEl.classList.remove('error');
  } catch (err) {
    const msg = err instanceof Error ? err.message : '编码失败';
    hexOutput.innerHTML = `<span style="color: var(--red)">错误: ${msg}</span>`;
    encodeInputEl.classList.add('error');
    currentEncodedHex = '';
    currentEncodedBytes = null;
    swapToDecode.disabled = true;
    copyHex.disabled = true;
    downloadBin.disabled = true;
    encodeByteCount.textContent = '0 bytes';
  }
}

async function copyToClipboard(text: string, btnId: string) {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  const icon = $(`#${btnId}-icon`) as HTMLElement;
  const txt = $(`#${btnId}-text`) as HTMLElement;
  if (icon) icon.textContent = '✓';
  if (txt) txt.textContent = '已复制';

  setTimeout(() => {
    if (icon) icon.textContent = '📋';
    if (txt) txt.textContent = '复制';
  }, 2000);
}

function downloadBytes(bytes: Uint8Array, filename: string) {
  const byteArray = new Uint8Array(bytes.length);
  byteArray.set(bytes);
  const blob = new Blob([byteArray], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function initExamples() {
  const container = $('#examples-container');
  if (!container) return;

  for (const ex of EXAMPLES) {
    const btn = document.createElement('button');
    btn.className = 'example-btn';
    btn.textContent = ex.name;
    btn.onclick = () => {
      const hexInput = $('#hex-input') as HTMLTextAreaElement;
      if (hexInput) {
        hexInput.value = formatHexDisplay(ex.hex);
        handleDecode(ex.hex);
      }
    };
    container.appendChild(btn);
  }
}

function initTabs() {
  const tabs = $$('.tab');
  const decodeSection = $('#decode-section');
  const encodeSection = $('#encode-section');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      if (targetTab === 'decode') {
        decodeSection?.classList.add('active');
        encodeSection?.classList.remove('active');
      } else {
        encodeSection?.classList.add('active');
        decodeSection?.classList.remove('active');
      }
    });
  });
}

function initHexInput() {
  const hexInput = $('#hex-input') as HTMLTextAreaElement;
  if (!hexInput) return;

  hexInput.addEventListener('input', () => {
    const raw = hexInput.value;
    handleDecode(raw);
  });
}

function initEncodeInput() {
  const encodeInput = $('#encode-input') as HTMLTextAreaElement;
  if (!encodeInput) return;

  const debouncedHandle = debounce((val: string) => {
    handleEncode(val);
  }, 300);

  encodeInput.addEventListener('input', () => {
    debouncedHandle(encodeInput.value);
  });
}

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timeoutId: number;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delay);
  }) as T;
}

function initFileUpload() {
  const uploadSection = $('#upload-section') as HTMLElement;
  const fileInput = $('#file-input') as HTMLInputElement;
  const uploadLink = $('#upload-link') as HTMLElement;
  const uploadFileInfo = $('#upload-file-info') as HTMLElement;
  const filenameSpan = $('#filename') as HTMLElement;
  const clearFileBtn = $('#clear-file') as HTMLButtonElement;

  if (!uploadSection || !fileInput) return;

  uploadLink?.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
  });

  uploadSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadSection.classList.add('dragover');
  });

  uploadSection.addEventListener('dragleave', () => {
    uploadSection.classList.remove('dragover');
  });

  uploadSection.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadSection.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  clearFileBtn?.addEventListener('click', () => {
    uploadFileInfo?.classList.add('hidden');
    uploadSection?.querySelector('.upload-icon')?.classList.remove('hidden');
    uploadSection?.querySelector('.upload-text')?.classList.remove('hidden');
    const hexInput = $('#hex-input') as HTMLTextAreaElement;
    if (hexInput) {
      hexInput.value = '';
      handleDecode('');
    }
  });

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result;
      if (buffer instanceof ArrayBuffer) {
        const bytes = new Uint8Array(buffer);
        const hex = uint8ArrayToHex(bytes);
        const hexInput = $('#hex-input') as HTMLTextAreaElement;
        if (hexInput) {
          hexInput.value = formatHexDisplay(hex);
          handleDecode(hex);
        }
        uploadSection.querySelector('.upload-icon')?.classList.add('hidden');
        uploadSection.querySelector('.upload-text')?.classList.add('hidden');
        uploadFileInfo?.classList.remove('hidden');
        if (filenameSpan) filenameSpan.textContent = file.name;
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

function initCopyButtons() {
  $('#copy-diagnostic')?.addEventListener('click', () => {
    copyToClipboard(currentDiagnosticOutput, 'copy-diagnostic');
  });

  $('#copy-hex')?.addEventListener('click', () => {
    copyToClipboard(currentEncodedHex, 'copy-hex');
  });

  $('#download-bin')?.addEventListener('click', () => {
    if (currentEncodedBytes) {
      downloadBytes(currentEncodedBytes, 'cbor_output.bin');
    }
  });

  $('#export-yaml')?.addEventListener('click', () => {
    handleExportYaml();
  });

  $('#validate-cddl')?.addEventListener('click', () => {
    handleValidateCddl();
  });

  $('#cddl-example-select')?.addEventListener('change', (e) => {
    const select = e.target as HTMLSelectElement;
    const exampleName = select.value;
    if (!exampleName) return;
    const example = CDDL_EXAMPLES.find((ex) => ex.name === exampleName);
    if (example) {
      const cddlInput = $('#cddl-input') as HTMLTextAreaElement;
      if (cddlInput) {
        cddlInput.value = example.cddl;
      }
    }
  });
}

function handleExportYaml() {
  if (!currentCborValue) return;

  try {
    const yaml = cborValueToYaml(currentCborValue);

    const existingPreview = document.querySelector('.yaml-preview');
    if (existingPreview && yamlPreviewShown) {
      existingPreview.remove();
      yamlPreviewShown = false;
    } else {
      const outputSection = $('#diagnostic-output')?.closest('.output-section');
      if (!outputSection) return;

      const previewDiv = document.createElement('div');
      previewDiv.className = 'yaml-preview';

      const header = document.createElement('div');
      header.className = 'yaml-preview-header';

      const title = document.createElement('span');
      title.textContent = 'YAML 导出预览';

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '0.75rem';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.style.marginLeft = '0';
      copyBtn.innerHTML = '<span>📋</span><span>复制</span>';
      copyBtn.onclick = () => {
        copyToClipboard(yaml, '');
        const icon = copyBtn.querySelector('span:first-child') as HTMLElement;
        const txt = copyBtn.querySelector('span:last-child') as HTMLElement;
        if (icon) icon.textContent = '✓';
        if (txt) txt.textContent = '已复制';
        setTimeout(() => {
          if (icon) icon.textContent = '📋';
          if (txt) txt.textContent = '复制';
        }, 2000);
      };

      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'copy-btn';
      downloadBtn.style.marginLeft = '0';
      downloadBtn.innerHTML = '<span>⬇️</span><span>下载</span>';
      downloadBtn.onclick = () => {
        const blob = new Blob([yaml], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cbor_output.yaml';
        a.click();
        URL.revokeObjectURL(url);
      };

      actions.appendChild(copyBtn);
      actions.appendChild(downloadBtn);
      header.appendChild(title);
      header.appendChild(actions);

      const content = document.createElement('pre');
      content.className = 'yaml-preview-content';
      content.style.margin = '0';
      content.style.padding = '0';
      content.style.whiteSpace = 'pre-wrap';
      content.style.wordBreak = 'break-all';
      content.textContent = yaml;

      previewDiv.appendChild(header);
      previewDiv.appendChild(content);
      outputSection.appendChild(previewDiv);
      yamlPreviewShown = true;
    }
  } catch (err) {
    showError(err instanceof Error ? err.message : 'YAML 导出失败');
  }
}

function handleValidateCddl() {
  if (!currentCborValue) return;

  const cddlInput = $('#cddl-input') as HTMLTextAreaElement;
  const validationResult = $('#validation-result') as HTMLElement;
  if (!cddlInput || !validationResult) return;

  const cddlText = cddlInput.value.trim();
  if (!cddlText) {
    validationResult.innerHTML = '<span class="validation-error-item"><span class="validation-error-msg">请先输入 CDDL Schema</span></span>';
    return;
  }

  try {
    const result = validateCborAgainstCDDL(currentCborValue, cddlText);

    if (result.valid) {
      validationResult.innerHTML = '<span class="validation-success"><span class="validation-success-icon">✓</span> Schema 验证通过！数据符合 CDDL 规范。</span>';
    } else {
      const errorsHtml = result.errors
        .map(
          (err) =>
            `<div class="validation-error-item">
              <span class="validation-error-path">${err.path}</span>
              <span class="validation-error-msg">${err.message}</span>
            </div>`
        )
        .join('');
      validationResult.innerHTML = errorsHtml;
    }
  } catch (err) {
    validationResult.innerHTML = `<span class="validation-error-item"><span class="validation-error-msg">CDDL 解析错误: ${err instanceof Error ? err.message : '未知错误'}</span></span>`;
  }
}

function initSwapButtons() {
  $('#swap-to-encode')?.addEventListener('click', () => {
    if (currentDiagnosticOutput) {
      const encodeTab = $('.tab[data-tab="encode"]') as HTMLElement;
      encodeTab?.click();
      const encodeInput = $('#encode-input') as HTMLTextAreaElement;
      if (encodeInput) {
        encodeInput.value = currentDiagnosticOutput;
        handleEncode(currentDiagnosticOutput);
      }
    }
  });

  $('#swap-to-decode')?.addEventListener('click', () => {
    if (currentEncodedHex) {
      const decodeTab = $('.tab[data-tab="decode"]') as HTMLElement;
      decodeTab?.click();
      const hexInput = $('#hex-input') as HTMLTextAreaElement;
      if (hexInput) {
        hexInput.value = formatHexDisplay(currentEncodedHex);
        handleDecode(currentEncodedHex);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initExamples();
  initTabs();
  initHexInput();
  initEncodeInput();
  initFileUpload();
  initCopyButtons();
  initSwapButtons();
});
