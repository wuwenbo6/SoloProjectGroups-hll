const { ipcRenderer } = require('electron');
const path = require('path');

let waveformChart = null;
let spectrumChart = null;
let robustnessChart = null;

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadRecords();
});

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');

      if (tabId === 'records') {
        loadRecords();
      }
    });
  });
}

async function selectFile(filters) {
  const result = await ipcRenderer.invoke('open-file-dialog', {
    properties: ['openFile'],
    filters: filters
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
}

async function saveFile(filters, defaultPath) {
  const result = await ipcRenderer.invoke('save-file-dialog', {
    filters: filters,
    defaultPath: defaultPath
  });
  
  if (!result.canceled) {
    return result.filePath;
  }
  return null;
}

async function selectEmbedAudio() {
  const filePath = await selectFile([{ name: 'WAV Audio', extensions: ['wav'] }]);
  if (filePath) {
    document.getElementById('embed-audio-path').value = filePath;
  }
}

async function selectEmbedImage() {
  const filePath = await selectFile([{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif'] }]);
  if (filePath) {
    document.getElementById('embed-image-path').value = filePath;
    showImagePreview('embed-image-preview', filePath);
  }
}

async function selectEmbedOutput() {
  const filePath = await saveFile([{ name: 'WAV Audio', extensions: ['wav'] }], 'embedded_audio.wav');
  if (filePath) {
    document.getElementById('embed-output-path').value = filePath;
  }
}

async function embedImage() {
  const audioPath = document.getElementById('embed-audio-path').value;
  const imagePath = document.getElementById('embed-image-path').value;
  const outputPath = document.getElementById('embed-output-path').value;
  const resultDiv = document.getElementById('embed-result');

  if (!audioPath || !imagePath || !outputPath) {
    showResult(resultDiv, '请填写所有路径！', 'error');
    return;
  }

  showResult(resultDiv, '正在嵌入图像...', 'info');

  try {
    const result = await ipcRenderer.invoke('embed-image', audioPath, imagePath, outputPath);
    
    if (result.success) {
      showResult(resultDiv, 
        `嵌入成功！已嵌入 ${result.bits_embedded} 位，图像尺寸: ${result.image_size}`, 
        'success');
    } else {
      showResult(resultDiv, `嵌入失败: ${result.error || '未知错误'}`, 'error');
    }
  } catch (err) {
    showResult(resultDiv, `错误: ${err.message}`, 'error');
  }
}

async function selectExtractAudio() {
  const filePath = await selectFile([{ name: 'WAV Audio', extensions: ['wav'] }]);
  if (filePath) {
    document.getElementById('extract-audio-path').value = filePath;
  }
}

async function selectExtractOutput() {
  const filePath = await saveFile([{ name: 'PNG Image', extensions: ['png'] }], 'extracted_image.png');
  if (filePath) {
    document.getElementById('extract-output-path').value = filePath;
  }
}

async function extractImage() {
  const audioPath = document.getElementById('extract-audio-path').value;
  const outputPath = document.getElementById('extract-output-path').value;
  const resultDiv = document.getElementById('extract-result');
  const previewDiv = document.getElementById('extract-image-preview');

  if (!audioPath || !outputPath) {
    showResult(resultDiv, '请填写所有路径！', 'error');
    return;
  }

  showResult(resultDiv, '正在提取图像...', 'info');
  previewDiv.innerHTML = '';

  try {
    const result = await ipcRenderer.invoke('extract-image', audioPath, outputPath);
    
    if (result.success) {
      showResult(resultDiv, 
        `提取成功！图像尺寸: ${result.image_size}`, 
        'success');
      showImagePreview('extract-image-preview', outputPath);
    } else {
      showResult(resultDiv, `提取失败: ${result.error || '无法从音频中提取有效图像'}`, 'error');
    }
  } catch (err) {
    showResult(resultDiv, `错误: ${err.message}`, 'error');
  }
}

async function selectVisualizeAudio() {
  const filePath = await selectFile([{ name: 'WAV Audio', extensions: ['wav'] }]);
  if (filePath) {
    document.getElementById('visualize-audio-path').value = filePath;
  }
}

async function loadVisualization() {
  const filePath = document.getElementById('visualize-audio-path').value;

  if (!filePath) {
    alert('请先选择音频文件！');
    return;
  }

  try {
    const [waveformData, spectrumData] = await Promise.all([
      ipcRenderer.invoke('get-waveform', filePath),
      ipcRenderer.invoke('get-spectrum', filePath)
    ]);

    if (waveformData.success) {
      renderWaveform(waveformData.times, waveformData.waveform);
    }

    if (spectrumData.success) {
      renderSpectrum(spectrumData.frequencies, spectrumData.magnitude);
    }
  } catch (err) {
    alert(`加载可视化失败: ${err.message}`);
  }
}

function renderWaveform(times, waveform) {
  const ctx = document.getElementById('waveform-chart').getContext('2d');

  const sampleRate = Math.floor(waveform.length / 1000);
  const sampledTimes = times.filter((_, i) => i % sampleRate === 0);
  const sampledWaveform = waveform.filter((_, i) => i % sampleRate === 0);

  if (waveformChart) {
    waveformChart.destroy();
  }

  waveformChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sampledTimes.map(t => t.toFixed(2)),
      datasets: [{
        label: '波形',
        data: sampledWaveform,
        borderColor: 'rgba(0, 212, 255, 0.8)',
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        borderWidth: 1,
        pointRadius: 0,
        fill: true,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          title: { display: true, text: '时间 (秒)', color: '#94a3b8' },
          ticks: { color: '#64748b', maxTicksLimit: 10 },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        y: {
          title: { display: true, text: '振幅', color: '#94a3b8' },
          ticks: { color: '#64748b' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        }
      }
    }
  });
}

function renderSpectrum(frequencies, magnitude) {
  const ctx = document.getElementById('spectrum-chart').getContext('2d');

  const maxFreq = 20000;
  const filteredIndices = frequencies.map((f, i) => f <= maxFreq ? i : -1).filter(i => i >= 0);
  const filteredFreqs = filteredIndices.map(i => frequencies[i]);
  const filteredMag = filteredIndices.map(i => magnitude[i]);

  const sampleRate = Math.floor(filteredFreqs.length / 500);
  const sampledFreqs = filteredFreqs.filter((_, i) => i % sampleRate === 0);
  const sampledMag = filteredMag.filter((_, i) => i % sampleRate === 0);

  if (spectrumChart) {
    spectrumChart.destroy();
  }

  spectrumChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sampledFreqs.map(f => Math.round(f)),
      datasets: [{
        label: '频谱',
        data: sampledMag,
        borderColor: 'rgba(124, 58, 237, 0.8)',
        backgroundColor: 'rgba(124, 58, 237, 0.2)',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          title: { display: true, text: '频率 (Hz)', color: '#94a3b8' },
          ticks: { color: '#64748b', maxTicksLimit: 10 },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        y: {
          title: { display: true, text: '幅度', color: '#94a3b8' },
          ticks: { color: '#64748b' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        }
      }
    }
  });
}

async function selectRobustAudio() {
  const filePath = await selectFile([{ name: 'WAV Audio', extensions: ['wav'] }]);
  if (filePath) {
    document.getElementById('robust-audio-path').value = filePath;
  }
}

async function selectRobustImage() {
  const filePath = await selectFile([{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif'] }]);
  if (filePath) {
    document.getElementById('robust-image-path').value = filePath;
  }
}

async function runRobustnessTest() {
  const audioPath = document.getElementById('robust-audio-path').value;
  const imagePath = document.getElementById('robust-image-path').value;
  const resultDiv = document.getElementById('robustness-result');
  const chartContainer = document.getElementById('robustness-chart-container');

  if (!audioPath || !imagePath) {
    showResult(resultDiv, '请填写所有路径！', 'error');
    return;
  }

  showResult(resultDiv, '正在进行鲁棒性测试...（可能需要几分钟）', 'info');
  chartContainer.style.display = 'none';

  try {
    const result = await ipcRenderer.invoke('robustness-test', audioPath, imagePath);
    
    if (result.success) {
      let html = '测试完成！<br><br>';
      result.tests.forEach(test => {
        if (test.extracted) {
          html += `<span style="color: #4ade80;">✓ ${test.bitrate}: PSNR = ${test.psnr.toFixed(2)} dB</span><br>`;
        } else {
          html += `<span style="color: #f87171;">✗ ${test.bitrate}: 提取失败 - ${test.error}</span><br>`;
        }
      });
      
      showResult(resultDiv, html, 'success');
      renderRobustnessChart(result.tests);
      chartContainer.style.display = 'block';
    } else {
      showResult(resultDiv, `测试失败: ${result.error || '未知错误'}`, 'error');
    }
  } catch (err) {
    showResult(resultDiv, `错误: ${err.message}`, 'error');
  }
}

function renderRobustnessChart(tests) {
  const ctx = document.getElementById('robustness-chart').getContext('2d');

  const labels = tests.map(t => t.bitrate);
  const data = tests.map(t => t.extracted ? t.psnr : 0);
  const colors = tests.map(t => t.extracted ? 
    'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)');

  if (robustnessChart) {
    robustnessChart.destroy();
  }

  robustnessChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'PSNR (dB)',
        data: data,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.8', '1')),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          title: { display: true, text: 'MP3 比特率', color: '#94a3b8' },
          ticks: { color: '#64748b' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        y: {
          title: { display: true, text: 'PSNR (dB)', color: '#94a3b8' },
          ticks: { color: '#64748b' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          beginAtZero: true
        }
      }
    }
  });
}

async function loadRecords() {
  try {
    const result = await ipcRenderer.invoke('get-records');
    if (result.success) {
      renderRecords(result.records);
    }
  } catch (err) {
    console.error('加载记录失败:', err);
  }
}

async function searchRecords() {
  const keyword = document.getElementById('record-search').value;
  try {
    const result = await ipcRenderer.invoke('search-records', keyword);
    if (result.success) {
      renderRecords(result.records);
    }
  } catch (err) {
    console.error('搜索记录失败:', err);
  }
}

function renderRecords(records) {
  const tbody = document.getElementById('records-tbody');
  
  if (!records || records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #64748b;">暂无记录</td></tr>';
    return;
  }

  tbody.innerHTML = records.map(record => `
    <tr>
      <td>${record.id}</td>
      <td class="type-${record.operation_type}">${record.operation_type === 'embed' ? '嵌入' : '提取'}</td>
      <td class="filename" title="${record.audio_path}">${path.basename(record.audio_path)}</td>
      <td class="filename" title="${record.image_path || '-'}">${record.image_path ? path.basename(record.image_path) : '-'}</td>
      <td>${formatDate(record.timestamp)}</td>
      <td class="status-${record.success ? 'success' : 'failed'}">${record.success ? '成功' : '失败'}</td>
      <td>
        <button class="btn btn-danger btn-small" onclick="deleteRecord(${record.id})">删除</button>
      </td>
    </tr>
  `).join('');
}

async function deleteRecord(recordId) {
  if (confirm('确定要删除这条记录吗？')) {
    try {
      await ipcRenderer.invoke('delete-record', recordId);
      loadRecords();
    } catch (err) {
      console.error('删除记录失败:', err);
    }
  }
}

function showResult(element, message, type) {
  element.innerHTML = message;
  element.className = `result-message ${type}`;
}

function showImagePreview(elementId, imagePath) {
  const container = document.getElementById(elementId);
  const img = document.createElement('img');
  img.src = `file://${imagePath}`;
  container.innerHTML = '';
  container.appendChild(img);
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
