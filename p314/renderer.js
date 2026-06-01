let devices = [];
let channels = [];
let isConnected = false;
let channelUpdateInterval = null;

const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const refreshBtn = document.getElementById('refreshBtn');
const refreshChannelsBtn = document.getElementById('refreshChannelsBtn');
const clearLogBtn = document.getElementById('clearLogBtn');
const exportStatsBtn = document.getElementById('exportStatsBtn');
const devicesList = document.getElementById('devicesList');
const channelsList = document.getElementById('channelsList');
const deviceCount = document.getElementById('deviceCount');
const channelCount = document.getElementById('channelCount');
const logContent = document.getElementById('logContent');
const connectionStatus = document.getElementById('connectionStatus');
const toast = document.getElementById('toast');
const statsSummary = document.getElementById('statsSummary');
const statsGrid = document.getElementById('statsGrid');

const hostInput = document.getElementById('host');
const portInput = document.getElementById('port');
const passwordInput = document.getElementById('password');

async function init() {
  log('info', '应用初始化中...');

  try {
    const savedConnection = await window.spiceAPI.getConnection();
    if (savedConnection && savedConnection.connected) {
      isConnected = true;
      updateConnectionStatus(true, savedConnection);
    }
  } catch (error) {
    log('warning', '无法获取保存的连接状态');
  }

  await loadDevices();
  await loadChannels();
  setupHotplugListeners();
  startChannelStatsUpdate();

  log('success', '应用初始化完成');
}

function setupHotplugListeners() {
  window.usbAPI.onDeviceAdded((device) => {
    log('info', `检测到新设备插入: ${device.deviceName || device.id}`);
    showToast(`新设备已连接: ${device.deviceName || '未知设备'}`, 'info');
    loadDevices();
  });

  window.usbAPI.onDeviceRemoved((device) => {
    log('info', `设备已移除: ${device.id}`);
    showToast('设备已断开', 'info');
    loadDevices();
    loadChannels();
  });

  window.usbAPI.onDeviceUpdated((device) => {
    log('info', `设备状态更新: ${device.id}, 已重定向: ${device.isRedirected}`);
    loadDevices();
  });

  window.usbAPI.onChannelsCreated((data) => {
    const isoCount = data.channels.filter(c => c.channelType === 'iso').length;
    const bulkCount = data.channels.filter(c => c.channelType !== 'iso').length;
    log('success', `设备 ${data.deviceId} 动态创建了 ${data.channels.length} 个通道 (${bulkCount} Bulk + ${isoCount} ISO)`);
    showToast(`已为设备创建 ${data.channels.length} 个通道`, 'success');
    loadChannels();
    loadDevices();
  });

  window.usbAPI.onChannelBackpressure((data) => {
    const typeLabel = data.channelType === 'iso' ? ' [ISO]' : '';
    log('warning', `通道 ${data.channelId}${typeLabel} 信用耗尽! 需要 ${data.requested} 令牌, 仅剩 ${Math.floor(data.available)}, 背压次数: ${data.backpressureCount}`);
    showToast(`通道 ${data.channelId} 信用耗尽`, 'warning');
  });

  window.usbAPI.onISOStreamStarted((data) => {
    log('success', `ISO 流已启动: ${data.channelId}, 采样率: ${data.sampleRate}Hz, 位深: ${data.bitsPerSample}bit, 声道: ${data.channels}`);
  });

  window.usbAPI.onISOStreamStopped((data) => {
    log('info', `ISO 流已停止: ${data.channelId}`);
  });
}

async function loadDevices() {
  try {
    devices = await window.usbAPI.getUSBDevices();
    renderDevices();
  } catch (error) {
    log('error', `加载设备失败: ${error.message}`);
    showToast('加载设备失败', 'error');
  }
}

function renderDevices() {
  if (devices.length === 0) {
    devicesList.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="7" width="20" height="10" rx="2" ry="2"></rect>
          <line x1="8" y1="17" x2="8" y2="7"></line>
          <line x1="16" y1="17" x2="16" y2="7"></line>
          <line x1="12" y1="17" x2="12" y2="7"></line>
        </svg>
        <p>未检测到 USB 设备</p>
        <p style="font-size: 12px; margin-top: 8px; opacity: 0.7;">请插入 USB 设备或点击刷新按钮</p>
      </div>
    `;
    deviceCount.textContent = '0 个设备';
    return;
  }

  deviceCount.textContent = `${devices.length} 个设备`;

  devicesList.innerHTML = devices.map(device => `
    <div class="device-card ${device.isRedirected ? 'redirected' : ''}" data-device-id="${device.id}">
      <div class="device-header">
        <div class="device-info">
          <div class="device-name">
            ${device.productName || '未知设备'}
            ${device.isAudioDevice ? '<span class="audio-badge">🎵 音频</span>' : ''}
          </div>
          <div class="device-vendor">${device.vendorName}</div>
        </div>
        <span class="device-status ${device.isRedirected ? 'redirected' : 'local'}">
          ${device.isRedirected ? '✓ 已重定向' : '本地设备'}
        </span>
      </div>
      <div class="device-details">
        <div class="detail-item">
          <span class="detail-label">厂商 ID</span>
          <span class="detail-value">0x${device.vendorId.toString(16).padStart(4, '0')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">产品 ID</span>
          <span class="detail-value">0x${device.productId.toString(16).padStart(4, '0')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">总线号</span>
          <span class="detail-value">${device.busNumber}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">设备地址</span>
          <span class="detail-value">${device.deviceAddress}</span>
        </div>
      </div>
      <div class="device-actions">
        ${device.isRedirected ? `
          <button class="btn btn-danger" onclick="releaseDevice(${device.vendorId}, ${device.productId})">
            释放设备
          </button>
          <button class="btn btn-secondary" onclick="showDeviceChannels(${device.vendorId}, ${device.productId})">
            查看通道
          </button>
        ` : `
          <button class="btn btn-success" onclick="redirectDevice(${device.vendorId}, ${device.productId})" ${!isConnected ? 'disabled' : ''}>
            重定向到虚拟机
          </button>
        `}
      </div>
    </div>
  `).join('');
}

async function loadChannels() {
  try {
    const result = await window.usbAPI.getAllChannels();
    if (result.success) {
      channels = result.channels;
      renderChannels();
    }
  } catch (error) {
    log('error', `加载通道失败: ${error.message}`);
  }
}

function renderChannels() {
  if (channels.length === 0) {
    channelsList.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p>暂无活动通道</p>
        <p style="font-size: 12px; margin-top: 8px; opacity: 0.7;">重定向设备或插入新设备后将自动创建通道</p>
      </div>
    `;
    channelCount.textContent = '0 个通道';
    return;
  }

  channelCount.textContent = `${channels.length} 个通道`;

  channelsList.innerHTML = channels.map(channel => {
    const ts = channel.tokenStats || {};
    const tokenPercentage = ts.capacity > 0 ? Math.min(100, (ts.tokens / ts.capacity) * 100) : 0;
    const isLow = tokenPercentage < 20;
    const isISO = channel.channelType === 'iso';
    const iso = channel.isoStats || {};
    const direction = channel.endpoint?.direction || '—';
    const epAddr = channel.endpoint?.address || '—';

    return `
    <div class="channel-card ${channel.status} ${isLow ? 'low-credit' : ''} ${isISO ? 'iso-channel' : ''}" data-channel-id="${channel.id}">
      <div class="channel-header">
        <span class="channel-id">
          ${channel.id}
          <span class="channel-type-badge ${isISO ? 'iso' : 'bulk'}">${isISO ? 'ISO' : 'BULK'}</span>
        </span>
        <span class="channel-status ${channel.status}">
          ${getStatusIcon(channel.status, isISO)} ${getStatusText(channel.status, isISO)}
        </span>
      </div>
      <div class="channel-stats">
        <div class="detail-item">
          <span class="detail-label">端点 / 方向</span>
          <span class="detail-value">EP${epAddr} ${direction === 'in' ? 'IN' : direction === 'out' ? 'OUT' : '—'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">已传输</span>
          <span class="detail-value">${formatBytes(channel.dataTransferred)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">包数 / 错误</span>
          <span class="detail-value">${channel.packetsTransferred} / ${channel.errors}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">背压 / 队列</span>
          <span class="detail-value">${channel.backpressureCount} / ${channel.queueLength}</span>
        </div>
      </div>
      ${isISO ? `
      <div class="iso-stats-bar">
        <span>🎵 ${iso.sampleRate || 48000}Hz / ${iso.bitsPerSample || 16}bit / ${iso.channels || 2}ch</span>
        <span>帧: ${iso.currentFrame || 0} | 溢出: ${iso.isoOverruns || 0} | 欠载: ${iso.isoUnderruns || 0}</span>
        <span>${iso.isStreaming ? '🔴 直播中' : '⏸ 未启动'}</span>
      </div>
      ` : ''}
      <div class="channel-token-bar">
        <div class="token-bar-label">
          <span>信用令牌 ${isLow ? '⚠️ 低' : ''}</span>
          <span>${Math.floor(ts.tokens || 0)} / ${ts.capacity || 0} (窗口: ${ts.creditWindow || 0})</span>
        </div>
        <div class="token-bar-container">
          <div class="token-bar-fill ${isLow ? 'low' : ''}" style="width: ${tokenPercentage}%"></div>
        </div>
        <div class="token-bar-meta">
          补充: ${ts.refillRate || 0}/s | 已消耗: ${Math.floor(ts.totalConsumed || 0)} | 耗尽: ${ts.exhaustionCount || 0} | 利用率: ${ts.utilizationPercent || 0}%
        </div>
      </div>
      <div class="channel-actions">
        ${isISO ? `
          ${iso.isStreaming ? `
            <button class="btn btn-danger btn-sm" onclick="stopISOStream('${channel.id}')">
              停止流
            </button>
          ` : `
            <button class="btn btn-success btn-sm" onclick="startISOStream('${channel.id}')">
              启动流
            </button>
          `}
          <button class="btn btn-secondary btn-sm" onclick="testISOTransfer('${channel.id}')">
            ISO传输
          </button>
        ` : `
          <button class="btn btn-secondary btn-sm" onclick="showTokenConfig('${channel.id}')">
            配置信用
          </button>
          <button class="btn btn-secondary btn-sm" onclick="testBulkTransfer('${channel.id}')">
            测试传输
          </button>
        `}
        <button class="btn btn-danger btn-sm" onclick="closeChannel('${channel.id}')">
          关闭
        </button>
      </div>
    </div>
  `}).join('');
}

function getStatusIcon(status, isISO) {
  if (isISO && status === 'streaming') return '🔴';
  switch (status) {
    case 'idle': return '⏸';
    case 'transferring': return '🔄';
    case 'streaming': return '🔴';
    case 'closed': return '✕';
    default: return '?';
  }
}

function getStatusText(status, isISO) {
  if (isISO && status === 'streaming') return '直播中';
  switch (status) {
    case 'idle': return '空闲';
    case 'transferring': return '传输中';
    case 'streaming': return '直播中';
    case 'closed': return '已关闭';
    default: return status;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

window.redirectDevice = async function (vendorId, productId) {
  if (!isConnected) {
    showToast('请先连接到 SPICE 服务器', 'warning');
    return;
  }

  log('info', `正在重定向设备 0x${vendorId.toString(16).padStart(4, '0')}:0x${productId.toString(16).padStart(4, '0')}...`);

  try {
    const result = await window.usbAPI.redirectDevice(vendorId, productId);
    if (result.success) {
      log('success', result.message);
      showToast('设备重定向成功', 'success');
      await loadDevices();
      await loadChannels();

      if (result.channels && result.channels.length > 0) {
        const isoCount = result.channels.filter(c => c.channelType === 'iso').length;
        const bulkCount = result.channels.filter(c => c.channelType !== 'iso').length;
        log('info', `通道: ${bulkCount} Bulk + ${isoCount} ISO (含令牌信用机制)`);
      }
      if (result.reenumerated) {
        log('info', `设备重新枚举${result.reenumerated.found ? '成功' : '未找到设备'}`);
      }
      updateStatsSummary();
    } else {
      log('error', result.message);
      showToast(result.message, 'error');
    }
  } catch (error) {
    log('error', `重定向失败: ${error.message}`);
    showToast('设备重定向失败', 'error');
  }
};

window.releaseDevice = async function (vendorId, productId) {
  log('info', `正在释放设备 0x${vendorId.toString(16).padStart(4, '0')}:0x${productId.toString(16).padStart(4, '0')}...`);

  try {
    const result = await window.usbAPI.releaseDevice(vendorId, productId);
    if (result.success) {
      log('success', result.message);
      showToast('设备已释放', 'success');
      await loadDevices();
      await loadChannels();
      updateStatsSummary();
    } else {
      log('error', result.message);
      showToast(result.message, 'error');
    }
  } catch (error) {
    log('error', `释放失败: ${error.message}`);
    showToast('设备释放失败', 'error');
  }
};

window.showDeviceChannels = async function (vendorId, productId) {
  log('info', `查看设备通道: 0x${vendorId.toString(16).padStart(4, '0')}:0x${productId.toString(16).padStart(4, '0')}`);
  loadChannels();
};

window.closeChannel = async function (channelId) {
  log('info', `正在关闭通道: ${channelId}`);

  try {
    const result = await window.usbAPI.closeUSBChannel(channelId);
    if (result.success) {
      log('success', result.message);
      showToast('通道已关闭', 'success');
      await loadChannels();
    } else {
      log('error', result.message);
      showToast(result.message, 'error');
    }
  } catch (error) {
    log('error', `关闭通道失败: ${error.message}`);
    showToast('关闭通道失败', 'error');
  }
};

window.startISOStream = async function (channelId) {
  log('info', `启动 ISO 流: ${channelId}...`);

  try {
    const result = await window.usbAPI.startISOStream(channelId);
    if (result.success) {
      log('success', result.message);
      showToast('ISO 流已启动', 'success');
      await loadChannels();
    } else {
      log('error', result.message);
      showToast(result.message, 'error');
    }
  } catch (error) {
    log('error', `启动 ISO 流失败: ${error.message}`);
    showToast('启动 ISO 流失败', 'error');
  }
};

window.stopISOStream = async function (channelId) {
  log('info', `停止 ISO 流: ${channelId}...`);

  try {
    const result = await window.usbAPI.stopISOStream(channelId);
    if (result.success) {
      log('success', result.message);
      showToast('ISO 流已停止', 'info');
      await loadChannels();
    } else {
      log('error', result.message);
      showToast(result.message, 'error');
    }
  } catch (error) {
    log('error', `停止 ISO 流失败: ${error.message}`);
    showToast('停止 ISO 流失败', 'error');
  }
};

window.testISOTransfer = async function (channelId) {
  log('info', `测试通道 ${channelId} ISO 传输 (192 字节音频帧)...`);

  const testData = new Uint8Array(192);
  for (let i = 0; i < testData.length; i++) {
    testData[i] = Math.floor(Math.random() * 256);
  }

  try {
    const result = await window.usbAPI.submitISOTransfer(channelId, testData);
    if (result.success) {
      const r = result.result || {};
      log('success', `ISO 传输成功: ${r.bytesTransferred || 0} 字节, 帧: ${r.frame || 0}, 剩余令牌: ${Math.floor(result.tokenStats?.tokens || 0)}`);
      showToast('ISO 传输测试成功', 'success');
      await loadChannels();
    } else {
      log('error', result.result?.message || result.message || 'ISO 传输失败');
      showToast(result.result?.message || 'ISO 传输失败', 'error');
    }
  } catch (error) {
    log('error', `ISO 传输失败: ${error.message}`);
    showToast('ISO 传输测试失败', 'error');
  }
};

window.showTokenConfig = async function (channelId) {
  const channel = channels.find(c => c.id === channelId);
  if (!channel) return;

  const ts = channel.tokenStats || {};
  const newCapacity = prompt(`令牌桶容量 (当前: ${ts.capacity}):`, ts.capacity);
  if (newCapacity === null) return;
  const newRate = prompt(`补充速率 令牌/秒 (当前: ${ts.refillRate}):`, ts.refillRate);
  if (newRate === null) return;
  const newWindow = prompt(`信用窗口 (当前: ${ts.creditWindow}):`, ts.creditWindow);
  if (newWindow === null) return;

  try {
    const result = await window.usbAPI.setChannelTokenParams(
      channelId,
      parseInt(newCapacity),
      parseInt(newRate),
      parseInt(newWindow)
    );
    if (result.success) {
      log('success', `通道 ${channelId} 信用参数已更新: 容量=${newCapacity}, 补充=${newRate}/s, 窗口=${newWindow}`);
      showToast('信用参数已更新', 'success');
      await loadChannels();
    } else {
      log('error', result.message);
    }
  } catch (error) {
    log('error', `更新信用参数失败: ${error.message}`);
  }
};

window.testBulkTransfer = async function (channelId) {
  log('info', `测试通道 ${channelId} 批量传输 (4096 字节)...`);

  const testData = new Uint8Array(4096);
  for (let i = 0; i < testData.length; i++) {
    testData[i] = Math.floor(Math.random() * 256);
  }

  try {
    const result = await window.usbAPI.submitBulkTransfer(channelId, testData);
    if (result.success) {
      const ts = result.tokenStats || {};
      log('success', `传输成功: ${result.result.bytesTransferred} 字节, 剩余令牌: ${Math.floor(result.tokens)}, 耗尽次数: ${ts.exhaustionCount || 0}`);
      showToast('传输测试成功', 'success');
      await loadChannels();
    } else {
      log('error', result.message);
      showToast(result.message, 'error');
    }
  } catch (error) {
    log('error', `传输失败: ${error.message}`);
    showToast('传输测试失败', 'error');
  }
};

async function updateStatsSummary() {
  try {
    const result = await window.spiceAPI.getRedirectStats();
    if (result.success) {
      const s = result.stats;
      statsSummary.style.display = 'block';
      statsGrid.innerHTML = `
        <div class="stat-item"><span class="stat-value">${s.totalRedirects}</span><span class="stat-label">重定向</span></div>
        <div class="stat-item"><span class="stat-value">${s.currentRedirectedDevices}</span><span class="stat-label">当前设备</span></div>
        <div class="stat-item"><span class="stat-value">${formatBytes(s.totalBytesTransferred)}</span><span class="stat-label">总传输</span></div>
        <div class="stat-item"><span class="stat-value">${s.totalErrors}</span><span class="stat-label">错误</span></div>
        <div class="stat-item"><span class="stat-value">${s.totalBackpressureEvents}</span><span class="stat-label">背压</span></div>
        <div class="stat-item"><span class="stat-value">${s.totalIsoFrames}</span><span class="stat-label">ISO帧</span></div>
      `;
    }
  } catch (error) {
    // silent
  }
}

exportStatsBtn.addEventListener('click', async () => {
  log('info', '正在导出重定向统计...');
  try {
    const result = await window.spiceAPI.exportStats();
    if (result.success) {
      log('success', result.message);
      showToast('统计已导出', 'success');
    } else {
      log('info', result.message);
    }
  } catch (error) {
    log('error', `导出失败: ${error.message}`);
    showToast('导出失败', 'error');
  }
});

connectBtn.addEventListener('click', async () => {
  const host = hostInput.value.trim();
  const port = parseInt(portInput.value);
  const password = passwordInput.value;

  if (!host) {
    showToast('请输入服务器地址', 'warning');
    return;
  }

  if (!port || port < 1 || port > 65535) {
    showToast('请输入有效的端口号', 'warning');
    return;
  }

  log('info', `正在连接到 SPICE 服务器 ${host}:${port}...`);
  connectBtn.disabled = true;
  connectBtn.textContent = '连接中...';

  try {
    const result = await window.spiceAPI.connect({ host, port, password });

    if (result.success) {
      isConnected = true;
      log('success', result.message);
      showToast('SPICE 连接成功', 'success');
      updateConnectionStatus(true, result.connection);
      renderDevices();
      loadChannels();
      updateStatsSummary();
    } else {
      log('error', result.message);
      showToast(result.message, 'error');
    }
  } catch (error) {
    log('error', `连接失败: ${error.message}`);
    showToast('连接失败', 'error');
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = '连接';
  }
});

disconnectBtn.addEventListener('click', async () => {
  log('info', '正在断开 SPICE 连接...');
  disconnectBtn.disabled = true;

  try {
    const result = await window.spiceAPI.disconnect();

    if (result.success) {
      isConnected = false;
      log('success', result.message);
      showToast('已断开连接', 'info');
      updateConnectionStatus(false);
      await loadDevices();
      await loadChannels();
      updateStatsSummary();
    } else {
      log('error', result.message);
      showToast(result.message, 'error');
    }
  } catch (error) {
    log('error', `断开失败: ${error.message}`);
    showToast('断开连接失败', 'error');
  } finally {
    disconnectBtn.disabled = false;
  }
});

function updateConnectionStatus(connected, connection = null) {
  const indicator = connectionStatus.querySelector('.status-indicator');
  const text = connectionStatus.querySelector('.status-text');

  if (connected) {
    indicator.className = 'status-indicator connected';
    text.textContent = connection ? `已连接: ${connection.host}:${connection.port}` : '已连接';
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    hostInput.disabled = true;
    portInput.disabled = true;
    passwordInput.disabled = true;
  } else {
    indicator.className = 'status-indicator disconnected';
    text.textContent = '未连接';
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    hostInput.disabled = false;
    portInput.disabled = false;
    passwordInput.disabled = false;
  }
}

refreshBtn.addEventListener('click', async () => {
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = `
    <svg class="btn-icon" style="animation: spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="23 4 23 10 17 10"></polyline>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
    </svg>
    刷新中...
  `;

  await loadDevices();

  refreshBtn.disabled = false;
  refreshBtn.innerHTML = `
    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="23 4 23 10 17 10"></polyline>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
    </svg>
    刷新
  `;
});

refreshChannelsBtn.addEventListener('click', async () => {
  refreshChannelsBtn.disabled = true;
  refreshChannelsBtn.innerHTML = `
    <svg class="btn-icon" style="animation: spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="23 4 23 10 17 10"></polyline>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
    </svg>
    刷新中...
  `;

  await loadChannels();

  refreshChannelsBtn.disabled = false;
  refreshChannelsBtn.innerHTML = `
    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="23 4 23 10 17 10"></polyline>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
    </svg>
    刷新
  `;
});

function startChannelStatsUpdate() {
  if (channelUpdateInterval) {
    clearInterval(channelUpdateInterval);
  }
  channelUpdateInterval = setInterval(() => {
    if (channels.length > 0) {
      loadChannels();
    }
    if (isConnected) {
      updateStatsSummary();
    }
  }, 2000);
}

clearLogBtn.addEventListener('click', () => {
  logContent.innerHTML = '';
  log('info', '日志已清空');
});

function log(type, message) {
  const now = new Date();
  const time = now.toLocaleTimeString('zh-CN', { hour12: false });

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="log-${type}">[${type.toUpperCase()}]</span>
    <span class="log-message">${message}</span>
  `;

  logContent.appendChild(entry);
  logContent.scrollTop = logContent.scrollHeight;
}

let toastTimeout;
function showToast(message, type = 'info') {
  clearTimeout(toastTimeout);

  toast.textContent = message;
  toast.className = `toast ${type}`;

  toastTimeout = setTimeout(() => {
    toast.className = 'toast hidden';
  }, 3000);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

window.addEventListener('beforeunload', () => {
  if (channelUpdateInterval) {
    clearInterval(channelUpdateInterval);
  }
  window.usbAPI.removeAllListeners();
});

init();
