const { ipcRenderer } = require('electron');

let currentFilePath = null;
let parsedData = null;
let seiData = null;
let operationLogs = [];

const selectFileBtn = document.getElementById('selectFileBtn');
const filePathInput = document.getElementById('filePath');
const parseBtn = document.getElementById('parseBtn');
const extractSEIBtn = document.getElementById('extractSEIBtn');
const insertSEIBtn = document.getElementById('insertSEIBtn');
const seiTypeSelect = document.getElementById('seiTypeSelect');
const selectInputFolderBtn = document.getElementById('selectInputFolderBtn');
const selectOutputFolderBtn = document.getElementById('selectOutputFolderBtn');
const inputFolderInput = document.getElementById('inputFolder');
const outputFolderInput = document.getElementById('outputFolder');
const batchProcessBtn = document.getElementById('batchProcessBtn');
const fileInfoCard = document.getElementById('fileInfoCard');
const nalFilter = document.getElementById('nalFilter');
const modal = document.getElementById('modal');
const modalClose = document.getElementById('modalClose');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');

let inputFolderPath = null;
let outputFolderPath = null;

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTime(date) {
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

function addLog(message, type = 'info') {
  const now = new Date();
  operationLogs.unshift({ time: now, message, type });
  renderLogs();
}

function renderLogs() {
  const logContainer = document.getElementById('logContainer');
  if (operationLogs.length === 0) {
    logContainer.innerHTML = '<p class="empty-text">暂无操作日志</p>';
    return;
  }

  logContainer.innerHTML = operationLogs.map(log => `
    <div class="log-item">
      <div class="log-time">${formatTime(log.time)}</div>
      <div class="log-${log.type}">${log.message}</div>
    </div>
  `).join('');
}

function getNALTypeClass(type) {
  if (type >= 0 && type <= 31) return 'nal-type-vcl';
  if (type === 39 || type === 40) return 'nal-type-sei';
  return 'nal-type-nonvcl';
}

function updateFileInfo(info) {
  document.getElementById('infoFilePath').textContent = info.filePath;
  document.getElementById('infoFileSize').textContent = formatFileSize(info.fileSize);
  document.getElementById('infoNalCount').textContent = info.nalUnitCount;

  const seiCount = parsedData.nalUnits.filter(n => n.header.nalUnitType === 39 || n.header.nalUnitType === 40).length;
  document.getElementById('infoSeiCount').textContent = seiCount;

  fileInfoCard.style.display = 'block';
}

function updateStats() {
  const statsContainer = document.getElementById('statsContainer');
  if (!parsedData) {
    statsContainer.innerHTML = '<p class="empty-text">请先选择并解析文件</p>';
    return;
  }

  const typeCounts = {};
  parsedData.nalUnits.forEach(nal => {
    const typeName = nal.header.typeName;
    typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
  });

  const vclCount = parsedData.nalUnits.filter(n => n.header.nalUnitType >= 0 && n.header.nalUnitType <= 31).length;
  const nonVclCount = parsedData.nalUnits.length - vclCount;
  const seiCount = parsedData.nalUnits.filter(n => n.header.nalUnitType === 39 || n.header.nalUnitType === 40).length;

  let html = `
    <div class="stats-item">
      <span class="stats-label">VCL NAL单元:</span>
      <span class="stats-value">${vclCount}</span>
    </div>
    <div class="stats-item">
      <span class="stats-label">非VCL NAL单元:</span>
      <span class="stats-value">${nonVclCount}</span>
    </div>
    <div class="stats-item">
      <span class="stats-label">SEI NAL单元:</span>
      <span class="stats-value">${seiCount}</span>
    </div>
    <div class="stats-item">
      <span class="stats-label">IDR帧:</span>
      <span class="stats-value">${typeCounts['IDR_W_RADL'] || 0} / ${typeCounts['IDR_N_LP'] || 0}</span>
    </div>
    <div class="stats-item">
      <span class="stats-label">VPS/SPS/PPS:</span>
      <span class="stats-value">${typeCounts['VPS_NUT'] || 0} / ${typeCounts['SPS_NUT'] || 0} / ${typeCounts['PPS_NUT'] || 0}</span>
    </div>
  `;

  statsContainer.innerHTML = html;
}

function renderNALTable(filter = '') {
  const tbody = document.getElementById('nalTableBody');
  if (!parsedData) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">请先解析文件</td></tr>';
    document.getElementById('nalCountDisplay').textContent = '';
    return;
  }

  const filteredUnits = parsedData.nalUnits.filter(nal => {
    if (!filter) return true;
    const searchText = `${nal.header.nalUnitType} ${nal.header.typeName}`.toLowerCase();
    return searchText.includes(filter.toLowerCase());
  });

  document.getElementById('nalCountDisplay').textContent = `显示 ${filteredUnits.length} / ${parsedData.nalUnits.length} 个NAL单元`;

  if (filteredUnits.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">没有匹配的NAL单元</td></tr>';
    return;
  }

  tbody.innerHTML = filteredUnits.map(nal => {
    const seiCount = nal.seiMessages ? nal.seiMessages.length : 0;
    return `
      <tr>
        <td>${nal.index}</td>
        <td><span class="nal-type-badge ${getNALTypeClass(nal.header.nalUnitType)}">${nal.header.nalUnitType}</span></td>
        <td>${nal.header.typeName}</td>
        <td>0x${nal.startCodePosition.toString(16).toUpperCase()}</td>
        <td>${nal.nalUnitLength} 字节</td>
        <td>${seiCount > 0 ? `<span class="sei-count-badge">${seiCount} 条</span>` : '-'}</td>
        <td><button class="btn btn-primary btn-small" onclick="showNALDetail(${nal.index})">查看详情</button></td>
      </tr>
    `;
  }).join('');
}

function showNALDetail(index) {
  const nal = parsedData.nalUnits[index];
  if (!nal) return;

  modalTitle.textContent = `NAL单元 #${index} 详细信息`;

  const rbspHex = nal.rbsp.slice(0, 256).toString('hex');
  let hexView = '';
  for (let i = 0; i < rbspHex.length; i += 32) {
    const offset = (i / 2).toString(16).padStart(8, '0');
    const bytes = rbspHex.slice(i, i + 32).match(/.{2}/g).join(' ');
    const ascii = Buffer.from(rbspHex.slice(i, i + 32), 'hex').toString('ascii').replace(/[^\x20-\x7E]/g, '.');
    hexView += `<div class="hex-line"><span class="hex-offset">${offset}</span><span class="hex-bytes">${bytes.padEnd(48, ' ')}</span><span class="hex-ascii">${ascii}</span></div>`;
  }
  if (nal.rbsp.length > 256) {
    hexView += `<div class="hex-line"><span class="hex-offset">...</span><span class="hex-bytes">(共 ${nal.rbsp.length} 字节，仅显示前256字节)</span></div>`;
  }

  let seiSection = '';
  if (nal.seiMessages && nal.seiMessages.length > 0) {
    seiSection = `
      <div class="detail-section">
        <h4>SEI消息 (${nal.seiMessages.length}条)</h4>
        ${nal.seiMessages.map((msg, i) => `
          <div class="sei-message" style="margin-bottom: 12px;">
            <div class="sei-message-header">
              <span class="sei-message-type">${msg.payloadTypeName}</span>
              <span class="sei-message-size">${msg.payloadSize} 字节</span>
            </div>
            <span class="sei-message-content-label">内容:</span>
            <div class="sei-message-content">${escapeHtml(msg.payloadText)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  modalBody.innerHTML = `
    <div class="detail-section">
      <h4>基本信息</h4>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-item-label">索引</span>
          <span class="detail-item-value">${nal.index}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">起始码位置</span>
          <span class="detail-item-value">0x${nal.startCodePosition.toString(16).toUpperCase()}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">起始码长度</span>
          <span class="detail-item-value">${nal.startCodeLength} 字节</span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">NAL单元长度</span>
          <span class="detail-item-value">${nal.nalUnitLength} 字节</span>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <h4>头部信息</h4>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-item-label">NAL单元类型</span>
          <span class="detail-item-value">${nal.header.nalUnitType} (${nal.header.typeName})</span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">Forbidden Zero Bit</span>
          <span class="detail-item-value">${nal.header.forbiddenZeroBit}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">NUH Layer ID</span>
          <span class="detail-item-value">${nal.header.nuhLayerId}</span>
        </div>
        <div class="detail-item">
          <span class="detail-item-label">Temporal ID +1</span>
          <span class="detail-item-value">${nal.header.nuhTemporalIdPlus1}</span>
        </div>
      </div>
    </div>

    ${seiSection}

    <div class="detail-section">
      <h4>RBSP数据 (十六进制)</h4>
      <div class="hex-view">${hexView}</div>
    </div>
  `;

  modal.classList.add('active');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderSEIInfo() {
  const seiContainer = document.getElementById('seiContainer');
  if (!seiData || !seiData.seiNalUnits || seiData.seiNalUnits.length === 0) {
    seiContainer.innerHTML = '<p class="empty-text">未找到SEI信息，请先提取SEI信息</p>';
    return;
  }

  seiContainer.innerHTML = seiData.seiNalUnits.map(sei => `
    <div class="sei-item">
      <div class="sei-item-header">
        <span class="sei-item-title">NAL单元 #${sei.index} - ${sei.nalUnitTypeName}</span>
        <span class="sei-count-badge">${sei.seiMessages.length} 条消息</span>
      </div>
      <div class="sei-messages">
        ${sei.seiMessages.map(msg => `
          <div class="sei-message">
            <div class="sei-message-header">
              <span class="sei-message-type">${msg.payloadTypeName}</span>
              <span class="sei-message-size">${msg.payloadSize} 字节</span>
            </div>
            <span class="sei-message-content-label">文本内容:</span>
            <div class="sei-message-content">${escapeHtml(msg.payloadText)}</div>
            <span class="sei-message-content-label" style="margin-top: 8px;">十六进制:</span>
            <div class="sei-message-content">${msg.payloadHex}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

selectFileBtn.addEventListener('click', async () => {
  const filePath = await ipcRenderer.invoke('select-file');
  if (filePath) {
    currentFilePath = filePath;
    filePathInput.value = filePath;
    parseBtn.disabled = false;
    extractSEIBtn.disabled = false;
    insertSEIBtn.disabled = false;
    addLog(`已选择文件: ${filePath}`);
  }
});

parseBtn.addEventListener('click', async () => {
  if (!currentFilePath) return;

  parseBtn.disabled = true;
  addLog('正在解析文件...', 'info');

  const result = await ipcRenderer.invoke('parse-hevc-file', currentFilePath);

  if (result.success) {
    parsedData = result.data;
    updateFileInfo(parsedData);
    updateStats();
    renderNALTable();
    addLog(`解析完成，共找到 ${parsedData.nalUnitCount} 个NAL单元`, 'success');
  } else {
    addLog(`解析失败: ${result.error}`, 'error');
  }

  parseBtn.disabled = false;
});

extractSEIBtn.addEventListener('click', async () => {
  if (!currentFilePath) return;

  extractSEIBtn.disabled = true;
  addLog('正在提取SEI信息...', 'info');

  const result = await ipcRenderer.invoke('extract-sei', currentFilePath);

  if (result.success) {
    seiData = result.data;
    parsedData = result.data;
    updateFileInfo(parsedData);
    updateStats();
    renderNALTable();
    renderSEIInfo();

    const seiCount = seiData.seiNalUnits ? seiData.seiNalUnits.length : 0;
    addLog(`提取完成，找到 ${seiCount} 个包含SEI的NAL单元`, 'success');

    document.querySelector('.tab-btn[data-tab="seiInfo"]').click();
  } else {
    addLog(`提取失败: ${result.error}`, 'error');
  }

  extractSEIBtn.disabled = false;
});

insertSEIBtn.addEventListener('click', async () => {
  if (!currentFilePath) return;

  const outputPath = await ipcRenderer.invoke('select-save-file');
  if (!outputPath) return;

  const seiType = seiTypeSelect.value;
  const options = { seiType };

  insertSEIBtn.disabled = true;
  addLog(`正在插入${seiType === 'registered' ? '注册类型' : '未注册类型'}时间戳SEI到: ${outputPath}`, 'info');

  const result = await ipcRenderer.invoke('insert-sei-timestamp', currentFilePath, outputPath, options);

  if (result.success) {
    addLog(`SEI插入完成！共插入 ${result.data.seiInsertedCount} 个时间戳SEI (${seiType === 'registered' ? '注册类型' : '未注册类型'})`, 'success');
    addLog(`输入文件: ${formatFileSize(result.data.inputSize)} → 输出文件: ${formatFileSize(result.data.outputSize)}`, 'info');
  } else {
    addLog(`插入失败: ${result.error}`, 'error');
  }

  insertSEIBtn.disabled = false;
});

selectInputFolderBtn.addEventListener('click', async () => {
  const folderPath = await ipcRenderer.invoke('select-folder');
  if (folderPath) {
    inputFolderPath = folderPath;
    inputFolderInput.value = folderPath;
    checkBatchProcessReady();
    addLog(`已选择输入文件夹: ${folderPath}`);
  }
});

selectOutputFolderBtn.addEventListener('click', async () => {
  const folderPath = await ipcRenderer.invoke('select-folder');
  if (folderPath) {
    outputFolderPath = folderPath;
    outputFolderInput.value = folderPath;
    checkBatchProcessReady();
    addLog(`已选择输出文件夹: ${folderPath}`);
  }
});

function checkBatchProcessReady() {
  batchProcessBtn.disabled = !(inputFolderPath && outputFolderPath);
}

batchProcessBtn.addEventListener('click', async () => {
  if (!inputFolderPath || !outputFolderPath) return;

  const seiType = seiTypeSelect.value;
  const options = { seiType };

  batchProcessBtn.disabled = true;
  addLog(`开始批量处理文件夹...`, 'info');
  addLog(`输入: ${inputFolderPath}`, 'info');
  addLog(`输出: ${outputFolderPath}`, 'info');
  addLog(`SEI类型: ${seiType === 'registered' ? '注册类型' : '未注册类型'}`, 'info');

  const result = await ipcRenderer.invoke('batch-process-folder', inputFolderPath, outputFolderPath, options);

  if (result.success) {
    const data = result.data;
    addLog(`批量处理完成！`, 'success');
    addLog(`总文件数: ${data.totalFiles}, 成功: ${data.successCount}, 失败: ${data.errorCount}`, 'success');

    data.results.forEach((item, index) => {
      if (item.status === 'success') {
        addLog(`  ✓ ${item.fileName}: 插入 ${item.seiInsertedCount} 个SEI`, 'info');
      } else {
        addLog(`  ✗ ${item.fileName}: ${item.error}`, 'error');
      }
    });
  } else {
    addLog(`批量处理失败: ${result.error}`, 'error');
  }

  batchProcessBtn.disabled = false;
});

nalFilter.addEventListener('input', (e) => {
  renderNALTable(e.target.value);
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(tabId).classList.add('active');
  });
});

modalClose.addEventListener('click', () => {
  modal.classList.remove('active');
});

modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.remove('active');
  }
});

window.showNALDetail = showNALDetail;

addLog('应用已启动，请选择HEVC/H.265文件开始处理', 'info');
