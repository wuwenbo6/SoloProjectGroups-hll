let currentElements = [];
let modifiedTags = new Set();
let pixelDataInfo = null;
let pixelValues = null;
let canvas = null;
let ctx = null;
let isDrawing = false;
let startX = 0;
let startY = 0;
let endX = 0;
let endY = 0;
let currentTransferSyntax = null;
let isLargeFile = false;
let currentFileSize = 0;

const btnLoad = document.getElementById('btnLoad');
const btnSave = document.getElementById('btnSave');
const fileInfo = document.getElementById('fileInfo');
const searchInput = document.getElementById('searchInput');
const tagTableContainer = document.getElementById('tagTableContainer');
const pixelDataContainer = document.getElementById('pixelDataContainer');

btnLoad.addEventListener('click', loadDicomFile);
btnSave.addEventListener('click', saveDicomFile);
searchInput.addEventListener('input', filterTags);

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function loadDicomFile() {
  try {
    const result = await window.dicomAPI.loadDicom();

    if (result.canceled) return;

    if (!result.success) {
      showNotification('加载失败: ' + result.error, 'error');
      return;
    }

    currentElements = result.elements;
    modifiedTags = new Set();
    currentTransferSyntax = result.transferSyntax;
    isLargeFile = result.isLargeFile;
    currentFileSize = result.fileSize;

    const transferSyntaxText = currentTransferSyntax 
      ? `${currentTransferSyntax.name} (${currentTransferSyntax.littleEndian ? 'Little Endian' : 'Big Endian'})`
      : 'Unknown';
    
    const fileModeText = isLargeFile ? ' [大文件模式]' : '';

    fileInfo.innerHTML = `
      <strong>${result.fileName}</strong>
      <span style="opacity: 0.8; margin-left: 10px;">${formatFileSize(currentFileSize)}</span>
      <span style="opacity: 0.8; margin-left: 10px;">${transferSyntaxText}${fileModeText}</span>
    `;

    renderTagTable(currentElements);

    const pixelInfo = await window.dicomAPI.getPixelDataInfo();
    if (pixelInfo.success) {
      pixelDataInfo = pixelInfo;
      const pixelResult = await window.dicomAPI.getPixelData();
      if (pixelResult.success) {
        pixelValues = pixelResult.pixels;
        renderPixelData();
      }
    } else {
      renderNoPixelData();
    }

    btnSave.disabled = false;
    btnValidate.disabled = false;
    btnExport.disabled = false;
    validationPanel.classList.remove('active');
    showNotification(`DICOM 文件加载成功${fileModeText}`, 'success');
  } catch (error) {
    showNotification('加载失败: ' + error.message, 'error');
  }
}

function renderTagTable(elements) {
  const filteredElements = filterElements(elements, searchInput.value);

  if (filteredElements.length === 0) {
    tagTableContainer.innerHTML = `
      <div class="empty-state">
        <p>没有找到匹配的 Tags</p>
      </div>
    `;
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th style="width: 120px;">Tag</th>
          <th style="width: 60px;">VR</th>
          <th>Value</th>
          <th style="width: 200px;">Description</th>
        </tr>
      </thead>
      <tbody>
  `;

  filteredElements.forEach((element) => {
    const isModified = modifiedTags.has(element.tag);
    const isPixelData = element.tag === 'x7fe00010';
    const isLargeFilePixelData = isLargeFile && isPixelData;
    
    html += `
      <tr class="${isModified ? 'modified' : ''}" data-tag="${element.tag}">
        <td class="tag">${element.tagFormatted}</td>
        <td class="vr">${element.vr}</td>
        <td class="value">
          ${isLargeFile && element.tag === 'x7fe00010' 
            ? '<span style="color: #e67e22;">[大文件模式 - 不显示像素数据]</span>'
            : `<input type="text" value="${escapeHtml(element.value)}" data-tag="${element.tag}" data-vr="${element.vr}" ${isLargeFile ? 'disabled' : ''}>`
          }
        </td>
        <td class="description">${element.description}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  tagTableContainer.innerHTML = html;

  const inputs = tagTableContainer.querySelectorAll('input[data-tag]');
  inputs.forEach((input) => {
    input.addEventListener('change', handleTagEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
      }
    });
  });
}

function filterElements(elements, searchTerm) {
  if (!searchTerm) return elements;

  const term = searchTerm.toLowerCase();
  return elements.filter((el) =>
    el.tag.toLowerCase().includes(term) ||
    el.tagFormatted.toLowerCase().includes(term) ||
    (el.description && el.description.toLowerCase().includes(term)) ||
    (el.value && el.value.toLowerCase().includes(term))
  );
}

function filterTags() {
  renderTagTable(currentElements);
}

async function handleTagEdit(event) {
  const input = event.target;
  const tag = input.dataset.tag;
  const newValue = input.value;

  const element = currentElements.find((el) => el.tag === tag);
  if (!element) return;

  if (element.value === newValue) return;

  try {
    const result = await window.dicomAPI.setTagValue(tag, newValue);

    if (result.success) {
      element.value = newValue;
      modifiedTags.add(tag);

      const row = input.closest('tr');
      if (row) row.classList.add('modified');

      showNotification(`Tag ${element.tagFormatted} 已更新`, 'success');

      if (tag === 'x00280010' || tag === 'x00280011') {
        const pixelResult = await window.dicomAPI.getPixelData();
        if (pixelResult.success) {
          pixelValues = pixelResult.pixels;
          renderPixelData();
        }
      }
    } else {
      showNotification('更新失败: ' + result.error, 'error');
      input.value = element.value;
    }
  } catch (error) {
    showNotification('更新失败: ' + error.message, 'error');
    input.value = element.value;
  }
}

async function saveDicomFile() {
  try {
    const result = await window.dicomAPI.saveDicom();

    if (result.canceled) return;

    if (result.success) {
      modifiedTags.clear();
      fileInfo.innerHTML = `
        <strong>${result.filePath.split('/').pop()}</strong>
        <span style="opacity: 0.8; margin-left: 10px;">${formatFileSize(currentFileSize)}</span>
        <span style="opacity: 0.8; margin-left: 10px;">${currentTransferSyntax?.name || 'Unknown'}</span>
      `;
      renderTagTable(currentElements);
      showNotification('文件保存成功', 'success');
    } else {
      showNotification('保存失败: ' + result.error, 'error');
    }
  } catch (error) {
    showNotification('保存失败: ' + error.message, 'error');
  }
}

function renderPixelData() {
  if (!pixelDataInfo || !pixelValues) {
    renderNoPixelData();
    return;
  }

  const { rows, cols, bitsAllocated, photometricInterpretation } = pixelDataInfo;

  pixelDataContainer.innerHTML = `
    <div class="pixel-info">
      尺寸: <span>${cols} x ${rows}</span> | 
      位深: <span>${bitsAllocated}</span> | 
      类型: <span>${photometricInterpretation}</span>
      ${isLargeFile ? ' | <span style="color: #e67e22;">大文件模式</span>' : ''}
    </div>
    <div class="canvas-wrapper">
      <canvas id="pixelCanvas"></canvas>
    </div>
    <div class="roi-controls">
      <h3>ROI 像素值替换</h3>
      <div class="control-group">
        <div>
          <label>起始 X</label>
          <input type="number" id="roiStartX" value="0" min="0" max="${cols - 1}">
        </div>
        <div>
          <label>起始 Y</label>
          <input type="number" id="roiStartY" value="0" min="0" max="${rows - 1}">
        </div>
      </div>
      <div class="control-group">
        <div>
          <label>宽度</label>
          <input type="number" id="roiWidth" value="50" min="1" max="${cols}">
        </div>
        <div>
          <label>高度</label>
          <input type="number" id="roiHeight" value="50" min="1" max="${rows}">
        </div>
      </div>
      <div class="control-group">
        <div>
          <label>新像素值</label>
          <input type="number" id="roiNewValue" value="0" min="0" max="${Math.pow(2, bitsAllocated) - 1}">
        </div>
        <div>
          <label>&nbsp;</label>
          <button class="btn btn-apply" id="btnApplyROI">应用 ROI 替换</button>
        </div>
      </div>
      <div class="pixel-info" style="margin-top: 10px;">
        提示: 在图像上拖动鼠标可以框选 ROI 区域
        ${isLargeFile ? '<br><span style="color: #e67e22;">注意: 大文件模式下 ROI 操作直接写入文件</span>' : ''}
      </div>
    </div>
  `;

  canvas = document.getElementById('pixelCanvas');
  ctx = canvas.getContext('2d');

  const maxDimension = 400;
  const scale = Math.min(maxDimension / cols, maxDimension / rows, 1);
  canvas.width = cols * scale;
  canvas.height = rows * scale;

  drawPixelImage(scale);

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);

  document.getElementById('btnApplyROI').addEventListener('click', applyROIReplacement);
}

function drawPixelImage(scale = 1) {
  if (!pixelValues || !pixelDataInfo) return;

  const { rows, cols, bitsAllocated, photometricInterpretation } = pixelDataInfo;

  const imageData = ctx.createImageData(cols * scale, rows * scale);

  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let i = 0; i < pixelValues.length; i++) {
    if (pixelValues[i] < minVal) minVal = pixelValues[i];
    if (pixelValues[i] > maxVal) maxVal = pixelValues[i];
  }

  const range = maxVal - minVal || 1;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const pixelIndex = y * cols + x;
      const rawValue = pixelValues[pixelIndex];
      let normalizedValue;

      if (photometricInterpretation === 'MONOCHROME1') {
        normalizedValue = 1 - (rawValue - minVal) / range;
      } else {
        normalizedValue = (rawValue - minVal) / range;
      }

      const grayValue = Math.floor(normalizedValue * 255);

      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const idx = ((y * scale + sy) * cols * scale + (x * scale + sx)) * 4;
          imageData.data[idx] = grayValue;
          imageData.data[idx + 1] = grayValue;
          imageData.data[idx + 2] = grayValue;
          imageData.data[idx + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function renderNoPixelData() {
  pixelDataContainer.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <polyline points="21 15 16 10 5 21"></polyline>
      </svg>
      <p>此文件不包含像素数据</p>
    </div>
  `;
}

function startDrawing(e) {
  isDrawing = true;
  const rect = canvas.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;
  endX = startX;
  endY = startY;
}

function draw(e) {
  if (!isDrawing) return;

  const rect = canvas.getBoundingClientRect();
  endX = e.clientX - rect.left;
  endY = e.clientY - rect.top;

  const { rows, cols, bitsAllocated, photometricInterpretation } = pixelDataInfo;
  const scale = canvas.width / cols;

  drawPixelImage(scale);

  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    Math.min(startX, endX),
    Math.min(startY, endY),
    Math.abs(endX - startX),
    Math.abs(endY - startY)
  );
}

function stopDrawing(e) {
  if (!isDrawing) return;
  isDrawing = false;

  const { cols, rows } = pixelDataInfo;
  const scale = canvas.width / cols;

  const pixelStartX = Math.floor(Math.min(startX, endX) / scale);
  const pixelStartY = Math.floor(Math.min(startY, endY) / scale);
  const pixelWidth = Math.ceil(Math.abs(endX - startX) / scale);
  const pixelHeight = Math.ceil(Math.abs(endY - startY) / scale);

  if (pixelWidth > 1 && pixelHeight > 1) {
    document.getElementById('roiStartX').value = pixelStartX;
    document.getElementById('roiStartY').value = pixelStartY;
    document.getElementById('roiWidth').value = pixelWidth;
    document.getElementById('roiHeight').value = pixelHeight;
  }
}

async function applyROIReplacement() {
  const startX = parseInt(document.getElementById('roiStartX').value);
  const startY = parseInt(document.getElementById('roiStartY').value);
  const width = parseInt(document.getElementById('roiWidth').value);
  const height = parseInt(document.getElementById('roiHeight').value);
  const newValue = parseInt(document.getElementById('roiNewValue').value);

  if (width <= 0 || height <= 0) {
    showNotification('宽度和高度必须大于 0', 'error');
    return;
  }

  if (!pixelDataInfo) {
    showNotification('没有像素数据', 'error');
    return;
  }

  if (startX + width > pixelDataInfo.cols || startY + height > pixelDataInfo.rows) {
    showNotification('ROI 超出图像边界', 'error');
    return;
  }

  try {
    const result = await window.dicomAPI.applyROIReplacement({
      startX,
      startY,
      width,
      height,
      newValue,
    });

    if (result.success) {
      const pixelResult = await window.dicomAPI.getPixelData();
      if (pixelResult.success) {
        pixelValues = pixelResult.pixels;
        const scale = canvas.width / pixelDataInfo.cols;
        drawPixelImage(scale);
      }
      showNotification(`ROI 替换已应用${isLargeFile ? ' (已写入文件)' : ''}`, 'success');
    } else {
      showNotification('ROI 替换失败: ' + result.error, 'error');
    }
  } catch (error) {
    showNotification('ROI 替换失败: ' + error.message, 'error');
  }
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const btnValidate = document.getElementById('btnValidate');
const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');
const btnBatch = document.getElementById('btnBatch');
const validationPanel = document.getElementById('validationPanel');
const validationSummary = document.getElementById('validationSummary');
const validationResults = document.getElementById('validationResults');
const batchModal = document.getElementById('batchModal');
const batchModalClose = document.getElementById('batchModalClose');
const btnCancelBatch = document.getElementById('btnCancelBatch');
const btnExecuteBatch = document.getElementById('btnExecuteBatch');
const btnAddTag = document.getElementById('btnAddTag');
const batchTagList = document.getElementById('batchTagList');
const batchResults = document.getElementById('batchResults');

btnValidate.addEventListener('click', validateDicom);
btnExport.addEventListener('click', exportTagDictionary);
btnImport.addEventListener('click', importTagDictionary);
btnBatch.addEventListener('click', openBatchModal);
batchModalClose.addEventListener('click', closeBatchModal);
btnCancelBatch.addEventListener('click', closeBatchModal);
btnAddTag.addEventListener('click', addBatchTagItem);
btnExecuteBatch.addEventListener('click', executeBatchModify);

function validateDicom() {
  window.dicomAPI.validateDicom().then((result) => {
    if (!result.success) {
      showNotification('校验失败: ' + result.error, 'error');
      return;
    }

    if (result.totalErrors === 0 && result.totalWarnings === 0) {
      validationSummary.innerHTML = `
        <span><strong>校验通过</strong> - 所有必填 Tag 完整</span>
        <span>
          <span class="errors">错误: 0</span> | 
          <span class="warnings">警告: 0</span>
        </span>
      `;
      validationResults.innerHTML = '';
    } else {
      validationSummary.innerHTML = `
        <span><strong>校验完成</strong> - 发现问题</span>
        <span>
          <span class="errors">错误: ${result.totalErrors}</span> | 
          <span class="warnings">警告: ${result.totalWarnings}</span>
        </span>
      `;

      let html = '';
      result.errors.forEach((item) => {
        html += `
          <div class="validation-item error">
            <span class="tag">${item.tagFormatted}</span>
            <span class="name">${item.name}</span>
            <span class="message">${item.message}</span>
            <span class="module">${item.module}</span>
          </div>
        `;
      });
      result.warnings.forEach((item) => {
        html += `
          <div class="validation-item warning">
            <span class="tag">${item.tagFormatted}</span>
            <span class="name">${item.name}</span>
            <span class="message">${item.message}</span>
            <span class="module">${item.module}</span>
          </div>
        `;
      });
      validationResults.innerHTML = html;
    }

    validationPanel.classList.add('active');
    showNotification(`校验完成: ${result.totalErrors} 个错误, ${result.totalWarnings} 个警告`, 
      result.totalErrors > 0 ? 'error' : (result.totalWarnings > 0 ? 'info' : 'success'));
  }).catch((error) => {
    showNotification('校验失败: ' + error.message, 'error');
  });
}

function exportTagDictionary() {
  window.dicomAPI.exportTagDictionary().then((result) => {
    if (result.canceled) return;
    
    if (result.success) {
      showNotification(`已导出 ${result.tagCount} 个 Tag 到 ${result.filePath}`, 'success');
    } else {
      showNotification('导出失败: ' + result.error, 'error');
    }
  }).catch((error) => {
    showNotification('导出失败: ' + error.message, 'error');
  });
}

function importTagDictionary() {
  window.dicomAPI.importTagDictionary().then((result) => {
    if (result.canceled) return;
    
    if (result.success) {
      const tags = result.data.tags;
      let importedCount = 0;

      const applyPromises = Object.keys(tags).map(async (tagKey) => {
        const tagData = tags[tagKey];
        if (!tagData.value || tagData.value === '[二进制数据]') return;

        try {
          const updateResult = await window.dicomAPI.setTagValue(tagKey, tagData.value);
          if (updateResult.success) {
            const element = currentElements.find((el) => el.tag === tagKey);
            if (element) {
              element.value = tagData.value;
              modifiedTags.add(tagKey);
            }
            importedCount++;
          }
        } catch (e) {}
      });

      Promise.all(applyPromises).then(() => {
        renderTagTable(currentElements);
        showNotification(`已从字典导入 ${importedCount} 个 Tag 值`, 'success');
      });
    } else {
      showNotification('导入失败: ' + result.error, 'error');
    }
  }).catch((error) => {
    showNotification('导入失败: ' + error.message, 'error');
  });
}

let batchTagItems = [];

function openBatchModal() {
  batchTagItems = [];
  renderBatchTagList();
  batchResults.style.display = 'none';
  batchResults.innerHTML = '';
  batchModal.classList.add('active');
}

function closeBatchModal() {
  batchModal.classList.remove('active');
}

function addBatchTagItem() {
  batchTagItems.push({ tag: '', value: '' });
  renderBatchTagList();
}

function removeBatchTagItem(index) {
  batchTagItems.splice(index, 1);
  renderBatchTagList();
}

function updateBatchTagItem(index, field, value) {
  batchTagItems[index][field] = value;
}

const COMMON_TAGS = [
  { tag: 'x00080060', name: 'Modality (0008,0060)' },
  { tag: 'x00080070', name: 'Manufacturer (0008,0070)' },
  { tag: 'x00080080', name: 'Institution Name (0008,0080)' },
  { tag: 'x00080090', name: 'Referring Physician (0008,0090)' },
  { tag: 'x00100010', name: 'Patient Name (0010,0010)' },
  { tag: 'x00100020', name: 'Patient ID (0010,0020)' },
  { tag: 'x00100030', name: 'Patient Birth Date (0010,0030)' },
  { tag: 'x00100040', name: 'Patient Sex (0010,0040)' },
  { tag: 'x00181030', name: 'Protocol Name (0018,1030)' },
  { tag: 'x00200011', name: 'Series Number (0020,0011)' },
  { tag: 'x00280010', name: 'Rows (0028,0010)' },
  { tag: 'x00280011', name: 'Columns (0028,0011)' },
];

function renderBatchTagList() {
  if (batchTagItems.length === 0) {
    batchTagList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">点击上方按钮添加要修改的 Tag</p>';
    return;
  }

  let html = '';
  batchTagItems.forEach((item, index) => {
    html += `
      <div class="batch-tag-item">
        <select onchange="updateBatchTagItem(${index}, 'tag', this.value)">
          <option value="">选择 Tag...</option>
          ${COMMON_TAGS.map((t) => `<option value="${t.tag}" ${item.tag === t.tag ? 'selected' : ''}>${t.name}</option>`).join('')}
        </select>
        <input type="text" placeholder="新值" value="${escapeHtml(item.value)}" 
               onchange="updateBatchTagItem(${index}, 'value', this.value)">
        <button class="btn-remove" onclick="removeBatchTagItem(${index})">×</button>
      </div>
    `;
  });
  batchTagList.innerHTML = html;
}

function executeBatchModify() {
  const modifications = batchTagItems
    .filter((item) => item.tag && item.value)
    .map((item) => ({ tag: item.tag, value: item.value }));

  if (modifications.length === 0) {
    showNotification('请至少添加一个有效的 Tag 修改', 'error');
    return;
  }

  window.dicomAPI.batchModifyTags(modifications).then((result) => {
    if (result.canceled) return;
    
    if (result.success) {
      let html = `<p style="font-weight: 600; margin-bottom: 10px;">
        处理完成: ${result.successCount}/${result.totalFiles} 成功, ${result.failCount} 失败
      </p>`;
      
      result.results.forEach((r) => {
        html += `
          <div class="batch-result-item ${r.success ? 'success' : 'error'}">
            ${r.filePath.split('/').pop()}: ${r.message || r.error}
          </div>
        `;
      });
      
      batchResults.innerHTML = html;
      batchResults.style.display = 'block';
      
      showNotification(`批量修改完成: ${result.successCount} 成功, ${result.failCount} 失败`, 
        result.failCount > 0 ? 'error' : 'success');
    } else {
      showNotification('批量修改失败: ' + result.error, 'error');
    }
  }).catch((error) => {
    showNotification('批量修改失败: ' + error.message, 'error');
  });
}

window.updateBatchTagItem = updateBatchTagItem;
window.removeBatchTagItem = removeBatchTagItem;