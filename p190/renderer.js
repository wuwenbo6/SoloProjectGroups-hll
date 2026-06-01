const connectBtn = document.getElementById('connectBtn');
const detectBtn = document.getElementById('detectBtn');
const deviceSelect = document.getElementById('deviceSelect');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const readBtn = document.getElementById('readBtn');
const writeBtn = document.getElementById('writeBtn');
const clearLogBtn = document.getElementById('clearLogBtn');
const messageLog = document.getElementById('messageLog');
const autoScroll = document.getElementById('autoScroll');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const testButtons = document.querySelectorAll('.test-btn');

const deviceStatus = document.getElementById('deviceStatus');
const deviceName = document.getElementById('deviceName');
const deviceSerial = document.getElementById('deviceSerial');
const deviceVendor = document.getElementById('deviceVendor');

let isConnected = false;
let detectedDevices = [];

detectBtn.addEventListener('click', async () => {
  detectBtn.disabled = true;
  detectBtn.textContent = '检测中...';
  addLog('system', '正在检测USB-CAN适配器...');

  try {
    const result = await window.canAPI.detectDevices();
    if (result.success) {
      detectedDevices = result.devices;
      updateDeviceList();
      updateDeviceInfo('已检测', null);
      addLog('system', result.message);
    } else {
      detectedDevices = [];
      updateDeviceList();
      updateDeviceInfo('检测失败', null);
      addLog('system', result.message);
    }
  } catch (error) {
    addLog('system', `检测失败: ${error.message}`);
  } finally {
    detectBtn.disabled = false;
    detectBtn.textContent = '检测设备';
  }
});

deviceSelect.addEventListener('change', () => {
  connectBtn.disabled = !deviceSelect.value || isConnected;
});

connectBtn.addEventListener('click', async () => {
  if (!isConnected) {
    const deviceId = deviceSelect.value;
    if (!deviceId) {
      addLog('system', '请先选择要连接的设备');
      return;
    }

    connectBtn.disabled = true;
    connectBtn.textContent = '连接中...';
    addLog('system', '正在连接USB-CAN适配器...');

    try {
      const result = await window.canAPI.connect(deviceId);
      if (result.success) {
        updateConnectionStatus(true, result.device);
        updateDeviceInfo('已连接', result.device);
        addLog('system', result.message);
      } else {
        addLog('system', result.message);
      }
    } catch (error) {
      addLog('system', `连接失败: ${error.message}`);
    } finally {
      connectBtn.disabled = false;
    }
  } else {
    const result = await window.canAPI.disconnect();
    if (result.success) {
      updateConnectionStatus(false, null);
      updateDeviceInfo('已断开', null);
      addLog('system', result.message);
    }
  }
});

function updateDeviceList() {
  deviceSelect.innerHTML = '';

  if (detectedDevices.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '未检测到设备';
    deviceSelect.appendChild(option);
    deviceSelect.disabled = true;
    connectBtn.disabled = true;
    statusIndicator.className = 'status-indicator disconnected';
    statusText.textContent = '未检测到设备';
  } else {
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '请选择设备';
    deviceSelect.appendChild(defaultOption);

    detectedDevices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = `${device.name} (${device.serial})`;
      deviceSelect.appendChild(option);
    });

    deviceSelect.disabled = false;
    statusIndicator.className = 'status-indicator connected';
    statusText.textContent = `已检测到 ${detectedDevices.length} 个设备`;
  }
}

function updateConnectionStatus(connected, device) {
  isConnected = connected;
  statusIndicator.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
  statusText.textContent = connected ? `已连接: ${device.name}` : (detectedDevices.length > 0 ? '已断开' : '未检测');
  connectBtn.textContent = connected ? '断开连接' : '连接适配器';
  connectBtn.className = `btn ${connected ? 'btn-warning' : 'btn-primary'}`;
  connectBtn.disabled = !connected && !deviceSelect.value;
  deviceSelect.disabled = connected;
  detectBtn.disabled = connected;
  readBtn.disabled = !connected;
  writeBtn.disabled = !connected;
  batchReadBtn.disabled = !connected;
  batchWriteBtn.disabled = !connected;
  updateExportBtnState();
}

function updateDeviceInfo(status, device) {
  deviceStatus.textContent = status;
  deviceStatus.style.color = status === '已连接' ? '#2ecc71' : (status === '检测失败' ? '#e74c3c' : '#f1c40f');

  if (device) {
    deviceName.textContent = device.name;
    deviceSerial.textContent = device.serial;
    deviceVendor.textContent = `${device.vendor}:${device.product}`;
  } else {
    deviceName.textContent = '-';
    deviceSerial.textContent = '-';
    deviceVendor.textContent = '-';
  }
}

readBtn.addEventListener('click', async () => {
  const nodeId = parseInt(document.getElementById('nodeId').value);
  const index = parseInt(document.getElementById('index').value, 16);
  const subIndex = parseInt(document.getElementById('subIndex').value);

  showProgress(true);
  updateProgress(0, null);

  try {
    const result = await window.sdoAPI.read(nodeId, index, subIndex);
    if (result.success) {
      displayResult(result.data);
      addLog('system', `SDO读取成功: 索引 0x${index.toString(16).toUpperCase()}:${subIndex}`);
    } else {
      addLog('system', `SDO读取失败: ${result.error}`);
    }
  } catch (error) {
    addLog('system', `错误: ${error.message}`);
  } finally {
    showProgress(false);
  }
});

writeBtn.addEventListener('click', async () => {
  const nodeId = parseInt(document.getElementById('nodeId').value);
  const index = parseInt(document.getElementById('index').value, 16);
  const subIndex = parseInt(document.getElementById('subIndex').value);
  const dataFormat = document.getElementById('dataFormat').value;
  const writeData = document.getElementById('writeData').value;

  let data;
  try {
    data = parseWriteData(writeData, dataFormat);
  } catch (error) {
    addLog('system', `数据解析错误: ${error.message}`);
    return;
  }

  showProgress(true);
  updateProgress(0, null);

  try {
    const result = await window.sdoAPI.write(nodeId, index, subIndex, Array.from(data));
    if (result.success) {
      addLog('system', `SDO写入成功: ${result.result.bytesWritten} 字节`);
    } else {
      addLog('system', `SDO写入失败: ${result.error}`);
    }
  } catch (error) {
    addLog('system', `错误: ${error.message}`);
  } finally {
    showProgress(false);
  }
});

function parseWriteData(input, format) {
  switch (format) {
    case 'hex':
      const cleanInput = input.replace(/\s/g, '');
      if (cleanInput.length % 2 !== 0) {
        throw new Error('十六进制数据长度必须是偶数');
      }
      const bytes = [];
      for (let i = 0; i < cleanInput.length; i += 2) {
        bytes.push(parseInt(cleanInput.substr(i, 2), 16));
      }
      return Buffer.from(bytes);

    case 'text':
      return Buffer.from(input, 'utf8');

    case 'uint8':
      const val8 = parseInt(input);
      if (val8 < 0 || val8 > 255) throw new Error('值超出范围');
      return Buffer.from([val8]);

    case 'uint16':
      const val16 = parseInt(input);
      if (val16 < 0 || val16 > 65535) throw new Error('值超出范围');
      const buf16 = Buffer.alloc(2);
      buf16.writeUInt16LE(val16, 0);
      return buf16;

    case 'uint32':
      const val32 = parseInt(input);
      const buf32 = Buffer.alloc(4);
      buf32.writeUInt32LE(val32, 0);
      return buf32;

    default:
      return Buffer.from(input);
  }
}

function displayResult(data) {
  const buffer = Buffer.from(data);
  const hexStr = buffer.toString('hex').toUpperCase().match(/.{2}/g).join(' ');
  
  document.getElementById('resultHex').textContent = hexStr;
  document.getElementById('resultText').textContent = buffer.toString('utf8');
  document.getElementById('resultLength').textContent = `${data.length} 字节`;
  document.getElementById('resultType').textContent = data.length > 4 ? '分块传输' : '快速传输';
}

window.canAPI.onMessage((msg) => {
  addCanMessage(msg);
});

window.sdoAPI.onProgress((progress) => {
  updateProgress(progress.percent, progress.retry);
  if (progress.retry) {
    addLog('retry', `分块传输重试中... (第 ${progress.retry} 次)`);
  }
});

function addCanMessage(msg) {
  const time = new Date(msg.timestamp).toLocaleTimeString();
  const idStr = '0x' + msg.id.toString(16).toUpperCase().padStart(3, '0');
  const dataStr = Array.from(msg.data).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  const direction = msg.direction === 'tx' ? '→ 发送' : '← 接收';
  
  let className = msg.direction;
  if (msg.isSegment) className += ' segment';
  
  const segmentInfo = msg.isSegment ? ` [段${msg.segmentNum}]` : '';
  
  const entry = document.createElement('div');
  entry.className = `log-entry ${className}`;
  entry.innerHTML = `<span class="log-time">[${time}]</span>${direction} ${idStr}: ${dataStr}${segmentInfo}`;
  messageLog.appendChild(entry);
  
  if (autoScroll.checked) {
    messageLog.scrollTop = messageLog.scrollHeight;
  }
}

function addLog(type, message) {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  
  let prefix = '[系统]';
  if (type === 'retry') prefix = '[重试]';
  
  entry.innerHTML = `<span class="log-time">[${time}]</span>${prefix} ${message}`;
  messageLog.appendChild(entry);
  
  if (autoScroll.checked) {
    messageLog.scrollTop = messageLog.scrollHeight;
  }
}

clearLogBtn.addEventListener('click', () => {
  messageLog.innerHTML = '';
});

testButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('index').value = btn.dataset.index;
    document.getElementById('subIndex').value = btn.dataset.sub;
    readBtn.click();
  });
});

function showProgress(show) {
  progressContainer.classList.toggle('hidden', !show);
}

function updateProgress(percent, retry) {
  progressFill.style.width = `${percent}%`;
  if (retry) {
    progressText.textContent = `${percent}% (重试 ${retry}/3)`;
  } else {
    progressText.textContent = `${percent}%`;
  }
}

const batchReadBtn = document.getElementById('batchReadBtn');
const batchWriteBtn = document.getElementById('batchWriteBtn');
const importCSVBtn = document.getElementById('importCSVBtn');
const exportCSVBtn = document.getElementById('exportCSVBtn');
const addEntryBtn = document.getElementById('addEntryBtn');
const clearEntriesBtn = document.getElementById('clearEntriesBtn');
const batchTableBody = document.getElementById('batchTableBody');
const batchProgressContainer = document.getElementById('batchProgressContainer');
const batchProgressFill = document.getElementById('batchProgressFill');
const batchProgressText = document.getElementById('batchProgressText');

let batchEntries = [];
let batchReadResults = [];
let entryIdCounter = 0;

function addBatchEntry(index = '', subIndex = 0, name = '', writeData = '') {
  const id = ++entryIdCounter;
  const entry = { id, index, subIndex, name, writeData, selected: true, readResult: '', length: '', transferType: '', status: '' };
  batchEntries.push(entry);
  renderBatchTable();
  updateExportBtnState();
  return entry;
}

function removeBatchEntry(id) {
  batchEntries = batchEntries.filter(e => e.id !== id);
  renderBatchTable();
  updateExportBtnState();
}

function renderBatchTable() {
  batchTableBody.innerHTML = '';
  batchEntries.forEach(entry => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="batch-checkbox" data-id="${entry.id}" ${entry.selected ? 'checked' : ''}></td>
      <td><input type="text" class="batch-input batch-index" data-id="${entry.id}" value="${entry.index}" placeholder="1000"></td>
      <td><input type="number" class="batch-input batch-sub" data-id="${entry.id}" value="${entry.subIndex}" min="0" max="255"></td>
      <td><input type="text" class="batch-input batch-name" data-id="${entry.id}" value="${entry.name}" placeholder="名称"></td>
      <td><input type="text" class="batch-input batch-wdata" data-id="${entry.id}" value="${entry.writeData}" placeholder="HEX数据"></td>
      <td class="batch-result">${entry.readResult || '-'}</td>
      <td class="batch-len">${entry.length || '-'}</td>
      <td class="batch-type">${entry.transferType || '-'}</td>
      <td class="batch-status ${entry.status === 'OK' ? 'status-ok' : (entry.status === 'Error' ? 'status-error' : '')}">${entry.status || '-'}</td>
      <td><button class="btn btn-secondary btn-sm batch-delete" data-id="${entry.id}">删除</button></td>
    `;
    batchTableBody.appendChild(tr);
  });

  document.querySelectorAll('.batch-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      const entry = batchEntries.find(en => en.id === id);
      if (entry) entry.selected = e.target.checked;
    });
  });

  document.querySelectorAll('.batch-index').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      const entry = batchEntries.find(en => en.id === id);
      if (entry) entry.index = e.target.value;
    });
  });

  document.querySelectorAll('.batch-sub').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      const entry = batchEntries.find(en => en.id === id);
      if (entry) entry.subIndex = parseInt(e.target.value) || 0;
    });
  });

  document.querySelectorAll('.batch-name').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      const entry = batchEntries.find(en => en.id === id);
      if (entry) entry.name = e.target.value;
    });
  });

  document.querySelectorAll('.batch-wdata').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      const entry = batchEntries.find(en => en.id === id);
      if (entry) entry.writeData = e.target.value;
    });
  });

  document.querySelectorAll('.batch-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      removeBatchEntry(id);
    });
  });
}

function updateExportBtnState() {
  const hasResults = batchEntries.some(e => e.readResult || e.status);
  exportCSVBtn.disabled = !hasResults;
}

addEntryBtn.addEventListener('click', () => {
  addBatchEntry('1000', 0, '', '');
});

clearEntriesBtn.addEventListener('click', () => {
  batchEntries = [];
  batchReadResults = [];
  renderBatchTable();
  updateExportBtnState();
  addLog('system', '批量操作列表已清空');
});

batchReadBtn.addEventListener('click', async () => {
  const selectedEntries = batchEntries.filter(e => e.selected && e.index);
  if (selectedEntries.length === 0) {
    addLog('system', '请至少选择一个条目进行批量读取');
    return;
  }

  const nodeId = parseInt(document.getElementById('nodeId').value);
  batchReadBtn.disabled = true;
  batchProgressContainer.classList.remove('hidden');
  batchProgressFill.style.width = '0%';
  batchProgressText.textContent = `0/${selectedEntries.length}`;

  addLog('system', `开始批量读取 ${selectedEntries.length} 个对象...`);

  const entries = selectedEntries.map(e => ({
    index: e.index,
    subIndex: e.subIndex,
    name: e.name
  }));

  try {
    const result = await window.sdoAPI.batchRead(nodeId, entries);
    if (result.success) {
      batchReadResults = result.results;
      let okCount = 0;
      let errCount = 0;

      result.results.forEach(r => {
        const idxStr = typeof r.index === 'number' ? r.index.toString(16).toUpperCase() : r.index;
        const entry = batchEntries.find(e => {
          const eIdx = e.index.startsWith('0x') || e.index.startsWith('0X') ? parseInt(e.index, 16) : parseInt(e.index, 16);
          return eIdx === r.index && e.subIndex === r.subIndex;
        });
        if (entry) {
          if (r.success) {
            entry.readResult = r.hex.match(/.{2}/g) ? r.hex.match(/.{2}/g).join(' ') : r.hex;
            entry.length = r.length + ' 字节';
            entry.transferType = r.transferType === 'segmented' ? '分块传输' : '快速传输';
            entry.status = 'OK';
            okCount++;
          } else {
            entry.readResult = '-';
            entry.length = '-';
            entry.transferType = '-';
            entry.status = 'Error';
            errCount++;
          }
        }
      });

      renderBatchTable();
      updateExportBtnState();
      addLog('system', `批量读取完成: ${okCount} 成功, ${errCount} 失败`);
    } else {
      addLog('system', `批量读取失败: ${result.error}`);
    }
  } catch (error) {
    addLog('system', `批量读取错误: ${error.message}`);
  } finally {
    batchReadBtn.disabled = !isConnected;
    batchProgressContainer.classList.add('hidden');
  }
});

batchWriteBtn.addEventListener('click', async () => {
  const selectedEntries = batchEntries.filter(e => e.selected && e.index && e.writeData);
  if (selectedEntries.length === 0) {
    addLog('system', '请至少选择一个含写入数据的条目进行批量写入');
    return;
  }

  const nodeId = parseInt(document.getElementById('nodeId').value);
  batchWriteBtn.disabled = true;
  batchProgressContainer.classList.remove('hidden');
  batchProgressFill.style.width = '0%';
  batchProgressText.textContent = `0/${selectedEntries.length}`;

  addLog('system', `开始批量写入 ${selectedEntries.length} 个对象...`);

  const entries = selectedEntries.map(e => {
    const cleanHex = e.writeData.replace(/\s/g, '');
    const data = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      data.push(parseInt(cleanHex.substr(i, 2), 16));
    }
    return {
      index: e.index,
      subIndex: e.subIndex,
      name: e.name,
      data
    };
  });

  try {
    const result = await window.sdoAPI.batchWrite(nodeId, entries);
    if (result.success) {
      let okCount = 0;
      let errCount = 0;

      result.results.forEach(r => {
        const entry = batchEntries.find(e => {
          const eIdx = parseInt(e.index, 16);
          return eIdx === r.index && e.subIndex === r.subIndex;
        });
        if (entry) {
          if (r.success) {
            entry.status = 'OK';
            okCount++;
          } else {
            entry.status = 'Error';
            errCount++;
          }
        }
      });

      renderBatchTable();
      addLog('system', `批量写入完成: ${okCount} 成功, ${errCount} 失败`);
    } else {
      addLog('system', `批量写入失败: ${result.error}`);
    }
  } catch (error) {
    addLog('system', `批量写入错误: ${error.message}`);
  } finally {
    batchWriteBtn.disabled = !isConnected;
    batchProgressContainer.classList.add('hidden');
  }
});

window.sdoAPI.onBatchProgress((progress) => {
  batchProgressFill.style.width = `${progress.percent}%`;
  batchProgressText.textContent = `${progress.current}/${progress.total}`;
  const idxHex = typeof progress.index === 'number' ? progress.index.toString(16).toUpperCase() : progress.index;
  addLog('system', `批量${progress.operation === 'read' ? '读取' : '写入'} [${progress.current}/${progress.total}]: 0x${idxHex}:${progress.subIndex}`);
});

importCSVBtn.addEventListener('click', async () => {
  try {
    const result = await window.csvAPI.importCSV();
    if (result.success) {
      addLog('system', `导入CSV: ${result.filePath}, 共 ${result.entries.length} 条`);
      result.entries.forEach(entry => {
        const indexHex = typeof entry.index === 'string' ? entry.index.replace(/^0x/i, '') : entry.index.toString(16);
        const writeData = entry.data && entry.data.length > 0 ? entry.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('') : '';
        addBatchEntry(indexHex, entry.subIndex || 0, entry.name || '', writeData);
      });
    } else if (result.error !== '用户取消') {
      addLog('system', `导入CSV失败: ${result.error}`);
    }
  } catch (error) {
    addLog('system', `导入CSV错误: ${error.message}`);
  }
});

exportCSVBtn.addEventListener('click', async () => {
  const exportData = batchEntries
    .filter(e => e.readResult || e.status)
    .map(e => {
      const idx = e.index.startsWith('0x') || e.index.startsWith('0X') ? parseInt(e.index, 16) : parseInt(e.index, 16);
      const hexClean = (e.readResult || '').replace(/\s/g, '');
      return {
        index: idx,
        subIndex: e.subIndex,
        name: e.name,
        hex: hexClean,
        length: parseInt(e.length) || 0,
        transferType: e.transferType === '分块传输' ? 'segmented' : 'expedited',
        success: e.status === 'OK',
        error: e.status === 'Error' ? '失败' : null
      };
    });

  if (exportData.length === 0) {
    addLog('system', '没有可导出的数据');
    return;
  }

  try {
    const result = await window.csvAPI.exportReadResults(exportData);
    if (result.success) {
      addLog('system', `CSV导出成功: ${result.filePath}`);
    } else if (result.error !== '用户取消') {
      addLog('system', `CSV导出失败: ${result.error}`);
    }
  } catch (error) {
    addLog('system', `CSV导出错误: ${error.message}`);
  }
});

async function init() {
  addLog('system', '应用已启动，请先检测USB-CAN适配器');
  
  try {
    const state = await window.canAPI.getDevices();
    if (state.devices && state.devices.length > 0) {
      detectedDevices = state.devices;
      updateDeviceList();
    }
  } catch (e) {
  }
}

init();
