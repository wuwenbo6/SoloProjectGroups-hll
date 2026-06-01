const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const hostInput = document.getElementById('hostInput');
const deviceInput = document.getElementById('deviceInput');
const commandInput = document.getElementById('commandInput');
const sendBtn = document.getElementById('sendBtn');
const queryBtn = document.getElementById('queryBtn');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const quickBtns = document.querySelectorAll('.quick-btn');

const discoverBtn = document.getElementById('discoverBtn');
const deviceList = document.getElementById('deviceList');

const takeSnapshotBtn = document.getElementById('takeSnapshotBtn');
const loadSnapshotBtn = document.getElementById('loadSnapshotBtn');
const listSnapshotsBtn = document.getElementById('listSnapshotsBtn');
const snapshotContent = document.getElementById('snapshotContent');
const snapshotList = document.getElementById('snapshotList');
const snapshotListContent = document.getElementById('snapshotListContent');
const closeSnapshotListBtn = document.getElementById('closeSnapshotListBtn');

let commandHistory = [];
let isConnected = false;
let currentSnapshot = null;

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function updateConnectionStatus(connected, connecting = false) {
  isConnected = connected;
  statusIndicator.classList.remove('connected', 'connecting');

  if (connecting) {
    statusIndicator.classList.add('connecting');
    statusText.textContent = '连接中...';
  } else if (connected) {
    statusIndicator.classList.add('connected');
    statusText.textContent = '已连接';
  } else {
    statusText.textContent = '未连接';
  }

  connectBtn.disabled = connected || connecting;
  disconnectBtn.disabled = !connected || connecting;
  hostInput.disabled = connected || connecting;
  deviceInput.disabled = connected || connecting;
  commandInput.disabled = !connected;
  sendBtn.disabled = !connected;
  queryBtn.disabled = !connected;
  quickBtns.forEach(btn => btn.disabled = !connected);
  takeSnapshotBtn.disabled = !connected;
}

function formatTimestamp(date) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN');
}

function addHistoryItem(command, response, type, success) {
  const item = {
    id: Date.now(),
    command,
    response,
    type,
    success,
    timestamp: new Date()
  };

  commandHistory.unshift(item);
  renderHistory();
}

function renderHistory() {
  if (commandHistory.length === 0) {
    historyList.innerHTML = '<div class="empty-history">暂无命令记录</div>';
    return;
  }

  historyList.innerHTML = commandHistory.map(item => `
    <div class="history-item ${item.success ? 'success' : 'error'}">
      <div class="history-header">
        <span class="history-type ${item.type}">${item.type === 'query' ? '查询' : '发送'}</span>
        <span class="history-timestamp">${formatTimestamp(item.timestamp)}</span>
      </div>
      <div class="history-command">&gt; ${escapeHtml(item.command)}</div>
      <div class="history-response ${item.success ? '' : 'error'}">${escapeHtml(item.response)}</div>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderDeviceList(devices) {
  if (!devices || devices.length === 0) {
    deviceList.innerHTML = '<div class="empty-devices">未发现任何VXI-11设备，请确保设备已联网</div>';
    return;
  }

  deviceList.innerHTML = devices.map(device => `
    <div class="device-item" data-host="${device.host}" data-port="${device.port}">
      <div class="device-info">
        <div class="device-host">${device.host}</div>
        <div class="device-port">端口: ${device.port}</div>
        <div class="device-detected">发现于: ${formatDateTime(device.detectedAt)}</div>
      </div>
      <button class="device-connect-btn" data-host="${device.host}">连接</button>
    </div>
  `).join('');

  document.querySelectorAll('.device-connect-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const host = btn.dataset.host;
      hostInput.value = host;
      connectBtn.click();
    });
  });
}

function renderSnapshot(snapshot) {
  if (!snapshot) {
    snapshotContent.innerHTML = '<div class="empty-snapshot">连接设备后可保存当前状态快照</div>';
    return;
  }

  const settingsHtml = Object.entries(snapshot.settings).map(([name, setting]) => `
    <div class="setting-item ${setting.error ? 'error' : ''}">
      <div class="setting-name">${name}</div>
      <div class="setting-cmd">${escapeHtml(setting.command)}</div>
      <div class="setting-value ${setting.error ? 'error' : ''}">
        ${setting.error ? escapeHtml(setting.error) : escapeHtml(setting.value)}
      </div>
    </div>
  `).join('');

  snapshotContent.innerHTML = `
    <div class="snapshot-header">
      <div>
        <div class="snapshot-title">仪器状态快照</div>
        <div class="snapshot-meta">
          主机: ${escapeHtml(snapshot.host)} | 设备: ${escapeHtml(snapshot.device)} | 创建时间: ${formatDateTime(snapshot.createdAt)}
        </div>
      </div>
      <div class="snapshot-actions">
        <button class="btn btn-small" id="saveSnapshotToFileBtn">保存到文件</button>
        <button class="btn btn-small" id="restoreSnapshotBtn" ${!isConnected ? 'disabled' : ''}>恢复设置</button>
      </div>
    </div>
    <div class="setting-grid">
      ${settingsHtml}
    </div>
    <div id="restoreResultsContainer"></div>
  `;

  const saveBtn = document.getElementById('saveSnapshotToFileBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      try {
        const defaultFilename = await window.electronAPI.generateSnapshotFilename();
        const dialogResult = await window.electronAPI.showSaveDialog(defaultFilename);
        if (!dialogResult.canceled && dialogResult.filePath) {
          const saveResult = await window.electronAPI.saveSnapshot(dialogResult.filePath);
          if (saveResult.success) {
            showToast(`快照已保存到: ${saveResult.path}`, 'success');
          } else {
            showToast('保存失败: ' + saveResult.message, 'error');
          }
        }
      } catch (error) {
        showToast('保存失败: ' + error.message, 'error');
      }
    });
  }

  const restoreBtn = document.getElementById('restoreSnapshotBtn');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', async () => {
      try {
        const result = await window.electronAPI.restoreSnapshot(snapshot);
        if (result.success) {
          renderRestoreResults(result.results);
          const successCount = result.results.filter(r => r.success).length;
          showToast(`恢复完成: ${successCount}/${result.results.length} 项成功`, successCount > 0 ? 'success' : 'error');
        } else {
          showToast('恢复失败: ' + result.message, 'error');
        }
      } catch (error) {
        showToast('恢复失败: ' + error.message, 'error');
      }
    });
  }
}

function renderRestoreResults(results) {
  const container = document.getElementById('restoreResultsContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="restore-results">
      <h3 style="font-size: 14px; margin-bottom: 10px; color: #89b4fa;">恢复结果</h3>
      ${results.map(r => `
        <div class="restore-result-item ${r.success ? 'success' : 'error'}">
          <span class="restore-result-name">${r.name}</span>
          <span class="restore-result-status ${r.success ? 'success' : 'error'}">
            ${r.success ? '✓ 成功' : '✗ ' + escapeHtml(r.error)}
          </span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSnapshotList(snapshots) {
  if (!snapshots || snapshots.length === 0) {
    snapshotListContent.innerHTML = '<div class="empty-snapshot">暂无已保存的快照</div>';
    return;
  }

  snapshotListContent.innerHTML = snapshots.map(snap => `
    <div class="snapshot-list-item" data-path="${snap.path}">
      <div class="snapshot-list-info">
        <div class="snapshot-list-identity">${escapeHtml(snap.identity)}</div>
        <div class="snapshot-list-host">${escapeHtml(snap.host)} | ${escapeHtml(snap.device)}</div>
        <div class="snapshot-list-date">${formatDateTime(snap.createdAt)}</div>
      </div>
      <div class="snapshot-list-actions">
        <button class="btn btn-primary" data-action="load" data-path="${snap.path}">加载</button>
        ${isConnected ? `<button class="btn btn-secondary" data-action="restore" data-path="${snap.path}">恢复</button>` : ''}
      </div>
    </div>
  `).join('');

  snapshotListContent.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const filePath = btn.dataset.path;

      try {
        const loadResult = await window.electronAPI.loadSnapshot(filePath);
        if (loadResult.success) {
          currentSnapshot = loadResult.snapshot;
          renderSnapshot(currentSnapshot);
          snapshotList.style.display = 'none';

          if (action === 'restore') {
            const restoreResult = await window.electronAPI.restoreSnapshot(currentSnapshot);
            if (restoreResult.success) {
              renderRestoreResults(restoreResult.results);
              const successCount = restoreResult.results.filter(r => r.success).length;
              showToast(`恢复完成: ${successCount}/${restoreResult.results.length} 项成功`, successCount > 0 ? 'success' : 'error');
            }
          } else {
            showToast('快照已加载', 'success');
          }
        } else {
          showToast('加载失败: ' + loadResult.message, 'error');
        }
      } catch (error) {
        showToast('操作失败: ' + error.message, 'error');
      }
    });
  });
}

connectBtn.addEventListener('click', async () => {
  const host = hostInput.value.trim();
  const device = deviceInput.value.trim() || 'inst0';

  if (!host) {
    showToast('请输入仪器IP地址', 'error');
    return;
  }

  updateConnectionStatus(false, true);

  try {
    const result = await window.electronAPI.connect(host, device);
    if (result.success) {
      updateConnectionStatus(true);
      showToast(result.message, 'success');
    } else {
      updateConnectionStatus(false);
      showToast(result.message, 'error');
    }
  } catch (error) {
    updateConnectionStatus(false);
    showToast('连接失败: ' + error.message, 'error');
  }
});

disconnectBtn.addEventListener('click', async () => {
  try {
    const result = await window.electronAPI.disconnect();
    updateConnectionStatus(false);
    showToast(result.message, 'info');
  } catch (error) {
    showToast('断开连接失败: ' + error.message, 'error');
  }
});

sendBtn.addEventListener('click', async () => {
  const command = commandInput.value.trim();
  if (!command) {
    showToast('请输入SCPI命令', 'error');
    return;
  }

  sendBtn.disabled = true;
  queryBtn.disabled = true;

  try {
    const result = await window.electronAPI.sendCommand(command);
    addHistoryItem(command, result.response, 'send', result.success);
    if (!result.success) {
      showToast('命令执行失败', 'error');
    }
  } catch (error) {
    addHistoryItem(command, error.message, 'send', false);
    showToast('发送失败: ' + error.message, 'error');
  } finally {
    sendBtn.disabled = false;
    queryBtn.disabled = false;
    commandInput.value = '';
    commandInput.focus();
  }
});

queryBtn.addEventListener('click', async () => {
  const command = commandInput.value.trim();
  if (!command) {
    showToast('请输入SCPI命令', 'error');
    return;
  }

  sendBtn.disabled = true;
  queryBtn.disabled = true;

  try {
    const result = await window.electronAPI.query(command);
    addHistoryItem(command, result.response, 'query', result.success);
    if (!result.success) {
      showToast('查询失败', 'error');
    }
  } catch (error) {
    addHistoryItem(command, error.message, 'query', false);
    showToast('查询失败: ' + error.message, 'error');
  } finally {
    sendBtn.disabled = false;
    queryBtn.disabled = false;
    commandInput.value = '';
    commandInput.focus();
  }
});

commandInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      queryBtn.click();
    } else {
      sendBtn.click();
    }
  }
});

quickBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd;
    commandInput.value = cmd;
    if (cmd.endsWith('?')) {
      queryBtn.click();
    } else {
      sendBtn.click();
    }
  });
});

clearHistoryBtn.addEventListener('click', () => {
  commandHistory = [];
  renderHistory();
  showToast('历史记录已清空', 'info');
});

discoverBtn.addEventListener('click', async () => {
  discoverBtn.disabled = true;
  deviceList.innerHTML = `
    <div class="scanning-indicator">
      <div class="scanning-spinner"></div>
      <span>正在扫描局域网内的VXI-11设备...</span>
    </div>
  `;

  try {
    const result = await window.electronAPI.discoverDevices();
    if (result.success) {
      renderDeviceList(result.devices);
      showToast(`扫描完成，发现 ${result.devices.length} 台设备`, 'info');
    } else {
      deviceList.innerHTML = '<div class="empty-devices">扫描失败: ' + escapeHtml(result.message) + '</div>';
      showToast('扫描失败: ' + result.message, 'error');
    }
  } catch (error) {
    deviceList.innerHTML = '<div class="empty-devices">扫描失败: ' + escapeHtml(error.message) + '</div>';
    showToast('扫描失败: ' + error.message, 'error');
  } finally {
    discoverBtn.disabled = false;
  }
});

takeSnapshotBtn.addEventListener('click', async () => {
  takeSnapshotBtn.disabled = true;
  snapshotContent.innerHTML = `
    <div class="scanning-indicator">
      <div class="scanning-spinner"></div>
      <span>正在获取仪器状态...</span>
    </div>
  `;

  try {
    const result = await window.electronAPI.takeSnapshot();
    if (result.success) {
      currentSnapshot = result.snapshot;
      renderSnapshot(currentSnapshot);
      showToast('快照已获取', 'success');
    } else {
      snapshotContent.innerHTML = '<div class="empty-snapshot">获取失败: ' + escapeHtml(result.message) + '</div>';
      showToast('获取快照失败: ' + result.message, 'error');
    }
  } catch (error) {
    snapshotContent.innerHTML = '<div class="empty-snapshot">获取失败: ' + escapeHtml(error.message) + '</div>';
    showToast('获取快照失败: ' + error.message, 'error');
  } finally {
    takeSnapshotBtn.disabled = false;
  }
});

loadSnapshotBtn.addEventListener('click', async () => {
  try {
    const dialogResult = await window.electronAPI.showOpenDialog();
    if (!dialogResult.canceled && dialogResult.filePaths && dialogResult.filePaths.length > 0) {
      const loadResult = await window.electronAPI.loadSnapshot(dialogResult.filePaths[0]);
      if (loadResult.success) {
        currentSnapshot = loadResult.snapshot;
        renderSnapshot(currentSnapshot);
        showToast('快照已加载', 'success');
      } else {
        showToast('加载失败: ' + loadResult.message, 'error');
      }
    }
  } catch (error) {
    showToast('加载失败: ' + error.message, 'error');
  }
});

listSnapshotsBtn.addEventListener('click', async () => {
  if (snapshotList.style.display === 'none' || !snapshotList.style.display) {
    try {
      const result = await window.electronAPI.listSnapshots();
      if (result.success) {
        renderSnapshotList(result.snapshots);
        snapshotList.style.display = 'block';
      } else {
        showToast('获取列表失败: ' + result.message, 'error');
      }
    } catch (error) {
      showToast('获取列表失败: ' + error.message, 'error');
    }
  } else {
    snapshotList.style.display = 'none';
  }
});

closeSnapshotListBtn.addEventListener('click', () => {
  snapshotList.style.display = 'none';
});

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const connected = await window.electronAPI.isConnected();
    updateConnectionStatus(connected);
  } catch (e) {
    updateConnectionStatus(false);
  }
});
