let allVariables = [];
let selectedVariable = null;
let variableAttributes = {};
let protectedVariables = [];

async function init() {
  variableAttributes = await window.uefi.getVariableAttributes();
  protectedVariables = await window.uefi.getProtectedVariables();
  updateProtectedInfo();
  await loadVariables();
  setupEventListeners();
}

function setupEventListeners() {
  document.getElementById('refresh-btn').addEventListener('click', loadVariables);
  document.getElementById('search-input').addEventListener('input', filterVariables);
  document.getElementById('set-variable-btn').addEventListener('click', setVariable);
  document.getElementById('delete-variable-btn').addEventListener('click', deleteVariable);
  document.getElementById('clear-form-btn').addEventListener('click', clearForm);
  document.getElementById('get-variable-btn').addEventListener('click', testGetVariable);
  document.getElementById('next-variable-btn').addEventListener('click', testGetNextVariable);
  document.getElementById('query-info-btn').addEventListener('click', testQueryVariableInfo);
  
  document.getElementById('export-btn').addEventListener('click', exportVariables);
  document.getElementById('import-btn').addEventListener('click', importVariables);
  document.getElementById('import-file').addEventListener('change', handleFileImport);
  
  document.getElementById('var-guid').addEventListener('blur', formatGuidInput);
  document.getElementById('get-guid').addEventListener('blur', formatGuidInput);
  document.getElementById('next-guid').addEventListener('blur', formatGuidInput);
}

function updateProtectedInfo() {
  const info = document.getElementById('protected-info');
  if (protectedVariables.length > 0) {
    info.title = protectedVariables.map(v => `${v.name} (${v.guid})`).join('\n');
  }
}

function isProtectedVariable(name, guid) {
  return protectedVariables.some(v => v.name === name && v.guid === guid);
}

function formatGuidInput(event) {
  const input = event.target;
  let value = input.value.trim().toUpperCase();
  
  if (value && !value.startsWith('{')) {
    value = '{' + value;
  }
  if (value && !value.endsWith('}')) {
    value = value + '}';
  }
  
  input.value = value;
}

async function loadVariables() {
  allVariables = await window.uefi.getAllVariables();
  document.getElementById('variable-count').textContent = `Variables: ${allVariables.length}`;
  renderVariableList(allVariables);
}

function renderVariableList(variables) {
  const list = document.getElementById('variable-list');
  list.innerHTML = '';

  if (variables.length === 0) {
    list.innerHTML = '<p class="empty-state">No variables found</p>';
    return;
  }

  variables.forEach((variable) => {
    const item = document.createElement('div');
    item.className = 'variable-item';
    item.dataset.name = variable.name;
    item.dataset.guid = variable.guid;
    
    const attrFlags = getAttributeFlags(variable.attributes);
    const isProtected = isProtectedVariable(variable.name, variable.guid);
    const protectedBadge = isProtected ? '<span class="protected-icon" title="Protected Variable">🔒</span>' : '';
    
    item.innerHTML = `
      <div class="variable-name">${protectedBadge}${escapeHtml(variable.name)}</div>
      <div class="variable-guid">${escapeHtml(variable.guid)}</div>
      <div class="variable-meta">
        <span class="data-size">${variable.data.length} bytes</span>
        <span class="attr-flags">${attrFlags}</span>
      </div>
    `;
    
    item.addEventListener('click', () => showVariableDetails(variable));
    list.appendChild(item);
  });
}

function getAttributeFlags(attributes) {
  const flags = [];
  if (attributes & variableAttributes.EFI_VARIABLE_NON_VOLATILE) flags.push('NV');
  if (attributes & variableAttributes.EFI_VARIABLE_BOOTSERVICE_ACCESS) flags.push('BS');
  if (attributes & variableAttributes.EFI_VARIABLE_RUNTIME_ACCESS) flags.push('RT');
  return flags.join(',') || 'None';
}

function filterVariables() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const filtered = allVariables.filter(v => 
    v.name.toLowerCase().includes(search) || 
    v.guid.toLowerCase().includes(search)
  );
  renderVariableList(filtered);
}

function showVariableDetails(variable) {
  selectedVariable = variable;
  const details = document.getElementById('variable-details');
  
  const hexData = variable.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  let asciiData = '';
  try {
    asciiData = variable.data.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
  } catch (e) {
    asciiData = '(unprintable)';
  }
  
  let utf16Data = '';
  try {
    utf16Data = Buffer.from(variable.data).toString('utf16le');
  } catch (e) {
    utf16Data = '(invalid)';
  }
  
  const isProtected = isProtectedVariable(variable.name, variable.guid);
  
  const attrList = [];
  if (variable.attributes & variableAttributes.EFI_VARIABLE_NON_VOLATILE) {
    attrList.push('<span class="attr-flag">NON_VOLATILE</span>');
  }
  if (variable.attributes & variableAttributes.EFI_VARIABLE_BOOTSERVICE_ACCESS) {
    attrList.push('<span class="attr-flag">BOOTSERVICE_ACCESS</span>');
  }
  if (variable.attributes & variableAttributes.EFI_VARIABLE_RUNTIME_ACCESS) {
    attrList.push('<span class="attr-flag">RUNTIME_ACCESS</span>');
  }

  details.innerHTML = `
    <div class="detail-section">
      <label>Name:</label>
      <span class="detail-value">${isProtected ? '🔒 ' : ''}${escapeHtml(variable.name)}</span>
    </div>
    <div class="detail-section">
      <label>GUID:</label>
      <span class="detail-value guid">${escapeHtml(variable.guid)}</span>
    </div>
    <div class="detail-section">
      <label>Status:</label>
      <span class="detail-value">${isProtected ? '<span class="protected-badge">Protected (Cannot Delete)</span>' : '<span class="attr-flag">Modifiable</span>'}</span>
    </div>
    <div class="detail-section">
      <label>Attributes:</label>
      <div class="detail-value">${attrList.join(' ')}</div>
    </div>
    <div class="detail-section">
      <label>Size:</label>
      <span class="detail-value">${variable.data.length} bytes</span>
    </div>
    <div class="detail-section">
      <label>Hex:</label>
      <pre class="data-hex">${escapeHtml(hexData)}</pre>
    </div>
    <div class="detail-section">
      <label>ASCII:</label>
      <pre class="data-ascii">${escapeHtml(asciiData)}</pre>
    </div>
    <div class="detail-section">
      <label>UTF-16LE:</label>
      <pre class="data-utf16">${escapeHtml(utf16Data)}</pre>
    </div>
    <button class="btn btn-small" onclick="fillFormFromSelected()">Fill Form</button>
  `;
}

function fillFormFromSelected() {
  if (!selectedVariable) return;
  
  document.getElementById('var-name').value = selectedVariable.name;
  document.getElementById('var-guid').value = selectedVariable.guid;
  
  document.getElementById('attr-non-volatile').checked = 
    !!(selectedVariable.attributes & variableAttributes.EFI_VARIABLE_NON_VOLATILE);
  document.getElementById('attr-bootservice').checked = 
    !!(selectedVariable.attributes & variableAttributes.EFI_VARIABLE_BOOTSERVICE_ACCESS);
  document.getElementById('attr-runtime').checked = 
    !!(selectedVariable.attributes & variableAttributes.EFI_VARIABLE_RUNTIME_ACCESS);
  
  const hexData = selectedVariable.data.map(b => 
    b.toString(16).padStart(2, '0').toUpperCase()
  ).join(' ');
  document.getElementById('var-data-type').value = 'hex';
  document.getElementById('var-data').value = hexData;
}

window.fillFormFromSelected = fillFormFromSelected;

function parseDataInput(dataType, input) {
  switch (dataType) {
    case 'hex':
      const hexStr = input.replace(/\s/g, '');
      if (hexStr.length % 2 !== 0) throw new Error('Hex string must have even length');
      const bytes = [];
      for (let i = 0; i < hexStr.length; i += 2) {
        const byte = parseInt(hexStr.substr(i, 2), 16);
        if (isNaN(byte)) throw new Error('Invalid hex string');
        bytes.push(byte);
      }
      return bytes;
    case 'ascii':
      return Array.from(Buffer.from(input, 'ascii'));
    case 'utf16':
      return Array.from(Buffer.from(input, 'utf16le'));
    case 'integer':
      const num = BigInt(input);
      const buf = Buffer.alloc(8);
      buf.writeBigUInt64LE(num);
      return Array.from(buf);
    default:
      throw new Error('Unknown data type');
  }
}

async function setVariable() {
  const name = document.getElementById('var-name').value.trim();
  const guid = document.getElementById('var-guid').value.trim();
  const dataType = document.getElementById('var-data-type').value;
  const dataInput = document.getElementById('var-data').value;
  
  if (!name || !guid) {
    alert('Please enter both variable name and GUID');
    return;
  }
  
  let attributes = 0;
  if (document.getElementById('attr-non-volatile').checked) {
    attributes |= variableAttributes.EFI_VARIABLE_NON_VOLATILE;
  }
  if (document.getElementById('attr-bootservice').checked) {
    attributes |= variableAttributes.EFI_VARIABLE_BOOTSERVICE_ACCESS;
  }
  if (document.getElementById('attr-runtime').checked) {
    attributes |= variableAttributes.EFI_VARIABLE_RUNTIME_ACCESS;
  }
  
  try {
    const data = parseDataInput(dataType, dataInput);
    await window.uefi.setVariable(name, guid, data, attributes);
    await loadVariables();
    alert('Variable set successfully');
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function deleteVariable() {
  const name = document.getElementById('var-name').value.trim();
  const guid = document.getElementById('var-guid').value.trim();
  
  if (!name || !guid) {
    alert('Please enter both variable name and GUID');
    return;
  }
  
  if (!confirm(`Are you sure you want to delete variable "${name}"?`)) {
    return;
  }
  
  try {
    await window.uefi.setVariable(name, guid, [], 0);
    await loadVariables();
    clearForm();
    alert('Variable deleted successfully');
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

function clearForm() {
  document.getElementById('var-name').value = '';
  document.getElementById('var-guid').value = '';
  document.getElementById('var-data').value = '';
  document.getElementById('attr-non-volatile').checked = true;
  document.getElementById('attr-bootservice').checked = true;
  document.getElementById('attr-runtime').checked = true;
  selectedVariable = null;
  document.getElementById('variable-details').innerHTML = 
    '<p class="empty-state">Select a variable to view details</p>';
}

async function testGetVariable() {
  const name = document.getElementById('get-name').value.trim();
  const guid = document.getElementById('get-guid').value.trim();
  const resultEl = document.getElementById('get-result');
  
  if (!name || !guid) {
    resultEl.textContent = 'Error: Please enter both name and GUID';
    return;
  }
  
  try {
    const result = await window.uefi.getVariable(name, guid);
    resultEl.textContent = result ? JSON.stringify(result, null, 2) : 'Variable not found';
  } catch (error) {
    resultEl.textContent = 'Error: ' + error.message;
  }
}

async function testGetNextVariable() {
  const guid = document.getElementById('next-guid').value.trim() || null;
  const resultEl = document.getElementById('next-result');
  
  try {
    const result = await window.uefi.getNextVariableName(guid);
    resultEl.textContent = result ? JSON.stringify(result, null, 2) : 'No more variables';
  } catch (error) {
    resultEl.textContent = 'Error: ' + error.message;
  }
}

async function testQueryVariableInfo() {
  const resultEl = document.getElementById('query-result');
  
  try {
    const allAttrs = variableAttributes.EFI_VARIABLE_NON_VOLATILE | 
                      variableAttributes.EFI_VARIABLE_BOOTSERVICE_ACCESS | 
                      variableAttributes.EFI_VARIABLE_RUNTIME_ACCESS;
    const result = await window.uefi.queryVariableInfo(allAttrs);
    resultEl.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    resultEl.textContent = 'Error: ' + error.message;
  }
}

async function exportVariables() {
  try {
    const jsonData = await window.uefi.exportVariables();
    
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uefi-variables-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('Variables exported successfully!');
  } catch (error) {
    alert('Export failed: ' + error.message);
  }
}

function importVariables() {
  document.getElementById('import-file').click();
}

async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const result = await window.uefi.importVariables(text);
    
    if (result.imported > 0) {
      await loadVariables();
      alert(`Imported ${result.imported} variables${result.skipped > 0 ? `, skipped ${result.skipped} (protected/invalid)` : ''}`);
    } else {
      alert('No variables imported. Check if all variables are protected or invalid.');
    }
  } catch (error) {
    alert('Import failed: ' + error.message);
  }
  
  event.target.value = '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

init();
