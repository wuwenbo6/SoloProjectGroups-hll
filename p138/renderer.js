const { ipcRenderer } = require('electron');

const MAX_MESSAGES = 500;
const MAX_LOG_ITEMS = 200;
const DEDUP_WINDOW_MS = 3000;
const RENDER_THROTTLE_MS = 100;

let messages = [];
let devices = [];
let opcodes = [];
let autoScroll = true;
let activeCategories = new Set(['power', 'playback', 'remote', 'audio', 'status', 'info', 'other']);

const recentMessageHashes = new Map();
let stats = {
  totalMessages: 0,
  duplicateMessages: 0,
  arbitrationRetries: 0,
  sentMessages: 0
};

let renderThrottleTimer = null;
let pendingRender = false;
let resizeDebounceTimer = null;

const CATEGORY_COLORS = {
  power: '#e74c3c',
  playback: '#27ae60',
  remote: '#3498db',
  audio: '#9b59b6',
  status: '#f39c12',
  info: '#1abc9c',
  vendor: '#8e44ad',
  menu: '#d35400',
  routing: '#16a085',
  osd: '#c0392b',
  timer: '#2980b9',
  recording: '#2c3e50',
  error: '#7f8c8d',
  unknown: '#95a5a6',
  other: '#95a5a6'
};

const DEVICE_COLORS = [
  '#3498db', '#e74c3c', '#27ae60', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
  '#16a085', '#c0392b', '#d35400', '#8e44ad',
  '#7f8c8d', '#2980b9', '#2c3e50', '#95a5a6'
];

function getMessageHash(message) {
  const paramsKey = message.parameters ? message.parameters.join(',') : '';
  return `${message.initiator}-${message.destination}-${message.opcode}-${paramsKey}`;
}

function isDuplicateMessage(parsed) {
  const hash = getMessageHash(parsed);
  const now = Date.now();

  for (const [h, timestamp] of recentMessageHashes) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      recentMessageHashes.delete(h);
    }
  }

  if (recentMessageHashes.has(hash)) {
    const timeDiff = now - recentMessageHashes.get(hash);
    if (timeDiff < DEDUP_WINDOW_MS) {
      return true;
    }
  }

  recentMessageHashes.set(hash, now);
  return false;
}

function trimMessages() {
  if (messages.length > MAX_MESSAGES) {
    const removeCount = messages.length - MAX_MESSAGES;
    messages.splice(0, removeCount);
  }
}

function trimLog() {
  const logEl = document.getElementById('messageLog');
  while (logEl.children.length > MAX_LOG_ITEMS) {
    logEl.removeChild(logEl.firstChild);
  }
}

function updateStatsDisplay() {
  const statsEl = document.getElementById('statsDisplay');
  if (statsEl) {
    statsEl.innerHTML = `
      <span class="stat-item"><span class="stat-label">消息总数:</span> <span class="stat-value">${stats.totalMessages}</span></span>
      <span class="stat-item"><span class="stat-label">已过滤重复:</span> <span class="stat-value">${stats.duplicateMessages}</span></span>
      <span class="stat-item"><span class="stat-label">已发送:</span> <span class="stat-value">${stats.sentMessages}</span></span>
      <span class="stat-item"><span class="stat-label">仲裁重试:</span> <span class="stat-value">${stats.arbitrationRetries}</span></span>
    `;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await initData();
  initEventListeners();
  updateConnectionStatus(false);
  stats = await ipcRenderer.invoke('cec:getStats');
  updateStatsDisplay();

  setInterval(() => {
    const now = Date.now();
    for (const [hash, timestamp] of recentMessageHashes) {
      if (now - timestamp > DEDUP_WINDOW_MS * 2) {
        recentMessageHashes.delete(hash);
      }
    }
  }, DEDUP_WINDOW_MS * 2);
});

async function initData() {
  devices = await ipcRenderer.invoke('cec:getDevices');
  opcodes = await ipcRenderer.invoke('cec:getOpcodes');
  
  populateDeviceList();
  populateSelects();
}

function populateDeviceList() {
  const deviceListEl = document.getElementById('deviceList');
  deviceListEl.innerHTML = '';
  
  devices.forEach(device => {
    const item = document.createElement('div');
    item.className = 'device-item';
    item.innerHTML = `
      <span class="device-color" style="background-color: ${DEVICE_COLORS[device.address]}"></span>
      <span class="device-name">${device.name}</span>
      <span class="device-addr">${device.hex}</span>
    `;
    deviceListEl.appendChild(item);
  });
}

function populateSelects() {
  const initiatorSelect = document.getElementById('initiatorSelect');
  const destinationSelect = document.getElementById('destinationSelect');
  const opcodeSelect = document.getElementById('opcodeSelect');

  initiatorSelect.innerHTML = devices.map(d => 
    `<option value="${d.address}">${d.name} (${d.hex})</option>`
  ).join('');

  destinationSelect.innerHTML = devices.map(d => 
    `<option value="${d.address}">${d.name} (${d.hex})</option>`
  ).join('');

  destinationSelect.value = '0';

  opcodeSelect.innerHTML = opcodes.map(o => 
    `<option value="${o.code}">${o.hex} - ${o.name}</option>`
  ).join('');
}

function initEventListeners() {
  document.getElementById('connectBtn').addEventListener('click', handleConnect);
  document.getElementById('disconnectBtn').addEventListener('click', handleDisconnect);
  document.getElementById('sendRawBtn').addEventListener('click', handleSendRaw);
  document.getElementById('sendCustomBtn').addEventListener('click', handleSendCustom);
  document.getElementById('clearTimelineBtn').addEventListener('click', clearTimeline);
  document.getElementById('clearLogBtn').addEventListener('click', clearLog);
  document.getElementById('autoScrollBtn').addEventListener('click', toggleAutoScroll);
  document.getElementById('resetStatsBtn').addEventListener('click', resetStats);

  document.getElementById('parseEDIDBtn').addEventListener('click', handleParseEDID);
  document.getElementById('detectEDIDBtn').addEventListener('click', handleDetectEDID);
  
  document.getElementById('addRuleBtn').addEventListener('click', showRuleEditor);
  document.getElementById('saveRuleBtn').addEventListener('click', handleSaveRule);
  document.getElementById('cancelRuleBtn').addEventListener('click', hideRuleEditor);
  
  document.getElementById('exportJsonBtn').addEventListener('click', () => handleExport('json'));
  document.getElementById('exportCsvBtn').addEventListener('click', () => handleExport('csv'));

  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => handleQuickCommand(btn));
  });

  document.querySelectorAll('#categoryFilter input').forEach(checkbox => {
    checkbox.addEventListener('change', handleCategoryFilter);
  });

  ipcRenderer.on('cec:message', (event, message) => {
    handleIncomingMessage(message);
  });

  ipcRenderer.on('cec:status', (event, status) => {
    updateConnectionStatus(status.connected, status.simulating);
  });

  ipcRenderer.on('cec:stats', (event, newStats) => {
    stats = newStats;
    updateStatsDisplay();
    updateExportCount();
  });

  window.addEventListener('beforeunload', () => {
    ipcRenderer.removeAllListeners('cec:message');
    ipcRenderer.removeAllListeners('cec:status');
    ipcRenderer.removeAllListeners('cec:stats');
    
    if (renderThrottleTimer) {
      clearTimeout(renderThrottleTimer);
      renderThrottleTimer = null;
    }
    if (resizeDebounceTimer) {
      clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = null;
    }
    
    messages = [];
    recentMessageHashes.clear();
    pendingRender = false;
  });
}

async function handleConnect() {
  const result = await ipcRenderer.invoke('cec:connect');
  if (result.success) {
    updateConnectionStatus(true, result.simulating);
  }
}

async function handleDisconnect() {
  await ipcRenderer.invoke('cec:disconnect');
  updateConnectionStatus(false);
}

function updateConnectionStatus(connected, simulating = false) {
  const statusEl = document.getElementById('connectionStatus');
  const statusText = statusEl.querySelector('.status-text');
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');

  if (connected) {
    statusEl.className = 'status-badge ' + (simulating ? 'simulating' : 'connected');
    statusText.textContent = simulating ? '模拟模式' : '已连接';
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
  } else {
    statusEl.className = 'status-badge disconnected';
    statusText.textContent = '未连接';
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
  }
}

async function handleSendRaw() {
  const rawMessage = document.getElementById('rawMessageInput').value.trim();
  if (!rawMessage) {
    alert('请输入原始消息');
    return;
  }

  const result = await ipcRenderer.invoke('cec:send', rawMessage);
  if (result.success) {
    document.getElementById('rawMessageInput').value = '';
  }
}

async function handleSendCustom() {
  const initiator = parseInt(document.getElementById('initiatorSelect').value);
  const destination = parseInt(document.getElementById('destinationSelect').value);
  const opcode = parseInt(document.getElementById('opcodeSelect').value);
  const paramsStr = document.getElementById('paramsInput').value.trim();
  
  const params = paramsStr ? paramsStr.split(' ').map(p => parseInt(p, 16)) : [];

  const result = await ipcRenderer.invoke('cec:sendCustom', {
    initiator, destination, opcode, params
  });

  if (result.success) {
    document.getElementById('paramsInput').value = '';
  }
}

async function handleQuickCommand(btn) {
  const opcode = parseInt(btn.dataset.opcode, 16);
  const paramsStr = btn.dataset.params || '';
  const params = paramsStr ? paramsStr.split(' ').map(p => parseInt(p, 16)) : [];

  const initiator = 0x4;
  const destination = parseInt(document.getElementById('destinationSelect').value) || 0;

  const result = await ipcRenderer.invoke('cec:sendCustom', {
    initiator, destination, opcode, params
  });
}

function handleIncomingMessage(message) {
  if (isDuplicateMessage(message)) {
    return;
  }

  messages.push(message);
  trimMessages();
  
  addToLog(message);
  trimLog();
  
  throttleRenderTimeline();
  updateStatsDisplay();
}

function throttleRenderTimeline() {
  if (renderThrottleTimer) {
    pendingRender = true;
    return;
  }

  renderTimeline();

  renderThrottleTimer = setTimeout(() => {
    renderThrottleTimer = null;
    if (pendingRender) {
      pendingRender = false;
      renderTimeline();
    }
  }, RENDER_THROTTLE_MS);
}

function addToLog(message) {
  const logEl = document.getElementById('messageLog');
  const item = document.createElement('div');
  const directionClass = message.direction === 'out' ? 'log-out' : 'log-in';
  item.className = `log-item log-${message.category} ${directionClass}`;
  
  const time = new Date(message.timestamp).toLocaleTimeString();
  const categoryColor = CATEGORY_COLORS[message.category] || CATEGORY_COLORS.other;
  const directionIcon = message.direction === 'out' ? '↑' : '↓';
  
  item.innerHTML = `
    <span class="log-dir">${directionIcon}</span>
    <span class="log-time">${time}</span>
    <span class="log-cat" style="background-color: ${categoryColor}">${message.category}</span>
    <span class="log-from" style="color: ${DEVICE_COLORS[message.initiator]}">${message.initiatorName}</span>
    <span class="log-arrow">→</span>
    <span class="log-to" style="color: ${DEVICE_COLORS[message.destination]}">${message.destinationName}</span>
    <span class="log-opcode">${message.opcodeName}</span>
    <span class="log-raw">[${message.raw}]</span>
    ${message.paramDetails ? `<span class="log-params">${message.paramDetails}</span>` : ''}
  `;
  
  logEl.appendChild(item);
  
  if (autoScroll) {
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function renderTimeline() {
  const svg = document.getElementById('timelineSvg');
  const container = document.getElementById('timelineContainer');
  
  const filteredMessages = messages.filter(m => activeCategories.has(m.category));
  
  if (filteredMessages.length === 0) {
    svg.innerHTML = '';
    return;
  }

  const width = container.clientWidth;
  const deviceYMap = {};
  const activeDevices = new Set();
  
  filteredMessages.forEach(m => {
    activeDevices.add(m.initiator);
    activeDevices.add(m.destination);
  });
  
  const activeDeviceList = Array.from(activeDevices).sort((a, b) => a - b);
  const rowHeight = 50;
  const headerHeight = 40;
  const msgSpacing = 80;
  const height = headerHeight + activeDeviceList.length * rowHeight;
  const totalWidth = Math.max(width, filteredMessages.length * msgSpacing + 100);
  
  activeDeviceList.forEach((addr, idx) => {
    deviceYMap[addr] = headerHeight + idx * rowHeight + rowHeight / 2;
  });

  let svgContent = `
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#666"/>
      </marker>
    </defs>
  `;

  svgContent += `
    <rect x="0" y="0" width="${totalWidth}" height="${headerHeight}" fill="#f5f5f5" stroke="#ddd"/>
  `;

  activeDeviceList.forEach((addr, idx) => {
    const y = deviceYMap[addr];
    const device = devices.find(d => d.address === addr) || { name: `Device ${addr}` };
    const color = DEVICE_COLORS[addr] || '#999';
    
    svgContent += `
      <line x1="0" y1="${y}" x2="${totalWidth}" y2="${y}" stroke="${color}" stroke-width="1" stroke-dasharray="5,3" opacity="0.3"/>
      <rect x="5" y="${y - 18}" width="130" height="28" rx="4" fill="${color}" opacity="0.9"/>
      <text x="10" y="${y}" fill="white" font-size="12" font-weight="500">${device.name}</text>
    `;
  });

  filteredMessages.forEach((msg, idx) => {
    const x = 150 + idx * msgSpacing;
    const fromY = deviceYMap[msg.initiator];
    const toY = deviceYMap[msg.destination];
    const color = CATEGORY_COLORS[msg.category] || CATEGORY_COLORS.other;
    const isSameDevice = msg.initiator === msg.destination;

    if (isSameDevice) {
      const curveY = fromY - 25;
      svgContent += `
        <path d="M ${x - 20} ${fromY} Q ${x - 20} ${curveY} ${x + 20} ${fromY}" 
              fill="none" stroke="${color}" stroke-width="2" marker-end="url(#arrowhead)"/>
      `;
    } else {
      svgContent += `
        <line x1="${x}" y1="${fromY}" x2="${x}" y2="${toY}" 
              stroke="${color}" stroke-width="2" marker-end="url(#arrowhead)"/>
      `;
    }

    const labelY = Math.min(fromY, toY) - 8;
    svgContent += `
      <rect x="${x - 30}" y="${labelY - 18}" width="60" height="16" rx="3" fill="${color}" opacity="0.9"/>
      <text x="${x}" y="${labelY - 6}" text-anchor="middle" fill="white" font-size="10">${msg.opcodeHex}</text>
      <title>${msg.initiatorName} → ${msg.destinationName}: ${msg.opcodeName}${msg.paramDetails ? ' (' + msg.paramDetails + ')' : ''}</title>
    `;
  });

  svg.setAttribute('viewBox', `0 0 ${totalWidth} ${height}`);
  svg.innerHTML = svgContent;
  svg.style.height = `${height}px`;
  svg.style.width = `${totalWidth}px`;

  if (autoScroll) {
    container.scrollLeft = container.scrollWidth;
  }
}

function toggleAutoScroll() {
  autoScroll = !autoScroll;
  const btn = document.getElementById('autoScrollBtn');
  btn.classList.toggle('active', autoScroll);
}

function handleCategoryFilter() {
  activeCategories.clear();
  document.querySelectorAll('#categoryFilter input:checked').forEach(cb => {
    activeCategories.add(cb.value);
  });
  renderTimeline();
}

function clearTimeline() {
  messages = [];
  recentMessageHashes.clear();
  renderTimeline();
}

function clearLog() {
  document.getElementById('messageLog').innerHTML = '';
}

async function resetStats() {
  stats = await ipcRenderer.invoke('cec:resetStats');
  updateStatsDisplay();
}

window.addEventListener('resize', () => {
  if (resizeDebounceTimer) {
    clearTimeout(resizeDebounceTimer);
  }
  resizeDebounceTimer = setTimeout(() => {
    renderTimeline();
    resizeDebounceTimer = null;
  }, 150);
});

let editingRuleId = null;

async function handleParseEDID() {
  const edidHex = document.getElementById('edidInput').value.trim();
  if (!edidHex) {
    alert('请输入EDID数据');
    return;
  }
  
  const result = await ipcRenderer.invoke('edid:parse', edidHex);
  if (result.success) {
    displayEDIDInfo(result.data);
  } else {
    alert('EDID解析失败: ' + result.error);
  }
}

async function handleDetectEDID() {
  const result = await ipcRenderer.invoke('edid:detectHDMI');
  if (result.success) {
    displayEDIDInfo(result.data);
  } else {
    alert('自动检测失败: ' + result.error + '，请手动粘贴EDID数据');
  }
}

function displayEDIDInfo(info) {
  document.getElementById('edidInfo').classList.remove('hidden');
  document.getElementById('edidName').textContent = info.displayName || '未知';
  document.getElementById('edidMfr').textContent = info.manufacturerId;
  document.getElementById('edidProd').textContent = `0x${info.productId.toString(16).toUpperCase()}`;
  document.getElementById('edidYear').textContent = info.manufactureYear;
  document.getElementById('edidSize').textContent = `${info.displayParameters.maxHorizontalCm}x${info.displayParameters.maxVerticalCm} cm`;
  document.getElementById('edidGamma').textContent = info.displayParameters.gamma.toFixed(2);
  document.getElementById('edidVideoInput').textContent = info.displayParameters.videoInput;
  document.getElementById('edidVer').textContent = info.edidVersion;

  const resolutionsEl = document.getElementById('edidResolutions');
  resolutionsEl.innerHTML = '';
  const resolutions = info.supportedResolutions || [];
  if (resolutions.length === 0) {
    resolutionsEl.innerHTML = '<span class="no-data">未找到分辨率信息</span>';
  } else {
    resolutions.forEach(res => {
      const span = document.createElement('span');
      span.className = 'resolution-tag';
      span.textContent = res;
      resolutionsEl.appendChild(span);
    });
  }
}

async function loadRules() {
  const result = await ipcRenderer.invoke('source:getRules');
  if (result.success) {
    displayRules(result.rules);
  }
}

function displayRules(rules) {
  const rulesListEl = document.getElementById('rulesList');
  rulesListEl.innerHTML = '';
  
  if (rules.length === 0) {
    rulesListEl.innerHTML = '<div class="no-rules">暂无规则，点击"添加规则"创建</div>';
    return;
  }

  rules.forEach(rule => {
    const ruleEl = document.createElement('div');
    ruleEl.className = `rule-item ${rule.enabled ? 'enabled' : 'disabled'}`;
    
    const sourceDevice = devices.find(d => d.address === rule.sourceDevice);
    const targetDevice = devices.find(d => d.address === rule.targetDevice);
    
    ruleEl.innerHTML = `
      <div class="rule-info">
        <span class="rule-name">${rule.name}</span>
        <span class="rule-detail">${sourceDevice?.name || 'Unknown'} → ${targetDevice?.name || 'Unknown'}</span>
        <span class="rule-priority">优先级: ${rule.priority}</span>
      </div>
      <div class="rule-actions">
        <button class="btn btn-small toggle-rule" data-id="${rule.id}">${rule.enabled ? '禁用' : '启用'}</button>
        <button class="btn btn-small edit-rule" data-id="${rule.id}">编辑</button>
        <button class="btn btn-small delete-rule" data-id="${rule.id}">删除</button>
      </div>
    `;
    
    rulesListEl.appendChild(ruleEl);
  });

  document.querySelectorAll('.toggle-rule').forEach(btn => {
    btn.addEventListener('click', (e) => handleToggleRule(parseInt(e.target.dataset.id)));
  });
  
  document.querySelectorAll('.edit-rule').forEach(btn => {
    btn.addEventListener('click', (e) => handleEditRule(parseInt(e.target.dataset.id)));
  });
  
  document.querySelectorAll('.delete-rule').forEach(btn => {
    btn.addEventListener('click', (e) => handleDeleteRule(parseInt(e.target.dataset.id)));
  });
}

function showRuleEditor() {
  editingRuleId = null;
  document.getElementById('ruleName').value = '';
  document.getElementById('rulePriority').value = 1;
  document.getElementById('ruleSource').value = '4';
  document.getElementById('ruleTarget').value = '0';
  document.getElementById('ruleEditor').classList.remove('hidden');
}

function hideRuleEditor() {
  editingRuleId = null;
  document.getElementById('ruleEditor').classList.add('hidden');
}

async function handleSaveRule() {
  const rule = {
    name: document.getElementById('ruleName').value.trim(),
    priority: parseInt(document.getElementById('rulePriority').value),
    sourceDevice: parseInt(document.getElementById('ruleSource').value),
    targetDevice: parseInt(document.getElementById('ruleTarget').value)
  };

  if (!rule.name) {
    alert('请输入规则名称');
    return;
  }

  if (editingRuleId) {
    rule.id = editingRuleId;
    await ipcRenderer.invoke('source:updateRule', rule);
  } else {
    await ipcRenderer.invoke('source:addRule', rule);
  }
  
  hideRuleEditor();
  await loadRules();
}

async function handleEditRule(ruleId) {
  const result = await ipcRenderer.invoke('source:getRules');
  if (result.success) {
    const rule = result.rules.find(r => r.id === ruleId);
    if (rule) {
      editingRuleId = ruleId;
      document.getElementById('ruleName').value = rule.name;
      document.getElementById('rulePriority').value = rule.priority;
      document.getElementById('ruleSource').value = rule.sourceDevice;
      document.getElementById('ruleTarget').value = rule.targetDevice;
      document.getElementById('ruleEditor').classList.remove('hidden');
    }
  }
}

async function handleToggleRule(ruleId) {
  const result = await ipcRenderer.invoke('source:getRules');
  if (result.success) {
    const rule = result.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = !rule.enabled;
      await ipcRenderer.invoke('source:updateRule', rule);
      await loadRules();
    }
  }
}

async function handleDeleteRule(ruleId) {
  if (confirm('确定要删除此规则吗？')) {
    await ipcRenderer.invoke('source:deleteRule', ruleId);
    await loadRules();
  }
}

async function handleExport(format) {
  const result = await ipcRenderer.invoke('export:messages', format);
  if (result.success) {
    alert(`导出成功！文件已保存到:\n${result.path}`);
  } else if (result.error !== '用户取消保存') {
    alert('导出失败: ' + result.error);
  }
}

function updateExportCount() {
  const countEl = document.getElementById('exportCount');
  if (countEl) {
    countEl.textContent = messages.length;
  }
}

function populateRuleDeviceSelects() {
  const sourceSelect = document.getElementById('ruleSource');
  const targetSelect = document.getElementById('ruleTarget');
  
  sourceSelect.innerHTML = devices.map(d => 
    `<option value="${d.address}">${d.name} (${d.hex})</option>`
  ).join('');
  
  targetSelect.innerHTML = devices.map(d => 
    `<option value="${d.address}">${d.name} (${d.hex})</option>`
  ).join('');
  
  sourceSelect.value = '4';
  targetSelect.value = '0';
}

async function initAdditionalFeatures() {
  populateRuleDeviceSelects();
  await loadRules();
  updateExportCount();
}

initAdditionalFeatures();
