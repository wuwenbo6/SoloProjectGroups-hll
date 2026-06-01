const state = {
  direction: 'asn-to-asdot',
  results: [],
  abortController: null
};

const elements = {
  modeButtons: document.querySelectorAll('.mode-btn'),
  inputArea: document.getElementById('input-area'),
  inputLabel: document.getElementById('input-label'),
  inputHint: document.getElementById('input-hint'),
  outputLabel: document.getElementById('output-label'),
  convertBtn: document.getElementById('convert-btn'),
  clearBtn: document.getElementById('clear-btn'),
  exampleBtn: document.getElementById('example-btn'),
  copyAllBtn: document.getElementById('copy-all-btn'),
  exportCsvBtn: document.getElementById('export-csv-btn'),
  exportTsvBtn: document.getElementById('export-tsv-btn'),
  resultContainer: document.getElementById('result-container'),
  errorMessage: document.getElementById('error-message'),
  errorText: document.getElementById('error-text'),
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toast-message')
};

const CLASSIFICATION_COLORS = {
  'public': { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
  'reserved': { bg: 'rgba(168,85,247,0.15)', color: '#a855f7', border: 'rgba(168,85,247,0.3)' },
  'last': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  'as-trans': { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  'doc': { bg: 'rgba(99,102,241,0.15)', color: '#6366f1', border: 'rgba(99,102,241,0.3)' },
  'public-4': { bg: 'rgba(14,165,233,0.15)', color: '#0ea5e9', border: 'rgba(14,165,233,0.3)' },
  'private-4': { bg: 'rgba(236,72,153,0.15)', color: '#ec4899', border: 'rgba(236,72,153,0.3)' },
  'last-4': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  'unknown': { bg: 'rgba(100,116,139,0.15)', color: '#64748b', border: 'rgba(100,116,139,0.3)' }
};

function init() {
  setupEventListeners();
  updateUILabels();
}

function setupEventListeners() {
  elements.modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const direction = btn.dataset.direction;
      setDirection(direction);
    });
  });

  elements.convertBtn.addEventListener('click', handleConvert);
  elements.clearBtn.addEventListener('click', handleClear);
  elements.exampleBtn.addEventListener('click', loadExample);
  elements.copyAllBtn.addEventListener('click', copyAllResults);
  elements.exportCsvBtn.addEventListener('click', () => exportTable('csv'));
  elements.exportTsvBtn.addEventListener('click', () => exportTable('tsv'));

  elements.inputArea.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      handleConvert();
    }
  });

  elements.inputArea.addEventListener('input', () => {
    hideError();
  });
}

function setDirection(direction) {
  state.direction = direction;
  elements.modeButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.direction === direction);
  });
  updateUILabels();
  if (elements.inputArea.value.trim()) {
    handleConvert();
  }
}

function updateUILabels() {
  if (state.direction === 'asn-to-asdot') {
    elements.inputLabel.innerHTML = `
      <i class="fa-solid fa-keyboard"></i>
      输入 ASN (2字节: 1-64511 / 4字节: 最大 4294967295)
    `;
    elements.inputHint.textContent = '支持批量输入，每行一个值';
    elements.outputLabel.innerHTML = `
      <i class="fa-solid fa-list-check"></i>
      转换结果 (ASdot)
    `;
    elements.inputArea.placeholder = '例如：\n100\n64511\n65538\n1.2';
  } else {
    elements.inputLabel.innerHTML = `
      <i class="fa-solid fa-keyboard"></i>
      输入 ASdot (如 0.100 或 1.2)
    `;
    elements.inputHint.textContent = '格式: a.b，每行一个值';
    elements.outputLabel.innerHTML = `
      <i class="fa-solid fa-list-check"></i>
      转换结果 (ASN)
    `;
    elements.inputArea.placeholder = '例如：\n0.100\n0.64511\n1.2\n1.0';
  }
}

async function handleConvert() {
  const inputText = elements.inputArea.value.trim();

  if (!inputText) {
    showError('请输入要转换的值');
    return;
  }

  const inputs = inputText.split('\n').map(line => line.trim()).filter(line => line);

  if (inputs.length === 0) {
    showError('请输入要转换的值');
    return;
  }

  if (state.abortController) {
    state.abortController.abort();
  }
  state.abortController = new AbortController();

  elements.convertBtn.disabled = true;
  elements.convertBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 转换中...';
  hideError();
  state.results = [];
  initResultTable();

  try {
    const response = await fetch('/api/convert/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction: state.direction, inputs }),
      signal: state.abortController.signal
    });

    if (!response.ok) {
      const data = await response.json();
      showError(data.error || '转换失败');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: result')) {
          continue;
        }
        if (line.startsWith('data: ')) {
          try {
            const result = JSON.parse(line.slice(6));
            state.results.push(result);
            appendResultRow(result);
          } catch (e) {
            // skip
          }
        }
      }
    }

    if (buffer.trim()) {
      const remaining = buffer.trim().split('\n');
      for (const line of remaining) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.total !== undefined) {
              updateResultSummary(data.total, data.valid, data.failed);
            }
          } catch (e) {
            // skip
          }
        }
      }
    }

    updateResultSummaryFromState();
    elements.copyAllBtn.disabled = false;
    elements.exportCsvBtn.disabled = false;
    elements.exportTsvBtn.disabled = false;
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }
    console.error('请求错误:', error);
    showError('网络错误，请检查服务是否启动');
  } finally {
    elements.convertBtn.disabled = false;
    elements.convertBtn.innerHTML = '<i class="fa-solid fa-exchange-alt"></i> 转换';
    state.abortController = null;
  }
}

function initResultTable() {
  const inputColName = state.direction === 'asn-to-asdot' ? 'ASN' : 'ASdot';
  const outputColName = state.direction === 'asn-to-asdot' ? 'ASdot' : 'ASN';
  elements.resultContainer.innerHTML = `
    <div class="result-table-wrapper">
      <table class="result-table">
        <thead>
          <tr>
            <th style="width: 50px;">状态</th>
            <th>${inputColName}</th>
            <th>${outputColName}</th>
            <th style="width: 130px;">范围分类</th>
            <th style="width: 70px;">类型</th>
            <th style="width: 60px;">操作</th>
          </tr>
        </thead>
        <tbody id="result-tbody"></tbody>
      </table>
    </div>
    <div id="result-summary" class="result-summary" style="display:none;"></div>
  `;
}

function appendResultRow(result) {
  const tbody = document.getElementById('result-tbody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.setAttribute('data-index', result.index);

  let statusHtml;
  if (result.isValid) {
    statusHtml = '<span class="status-icon status-success"><i class="fa-solid fa-check"></i></span>';
  } else {
    statusHtml = '<span class="status-icon status-error"><i class="fa-solid fa-xmark"></i></span>';
  }

  let outputHtml;
  if (result.isValid) {
    let badges = '';
    if (result.isAsTrans) {
      badges += '<span class="badge badge-warning">AS_TRANS</span>';
    } else if (result.is4byte) {
      badges += '<span class="badge badge-info">4字节</span>';
    }
    outputHtml = `<span class="result-output">${escapeHtml(result.output)}</span>${badges}`;
    if (result.note) {
      outputHtml += `<div class="result-note"><i class="fa-solid fa-info-circle"></i> ${escapeHtml(result.note)}</div>`;
    }
  } else {
    outputHtml = `<span class="result-error">${escapeHtml(result.error)}</span>`;
  }

  let classificationHtml = '';
  if (result.isValid && result.classification) {
    const cls = result.classification;
    const style = CLASSIFICATION_COLORS[cls.color] || CLASSIFICATION_COLORS['unknown'];
    classificationHtml = `<span class="badge badge-classification" style="background:${style.bg};color:${style.color};border:1px solid ${style.border}">${escapeHtml(cls.categoryZh)}</span>`;
  }

  let typeHtml = '';
  if (result.isValid && result.classification) {
    typeHtml = result.classification.type === '4-byte'
      ? '<span class="type-4byte">4B</span>'
      : '<span class="type-2byte">2B</span>';
  }

  let actionHtml = '';
  if (result.isValid) {
    actionHtml = `<button class="copy-btn" data-result="${escapeHtml(result.output)}" onclick="copyResult(this)"><i class="fa-solid fa-copy"></i></button>`;
  }

  tr.innerHTML = `
    <td class="result-status">${statusHtml}</td>
    <td class="result-input">${escapeHtml(result.input)}</td>
    <td>${outputHtml}</td>
    <td>${classificationHtml}</td>
    <td class="result-type">${typeHtml}</td>
    <td>${actionHtml}</td>
  `;

  tr.style.animation = 'fadeIn 0.3s ease';
  tbody.appendChild(tr);

  const wrapper = tbody.closest('.result-table-wrapper');
  if (wrapper) {
    wrapper.scrollTop = wrapper.scrollHeight;
  }
}

function updateResultSummary(total, valid, failed) {
  const summary = document.getElementById('result-summary');
  if (summary) {
    summary.style.display = 'block';
    summary.innerHTML = `共 ${total} 条，成功 ${valid} 条，失败 ${failed} 条`;
  }
}

function updateResultSummaryFromState() {
  const total = state.results.length;
  const valid = state.results.filter(r => r.isValid).length;
  updateResultSummary(total, valid, total - valid);
}

function handleClear() {
  if (state.abortController) {
    state.abortController.abort();
    state.abortController = null;
  }
  elements.inputArea.value = '';
  state.results = [];
  elements.resultContainer.innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-inbox"></i>
      <p>输入值后点击"转换"按钮</p>
    </div>
  `;
  elements.copyAllBtn.disabled = true;
  elements.exportCsvBtn.disabled = true;
  elements.exportTsvBtn.disabled = true;
  hideError();
}

function loadExample() {
  if (state.direction === 'asn-to-asdot') {
    elements.inputArea.value = `1
100
23456
64496
64512
65535
65538
65536
4200000001
4294967295
`;
  } else {
    elements.inputArea.value = `0.1
0.100
0.23456
0.64496
0.64512
0.65535
1.2
1.0
64496.1
65535.65535
`;
  }
  handleConvert();
}

async function copyResult(button) {
  const value = button.dataset.result;
  try {
    await navigator.clipboard.writeText(value);
    button.classList.add('copied');
    button.innerHTML = '<i class="fa-solid fa-check"></i>';
    setTimeout(() => {
      button.classList.remove('copied');
      button.innerHTML = '<i class="fa-solid fa-copy"></i>';
    }, 2000);
  } catch (error) {
    showToast('复制失败，请手动复制');
  }
}

async function copyAllResults() {
  const validResults = state.results.filter(r => r.isValid);
  if (validResults.length === 0) {
    showToast('没有可复制的有效结果');
    return;
  }
  const text = validResults.map(r => r.output).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showToast(`已复制 ${validResults.length} 条结果`);
  } catch (error) {
    showToast('复制失败，请手动复制');
  }
}

function exportTable(format) {
  const validResults = state.results.filter(r => r.isValid);
  if (validResults.length === 0) {
    showToast('没有可导出的有效结果');
    return;
  }

  const separator = format === 'csv' ? ',' : '\t';
  const ext = format === 'csv' ? 'csv' : 'tsv';
  const inputCol = state.direction === 'asn-to-asdot' ? 'ASN' : 'ASdot';
  const outputCol = state.direction === 'asn-to-asdot' ? 'ASdot' : 'ASN';

  const header = [inputCol, outputCol, '范围分类', '类型', '4字节', '备注']
    .map(h => format === 'csv' ? `"${h}"` : h)
    .join(separator);

  const rows = validResults.map(r => {
    const cls = r.classification || {};
    const is4byte = r.is4byte ? '是' : '否';
    const note = (r.note || '').replace(/"/g, '""');
    const values = [
      r.input,
      r.output,
      cls.categoryZh || '',
      cls.type || '',
      is4byte,
      r.note || ''
    ];
    return format === 'csv'
      ? values.map(v => `"${String(v).replace(/"/g, '""')}"`).join(separator)
      : values.join(separator);
  });

  const content = '\uFEFF' + header + '\n' + rows.join('\n');

  const blob = new Blob([content], { type: `text/${format === 'csv' ? 'csv' : 'plain'};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `asn-conversion-${Date.now()}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`已导出 ${validResults.length} 条结果为 ${ext.toUpperCase()} 文件`);
}

function showError(message) {
  elements.errorText.textContent = message;
  elements.errorMessage.classList.remove('hidden');
}

function hideError() {
  elements.errorMessage.classList.add('hidden');
}

function showToast(message) {
  elements.toastMessage.textContent = message;
  elements.toast.classList.remove('hidden');
  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.copyResult = copyResult;

init();
