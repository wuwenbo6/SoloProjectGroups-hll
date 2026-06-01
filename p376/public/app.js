const statusMap = {
  'idle': '空闲',
  'upgrading': '升级中',
  'complete': '升级完成',
  'error': '升级失败',
  'restarting': '重启中',
  'up-to-date': '已是最新',
};

const statusClassMap = {
  'idle': 'idle',
  'upgrading': 'upgrading',
  'complete': 'complete',
  'error': 'error',
  'restarting': 'restarting',
  'up-to-date': 'up-to-date',
};

let devices = [];
let firmwareInfo = null;
let currentStats = null;
let groupTasks = [];
let selectedDevices = new Set();
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatVersion(version) {
  if (typeof version === 'number') {
    const major = (version >> 24) & 0xFF;
    const minor = (version >> 16) & 0xFF;
    const patch = version & 0xFFFF;
    return `${major}.${minor}.${patch}`;
  }
  return version;
}

function formatShortAddress(addr) {
  return '0x' + addr.toString(16).padStart(4, '0').toUpperCase();
}

function formatIeeeAddress(addr) {
  if (typeof addr === 'string') {
    return addr.match(/.{2}/g).join(':');
  }
  return addr;
}

function shortIeee(addr) {
  if (typeof addr === 'string' && addr.length >= 8) {
    return '..' + addr.slice(-6);
  }
  return addr;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes > 0 ? `${minutes}分${secs}秒` : `${secs}秒`;
}

function getTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function addLog(message, type = 'info') {
  const container = document.getElementById('logContainer');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-timestamp">[${getTimestamp()}]</span>${message}`;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

function updateServerStatus(connected) {
  const indicator = document.getElementById('serverStatus');
  const text = document.getElementById('serverStatusText');
  
  if (connected) {
    indicator.className = 'status-indicator connected';
    text.textContent = '已连接';
    reconnectAttempts = 0;
  } else {
    indicator.className = 'status-indicator error';
    text.textContent = '连接断开';
  }
}

function updateFirmwareInfo(info) {
  firmwareInfo = info;
  document.getElementById('firmwareVersion').textContent = info.version;
  document.getElementById('firmwareSize').textContent = formatBytes(info.size);
  document.getElementById('firmwareCrc').textContent = info.crc32;
  document.getElementById('blockSize').textContent = formatBytes(info.blockSize);
}

function updateStatsDisplay(stats) {
  currentStats = stats;
  document.getElementById('statTotalAttempts').textContent = stats.totalAttempts;
  document.getElementById('statSuccesses').textContent = stats.successes;
  document.getElementById('statFailures').textContent = stats.failures;
  document.getElementById('statSuccessRate').textContent = stats.successRate + '%';

  const detailsContainer = document.getElementById('statsDetails');
  if (!stats.devices || stats.devices.length === 0) {
    detailsContainer.innerHTML = '<div class="empty-state small"><p>暂无统计数据</p></div>';
    return;
  }

  detailsContainer.innerHTML = stats.devices.map(d => {
    const rowClass = d.lastStatus === 'success' ? 'success-row' : (d.lastStatus === 'failure' ? 'failure-row' : '');
    const statusTag = d.lastStatus === 'success'
      ? '<span class="tag success-tag">成功</span>'
      : (d.lastStatus === 'failure' ? `<span class="tag failure-tag">失败</span>` : '');
    const retryTag = d.retries > 0 ? `<span class="tag retry-tag">${d.retries}次重试</span>` : '';

    return `
      <div class="stats-device-row ${rowClass}">
        <span class="stats-device-addr">${shortIeee(d.ieeeAddress)}</span>
        <div class="stats-device-info">
          ${statusTag}
          ${retryTag}
          <span>${d.totalAttempts}次</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderGroupTasks() {
  const container = document.getElementById('groupTasks');
  if (groupTasks.length === 0) {
    container.innerHTML = '<div class="empty-state small"><p>选择设备后启动组播升级</p></div>';
    return;
  }

  container.innerHTML = groupTasks.map(task => {
    const statusClass = task.status === 'completed' ? 'completed' : '';
    const statusText = task.status === 'in_progress' ? '进行中' : '已完成';
    const statusBadge = task.status === 'in_progress' ? 'in_progress' : 'completed';

    const deviceChips = task.devices.map(d => {
      const chipClass = d.status === 'success' ? 'success' : (d.status === 'failure' ? 'failure' : 'pending');
      return `<span class="group-device-chip ${chipClass}">${shortIeee(d.ieeeAddress)}</span>`;
    }).join('');

    return `
      <div class="group-task-card ${statusClass}">
        <div class="group-task-header">
          <span class="group-task-id">${task.id}</span>
          <span class="group-task-status ${statusBadge}">${statusText}</span>
        </div>
        <div class="group-task-progress">
          <span>总数: ${task.total}</span>
          <span>完成: ${task.completed - task.failed}</span>
          <span style="color: #e74c3c">失败: ${task.failed}</span>
        </div>
        <div class="group-task-devices">${deviceChips}</div>
      </div>
    `;
  }).join('');
}

function renderDeviceCard(device) {
  const statusClass = statusClassMap[device.status] || 'idle';
  const statusText = statusMap[device.status] || '未知';
  const isSelected = selectedDevices.has(device.ieeeAddress);
  const isUpgrading = device.status === 'upgrading' || device.status === 'complete' || device.status === 'restarting';
  
  let progressHtml = '';
  if (isUpgrading) {
    const progressFillClass = device.status === 'complete' ? 'progress-fill complete' : 'progress-fill';
    progressHtml = `
      <div class="progress-container">
        <div class="progress-bar">
          <div class="${progressFillClass}" style="width: ${device.upgradeProgress}%"></div>
        </div>
        <div class="progress-text">${device.upgradeProgress}%</div>
      </div>
    `;
  }

  const canSelect = device.status === 'idle' || device.status === 'error';

  return `
    <div class="device-card ${statusClass} ${isSelected ? 'selected' : ''}" data-ieee="${device.ieeeAddress}">
      ${canSelect ? `<input type="checkbox" class="device-select" data-ieee="${device.ieeeAddress}" ${isSelected ? 'checked' : ''} />` : ''}
      <div class="device-header">
        <div class="device-info">
          <h3>设备 ${formatShortAddress(device.shortAddress)}</h3>
          <div class="ieee-address">${formatIeeeAddress(device.ieeeAddress)}</div>
        </div>
        <span class="device-status ${statusClass}">${statusText}</span>
      </div>
      <div class="device-versions">
        <div class="version-item">
          <div class="label">当前版本</div>
          <div class="value">${formatVersion(device.currentVersion)}</div>
        </div>
        <div class="version-item">
          <div class="label">目标版本</div>
          <div class="value">${firmwareInfo ? firmwareInfo.version : '--'}</div>
        </div>
      </div>
      ${progressHtml}
    </div>
  `;
}

function renderDevices() {
  const container = document.getElementById('devicesList');
  const countSpan = document.getElementById('deviceCount');
  
  countSpan.textContent = `(${devices.length})`;
  
  if (devices.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>暂无设备连接</p>
        <p class="hint">运行 <code>npm run test-device</code> 启动模拟设备</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = devices.map(renderDeviceCard).join('');

  container.querySelectorAll('.device-select').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const ieee = e.target.dataset.ieee;
      if (e.target.checked) {
        selectedDevices.add(ieee);
      } else {
        selectedDevices.delete(ieee);
      }
      updateGroupButton();
    });
  });
}

function updateGroupButton() {
  const btn = document.getElementById('startGroupBtn');
  const count = selectedDevices.size;
  btn.textContent = count > 0 ? `启动组播升级 (${count}台)` : '启动组播升级';
  btn.disabled = count === 0;
}

function updateDevice(device) {
  const index = devices.findIndex(d => d.ieeeAddress === device.ieeeAddress);
  if (index >= 0) {
    devices[index] = { ...devices[index], ...device };
  } else {
    devices.push(device);
  }
  renderDevices();
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('WebSocket connected');
    updateServerStatus(true);
    addLog('WebSocket 连接成功', 'success');
  };
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    addLog('WebSocket 连接错误', 'error');
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected');
    updateServerStatus(false);
    addLog('WebSocket 连接已断开', 'warning');
    
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      addLog(`尝试重新连接 (${reconnectAttempts}/${maxReconnectAttempts})...`, 'info');
      setTimeout(connectWebSocket, 2000);
    } else {
      addLog('达到最大重连次数，请刷新页面重试', 'error');
    }
  };
}

function handleWebSocketMessage(message) {
  switch (message.type) {
    case 'deviceList':
      devices = message.devices;
      renderDevices();
      addLog(`已加载 ${devices.length} 个设备`, 'info');
      break;
      
    case 'firmwareInfo':
      updateFirmwareInfo(message.firmware);
      addLog(`固件版本: ${message.firmware.version}`, 'info');
      break;

    case 'statsUpdate':
      updateStatsDisplay(message.stats);
      break;

    case 'groupTasks':
      groupTasks = message.tasks.map(t => ({
        id: t.id,
        status: t.status,
        total: t.total || t.devices.length,
        completed: t.completed || 0,
        failed: t.failed || 0,
        startedAt: t.startedAt,
        completedAt: t.completedAt,
        devices: t.devices || [],
      }));
      renderGroupTasks();
      break;

    case 'groupTaskStart':
      groupTasks.unshift({
        id: message.task.id,
        status: message.task.status,
        total: message.task.total || message.task.devices.length,
        completed: message.task.completed || 0,
        failed: message.task.failed || 0,
        startedAt: message.task.startedAt,
        completedAt: message.task.completedAt,
        devices: message.task.devices || [],
      });
      renderGroupTasks();
      addLog(`组播升级启动: ${message.task.id} (${message.task.devices.length} 台设备)`, 'info');
      break;

    case 'groupTaskUpdate':
      const idx = groupTasks.findIndex(t => t.id === message.task.id);
      if (idx >= 0) {
        groupTasks[idx] = {
          ...groupTasks[idx],
          status: message.task.status,
          total: message.task.total,
          completed: message.task.completed,
          failed: message.task.failed,
          completedAt: message.task.completedAt,
          devices: message.task.devices,
        };
      }
      renderGroupTasks();
      break;

    case 'groupTaskComplete':
      const ci = groupTasks.findIndex(t => t.id === message.task.id);
      if (ci >= 0) {
        groupTasks[ci].status = 'completed';
        groupTasks[ci].completedAt = message.task.completedAt;
      }
      renderGroupTasks();
      addLog(`组播升级完成: ${message.task.id} - 成功${message.task.completed - message.task.failed}台, 失败${message.task.failed}台`, 
        message.task.failed > 0 ? 'warning' : 'success');
      break;
      
    case 'deviceUpdate':
      updateDevice(message.device);
      break;
      
    case 'upgradeStart':
      addLog(`设备 ${formatIeeeAddress(message.device.ieeeAddress)} 开始升级`, 'info');
      addLog(`从版本 ${formatVersion(message.device.fromVersion)} 升级到 ${message.device.toVersion}`, 'info');
      break;
      
    case 'progressUpdate':
      break;
      
    case 'upgradeComplete':
      addLog(`设备 ${formatIeeeAddress(message.device.ieeeAddress)} 升级完成! 耗时: ${formatDuration(message.device.duration)}`, 'success');
      break;
      
    case 'deviceRestart':
      addLog(`设备 ${formatIeeeAddress(message.device.ieeeAddress)} 正在重启...`, 'warning');
      break;

    case 'upgradeResumed':
      addLog(`设备 ${formatIeeeAddress(message.device.ieeeAddress)} 从块 #${message.device.resumeBlock} 恢复升级`, 'info');
      break;
      
    default:
      console.log('Unknown message type:', message.type);
  }
}

async function startGroupUpgrade() {
  if (selectedDevices.size === 0) return;

  const addresses = Array.from(selectedDevices);
  
  try {
    const response = await fetch('/api/group_upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceAddresses: addresses }),
    });

    const result = await response.json();
    
    if (response.ok) {
      addLog(`组播升级已发起: ${result.taskId} (${result.totalDevices} 台设备)`, 'success');
      selectedDevices.clear();
      updateGroupButton();
      renderDevices();
    } else {
      addLog(`组播升级失败: ${result.error}`, 'error');
    }
  } catch (error) {
    addLog(`组播升级请求失败: ${error.message}`, 'error');
  }
}

function selectAllDevices() {
  const selectableDevices = devices.filter(d => d.status === 'idle' || d.status === 'error');
  
  if (selectedDevices.size === selectableDevices.length && selectableDevices.length > 0) {
    selectedDevices.clear();
  } else {
    selectableDevices.forEach(d => selectedDevices.add(d.ieeeAddress));
  }
  
  updateGroupButton();
  renderDevices();
}

function showExportModal() {
  document.getElementById('exportModal').style.display = 'flex';
}

function hideExportModal() {
  document.getElementById('exportModal').style.display = 'none';
}

function exportStats(format) {
  const url = format === 'json' ? '/api/stats/export/json' : '/api/stats/export/csv';
  const link = document.createElement('a');
  link.href = url;
  link.download = format === 'json' ? 'ota-stats.json' : 'ota-stats.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  hideExportModal();
  addLog(`统计数据已导出 (${format.toUpperCase()})`, 'success');
}

document.addEventListener('DOMContentLoaded', () => {
  addLog('ZigBee OTA 升级服务器已启动', 'success');
  addLog('等待设备连接...', 'info');
  connectWebSocket();

  document.getElementById('selectAllBtn').addEventListener('click', selectAllDevices);
  document.getElementById('startGroupBtn').addEventListener('click', startGroupUpgrade);
  document.getElementById('startGroupBtn').disabled = true;
  document.getElementById('exportStatsBtn').addEventListener('click', showExportModal);
  document.getElementById('closeExportModal').addEventListener('click', hideExportModal);
  document.getElementById('exportJsonBtn').addEventListener('click', () => exportStats('json'));
  document.getElementById('exportCsvBtn').addEventListener('click', () => exportStats('csv'));

  document.getElementById('exportModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideExportModal();
  });
});
