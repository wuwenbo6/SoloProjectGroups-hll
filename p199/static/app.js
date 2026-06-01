let vars = [];
let selectedVar = null;

const attrBits = [
  [0x00000001, 'Non-Volatile'],
  [0x00000002, 'BootService'],
  [0x00000004, 'Runtime'],
  [0x00000008, 'HW Error'],
  [0x00000010, 'Auth Write (Read-Only)'],
  [0x00000020, 'Time-Based Auth'],
  [0x00000040, 'Append Write'],
  [0x00000080, 'Enhanced Auth'],
];

const CRITICAL_PREFIXES = [
  'Boot', 'Driver', 'SysPrep', 'PlatformLang', 'Lang', 'Timeout',
  'SecureBoot', 'PK', 'KEK', 'db', 'dbx', 'dbt', 'dbr'
];

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = type;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ''; el.textContent = ''; }, 4000);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KiB';
  return (bytes / 1048576).toFixed(2) + ' MiB';
}

function attrFlags(val) {
  return attrBits.filter(([b]) => val & b).map(([,n]) => n);
}

function isReadOnly(attributes) {
  return (attributes & 0x00000010) !== 0;
}

function isCritical(name) {
  return CRITICAL_PREFIXES.some(p => name.startsWith(p));
}

function renderTable() {
  const tbody = document.getElementById('var-table');
  if (!vars.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:2rem">No variables found</td></tr>';
    return;
  }
  tbody.innerHTML = vars.map(v => {
    const sel = (selectedVar && selectedVar.name === v.name && selectedVar.guid === v.guid) ? ' class="selected"' : '';
    const flags = attrFlags(v.attributes).map(f => `<span class="attr-flag">${f}</span>`).join('');
    const ro = isReadOnly(v.attributes) ? ' <span class="readonly-badge">READ-ONLY</span>' : '';
    const crit = isCritical(v.name) ? ' <span class="critical-badge">CRITICAL</span>' : '';
    return `<tr${sel} onclick="selectVar('${v.name.replace(/'/g, "\\'")}', '${v.guid.replace(/'/g, "\\'")}')">
      <td>${esc(v.name)}${ro}${crit}</td>
      <td style="font-size:.78rem;font-family:monospace">${esc(v.guid)}</td>
      <td>${formatSize(v.data.length)}</td>
      <td><span>${v.attributes}</span> ${flags}</td>
      <td style="font-family:monospace;font-size:.7rem;max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(v.data_hex.substring(0, 40))}${v.data_hex.length > 40 ? '...' : ''}</td>
    </tr>`;
  }).join('');
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function loadVars() {
  try {
    const r = await fetch('/api/vars');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const result = await r.json();
    if (!result.success) throw new Error(result.error || 'Failed to load');
    vars = result.data || [];
    renderTable();
    if (selectedVar && !vars.find(v => v.name === selectedVar.name && v.guid === selectedVar.guid)) {
      selectedVar = null;
      hideDetail();
    }
  } catch (e) {
    showStatus('Failed to load variables: ' + e.message, 'err');
  }
}

function hideDetail() {
  document.getElementById('detail-fields').style.display = 'none';
  document.getElementById('detail-empty').style.display = 'flex';
}

async function selectVar(name, guid) {
  selectedVar = { name, guid };
  renderTable();
  try {
    const r = await fetch(`/api/vars/${encodeURIComponent(name)}/${encodeURIComponent(guid)}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const result = await r.json();
    if (!result.success) throw new Error(result.error || 'Failed to load');
    const v = result.data;
    
    document.getElementById('detail-empty').style.display = 'none';
    document.getElementById('detail-fields').style.display = 'block';
    document.getElementById('det-name').textContent = v.name;
    document.getElementById('det-guid').textContent = v.guid;
    document.getElementById('det-size').textContent = formatSize(v.data.length);
    document.getElementById('det-attr').textContent = v.attributes + ' (0x' + v.attributes.toString(16).toUpperCase().padStart(8, '0') + ')';
    
    const flags = attrFlags(v.attributes).map(f => `<span class="attr-flag">${f}</span>`).join('');
    document.getElementById('det-attr-flags').innerHTML = flags;
    document.getElementById('det-hex').textContent = v.data_hex || '(empty)';
    
    document.getElementById('f-name').value = v.name;
    document.getElementById('f-guid').value = v.guid;
    document.getElementById('f-hex').value = v.data_hex || '';
    document.getElementById('f-attr').value = v.attributes;
    
    const readOnly = isReadOnly(v.attributes);
    const critical = isCritical(v.name);
    
    document.getElementById('f-hex').readOnly = readOnly;
    document.getElementById('f-attr').readOnly = readOnly;
    document.getElementById('save-btn').disabled = readOnly;
    
    let warnMsg = '';
    if (readOnly) warnMsg += '⚠️ This variable is READ-ONLY (Authenticated Write Access). ';
    if (critical) warnMsg += '⚠️ This is a CRITICAL system variable. ';
    document.getElementById('det-warning').textContent = warnMsg;
    document.getElementById('det-warning').style.display = warnMsg ? 'block' : 'none';
    
  } catch (e) {
    showStatus('Failed to load variable: ' + e.message, 'err');
  }
}

async function deleteVar() {
  if (!selectedVar) return;
  
  const critical = isCritical(selectedVar.name);
  let force = false;
  
  if (critical) {
    const confirmCode = 'DELETE-CRITICAL';
    const code = prompt(`This is a CRITICAL variable!\n\nDeleting critical variables may break your system boot.\n\nType "${confirmCode}" to confirm deletion:`);
    if (code !== confirmCode) {
      showStatus('Deletion cancelled - critical variable confirmation required', 'err');
      return;
    }
    force = true;
  } else {
    if (!confirm('Are you sure you want to delete this variable?')) return;
  }
  
  try {
    const r = await fetch(`/api/vars/${encodeURIComponent(selectedVar.name)}/${encodeURIComponent(selectedVar.guid)}`, { 
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    
    const result = await r.json();
    if (!result.success) throw new Error(result.error || 'Delete failed');
    
    showStatus('Variable deleted', 'ok');
    selectedVar = null;
    hideDetail();
    clearForm();
    await loadVars();
  } catch (e) {
    showStatus('Delete failed: ' + e.message, 'err');
  }
}

function validateHex(hex) {
  return /^[0-9a-fA-F]*$/.test(hex) && (hex.length % 2 === 0);
}

async function submitForm(e) {
  e.preventDefault();
  const name = document.getElementById('f-name').value.trim();
  const guid = document.getElementById('f-guid').value.trim();
  const hexData = document.getElementById('f-hex').value.trim().replace(/\s+/g, '');
  const attrVal = document.getElementById('f-attr').value.trim();
  const isNew = document.getElementById('is-new-var').checked;
  
  if (!name) { showStatus('Name is required', 'err'); return; }
  if (!guid) { showStatus('GUID is required', 'err'); return; }
  if (!hexData) { showStatus('Hex Data is required', 'err'); return; }
  if (!validateHex(hexData)) { showStatus('Hex Data must be valid hexadecimal (even length)', 'err'); return; }
  
  if (selectedVar && isReadOnly(selectedVar.attributes || 0)) {
    showStatus('Cannot modify read-only variable', 'err');
    return;
  }
  
  try {
    let r;
    if (isNew) {
      const attrs = attrVal ? parseInt(attrVal, 10) : 7;
      r = await fetch('/api/vars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          guid, 
          attributes: attrs, 
          data: hexData, 
          hex_input: true 
        })
      });
    } else {
      r = await fetch(`/api/vars/${encodeURIComponent(name)}/${encodeURIComponent(guid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: hexData, hex_input: true })
      });
    }
    
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const result = await r.json();
    if (!result.success) throw new Error(result.error || 'Save failed');
    
    showStatus('Variable saved', 'ok');
    selectedVar = { name, guid };
    document.getElementById('is-new-var').checked = false;
    await loadVars();
    await selectVar(name, guid);
  } catch (e) {
    showStatus('Save failed: ' + e.message, 'err');
  }
}

function clearForm() {
  document.getElementById('f-name').value = '';
  document.getElementById('f-guid').value = '';
  document.getElementById('f-hex').value = '';
  document.getElementById('f-attr').value = '';
  document.getElementById('f-hex').readOnly = false;
  document.getElementById('f-attr').readOnly = false;
  document.getElementById('save-btn').disabled = false;
  document.getElementById('det-warning').style.display = 'none';
  selectedVar = null;
  hideDetail();
  renderTable();
}

function toggleNewMode() {
  const isNew = document.getElementById('is-new-var').checked;
  if (isNew) {
    clearForm();
    document.getElementById('detail-empty').style.display = 'none';
    document.getElementById('detail-fields').style.display = 'block';
    document.getElementById('f-guid').readOnly = false;
  } else {
    hideDetail();
    document.getElementById('f-guid').readOnly = true;
  }
}

document.getElementById('is-new-var').addEventListener('change', toggleNewMode);
loadVars();

function exportBackup() {
  window.location.href = '/api/backup';
}

function importBackup(input) {
  const file = input.files[0];
  if (!file) return;
  
  const force = confirm('Import backup? This will overwrite existing variables (with --force).\n\nCancel to skip existing variables.');
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const r = await fetch('/api/restore?force=' + (force ? '1' : '0'), {
        method: 'POST',
        body: formData
      });
      
      if (!r.ok) throw new Error('Failed to restore');
      const result = await r.json();
      
      if (result.success) {
        showStatus(`Restored ${result.data?.length || 0} variables`, 'ok');
        loadVars();
      } else {
        throw new Error(result.error || 'Restore failed');
      }
    } catch (err) {
      showStatus('Import failed: ' + err.message, 'err');
    }
    input.value = '';
  };
  reader.readAsArrayBuffer(file);
}

let bootOrderItems = [];
let draggedItem = null;

function toggleBootManager() {
  const modal = document.getElementById('boot-modal');
  modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
  if (modal.style.display === 'flex') {
    loadBootOrder();
  }
}

function closeBootModal() {
  document.getElementById('boot-modal').style.display = 'none';
}

async function loadBootOrder() {
  try {
    const r = await fetch('/api/boot/order');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const result = await r.json();
    if (!result.success) throw new Error(result.error || 'Failed to load');
    
    bootOrderItems = result.data || [];
    renderBootList();
  } catch (e) {
    showStatus('Failed to load boot order: ' + e.message, 'err');
  }
}

function renderBootList() {
  const list = document.getElementById('boot-list');
  list.innerHTML = bootOrderItems.map((item, idx) => `
    <li class="boot-item" draggable="true" data-index="${idx}">
      <span class="drag-handle">⋮⋮</span>
      <span class="boot-index">${idx + 1}</span>
      <span class="boot-name">${esc(item.name || `Boot${item.index.toString(16).toUpperCase().padStart(4, '0')}`)}</span>
      <span class="boot-id">0x${item.index.toString(16).toUpperCase().padStart(4, '0')}</span>
    </li>
  `).join('');
  
  document.querySelectorAll('.boot-item').forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragleave', handleDragLeave);
  });
}

function handleDragStart(e) {
  draggedItem = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.boot-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (this !== draggedItem) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  
  if (this !== draggedItem) {
    const fromIdx = parseInt(draggedItem.dataset.index);
    const toIdx = parseInt(this.dataset.index);
    
    const [moved] = bootOrderItems.splice(fromIdx, 1);
    bootOrderItems.splice(toIdx, 0, moved);
    
    renderBootList();
  }
}

async function saveBootOrder() {
  try {
    const order = bootOrderItems.map(item => item.index);
    const r = await fetch('/api/boot/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order })
    });
    
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const result = await r.json();
    
    if (!result.success) throw new Error(result.error || 'Save failed');
    
    showStatus('Boot order saved successfully', 'ok');
    closeBootModal();
    loadVars();
  } catch (e) {
    showStatus('Save failed: ' + e.message, 'err');
  }
}
