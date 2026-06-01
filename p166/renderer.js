const { ipcRenderer } = require('electron');
const { parseI3CTransactions, I3CParser, buildPCAPNG } = require('./i3c-parser.js');

const CHUNK_SIZE = 10 * 1024 * 1024;

let currentData = null;
let currentFileName = null;
let currentFilePath = null;
let zoomLevel = 10;
let canvas = null;
let ctx = null;
let pixelPerUnit = 1000000;
let isLoading = false;
let rawContentAccumulator = '';

document.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('timing-canvas');
  ctx = canvas.getContext('2d');

  document.getElementById('btn-open-file').addEventListener('click', openFile);
  document.getElementById('btn-load-sample').addEventListener('click', loadSample);
  document.getElementById('btn-export-json').addEventListener('click', exportData);
  document.getElementById('btn-export-pcapng').addEventListener('click', exportPCAPNG);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
  });

  document.getElementById('zoom-slider').addEventListener('input', (e) => {
    zoomLevel = parseInt(e.target.value);
    document.getElementById('zoom-value').textContent = `${zoomLevel}x`;
    pixelPerUnit = 1000000 * zoomLevel / 10;
    renderTimingDiagram();
  });

  document.getElementById('btn-fit').addEventListener('click', fitToWidth);
  document.getElementById('btn-zoom-in').addEventListener('click', zoomIn);
  document.getElementById('btn-zoom-out').addEventListener('click', zoomOut);

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('transaction-detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'transaction-detail-modal') closeModal();
  });

  canvas.addEventListener('mousemove', handleCanvasMouseMove);
  canvas.addEventListener('mouseleave', () => {
    document.getElementById('timing-tooltip').classList.add('hidden');
  });
});

async function openFile() {
  if (isLoading) {
    alert('正在加载文件，请稍候...');
    return;
  }

  const result = await ipcRenderer.invoke('open-file-dialog');
  if (result.success) {
    currentFilePath = result.filePath;
    currentFileName = result.fileName;
    
    if (result.fileSize > CHUNK_SIZE) {
      await loadFileInChunks(result.filePath, result.fileName, result.fileSize);
    } else {
      const contentResult = await ipcRenderer.invoke('read-entire-file', result.filePath);
      if (contentResult.success) {
        processData(contentResult.content, result.fileName);
      } else {
        alert('读取文件失败: ' + (contentResult.error || '未知错误'));
      }
    }
  }
}

async function loadFileInChunks(filePath, fileName, fileSize) {
  isLoading = true;
  rawContentAccumulator = '';
  
  showProgress('正在分块加载文件...', fileSize);
  updateFileInfo(fileName, fileSize);
  
  const parser = new I3CParser();
  parser.metadata.totalLines = 0;
  
  let totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
  let currentChunk = 0;
  let bytesRead = 0;
  let lastUpdateTime = 0;

  try {
    while (bytesRead < fileSize) {
      const chunkSize = Math.min(CHUNK_SIZE, fileSize - bytesRead);
      const chunkResult = await ipcRenderer.invoke('read-file-chunk', {
        filePath: filePath,
        start: bytesRead,
        length: chunkSize
      });

      if (!chunkResult.success) {
        throw new Error(chunkResult.error);
      }

      rawContentAccumulator += chunkResult.data;
      
      const isLastChunk = bytesRead + chunkSize >= fileSize;
      parser.parseChunk(chunkResult.data, isLastChunk);
      
      bytesRead += chunkResult.bytesRead;
      currentChunk++;

      const now = Date.now();
      if (now - lastUpdateTime > 100 || isLastChunk) {
        updateProgress(bytesRead, fileSize, currentChunk, totalChunks, parser.metadata.parsedLines);
        updateIntermediateResults(parser);
        lastUpdateTime = now;
      }

      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const finalResult = parser.finalize();
    currentData = postProcessTransactions(finalResult);
    
    updateProgress(fileSize, fileSize, currentChunk, totalChunks, parser.metadata.parsedLines);
    hideProgress();
    
    updateStats();
    renderTransactionList();
    renderRawData(rawContentAccumulator);
    renderTimingDiagram();

    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('content-area').classList.remove('hidden');
    document.getElementById('btn-export-json').disabled = false;
    document.getElementById('btn-export-pcapng').disabled = false;

  } catch (error) {
    hideProgress();
    alert('分块加载失败: ' + error.message);
    console.error(error);
  } finally {
    isLoading = false;
  }
}

function postProcessTransactions(parseResult) {
  const transactions = [];

  for (const trans of parseResult.transactions) {
    if (trans.bytes.length === 0) continue;

    const firstByte = trans.bytes[0];
    const parsedTrans = {
      id: trans.id,
      startTime: trans.startTime,
      endTime: trans.endTime,
      type: trans.type,
      isRepeatedStart: trans.isRepeatedStart,
      address: firstByte.address,
      addressHex: `0x${firstByte.address.toString(16).toUpperCase().padStart(2, '0')}`,
      direction: firstByte.rw,
      bytes: trans.bytes,
      errors: trans.errors,
      decodedData: []
    };

    if (trans.type === 'BROADCAST') {
      parsedTrans.description = 'Broadcast Address (0x7E)';
    } else if (trans.type === 'CCC') {
      parsedTrans.description = 'Common Command Code (CCC)';
      if (trans.bytes.length > 1) {
        const cccByte = trans.bytes[1];
        parsedTrans.cccCode = cccByte.value;
        parsedTrans.cccName = cccByte.cccName;
        parsedTrans.cccDescription = cccByte.cccDescription;
        parsedTrans.cccData = trans.bytes.slice(2).map(b => b.hex);
      }
    } else {
      const dataBytes = trans.bytes.slice(1);
      parsedTrans.dataBytes = dataBytes;
      parsedTrans.dataHex = dataBytes.map(b => b.hex).join(' ');
      
      if (dataBytes.length > 0) {
        parsedTrans.description = `${firstByte.rw} ${dataBytes.length} byte(s) to/from ${parsedTrans.addressHex}`;
      } else {
        parsedTrans.description = `${firstByte.rw} to/from ${parsedTrans.addressHex}`;
      }
    }

    transactions.push(parsedTrans);
  }

  return {
    transactions,
    signals: parseResult.signals,
    errors: parseResult.errors || [],
    metadata: parseResult.metadata,
    header: parseResult.header
  };
}

function updateIntermediateResults(parser) {
  const partialResult = parser.getFullResult();
  currentData = postProcessTransactions(partialResult);
  
  updateStats();
  renderTransactionList();
  
  if (document.querySelector('.tab-btn.active').dataset.tab === 'timing') {
    renderTimingDiagram();
  }
}

function showProgress(status, totalSize) {
  const container = document.getElementById('progress-container');
  container.classList.remove('hidden');
  
  document.getElementById('progress-status').textContent = status;
  document.getElementById('progress-percent').textContent = '0%';
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('progress-bytes').textContent = `0 MB / ${formatFileSize(totalSize)}`;
  document.getElementById('progress-chunks').textContent = '块: 0 / 0';
  document.getElementById('progress-lines').textContent = '已解析: 0 行';
}

function updateProgress(bytesRead, totalSize, currentChunk, totalChunks, linesParsed) {
  const percent = Math.round((bytesRead / totalSize) * 100);
  
  document.getElementById('progress-percent').textContent = `${percent}%`;
  document.getElementById('progress-fill').style.width = `${percent}%`;
  document.getElementById('progress-bytes').textContent = `${formatFileSize(bytesRead)} / ${formatFileSize(totalSize)}`;
  document.getElementById('progress-chunks').textContent = `块: ${currentChunk} / ${totalChunks}`;
  document.getElementById('progress-lines').textContent = `已解析: ${linesParsed.toLocaleString()} 行`;
}

function hideProgress() {
  const container = document.getElementById('progress-container');
  container.classList.add('hidden');
}

function updateFileInfo(fileName, fileSize) {
  document.getElementById('current-file').textContent = fileName;
  document.getElementById('file-size-info').textContent = `(${formatFileSize(fileSize)})`;
  document.getElementById('file-info').classList.remove('hidden');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

async function loadSample() {
  if (isLoading) {
    alert('正在加载文件，请稍候...');
    return;
  }

  const result = await ipcRenderer.invoke('read-sample-file');
  if (result.success) {
    currentFileName = result.fileName;
    processData(result.content, result.fileName);
  } else {
    alert('无法加载示例数据: ' + (result.error || '未知错误'));
  }
}

function processData(content, fileName) {
  currentFileName = fileName;
  rawContentAccumulator = content;
  
  updateFileInfo(fileName, content.length);
  
  try {
    currentData = parseI3CTransactions(content);
    updateStats();
    renderTransactionList();
    renderRawData(content);
    renderTimingDiagram();

    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('content-area').classList.remove('hidden');
    document.getElementById('btn-export-json').disabled = false;
    document.getElementById('btn-export-pcapng').disabled = false;
  } catch (error) {
    alert('解析数据失败: ' + error.message);
    console.error(error);
  }
}

function updateStats() {
  if (!currentData) return;
  
  const { transactions, metadata } = currentData;
  document.getElementById('stat-transactions').textContent = transactions.length;
  
  let totalBytes = 0;
  transactions.forEach(t => {
    totalBytes += t.bytes ? t.bytes.length : 0;
  });
  document.getElementById('stat-bytes').textContent = totalBytes;
  document.getElementById('stat-errors').textContent = metadata.totalErrors || 0;
  document.getElementById('stat-warnings').textContent = metadata.totalWarnings || 0;
  
  const duration = metadata.endTime - metadata.startTime;
  document.getElementById('stat-duration').textContent = formatTime(duration);
}

function renderTransactionList() {
  if (!currentData) return;
  
  const container = document.getElementById('transaction-list');
  container.innerHTML = '';

  currentData.transactions.forEach((trans, index) => {
    const item = document.createElement('div');
    item.className = 'transaction-item';
    item.addEventListener('click', () => showTransactionDetail(trans));

    const header = document.createElement('div');
    header.className = 'transaction-header';
    header.innerHTML = `
      <span class="transaction-id">#${index + 1}</span>
      <span class="transaction-type ${trans.type}">${trans.type}</span>
      <span class="transaction-time">${formatTime(trans.startTime)} - ${formatTime(trans.endTime)}</span>
    `;
    item.appendChild(header);

    const summary = document.createElement('div');
    summary.className = 'transaction-summary';
    summary.innerHTML = `
      <div class="summary-item">
        <span class="summary-label">地址</span>
        <span class="summary-value">${trans.addressHex}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">方向</span>
        <span class="summary-value ${trans.direction === 'WRITE' ? 'write' : 'read'}">${trans.direction}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">字节数</span>
        <span class="summary-value">${trans.bytes ? trans.bytes.length : 0}</span>
      </div>
      ${trans.cccName ? `
      <div class="summary-item">
        <span class="summary-label">CCC命令</span>
        <span class="summary-value">${trans.cccName}</span>
      </div>
      ` : ''}
    `;
    item.appendChild(summary);

    if (trans.description) {
      const desc = document.createElement('p');
      desc.style.cssText = 'margin-bottom: 12px; color: #aaa; font-size: 13px;';
      desc.textContent = trans.description;
      item.appendChild(desc);
    }

    if (trans.bytes && trans.bytes.length > 0) {
      const bytesContainer = document.createElement('div');
      bytesContainer.className = 'transaction-bytes';
      
      trans.bytes.forEach((byte, byteIndex) => {
        const byteTag = document.createElement('span');
        let typeClass = 'data';
        if (byte.isAddress) typeClass = 'address';
        if (byte.isCCC) typeClass = 'ccc';
        
        byteTag.className = `byte-tag ${typeClass}`;
        byteTag.innerHTML = `${byte.hex} <span class="${byte.ack === 'ACK' ? 'ack' : 'nack'}">${byte.ack}</span>`;
        bytesContainer.appendChild(byteTag);
      });
      
      item.appendChild(bytesContainer);
    }

    if (trans.errors && trans.errors.length > 0) {
      const errorContainer = document.createElement('div');
      errorContainer.className = 'transaction-errors';
      trans.errors.forEach(err => {
        const errText = document.createElement('div');
        errText.className = 'error-text';
        errText.textContent = '⚠️ ' + err;
        errorContainer.appendChild(errText);
      });
      item.appendChild(errorContainer);
    }

    container.appendChild(item);
  });
}

function showTransactionDetail(trans) {
  const modal = document.getElementById('transaction-detail-modal');
  const modalBody = document.getElementById('modal-body');
  document.getElementById('modal-title').textContent = `传输 #${trans.id + 1} 详情`;

  let html = `
    <div class="detail-section">
      <h4>基本信息</h4>
      <div class="detail-grid">
        <div class="detail-item">
          <div class="label">类型</div>
          <div class="value">${trans.type}</div>
        </div>
        <div class="detail-item">
          <div class="label">地址</div>
          <div class="value">${trans.addressHex} (${trans.address})</div>
        </div>
        <div class="detail-item">
          <div class="label">方向</div>
          <div class="value">${trans.direction}</div>
        </div>
        <div class="detail-item">
          <div class="label">字节数</div>
          <div class="value">${trans.bytes ? trans.bytes.length : 0}</div>
        </div>
        <div class="detail-item">
          <div class="label">开始时间</div>
          <div class="value">${formatTime(trans.startTime)}</div>
        </div>
        <div class="detail-item">
          <div class="label">结束时间</div>
          <div class="value">${formatTime(trans.endTime)}</div>
        </div>
        ${trans.cccName ? `
        <div class="detail-item">
          <div class="label">CCC命令</div>
          <div class="value">${trans.cccName} (0x${trans.cccCode.toString(16).toUpperCase().padStart(2, '0')})</div>
        </div>
        ${trans.cccDescription ? `
        <div class="detail-item">
          <div class="label">CCC描述</div>
          <div class="value" style="font-size: 12px;">${trans.cccDescription}</div>
        </div>
        ` : ''}
        ` : ''}
      </div>
    </div>
  `;

  if (trans.bytes && trans.bytes.length > 0) {
    html += `
      <div class="detail-section">
        <h4>字节详情</h4>
        <div class="byte-detail-list">
    `;
    
    trans.bytes.forEach((byte, index) => {
      let typeLabel = 'DATA';
      if (byte.isAddress) typeLabel = 'ADDR';
      if (byte.isCCC) typeLabel = 'CCC';
      
      html += `
        <div class="byte-detail-item">
          <div class="byte-index">${index}</div>
          <div class="byte-value">
            <div class="byte-hex">${byte.hex}</div>
            <div class="byte-binary">${byte.binary}</div>
            ${byte.cccDescription ? `<div style="font-size: 11px; color: #888; margin-top: 2px;">${byte.cccDescription}</div>` : ''}
          </div>
          <span class="byte-type ${typeLabel.toLowerCase()}">${typeLabel}</span>
          <span class="byte-ack-status ${byte.ack}">${byte.ack}</span>
        </div>
      `;
    });
    
    html += `</div></div>`;
  }

  if (trans.errors && trans.errors.length > 0) {
    html += `
      <div class="detail-section">
        <h4>错误信息</h4>
        <div style="background: #4a1a1a; padding: 12px; border-radius: 6px; border-left: 3px solid #ef4444;">
    `;
    trans.errors.forEach(err => {
      html += `<div style="color: #fca5a5; margin-bottom: 4px;">⚠️ ${err}</div>`;
    });
    html += `</div></div>`;
  }

  modalBody.innerHTML = html;
  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('transaction-detail-modal').classList.add('hidden');
}

function renderRawData(content) {
  document.getElementById('raw-data-content').textContent = content;
}

function renderTimingDiagram() {
  if (!currentData || !currentData.signals || currentData.signals.length === 0) return;

  const signals = currentData.signals;
  const startTime = currentData.metadata.startTime;
  const endTime = currentData.metadata.endTime;
  const duration = endTime - startTime;

  const width = Math.max(800, duration * pixelPerUnit + 100);
  const height = 120;
  
  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  const signalHeight = 40;
  const sclY = 30;
  const sdaY = 70;

  drawSignal(signals, 'scl', startTime, sclY, signalHeight, '#4ecdc4');
  drawSignal(signals, 'sda', startTime, sdaY, signalHeight, '#ffe66d');

  drawTransactionMarkers(startTime);
  drawTimeRuler(startTime, endTime, width);
}

function drawSignal(signals, signalName, startTime, y, height, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();

  let isFirst = true;
  let lastX = 0;
  let lastValue = null;

  const maxPoints = 20000;
  const step = Math.max(1, Math.floor(signals.length / maxPoints));

  for (let i = 0; i < signals.length; i += step) {
    const signal = signals[i];
    const value = signal[signalName];
    const x = (signal.time - startTime) * pixelPerUnit + 20;

    if (value === null || value === undefined) continue;

    const yPos = y + (value === 0 ? height : 0);

    if (isFirst) {
      ctx.moveTo(x, yPos);
      isFirst = false;
    } else {
      ctx.lineTo(lastX, y + (lastValue === 0 ? height : 0));
      ctx.lineTo(x, y + (lastValue === 0 ? height : 0));
      ctx.lineTo(x, yPos);
    }

    lastX = x;
    lastValue = value;
  }

  ctx.stroke();
}

function drawTransactionMarkers(startTime) {
  if (!currentData.transactions) return;

  currentData.transactions.forEach((trans, index) => {
    const startX = (trans.startTime - startTime) * pixelPerUnit + 20;
    const endX = (trans.endTime - startTime) * pixelPerUnit + 20;

    ctx.fillStyle = 'rgba(233, 69, 96, 0.1)';
    ctx.fillRect(startX, 0, endX - startX, 120);

    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, 120);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, 120);
    ctx.stroke();
    ctx.setLineDash([]);

    if (endX - startX > 30) {
      ctx.fillStyle = '#e94560';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(`#${index + 1}`, startX + 4, 15);
    }
  });
}

function drawTimeRuler(startTime, endTime, width) {
  const ruler = document.getElementById('timing-ruler');
  ruler.innerHTML = '';
  ruler.style.width = width + 'px';

  const duration = endTime - startTime;
  const tickCount = Math.min(20, Math.floor(width / 100));
  const tickInterval = duration / tickCount;

  for (let i = 0; i <= tickCount; i++) {
    const time = startTime + i * tickInterval;
    const x = (time - startTime) * pixelPerUnit + 20;
    
    const tick = document.createElement('div');
    tick.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: 0;
      bottom: 0;
      width: 1px;
      background: #0f3460;
    `;
    
    const label = document.createElement('div');
    label.style.cssText = `
      position: absolute;
      left: ${x + 2}px;
      top: 8px;
      font-size: 10px;
      color: #888;
      font-family: monospace;
      white-space: nowrap;
    `;
    label.textContent = formatTime(time);
    
    ruler.appendChild(tick);
    ruler.appendChild(label);
  }
}

function handleCanvasMouseMove(e) {
  if (!currentData) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left + canvas.parentElement.scrollLeft;
  const y = e.clientY - rect.top;

  const startTime = currentData.metadata.startTime;
  const hoverTime = startTime + (x - 20) / pixelPerUnit;

  const tooltip = document.getElementById('timing-tooltip');
  tooltip.classList.remove('hidden');
  tooltip.style.left = (e.clientX - rect.left + 15) + 'px';
  tooltip.style.top = (e.clientY - rect.top + 15) + 'px';

  let signalInfo = '';
  for (let i = currentData.signals.length - 1; i >= 0; i--) {
    if (currentData.signals[i].time <= hoverTime) {
      const sig = currentData.signals[i];
      signalInfo = `SCL: ${sig.scl}, SDA: ${sig.sda}`;
      break;
    }
  }

  let transInfo = '';
  for (const trans of currentData.transactions) {
    if (hoverTime >= trans.startTime && hoverTime <= trans.endTime) {
      transInfo = `<br>传输 #${trans.id + 1}: ${trans.addressHex} ${trans.direction}`;
      break;
    }
  }

  tooltip.innerHTML = `时间: ${formatTime(hoverTime)}<br>${signalInfo}${transInfo}`;
}

function fitToWidth() {
  if (!currentData) return;
  
  const container = document.querySelector('.timing-canvas-wrapper');
  const containerWidth = container.clientWidth - 40;
  const duration = currentData.metadata.endTime - currentData.metadata.startTime;
  
  pixelPerUnit = containerWidth / duration;
  zoomLevel = Math.round((pixelPerUnit / 1000000) * 10);
  
  document.getElementById('zoom-slider').value = zoomLevel;
  document.getElementById('zoom-value').textContent = `${zoomLevel}x`;
  
  renderTimingDiagram();
}

function zoomIn() {
  zoomLevel = Math.min(100, zoomLevel + 5);
  document.getElementById('zoom-slider').value = zoomLevel;
  document.getElementById('zoom-value').textContent = `${zoomLevel}x`;
  pixelPerUnit = 1000000 * zoomLevel / 10;
  renderTimingDiagram();
}

function zoomOut() {
  zoomLevel = Math.max(1, zoomLevel - 5);
  document.getElementById('zoom-slider').value = zoomLevel;
  document.getElementById('zoom-value').textContent = `${zoomLevel}x`;
  pixelPerUnit = 1000000 * zoomLevel / 10;
  renderTimingDiagram();
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabName}`);
  });

  if (tabName === 'timing') {
    setTimeout(renderTimingDiagram, 100);
  } else if (tabName === 'errors') {
    renderErrorList();
  }
}

function exportData() {
  if (!currentData) return;

  const exportObj = {
    fileName: currentFileName,
    exportTime: new Date().toISOString(),
    metadata: currentData.metadata,
    errors: currentData.errors || [],
    transactions: currentData.transactions.map(t => ({
      id: t.id,
      type: t.type,
      address: t.addressHex,
      direction: t.direction,
      startTime: t.startTime,
      endTime: t.endTime,
      description: t.description,
      cccName: t.cccName || null,
      cccCode: t.cccCode || null,
      cccDescription: t.cccDescription || null,
      bytes: t.bytes ? t.bytes.map(b => ({
        hex: b.hex,
        value: b.value,
        binary: b.binary,
        ack: b.ack,
        isAddress: b.isAddress,
        isCCC: b.isCCC || false,
        cccName: b.cccName || null,
        cccDescription: b.cccDescription || null
      })) : [],
      errors: t.errors || []
    }))
  };

  const dataStr = JSON.stringify(exportObj, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFileName.replace('.csv', '_analyzed.json');
  a.click();
  URL.revokeObjectURL(url);
}

function exportPCAPNG() {
  if (!currentData) return;

  try {
    const pcapngData = buildPCAPNG(currentData, currentFileName);
    
    const uint8Array = new Uint8Array(pcapngData.buffer);
    const blob = new Blob([uint8Array], { type: 'application/vnd.tcpdump.pcapng' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFileName.replace('.csv', '.pcapng');
    a.click();
    URL.revokeObjectURL(url);

    alert(`PCAPNG 导出成功!\n\n数据包数: ${pcapngData.packetCount}\n文件大小: ${formatFileSize(pcapngData.length)}`);
  } catch (error) {
    alert('PCAPNG 导出失败: ' + error.message);
    console.error(error);
  }
}

function renderErrorList() {
  if (!currentData || !currentData.errors) return;

  const errors = currentData.errors;
  const errorStats = currentData.metadata.errorStats || {};
  
  const summaryContainer = document.getElementById('errors-summary');
  const listContainer = document.getElementById('error-list');

  if (errors.length === 0) {
    summaryContainer.innerHTML = '';
    listContainer.innerHTML = `
      <div class="no-errors">
        <div class="no-errors-icon">✅</div>
        <h3>没有检测到错误</h3>
        <p>总线数据看起来很健康</p>
      </div>
    `;
    return;
  }

  let summaryHTML = '';
  const severityCounts = { error: 0, warning: 0, info: 0 };
  
  errors.forEach(e => {
    severityCounts[e.severity] = (severityCounts[e.severity] || 0) + 1;
  });

  if (severityCounts.error > 0) {
    summaryHTML += `<div class="error-summary-item error"><span>🚫</span> <span class="error-summary-count">${severityCounts.error}</span> <span>错误</span></div>`;
  }
  if (severityCounts.warning > 0) {
    summaryHTML += `<div class="error-summary-item warning"><span>⚠️</span> <span class="error-summary-count">${severityCounts.warning}</span> <span>警告</span></div>`;
  }
  if (severityCounts.info > 0) {
    summaryHTML += `<div class="error-summary-item info"><span>ℹ️</span> <span class="error-summary-count">${severityCounts.info}</span> <span>信息</span></div>`;
  }

  Object.keys(errorStats).forEach(key => {
    const stat = errorStats[key];
    if (stat.count > 0) {
      const emoji = stat.type.severity === 'error' ? '🚫' : stat.type.severity === 'warning' ? '⚠️' : 'ℹ️';
      summaryHTML += `<div class="error-summary-item ${stat.type.severity}">${emoji} <span class="error-summary-count">${stat.count}</span> <span>${stat.type.code}</span></div>`;
    }
  });

  summaryContainer.innerHTML = summaryHTML;

  let listHTML = '';
  errors.forEach((error, index) => {
    const severityClass = error.severity;
    const transLink = error.transactionId !== null 
      ? `<div class="error-item-transaction">关联传输: <a onclick="jumpToTransaction(${error.transactionId})">#${error.transactionId + 1}</a></div>` 
      : '';

    listHTML += `
      <div class="error-item ${severityClass}">
        <div class="error-item-header">
          <span class="error-item-type ${severityClass}">${error.code}</span>
          <span class="error-item-time">${formatTime(error.time)}</span>
        </div>
        <div class="error-item-details">${error.details}</div>
        <div class="error-item-code">${error.description}</div>
        ${transLink}
      </div>
    `;
  });

  listContainer.innerHTML = listHTML;
}

function jumpToTransaction(transactionId) {
  switchTab('transactions');
  setTimeout(() => {
    const items = document.querySelectorAll('.transaction-item');
    if (items[transactionId]) {
      items[transactionId].scrollIntoView({ behavior: 'smooth', block: 'center' });
      items[transactionId].style.borderColor = '#e94560';
      items[transactionId].style.boxShadow = '0 0 20px rgba(233, 69, 96, 0.5)';
      setTimeout(() => {
        items[transactionId].style.borderColor = '';
        items[transactionId].style.boxShadow = '';
      }, 2000);
    }
  }, 200);
}

function formatTime(seconds) {
  if (seconds < 0.000001) {
    return (seconds * 1000000000).toFixed(2) + ' ns';
  } else if (seconds < 0.001) {
    return (seconds * 1000000).toFixed(2) + ' µs';
  } else if (seconds < 1) {
    return (seconds * 1000).toFixed(2) + ' ms';
  } else {
    return seconds.toFixed(4) + ' s';
  }
}
