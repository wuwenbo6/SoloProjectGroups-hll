const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

let DeepSpeech;
try {
  DeepSpeech = require('deepspeech');
} catch (e) {
  console.warn('DeepSpeech module not available:', e.message);
}

let model = null;
let currentLanguage = 'english';
let isRecording = false;
let mediaRecorder = null;
let audioContext = null;
let analyser = null;
let animationId = null;
let recordingStartTime = null;
let recordingTimer = null;
let audioChunks = [];
let subtitles = [];
let currentTranscript = '';
let stream = null;
let recognitionInterval = null;
let deepspeechStream = null;
let lastPartialResult = '';
let partialResultStableCount = 0;
const PARTIAL_RESULT_THRESHOLD = 3;
let accumulatedAudio = [];
let silenceTimer = null;
let lastAudioLevel = 0;
let isSpeaking = false;
let sentenceStartTime = 0;

const SAMPLE_RATE = 16000;
const SILENCE_THRESHOLD = 0.015;
const SILENCE_DURATION = 1500;

const elements = {
  langEn: document.getElementById('lang-en'),
  langZh: document.getElementById('lang-zh'),
  modelPath: document.getElementById('modelPath'),
  scorerPath: document.getElementById('scorerPath'),
  selectModelBtn: document.getElementById('selectModelBtn'),
  selectScorerBtn: document.getElementById('selectScorerBtn'),
  loadModelBtn: document.getElementById('loadModelBtn'),
  modelStatus: document.getElementById('modelStatus'),
  waveformCanvas: document.getElementById('waveformCanvas'),
  audioStatus: document.getElementById('audioStatus'),
  recordingTime: document.getElementById('recordingTime'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  clearBtn: document.getElementById('clearBtn'),
  saveBtn: document.getElementById('saveBtn'),
  transcriptDisplay: document.getElementById('transcriptDisplay'),
  subtitleList: document.getElementById('subtitleList'),
  hotwordsInput: document.getElementById('hotwordsInput'),
  applyHotwordsBtn: document.getElementById('applyHotwordsBtn'),
  clearHotwordsBtn: document.getElementById('clearHotwordsBtn'),
  hotwordsStatus: document.getElementById('hotwordsStatus')
};

let hotwords = [];
let editingSubtitleIndex = null;
let audioLevelHistory = [];

function initCanvas() {
  const canvas = elements.waveformCanvas;
  canvas.width = canvas.offsetWidth * 2;
  canvas.height = canvas.offsetHeight * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  drawEmptyWaveform(ctx, canvas.offsetWidth, canvas.offsetHeight);
}

function drawEmptyWaveform(ctx, width, height) {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#3a3a5e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
}

function drawWaveform() {
  const canvas = elements.waveformCanvas;
  const ctx = canvas.getContext('2d');
  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(dataArray);

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#667eea';
  ctx.beginPath();

  const sliceWidth = width / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * height) / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  ctx.lineTo(width, height / 2);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(102, 126, 234, 0.3)');
  gradient.addColorStop(1, 'rgba(118, 75, 162, 0.3)');
  
  ctx.fillStyle = gradient;
  ctx.lineTo(x, height / 2);
  ctx.lineTo(0, height / 2);
  ctx.fill();

  if (isRecording) {
    animationId = requestAnimationFrame(drawWaveform);
  }
}

function updateModelStatus(status, type = '') {
  elements.modelStatus.textContent = status;
  elements.modelStatus.className = 'status-text ' + type;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatSRTTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

function generateSRT() {
  let srt = '';
  subtitles.forEach((sub, index) => {
    srt += `${index + 1}\n`;
    srt += `${formatSRTTime(sub.start)} --> ${formatSRTTime(sub.end)}\n`;
    srt += `${sub.text}\n\n`;
  });
  return srt;
}

function updateSubtitleList() {
  if (subtitles.length === 0) {
    elements.subtitleList.innerHTML = '<p class="placeholder">暂无字幕条目</p>';
    return;
  }

  elements.subtitleList.innerHTML = subtitles.map((sub, index) => {
    const isEditing = editingSubtitleIndex === index;
    
    if (isEditing) {
      return `
        <div class="subtitle-item editing" data-index="${index}">
          <button class="subtitle-delete-btn" onclick="deleteSubtitle(${index})" title="删除">×</button>
          <div class="subtitle-time">
            <span class="time-label">#${index + 1}</span>
            <div class="time-inputs">
              <input type="text" id="start-${index}" value="${formatSRTTime(sub.start)}" 
                     onchange="updateSubtitleTime(${index}, 'start', this.value)">
              <span>--></span>
              <input type="text" id="end-${index}" value="${formatSRTTime(sub.end)}"
                     onchange="updateSubtitleTime(${index}, 'end', this.value)">
            </div>
          </div>
          <div class="subtitle-text">
            <textarea id="text-${index}">${sub.text}</textarea>
          </div>
          <div class="subtitle-actions">
            <button class="btn-delete-sub" onclick="deleteSubtitle(${index})">删除</button>
            <button class="btn-cancel-sub" onclick="cancelEditSubtitle()">取消</button>
            <button class="btn-save-sub" onclick="saveEditSubtitle(${index})">保存</button>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="subtitle-item" data-index="${index}" ondblclick="startEditSubtitle(${index})">
          <button class="subtitle-delete-btn" onclick="event.stopPropagation(); deleteSubtitle(${index})" title="删除">×</button>
          <div class="subtitle-time" onclick="event.stopPropagation(); startEditSubtitle(${index})">
            <span class="time-label">#${index + 1}</span>
            ${formatSRTTime(sub.start)} --> ${formatSRTTime(sub.end)}
          </div>
          <div class="subtitle-text">${sub.text}</div>
        </div>
      `;
    }
  }).join('');
}

window.startEditSubtitle = function(index) {
  if (editingSubtitleIndex !== null && editingSubtitleIndex !== index) {
    if (!confirm('当前有正在编辑的字幕，是否放弃更改？')) {
      return;
    }
  }
  editingSubtitleIndex = index;
  updateSubtitleList();
  setTimeout(() => {
    const textarea = document.getElementById(`text-${index}`);
    if (textarea) {
      textarea.focus();
      textarea.select();
    }
  }, 50);
};

window.cancelEditSubtitle = function() {
  editingSubtitleIndex = null;
  updateSubtitleList();
};

window.saveEditSubtitle = function(index) {
  const textarea = document.getElementById(`text-${index}`);
  if (textarea) {
    subtitles[index].text = textarea.value.trim();
  }
  editingSubtitleIndex = null;
  updateSubtitleList();
  updateTranscriptDisplay();
};

window.deleteSubtitle = function(index) {
  if (confirm('确定要删除这条字幕吗？')) {
    subtitles.splice(index, 1);
    if (editingSubtitleIndex === index) {
      editingSubtitleIndex = null;
    } else if (editingSubtitleIndex > index) {
      editingSubtitleIndex--;
    }
    updateSubtitleList();
    updateTranscriptDisplay();
  }
};

window.updateSubtitleTime = function(index, field, value) {
  const seconds = parseSRTTime(value);
  if (!isNaN(seconds)) {
    subtitles[index][field] = seconds;
  }
};

function parseSRTTime(timeStr) {
  try {
    const parts = timeStr.split(':');
    if (parts.length !== 3) return NaN;
    
    const secParts = parts[2].split(',');
    if (secParts.length !== 2) return NaN;
    
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1], 10);
    const secs = parseInt(secParts[0], 10);
    const ms = parseInt(secParts[1], 10);
    
    if (isNaN(hours) || isNaN(mins) || isNaN(secs) || isNaN(ms)) return NaN;
    
    return hours * 3600 + mins * 60 + secs + ms / 1000;
  } catch {
    return NaN;
  }
}

function autoAlignTimestamps() {
  if (subtitles.length < 2) return;
  
  for (let i = 1; i < subtitles.length; i++) {
    const prevEnd = subtitles[i - 1].end;
    const currStart = subtitles[i].start;
    
    if (currStart < prevEnd) {
      const overlap = prevEnd - currStart;
      subtitles[i].start = prevEnd;
      subtitles[i].end = Math.max(subtitles[i].end + overlap, prevEnd + 0.5);
    }
    
    if (currStart - prevEnd > 2) {
      subtitles[i].start = prevEnd + 0.1;
    }
  }
  
  updateSubtitleList();
}

function updateTranscriptDisplay() {
  if (!currentTranscript && subtitles.length === 0) {
    elements.transcriptDisplay.innerHTML = '<p class="placeholder">识别的文本将显示在这里...</p>';
    return;
  }

  const fullText = subtitles.map(s => s.text).join(' ') + (currentTranscript ? ' ' + currentTranscript : '');
  elements.transcriptDisplay.innerHTML = `<p class="text">${fullText}</p>`;
}

function parseHotwords(text) {
  const lines = text.trim().split('\n');
  const parsed = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const parts = line.split(',');
    const word = parts[0].trim();
    const boost = parts[1] ? parseFloat(parts[1].trim()) : 1.5;
    
    if (word) {
      parsed.push({ word, boost: isNaN(boost) ? 1.5 : boost });
    }
  }
  
  return parsed;
}

function applyHotwords() {
  if (!model) {
    alert('请先加载模型');
    return;
  }

  const hotwordsText = elements.hotwordsInput.value;
  hotwords = parseHotwords(hotwordsText);
  
  if (hotwords.length === 0) {
    elements.hotwordsStatus.textContent = '未设置热词';
    elements.hotwordsStatus.className = 'status-text';
    return;
  }

  try {
    for (const hw of hotwords) {
      if (typeof model.addHotWord === 'function') {
        model.addHotWord(hw.word, hw.boost);
      }
    }
    
    elements.hotwordsStatus.textContent = `已应用 ${hotwords.length} 个热词`;
    elements.hotwordsStatus.className = 'status-text loaded';
  } catch (error) {
    console.error('应用热词失败:', error);
    elements.hotwordsStatus.textContent = '热词应用失败: ' + error.message;
    elements.hotwordsStatus.className = 'status-text error';
  }
}

function clearHotwords() {
  elements.hotwordsInput.value = '';
  hotwords = [];
  
  if (model && typeof model.clearHotWords === 'function') {
    try {
      model.clearHotWords();
    } catch (e) {
      console.warn('清除热词失败:', e);
    }
  }
  
  elements.hotwordsStatus.textContent = '未设置热词';
  elements.hotwordsStatus.className = 'status-text';
}

function freeModel() {
  if (deepspeechStream) {
    try {
      deepspeechStream.finishStream();
    } catch (e) {
      console.warn('Error finishing stream:', e);
    }
    deepspeechStream = null;
  }
  
  if (model) {
    try {
      if (typeof model.freeModel === 'function') {
        model.freeModel();
      } else if (typeof model._freeModel === 'function') {
        model._freeModel();
      }
    } catch (e) {
      console.warn('Error freeing model:', e);
    }
    model = null;
  }
  
  updateModelStatus('模型未加载', '');
  elements.startBtn.disabled = true;
  elements.saveBtn.disabled = true;
  elements.applyHotwordsBtn.disabled = true;
}

async function loadModel() {
  const modelPath = elements.modelPath.value;
  const scorerPath = elements.scorerPath.value;

  if (!modelPath) {
    alert('请先选择模型文件');
    return;
  }

  if (!DeepSpeech) {
    alert('DeepSpeech模块未安装，请先运行 npm install');
    return;
  }

  if (isRecording) {
    stopRecording();
  }

  freeModel();

  updateModelStatus('正在加载模型...', 'loading');
  elements.loadModelBtn.disabled = true;

  try {
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          model = new DeepSpeech.Model(modelPath);
          if (scorerPath) {
            model.enableExternalScorer(scorerPath);
          }
          resolve();
        } catch (e) {
          reject(e);
        }
      }, 100);
    });

    updateModelStatus('模型已加载 ✓', 'loaded');
    elements.startBtn.disabled = false;
    elements.saveBtn.disabled = false;
    elements.applyHotwordsBtn.disabled = false;
    
    if (elements.hotwordsInput.value.trim()) {
      applyHotwords();
    }
  } catch (error) {
    console.error('模型加载失败:', error);
    updateModelStatus('模型加载失败: ' + error.message, 'error');
    elements.startBtn.disabled = true;
    elements.saveBtn.disabled = true;
  } finally {
    elements.loadModelBtn.disabled = false;
  }
}

function audioBufferToInt16(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const int16Data = new Int16Array(channelData.length);
  
  for (let i = 0; i < channelData.length; i++) {
    let s = Math.max(-1, Math.min(1, channelData[i]));
    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  return int16Data;
}

async function resampleAudio(audioBuffer, targetSampleRate) {
  const offlineContext = new OfflineAudioContext(
    1,
    audioBuffer.duration * targetSampleRate,
    targetSampleRate
  );
  
  const bufferSource = offlineContext.createBufferSource();
  bufferSource.buffer = audioBuffer;
  bufferSource.connect(offlineContext.destination);
  bufferSource.start();
  
  return offlineContext.startRendering();
}

function calculateAudioLevel(int16Data) {
  let sum = 0;
  for (let i = 0; i < int16Data.length; i++) {
    sum += Math.abs(int16Data[i]);
  }
  return sum / int16Data.length / 32768.0;
}

function resetSilenceTimer() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

function startSilenceTimer() {
  resetSilenceTimer();
  silenceTimer = setTimeout(() => {
    if (isSpeaking && deepspeechStream) {
      finalizeSentence();
    }
  }, SILENCE_DURATION);
}

function finalizeSentence() {
  if (!deepspeechStream || !model) return;
  
  try {
    const finalResult = deepspeechStream.finishStream();
    deepspeechStream = null;
    
    if (finalResult && finalResult.trim().length > 0) {
      const endTime = (Date.now() - recordingStartTime) / 1000;
      
      subtitles.push({
        start: sentenceStartTime,
        end: endTime,
        text: finalResult.trim()
      });
      
      autoAlignTimestamps();
      
      currentTranscript = '';
      lastPartialResult = '';
      partialResultStableCount = 0;
      
      updateSubtitleList();
      updateTranscriptDisplay();
    }
    
    isSpeaking = false;
    resetSilenceTimer();
    
    deepspeechStream = model.createStream();
    sentenceStartTime = (Date.now() - recordingStartTime) / 1000;
  } catch (error) {
    console.error('Finalize sentence error:', error);
  }
}

function smoothResult(newResult) {
  if (newResult === lastPartialResult) {
    partialResultStableCount++;
  } else {
    partialResultStableCount = 0;
    lastPartialResult = newResult;
  }
  
  if (partialResultStableCount >= PARTIAL_RESULT_THRESHOLD) {
    return newResult;
  }
  
  return currentTranscript;
}

async function processAudioChunk(blob) {
  if (!model) return;

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const tempAudioContext = new AudioContext({ sampleRate: 44100 });
    const audioBuffer = await tempAudioContext.decodeAudioData(arrayBuffer);
    
    const resampledBuffer = await resampleAudio(audioBuffer, SAMPLE_RATE);
    const int16Data = audioBufferToInt16(resampledBuffer);
    
    const audioLevel = calculateAudioLevel(int16Data);
    lastAudioLevel = audioLevel;
    
    if (!deepspeechStream) {
      deepspeechStream = model.createStream();
      sentenceStartTime = (Date.now() - recordingStartTime) / 1000;
    }
    
    deepspeechStream.feedAudioContent(int16Data);
    
    if (audioLevel > SILENCE_THRESHOLD) {
      isSpeaking = true;
      startSilenceTimer();
      
      const partialResult = deepspeechStream.intermediateDecode();
      if (partialResult && partialResult.trim().length > 0) {
        const smoothedResult = smoothResult(partialResult.trim());
        if (smoothedResult !== currentTranscript) {
          currentTranscript = smoothedResult;
          updateTranscriptDisplay();
        }
      }
    } else if (isSpeaking) {
      startSilenceTimer();
    }
    
    tempAudioContext.close();
  } catch (error) {
    console.error('音频处理错误:', error);
  }
}

async function startRecording() {
  try {
    deepspeechStream = null;
    lastPartialResult = '';
    partialResultStableCount = 0;
    accumulatedAudio = [];
    isSpeaking = false;
    currentTranscript = '';
    
    resetSilenceTimer();

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
        processAudioChunk(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      resetSilenceTimer();
      
      if (deepspeechStream && model) {
        try {
          const finalResult = deepspeechStream.finishStream();
          if (finalResult && finalResult.trim().length > 0) {
            const endTime = (Date.now() - recordingStartTime) / 1000;
            
            subtitles.push({
              start: sentenceStartTime,
              end: endTime,
              text: finalResult.trim()
            });
            
            updateSubtitleList();
          }
        } catch (e) {
          console.error('Final stream decode error:', e);
        }
        deepspeechStream = null;
      }
      
      currentTranscript = '';
      updateTranscriptDisplay();
    };

    mediaRecorder.start(500);
    
    isRecording = true;
    recordingStartTime = Date.now();
    sentenceStartTime = 0;
    
    elements.startBtn.disabled = true;
    elements.startBtn.classList.add('recording');
    elements.stopBtn.disabled = false;
    elements.audioStatus.textContent = '正在录音...';
    
    recordingTimer = setInterval(() => {
      const elapsed = (Date.now() - recordingStartTime) / 1000;
      elements.recordingTime.textContent = formatTime(elapsed);
    }, 1000);

    drawWaveform();
  } catch (error) {
    console.error('启动录音失败:', error);
    alert('无法访问麦克风: ' + error.message);
  }
}

function stopRecording() {
  isRecording = false;

  resetSilenceTimer();

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }

  if (deepspeechStream) {
    try {
      deepspeechStream.finishStream();
    } catch (e) {
      console.warn('Error finishing stream on stop:', e);
    }
    deepspeechStream = null;
  }

  elements.startBtn.disabled = false;
  elements.startBtn.classList.remove('recording');
  elements.stopBtn.disabled = true;
  elements.audioStatus.textContent = '录音已停止';

  initCanvas();
}

function clearAll() {
  if (editingSubtitleIndex !== null) {
    if (!confirm('当前有正在编辑的字幕，确定要清空吗？')) {
      return;
    }
  }
  
  subtitles = [];
  currentTranscript = '';
  editingSubtitleIndex = null;
  audioLevelHistory = [];
  elements.recordingTime.textContent = '00:00';
  updateSubtitleList();
  updateTranscriptDisplay();
}

async function saveSRT() {
  if (subtitles.length === 0) {
    alert('没有可保存的字幕');
    return;
  }

  const srtContent = generateSRT();
  const result = await ipcRenderer.invoke('save-srt', srtContent, currentLanguage);
  
  if (result.success) {
    alert(`字幕已保存到: ${result.path}`);
  } else if (!result.cancelled) {
    alert('保存失败: ' + result.error);
  }
}

function switchLanguage(lang) {
  if (currentLanguage === lang) return;
  
  if (isRecording) {
    stopRecording();
  }
  
  currentLanguage = lang;
  
  elements.langEn.classList.toggle('active', lang === 'english');
  elements.langZh.classList.toggle('active', lang === 'chinese');
  
  elements.modelPath.value = '';
  elements.scorerPath.value = '';
  
  freeModel();
  
  lastPartialResult = '';
  partialResultStableCount = 0;
  accumulatedAudio = [];
}

elements.langEn.addEventListener('click', () => switchLanguage('english'));
elements.langZh.addEventListener('click', () => switchLanguage('chinese'));

elements.selectModelBtn.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('select-model-path', currentLanguage);
  if (result.success) {
    elements.modelPath.value = result.path;
  }
});

elements.selectScorerBtn.addEventListener('click', async () => {
  const result = await ipcRenderer.invoke('select-scorer-path', currentLanguage);
  if (result.success) {
    elements.scorerPath.value = result.path;
  }
});

elements.loadModelBtn.addEventListener('click', loadModel);
elements.startBtn.addEventListener('click', startRecording);
elements.stopBtn.addEventListener('click', stopRecording);
elements.clearBtn.addEventListener('click', clearAll);
elements.saveBtn.addEventListener('click', saveSRT);
elements.applyHotwordsBtn.addEventListener('click', applyHotwords);
elements.clearHotwordsBtn.addEventListener('click', clearHotwords);

window.addEventListener('resize', () => {
  if (!isRecording) {
    initCanvas();
  }
});

initCanvas();
