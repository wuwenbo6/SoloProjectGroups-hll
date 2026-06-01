const api = window.electronAPI;

let devices = [];
let commands = [];
let sequences = [];
let selectedDeviceId = null;
let connectedDeviceId = null;
let isRunning = false;
let currentTestRunId = null;

const DEFAULT_JS_CODE = `console.log('Instrument Control Test');

await instrument.connect('usbtmc:simulator');

const idn = await instrument.query('*IDN?', 10000);
console.log('Device ID:', idn.value);

await instrument.send('*RST');
await sleep(500);

const voltage = await instrument.measure('MEAS:VOLT?', 'V');
await assert.withinRange('Output Voltage', voltage, 4.5, 5.5, 'V');

const current = await instrument.measure('MEAS:CURR?', 'A');
await assert.lessThan('Current', current, 2.0, 'A');

await instrument.disconnect();
console.log('Done!');`;

const DEFAULT_BATCH_CODE = `console.log('Multi-Device Concurrent Test');

const devices = ['usbtmc:simulator', 'gpib:simulator'];
const results = [];

for (const deviceId of devices) {
  console.log('\\n--- Testing', deviceId, '---');
  await instrument.connect(deviceId);

  const idn = await instrument.query('*IDN?', 10000);
  console.log('ID:', idn.value);

  const cmdResults = await instrument.batch([
    '*RST',
    '*CLS',
    'MEAS:VOLT?',
    'SYST:ERR?'
  ], { stopOnError: false, delayMs: 200 });

  cmdResults.results.forEach(r => {
    if (r.success && r.raw) {
      console.log('  Result:', r.command, '=', r.raw);
    }
  });

  await instrument.disconnect();
  results.push({ deviceId, cmdResults });
}

console.log('\\nAll tests completed!');
console.log('Results:', JSON.stringify(results, null, 2));`;

const ASSERT_TEMPLATE_CODE = `// Limit Check Example
await test.start('Voltage Regulation Test');
await instrument.connect('usbtmc:simulator');

await instrument.send('VOLT 5.0');
await sleep(100);

for (let i = 0; i < 5; i++) {
  const meas = await instrument.measure('MEAS:VOLT?', 'V');
  await assert.withinRange('Voltage Check ' + (i+1), meas, 4.8, 5.2, 'V', 'MEAS:VOLT?');
  await sleep(200);
}

await instrument.disconnect();`;

const DEFAULT_PYTHON_CODE = `print('Instrument Control Test')

send('*IDN?')
sleep(500)

send('*RST')
sleep(500)

send('MEAS:VOLT?')

print('Done!')`;

function init() {
  setupEditor();
  setupEventListeners();
  setupTabs();
  loadDevices();
  loadCommands();
  loadSequences();
  loadTestRuns();
  initDashboard();
}

function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(tab + 'Tab').classList.add('active');

      if (tab === 'dashboard') {
        refreshDashboard();
      } else if (tab === 'testruns') {
        loadTestRuns();
      }
    });
  });
}

function setupEditor() {
  const editor = document.getElementById('editor');
  editor.contentEditable = 'true';
  editor.spellcheck = false;
  editor.dataset.placeholder = 'Write your test script here...';
  editor.textContent = DEFAULT_JS_CODE;
}

function setupEventListeners() {
  document.getElementById('refreshDevices').addEventListener('click', loadDevices);
  document.getElementById('connectBtn').addEventListener('click', toggleConnect);
  document.getElementById('deviceSelector').addEventListener('change', (e) => {
    selectedDeviceId = e.target.value;
  });

  document.getElementById('runBtn').addEventListener('click', () => runScript(false));
  document.getElementById('runWithTestBtn').addEventListener('click', () => runScript(true));
  document.getElementById('stopBtn').addEventListener('click', stopScript);
  document.getElementById('saveSeqBtn').addEventListener('click', showSaveModal);
  document.getElementById('languageSelect').addEventListener('change', changeLanguage);
  document.getElementById('clearOutput').addEventListener('click', clearOutput);

  document.getElementById('sendBtn').addEventListener('click', sendCommand);
  document.getElementById('queryBtn').addEventListener('click', queryCommand);
  document.getElementById('quickCommand').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') queryCommand();
  });

  document.getElementById('newSeqBtn').addEventListener('click', newSequence);
  document.getElementById('cancelSave').addEventListener('click', hideSaveModal);
  document.getElementById('confirmSave').addEventListener('click', saveSequence);
  document.getElementById('batchTemplateBtn').addEventListener('click', loadBatchTemplate);

  document.getElementById('refreshDashboard').addEventListener('click', refreshDashboard);
  document.getElementById('refreshTestRuns').addEventListener('click', loadTestRuns);
}

function initDashboard() {
  const gaugeData = [
    { label: 'Voltage', unit: 'V', value: '--', min: 0, max: 30 },
    { label: 'Current', unit: 'A', value: '--', min: 0, max: 5 },
    { label: 'Power', unit: 'W', value: '--', min: 0, max: 100 },
    { label: 'Temperature', unit: '\u00B0C', value: '--', min: 0, max: 100 }
  ];
  renderGauges(gaugeData);
  renderHistoryChart([]);
}

function renderGauges(data) {
  const grid = document.getElementById('gaugesGrid');
  grid.innerHTML = data.map(gauge => `
    <div class="gauge-card idle">
      <div class="gauge-status idle"></div>
      <div class="gauge-value">${gauge.value}</div>
      <div class="gauge-unit">${gauge.unit}</div>
      <div class="gauge-label">${gauge.label}</div>
      ${gauge.min !== undefined ?
        `<div class="gauge-limits">Range: ${gauge.min} ~ ${gauge.max}</div>` : ''}
    </div>
  `).join('');
}

function renderHistoryChart(data) {
  const canvas = document.getElementById('historyChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  canvas.width = canvas.offsetWidth * 2;
  canvas.height = canvas.offsetHeight * 2;
  ctx.scale(2, 2);

  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;
  const padding = 40;

  ctx.fillStyle = '#181825';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#313244';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding + (height - 2 * padding) * i / 4;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  if (data.length > 1) {
    const maxVal = Math.max(...data) * 1.1 || 10;
    const minVal = Math.min(...data) * 0.9 || 0;
    const range = maxVal - minVal || 1;

    ctx.strokeStyle = '#89b4fa';
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach((val, i) => {
      const x = padding + (width - 2 * padding) * i / (data.length - 1);
      const y = height - padding - (height - 2 * padding) * (val - minVal) / range;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = 'rgba(137, 180, 250, 0.1)';
    ctx.lineTo(width - padding, height - padding);
    ctx.lineTo(padding, height - padding);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#7f849c';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Measurement History', padding, 20);
}

async function refreshDashboard() {
  if (!connectedDeviceId) return;

  try {
    const history = await api.measurements.getHistory(connectedDeviceId, 'MEAS:VOLT?', 50);
    const values = history.map(h => h.value);
    renderHistoryChart(values);

    if (values.length > 0) {
      const lastVoltage = values[values.length - 1];
      const gaugeData = [
        { label: 'Voltage', unit: 'V', value: lastVoltage.toFixed(3), min: 0, max: 30 },
        { label: 'Current', unit: 'A', value: (lastVoltage / 10).toFixed(3), min: 0, max: 5 },
        { label: 'Power', unit: 'W', value: (lastVoltage * lastVoltage / 100).toFixed(2), min: 0, max: 100 },
        { label: 'Samples', unit: 'pts', value: values.length, min: 0, max: 1000 }
      ];
      renderGauges(gaugeData);
    }
  } catch (error) {
    console.error('Dashboard error:', error);
  }
}

async function loadDevices() {
  try {
    devices = await api.instrument.list();
    const selector = document.getElementById('deviceSelector');
    selector.innerHTML = '<option value="">Select device...</option>';

    devices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = device.name;
      selector.appendChild(option);
    });

    if (devices.length > 0 && !selectedDeviceId) {
      selectedDeviceId = devices[0].id;
      selector.value = selectedDeviceId;
    }
  } catch (error) {
    logOutput('Error loading devices: ' + error.message, 'error');
  }
}

async function loadCommands() {
  try {
    commands = await api.commands.getAll();
    renderCommands();
  } catch (error) {
    logOutput('Error loading commands: ' + error.message, 'error');
  }
}

function renderCommands() {
  const container = document.getElementById('commandList');
  const categories = {};

  commands.forEach(cmd => {
    const cat = cmd.category || 'Uncategorized';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(cmd);
  });

  container.innerHTML = '';

  Object.keys(categories).sort().forEach(category => {
    const catDiv = document.createElement('div');
    catDiv.style.marginBottom = '12px';

    const catTitle = document.createElement('div');
    catTitle.style.fontSize = '11px';
    catTitle.style.color = '#7f849c';
    catTitle.style.marginBottom = '6px';
    catTitle.style.textTransform = 'uppercase';
    catTitle.textContent = category;
    catDiv.appendChild(catTitle);

    categories[category].forEach(cmd => {
      const item = document.createElement('div');
      item.className = 'command-item';
      item.innerHTML = `
        <div class="name">${cmd.name} ${cmd.is_query ? '\u2753' : ''}</div>
        <div class="scpi">${cmd.scpi}</div>
        ${cmd.description ? `<div class="desc">${cmd.description}</div>` : ''}
      `;
      item.addEventListener('click', () => insertCommand(cmd));
      item.addEventListener('dblclick', () => quickRunCommand(cmd));
      catDiv.appendChild(item);
    });

    container.appendChild(catDiv);
  });
}

function insertCommand(cmd) {
  const editor = document.getElementById('editor');
  const text = cmd.is_query
    ? `const result = await instrument.query('${cmd.scpi}');\n`
    : `await instrument.send('${cmd.scpi}');\n`;

  document.execCommand('insertText', false, text);
}

async function quickRunCommand(cmd) {
  if (!connectedDeviceId) {
    logOutput('Please connect to a device first', 'error');
    return;
  }

  try {
    if (cmd.is_query) {
      const result = await api.instrument.query(connectedDeviceId, cmd.scpi);
      logOutput(`QUERY: ${cmd.scpi}`, 'query');
      logOutput(`RESPONSE: ${result.raw}`, 'response');
    } else {
      await api.instrument.send(connectedDeviceId, cmd.scpi);
      logOutput(`SEND: ${cmd.scpi}`, 'send');
    }
  } catch (error) {
    logOutput('Error: ' + error.message, 'error');
  }
}

async function loadSequences() {
  try {
    sequences = await api.sequences.getAll();
    renderSequences();
  } catch (error) {
    logOutput('Error loading sequences: ' + error.message, 'error');
  }
}

function renderSequences() {
  const container = document.getElementById('sequenceList');
  container.innerHTML = '';

  sequences.forEach(seq => {
    const item = document.createElement('div');
    item.className = 'sequence-item';
    item.innerHTML = `
      <div>
        <div class="name">${seq.name}</div>
        <div style="font-size: 10px; color: #7f849c; margin-top: 2px;">${seq.description || 'No description'}</div>
      </div>
      <span class="lang">${seq.language}</span>
    `;
    item.addEventListener('click', () => loadSequence(seq));
    container.appendChild(item);
  });
}

function loadSequence(seq) {
  document.getElementById('editor').textContent = seq.code;
  document.getElementById('languageSelect').value = seq.language;
}

function newSequence() {
  const lang = document.getElementById('languageSelect').value;
  document.getElementById('editor').textContent = lang === 'javascript' ? DEFAULT_JS_CODE : DEFAULT_PYTHON_CODE;
}

function loadBatchTemplate() {
  document.getElementById('languageSelect').value = 'javascript';
  document.getElementById('editor').textContent = DEFAULT_BATCH_CODE;
}

async function toggleConnect() {
  const btn = document.getElementById('connectBtn');

  if (connectedDeviceId) {
    try {
      await api.instrument.disconnect(connectedDeviceId);
      logOutput(`Disconnected from ${connectedDeviceId}`, 'info');
      connectedDeviceId = null;
      btn.textContent = 'Connect';
      btn.classList.remove('btn-danger');
      btn.classList.add('btn-primary');
    } catch (error) {
      logOutput('Error disconnecting: ' + error.message, 'error');
    }
  } else if (selectedDeviceId) {
    try {
      await api.instrument.connect(selectedDeviceId);
      logOutput(`Connected to ${selectedDeviceId}`, 'info');
      connectedDeviceId = selectedDeviceId;
      btn.textContent = 'Disconnect';
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-danger');
    } catch (error) {
      logOutput('Error connecting: ' + error.message, 'error');
    }
  }
}

async function runScript(withTest) {
  if (isRunning) return;

  const code = document.getElementById('editor').textContent;
  const language = document.getElementById('languageSelect').value;
  const testName = withTest ? document.getElementById('testRunName').value.trim() : null;

  if (withTest && !testName) {
    logOutput('Please enter a test name for recording', 'error');
    return;
  }

  isRunning = true;
  document.getElementById('runBtn').disabled = true;
  document.getElementById('runWithTestBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;

  logOutput('--- Script started ---', 'info');

  try {
    let result;
    if (withTest) {
      result = await api.script.runWithTest(code, language, testName);
    } else {
      result = await api.script.run(code, language);
    }

    result.output.forEach(line => {
      if (line.startsWith('SEND:')) {
        logOutput(line, 'send');
      } else if (line.startsWith('QUERY:')) {
        logOutput(line, 'query');
      } else if (line.startsWith('RESPONSE:')) {
        logOutput(line, 'response');
      } else if (line.startsWith('MEASURE:') || line.startsWith('VALUE:')) {
        logOutput(line, 'query');
      } else if (line.startsWith('TEST [')) {
        logOutput(line, line.includes('PASS') ? 'response' : 'error');
      } else if (line.startsWith('Error:')) {
        logOutput(line, 'error');
      } else if (line.startsWith('===')) {
        logOutput(line, 'info');
      } else {
        logOutput(line, 'info');
      }
    });

    if (result.success) {
      logOutput('--- Script completed successfully ---', 'info');
      if (result.testRunId) {
        currentTestRunId = result.testRunId;
        logOutput(`Test Run ID: ${result.testRunId}`, 'info');
        loadTestRuns();
        refreshDashboard();
      }
    } else {
      logOutput('--- Script failed ---', 'error');
    }
  } catch (error) {
    logOutput('Error: ' + error.message, 'error');
  } finally {
    isRunning = false;
    document.getElementById('runBtn').disabled = false;
    document.getElementById('runWithTestBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
  }
}

async function stopScript() {
  try {
    await api.script.stop();
    logOutput('Script stopped', 'info');
  } catch (error) {
    logOutput('Error stopping: ' + error.message, 'error');
  }
}

function changeLanguage(e) {
  const lang = e.target.value;
  const editor = document.getElementById('editor');
  if (editor.textContent.trim() === '' ||
      editor.textContent === DEFAULT_JS_CODE ||
      editor.textContent === DEFAULT_PYTHON_CODE ||
      editor.textContent === DEFAULT_BATCH_CODE ||
      editor.textContent === ASSERT_TEMPLATE_CODE) {
    editor.textContent = lang === 'javascript' ? DEFAULT_JS_CODE : DEFAULT_PYTHON_CODE;
  }
}

async function sendCommand() {
  if (!connectedDeviceId) {
    logOutput('Please connect to a device first', 'error');
    return;
  }

  const cmd = document.getElementById('quickCommand').value.trim();
  const timeout = parseInt(document.getElementById('quickTimeout').value, 10) || 5000;
  if (!cmd) return;

  try {
    await api.instrument.send(connectedDeviceId, cmd, timeout);
    logOutput(`SEND: ${cmd} (timeout: ${timeout}ms)`, 'send');
  } catch (error) {
    logOutput('Error: ' + error.message, 'error');
  }
}

async function queryCommand() {
  if (!connectedDeviceId) {
    logOutput('Please connect to a device first', 'error');
    return;
  }

  const cmd = document.getElementById('quickCommand').value.trim();
  const timeout = parseInt(document.getElementById('quickTimeout').value, 10) || 5000;
  if (!cmd) return;

  try {
    const start = Date.now();
    const result = await api.instrument.query(connectedDeviceId, cmd, timeout);
    const duration = Date.now() - start;
    logOutput(`QUERY: ${cmd} (timeout: ${timeout}ms, took: ${duration}ms)`, 'query');
    logOutput(`RESPONSE: ${result.raw}`, 'response');
    if (result.parsed) {
      logOutput(`PARSED: [${result.parsed.type}] ${result.parsed.value}`, 'info');
    }
  } catch (error) {
    logOutput('Error: ' + error.message, 'error');
  }
}

async function loadTestRuns() {
  try {
    const testRuns = await api.testRuns.getAll(20);
    renderTestRuns(testRuns);
  } catch (error) {
    console.error('Error loading test runs:', error);
  }
}

function renderTestRuns(testRuns) {
  const container = document.getElementById('testRunsList');
  if (!container) return;

  container.innerHTML = '';

  if (testRuns.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: #7f849c; padding: 40px;">
        <p style="font-size: 14px;">No test runs yet</p>
        <p style="font-size: 12px; margin-top: 8px;">Run a script with "Run & Record" to create test runs</p>
      </div>
    `;
    return;
  }

  testRuns.forEach(run => {
    const card = document.createElement('div');
    card.className = 'test-run-card';
    const passRate = run.total_tests > 0
      ? ((run.passed_tests / run.total_tests) * 100).toFixed(1)
      : 0;

    card.innerHTML = `
      <div class="test-run-header">
        <div class="test-run-name">${run.name}</div>
        <span class="test-run-status ${run.status}">${run.status}</span>
      </div>
      <div class="test-run-stats">
        <div class="test-run-stat total">
          <div class="val">${run.total_tests || 0}</div>
          <div class="label">Total</div>
        </div>
        <div class="test-run-stat pass">
          <div class="val">${run.passed_tests || 0}</div>
          <div class="label">Pass</div>
        </div>
        <div class="test-run-stat fail">
          <div class="val">${run.failed_tests || 0}</div>
          <div class="label">Fail</div>
        </div>
        <div class="test-run-stat total">
          <div class="val">${passRate}%</div>
          <div class="label">Pass Rate</div>
        </div>
      </div>
      <div class="test-run-time">
        Device: ${run.device_id || 'N/A'} | Started: ${run.started_at || 'N/A'} | Finished: ${run.finished_at || 'Running...'}
      </div>
      <div class="test-run-actions">
        <button class="btn btn-small btn-primary" onclick="viewTestRun(${run.id})">View</button>
        <button class="btn btn-small btn-secondary" onclick="exportReport(${run.id}, 'html')">HTML</button>
        <button class="btn btn-small btn-secondary" onclick="exportReport(${run.id}, 'csv')">CSV</button>
        <button class="btn btn-small btn-secondary" onclick="exportReport(${run.id}, 'json')">JSON</button>
        <button class="btn btn-small btn-danger" onclick="deleteTestRun(${run.id})">Delete</button>
      </div>
    `;
    container.appendChild(card);
  });
}

async function viewTestRun(testRunId) {
  try {
    const run = await api.testRuns.get(testRunId);
    if (run && run.results) {
      logOutput(`\\n=== Test Run #${run.id}: ${run.name} ===`, 'info');
      run.results.forEach((r, i) => {
        const status = r.status === 'pass' ? '\u2705' : '\u274C';
        logOutput(`${status} [${i+1}] ${r.name}: ${r.measured_value} ${r.unit || ''} ${r.min_limit !== null ? `[${r.min_limit}~${r.max_limit}]` : ''}`, r.status === 'pass' ? 'response' : 'error');
      });
    }
  } catch (error) {
    logOutput('Error viewing test run: ' + error.message, 'error');
  }
}

async function exportReport(testRunId, format) {
  try {
    let result;
    if (format === 'html') {
      result = await api.report.exportHTML(testRunId);
    } else if (format === 'csv') {
      result = await api.report.exportCSV(testRunId);
    } else if (format === 'json') {
      result = await api.report.exportJSON(testRunId);
    }

    if (result && result.success) {
      logOutput(`Report exported to: ${result.path}`, 'info');
    }
  } catch (error) {
    logOutput('Error exporting report: ' + error.message, 'error');
  }
}

async function deleteTestRun(testRunId) {
  if (!confirm('Are you sure you want to delete this test run?')) return;
  try {
    await api.testRuns.delete(testRunId);
    loadTestRuns();
    logOutput(`Test run #${testRunId} deleted`, 'info');
  } catch (error) {
    logOutput('Error deleting test run: ' + error.message, 'error');
  }
}

function showSaveModal() {
  document.getElementById('saveModal').classList.remove('hidden');
}

function hideSaveModal() {
  document.getElementById('saveModal').classList.add('hidden');
  document.getElementById('seqName').value = '';
  document.getElementById('seqDesc').value = '';
}

async function saveSequence() {
  const name = document.getElementById('seqName').value.trim();
  const description = document.getElementById('seqDesc').value.trim();

  if (!name) {
    logOutput('Please enter a sequence name', 'error');
    return;
  }

  const sequence = {
    name,
    description,
    language: document.getElementById('languageSelect').value,
    code: document.getElementById('editor').textContent
  };

  try {
    await api.sequences.add(sequence);
    logOutput(`Sequence "${name}" saved`, 'info');
    hideSaveModal();
    loadSequences();
  } catch (error) {
    logOutput('Error saving sequence: ' + error.message, 'error');
  }
}

function logOutput(message, type = 'info') {
  const panel = document.getElementById('output');
  if (!panel) return;
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
}

function clearOutput() {
  document.getElementById('output').innerHTML = '';
}

window.viewTestRun = viewTestRun;
window.exportReport = exportReport;
window.deleteTestRun = deleteTestRun;

document.addEventListener('DOMContentLoaded', init);
