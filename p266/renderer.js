const devices = new Map();
let currentFilter = '';
let pendingPinRequest = null;
let pendingConfirmRequest = null;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const refreshBtn = document.getElementById('refreshBtn');
const reconnectBtn = document.getElementById('reconnectBtn');
const exportBtn = document.getElementById('exportBtn');
const clearLogBtn = document.getElementById('clearLogBtn');
const searchInput = document.getElementById('searchInput');
const devicesBody = document.getElementById('devicesBody');
const deviceCountEl = document.getElementById('deviceCount');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const adapterPathEl = document.getElementById('adapterPath');
const logContainer = document.getElementById('logContainer');

const pinModal = document.getElementById('pinModal');
const pinInput = document.getElementById('pinInput');
const pinModalMessage = document.getElementById('pinModalMessage');
const pinModalClose = document.getElementById('pinModalClose');
const pinModalCancel = document.getElementById('pinModalCancel');
const pinModalConfirm = document.getElementById('pinModalConfirm');

const confirmModal = document.getElementById('confirmModal');
const confirmPasskey = document.getElementById('confirmPasskey');
const confirmModalClose = document.getElementById('confirmModalClose');
const confirmModalCancel = document.getElementById('confirmModalCancel');
const confirmModalConfirm = document.getElementById('confirmModalConfirm');

function log(message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

function getSignalBars(rssi) {
  if (rssi === null || rssi === undefined) {
    return '<div class="signal-bar"><span></span><span></span><span></span><span></span></div>';
  }
  
  let bars = 0;
  if (rssi >= -50) bars = 4;
  else if (rssi >= -60) bars = 3;
  else if (rssi >= -70) bars = 2;
  else if (rssi >= -80) bars = 1;
  
  let strengthClass = '';
  if (bars >= 3) strengthClass = '';
  else if (bars === 2) strengthClass = 'medium';
  else strengthClass = 'weak';
  
  let html = '<div class="signal-bar">';
  for (let i = 1; i <= 4; i++) {
    if (i <= bars) {
      html += `<span class="active ${strengthClass}"></span>`;
    } else {
      html += '<span></span>';
    }
  }
  html += '</div>';
  return html;
}

function getRssiClass(rssi) {
  if (rssi === null || rssi === undefined) return 'unknown';
  if (rssi >= -60) return 'strong';
  if (rssi >= -75) return 'medium';
  return 'weak';
}

function formatRssi(rssi) {
  if (rssi === null || rssi === undefined) return 'N/A';
  return `${rssi} dBm`;
}

function matchesFilter(device) {
  if (!currentFilter) return true;
  const filter = currentFilter.toLowerCase();
  return (
    device.name.toLowerCase().includes(filter) ||
    device.address.toLowerCase().includes(filter)
  );
}

function createDeviceRow(device) {
  const row = document.createElement('tr');
  row.className = 'device-row';
  row.dataset.path = device.path;
  
  const pairedBadge = device.paired 
    ? '<span class="status-badge paired" title="已配对">✓</span>'
    : '<span class="status-badge inactive" title="未配对">-</span>';
  
  const connectedBadge = device.connected 
    ? '<span class="status-badge connected" title="已连接">✓</span>'
    : '<span class="status-badge inactive" title="未连接">-</span>';
  
  let actionButtons = '';
  
  if (!device.paired) {
    actionButtons += `<button class="action-btn action-pair" data-action="pair" data-path="${device.path}" title="配对设备">配对</button>`;
  } else {
    if (!device.connected) {
      actionButtons += `<button class="action-btn action-connect" data-action="connect" data-path="${device.path}" title="连接设备">连接</button>`;
    } else {
      actionButtons += `<button class="action-btn action-disconnect" data-action="disconnect" data-path="${device.path}" title="断开设备">断开</button>`;
    }
    actionButtons += `<button class="action-btn action-remove" data-action="remove" data-path="${device.path}" title="移除设备">移除</button>`;
  }
  
  row.innerHTML = `
    <td>${getSignalBars(device.rssi)}</td>
    <td><span class="device-name">${escapeHtml(device.name)}</span></td>
    <td><span class="device-address">${escapeHtml(device.address)}</span></td>
    <td>${pairedBadge}</td>
    <td>${connectedBadge}</td>
    <td><span class="rssi-value ${getRssiClass(device.rssi)}">${formatRssi(device.rssi)}</span></td>
    <td><div class="action-buttons">${actionButtons}</div></td>
  `;
  
  return row;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderDevices() {
  const filteredDevices = Array.from(devices.values()).filter(matchesFilter);
  
  if (filteredDevices.length === 0) {
    devicesBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29z"/>
            </svg>
            <p>${devices.size === 0 ? '暂无设备' : '没有匹配的设备'}</p>
            <p class="hint">${devices.size === 0 ? '点击"开始扫描"搜索周边蓝牙设备' : '请尝试其他搜索关键词'}</p>
          </div>
        </td>
      </tr>
    `;
  } else {
    devicesBody.innerHTML = '';
    filteredDevices
      .sort((a, b) => {
        const rssiA = a.rssi ?? -999;
        const rssiB = b.rssi ?? -999;
        return rssiB - rssiA;
      })
      .forEach(device => {
        devicesBody.appendChild(createDeviceRow(device));
      });
  }
  
  deviceCountEl.textContent = devices.size;
}

function updateDeviceRow(device) {
  const row = devicesBody.querySelector(`tr[data-path="${device.path}"]`);
  if (row) {
    const newRow = createDeviceRow(device);
    row.parentNode.replaceChild(newRow, row);
  }
}

function updateScanningStatus(isScanning) {
  if (isScanning) {
    statusIndicator.className = 'status-indicator scanning';
    statusText.textContent = '扫描中...';
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    statusIndicator.className = 'status-indicator';
    statusText.textContent = '未扫描';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

async function loadAdapterInfo() {
  try {
    const result = await window.bluetoothAPI.getAdapterInfo();
    if (result.success && result.info) {
      adapterPathEl.textContent = result.info.path;
      updateScanningStatus(result.info.isScanning);
    } else {
      adapterPathEl.textContent = '未检测到';
      statusIndicator.className = 'status-indicator error';
      statusText.textContent = '适配器错误';
    }
  } catch (error) {
    log(`获取适配器信息失败: ${error.message}`, 'error');
  }
}

async function loadDevices() {
  try {
    const result = await window.bluetoothAPI.getDevices();
    if (result.success) {
      devices.clear();
      result.devices.forEach(device => {
        devices.set(device.path, device);
      });
      renderDevices();
      log(`已加载 ${result.devices.length} 个设备`, 'info');
    } else {
      log(`加载设备失败: ${result.error}`, 'error');
    }
  } catch (error) {
    log(`加载设备异常: ${error.message}`, 'error');
  }
}

async function pairDevice(devicePath) {
  const device = devices.get(devicePath);
  if (!device) return;
  
  try {
    log(`正在配对设备: ${device.name} (${device.address})`, 'info');
    const result = await window.bluetoothAPI.pairDevice(devicePath);
    if (result.success) {
      devices.set(devicePath, result.device);
      renderDevices();
      log(`设备配对成功: ${device.name}`, 'success');
    } else {
      log(`配对失败: ${result.error}`, 'error');
    }
  } catch (error) {
    log(`配对异常: ${error.message}`, 'error');
  }
}

async function connectDevice(devicePath) {
  const device = devices.get(devicePath);
  if (!device) return;
  
  try {
    log(`正在连接设备: ${device.name} (${device.address})`, 'info');
    const result = await window.bluetoothAPI.connectDevice(devicePath);
    if (result.success) {
      devices.set(devicePath, result.device);
      renderDevices();
      log(`设备已连接: ${device.name}`, 'success');
    } else {
      log(`连接失败: ${result.error}`, 'error');
    }
  } catch (error) {
    log(`连接异常: ${error.message}`, 'error');
  }
}

async function disconnectDevice(devicePath) {
  const device = devices.get(devicePath);
  if (!device) return;
  
  try {
    log(`正在断开设备: ${device.name} (${device.address})`, 'info');
    const result = await window.bluetoothAPI.disconnectDevice(devicePath);
    if (result.success) {
      devices.set(devicePath, result.device);
      renderDevices();
      log(`设备已断开: ${device.name}`, 'success');
    } else {
      log(`断开失败: ${result.error}`, 'error');
    }
  } catch (error) {
    log(`断开异常: ${error.message}`, 'error');
  }
}

async function removeDevice(devicePath) {
  const device = devices.get(devicePath);
  if (!device) return;
  
  if (!confirm(`确定要移除设备 "${device.name}" 吗？`)) return;
  
  try {
    log(`正在移除设备: ${device.name} (${device.address})`, 'info');
    const result = await window.bluetoothAPI.removeDevice(devicePath);
    if (result.success) {
      devices.delete(devicePath);
      renderDevices();
      log(`设备已移除: ${device.name}`, 'success');
    } else {
      log(`移除失败: ${result.error}`, 'error');
    }
  } catch (error) {
    log(`移除异常: ${error.message}`, 'error');
  }
}

function showPinModal(devicePath) {
  pendingPinRequest = devicePath;
  pinModalMessage.textContent = `请输入设备的PIN码进行配对`;
  pinInput.value = '';
  pinModal.style.display = 'flex';
  pinInput.focus();
}

function hidePinModal() {
  pinModal.style.display = 'none';
  pendingPinRequest = null;
}

function showConfirmModal(passkey, devicePath) {
  pendingConfirmRequest = { devicePath, passkey };
  confirmPasskey.textContent = String(passkey).padStart(6, '0');
  confirmModal.style.display = 'flex';
}

function hideConfirmModal() {
  confirmModal.style.display = 'none';
  pendingConfirmRequest = null;
}

async function exportCSV() {
  try {
    log('正在导出设备列表...', 'info');
    const result = await window.bluetoothAPI.exportDevicesCSV();
    if (result.success) {
      const blob = new Blob([result.content], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `bluetooth_devices_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      log('设备列表已导出为CSV', 'success');
    } else {
      log(`导出失败: ${result.error}`, 'error');
    }
  } catch (error) {
    log(`导出异常: ${error.message}`, 'error');
  }
}

startBtn.addEventListener('click', async () => {
  try {
    log('正在开始扫描...', 'info');
    const result = await window.bluetoothAPI.startScan();
    if (result.success) {
      log('扫描已开始', 'success');
    } else {
      log(`开始扫描失败: ${result.error}`, 'error');
    }
  } catch (error) {
    log(`开始扫描异常: ${error.message}`, 'error');
  }
});

stopBtn.addEventListener('click', async () => {
  try {
    log('正在停止扫描...', 'info');
    const result = await window.bluetoothAPI.stopScan();
    if (result.success) {
      log('扫描已停止', 'success');
    } else {
      log(`停止扫描失败: ${result.error}`, 'error');
    }
  } catch (error) {
    log(`停止扫描异常: ${error.message}`, 'error');
  }
});

refreshBtn.addEventListener('click', () => {
  log('正在刷新设备列表...', 'info');
  loadDevices();
});

reconnectBtn.addEventListener('click', async () => {
  try {
    log('正在重新连接 BlueZ...', 'info');
    const result = await window.bluetoothAPI.initBlueZ();
    if (result.success) {
      log('已重新连接 BlueZ', 'success');
      await loadAdapterInfo();
      await loadDevices();
    } else {
      log('重新连接失败', 'error');
    }
  } catch (error) {
    log(`重新连接异常: ${error.message}`, 'error');
  }
});

exportBtn.addEventListener('click', exportCSV);

clearLogBtn.addEventListener('click', () => {
  logContainer.innerHTML = '';
  log('日志已清空', 'info');
});

searchInput.addEventListener('input', (e) => {
  currentFilter = e.target.value.trim();
  renderDevices();
});

devicesBody.addEventListener('click', (e) => {
  const btn = e.target.closest('.action-btn');
  if (!btn) return;
  
  const action = btn.dataset.action;
  const devicePath = btn.dataset.path;
  
  if (!devicePath) return;
  
  switch (action) {
    case 'pair':
      pairDevice(devicePath);
      break;
    case 'connect':
      connectDevice(devicePath);
      break;
    case 'disconnect':
      disconnectDevice(devicePath);
      break;
    case 'remove':
      removeDevice(devicePath);
      break;
  }
});

pinModalClose.addEventListener('click', hidePinModal);
pinModalCancel.addEventListener('click', hidePinModal);
pinModalConfirm.addEventListener('click', async () => {
  const pinCode = pinInput.value.trim();
  if (!pinCode) {
    log('请输入PIN码', 'warning');
    return;
  }
  
  if (pendingPinRequest) {
    try {
      log(`正在提交PIN码...`, 'info');
      await window.bluetoothAPI.providePin(pendingPinRequest, pinCode);
      log('PIN码已提交', 'success');
    } catch (error) {
      log(`提交PIN码失败: ${error.message}`, 'error');
    }
  }
  hidePinModal();
});

pinInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    pinModalConfirm.click();
  }
});

confirmModalClose.addEventListener('click', hideConfirmModal);
confirmModalCancel.addEventListener('click', hideConfirmModal);
confirmModalConfirm.addEventListener('click', async () => {
  if (pendingConfirmRequest) {
    try {
      log(`确认配对码: ${pendingConfirmRequest.passkey}`, 'info');
      await window.bluetoothAPI.providePin(pendingConfirmRequest.devicePath, pendingConfirmRequest.passkey, true);
      log('配对码已确认', 'success');
    } catch (error) {
      log(`确认配对码失败: ${error.message}`, 'error');
    }
  }
  hideConfirmModal();
});

window.bluetoothAPI.onDeviceAdded((device) => {
  devices.set(device.path, device);
  renderDevices();
  log(`发现设备: ${device.name || '未知'} (${device.address})`, 'success');
});

window.bluetoothAPI.onDeviceRemoved((device) => {
  if (devices.has(device.path)) {
    const removedDevice = devices.get(device.path);
    devices.delete(device.path);
    renderDevices();
    log(`设备已移除: ${removedDevice.name || '未知'} (${device.address})`, 'warning');
  }
});

window.bluetoothAPI.onDeviceUpdated((device) => {
  if (devices.has(device.path)) {
    devices.set(device.path, device);
    updateDeviceRow(device);
  }
});

window.bluetoothAPI.onScanningChanged((isScanning) => {
  updateScanningStatus(isScanning);
  log(isScanning ? '扫描状态: 进行中' : '扫描状态: 已停止', 'info');
});

window.bluetoothAPI.onRequestPin((data) => {
  log(`设备请求PIN码: ${data.device}`, 'warning');
  showPinModal(data.device);
});

window.bluetoothAPI.onRequestPasskey((data) => {
  log(`设备请求配对码: ${data.device}`, 'warning');
  showPinModal(data.device);
});

window.bluetoothAPI.onRequestConfirmation((data) => {
  log(`请确认配对码: ${data.passkey} (设备: ${data.device})`, 'warning');
  showConfirmModal(data.passkey, data.device);
});

window.bluetoothAPI.onDisplayPin((data) => {
  log(`设备PIN码: ${data.pinCode} (设备: ${data.device})`, 'info');
});

window.bluetoothAPI.onDisplayPasskey((data) => {
  log(`设备配对码: ${data.passkey} (已输入: ${data.entered})`, 'info');
});

window.addEventListener('beforeunload', () => {
  window.bluetoothAPI.removeAllListeners();
});

async function init() {
  log('正在初始化...', 'info');
  await loadAdapterInfo();
  await loadDevices();
  log('初始化完成', 'success');
}

init();
