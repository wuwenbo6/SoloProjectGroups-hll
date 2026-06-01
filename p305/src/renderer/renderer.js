const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const runDrcBtn = document.getElementById('runDrcBtn');
const canvas = document.getElementById('gerberCanvas');
const ctx = canvas.getContext('2d');
const canvasWrapper = document.getElementById('canvasWrapper');
const canvasPlaceholder = document.getElementById('canvasPlaceholder');
const coordDisplay = document.getElementById('coordDisplay');
const summaryPanel = document.getElementById('summaryPanel');
const netsPanel = document.getElementById('netsPanel');
const netListEl = document.getElementById('netList');
const violationsPanel = document.getElementById('violationsPanel');
const violationsBody = document.getElementById('violationsBody');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const fitBtn = document.getElementById('fitBtn');
const showViolationsCb = document.getElementById('showViolations');
const showTracesCb = document.getElementById('showTraces');
const showPadsCb = document.getElementById('showPads');

let parsedFiles = {};
let currentParsedData = null;
let currentViolations = [];
let activeFilter = 'all';
let netColors = {};
let visibleNets = new Set();
let currentFileName = '';
let currentDRCSummary = null;
let currentDRCRules = null;

let viewTransform = { offsetX: 0, offsetY: 0, scale: 1 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let lastOffset = { x: 0, y: 0 };

const NET_COLORS = [
  '#3fb950', '#58a6ff', '#f85149', '#d29922', '#bc8cff',
  '#56d364', '#f778ba', '#79b8ff', '#ffa657', '#a371f7',
  '#34d058', '#ff7b72', '#d2a8ff', '#6e40c9', '#2ea6ff'
];

function getNetColor(netName) {
  if (!netColors[netName]) {
    const index = Object.keys(netColors).length % NET_COLORS.length;
    netColors[netName] = NET_COLORS[index];
  }
  return netColors[netName];
}

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  handleFiles(Array.from(e.dataTransfer.files));
});

fileInput.addEventListener('change', () => {
  handleFiles(Array.from(fileInput.files));
  fileInput.value = '';
});

async function handleFiles(files) {
  for (const file of files) {
    const filePath = file.path || file.name;
    try {
      const data = await window.electronAPI.parseGerber(filePath);
      parsedFiles[file.name] = data;
      addFileItem(file.name, data);
    } catch (err) {
      addFileItem(file.name, null, err.message);
    }
  }
  updateCurrentLayer();
  runDrcBtn.disabled = Object.keys(parsedFiles).length === 0;
}

function addFileItem(name, data, error) {
  const div = document.createElement('div');
  div.className = 'file-item';
  const icon = data ? '✅' : '❌';
  div.innerHTML = `
    <span class="file-icon">${icon}</span>
    <span class="file-name" title="${name}">${name}</span>
    <span class="file-remove" data-name="${name}">✕</span>
  `;
  div.querySelector('.file-remove').addEventListener('click', () => {
    delete parsedFiles[name];
    div.remove();
    updateCurrentLayer();
    runDrcBtn.disabled = Object.keys(parsedFiles).length === 0;
  });
  div.addEventListener('click', (e) => {
    if (e.target.classList.contains('file-remove')) return;
    updateCurrentLayer(name);
  });
  fileList.appendChild(div);
}

function updateCurrentLayer(name) {
  const keys = Object.keys(parsedFiles);
  if (keys.length === 0) {
    currentParsedData = null;
    currentViolations = [];
    currentFileName = '';
    canvasPlaceholder.style.display = '';
    violationsPanel.style.display = 'none';
    summaryPanel.style.display = 'none';
    netsPanel.style.display = 'none';
    resizeCanvas();
    return;
  }
  const selectedName = name || keys[0];
  currentFileName = selectedName;
  currentParsedData = parsedFiles[selectedName];

  netColors = {};
  visibleNets.clear();
  if (currentParsedData.nets) {
    Object.keys(currentParsedData.nets).forEach(n => visibleNets.add(n));
  }
  renderNetList();

  canvasPlaceholder.style.display = 'none';
  netsPanel.style.display = '';
  fitToView();
}

function renderNetList() {
  netListEl.innerHTML = '';
  if (!currentParsedData || !currentParsedData.nets) return;

  const nets = Object.keys(currentParsedData.nets);
  nets.forEach((netName, i) => {
    const netData = currentParsedData.nets[netName];
    const color = getNetColor(netName);
    const count = netData.traces.length + netData.pads.length;
    const div = document.createElement('div');
    div.className = 'net-item';
    const isVisible = visibleNets.has(netName);
    div.innerHTML = `
      <input type="checkbox" ${isVisible ? 'checked' : ''} data-net="${netName}">
      <span class="net-color" style="background: ${color}"></span>
      <span class="net-name">${netName}</span>
      <span class="net-count">${count}</span>
    `;
    div.querySelector('input').addEventListener('change', (e) => {
      e.stopPropagation();
      if (e.target.checked) {
        visibleNets.add(netName);
      } else {
        visibleNets.delete(netName);
      }
      renderCanvas();
    });
    netListEl.appendChild(div);
  });
}

runDrcBtn.addEventListener('click', async () => {
  if (!currentParsedData) return;

  const rules = {
    minLineWidth: parseFloat(document.getElementById('minLineWidth').value) || 0.1,
    minSpacing: parseFloat(document.getElementById('minSpacing').value) || 0.1,
    minAnnularRing: parseFloat(document.getElementById('minAnnularRing').value) || 0.05,
    drillSize: parseFloat(document.getElementById('drillSize').value) || 0.2,
    minMicroviaDiameter: parseFloat(document.getElementById('minMicroviaDiameter').value) || 0.05,
    maxMicroviaDiameter: parseFloat(document.getElementById('maxMicroviaDiameter').value) || 0.15,
    minMicroviaAnnularRing: parseFloat(document.getElementById('minMicroviaAnnularRing').value) || 0.02,
    minMicroviaSpacing: parseFloat(document.getElementById('minMicroviaSpacing').value) || 0.2,
    microviaDiameterThreshold: parseFloat(document.getElementById('microviaDiameterThreshold').value) || 0.15,
  };

  showLoading(true);
  try {
    const result = await window.electronAPI.runDRC(currentParsedData, rules);
    currentViolations = result.violations;
    currentDRCSummary = result.summary;
    currentDRCRules = rules;
    updateSummary(result.summary);
    renderViolationsTable(currentViolations);
    summaryPanel.style.display = '';
    violationsPanel.style.display = '';
    renderCanvas();
  } catch (err) {
    alert('DRC 检查失败: ' + err.message);
  }
  showLoading(false);
});

exportPdfBtn.addEventListener('click', async () => {
  if (!currentViolations || currentViolations.length === 0) {
    alert('请先运行 DRC 检查');
    return;
  }

  const reportData = {
    fileName: currentFileName || 'unknown',
    rules: currentDRCRules,
    violations: currentViolations,
    summary: currentDRCSummary,
    fileStats: {
      traceCount: currentParsedData.traces.length,
      padCount: currentParsedData.pads.length,
      netCount: Object.keys(currentParsedData.nets || {}).length,
      regionCount: currentParsedData.regions.length,
    },
  };

  showLoading(true);
  try {
    const success = await window.electronAPI.savePdfReport(reportData);
    if (success) {
      alert('PDF 报告导出成功！');
    }
  } catch (err) {
    alert('PDF 导出失败: ' + err.message);
  }
  showLoading(false);
});

function updateSummary(summary) {
  document.getElementById('totalCount').textContent = summary.total;
  document.getElementById('widthCount').textContent = summary.lineWidth;
  document.getElementById('spacingCount').textContent = summary.spacing;
  document.getElementById('ringCount').textContent = summary.annularRing;
  document.getElementById('microviaCount').textContent = summary.microvia || 0;
}

function renderViolationsTable(violations) {
  violationsBody.innerHTML = '';
  const filtered = activeFilter === 'all' ? violations : violations.filter(v => v.type === activeFilter);

  filtered.forEach((v, i) => {
    const tr = document.createElement('tr');
    tr.className = 'violation-row';
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><span class="type-badge type-${v.type}">${typeLabel(v.type)}</span></td>
      <td><span class="severity-${v.severity}">${v.severity === 'error' ? '错误' : '警告'}</span></td>
      <td>${v.x.toFixed(4)}</td>
      <td>${v.y.toFixed(4)}</td>
      <td>${v.actual != null ? v.actual.toFixed(4) + 'mm' : '-'}</td>
      <td>${v.required != null ? v.required.toFixed(4) + 'mm' : '-'}</td>
      <td>${v.message}</td>
    `;
    tr.addEventListener('click', () => {
      panToViolation(v);
    });
    violationsBody.appendChild(tr);
  });
}

function typeLabel(type) {
  switch (type) {
    case 'line_width': return '线宽';
    case 'spacing': return '间距';
    case 'annular_ring': return '环宽';
    case 'microvia': return '微孔';
    default: return type;
  }
}

function panToViolation(v) {
  const canvasW = canvas.width / window.devicePixelRatio;
  const canvasH = canvas.height / window.devicePixelRatio;
  viewTransform.offsetX = canvasW / 2 - v.x * viewTransform.scale;
  viewTransform.offsetY = canvasH / 2 - (-v.y) * viewTransform.scale;
  renderCanvas();
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderViolationsTable(currentViolations);
  });
});

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvasWrapper.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderCanvas();
}

function fitToView() {
  if (!currentParsedData) return;
  const { bounds } = currentParsedData;
  const canvasW = canvasWrapper.getBoundingClientRect().width;
  const canvasH = canvasWrapper.getBoundingClientRect().height;
  const dataW = bounds.maxX - bounds.minX;
  const dataH = bounds.maxY - bounds.minY;

  if (dataW === 0 || dataH === 0) return;

  const margin = 40;
  const scaleX = (canvasW - margin * 2) / dataW;
  const scaleY = (canvasH - margin * 2) / dataH;
  viewTransform.scale = Math.min(scaleX, scaleY);

  viewTransform.offsetX = (canvasW - dataW * viewTransform.scale) / 2 - bounds.minX * viewTransform.scale;
  viewTransform.offsetY = (canvasH - dataH * viewTransform.scale) / 2 + bounds.maxY * viewTransform.scale;

  resizeCanvas();
}

function worldToScreen(wx, wy) {
  return {
    x: wx * viewTransform.scale + viewTransform.offsetX,
    y: -wy * viewTransform.scale + viewTransform.offsetY,
  };
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - viewTransform.offsetX) / viewTransform.scale,
    y: -(sy - viewTransform.offsetY) / viewTransform.scale,
  };
}

function renderCanvas() {
  const canvasW = canvas.width / window.devicePixelRatio;
  const canvasH = canvas.height / window.devicePixelRatio;
  ctx.clearRect(0, 0, canvasW, canvasH);

  if (!currentParsedData) return;

  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(0, 0, canvasW, canvasH);

  drawGrid(canvasW, canvasH);

  if (showTracesCb.checked) {
    drawTraces();
  }
  if (showPadsCb.checked) {
    drawPads();
  }
  drawRegions();

  if (showViolationsCb.checked && currentViolations.length > 0) {
    drawViolations();
  }
}

function drawGrid(canvasW, canvasH) {
  ctx.strokeStyle = 'rgba(48, 54, 61, 0.4)';
  ctx.lineWidth = 0.5;

  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(canvasW, canvasH);

  let gridSize = 1;
  if (viewTransform.scale < 5) gridSize = 10;
  if (viewTransform.scale < 0.5) gridSize = 100;

  const startX = Math.floor(topLeft.x / gridSize) * gridSize;
  const endX = Math.ceil(bottomRight.x / gridSize) * gridSize;
  const startY = Math.floor(bottomRight.y / gridSize) * gridSize;
  const endY = Math.ceil(topLeft.y / gridSize) * gridSize;

  ctx.beginPath();
  for (let x = startX; x <= endX; x += gridSize) {
    const s = worldToScreen(x, 0);
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, canvasH);
  }
  for (let y = startY; y <= endY; y += gridSize) {
    const s = worldToScreen(0, y);
    ctx.moveTo(0, s.y);
    ctx.lineTo(canvasW, s.y);
  }
  ctx.stroke();
}

function drawTraces() {
  const traces = currentParsedData.traces;
  ctx.lineCap = 'round';

  for (const trace of traces) {
    if (trace.net && !visibleNets.has(trace.net)) continue;
    const color = getNetColor(trace.net || 'default');
    ctx.strokeStyle = color;

    const s1 = worldToScreen(trace.startX, trace.startY);
    const s2 = worldToScreen(trace.endX, trace.endY);
    ctx.lineWidth = Math.max(1, trace.width * viewTransform.scale);
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
  }
}

function drawPads() {
  const pads = currentParsedData.pads;

  for (const pad of pads) {
    if (pad.net && !visibleNets.has(pad.net)) continue;
    const color = getNetColor(pad.net || 'default');
    ctx.fillStyle = color;

    const s = worldToScreen(pad.x, pad.y);
    const aperture = currentParsedData.apertures[pad.aperture];
    if (!aperture) continue;

    if (aperture.shape === 'C') {
      const r = (aperture.params[0] / 2) * viewTransform.scale;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1, r), 0, Math.PI * 2);
      ctx.fill();
    } else if (aperture.shape === 'R') {
      const w = aperture.params[0] * viewTransform.scale;
      const h = (aperture.params[1] || aperture.params[0]) * viewTransform.scale;
      ctx.fillRect(s.x - w / 2, s.y - h / 2, Math.max(1, w), Math.max(1, h));
    } else if (aperture.shape === 'O') {
      const w = aperture.params[0] * viewTransform.scale;
      const h = (aperture.params[1] || aperture.params[0]) * viewTransform.scale;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const r = (aperture.params[0] / 2) * viewTransform.scale;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1, r), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRegions() {
  const regions = currentParsedData.regions;
  ctx.fillStyle = 'rgba(63, 185, 80, 0.25)';
  ctx.strokeStyle = '#3fb950';
  ctx.lineWidth = 1;

  for (const region of regions) {
    if (region.points.length < 3) continue;
    ctx.beginPath();
    const s0 = worldToScreen(region.points[0].x, region.points[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < region.points.length; i++) {
      const s = worldToScreen(region.points[i].x, region.points[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawViolations() {
  for (const v of currentViolations) {
    const s = worldToScreen(v.x, v.y);

    let color;
    switch (v.type) {
      case 'line_width': color = '#d29922'; break;
      case 'spacing': color = '#bc8cff'; break;
      case 'annular_ring': color = '#58a6ff'; break;
      case 'microvia': color = '#f778ba'; break;
      default: color = '#f85149';
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(s.x, s.y, 12, 0, Math.PI * 2);
    ctx.strokeStyle = color.replace(')', ', 0.4)').replace('rgb', 'rgba');
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      ctx.strokeStyle = `rgba(${r},${g},${b},0.4)`;
    }
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (v.type === 'line_width' && v.startX != null) {
      const s1 = worldToScreen(v.startX, v.startY);
      const s2 = worldToScreen(v.endX, v.endY);
      ctx.strokeStyle = 'rgba(210, 153, 34, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (v.type === 'spacing') {
      ctx.strokeStyle = 'rgba(188, 140, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      if (v.trace1) {
        const s1 = worldToScreen(v.trace1.startX, v.trace1.startY);
        const s2 = worldToScreen(v.trace1.endX, v.trace1.endY);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
      }
      if (v.trace2) {
        const s1 = worldToScreen(v.trace2.startX, v.trace2.startY);
        const s2 = worldToScreen(v.trace2.endX, v.trace2.endY);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    if (v.type === 'annular_ring' && v.padRadius != null) {
      const padScreenR = v.padRadius * viewTransform.scale;
      const drillScreenR = v.drillRadius * viewTransform.scale;
      ctx.strokeStyle = 'rgba(88, 166, 255, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1, drillScreenR), 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(248, 81, 73, 0.7)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(2, padScreenR), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

canvas.addEventListener('mousedown', (e) => {
  isPanning = true;
  panStart = { x: e.clientX, y: e.clientY };
  lastOffset = { x: viewTransform.offsetX, y: viewTransform.offsetY };
  canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const w = screenToWorld(sx, sy);
  coordDisplay.textContent = `X: ${w.x.toFixed(4)}  Y: ${w.y.toFixed(4)}`;

  if (isPanning) {
    viewTransform.offsetX = lastOffset.x + (e.clientX - panStart.x);
    viewTransform.offsetY = lastOffset.y + (e.clientY - panStart.y);
    renderCanvas();
  }
});

canvas.addEventListener('mouseup', () => {
  isPanning = false;
  canvas.style.cursor = 'crosshair';
});

canvas.addEventListener('mouseleave', () => {
  isPanning = false;
  canvas.style.cursor = 'crosshair';
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  const worldBefore = screenToWorld(sx, sy);

  const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  viewTransform.scale *= zoomFactor;
  viewTransform.scale = Math.max(0.01, Math.min(1000, viewTransform.scale));

  const worldAfter = screenToWorld(sx, sy);
  viewTransform.offsetX += (worldAfter.x - worldBefore.x) * viewTransform.scale;
  viewTransform.offsetY -= (worldAfter.y - worldBefore.y) * viewTransform.scale;

  renderCanvas();
}, { passive: false });

zoomInBtn.addEventListener('click', () => {
  const canvasW = canvasWrapper.getBoundingClientRect().width / 2;
  const canvasH = canvasWrapper.getBoundingClientRect().height / 2;
  const worldBefore = screenToWorld(canvasW, canvasH);
  viewTransform.scale *= 1.3;
  const worldAfter = screenToWorld(canvasW, canvasH);
  viewTransform.offsetX += (worldAfter.x - worldBefore.x) * viewTransform.scale;
  viewTransform.offsetY -= (worldAfter.y - worldBefore.y) * viewTransform.scale;
  renderCanvas();
});

zoomOutBtn.addEventListener('click', () => {
  const canvasW = canvasWrapper.getBoundingClientRect().width / 2;
  const canvasH = canvasWrapper.getBoundingClientRect().height / 2;
  const worldBefore = screenToWorld(canvasW, canvasH);
  viewTransform.scale /= 1.3;
  const worldAfter = screenToWorld(canvasW, canvasH);
  viewTransform.offsetX += (worldAfter.x - worldBefore.x) * viewTransform.scale;
  viewTransform.offsetY -= (worldAfter.y - worldBefore.y) * viewTransform.scale;
  renderCanvas();
});

fitBtn.addEventListener('click', fitToView);

showViolationsCb.addEventListener('change', renderCanvas);
showTracesCb.addEventListener('change', renderCanvas);
showPadsCb.addEventListener('change', renderCanvas);

window.addEventListener('resize', () => {
  if (currentParsedData) {
    resizeCanvas();
  }
});

function showLoading(show) {
  let overlay = document.querySelector('.loading-overlay');
  if (show) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = '<div class="loading-spinner"></div>';
      canvasWrapper.appendChild(overlay);
    }
  } else {
    if (overlay) overlay.remove();
  }
}

setTimeout(resizeCanvas, 100);
