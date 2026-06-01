const { ipcRenderer } = require('electron');
const jsQR = require('jsqr');

const state = {
  deviceInfo: null,
  isCommissioning: false,
  steps: [],
  stepStatuses: {},
  logs: [],
  logFilter: 'all',
  cameraActive: false,
  stream: null,
  scanAnimationId: null
};

const elements = {
  tabs: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  video: document.getElementById('video'),
  canvas: document.getElementById('canvas'),
  scanOverlay: document.getElementById('scanOverlay'),
  scannerStatus: document.getElementById('scannerStatus'),
  scannerStatusText: document.getElementById('scannerStatusText'),
  startCameraBtn: document.getElementById('startCameraBtn'),
  stopCameraBtn: document.getElementById('stopCameraBtn'),
  qrDataInput: document.getElementById('qrDataInput'),
  parseQrBtn: document.getElementById('parseQrBtn'),
  discriminator: document.getElementById('discriminator'),
  passcode: document.getElementById('passcode'),
  vendorId: document.getElementById('vendorId'),
  productId: document.getElementById('productId'),
  parseManualBtn: document.getElementById('parseManualBtn'),
  manualCode: document.getElementById('manualCode'),
  parseShortManualBtn: document.getElementById('parseShortManualBtn'),
  deviceInfoSection: document.getElementById('deviceInfoSection'),
  deviceSourceBadge: document.getElementById('deviceSourceBadge'),
  deviceInfoContent: document.getElementById('deviceInfoContent'),
  startCommissioningBtn: document.getElementById('startCommissioningBtn'),
  certificateSection: document.getElementById('certificateSection'),
  certificateContent: document.getElementById('certificateContent'),
  stepsList: document.getElementById('stepsList'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  logsContainer: document.getElementById('logsContainer'),
  clearLogsBtn: document.getElementById('clearLogsBtn'),
  logLevelFilter: document.getElementById('logLevelFilter'),
  exportDeviceInfoBtn: document.getElementById('exportDeviceInfoBtn'),
  resetBtn: document.getElementById('resetBtn')
};

const COMMISSIONING_STEPS = [
  { id: 'device_discovery', name: '设备发现', description: '扫描并发现Matter设备' },
  { id: 'device_info', name: '设备信息解析', description: '解析QR码或手动配对码' },
  { id: 'pase_session', name: 'PASE会话建立', description: '建立密码认证会话' },
  { id: 'certificate_exchange', name: '证书交换', description: '获取设备证书链及中间CA' },
  { id: 'chain_verification', name: '证书链验证', description: '验证完整证书链 Root→ICA→PAI→DAC' },
  { id: 'operational_certificate', name: 'OpCert签发', description: '签发操作证书（异步重试）' },
  { id: 'acl_configuration', name: 'ACL配置', description: '配置设备访问控制列表' },
  { id: 'commissioning_complete', name: '配网完成', description: '设备成功加入网络' }
];

function init() {
  state.steps = COMMISSIONING_STEPS;
  setupTabs();
  setupEventListeners();
  renderSteps();
  if (elements.exportDeviceInfoBtn) {
    elements.exportDeviceInfoBtn.disabled = true;
  }
  addLog('info', '应用已启动，请扫描QR码或手动输入配对码');
}

function setupTabs() {
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      elements.tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      elements.tabContents.forEach(content => {
        content.style.display = content.id === `${targetTab}-tab` ? 'block' : 'none';
      });
    });
  });
}

function setupEventListeners() {
  elements.startCameraBtn.addEventListener('click', startCamera);
  elements.stopCameraBtn.addEventListener('click', stopCamera);
  elements.parseQrBtn.addEventListener('click', parseQRCodeData);
  elements.parseManualBtn.addEventListener('click', parseManualCodeData);
  elements.parseShortManualBtn.addEventListener('click', parseShortManualCodeData);
  elements.startCommissioningBtn.addEventListener('click', startCommissioning);
  elements.clearLogsBtn.addEventListener('click', clearLogs);
  elements.logLevelFilter.addEventListener('change', (e) => {
    state.logFilter = e.target.value;
    renderLogs();
  });
  elements.exportDeviceInfoBtn?.addEventListener('click', exportDeviceInfo);
  elements.resetBtn.addEventListener('click', resetAll);

  elements.qrDataInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') parseQRCodeData();
  });
  elements.manualCode.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') parseShortManualCodeData();
  });
}

async function startCamera() {
  try {
    setScannerStatus('正在启动摄像头...', 'loading');
    elements.startCameraBtn.disabled = true;

    const constraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    elements.video.srcObject = state.stream;

    await elements.video.play();
    state.cameraActive = true;

    elements.startCameraBtn.disabled = true;
    elements.stopCameraBtn.disabled = false;
    setScannerStatus('扫描中，请将QR码对准框内', 'scanning');

    scanQRCode();
  } catch (error) {
    console.error('Camera error:', error);
    setScannerStatus(`摄像头启动失败: ${error.message}`, 'error');
    addLog('error', `摄像头启动失败: ${error.message}`);
    elements.startCameraBtn.disabled = false;
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(track => track.stop());
    state.stream = null;
  }
  
  if (state.scanAnimationId) {
    cancelAnimationFrame(state.scanAnimationId);
    state.scanAnimationId = null;
  }

  state.cameraActive = false;
  elements.video.srcObject = null;
  elements.startCameraBtn.disabled = false;
  elements.stopCameraBtn.disabled = true;
  setScannerStatus('摄像头已停止', 'idle');
}

function scanQRCode() {
  if (!state.cameraActive) return;

  const video = elements.video;
  const canvas = elements.canvas;
  const ctx = canvas.getContext('2d');

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });

    if (code) {
      addLog('info', `检测到QR码: ${code.data}`);
      parseQRCodeData(code.data);
      stopCamera();
      return;
    }
  }

  state.scanAnimationId = requestAnimationFrame(scanQRCode);
}

function setScannerStatus(text, status) {
  elements.scannerStatusText.textContent = text;
  elements.scannerStatus.className = `scanner-status status-${status}`;
}

function parseQRCodeData(data) {
  const qrData = data || elements.qrDataInput.value.trim();
  
  if (!qrData) {
    addLog('error', '请输入QR码内容');
    return;
  }

  addLog('info', `正在解析QR码: ${qrData}`);
  ipcRenderer.send('parse-qr-code', qrData);
}

function parseManualCodeData() {
  const discriminator = parseInt(elements.discriminator.value);
  const passcode = parseInt(elements.passcode.value);
  
  if (isNaN(discriminator) || discriminator < 0 || discriminator > 4095) {
    addLog('error', '请输入有效的鉴别码 (0-4095)');
    return;
  }
  
  if (isNaN(passcode) || passcode < 1 || passcode > 99999998) {
    addLog('error', '请输入有效的配对码 (1-99999998)');
    return;
  }

  const vendorId = elements.vendorId.value ? parseInt(elements.vendorId.value) : 0xFFF1;
  const productId = elements.productId.value ? parseInt(elements.productId.value) : 0x8000;

  const deviceInfo = {
    source: 'manual',
    discriminator,
    passcode,
    vendorId,
    productId,
    flowType: 0,
    flowTypeName: 'Standard',
    hasShortDiscriminator: false
  };

  handleDeviceInfoParsed(deviceInfo);
}

function parseShortManualCodeData() {
  const code = elements.manualCode.value.trim();
  
  if (!code) {
    addLog('error', '请输入手动配对码');
    return;
  }

  addLog('info', `正在解析手动配对码: ${code}`);
  ipcRenderer.send('parse-manual-code', code);
}

function handleDeviceInfoParsed(deviceInfo) {
  state.deviceInfo = deviceInfo;
  addLog('success', '设备信息解析成功');
  
  renderDeviceInfo();
  elements.deviceInfoSection.style.display = 'block';
  
  if (deviceInfo.source === 'qr') {
    elements.deviceSourceBadge.textContent = 'QR码';
    elements.deviceSourceBadge.className = 'badge badge-info';
  } else {
    elements.deviceSourceBadge.textContent = '手动输入';
    elements.deviceSourceBadge.className = 'badge badge-warning';
  }
}

function renderDeviceInfo() {
  const info = state.deviceInfo;
  if (!info) return;

  const infoItems = [];

  if (info.vendorId !== undefined) {
    infoItems.push({ label: '厂商ID', value: `0x${info.vendorId.toString(16).toUpperCase()}` });
  }
  if (info.vendorName) {
    infoItems.push({ label: '厂商名称', value: info.vendorName });
  }
  if (info.productId !== undefined) {
    infoItems.push({ label: '产品ID', value: `0x${info.productId.toString(16).toUpperCase()}` });
  }
  infoItems.push({ label: '鉴别码', value: info.discriminator });
  infoItems.push({ label: '配对码', value: info.passcode });
  if (info.flowTypeName) {
    infoItems.push({ label: '配网流程', value: info.flowTypeName });
  }
  if (info.qrVersion !== undefined) {
    infoItems.push({ label: 'QR版本', value: info.qrVersion });
  }
  if (info.rawData) {
    infoItems.push({ label: '原始数据', value: `<code>${info.rawData}</code>`, isHtml: true });
  }

  elements.deviceInfoContent.innerHTML = infoItems.map(item => `
    <div class="info-item">
      <span class="info-label">${item.label}</span>
      <span class="info-value">${item.isHtml ? item.value : escapeHtml(item.value.toString())}</span>
    </div>
  `).join('');
}

function startCommissioning() {
  if (!state.deviceInfo || state.isCommissioning) return;

  state.isCommissioning = true;
  state.stepStatuses = {};
  elements.startCommissioningBtn.disabled = true;
  elements.startCommissioningBtn.innerHTML = `
    <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="32 32" stroke-dashoffset="0"/>
    </svg>
    配网中...
  `;

  resetSteps();
  ipcRenderer.send('start-commissioning', state.deviceInfo);
}

function renderSteps() {
  elements.stepsList.innerHTML = state.steps.map((step, index) => `
    <div class="step-item" id="step-${step.id}">
      <div class="step-indicator" id="indicator-${step.id}">
        <span class="step-number">${index + 1}</span>
        <svg class="step-check" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 6L5 9L10 3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <svg class="step-error" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3L9 9M9 3L3 9" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <div class="step-spinner"></div>
      </div>
      <div class="step-content">
        <div class="step-header">
          <span class="step-name">${step.name}</span>
          <span class="step-status" id="status-${step.id}">待执行</span>
        </div>
        <p class="step-description">${step.description}</p>
        <div class="step-details" id="details-${step.id}"></div>
      </div>
    </div>
  `).join('');
}

function resetSteps() {
  state.stepStatuses = {};
  state.steps.forEach(step => {
    updateStepUI(step.id, 'pending');
  });
  updateProgress();
}

function updateStepUI(stepId, status, details = {}) {
  const stepEl = document.getElementById(`step-${stepId}`);
  const indicatorEl = document.getElementById(`indicator-${stepId}`);
  const statusEl = document.getElementById(`status-${stepId}`);
  const detailsEl = document.getElementById(`details-${stepId}`);

  if (!stepEl) return;

  stepEl.className = `step-item status-${status}`;
  indicatorEl.className = `step-indicator status-${status}`;

  const statusText = {
    pending: '待执行',
    running: '执行中',
    completed: '已完成',
    failed: '失败'
  };
  statusEl.textContent = statusText[status] || status;

  if (details.error) {
    detailsEl.innerHTML = `<div class="error-message">${escapeHtml(details.error)}</div>`;
  } else if (details.chainDetails) {
    detailsEl.innerHTML = `
      <div class="cert-details">
        ${details.chainDetails.map((cert, idx) => `
          <div class="cert-chain-item">
            <div class="cert-chain-label">${idx === 0 ? '▼ 终端证书' : idx === details.chainDetails.length - 1 ? '▲ 根证书' : '├ 中间证书'}</div>
            <div class="cert-item"><span>主题:</span> ${escapeHtml(cert.subject)}</div>
            <div class="cert-item"><span>颁发者:</span> ${escapeHtml(cert.issuer)}</div>
            <div class="cert-item"><span>序列号:</span> ${escapeHtml(cert.serialNumber)}</div>
            <div class="cert-item"><span>CA:</span> ${cert.isCA ? '是' : '否'}</div>
            <div class="cert-item"><span>指纹:</span> <code>${escapeHtml(cert.fingerprint)}</code></div>
          </div>
        `).join('')}
      </div>
    `;
  } else if (details.certificateDetails) {
    const cert = details.certificateDetails;
    const retryInfo = cert.attempt ? `<div class="cert-item retry-info"><span>签发尝试:</span> 第 ${cert.attempt} 次</div>` : '';
    detailsEl.innerHTML = `
      <div class="cert-details">
        <div class="cert-item"><span>主题:</span> ${escapeHtml(cert.subject)}</div>
        <div class="cert-item"><span>颁发者:</span> ${escapeHtml(cert.issuer)}</div>
        <div class="cert-item"><span>序列号:</span> ${escapeHtml(cert.serialNumber)}</div>
        <div class="cert-item"><span>有效期:</span> ${formatDate(cert.validFrom)} - ${formatDate(cert.validTo)}</div>
        <div class="cert-item"><span>指纹:</span> <code>${escapeHtml(cert.fingerprint)}</code></div>
        ${retryInfo}
      </div>
    `;
  } else if (details.aclDetails) {
    const acl = details.aclDetails;
    detailsEl.innerHTML = `
      <div class="cert-details">
        <div class="cert-item"><span>Fabric ID:</span> <code>${escapeHtml(acl.fabricId)}</code></div>
        <div class="cert-item"><span>Node ID:</span> <code>${escapeHtml(acl.nodeId)}</code></div>
        <div class="cert-item"><span>ACL条目:</span> ${acl.entryCount} 条</div>
        ${acl.entries.map((entry, idx) => `
          <div class="acl-entry">
            <div class="acl-entry-header">条目 ${idx + 1}: ${escapeHtml(entry.description)}</div>
            <div class="acl-entry-detail">权限: ${escapeHtml(entry.privilege)} | 认证: ${escapeHtml(entry.authMode)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  updateProgress();
}

function updateProgress() {
  const completedCount = Object.values(state.stepStatuses).filter(s => s === 'completed').length;
  const total = state.steps.length;
  const percentage = (completedCount / total) * 100;

  elements.progressFill.style.width = `${percentage}%`;
  elements.progressText.textContent = `${completedCount}/${total}`;
}

function addLog(level, message) {
  const log = {
    level,
    message,
    timestamp: new Date().toISOString()
  };
  state.logs.push(log);
  renderLogs();
}

function renderLogs() {
  const filteredLogs = state.logFilter === 'all' 
    ? state.logs 
    : state.logs.filter(log => log.level === state.logFilter);

  elements.logsContainer.innerHTML = filteredLogs.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
    const levelIcons = {
      info: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M7 4V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M7 10H7.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
      success: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M4 7L6 9L10 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      error: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M4 4L10 10M10 4L4 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
      warn: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M7 4V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M7 10H7.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
    };

    return `
      <div class="log-item log-${log.level}">
        <span class="log-icon">${levelIcons[log.level] || ''}</span>
        <span class="log-time">[${time}]</span>
        <span class="log-message">${escapeHtml(log.message)}</span>
      </div>
    `;
  }).join('');

  elements.logsContainer.scrollTop = elements.logsContainer.scrollHeight;
}

function clearLogs() {
  state.logs = [];
  renderLogs();
}

function resetAll() {
  if (state.cameraActive) {
    stopCamera();
  }

  state.deviceInfo = null;
  state.isCommissioning = false;
  state.stepStatuses = {};
  
  elements.deviceInfoSection.style.display = 'none';
  elements.certificateSection.style.display = 'none';
  elements.startCommissioningBtn.disabled = false;
  if (elements.exportDeviceInfoBtn) {
    elements.exportDeviceInfoBtn.disabled = true;
  }
  elements.startCommissioningBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M8.99999 2.84028L2.59999 6.53694V13.9303C2.59999 14.5273 2.83712 15.0986 3.26269 15.5242C3.68826 15.9497 4.25958 16.1869 4.85661 16.1869H13.1434C13.7404 16.1869 14.3117 15.9497 14.7373 15.5242C15.1629 15.0986 15.4 14.5273 15.4 13.9303V6.53694L8.99999 2.84028Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6.6 11.6667L8.2 13.2667L11.8 9.66669" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    开始配网
  `;

  elements.qrDataInput.value = '';
  elements.discriminator.value = '';
  elements.passcode.value = '';
  elements.vendorId.value = '';
  elements.productId.value = '';
  elements.manualCode.value = '';

  resetSteps();
  addLog('info', '已重置，请重新输入设备信息');

  ipcRenderer.send('reset-commissioning');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleString('zh-CN');
}

async function exportDeviceInfo() {
  try {
    const result = await ipcRenderer.invoke('export-device-info');
    if (result.success) {
      addLog('success', '设备信息导出成功');
      
      const blob = new Blob([result.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `matter-device-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      addLog('info', '设备信息文件已下载');
    } else {
      addLog('error', `设备信息导出失败: ${result.error}`);
    }
  } catch (error) {
    addLog('error', `设备信息导出异常: ${error.message}`);
  }
}

ipcRenderer.on('qr-parsed', (event, result) => {
  if (result.success) {
    handleDeviceInfoParsed(result.data);
  } else {
    addLog('error', `QR码解析失败: ${result.error}`);
  }
});

ipcRenderer.on('manual-code-parsed', (event, result) => {
  if (result.success) {
    handleDeviceInfoParsed(result.data);
  } else {
    addLog('error', `手动配对码解析失败: ${result.error}`);
  }
});

ipcRenderer.on('commissioning-log', (event, log) => {
  addLog(log.level, log.message);
});

ipcRenderer.on('step-update', (event, update) => {
  state.stepStatuses[update.step] = update.status;
  updateStepUI(update.step, update.status, update.details);
});

ipcRenderer.on('commissioning-complete', (event, result) => {
  state.isCommissioning = false;
  elements.startCommissioningBtn.disabled = false;
  elements.exportDeviceInfoBtn.disabled = !result.success;
  
  if (result.success) {
    elements.startCommissioningBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M8.99999 2.84028L2.59999 6.53694V13.9303C2.59999 14.5273 2.83712 15.0986 3.26269 15.5242C3.68826 15.9497 4.25958 16.1869 4.85661 16.1869H13.1434C13.7404 16.1869 14.3117 15.9497 14.7373 15.5242C15.1629 15.0986 15.4 14.5273 15.4 13.9303V6.53694L8.99999 2.84028Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M6.6 11.6667L8.2 13.2667L11.8 9.66669" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      配网成功 ✓
    `;
  } else {
    elements.startCommissioningBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M8.99999 2.84028L2.59999 6.53694V13.9303C2.59999 14.5273 2.83712 15.0986 3.26269 15.5242C3.68826 15.9497 4.25958 16.1869 4.85661 16.1869H13.1434C13.7404 16.1869 14.3117 15.9497 14.7373 15.5242C15.1629 15.0986 15.4 14.5273 15.4 13.9303V6.53694L8.99999 2.84028Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M6.6 11.6667L8.2 13.2667L11.8 9.66669" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      重新配网
    `;
  }
});

ipcRenderer.on('commissioning-reset', () => {
  addLog('info', 'Commissioner状态已重置');
});

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('beforeunload', () => {
  if (state.cameraActive) {
    stopCamera();
  }
});
