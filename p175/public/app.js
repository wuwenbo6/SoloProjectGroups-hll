'use strict';

// ---- Group definitions ----
const GROUPS = [
  { key: 'system',   label: 'System',   prefixes: ['SYSID_', 'BRD_', 'COM_', 'RC_', 'CAL_'] },
  { key: 'rtl',      label: 'RTL',      prefixes: ['RTL_', 'NAV_RTL_', 'LOITER_'] },
  { key: 'nav',      label: 'Navigation', prefixes: ['NAV_', 'MIS_', 'WP_', 'TECS_', 'FW_', 'FW_THR_'] },
  { key: 'control',  label: 'Control',  prefixes: ['MPC_', 'IMU_', 'ATT_', 'MC_', 'POS_', 'VEL_'] },
  { key: 'estimator',label: 'Estimator',prefixes: ['EKF2_', 'EKF3_', 'LPE_', 'SENS_', 'ADC_', 'BARO_'] },
  { key: 'gps',      label: 'GPS',      prefixes: ['GPS_', 'EKF2_GPS_', 'EKF3_GPS_'] },
  { key: 'radio',    label: 'Radio',    prefixes: ['RC_', 'RADIO_', 'RSSI_'] },
  { key: 'safety',   label: 'Safety',   prefixes: ['BAT_', 'CBRK_', 'COM_POWER_'] },
  { key: 'camera',   label: 'Camera',   prefixes: ['CAM_', 'GIMBAL_', 'MNT_'] },
  { key: 'tuning',   label: 'Tuning',   prefixes: ['LIM_', 'AUX_', 'PWM_', 'SERVO_'] },
  { key: 'other',    label: 'Other',    prefixes: [] },
];

function inferGroup(paramId) {
  for (const g of GROUPS) {
    for (const p of g.prefixes) {
      if (paramId.startsWith(p)) return g.key;
    }
  }
  return 'other';
}

// ---- State ----
const state = {
  ws: null,
  params: new Map(),    // id -> param object (live)
  total: 0,
  link: 'closed',
  pending: new Set(),
  filter: { group: '__all__', search: '', type: '' },
  ackTimeout: 3000,
  maxRetries: 3,
  mode: 'list',         // 'list' | 'compare'
  compare: {
    sideA: 'live',      // 'live' | 'file'
    sideB: null,        // null | { name, params: Map(id -> value) }
    sideAFile: null,    // if sideA is from file
    onlyDiff: false,
  },
};

// ---- DOM refs ----
const $ = (sel) => document.querySelector(sel);
const groupList = $('#groupList');
const paramBody = $('#paramBody');
const compareBody = $('#compareBody');
const statusDot = $('#dot');
const linkLabel = $('#linkLabel');
const portLabel = $('#portLabel');
const countLabel = $('#countLabel');
const progressLabel = $('#progressLabel');
const searchInput = $('#search');
const typeFilter = $('#typeFilter');
const btnReconnect = $('#btnReconnect');
const btnReload = $('#btnReload');
const btnExport = $('#btnExport');
const fileImport = $('#fileImport');
const fileCompare = $('#fileCompare');
const btnMode = $('#btnMode');
const modeTabs = $('#modeTabs');
const compareBar = $('#compareBar');
const viewList = $('#viewList');
const viewCompare = $('#viewCompare');
const sideAname = $('#sideAname');
const sideBname = $('#sideBname');
const btnSwap = $('#btnSwap');
const btnOnlyDiff = $('#btnOnlyDiff');
const diffStats = $('#diffStats');
const toast = $('#toast');

// ---- Toast ----
let toastTimer = null;
function showToast(msg, kind = 'info') {
  toast.textContent = msg;
  toast.className = `toast ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast hidden'; }, 3500);
}

// ---- Param file format (PX4 / ArduPilot compatible) ----
// Parses formats:
//   - "PARAM_NAME,VALUE" (Mission Planner / QGC)
//   - "PARAM_NAME VALUE"  (space-separated, PX4 .params)
//   - Comments: "# ..."
function parseParamFile(text) {
  const params = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Try comma, then space/tab
    let match = trimmed.match(/^([A-Z0-9_]+)\s*[,=]?\s*([^\s,]+)/i);
    if (!match) {
      match = trimmed.match(/^([A-Z0-9_]+)\s+(.+)$/i);
    }
    if (match) {
      const name = match[1].toUpperCase();
      const value = parseFloat(match[2]);
      if (Number.isFinite(value)) {
        params.set(name, value);
      }
    }
  }
  return params;
}

// Exports as PX4-style .params file
function exportParamFile(params, name = 'params') {
  const lines = [];
  lines.push('# MAVLink Parameter Console Export');
  lines.push('#');
  lines.push(`# Vehicle: ${name}`);
  lines.push(`# Date: ${new Date().toISOString()}`);
  lines.push('#');
  lines.push('# Parameter Name,Value');
  lines.push('');

  const keys = Array.from(params.keys()).sort();
  for (const k of keys) {
    const p = params.get(k);
    const v = typeof p === 'object' ? p.param_value : p;
    lines.push(`${k}\t${v}`);
  }
  return lines.join('\n');
}

// ---- Build group chips ----
function buildGroupChips() {
  const chips = [['__all__', 'All'], ...GROUPS.map(g => [g.key, g.label])];
  groupList.innerHTML = chips
    .map(([key, label]) =>
      `<button class="chip${key === state.filter.group ? ' active' : ''}" data-group="${key}">${label}</button>`
    )
    .join('');
}

// ---- Rendering helpers ----
function groupLabel(key) {
  const g = GROUPS.find(g => g.key === key);
  return g ? g.label : key;
}

function formatVal(v) {
  const n = Number(v);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(4).replace(/\.?0+$/, '');
}

// Returns {allKeys, diffs} for current compare configuration
function computeCompareDiff() {
  const { sideA, sideB, sideAFile } = state.compare;
  const paramsA = sideA === 'live' ? state.params : (sideAFile?.params || new Map());
  const paramsB = sideB?.params || new Map();

  const allKeys = new Set([...paramsA.keys(), ...paramsB.keys()]);
  const sortedKeys = Array.from(allKeys).sort();

  const diffs = [];
  for (const k of sortedKeys) {
    const inA = paramsA.has(k);
    const inB = paramsB.has(k);
    const valA = inA ? (sideA === 'live' ? paramsA.get(k).param_value : paramsA.get(k)) : null;
    const valB = inB ? paramsB.get(k) : null;
    const isDiff = !inA || !inB || Math.abs(Number(valA) - Number(valB)) > 1e-9;
    diffs.push({
      key,
      inA, inB,
      valA, valB,
      kind: !inA ? 'added' : !inB ? 'removed' : (isDiff ? 'changed' : 'same'),
    });
  }

  return { sortedKeys, diffs, paramsA, paramsB };
}

// ---- List view render ----
function renderList() {
  const all = Array.from(state.params.values())
    .sort((a, b) => a.param_id.localeCompare(b.param_id));

  const q = state.filter.search.trim().toLowerCase();
  const group = state.filter.group;
  const type  = state.filter.type;

  const filtered = all.filter(p => {
    if (group !== '__all__' && inferGroup(p.param_id) !== group) return false;
    if (type && (p.param_type_name || '') !== type) return false;
    if (q && !p.param_id.toLowerCase().includes(q)) return false;
    return true;
  });

  if (filtered.length === 0) {
    paramBody.innerHTML = `<tr class="empty"><td colspan="6">Waiting for MAVLink PARAM_VALUE messages…</td></tr>`;
  } else {
    paramBody.innerHTML = filtered.map(p => {
      const isPending = state.pending.has(p.param_id);
      const typeName = p.param_type_name || 'unknown';
      return `
        <tr data-id="${p.param_id}" class="${isPending ? 'pending' : ''}">
          <td class="col-id"><code>${p.param_id}</code></td>
          <td class="col-group">${groupLabel(inferGroup(p.param_id))}</td>
          <td class="col-val">
            <input type="text" class="val-input" data-id="${p.param_id}" value="${formatVal(p.param_value)}" />
            ${isPending ? '<span class="spinner">⋯</span>' : ''}
          </td>
          <td class="col-type"><span class="type-tag">${typeName}</span></td>
          <td class="col-idx">${p.param_index ?? '—'}</td>
          <td class="col-act">
            <button class="btn-write" data-id="${p.param_id}" ${isPending ? 'disabled' : ''}>Write</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  countLabel.textContent = `${state.params.size} params`;
  progressLabel.textContent = `${state.params.size} / ${state.total || '?'}`;
  updateGroupCounts(all);
}

// ---- Compare view render ----
function renderCompare() {
  const { diffs, paramsA } = computeCompareDiff();
  const { onlyDiff } = state.compare;

  const q = state.filter.search.trim().toLowerCase();
  const group = state.filter.group;

  const visible = diffs.filter(d => {
    if (onlyDiff && d.kind === 'same') return false;
    if (group !== '__all__' && inferGroup(d.key) !== group) return false;
    if (q && !d.key.toLowerCase().includes(q)) return false;
    return true;
  });

  // Stats
  const changedCount = diffs.filter(d => d.kind === 'changed').length;
  const addedCount = diffs.filter(d => d.kind === 'added').length;
  const removedCount = diffs.filter(d => d.kind === 'removed').length;
  diffStats.innerHTML = `
    <strong>${diffs.filter(d => d.kind !== 'same').length}</strong> diffs ·
    <span class="diff-added">${addedCount}</span> new ·
    <span class="diff-missing">${removedCount}</span> gone ·
    <span class="diff-a">${changedCount}</span> changed
  `;

  if (visible.length === 0) {
    const msg = state.compare.sideB
      ? (onlyDiff ? 'No differences found for current filters.' : 'No parameters match the current filters.')
      : 'Load a file for side B to compare.';
    compareBody.innerHTML = `<tr class="empty"><td colspan="5">${msg}</td></tr>`;
    return;
  }

  compareBody.innerHTML = visible.map(d => {
    const isDiff = d.kind !== 'same';
    const tagClass = d.kind === 'added' ? 'added' : d.kind === 'removed' ? 'removed' : (isDiff ? 'changed' : '');
    const tag = isDiff ? `<span class="diff-tag ${tagClass}">${d.kind}</span>` : '';

    const displayA = d.inA ? formatVal(d.valA) : '—';
    const displayB = d.inB ? formatVal(d.valB) : '—';
    const delta = d.inA && d.inB ? formatVal(Number(d.valB) - Number(d.valA)) : '—';

    return `
      <tr class="${isDiff ? 'diff-row' : ''}" data-id="${d.key}">
        <td class="col-id"><code>${d.key}</code>${tag}</td>
        <td class="col-group">${groupLabel(inferGroup(d.key))}</td>
        <td class="col-val-a ${d.kind === 'removed' ? 'diff-missing' : ''}">${displayA}</td>
        <td class="col-val-b ${d.kind === 'added' ? 'diff-added' : ''}">${displayB}</td>
        <td class="col-delta ${isDiff ? (Number(delta) > 0 ? 'diff-added' : 'diff-a') : ''}">${delta}</td>
      </tr>
    `;
  }).join('');
}

function updateGroupCounts(all) {
  groupList.querySelectorAll('.chip').forEach(chip => {
    const key = chip.dataset.group;
    let count;
    if (key === '__all__') count = all.length;
    else count = all.filter(p => inferGroup(p.param_id) === key).length;
    const base = GROUPS.find(g => g.key === key);
    const label = key === '__all__' ? 'All' : (base ? base.label : key);
    chip.innerHTML = `${label} <span class="count">${count}</span>`;
    if (key === state.filter.group) chip.classList.add('active');
    else chip.classList.remove('active');
  });
}

function render() {
  if (state.mode === 'list') renderList();
  else renderCompare();
}

// ---- Mode switching ----
function setMode(mode) {
  state.mode = mode;

  modeTabs.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === mode);
  });

  compareBar.classList.toggle('hidden', mode !== 'compare');
  viewList.classList.toggle('hidden', mode !== 'list');
  viewCompare.classList.toggle('hidden', mode !== 'compare');

  // Update sticky top position for table headers
  const headList = viewList.querySelector('thead th');
  const headComp = viewCompare.querySelector('thead th');
  if (headList) headList.style.top = mode === 'list' ? '108px' : '';
  if (headComp) headComp.style.top = mode === 'compare' ? '148px' : '';

  render();
}

// ---- WebSocket ----
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${proto}//${location.host}/ws`);

  state.ws.addEventListener('open', () => {
    console.log('[ws] connected');
    updateStatus('connecting');
  });

  state.ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (_) { return; }
    handleServerMessage(msg);
  });

  state.ws.addEventListener('close', () => {
    updateStatus('closed');
    setTimeout(connectWs, 2000);
  });

  state.ws.addEventListener('error', () => {
    updateStatus('error');
  });
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'hello': {
      state.params = new Map((msg.params || []).map(p => [p.param_id, p]));
      state.total = msg.total || 0;
      state.link = msg.link || 'closed';
      state.ackTimeout = msg.ackTimeout || 3000;
      state.maxRetries = msg.maxRetries || 3;
      if (msg.serial) portLabel.textContent = `${msg.serial.port} @ ${msg.serial.baud}`;
      updateStatus(state.link);
      render();
      break;
    }
    case 'link': {
      state.link = msg.state;
      if (msg.port) portLabel.textContent = `${msg.port} @ ${msg.baud}`;
      updateStatus(msg.state);
      break;
    }
    case 'param': {
      state.params.set(msg.data.param_id, msg.data);
      state.total = msg.total || state.total;
      render();
      break;
    }
    case 'params_reset': {
      state.params.clear();
      state.total = 0;
      render();
      break;
    }
    case 'set_pending': {
      state.pending.add(msg.param_id);
      render();
      break;
    }
    case 'set_result': {
      state.pending.delete(msg.param_id);
      if (msg.result && msg.result.includes('ACCEPTED')) {
        showToast(`${msg.param_id}: ${msg.result} → ${msg.value ?? msg.requested}`, 'ok');
      } else {
        showToast(`${msg.param_id}: ${msg.result || 'FAILED'}`, 'err');
      }
      render();
      break;
    }
    case 'set_retry': {
      showToast(`${msg.param_id}: retry (${msg.retries_left} left)`, 'info');
      break;
    }
    case 'set_timeout': {
      state.pending.delete(msg.param_id);
      showToast(`${msg.param_id}: no ACK after ${state.maxRetries + 1} attempts`, 'err');
      render();
      break;
    }
    case 'set_invalid': {
      showToast(`${msg.param_id}: value ${msg.requested} out of range [${msg.range.min}, ${msg.range.max}]`, 'err');
      break;
    }
    default: break;
  }
}

function updateStatus(s) {
  linkLabel.textContent = {
    open: 'serial open',
    connected: 'MAVLink connected',
    closed: 'disconnected',
    error: 'serial error',
    connecting: 'connecting…',
  }[s] || s;
  statusDot.className = 'dot ' + ({
    open: 'open',
    connected: 'up',
    closed: 'down',
    error: 'err',
    connecting: 'open',
  }[s] || 'down');
}

// ---- Actions ----
function writeParam(paramId) {
  const p = state.params.get(paramId);
  if (!p) return;
  const input = document.querySelector(`input.val-input[data-id="${paramId}"]`);
  if (!input) return;
  const raw = input.value.trim();
  if (raw === '') { showToast('Value is empty', 'err'); return; }
  const num = Number(raw);
  if (!Number.isFinite(num)) { showToast(`"${raw}" is not a valid number`, 'err'); return; }
  if (!state.ws || state.ws.readyState !== 1) { showToast('Not connected', 'err'); return; }
  state.ws.send(JSON.stringify({
    action: 'set_param',
    param_id: paramId,
    param_value: num,
    param_type: p.param_type,
  }));
}

function exportCurrentParams() {
  if (state.params.size === 0) {
    showToast('No parameters to export', 'err');
    return;
  }
  const text = exportParamFile(state.params, 'live');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date().toISOString().slice(0, 10);
  a.download = `params-${ts}.params`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${state.params.size} parameters`, 'ok');
}

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const params = parseParamFile(e.target.result);
      if (params.size === 0) {
        showToast('No parameters found in file', 'err');
        return;
      }
      // Merge into live params (only for preview; actual writes require explicit Write button)
      let updated = 0;
      for (const [id, val] of params) {
        if (state.params.has(id)) {
          const p = state.params.get(id);
          p.param_value = val;
          p.param_index = p.param_index ?? 0;
          updated++;
        }
      }
      showToast(`Parsed ${params.size} params; preview-updated ${updated} existing`, 'info');
      render();
    } catch (err) {
      showToast(`Failed to parse: ${err.message}`, 'err');
    }
  };
  reader.readAsText(file);
}

function handleCompareFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const params = parseParamFile(e.target.result);
      if (params.size === 0) {
        showToast('No parameters found in file', 'err');
        return;
      }
      state.compare.sideB = { name: file.name, params };
      sideBname.textContent = file.name;
      showToast(`Loaded ${params.size} params for comparison`, 'ok');
      if (state.mode !== 'compare') setMode('compare');
      render();
    } catch (err) {
      showToast(`Failed to parse: ${err.message}`, 'err');
    }
  };
  reader.readAsText(file);
}

function swapSides() {
  const { sideA, sideB, sideAFile } = state.compare;
  if (sideA === 'live' && sideB) {
    // live vs file → file vs live
    state.compare.sideA = 'file';
    state.compare.sideAFile = sideB;
    state.compare.sideB = { name: 'Live parameters', params: new Map(
      Array.from(state.params.entries()).map(([k, v]) => [k, v.param_value])
    )};
    sideAname.textContent = sideB.name;
    sideBname.textContent = 'Live parameters';
  } else if (sideA === 'file' && sideAFile && sideB) {
    // file vs live → live vs file
    state.compare.sideA = 'live';
    state.compare.sideAFile = null;
    state.compare.sideB = sideAFile;
    sideAname.textContent = 'Live parameters';
    sideBname.textContent = sideAFile.name;
  }
  render();
}

// ---- Event wiring ----
groupList.addEventListener('click', (ev) => {
  const chip = ev.target.closest('.chip');
  if (!chip) return;
  state.filter.group = chip.dataset.group;
  render();
});

searchInput.addEventListener('input', () => {
  state.filter.search = searchInput.value;
  render();
});

typeFilter.addEventListener('change', () => {
  state.filter.type = typeFilter.value;
  render();
});

paramBody.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.btn-write');
  if (btn) { writeParam(btn.dataset.id); return; }
});

paramBody.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    const input = ev.target.closest('.val-input');
    if (input) writeParam(input.dataset.id);
  }
});

btnReconnect.addEventListener('click', () => {
  if (state.ws && state.ws.readyState === 1) {
    state.ws.send(JSON.stringify({ action: 'reconnect' }));
    showToast('Reconnecting serial…', 'info');
  }
});

btnReload.addEventListener('click', () => {
  if (state.ws && state.ws.readyState === 1) {
    state.ws.send(JSON.stringify({ action: 'reset_list' }));
    showToast('Parameter list cleared — trigger a re-list from the flight stack.', 'info');
  }
});

btnExport.addEventListener('click', exportCurrentParams);

fileImport.addEventListener('change', (ev) => {
  const f = ev.target.files[0];
  if (f) handleImportFile(f);
  ev.target.value = '';
});

fileCompare.addEventListener('change', (ev) => {
  const f = ev.target.files[0];
  if (f) handleCompareFile(f);
  ev.target.value = '';
});

modeTabs.addEventListener('click', (ev) => {
  const tab = ev.target.closest('.tab');
  if (tab) setMode(tab.dataset.mode);
});

btnMode.addEventListener('click', () => {
  setMode(state.mode === 'list' ? 'compare' : 'list');
});

btnSwap.addEventListener('click', swapSides);

btnOnlyDiff.addEventListener('click', () => {
  state.compare.onlyDiff = !state.compare.onlyDiff;
  btnOnlyDiff.classList.toggle('active', state.compare.onlyDiff);
  render();
});

// ---- Init ----
buildGroupChips();
render();
connectWs();
