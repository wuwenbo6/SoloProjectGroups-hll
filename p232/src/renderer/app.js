const api = window.ntfsAPI;

let state = {
  imagePath: null,
  bootSector: null,
  mftEntries: [],
  fileTree: null,
  recoveryAnalysis: null,
  signatureResults: [],
  selectedEntry: null,
  currentView: 'tree',
  isScanning: false,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

function formatOffset(offset) {
  return '0x' + offset.toString(16).toUpperCase().padStart(8, '0');
}

function formatDate(timestamp) {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
}

function getFileIcon(entry) {
  if (entry.isDirectory) return '📁';
  const name = (entry.fileName || '').toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return '🖼️';
  if (name.endsWith('.png')) return '🖼️';
  if (name.endsWith('.gif')) return '🖼️';
  if (name.endsWith('.pdf')) return '📄';
  if (name.endsWith('.doc') || name.endsWith('.docx')) return '📝';
  if (name.endsWith('.xls') || name.endsWith('.xlsx')) return '📊';
  if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z')) return '📦';
  if (name.endsWith('.exe') || name.endsWith('.dll')) return '⚙️';
  if (name.endsWith('.mp3') || name.endsWith('.wav')) return '🎵';
  if (name.endsWith('.mp4') || name.endsWith('.avi') || name.endsWith('.mkv')) return '🎬';
  if (name.endsWith('.txt') || name.endsWith('.log')) return '📃';
  if (name.endsWith('.xml') || name.endsWith('.html') || name.endsWith('.css')) return '🌐';
  if (name.endsWith('.db') || name.endsWith('.sqlite')) return '🗃️';
  return '📄';
}

function getCategoryIcon(category) {
  const icons = { image: '🖼️', document: '📄', archive: '📦', video: '🎬', audio: '🎵', executable: '⚙️', text: '📃', database: '🗃️' };
  return icons[category] || '📄';
}

function getRecoveryColor(level) {
  const colors = {
    excellent: 'var(--recovery-excellent)',
    good: 'var(--recovery-good)',
    fair: 'var(--recovery-fair)',
    poor: 'var(--recovery-poor)',
    very_poor: 'var(--recovery-very-poor)',
  };
  return colors[level] || 'var(--text-muted)';
}

function showProgress(show) {
  $('#progress-container').classList.toggle('hidden', !show);
}

function updateProgress(data) {
  const pct = data.percent || 0;
  $('#progress-fill').style.width = pct + '%';
  $('#progress-text').textContent = pct + '%';
  const detail = data.foundCount ? ` | Found: ${data.foundCount}` : '';
  $('#progress-detail').textContent = `${formatSize(data.current)} / ${formatSize(data.total)}${detail}`;
}

function showScreen(name) {
  $('#welcome-screen').classList.toggle('hidden', name !== 'welcome');
  $('#main-screen').classList.toggle('hidden', name !== 'main');
}

function updateBootSectorInfo(bs) {
  $('#vol-size').textContent = formatSize(bs.volumeSize);
  $('#cluster-size').textContent = formatSize(bs.clusterSize);
  $('#mft-offset').textContent = formatOffset(bs.mftOffset);
  $('#mft-record-size').textContent = formatSize(bs.mftRecordSize);
}

async function handleOpenFile() {
  const filePath = await api.openFileDialog();
  if (!filePath) return;

  state.imagePath = filePath;
  $('#image-path').textContent = filePath;

  const result = await api.loadImage(filePath);
  if (result.success) {
    state.bootSector = result.bootSector;
    showScreen('main');
    updateBootSectorInfo(result.bootSector);
    $('#btn-parse-mft').disabled = false;
  } else {
    alert('Failed to load image: ' + result.error);
  }
}

async function handleParseMFT() {
  const btn = $('#btn-parse-mft');
  btn.disabled = true;
  showProgress(true);
  updateProgress({ current: 0, total: 100, percent: 0 });

  api.onMFTProgress((data) => updateProgress(data));

  const result = await api.parseMFT({ maxEntries: 500000 });
  showProgress(false);

  if (result.success) {
    state.mftEntries = result.entries;
    renderFileTree();
    $('#btn-scan-sigs').disabled = false;
    $('#btn-analyze').disabled = false;
    updateSidebarStats();
    updateExportButton();
  } else {
    alert('MFT parse error: ' + result.error);
  }

  btn.disabled = false;
}

async function handleSignatureScan() {
  if (state.isScanning) return;
  state.isScanning = true;
  $('#btn-scan-sigs').disabled = true;
  showProgress(true);
  updateProgress({ current: 0, total: 100, percent: 0 });

  api.onScanProgress((data) => updateProgress(data));

  const result = await api.scanSignatures({});
  showProgress(false);
  state.isScanning = false;

  if (result.success) {
    state.signatureResults = result.results;
    renderSignatureResults();
    updateExportButton();
  } else {
    alert('Signature scan error: ' + result.error);
  }

  $('#btn-scan-sigs').disabled = false;
}

async function handleAnalyzeRecovery() {
  $('#btn-analyze').disabled = true;
  showProgress(true);
  updateProgress({ current: 0, total: 100, percent: 50 });

  const deletedEntries = state.mftEntries.filter((e) => !e.isInUse && e.fileName);
  const result = await api.analyzeRecovery(deletedEntries);
  showProgress(false);

  if (result.success) {
    state.recoveryAnalysis = result.analysis;
    renderSummaryPanel(result.analysis);
    renderDeletedTable(result.analysis.entries);
    updateExportButton();
  } else {
    alert('Analysis error: ' + result.error);
  }

  $('#btn-analyze').disabled = false;
}

function renderFileTree() {
  const container = $('#tree-container');
  container.innerHTML = '';

  const nodeMap = new Map();
  for (const entry of state.mftEntries) {
    nodeMap.set(entry.entryIndex, entry);
  }

  const tree = buildTree(state.mftEntries, nodeMap);
  state.fileTree = tree;

  const treeEl = createTreeNode(tree, nodeMap);
  container.appendChild(treeEl);
}

function buildTree(entries, nodeMap) {
  const root = {
    name: 'Root',
    entryIndex: 5,
    isDirectory: true,
    children: [],
  };

  const treeNodeMap = new Map();
  treeNodeMap.set(5, root);

  for (const entry of entries) {
    if (entry.entryIndex < 5) continue;
    if (entry.entryIndex === 5) {
      root.name = entry.fileName || 'Root';
      root.isInUse = entry.isInUse;
      root.entry = entry;
      continue;
    }

    const node = {
      name: entry.fileName || `Entry_${entry.entryIndex}`,
      entryIndex: entry.entryIndex,
      isDirectory: entry.isDirectory,
      isInUse: entry.isInUse,
      entry: entry,
      children: entry.isDirectory ? [] : undefined,
    };

    treeNodeMap.set(entry.entryIndex, node);

    const parentIdx = entry.parentEntryIndex;
    const parent = treeNodeMap.get(parentIdx);
    if (parent && parent.children) {
      parent.children.push(node);
    } else {
      root.children.push(node);
    }
  }

  sortTree(root);
  return root;
}

function sortTree(node) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    sortTree(child);
  }
}

function createTreeNode(node, nodeMap, depth = 0) {
  const el = document.createElement('div');
  el.className = 'tree-node';

  const header = document.createElement('div');
  header.className = 'tree-node-header';
  if (node.entry && !node.entry.isInUse) header.classList.add('deleted');

  const toggle = document.createElement('span');
  toggle.className = 'tree-toggle';
  if (node.children && node.children.length > 0) {
    toggle.textContent = '▶';
  } else {
    toggle.classList.add('leaf');
  }

  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  icon.textContent = node.isDirectory ? (node.isInUse !== false ? '📁' : '🗑️') : getFileIcon(node);

  const name = document.createElement('span');
  name.className = 'tree-name';
  name.textContent = node.name;

  header.appendChild(toggle);
  header.appendChild(icon);
  header.appendChild(name);

  header.addEventListener('click', () => {
    if (node.children && node.children.length > 0) {
      const isExpanded = toggle.classList.toggle('expanded');
      const childContainer = el.querySelector('.tree-children');
      if (childContainer) childContainer.classList.toggle('hidden', !isExpanded);
    }

    $$('.tree-node-header.selected').forEach((h) => h.classList.remove('selected'));
    header.classList.add('selected');

    if (node.entry) {
      showFileDetail(node.entry);
    }
  });

  el.appendChild(header);

  if (node.children && node.children.length > 0) {
    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children hidden';
    for (const child of node.children) {
      childContainer.appendChild(createTreeNode(child, nodeMap, depth + 1));
    }
    el.appendChild(childContainer);
  }

  return el;
}

function showFileDetail(entry) {
  state.selectedEntry = entry;
  const panel = $('#detail-panel');
  const content = $('#detail-content');
  const title = $('#detail-title');
  const recoverBtn = $('#btn-recover');
  const previewBtn = $('#btn-preview');

  title.textContent = entry.fileName || `Entry #${entry.entryIndex}`;

  if (!entry.isDirectory && !entry.isInUse) {
    recoverBtn.classList.remove('hidden');
  } else {
    recoverBtn.classList.add('hidden');
  }

  if (!entry.isDirectory && entry.dataAttribute) {
    previewBtn.classList.remove('hidden');
  } else {
    previewBtn.classList.add('hidden');
  }

  const recoveryHtml = state.recoveryAnalysis
    ? buildRecoveryHtml(entry)
    : '';

  content.innerHTML = `
    <div class="detail-group">
      <div class="detail-row"><span class="detail-key">Entry Index</span><span class="detail-val">${entry.entryIndex}</span></div>
      <div class="detail-row"><span class="detail-key">Name</span><span class="detail-val">${entry.fileName || '-'}</span></div>
      <div class="detail-row"><span class="detail-key">Type</span><span class="detail-val">${entry.isDirectory ? 'Directory' : 'File'}</span></div>
      <div class="detail-row"><span class="detail-key">Status</span><span class="detail-val" style="color: ${entry.isInUse ? 'var(--success)' : 'var(--danger)'}">${entry.isInUse ? 'Active' : 'Deleted'}</span></div>
      <div class="detail-row"><span class="detail-key">Size</span><span class="detail-val">${formatSize(entry.fileSize)}</span></div>
      <div class="detail-row"><span class="detail-key">Sequence #</span><span class="detail-val">${entry.sequenceNumber}</span></div>
    </div>
    <div class="detail-group">
      <div class="detail-row"><span class="detail-key">Created</span><span class="detail-val">${formatDate(entry.createTime)}</span></div>
      <div class="detail-row"><span class="detail-key">Modified</span><span class="detail-val">${formatDate(entry.modifyTime)}</span></div>
      <div class="detail-row"><span class="detail-key">Parent Entry</span><span class="detail-val">${entry.parentEntryIndex}</span></div>
      <div class="detail-row"><span class="detail-key">Hard Links</span><span class="detail-val">${entry.hardLinkCount}</span></div>
      <div class="detail-row"><span class="detail-key">Data Attribute</span><span class="detail-val">${entry.dataAttribute ? (entry.dataAttribute.resident ? 'Resident' : 'Non-Resident') : 'None'}</span></div>
      <div class="detail-row"><span class="detail-key">Compression</span><span class="detail-val" style="color: ${entry.isCompressed ? 'var(--warning)' : 'var(--text-muted)'}">${entry.isCompressed ? 'LZNT1 Compressed' : 'Uncompressed'}</span></div>
      <div class="detail-row"><span class="detail-key">Encryption</span><span class="detail-val" style="color: ${entry.isEncrypted ? 'var(--danger)' : 'var(--text-muted)'}">${entry.isEncrypted ? 'Encrypted' : 'Unencrypted'}</span></div>
      ${entry.dataAttribute && !entry.dataAttribute.resident && entry.dataAttribute.data ? `<div class="detail-row"><span class="detail-key">Data Runs</span><span class="detail-val">${entry.dataAttribute.data.dataRuns?.length || 0} runs</span></div>` : ''}
      ${entry.dataAttribute && !entry.dataAttribute.resident && entry.dataAttribute.data && entry.dataAttribute.data.compressionUnit ? `<div class="detail-row"><span class="detail-key">Compression Unit</span><span class="detail-val">${formatSize(entry.dataAttribute.data.compressionUnit * (state.bootSector?.clusterSize || 4096))}</span></div>` : ''}
      ${recoveryHtml}
    </div>
  `;

  panel.classList.remove('hidden');
  $('#content-empty').classList.add('hidden');
  $('#preview-panel').classList.add('hidden');
}

function buildRecoveryHtml(entry) {
  const analysis = state.recoveryAnalysis?.entries?.find((e) => e.entryIndex === entry.entryIndex);
  if (!analysis || !analysis.recovery) return '';

  const r = analysis.recovery;
  return `
    <div class="recovery-meter">
      <div class="recovery-bar"><div class="recovery-fill ${r.level}" style="width: ${r.probabilityPercent}%"></div></div>
      <div class="recovery-label">
        <span class="recovery-percent" style="color: ${getRecoveryColor(r.level)}">${r.probabilityPercent}%</span>
        <span class="recovery-level ${r.level}">${r.level.replace('_', ' ')}</span>
      </div>
      <div class="factor-list">
        ${r.factors.map((f) => `
          <div class="factor-item">
            <span class="factor-dot ${f.positive ? 'positive' : 'negative'}"></span>
            <span class="factor-text">${f.factor}</span>
            <span class="factor-weight">${f.weight > 0 ? '+' : ''}${(f.weight * 100).toFixed(0)}%</span>
          </div>
        `).join('')}
      </div>
      <p style="margin-top: 8px; font-size: 12px; color: var(--text-secondary)">${r.recommendedAction}</p>
    </div>
  `;
}

function renderSummaryPanel(analysis) {
  const container = $('#summary-cards');
  const s = analysis.summary;

  container.innerHTML = `
    <div class="summary-card"><div class="card-value">${analysis.totalEntries.toLocaleString()}</div><div class="card-label">Total Entries</div></div>
    <div class="summary-card"><div class="card-value" style="color: var(--success)">${analysis.activeEntries.toLocaleString()}</div><div class="card-label">Active Files</div></div>
    <div class="summary-card"><div class="card-value" style="color: var(--danger)">${analysis.deletedEntries.toLocaleString()}</div><div class="card-label">Deleted Files</div></div>
    <div class="summary-card"><div class="card-value" style="color: var(--accent)">${s.totalRecoverableFiles.toLocaleString()}</div><div class="card-label">Recoverable</div></div>
    <div class="summary-card excellent"><div class="card-value">${s.byLevel.excellent}</div><div class="card-label">Excellent</div></div>
    <div class="summary-card good"><div class="card-value">${s.byLevel.good}</div><div class="card-label">Good</div></div>
    <div class="summary-card fair"><div class="card-value">${s.byLevel.fair}</div><div class="card-label">Fair</div></div>
    <div class="summary-card poor"><div class="card-value">${s.byLevel.poor}</div><div class="card-label">Poor</div></div>
  `;

  $('#summary-panel').classList.remove('hidden');
  $('#content-empty').classList.add('hidden');
}

function renderDeletedTable(entries) {
  const tbody = $('#file-table-body');
  tbody.innerHTML = '';

  const filtered = entries.slice(0, 2000);

  for (const entry of filtered) {
    const tr = document.createElement('tr');
    const r = entry.recovery;

    tr.innerHTML = `
      <td>${getFileIcon(entry)}</td>
      <td><span class="file-name-deleted">${entry.fileName || 'Unknown'}</span></td>
      <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted)">Entry #${entry.entryIndex}</td>
      <td style="font-family: var(--font-mono)">${formatSize(entry.fileSize)}</td>
      <td><span class="recovery-badge ${r.level}">${r.probabilityPercent}% ${r.level.replace('_', ' ')}</span></td>
      <td><button class="btn btn-sm btn-secondary" data-entry-idx="${entry.entryIndex}">Details</button></td>
    `;

    tr.querySelector('button').addEventListener('click', () => {
      showFileDetail(entry);
    });

    tbody.appendChild(tr);
  }

  $('#table-container').classList.remove('hidden');
}

function renderSignatureResults() {
  const tbody = $('#sig-table-body');
  tbody.innerHTML = '';

  for (const result of state.signatureResults) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${getCategoryIcon(result.category)}</td>
      <td>${result.signatureName}</td>
      <td style="font-family: var(--font-mono); font-size: 11px">${formatOffset(result.offset)}</td>
      <td style="font-family: var(--font-mono)">${result.estimatedSize > 0 ? formatSize(result.estimatedSize) : 'Unknown'}</td>
      <td>${result.category}</td>
      <td>${(result.confidence * 100).toFixed(0)}%</td>
    `;
    tbody.appendChild(tr);
  }

  $('#signature-results').classList.remove('hidden');
}

function updateSidebarStats() {
  const total = state.mftEntries.length;
  const active = state.mftEntries.filter((e) => e.isInUse).length;
  const deleted = total - active;
  $('#sidebar-stats').textContent = `${total} entries | ${deleted} deleted`;
}

function switchView(view) {
  state.currentView = view;
  $('#btn-view-tree').classList.toggle('active', view === 'tree');
  $('#btn-view-list').classList.toggle('active', view === 'list');

  const sidebar = $('#sidebar');
  if (view === 'tree') {
    sidebar.style.display = 'flex';
  } else {
    sidebar.style.display = 'none';
  }
}

function handleSearch(query) {
  if (!query) {
    renderFileTree();
    return;
  }

  const q = query.toLowerCase();
  const matches = state.mftEntries.filter((e) => e.fileName && e.fileName.toLowerCase().includes(q));

  const tbody = $('#file-table-body');
  tbody.innerHTML = '';

  for (const entry of matches.slice(0, 500)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${getFileIcon(entry)}</td>
      <td style="${!entry.isInUse ? 'color: var(--text-muted); font-style: italic' : ''}">${entry.fileName}</td>
      <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted)">Entry #${entry.entryIndex}</td>
      <td style="font-family: var(--font-mono)">${formatSize(entry.fileSize)}</td>
      <td>${!entry.isInUse ? '<span class="recovery-badge poor">Deleted</span>' : '<span style="color: var(--success)">Active</span>'}</td>
      <td><button class="btn btn-sm btn-secondary" data-entry-idx="${entry.entryIndex}">Details</button></td>
    `;

    tr.querySelector('button').addEventListener('click', () => {
      showFileDetail(entry);
    });

    tbody.appendChild(tr);
  }

  $('#table-container').classList.remove('hidden');
  switchView('list');
}

async function handleRecoverFile() {
  if (!state.selectedEntry) return;

  const outputPath = await api.saveFileDialog();
  if (!outputPath) return;

  const result = await api.recoverFile(state.selectedEntry, outputPath);
  if (result.success) {
    alert('File recovered successfully to: ' + outputPath);
  } else {
    alert('Recovery failed: ' + result.error);
  }
}

async function handlePreviewFile() {
  if (!state.selectedEntry) return;

  const panel = $('#preview-panel');
  const content = $('#preview-content');
  const typeBadge = $('#preview-type-badge');

  panel.classList.remove('hidden');
  content.innerHTML = '<div class="loading-spinner"></div>';
  typeBadge.textContent = 'Loading...';

  const result = await api.getFilePreview(state.selectedEntry);

  if (result.success) {
    renderPreview(result.preview);
  } else {
    typeBadge.textContent = 'Error';
    content.innerHTML = `<div class="preview-error">Preview failed: ${result.error}</div>`;
  }
}

function renderPreview(preview) {
  const content = $('#preview-content');
  const typeBadge = $('#preview-type-badge');

  typeBadge.textContent = preview.type.toUpperCase();

  switch (preview.type) {
    case 'image':
      if (preview.subType === 'available') {
        content.innerHTML = `
          ${preview.size > 1024 * 1024 ? `<div class="preview-info">Preview may be large (${formatSize(preview.size)})</div>` : ''}
          <img src="${preview.content}" class="preview-image" alt="Preview">
        `;
      } else if (preview.subType === 'too_large') {
        content.innerHTML = `<div class="preview-empty">${preview.message}</div>`;
      } else {
        content.innerHTML = `<div class="preview-error">${preview.message || 'Image preview unavailable'}</div>`;
      }
      break;

    case 'text':
      if (preview.subType === 'available') {
        const info = [];
        info.push(`Encoding: ${preview.encoding}`);
        if (preview.truncated) info.push(`(preview of first ${formatSize(preview.previewSize)})`);
        content.innerHTML = `
          <div class="preview-info">${info.join(' | ')}</div>
          <pre class="preview-text">${escapeHtml(preview.content)}</pre>
        `;
      } else {
        content.innerHTML = `<div class="preview-error">${preview.message || 'Text preview unavailable'}</div>`;
      }
      break;

    case 'hex':
      if (preview.subType === 'available') {
        const info = [];
        info.push(`Total size: ${formatSize(preview.size)}`);
        if (preview.truncated) info.push(`(showing first ${formatSize(preview.previewSize)})`);
        content.innerHTML = `
          <div class="preview-info">${info.join(' | ')}</div>
          <pre class="preview-hex">${escapeHtml(preview.content)}</pre>
        `;
      } else {
        content.innerHTML = `<div class="preview-error">${preview.message || 'Hex preview unavailable'}</div>`;
      }
      break;

    case 'empty':
      content.innerHTML = '<div class="preview-empty">File is empty</div>';
      break;

    default:
      content.innerHTML = '<div class="preview-empty">Preview not available for this file type</div>';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function toggleExportMenu() {
  const menu = $('#export-menu');
  menu.classList.toggle('hidden');
}

function closeExportMenu() {
  const menu = $('#export-menu');
  menu.classList.add('hidden');
}

async function handleExport(action) {
  closeExportMenu();

  let defaultName = 'ntfs_recovery_report';
  let entries = [];
  let signatures = [];

  switch (action) {
    case 'csv':
      defaultName = 'recovery_report.csv';
      if (state.recoveryAnalysis?.entries) {
        entries = state.recoveryAnalysis.entries;
      } else {
        entries = state.mftEntries;
      }
      break;
    case 'signature':
      defaultName = 'signature_results.csv';
      signatures = state.signatureResults;
      break;
    case 'full':
      defaultName = 'full_report.txt';
      break;
  }

  const outputPath = await api.saveCSVDialog(defaultName);
  if (!outputPath) return;

  let result;

  switch (action) {
    case 'csv':
      result = await api.exportCSVReport(entries, outputPath);
      break;
    case 'signature':
      result = await api.exportSignatureReport(signatures, outputPath);
      break;
    case 'full':
      result = await api.exportFullReport(state.recoveryAnalysis, state.signatureResults, outputPath);
      break;
  }

  if (result && result.success) {
    alert(`Report exported successfully to:\n${result.path}`);
  } else {
    alert(`Export failed: ${result?.error || 'Unknown error'}`);
  }
}

function updateExportButton() {
  const hasData = state.mftEntries.length > 0 || state.signatureResults.length > 0;
  $('#btn-export').disabled = !hasData;
}

function initEventListeners() {
  $('#btn-open').addEventListener('click', handleOpenFile);
  $('#btn-parse-mft').addEventListener('click', handleParseMFT);
  $('#btn-scan-sigs').addEventListener('click', handleSignatureScan);
  $('#btn-analyze').addEventListener('click', handleAnalyzeRecovery);
  $('#btn-recover').addEventListener('click', handleRecoverFile);
  $('#btn-preview').addEventListener('click', handlePreviewFile);

  $('#btn-export').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExportMenu();
  });

  document.addEventListener('click', closeExportMenu);

  $$('.export-item').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleExport(btn.dataset.action);
    });
  });

  $('#btn-view-tree').addEventListener('click', () => switchView('tree'));
  $('#btn-view-list').addEventListener('click', () => switchView('list'));

  let searchTimeout;
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => handleSearch(e.target.value), 300);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
});
