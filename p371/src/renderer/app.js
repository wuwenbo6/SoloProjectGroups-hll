const api = window.spiceAPI;

let apduLogs = [];
let isConnected = false;
let isMonitoring = false;
let selectedReader = '';
let currentReaders = [];
let currentSlots = [];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function init() {
  bindButtons();
  bindQuickActions();
  bindEventListeners();
  bindExportMenu();
  bindModal();
  bindSlotButtons();
  setupKeyboardShortcuts();

  updateTraceCount();
}

function bindButtons() {
  $('#btn-connect').addEventListener('click', handleConnect);
  $('#btn-disconnect').addEventListener('click', handleDisconnect);
  $('#btn-refresh-readers').addEventListener('click', refreshReaders);
  $('#btn-monitor').addEventListener('click', toggleMonitor);
  $('#btn-send-apdu').addEventListener('click', sendApdu);
  $('#btn-clear-log').addEventListener('click', clearLog);
  $('#btn-cold-reset').addEventListener('click', handleColdReset);

  $('#apdu-reader').addEventListener('change', (e) => {
    selectedReader = e.target.value;
    updateColdResetButton();
    updateSelectedAppDisplay();
    updateAtrDisplay();
  });
}

function bindSlotButtons() {
  $('#btn-refresh-slots').addEventListener('click', refreshSlots);
  $('#btn-add-slot').addEventListener('click', handleAddSlot);
  $('#btn-auto-assign').addEventListener('click', handleAutoAssign);
}

function bindQuickActions() {
  $$('[data-apdu]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('#apdu-input').value = btn.dataset.apdu;
      $('#apdu-input').focus();
    });
  });
}

function bindExportMenu() {
  const btn = $('#btn-export-log');
  const menu = $('#export-menu');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    menu.classList.remove('show');
  });

  $$('.export-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      const format = e.currentTarget.dataset.format;
      handleExport(format);
      menu.classList.remove('show');
    });
  });
}

function bindModal() {
  const overlay = $('#modal-overlay');
  const closeBtn = $('#modal-close');

  closeBtn.addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.style.display = 'none';
    }
  });
}

function bindEventListeners() {
  api.onSpiceStatus((data) => {
    updateSpiceStatus(data);
  });

  api.onSpiceError((data) => {
    showToast(data.message, 'error');
    updateFooter(`SPICE 错误: ${data.message}`);
  });

  api.onCardStatus((data) => {
    updateReaderStatus(data.reader, data.connected);
    if (data.connected) {
      showToast(`${data.reader} 已连接`, 'success');
      if (data.atr) {
        showAtrDetail(data);
      }
    } else {
      showToast(`${data.reader} 已断开`, 'info');
    }
  });

  api.onApduLog((entry) => {
    addApduLogEntry(entry);
    updateTraceCount();
    if (entry.selectMatch && entry.selectMatch.matchedApplications && entry.selectMatch.matchedApplications.length > 0) {
      if (entry.reader === selectedReader) {
        updateSelectedAppDisplay(entry.selectMatch.matchedApplications[0]);
      }
    }
  });

  api.onReaderEvent((event) => {
    handleReaderEvent(event);
  });

  api.onColdReset((data) => {
    showToast(`冷复位成功: ${data.reader}`, 'success');
    showAtrDetail(data);
    refreshReaders();
  });

  api.onAppSelected((data) => {
    if (data.reader === selectedReader) {
      updateSelectedAppDisplay(data.app);
    }
    showToast(`已选择应用: ${data.app.name}`, 'success');
  });

  api.onSlotChanged((data) => {
    showToast(`卡槽 ${data.slotId}: ${data.readerName ? '已分配' : '已释放'}`, 'info');
    refreshSlots();
  });

  api.onSlotsSwapped((data) => {
    showToast(`卡槽 ${data.slotId1} 与 ${data.slotId2} 已交换`, 'success');
    refreshSlots();
  });
}

function setupKeyboardShortcuts() {
  $('#apdu-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendApdu();
    }
  });
}

async function handleConnect() {
  const host = $('#spice-host').value.trim() || '127.0.0.1';
  const port = parseInt($('#spice-port').value) || 5900;
  const password = $('#spice-password').value;
  const secure = $('#spice-secure').checked;

  setConnecting(true);

  const result = await api.connect({ host, port, password, secure });

  if (result.success) {
    isConnected = true;
    updateSpiceStatus({ connected: true, host });
    showToast(`已连接到 ${host}:${port}`, 'success');
    updateFooter(`已连接 ${host}:${port}`);
  } else {
    showToast(`连接失败: ${result.error}`, 'error');
    updateFooter(`连接失败: ${result.error}`);
  }

  setConnecting(false);
}

async function handleDisconnect() {
  await api.disconnect();
  isConnected = false;
  updateSpiceStatus({ connected: false });
  showToast('已断开连接', 'info');
  updateFooter('已断开');
}

async function refreshReaders() {
  const result = await api.listReaders();
  currentReaders = result.readers || [];
  renderReaders(currentReaders);
  updateReaderSelect(currentReaders);
}

async function refreshSlots() {
  const result = await api.getSlots();
  currentSlots = result.slots || [];
  renderSlots(currentSlots);
}

async function toggleMonitor() {
  if (isMonitoring) {
    await api.stopMonitor();
    isMonitoring = false;
    $('#btn-monitor').textContent = '开始监控';
    $('#btn-monitor').classList.remove('btn-primary');
    $('#btn-monitor').classList.add('btn-outline');
    updateFooter('监控已停止');
  } else {
    await api.startMonitor();
    isMonitoring = true;
    $('#btn-monitor').textContent = '停止监控';
    $('#btn-monitor').classList.remove('btn-outline');
    $('#btn-monitor').classList.add('btn-primary');
    updateFooter('正在监控读卡器...');
    refreshReaders();

    for (let i = 0; i < 4; i++) {
      await api.addSlot(i);
    }
    refreshSlots();
  }
}

async function handleColdReset() {
  const readerName = $('#apdu-reader').value;
  if (!readerName) {
    showToast('请先选择读卡器', 'error');
    return;
  }

  const btn = $('#btn-cold-reset');
  btn.disabled = true;
  btn.textContent = '复位中...';

  try {
    const result = await api.coldReset(readerName);
    if (result.success) {
      showToast(`冷复位成功，ATR: ${result.atr}`, 'success');
      showAtrDetail({ atr: result.atr, atrParsed: result.atrParsed, reader: readerName });
    } else {
      showToast(`冷复位失败: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`冷复位异常: ${err.message}`, 'error');
  } finally {
    btn.disabled = !selectedReader;
    btn.textContent = '冷复位';
  }
}

async function handleAddSlot() {
  const slotId = currentSlots.length;
  try {
    await api.addSlot(slotId);
    showToast(`已添加卡槽 ${slotId}`, 'success');
    refreshSlots();
  } catch (err) {
    showToast(`添加卡槽失败: ${err.message}`, 'error');
  }
}

async function handleAutoAssign() {
  const unassignedReaders = currentReaders.filter((r) => {
    return !currentSlots.some((s) => s.readerName === r.name);
  });

  const availableSlots = currentSlots.filter((s) => !s.readerName);

  for (let i = 0; i < Math.min(unassignedReaders.length, availableSlots.length); i++) {
    await api.assignSlot(availableSlots[i].id, unassignedReaders[i].name);
  }

  showToast(`已自动分配 ${Math.min(unassignedReaders.length, availableSlots.length)} 个卡槽`, 'success');
  refreshSlots();
}

function updateColdResetButton() {
  $('#btn-cold-reset').disabled = !selectedReader;
}

async function toggleReaderConnection(readerName, connected) {
  if (connected) {
    const result = await api.disconnectReader(readerName);
    if (!result.success) showToast(`断开失败: ${result.error}`, 'error');
  } else {
    const result = await api.connectReader(readerName);
    if (result.success) {
      showToast(`已连接 ${readerName}`, 'success');
      if (result.atr) {
        showAtrDetail({ atr: result.atr, atrParsed: result.atrParsed, reader: readerName });
      }
    } else {
      showToast(`连接失败: ${result.error}`, 'error');
    }
  }
  refreshReaders();
}

async function assignReaderToSlot(slotId, readerName) {
  try {
    await api.assignSlot(slotId, readerName);
    showToast(`已将 ${readerName} 分配到卡槽 ${slotId}`, 'success');
    refreshSlots();
  } catch (err) {
    showToast(`分配失败: ${err.message}`, 'error');
  }
}

async function unassignSlot(slotId) {
  try {
    await api.unassignSlot(slotId);
    showToast(`已释放卡槽 ${slotId}`, 'success');
    refreshSlots();
  } catch (err) {
    showToast(`释放失败: ${err.message}`, 'error');
  }
}

async function swapSlots(slotId1, slotId2) {
  try {
    await api.swapSlots(slotId1, slotId2);
    showToast(`卡槽已交换`, 'success');
    refreshSlots();
  } catch (err) {
    showToast(`交换失败: ${err.message}`, 'error');
  }
}

function updateSelectedAppDisplay(app) {
  const panel = $('#selected-app-info');
  const content = $('#selected-app-content');

  if (!app && selectedReader) {
    const reader = currentReaders.find((r) => r.name === selectedReader);
    app = reader ? reader.selectedApp : null;
  }

  if (!app) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';

  const aidDisplay = app.aid ? `<div class="app-field"><span class="app-label">AID:</span> <span class="app-value mono">${app.aid}</span></div>` : '';
  const dfNameDisplay = app.dfName ? `<div class="app-field"><span class="app-label">DF名:</span> <span class="app-value mono">${escapeHtml(app.dfName)}</span></div>` : '';
  const descDisplay = app.description ? `<div class="app-field"><span class="app-label">描述:</span> <span class="app-value">${escapeHtml(app.description)}</span></div>` : '';

  content.innerHTML = `
    <div class="app-field"><span class="app-label">应用:</span> <span class="app-value">${escapeHtml(app.name)}</span></div>
    ${aidDisplay}
    ${dfNameDisplay}
    ${descDisplay}
  `;
}

function updateAtrDisplay() {
  const panel = $('#atr-detail-panel');
  if (!selectedReader) {
    panel.style.display = 'none';
    return;
  }

  const reader = currentReaders.find((r) => r.name === selectedReader);
  if (!reader || !reader.atr) {
    panel.style.display = 'none';
    return;
  }

  showAtrDetail({ atr: reader.atr, atrParsed: reader.atrParsed, reader: selectedReader });
}

function showAtrDetail(data) {
  const panel = $('#atr-detail-panel');
  const content = $('#atr-detail-content');

  if (!data.atr) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  let html = `<div class="atr-row"><span class="atr-label">原始 ATR:</span> <span class="atr-value mono">${escapeHtml(data.atr)}</span></div>`;

  const parsed = data.atrParsed;
  if (parsed) {
    html += `<div class="atr-row"><span class="atr-label">协议:</span> <span class="atr-value">${parsed.tsConvention}</span></div>`;
    html += `<div class="atr-row"><span class="atr-label">历史字节:</span> <span class="atr-value mono">${escapeHtml(parsed.historicalBytes || 'N/A')}</span></div>`;

    if (parsed.historicalChars && parsed.historicalChars.length > 0) {
      html += `<div class="atr-section"><span class="atr-label">历史字符解析:</span></div>`;
      for (const hc of parsed.historicalChars) {
        html += `<div class="atr-subrow"><span class="atr-sublabel">${escapeHtml(hc.description)}:</span> <span class="atr-value mono">${escapeHtml(String(hc.value))}</span></div>`;
      }
    }

    if (parsed.tck !== null && parsed.tck !== undefined) {
      const checkStatus = parsed.checksumValid === true ? '有效' : parsed.checksumValid === false ? '无效' : '未校验';
      html += `<div class="atr-row"><span class="atr-label">校验和 (TCK):</span> <span class="atr-value mono">0x${parsed.tck.toString(16).padStart(2, '0')}</span> <span style="color:var(--text-muted)">(${checkStatus})</span></div>`;
    }
  }

  content.innerHTML = html;
}

function renderReaders(readers) {
  const container = $('#readers-list');

  if (!readers || readers.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无读卡器，点击"开始监控"检测</div>';
    return;
  }

  container.innerHTML = readers.map((r) => {
    const slotInfo = currentSlots.find((s) => s.readerName === r.name);
    const slotText = slotInfo !== undefined ? `<span class="reader-slot">[卡槽 ${slotInfo.id}]</span>` : '';
    const appInfo = r.selectedApp ? `
      <div class="reader-atr" style="color: var(--accent-green); margin-top: 4px;">
      <span style="opacity: 0.7;">应用:</span> ${escapeHtml(r.selectedApp.name)}
      </div>` : '';

    return `
    <div class="reader-item" data-reader="${escapeHtml(r.name)}">
      <div class="reader-info">
        <div class="reader-icon">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="6" width="20" height="12" rx="2"/>
            <path d="M6 10h4M14 10h4"/>
          </svg>
        </div>
        <div>
          <div class="reader-name">
            ${escapeHtml(r.name)}
            ${slotText}
          </div>
          ${r.atr ? `<div class="reader-atr" title="点击查看详情" onclick="showAtrPopup('${escapeJs(r.atr)}', '${escapeJs(r.name)}')">ATR: ${escapeHtml(r.atr)}</div>` : ''}
          ${appInfo}
        </div>
      </div>
      <div class="reader-actions">
        <span class="reader-status ${r.connected ? 'card-present' : 'no-card'}">
          ${r.connected ? '已连接' : '未连接'}
        </span>
        <button class="btn btn-xs ${r.connected ? 'btn-outline' : 'btn-primary'}" 
                onclick="toggleReaderConnection('${escapeJs(r.name)}', ${r.connected})">
          ${r.connected ? '断开' : '连接'}
        </button>
      </div>
    </div>
  `;}).join('');
}

function renderSlots(slots) {
  const container = $('#slots-list');

  if (!slots || slots.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无卡槽配置，点击"添加卡槽"创建</div>';
    return;
  }

  const unassignedReaders = currentReaders.filter((r) => {
    return !slots.some((s) => s.readerName === r.name);
  });

  container.innerHTML = slots.map((s) => {
    const isAssigned = !!s.readerName;
    const statusClass = isAssigned ? 'slot-assigned' : 'slot-empty';

    const readerSelectHtml = unassignedReaders.length > 0 && !isAssigned
      ? `<select class="slot-reader-select" data-slot="${s.id}" onchange="handleSlotReaderChange(${s.id}, this.value)">
           <option value="">选择读卡器...</option>
           ${unassignedReaders.map((r) => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`).join('')}
         </select>`
      : '';

    return `
      <div class="slot-card ${statusClass}">
        <div class="slot-header">
          <span class="slot-number">卡槽 ${s.id}</span>
          <span class="slot-status">${isAssigned ? '已分配' : '空闲'}</span>
        </div>
        <div class="slot-content">
          ${isAssigned
            ? `<div class="slot-reader-name">${escapeHtml(s.readerName)}</div>
               <div class="slot-actions">
                 <button class="btn btn-xs btn-outline" onclick="unassignSlot(${s.id})">释放</button>
               </div>`
            : `<div class="slot-empty-text">未分配</div>
               ${readerSelectHtml}`
          }
        </div>
        ${isAssigned ? `
          <div class="slot-footer">
            <select class="slot-swap-select" data-slot="${s.id}" onchange="handleSlotSwap(${s.id}, this.value); this.value = '';">
              <option value="">交换到...</option>
              ${slots.filter((o) => o.id !== s.id).map((o) => `<option value="${o.id}">卡槽 ${o.id} ${o.readerName ? `(${escapeHtml(o.readerName)})` : ''}</option>`).join('')}
            </select>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function handleSlotReaderChange(slotId, readerName) {
  if (readerName) {
    assignReaderToSlot(slotId, readerName);
  }
}

function handleSlotSwap(fromSlot, toSlot) {
  if (toSlot !== '') {
    swapSlots(parseInt(fromSlot), parseInt(toSlot));
  }
}

function showAtrPopup(atrHex, readerName) {
  api.parseAtr(atrHex).then((result) => {
    if (result.success) {
      showAtrDetail({ atr: atrHex, atrParsed: result.parsed, reader: readerName });
    }
  });
}

function updateReaderSelect(readers) {
  const select = $('#apdu-reader');
  const currentVal = select.value;
  select.innerHTML = '<option value="">选择读卡器</option>';

  if (readers) {
    readers.forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r.name;
      opt.textContent = r.name;
      if (r.connected) opt.textContent += ' ✓';
      select.appendChild(opt);
    });
  }

  if (currentVal && readers.some((r) => r.name === currentVal)) {
    select.value = currentVal;
  }
}

function updateSpiceStatus(data) {
  const badge = $('#spice-status');
  const dot = badge.querySelector('.status-dot');
  const text = badge.querySelector('.status-text');

  if (data.connected) {
    badge.className = 'status-badge connected';
    text.textContent = `已连接 ${data.host || ''}`;
    $('#btn-connect').disabled = true;
    $('#btn-disconnect').disabled = false;
  } else {
    badge.className = 'status-badge disconnected';
    text.textContent = '未连接';
    $('#btn-connect').disabled = false;
    $('#btn-disconnect').disabled = true;
  }
}

async function sendApdu() {
  const readerName = $('#apdu-reader').value;
  const apduHex = $('#apdu-input').value.trim().replace(/\s/g, '').toUpperCase();

  if (!readerName) {
    showToast('请先选择读卡器', 'error');
    return;
  }

  if (!apduHex) {
    showToast('请输入 APDU 命令', 'error');
    return;
  }

  if (!/^[0-9A-F]+$/.test(apduHex) || apduHex.length % 2 !== 0) {
    showToast('APDU 格式无效，需要偶数长度的十六进制字符串', 'error');
    return;
  }

  const result = await api.transmit(readerName, apduHex);

  if (!result.success) {
    showToast(`APDU 错误: ${result.error}`, 'error');
  }
}

function addApduLogEntry(entry) {
  apduLogs.push(entry);

  const container = $('#apdu-log');
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const el = document.createElement('div');
  const isError = !!entry.error;
  const direction = entry.direction === 'incoming' ? 'in' : entry.error ? 'err' : 'out';

  el.className = `apdu-entry ${entry.direction}${isError ? ' error' : ''}`;

  const time = new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
  const sourceLabel = entry.source === 'spice-vm' ? ' [VM→本地]' : ' [本地→VM]';
  const slotLabel = entry.slotId !== undefined && entry.slotId !== null ? ` [卡槽 ${entry.slotId}]` : '';

  let selectMatchHtml = '';
  if (entry.selectMatch && !entry.selectMatch.error) {
    if (entry.selectMatch.matchedApplications && entry.selectMatch.matchedApplications.length > 0) {
      const apps = entry.selectMatch.matchedApplications.map((a) => escapeHtml(a.name)).join(', ');
      selectMatchHtml = `
        <div style="margin-top: 4px; padding-left: 24px;">
          <span style="color: var(--accent-green);">✓ 匹配应用:</span>
          <span style="color: var(--accent-yellow);">${apps}</span>
        </div>
      `;
    } else if (entry.selectMatch.matchType === 'aid') {
      selectMatchHtml = `
        <div style="margin-top: 4px; padding-left: 24px;">
          <span style="color: var(--text-muted);">SELECT (AID):</span>
          <span style="color: var(--accent-cyan);">${entry.selectMatch.aid || entry.selectMatch.dataHex}</span>
        </div>
      `;
    } else if (entry.selectMatch.matchType === 'df_name') {
      selectMatchHtml = `
        <div style="margin-top: 4px; padding-left: 24px;">
          <span style="color: var(--text-muted);">SELECT (DF名):</span>
          <span style="color: var(--accent-cyan);">${escapeHtml(entry.selectMatch.dfName || entry.selectMatch.dataHex)}</span>
        </div>
      `;
    }
  }

  el.innerHTML = `
    <div class="apdu-meta">
      <span class="apdu-direction ${direction}">${entry.direction === 'incoming' ? 'VM请求' : '发送'}${isError ? '错误' : ''}</span>
      <span>${time}${sourceLabel}${slotLabel}</span>
      <span>${escapeHtml(entry.reader)}</span>
    </div>
    <div>
      <span style="color:var(--text-muted)">CMD▸</span> 
      <span class="apdu-command">${escapeHtml(entry.apdu)}</span>
    </div>
    ${selectMatchHtml}
    ${entry.response ? `
      <div>
        <span style="color:var(--text-muted)">RSP▸</span> 
        <span class="apdu-response">${escapeHtml(entry.response)}</span>
        ${entry.sw ? `<span class="apdu-sw"> SW=${escapeHtml(entry.sw)}</span>` : ''}
      </div>
    ` : ''}
    ${isError ? `
      <div>
        <span class="apdu-error-text">ERR: ${escapeHtml(entry.error)}</span>
      </div>
    ` : ''}
  `;

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function updateTraceCount() {
  $('#trace-count').textContent = `${apduLogs.length} 条记录`;
}

function clearLog() {
  api.clearTraces();
  apduLogs = [];
  $('#apdu-log').innerHTML = '<div class="empty-state">暂无 APDU 交互记录</div>';
  updateTraceCount();
}

async function handleExport(format) {
  const extensions = {
    text: 'txt',
    json: 'json',
    pcap: 'pcap',
    hex: 'hex',
  };

  const names = {
    text: '文本文件',
    json: 'JSON 文件',
    pcap: 'PCAP 抓包文件',
    hex: '原始 HEX',
  };

  const ext = extensions[format] || 'txt';
  const defaultPath = `apdu-trace-${new Date().toISOString().slice(0, 10)}.${ext}`;

  const result = await api.showSaveDialog({
    title: `导出 ${names[format]}`,
    defaultPath,
    filters: [{ name: names[format], extensions: [ext] }],
  });

  if (result.canceled || !result.filePath) {
    return;
  }

  try {
    const exportResult = await api.exportTraces(result.filePath, format);
    if (exportResult.success) {
      showToast(`已导出 ${exportResult.count} 条记录到 ${result.filePath}`, 'success');
    } else {
      showToast(`导出失败: ${exportResult.error}`, 'error');
    }
  } catch (err) {
    showToast(`导出异常: ${err.message}`, 'error');
  }
}

function setConnecting(connecting) {
  $('#btn-connect').disabled = connecting;
  $('#btn-connect').textContent = connecting ? '连接中...' : '连接';
}

function updateFooter(text) {
  $('#footer-info').textContent = text;
}

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function showModal(title, content) {
  $('#modal-title').textContent = title;
  $('#modal-content').innerHTML = content;
  $('#modal-overlay').style.display = 'flex';
}

function handleReaderEvent(event) {
  if (event.type === 'reader-added') {
    showToast(`检测到读卡器: ${event.reader}`, 'info');
  } else if (event.type === 'reader-removed') {
    showToast(`读卡器已移除: ${event.reader}`, 'info');
  } else if (event.type === 'card-inserted') {
    showToast(`智能卡已插入: ${event.reader}`, 'success');
  } else if (event.type === 'card-removed') {
    showToast(`智能卡已拔出: ${event.reader}`, 'info');
  }
  refreshReaders();
  refreshSlots();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJs(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

document.addEventListener('DOMContentLoaded', init);
