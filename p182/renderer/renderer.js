const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tabId + '-tab').classList.add('active');
  });
});

const dropZone = document.getElementById('dropZone');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const bitrateControl = document.getElementById('bitrateControl');
const bitrateSlider = document.getElementById('bitrateSlider');
const bitrateValue = document.getElementById('bitrateValue');
const bitrateLabel = document.getElementById('bitrateLabel');
const processBtn = document.getElementById('processBtn');
const progress = document.getElementById('progress');
const errorMessage = document.getElementById('errorMessage');
const singleResults = document.getElementById('singleResults');

let currentFileData = null;

dropZone.addEventListener('click', async () => {
  const result = await window.audioAPI.selectWavFile();
  if (result) {
    handleFile(result);
  }
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.type === 'audio/wav' || file.name.toLowerCase().endsWith('.wav')) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const arrayBuffer = event.target.result;
        const byteArray = Array.from(new Uint8Array(arrayBuffer));
        handleFile({
          name: file.name,
          size: file.size,
          data: byteArray
        });
      };
      reader.readAsArrayBuffer(file);
    } else {
      showError('请上传WAV格式的音频文件');
    }
  }
});

function handleFile(fileData) {
  currentFileData = fileData;

  fileName.textContent = fileData.name;
  fileSize.textContent = (fileData.size / 1024).toFixed(2);

  fileInfo.classList.add('show');
  bitrateControl.style.display = 'block';
  processBtn.disabled = false;
  errorMessage.classList.remove('show');
  singleResults.classList.remove('show');
}

bitrateSlider.addEventListener('input', () => {
  const value = bitrateSlider.value;
  bitrateValue.textContent = value;
  bitrateLabel.textContent = value;
});

processBtn.addEventListener('click', async () => {
  if (!currentFileData) return;

  processBtn.disabled = true;
  progress.classList.add('show');
  errorMessage.classList.remove('show');
  singleResults.classList.remove('show');

  try {
    const bitrate = parseInt(bitrateSlider.value) * 1000;
    const result = await window.audioAPI.processAudio(currentFileData.data, bitrate);

    if (result.success) {
      displaySingleResults(result, currentFileData);
    } else {
      showError(result.error || '处理音频时发生错误');
    }
  } catch (error) {
    showError('处理音频时发生错误: ' + error.message);
  } finally {
    processBtn.disabled = false;
    progress.classList.remove('show');
  }
});

function displaySingleResults(result, originalFileData) {
  document.getElementById('singleMosValue').textContent = result.mos.score;
  document.getElementById('singleMosQuality').textContent = result.mos.quality;
  document.getElementById('singleMosConfidence').textContent = '置信度：' + result.mos.confidence;

  if (result.mos.pesq) {
    document.getElementById('singlePesqDetails').textContent = 
      `PESQ: ${result.mos.pesq.score} | D: ${result.mos.pesq.d} | A: ${result.mos.pesq.a} | 活跃帧: ${result.mos.pesq.activeFrames}`;
    document.getElementById('singlePesqScore').textContent = result.mos.pesq.score;
    document.getElementById('singlePesqD').textContent = result.mos.pesq.d;
    document.getElementById('singlePesqA').textContent = result.mos.pesq.a;
  }

  document.getElementById('singleCompressionRatio').textContent = result.compressionRatio + '%';
  document.getElementById('singleOriginalSize').textContent = (result.originalSize / 1024).toFixed(2) + ' KB';
  document.getElementById('singleCompressedSize').textContent = (result.compressedSize / 1024).toFixed(2) + ' KB';
  document.getElementById('singleSegSNR').textContent = result.mos.metrics.segmentalSNR;
  document.getElementById('singleLsd').textContent = result.mos.metrics.lsd;
  document.getElementById('singleGlobalSNR').textContent = result.mos.metrics.globalSNR;

  const originalBlob = new Blob([new Uint8Array(originalFileData.data)], { type: 'audio/wav' });
  const originalUrl = URL.createObjectURL(originalBlob);
  document.getElementById('singleOriginalAudio').src = originalUrl;
  document.getElementById('singleOriginalInfo').textContent = 
    `${result.sampleRate} Hz · ${result.numChannels} 声道 · ${(result.originalSize / 1024).toFixed(2)} KB`;

  const processedBlob = new Blob([new Uint8Array(result.processedData)], { type: 'audio/wav' });
  const processedUrl = URL.createObjectURL(processedBlob);
  document.getElementById('singleProcessedAudio').src = processedUrl;
  document.getElementById('singleProcessedInfo').textContent = 
    `${result.sampleRate} Hz · ${result.numChannels} 声道 · ${(result.bitrate / 1000).toFixed(0)} kbps`;

  singleResults.classList.add('show');
  singleResults.scrollIntoView({ behavior: 'smooth' });
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add('show');
}

const multiDropZone = document.getElementById('multiDropZone');
const multiFileInfo = document.getElementById('multiFileInfo');
const multiFileName = document.getElementById('multiFileName');
const multiFileSize = document.getElementById('multiFileSize');
const multiBitrateControl = document.getElementById('multiBitrateControl');
const multiProcessBtn = document.getElementById('multiProcessBtn');
const multiProgress = document.getElementById('multiProgress');
const multiErrorMessage = document.getElementById('multiErrorMessage');
const multiResults = document.getElementById('multiResults');
const bitrateCheckboxes = document.querySelectorAll('#bitrateCheckboxes .bitrate-checkbox');

let multiFileData = null;

bitrateCheckboxes.forEach(checkbox => {
  checkbox.addEventListener('click', (e) => {
    const input = checkbox.querySelector('input');
    if (e.target !== input) {
      input.checked = !input.checked;
    }
    checkbox.classList.toggle('checked', input.checked);
  });
});

multiDropZone.addEventListener('click', async () => {
  const result = await window.audioAPI.selectWavFile();
  if (result) {
    handleMultiFile(result);
  }
});

multiDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  multiDropZone.classList.add('dragover');
});

multiDropZone.addEventListener('dragleave', () => {
  multiDropZone.classList.remove('dragover');
});

multiDropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  multiDropZone.classList.remove('dragover');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.type === 'audio/wav' || file.name.toLowerCase().endsWith('.wav')) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const arrayBuffer = event.target.result;
        const byteArray = Array.from(new Uint8Array(arrayBuffer));
        handleMultiFile({
          name: file.name,
          size: file.size,
          data: byteArray
        });
      };
      reader.readAsArrayBuffer(file);
    } else {
      showMultiError('请上传WAV格式的音频文件');
    }
  }
});

function handleMultiFile(fileData) {
  multiFileData = fileData;

  multiFileName.textContent = fileData.name;
  multiFileSize.textContent = (fileData.size / 1024).toFixed(2);

  multiFileInfo.classList.add('show');
  multiBitrateControl.style.display = 'block';
  multiProcessBtn.disabled = false;
  multiErrorMessage.classList.remove('show');
  multiResults.classList.remove('show');
}

multiProcessBtn.addEventListener('click', async () => {
  if (!multiFileData) return;

  const selectedBitrates = [];
  bitrateCheckboxes.forEach(cb => {
    const input = cb.querySelector('input');
    if (input.checked) {
      selectedBitrates.push(parseInt(input.value));
    }
  });

  if (selectedBitrates.length === 0) {
    showMultiError('请至少选择一个码率进行对比');
    return;
  }

  multiProcessBtn.disabled = true;
  multiProgress.classList.add('show');
  multiErrorMessage.classList.remove('show');
  multiResults.classList.remove('show');

  try {
    const result = await window.audioAPI.processAudioMultiBitrate(multiFileData.data, selectedBitrates);

    if (result.success) {
      displayMultiResults(result, multiFileData);
    } else {
      showMultiError(result.error || '处理音频时发生错误');
    }
  } catch (error) {
    showMultiError('处理音频时发生错误: ' + error.message);
  } finally {
    multiProcessBtn.disabled = false;
    multiProgress.classList.remove('show');
  }
});

function displayMultiResults(result, originalFileData) {
  document.getElementById('multiOriginalSize').textContent = (result.originalSize / 1024).toFixed(2) + ' KB';
  document.getElementById('multiSampleRate').textContent = result.sampleRate + ' Hz';
  document.getElementById('multiChannels').textContent = result.numChannels + ' 声道';

  const container = document.getElementById('multiResultsContainer');
  container.innerHTML = '';

  const originalBlob = new Blob([new Uint8Array(originalFileData.data)], { type: 'audio/wav' });
  const originalUrl = URL.createObjectURL(originalBlob);

  result.results.sort((a, b) => a.bitrate - b.bitrate);

  result.results.forEach((brResult, index) => {
    const card = document.createElement('div');
    card.className = 'bitrate-result-card';
    card.innerHTML = `
      <h3>📊 ${(brResult.bitrate / 1000).toFixed(0)} kbps</h3>
      
      <div class="mos-mini">
        <div class="mos-mini-score">${brResult.mos.score}</div>
        <div style="font-size: 0.95rem; opacity: 0.95;">${brResult.mos.quality}</div>
      </div>

      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">${brResult.compressionRatio}%</div>
          <div class="metric-label">压缩率</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${(brResult.compressedSize / 1024).toFixed(2)} KB</div>
          <div class="metric-label">压缩后大小</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${brResult.mos.pesq ? brResult.mos.pesq.score : '-'}</div>
          <div class="metric-label">PESQ评分</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${brResult.mos.metrics.segmentalSNR}</div>
          <div class="metric-label">分段SNR (dB)</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${brResult.mos.metrics.lsd}</div>
          <div class="metric-label">对数谱距离</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${brResult.mos.metrics.globalSNR}</div>
          <div class="metric-label">全局SNR (dB)</div>
        </div>
      </div>

      <div class="audio-comparison">
        <div class="audio-player">
          <h3>🔊 原始音频</h3>
          <audio controls src="${originalUrl}"></audio>
          <div class="audio-info">${result.sampleRate} Hz · ${result.numChannels} 声道</div>
        </div>
        <div class="audio-player">
          <h3>🎶 ${(brResult.bitrate / 1000).toFixed(0)} kbps 压缩后</h3>
          <audio id="multi-audio-${index}" controls></audio>
          <div class="audio-info">${(brResult.bitrate / 1000).toFixed(0)} kbps · 压缩率 ${brResult.compressionRatio}%</div>
        </div>
      </div>
    `;
    container.appendChild(card);

    const processedBlob = new Blob([new Uint8Array(brResult.processedData)], { type: 'audio/wav' });
    const processedUrl = URL.createObjectURL(processedBlob);
    document.getElementById(`multi-audio-${index}`).src = processedUrl;
  });

  multiResults.classList.add('show');
  multiResults.scrollIntoView({ behavior: 'smooth' });
}

function showMultiError(message) {
  multiErrorMessage.textContent = message;
  multiErrorMessage.classList.add('show');
}

const liveBitrateSlider = document.getElementById('liveBitrateSlider');
const liveBitrateValue = document.getElementById('liveBitrateValue');
const liveBitrateLabel = document.getElementById('liveBitrateLabel');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const playOriginalBtn = document.getElementById('playOriginalBtn');
const playProcessedBtn = document.getElementById('playProcessedBtn');
const recordingStatus = document.getElementById('recordingStatus');
const statusText = document.getElementById('statusText');
const liveErrorMessage = document.getElementById('liveErrorMessage');
const waveformCanvas = document.getElementById('waveformCanvas');

let isRecording = false;
let mediaRecorder = null;
let audioContext = null;
let analyser = null;
let mediaStreamSource = null;
let scriptProcessor = null;
let recordingStartTime = 0;
let frameCount = 0;
let totalSamples = 0;
let recordedSamples = [];
let processedSamples = [];
let liveMosHistory = [];
let livePesqHistory = [];
let animationId = null;

const SAMPLE_RATE = 48000;
const NUM_CHANNELS = 1;
const FRAME_SIZE_MS = 7.5;
const FRAME_SIZE = Math.floor(SAMPLE_RATE * FRAME_SIZE_MS / 1000);

liveBitrateSlider.addEventListener('input', () => {
  const value = liveBitrateSlider.value;
  liveBitrateValue.textContent = value;
  liveBitrateLabel.textContent = value;
});

function initWaveformCanvas() {
  const canvas = waveformCanvas;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  const ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  return ctx;
}

function drawWaveform(ctx, dataArray) {
  const rect = waveformCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, width, height);

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#667eea';
  ctx.beginPath();

  const sliceWidth = width / dataArray.length;
  let x = 0;

  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i];
    const y = (v + 1) * height / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  ctx.lineTo(width, height / 2);
  ctx.stroke();
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: NUM_CHANNELS,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      } 
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: SAMPLE_RATE
    });

    mediaStreamSource = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    mediaStreamSource.connect(analyser);

    const bufferSize = FRAME_SIZE * 4;
    scriptProcessor = audioContext.createScriptProcessor(bufferSize, NUM_CHANNELS, NUM_CHANNELS);
    
    let frameBuffer = new Float32Array(FRAME_SIZE);
    let bufferOffset = 0;

    scriptProcessor.onaudioprocess = async (e) => {
      if (!isRecording) return;

      const inputData = e.inputBuffer.getChannelData(0);
      
      for (let i = 0; i < inputData.length; i++) {
        const sample = inputData[i];
        recordedSamples.push(sample);
        
        frameBuffer[bufferOffset] = sample;
        bufferOffset++;
        
        if (bufferOffset >= FRAME_SIZE) {
          totalSamples += FRAME_SIZE;
          frameCount++;
          
          try {
            const chunkData = [Array.from(frameBuffer)];
            const bitrate = parseInt(liveBitrateSlider.value) * 1000;
            const result = await window.audioAPI.processAudioChunk(
              chunkData, SAMPLE_RATE, bitrate, NUM_CHANNELS
            );
            
            if (result.success) {
              const decodedSamples = result.decodedData[0];
              for (let j = 0; j < decodedSamples.length; j++) {
                processedSamples.push(decodedSamples[j]);
              }
              
              if (result.mos && result.mos.score) {
                liveMosHistory.push(parseFloat(result.mos.score));
                if (liveMosHistory.length > 10) {
                  liveMosHistory.shift();
                }
                
                if (result.mos.pesq && result.mos.pesq.score) {
                  livePesqHistory.push(parseFloat(result.mos.pesq.score));
                  if (livePesqHistory.length > 10) {
                    livePesqHistory.shift();
                  }
                }
              }
            }
          } catch (err) {
            console.error('处理音频帧时出错:', err);
          }
          
          bufferOffset = 0;
          frameBuffer = new Float32Array(FRAME_SIZE);
        }
      }
      
      updateLiveMetrics();
    };

    mediaStreamSource.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    recordedSamples = [];
    processedSamples = [];
    liveMosHistory = [];
    livePesqHistory = [];
    frameCount = 0;
    totalSamples = 0;
    recordingStartTime = Date.now();
    isRecording = true;

    recordingStatus.classList.add('recording');
    statusText.textContent = '🔴 正在录制...';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    playOriginalBtn.disabled = true;
    playProcessedBtn.disabled = true;
    liveErrorMessage.classList.remove('show');

    startWaveformAnimation();

    updateDuration();

  } catch (error) {
    showLiveError('无法访问麦克风: ' + error.message);
  }
}

function updateDuration() {
  if (!isRecording) return;
  const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
  document.getElementById('liveDuration').textContent = duration + 's';
  requestAnimationFrame(updateDuration);
}

function updateLiveMetrics() {
  document.getElementById('liveFrames').textContent = frameCount;
  
  if (liveMosHistory.length > 0) {
    const avgMos = liveMosHistory.reduce((a, b) => a + b, 0) / liveMosHistory.length;
    document.getElementById('liveMos').textContent = avgMos.toFixed(2);
  }
  
  if (livePesqHistory.length > 0) {
    const avgPesq = livePesqHistory.reduce((a, b) => a + b, 0) / livePesqHistory.length;
    document.getElementById('livePesq').textContent = avgPesq.toFixed(2);
  }
}

function startWaveformAnimation() {
  const ctx = initWaveformCanvas();
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function animate() {
    if (!isRecording) return;
    
    animationId = requestAnimationFrame(animate);
    analyser.getByteTimeDomainData(dataArray);
    
    const floatData = new Float32Array(dataArray.length);
    for (let i = 0; i < dataArray.length; i++) {
      floatData[i] = (dataArray[i] - 128) / 128;
    }
    
    drawWaveform(ctx, floatData);
  }
  
  animate();
}

function stopRecording() {
  isRecording = false;
  
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  
  if (scriptProcessor) {
    scriptProcessor.disconnect();
  }
  if (mediaStreamSource) {
    mediaStreamSource.disconnect();
  }
  if (analyser) {
    analyser.disconnect();
  }
  if (audioContext) {
    audioContext.close();
  }
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  
  recordingStatus.classList.remove('recording');
  statusText.textContent = '录制完成，可播放对比';
  startBtn.disabled = false;
  stopBtn.disabled = true;
  playOriginalBtn.disabled = recordedSamples.length === 0;
  playProcessedBtn.disabled = processedSamples.length === 0;
}

function audioBufferToWav(buffer, sampleRate, numChannels) {
  const length = buffer.length * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  
  const channels = numChannels;
  const bytesPerSample = 2;
  const byteRate = sampleRate * channels * bytesPerSample;
  const blockAlign = channels * bytesPerSample;
  
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + buffer.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, buffer.length * 2, true);
  
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    const sample = Math.max(-1, Math.min(1, buffer[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

playOriginalBtn.addEventListener('click', () => {
  if (recordedSamples.length === 0) return;
  
  const wavBlob = audioBufferToWav(new Float32Array(recordedSamples), SAMPLE_RATE, NUM_CHANNELS);
  const url = URL.createObjectURL(wavBlob);
  
  const audio = new Audio(url);
  audio.play();
});

playProcessedBtn.addEventListener('click', () => {
  if (processedSamples.length === 0) return;
  
  const minLen = Math.min(recordedSamples.length, processedSamples.length);
  const alignedProcessed = processedSamples.slice(0, minLen);
  
  const wavBlob = audioBufferToWav(new Float32Array(alignedProcessed), SAMPLE_RATE, NUM_CHANNELS);
  const url = URL.createObjectURL(wavBlob);
  
  const audio = new Audio(url);
  audio.play();
});

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

function showLiveError(message) {
  liveErrorMessage.textContent = message;
  liveErrorMessage.classList.add('show');
}

window.addEventListener('resize', () => {
  if (isRecording && analyser) {
    initWaveformCanvas();
  }
});
