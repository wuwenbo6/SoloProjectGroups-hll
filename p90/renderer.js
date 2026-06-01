const { ipcRenderer } = require('electron');

const sequencer = new DNASequencerSimulator();
let signalChart = null;
let qualityChart = null;
let currentAnalysis = null;
let accumulatedSignals = { A: [], T: [], C: [], G: [] };

document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  bindEvents();
  loadSamples();
});

function initCharts() {
  const signalCtx = document.getElementById('signalChart').getContext('2d');
  signalChart = new Chart(signalCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'A', data: [], borderColor: '#4CAF50', backgroundColor: 'rgba(76, 175, 80, 0.1)', borderWidth: 2, pointRadius: 0 },
        { label: 'T', data: [], borderColor: '#f44336', backgroundColor: 'rgba(244, 67, 54, 0.1)', borderWidth: 2, pointRadius: 0 },
        { label: 'C', data: [], borderColor: '#2196F3', backgroundColor: 'rgba(33, 150, 243, 0.1)', borderWidth: 2, pointRadius: 0 },
        { label: 'G', data: [], borderColor: '#FF9800', backgroundColor: 'rgba(255, 152, 0, 0.1)', borderWidth: 2, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { title: { display: true, text: '数据点', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { title: { display: true, text: '信号强度', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      },
      plugins: { legend: { display: false } }
    }
  });

  const qualityCtx = document.getElementById('qualityChart').getContext('2d');
  qualityChart = new Chart(qualityCtx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: '质量值',
        data: [],
        backgroundColor: (context) => {
          const value = context.raw;
          if (value >= 30) return 'rgba(16, 185, 129, 0.8)';
          if (value >= 20) return 'rgba(251, 191, 36, 0.8)';
          return 'rgba(239, 68, 68, 0.8)';
        },
        borderRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: '碱基位置', color: '#94a3b8' }, ticks: { color: '#94a3b8', maxTicksLimit: 20 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { title: { display: true, text: 'Q值', color: '#94a3b8' }, min: 0, max: 60, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function bindEvents() {
  document.getElementById('connectBtn').addEventListener('click', connectDevice);
  document.getElementById('disconnectBtn').addEventListener('click', disconnectDevice);
  document.getElementById('startBtn').addEventListener('click', startSequencing);
  document.getElementById('stopBtn').addEventListener('click', stopSequencing);
  document.getElementById('saveBtn').addEventListener('click', saveSample);
  document.getElementById('exportBtn').addEventListener('click', exportFasta);
  document.getElementById('exportAbiBtn').addEventListener('click', exportAbi);
  document.getElementById('loadSamplesBtn').addEventListener('click', loadSamples);
  document.getElementById('demultiplexBtn').addEventListener('click', runDemultiplex);
  document.getElementById('calibrateBtn').addEventListener('click', runCalibration);
}

async function connectDevice() {
  const result = await sequencer.connect();
  if (result.success) {
    updateDeviceStatus('connected', result.device);
    document.getElementById('connectBtn').disabled = true;
    document.getElementById('disconnectBtn').disabled = false;
    document.getElementById('startBtn').disabled = false;
  }
}

function disconnectDevice() {
  sequencer.disconnect();
  updateDeviceStatus('disconnected', '');
  document.getElementById('connectBtn').disabled = false;
  document.getElementById('disconnectBtn').disabled = true;
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = true;
}

function startSequencing() {
  const length = parseInt(document.getElementById('sequenceLength').value) || 100;
  accumulatedSignals = { A: [], T: [], C: [], G: [] };
  
  updateDeviceStatus('running', '测序中...');
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  
  sequencer.startSequencing(length, handleSequencingData);
}

function stopSequencing() {
  sequencer.stopSequencing();
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  updateDeviceStatus('connected', sequencer.isConnected ? 'DNASeq-2000 Simulator' : '');
}

function handleSequencingData(data) {
  if (data.type === 'data') {
    Object.keys(data.data).forEach(channel => {
      accumulatedSignals[channel] = accumulatedSignals[channel].concat(data.data[channel]);
    });
    updateSignalChart();
    updateProgress(data.progress);
  } else if (data.type === 'complete') {
    analyzeData();
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    updateDeviceStatus('connected', 'DNASeq-2000 Simulator');
  }
}

function updateSignalChart() {
  const maxPoints = 500;
  const signals = accumulatedSignals;
  const totalPoints = signals.A.length;
  const step = Math.max(1, Math.floor(totalPoints / maxPoints));
  
  const labels = [];
  const datasets = [[], [], [], []];
  const channels = ['A', 'T', 'C', 'G'];
  
  for (let i = 0; i < totalPoints; i += step) {
    labels.push(i);
    channels.forEach((ch, idx) => {
      datasets[idx].push(signals[ch][i]);
    });
  }
  
  signalChart.data.labels = labels;
  signalChart.data.datasets.forEach((ds, idx) => {
    ds.data = datasets[idx];
  });
  signalChart.update('none');
}

function updateProgress(progress) {
  const percent = Math.round(progress * 100);
  document.getElementById('progressFill').style.width = `${percent}%`;
  document.getElementById('progressText').textContent = `${percent}%`;
}

function analyzeData() {
  const detector = new PeakDetector(accumulatedSignals);
  currentAnalysis = detector.callBases();
  
  displaySequence(currentAnalysis.sequence);
  updateQualityChart(currentAnalysis.qualityScores);
  updateStats(currentAnalysis);
  
  document.getElementById('saveBtn').disabled = false;
  document.getElementById('exportBtn').disabled = false;
  document.getElementById('exportAbiBtn').disabled = false;
  document.getElementById('demultiplexBtn').disabled = false;
  document.getElementById('calibrateBtn').disabled = false;
}

function displaySequence(sequence) {
  const display = document.getElementById('sequenceDisplay');
  display.innerHTML = sequence.split('').map(base => 
    `<span class="base-${base}">${base}</span>`
  ).join('');
}

function updateQualityChart(qualityScores) {
  const labels = qualityScores.map((_, i) => i + 1);
  qualityChart.data.labels = labels;
  qualityChart.data.datasets[0].data = qualityScores;
  qualityChart.update();
}

function updateStats(analysis) {
  const { sequence, qualityScores } = analysis;
  
  document.getElementById('statLength').textContent = sequence.length;
  
  const gcCount = (sequence.match(/[GC]/g) || []).length;
  const gcPercent = sequence.length > 0 ? Math.round(gcCount / sequence.length * 100) : 0;
  document.getElementById('statGC').textContent = `${gcPercent}%`;
  
  const avgQuality = qualityScores.length > 0 
    ? (qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length).toFixed(1)
    : 0;
  document.getElementById('statAvgQuality').textContent = avgQuality;
  
  const q20Count = qualityScores.filter(q => q >= 20).length;
  const q20Percent = qualityScores.length > 0 ? Math.round(q20Count / qualityScores.length * 100) : 0;
  document.getElementById('statQ20').textContent = `${q20Percent}%`;
}

function updateDeviceStatus(status, deviceName) {
  const indicator = document.getElementById('deviceStatus');
  const nameEl = document.getElementById('deviceName');
  
  indicator.className = `status-indicator ${status}`;
  
  const statusTexts = {
    connected: '已连接',
    disconnected: '未连接',
    running: '运行中'
  };
  indicator.textContent = statusTexts[status] || status;
  nameEl.textContent = deviceName;
}

async function saveSample() {
  const name = document.getElementById('sampleName').value.trim();
  if (!name) {
    alert('请输入样本名称');
    return;
  }
  
  if (!currentAnalysis) {
    alert('没有可保存的测序数据');
    return;
  }
  
  const sample = {
    name: name,
    sequence: currentAnalysis.sequence,
    qualityScores: currentAnalysis.qualityScores,
    signalData: accumulatedSignals
  };
  
  const result = await ipcRenderer.invoke('save-sample', sample);
  if (result.success) {
    alert('样本保存成功！');
    loadSamples();
  } else {
    alert(`保存失败: ${result.error}`);
  }
}

async function exportFasta() {
  const name = document.getElementById('sampleName').value.trim() || 'sequence';
  
  if (!currentAnalysis) {
    alert('没有可导出的测序数据');
    return;
  }
  
  const result = await ipcRenderer.invoke('export-fasta', {
    name: name,
    sequence: currentAnalysis.sequence
  });
  
  if (result.success) {
    alert(`FASTA文件已导出到: ${result.path}`);
  } else if (!result.canceled) {
    alert(`导出失败: ${result.error}`);
  }
}

async function loadSamples() {
  const result = await ipcRenderer.invoke('get-samples');
  const listEl = document.getElementById('sampleList');
  
  if (!result.success || result.samples.length === 0) {
    listEl.innerHTML = '<p class="empty-text">暂无样本</p>';
    return;
  }
  
  listEl.innerHTML = result.samples.map(sample => `
    <div class="sample-item" data-id="${sample.id}">
      <div class="sample-item-header">
        <span class="sample-item-name">${sample.name}</span>
        <span class="sample-item-delete" onclick="deleteSample(${sample.id}, event)">✕</span>
      </div>
      <div class="sample-item-meta">
        长度: ${sample.sequence.length}bp | ${new Date(sample.created_at).toLocaleString()}
      </div>
    </div>
  `).join('');
  
  listEl.querySelectorAll('.sample-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('sample-item-delete')) {
        loadSampleData(result.samples.find(s => s.id === parseInt(item.dataset.id)));
      }
    });
  });
}

async function deleteSample(id, event) {
  event.stopPropagation();
  if (confirm('确定要删除这个样本吗？')) {
    await ipcRenderer.invoke('delete-sample', id);
    loadSamples();
  }
}

function loadSampleData(sample) {
  document.getElementById('sampleName').value = sample.name;
  
  const qualityScores = JSON.parse(sample.quality_scores || '[]');
  const signalData = JSON.parse(sample.signal_data || '{"A":[],"T":[],"C":[],"G":[]}');
  
  currentAnalysis = {
    sequence: sample.sequence,
    qualityScores: qualityScores,
    peaks: []
  };
  accumulatedSignals = signalData;
  
  displaySequence(sample.sequence);
  updateQualityChart(qualityScores);
  updateSignalChart();
  updateStats(currentAnalysis);
  
  document.getElementById('saveBtn').disabled = false;
  document.getElementById('exportBtn').disabled = false;
  document.getElementById('exportAbiBtn').disabled = false;
  document.getElementById('demultiplexBtn').disabled = false;
  document.getElementById('calibrateBtn').disabled = false;
}

window.deleteSample = deleteSample;

function runDemultiplex() {
  const numSamples = parseInt(document.getElementById('numSamples').value) || 2;
  
  if (!currentAnalysis || !currentAnalysis.peaks) {
    alert('请先完成测序');
    return;
  }
  
  const demultiplexer = new MixedSampleDemultiplexer(currentAnalysis.peaks, accumulatedSignals);
  const results = demultiplexer.demultiplex(numSamples);
  
  displayDemultiplexResults(results);
}

function displayDemultiplexResults(results) {
  const section = document.getElementById('demultiplexSection');
  const container = document.getElementById('demultiplexResults');
  
  section.style.display = 'block';
  
  container.innerHTML = results.map((result, idx) => `
    <div class="cluster-result">
      <h5>样本 ${idx + 1} - 置信度: ${(result.confidence * 100).toFixed(1)}%</h5>
      <div class="cluster-sequence">
        ${result.sequence.split('').map(base => `<span class="base-${base}">${base}</span>`).join('')}
      </div>
      <div class="cluster-stats">
        <span>长度: ${result.sequence.length}bp</span>
        <span>峰数: ${result.peakCount}</span>
        <span>平均Q值: ${result.qualityScores.length > 0 ? Math.round(result.qualityScores.reduce((a, b) => a + b, 0) / result.qualityScores.length) : 0}</span>
      </div>
    </div>
  `).join('');
}

function runCalibration() {
  if (!currentAnalysis) {
    alert('请先完成测序');
    return;
  }
  
  const knownSequence = document.getElementById('knownSequence').value.trim() || null;
  
  const calibrator = new PhredQualityCalibrator(
    currentAnalysis.qualityScores,
    currentAnalysis.sequence,
    knownSequence
  );
  
  const calibrationResult = calibrator.calibrate();
  
  displayCalibrationResults(calibrationResult);
  
  currentAnalysis.originalQualityScores = currentAnalysis.qualityScores;
  currentAnalysis.qualityScores = calibrationResult.calibratedScores;
  updateQualityChart(calibrationResult.calibratedScores);
  updateStats(currentAnalysis);
}

function displayCalibrationResults(result) {
  const section = document.getElementById('calibrationSection');
  const container = document.getElementById('calibrationResults');
  
  section.style.display = 'block';
  
  const tablePreview = Object.entries(result.calibrationTable)
    .filter(([orig]) => parseInt(orig) % 5 === 0)
    .slice(0, 10)
    .map(([orig, cal]) => `Q${orig} → Q${cal}`)
    .join(', ');
  
  container.innerHTML = `
    <h5>Phred质量校准完成</h5>
    <div class="calibration-stats">
      <div class="calibration-stat">
        <span class="calibration-stat-label">原始平均Q值</span>
        <span class="calibration-stat-value">${result.meanOriginal}</span>
      </div>
      <div class="calibration-stat">
        <span class="calibration-stat-label">校准后平均Q值</span>
        <span class="calibration-stat-value">${result.meanCalibrated}</span>
      </div>
    </div>
    <div class="calibration-table-preview">
      校准表示例: ${tablePreview}...
    </div>
  `;
}

async function exportAbi() {
  const name = document.getElementById('sampleName').value.trim() || 'sequence';
  
  if (!currentAnalysis) {
    alert('没有可导出的测序数据');
    return;
  }
  
  const abiGenerator = new ABIFileGenerator({
    name: name,
    sequence: currentAnalysis.sequence,
    qualityScores: currentAnalysis.qualityScores,
    signals: accumulatedSignals,
    peaks: currentAnalysis.peaks || []
  });
  
  const abiContent = abiGenerator.exportToFile('json');
  
  const result = await ipcRenderer.invoke('export-abi', {
    name: name,
    content: abiContent
  });
  
  if (result.success) {
    alert(`ABI文件已导出到: ${result.path}`);
  } else if (!result.canceled) {
    alert(`导出失败: ${result.error}`);
  }
}
