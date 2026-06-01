class SpectrumRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.spectrumData = null;
    this.animationId = null;
    this.smoothing = 0.7;
    this.smoothedData = null;
    
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.displayWidth = rect.width;
    this.displayHeight = rect.height;
  }

  updateData(spectrum) {
    this.spectrumData = spectrum;
    if (!this.smoothedData || this.smoothedData.length !== spectrum.length) {
      this.smoothedData = new Float32Array(spectrum.length);
    }
    
    for (let i = 0; i < spectrum.length; i++) {
      this.smoothedData[i] = this.smoothedData[i] * this.smoothing + spectrum[i] * (1 - this.smoothing);
    }
  }

  render() {
    if (!this.smoothedData) return;
    
    const ctx = this.ctx;
    const width = this.displayWidth;
    const height = this.displayHeight;
    
    ctx.clearRect(0, 0, width, height);
    
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, 'rgba(233, 69, 96, 0.9)');
    gradient.addColorStop(0.5, 'rgba(24, 144, 255, 0.9)');
    gradient.addColorStop(1, 'rgba(82, 196, 26, 0.9)');
    
    const barCount = Math.min(this.smoothedData.length, 128);
    const barWidth = width / barCount - 1;
    const step = Math.floor(this.smoothedData.length / barCount);
    
    for (let i = 0; i < barCount; i++) {
      const dataIndex = i * step;
      const value = this.smoothedData[dataIndex] || 0;
      const barHeight = value * height * 0.9;
      const x = i * (barWidth + 1);
      const y = height - barHeight;
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const y = height - (i / 5) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  start() {
    const animate = () => {
      this.render();
      this.animationId = requestAnimationFrame(animate);
    };
    animate();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    this.spectrumData = null;
    this.smoothedData = null;
  }
}

class RadioApp {
  constructor() {
    this.currentFrequency = null;
    this.isPlaying = false;
    this.isScanning = false;
    this.foundStations = [];
    this.audioElement = document.getElementById('audioPlayer');
    this.signalLevel = 0;
    this.isSilent = false;
    this.statsUpdateInterval = null;
    
    this.isRecording = false;
    this.isPausedRecording = false;
    this.isTimerActive = false;
    this.recordingStartTime = null;
    
    this.spectrumRenderer = new SpectrumRenderer('spectrumCanvas');
    
    this.initElements();
    this.initEventListeners();
    this.initQuickFrequencies();
    this.setupIPCListeners();
    this.loadTimerPresets();
    this.loadOutputDir();
    this.loadRecordingsList();
  }

  initElements() {
    this.frequencyInput = document.getElementById('frequencyInput');
    this.currentFrequencyEl = document.getElementById('currentFrequency');
    this.stationNameEl = document.getElementById('stationName');
    this.programTypeEl = document.getElementById('programType');
    this.tuneBtn = document.getElementById('tuneBtn');
    this.playBtn = document.getElementById('playBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.scanBtn = document.getElementById('scanBtn');
    this.stopScanBtn = document.getElementById('stopScanBtn');
    this.streamUrlEl = document.getElementById('streamUrl');
    this.copyUrlBtn = document.getElementById('copyUrlBtn');
    this.statusDot = document.getElementById('statusDot');
    this.statusText = document.getElementById('statusText');
    
    this.signalIndicator = document.getElementById('signalIndicator');
    this.silentIndicator = document.getElementById('silentIndicator');
    this.signalBars = document.querySelectorAll('.signal-bars .bar');
    
    this.recordingIndicator = document.getElementById('recordingIndicator');
    this.recTimeEl = document.getElementById('recTime');
    
    this.recordBtn = document.getElementById('recordBtn');
    this.pauseRecordBtn = document.getElementById('pauseRecordBtn');
    this.stopRecordBtn = document.getElementById('stopRecordBtn');
    this.timerPresetSelect = document.getElementById('timerPreset');
    this.startTimerBtn = document.getElementById('startTimerBtn');
    this.timerDisplay = document.getElementById('timerDisplay');
    this.timerRemainingEl = document.getElementById('timerRemaining');
    this.timerProgressFill = document.getElementById('timerProgressFill');
    this.outputDirPath = document.getElementById('outputDirPath');
    this.changeDirBtn = document.getElementById('changeDirBtn');
    
    this.noiseThresholdSlider = document.getElementById('noiseThreshold');
    this.thresholdValue = document.getElementById('thresholdValue');
    
    this.startFreqInput = document.getElementById('startFreq');
    this.endFreqInput = document.getElementById('endFreq');
    this.scanStepInput = document.getElementById('scanStep');
    
    this.scanProgressEl = document.getElementById('scanProgress');
    this.progressFill = document.getElementById('progressFill');
    this.scanningFreqEl = document.getElementById('scanningFreq');
    this.foundCountEl = document.getElementById('foundCount');
    
    this.stationsContainer = document.getElementById('stationsContainer');
    
    this.metaStationName = document.getElementById('metaStationName');
    this.metaProgramType = document.getElementById('metaProgramType');
    this.metaRadioText = document.getElementById('metaRadioText');
    
    this.statTotalGroups = document.getElementById('statTotalGroups');
    this.statValidGroups = document.getElementById('statValidGroups');
    this.statInvalidGroups = document.getElementById('statInvalidGroups');
    this.statErrorRate = document.getElementById('statErrorRate');
    this.errorDetails = document.getElementById('errorDetails');
    this.errorList = document.getElementById('errorList');
    
    this.recordingsContainer = document.getElementById('recordingsContainer');
    this.refreshRecordingsBtn = document.getElementById('refreshRecordingsBtn');
  }

  initEventListeners() {
    this.tuneBtn.addEventListener('click', () => this.tune());
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.stopBtn.addEventListener('click', () => this.stop());
    this.scanBtn.addEventListener('click', () => this.startScan());
    this.stopScanBtn.addEventListener('click', () => this.stopScan());
    this.copyUrlBtn.addEventListener('click', () => this.copyStreamUrl());
    
    this.recordBtn.addEventListener('click', () => this.toggleRecording());
    this.pauseRecordBtn.addEventListener('click', () => this.togglePauseRecording());
    this.stopRecordBtn.addEventListener('click', () => this.stopRecording());
    this.startTimerBtn.addEventListener('click', () => this.startTimerRecording());
    this.changeDirBtn.addEventListener('click', () => this.changeOutputDir());
    this.refreshRecordingsBtn.addEventListener('click', () => this.loadRecordingsList());
    
    this.noiseThresholdSlider.addEventListener('input', (e) => {
      this.thresholdValue.textContent = e.target.value;
    });
    
    this.noiseThresholdSlider.addEventListener('change', (e) => {
      this.setNoiseThreshold(parseInt(e.target.value));
    });
    
    this.frequencyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.tune();
      }
    });

    this.audioElement.addEventListener('error', (e) => {
      console.error('Audio playback error:', e);
      this.setStatus('播放错误', 'error');
    });
  }

  initQuickFrequencies() {
    const quickFreqs = [87.5, 90.0, 92.5, 95.0, 97.5, 100.0, 102.5, 105.0, 107.5];
    const container = document.getElementById('quickFreqButtons');
    
    quickFreqs.forEach(freq => {
      const btn = document.createElement('button');
      btn.className = 'freq-btn';
      btn.textContent = `${freq} MHz`;
      btn.addEventListener('click', () => {
        this.frequencyInput.value = freq;
        this.tune();
      });
      container.appendChild(btn);
    });
  }

  async loadTimerPresets() {
    if (window.radioAPI) {
      const presets = await window.radioAPI.getTimerPresets();
      presets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.value;
        option.textContent = preset.label;
        this.timerPresetSelect.appendChild(option);
      });
    }
  }

  async loadOutputDir() {
    if (window.radioAPI) {
      const dir = await window.radioAPI.getRecordingOutputDir();
      this.outputDirPath.textContent = dir;
    }
  }

  async loadRecordingsList() {
    if (window.radioAPI) {
      const result = await window.radioAPI.getRecordingsList();
      if (result.success) {
        this.renderRecordingsList(result.recordings);
      }
    }
  }

  renderRecordingsList(recordings) {
    if (!recordings || recordings.length === 0) {
      this.recordingsContainer.innerHTML = `
        <div class="empty-state">
          <p>暂无录音文件</p>
        </div>
      `;
      return;
    }

    this.recordingsContainer.innerHTML = '';
    
    recordings.forEach(recording => {
      const item = document.createElement('div');
      item.className = 'recording-item';
      
      const sizeMB = (recording.size / (1024 * 1024)).toFixed(2);
      const date = new Date(recording.created).toLocaleString();
      
      item.innerHTML = `
        <div class="recording-icon">🎵</div>
        <div class="recording-info">
          <div class="recording-name">${recording.name}</div>
          <div class="recording-meta">
            <span>📅 ${date}</span>
            <span>📦 ${sizeMB} MB</span>
          </div>
        </div>
        <div class="recording-actions">
          <button class="btn-play-recording" data-path="${recording.path}">▶ 播放</button>
          <button class="btn-export" data-path="${recording.path}">导出</button>
          <button class="btn-delete" data-path="${recording.path}">删除</button>
        </div>
      `;
      
      item.querySelector('.btn-play-recording').addEventListener('click', (e) => {
        const path = e.target.dataset.path;
        this.playRecording(path);
      });
      
      item.querySelector('.btn-export').addEventListener('click', (e) => {
        const path = e.target.dataset.path;
        this.exportRecording(path, recording.name);
      });
      
      item.querySelector('.btn-delete').addEventListener('click', (e) => {
        const path = e.target.dataset.path;
        this.deleteRecording(path);
      });
      
      this.recordingsContainer.appendChild(item);
    });
  }

  setupIPCListeners() {
    if (window.radioAPI) {
      window.radioAPI.onStarted((data) => {
        console.log('Radio started:', data);
        this.currentFrequency = data.frequency;
        this.currentFrequencyEl.textContent = data.frequency.toFixed(1);
        this.streamUrlEl.textContent = data.streamUrl;
        this.setStatus('播放中', 'playing');
        this.signalIndicator.style.display = 'flex';
        this.recordBtn.disabled = false;
        this.startTimerBtn.disabled = false;
        this.startStatsUpdate();
        this.spectrumRenderer.start();
      });

      window.radioAPI.onStopped(() => {
        console.log('Radio stopped');
        this.isPlaying = false;
        this.currentFrequency = null;
        this.currentFrequencyEl.textContent = '--.-';
        this.stationNameEl.textContent = '等待调谐...';
        this.programTypeEl.textContent = '';
        this.updateButtons();
        this.setStatus('已停止', 'stopped');
        this.signalIndicator.style.display = 'none';
        this.recordBtn.disabled = true;
        this.startTimerBtn.disabled = true;
        this.audioElement.pause();
        this.stopStatsUpdate();
        this.spectrumRenderer.stop();
        this.spectrumRenderer.clear();
        
        if (this.isRecording) {
          this.stopRecording();
        }
      });

      window.radioAPI.onStationName((name) => {
        this.stationNameEl.textContent = name || '未知电台';
        this.metaStationName.textContent = name || '-';
        this.updateStationInList(this.currentFrequency, { name });
      });

      window.radioAPI.onProgramType((type) => {
        this.programTypeEl.textContent = type || '';
        this.metaProgramType.textContent = type || '-';
        this.updateStationInList(this.currentFrequency, { type });
      });

      window.radioAPI.onRadioText((text) => {
        this.metaRadioText.textContent = text || '-';
      });

      window.radioAPI.onMetadata((metadata) => {
        if (metadata.name) {
          this.metaStationName.textContent = metadata.name;
        }
        if (metadata.type) {
          this.metaProgramType.textContent = metadata.type;
        }
        if (metadata.text) {
          this.metaRadioText.textContent = metadata.text;
        }
      });

      window.radioAPI.onSignalDetected((data) => {
        this.signalLevel = data.rms;
        this.isSilent = false;
        this.updateSignalBars(data.rms);
        this.silentIndicator.style.display = 'none';
      });

      window.radioAPI.onSilenceDetected((data) => {
        this.signalLevel = data.rms;
        this.isSilent = true;
        this.updateSignalBars(data.rms);
        this.silentIndicator.style.display = 'inline-block';
      });

      window.radioAPI.onSpectrumData((data) => {
        this.spectrumRenderer.updateData(data.spectrum);
      });

      window.radioAPI.onRecordStarted((data) => {
        console.log('Recording started:', data);
        this.isRecording = true;
        this.recordingStartTime = Date.now();
        this.recordingIndicator.style.display = 'flex';
        this.updateRecordingButtons();
        this.startRecordingTimer();
      });

      window.radioAPI.onRecordStopped((data) => {
        console.log('Recording stopped:', data);
        this.isRecording = false;
        this.isPausedRecording = false;
        this.recordingIndicator.style.display = 'none';
        this.updateRecordingButtons();
        this.stopRecordingTimer();
        this.loadRecordingsList();
      });

      window.radioAPI.onRecordPaused(() => {
        this.isPausedRecording = true;
        this.updateRecordingButtons();
      });

      window.radioAPI.onRecordResumed(() => {
        this.isPausedRecording = false;
        this.updateRecordingButtons();
      });

      window.radioAPI.onRecordProgress((data) => {
        this.updateRecordingTime(data.duration);
      });

      window.radioAPI.onTimerStarted((data) => {
        console.log('Timer started:', data);
        this.isTimerActive = true;
        this.timerDisplay.style.display = 'block';
      });

      window.radioAPI.onTimerStopped(() => {
        console.log('Timer stopped');
        this.isTimerActive = false;
        this.timerDisplay.style.display = 'none';
      });

      window.radioAPI.onTimerTick((data) => {
        this.updateTimerDisplay(data);
      });

      window.radioAPI.onScanProgress((progress) => {
        this.updateScanProgress(progress);
      });

      window.radioAPI.onStationFound((station) => {
        this.addFoundStation(station);
      });

      window.radioAPI.onScanComplete((stations) => {
        this.scanComplete(stations);
      });
    }
  }

  async tune() {
    const frequency = parseFloat(this.frequencyInput.value);
    
    if (isNaN(frequency) || frequency < 87.5 || frequency > 108) {
      alert('请输入有效的频率 (87.5 - 108 MHz)');
      return;
    }

    this.setStatus('调谐中...', 'tuning');
    
    try {
      if (window.radioAPI) {
        const noiseThreshold = parseInt(this.noiseThresholdSlider.value);
        const result = await window.radioAPI.start(frequency, { noiseThreshold });
        if (result.success) {
          this.currentFrequency = frequency;
          this.currentFrequencyEl.textContent = frequency.toFixed(1);
          this.streamUrlEl.textContent = result.streamUrl;
          this.isPlaying = true;
          this.updateButtons();
          this.setStatus('播放中', 'playing');
          this.signalIndicator.style.display = 'flex';
          this.recordBtn.disabled = false;
          this.startTimerBtn.disabled = false;
          
          this.startAudioPlayback(result.streamUrl);
          
          this.updateActiveFrequency(frequency);
          this.startStatsUpdate();
          this.spectrumRenderer.start();
        } else {
          alert(`启动失败: ${result.error}`);
          this.setStatus('就绪', 'ready');
        }
      } else {
        this.simulateTune(frequency);
      }
    } catch (error) {
      console.error('Tune error:', error);
      alert(`调谐失败: ${error.message}`);
      this.setStatus('就绪', 'ready');
    }
  }

  simulateTune(frequency) {
    setTimeout(() => {
      this.currentFrequency = frequency;
      this.currentFrequencyEl.textContent = frequency.toFixed(1);
      this.isPlaying = true;
      this.updateButtons();
      this.setStatus('播放中 (模拟)', 'playing');
      this.stationNameEl.textContent = '模拟电台 FM';
      this.programTypeEl.textContent = 'Pop Music';
      this.metaStationName.textContent = '模拟电台 FM';
      this.metaProgramType.textContent = 'Pop Music';
      this.metaRadioText.textContent = '这是模拟的RDS数据';
      this.signalIndicator.style.display = 'flex';
      this.recordBtn.disabled = false;
      this.startTimerBtn.disabled = false;
      this.updateActiveFrequency(frequency);
      this.simulateSignal();
      this.spectrumRenderer.start();
    }, 1000);
  }

  simulateSignal() {
    setInterval(() => {
      const level = 500 + Math.random() * 2000;
      this.updateSignalBars(level);
      
      const fakeSpectrum = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        fakeSpectrum[i] = Math.random() * 0.8 + 0.1;
      }
      this.spectrumRenderer.updateData(fakeSpectrum);
    }, 500);
  }

  startAudioPlayback(url) {
    this.audioElement.src = url;
    this.audioElement.play().catch(err => {
      console.warn('Auto-play failed:', err);
    });
  }

  togglePlay() {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.tune();
    }
  }

  async stop() {
    if (window.radioAPI) {
      await window.radioAPI.stop();
    }
    this.isPlaying = false;
    this.audioElement.pause();
    this.audioElement.src = '';
    this.updateButtons();
    this.setStatus('已停止', 'stopped');
    this.signalIndicator.style.display = 'none';
    this.recordBtn.disabled = true;
    this.startTimerBtn.disabled = true;
    this.stopStatsUpdate();
    this.spectrumRenderer.stop();
    this.spectrumRenderer.clear();
    
    if (this.isRecording) {
      this.stopRecording();
    }
  }

  async setNoiseThreshold(threshold) {
    if (window.radioAPI) {
      await window.radioAPI.setNoiseThreshold(threshold);
    }
  }

  updateSignalBars(rms) {
    const maxLevel = 5000;
    const normalizedLevel = Math.min(rms / maxLevel, 1);
    const activeBars = Math.ceil(normalizedLevel * 5);
    
    this.signalBars.forEach((bar, index) => {
      bar.classList.remove('active', 'weak', 'poor');
      if (index < activeBars) {
        if (activeBars <= 2) {
          bar.classList.add('poor');
        } else if (activeBars <= 3) {
          bar.classList.add('weak');
        } else {
          bar.classList.add('active');
        }
      }
    });
  }

  startStatsUpdate() {
    this.stopStatsUpdate();
    this.statsUpdateInterval = setInterval(async () => {
      if (window.radioAPI) {
        const stats = await window.radioAPI.getRDSStats();
        this.updateStats(stats);
      }
    }, 1000);
  }

  stopStatsUpdate() {
    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = null;
    }
  }

  updateStats(stats) {
    if (!stats) return;
    
    this.statTotalGroups.textContent = stats.totalGroups || 0;
    this.statValidGroups.textContent = stats.validGroups || 0;
    this.statInvalidGroups.textContent = stats.invalidGroups || 0;
    this.statErrorRate.textContent = `${stats.errorRate || 0}%`;
    
    if (stats.errors && Object.keys(stats.errors).length > 0) {
      this.errorDetails.style.display = 'block';
      this.errorList.innerHTML = '';
      
      Object.entries(stats.errors).forEach(([type, count]) => {
        const item = document.createElement('div');
        item.className = 'error-item';
        item.innerHTML = `${this.getErrorTypeName(type)}<span class="count">${count}</span>`;
        this.errorList.appendChild(item);
      });
    } else {
      this.errorDetails.style.display = 'none';
    }
  }

  getErrorTypeName(type) {
    const names = {
      'invalid_json': 'JSON解析错误',
      'invalid_pi': '无效PI码',
      'no_sync': '未同步',
      'parse_error': '解析错误',
      'redsea_error': '解码器错误',
      'insufficient_data': '数据不足'
    };
    return names[type] || type;
  }

  async toggleRecording() {
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    if (window.radioAPI) {
      const result = await window.radioAPI.startRecording();
      if (!result.success) {
        alert(`录音启动失败: ${result.error}`);
      }
    }
  }

  togglePauseRecording() {
    if (window.radioAPI) {
      if (this.isPausedRecording) {
        window.radioAPI.resumeRecording();
      } else {
        window.radioAPI.pauseRecording();
      }
    }
  }

  async stopRecording() {
    if (window.radioAPI) {
      const result = await window.radioAPI.stopRecording();
      if (result.success) {
        this.loadRecordingsList();
      }
    }
    this.isRecording = false;
    this.isPausedRecording = false;
    this.recordingIndicator.style.display = 'none';
    this.updateRecordingButtons();
    this.stopRecordingTimer();
  }

  updateRecordingButtons() {
    if (this.isRecording) {
      this.recordBtn.innerHTML = '<span>■</span> 停止录音';
      this.pauseRecordBtn.style.display = 'inline-flex';
      this.pauseRecordBtn.disabled = false;
      this.pauseRecordBtn.innerHTML = this.isPausedRecording 
        ? '<span>▶</span> 继续' 
        : '<span>⏸</span> 暂停';
      this.stopRecordBtn.style.display = 'none';
    } else {
      this.recordBtn.innerHTML = '<span>●</span> 开始录音';
      this.pauseRecordBtn.style.display = 'none';
      this.stopRecordBtn.style.display = 'none';
    }
  }

  startRecordingTimer() {
    this.recordingStartTime = Date.now();
    this.updateRecordingTime(0);
    
    this.recordingTimer = setInterval(() => {
      if (!this.isPausedRecording) {
        const duration = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        this.updateRecordingTime(duration);
      }
    }, 1000);
  }

  stopRecordingTimer() {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  }

  updateRecordingTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    this.recTimeEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async startTimerRecording() {
    const duration = parseInt(this.timerPresetSelect.value);
    if (duration <= 0) {
      alert('请选择定时时长');
      return;
    }
    
    if (window.radioAPI) {
      const result = await window.radioAPI.startTimerRecording(duration);
      if (!result.success) {
        alert(`定时录音启动失败: ${result.error}`);
      }
    }
  }

  updateTimerDisplay(data) {
    const mins = Math.floor(data.remaining / 60);
    const secs = data.remaining % 60;
    this.timerRemainingEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    const progress = (data.elapsed / data.total) * 100;
    this.timerProgressFill.style.width = `${100 - progress}%`;
  }

  async changeOutputDir() {
    if (window.radioAPI) {
      const result = await window.radioAPI.selectOutputDir();
      if (result.success) {
        this.outputDirPath.textContent = result.path;
      }
    }
  }

  playRecording(path) {
    const fileUrl = `file://${path}`;
    this.audioElement.src = fileUrl;
    this.audioElement.play().catch(err => {
      console.error('Failed to play recording:', err);
      alert('播放失败');
    });
  }

  async exportRecording(sourcePath, fileName) {
    if (window.radioAPI) {
      const result = await window.radioAPI.saveFileDialog(fileName);
      if (result.success) {
        const copyResult = await window.radioAPI.copyFile(sourcePath, result.path);
        if (copyResult.success) {
          alert('导出成功!');
        } else {
          alert(`导出失败: ${copyResult.error}`);
        }
      }
    }
  }

  async deleteRecording(path) {
    if (confirm('确定要删除这个录音文件吗?')) {
      if (window.radioAPI) {
        const result = await window.radioAPI.deleteRecording(path);
        if (result.success) {
          this.loadRecordingsList();
        } else {
          alert(`删除失败: ${result.error}`);
        }
      }
    }
  }

  async startScan() {
    const startFreq = parseFloat(this.startFreqInput.value);
    const endFreq = parseFloat(this.endFreqInput.value);
    const step = parseFloat(this.scanStepInput.value);

    if (startFreq >= endFreq) {
      alert('起始频率必须小于结束频率');
      return;
    }

    this.isScanning = true;
    this.foundStations = [];
    this.scanProgressEl.style.display = 'block';
    this.stationsContainer.innerHTML = '';
    this.updateScanButtons();
    this.setStatus('扫描中...', 'scanning');

    if (window.radioAPI) {
      await window.radioAPI.startScan(startFreq, endFreq, step);
    } else {
      this.simulateScan(startFreq, endFreq, step);
    }
  }

  simulateScan(startFreq, endFreq, step) {
    let currentFreq = startFreq;
    const totalSteps = Math.floor((endFreq - startFreq) / step);
    let currentStep = 0;

    const scanInterval = setInterval(() => {
      if (!this.isScanning || currentFreq > endFreq) {
        clearInterval(scanInterval);
        this.scanComplete(this.foundStations);
        return;
      }

      currentStep++;
      const progress = (currentStep / totalSteps) * 100;
      
      this.updateScanProgress({
        current: currentFreq,
        start: startFreq,
        end: endFreq,
        found: this.foundStations.length
      });

      if (Math.random() > 0.7) {
        const station = {
          frequency: currentFreq,
          signal: -30 + Math.random() * 30,
          name: `FM ${currentFreq.toFixed(1)}`,
          type: ['Pop Music', 'News', 'Rock', 'Jazz'][Math.floor(Math.random() * 4)]
        };
        this.addFoundStation(station);
      }

      currentFreq = Math.round((currentFreq + step) * 10) / 10;
    }, 100);
  }

  stopScan() {
    this.isScanning = false;
    if (window.radioAPI) {
      window.radioAPI.stopScan();
    }
    this.scanComplete(this.foundStations);
  }

  updateScanProgress(progress) {
    const { current, start, end, found } = progress;
    const percentage = ((current - start) / (end - start)) * 100;
    
    this.progressFill.style.width = `${Math.min(percentage, 100)}%`;
    this.scanningFreqEl.textContent = current.toFixed(1);
    this.foundCountEl.textContent = found;
  }

  addFoundStation(station) {
    const exists = this.foundStations.find(s => 
      Math.abs(s.frequency - station.frequency) < 0.15
    );
    
    if (!exists) {
      this.foundStations.push(station);
      this.renderStation(station);
    }
  }

  renderStation(station) {
    const stationEl = document.createElement('div');
    stationEl.className = 'station-item';
    stationEl.dataset.frequency = station.frequency;
    
    stationEl.innerHTML = `
      <div class="station-frequency">${station.frequency.toFixed(1)} MHz</div>
      <div class="station-details">
        <div class="name">${station.name || '未知电台'}</div>
        <div class="type">${station.type || 'Unknown'}</div>
      </div>
      <div class="station-signal">${station.signal?.toFixed(0) || '--'} dB</div>
      <button class="station-tune-btn">收听</button>
    `;
    
    stationEl.querySelector('.station-tune-btn').addEventListener('click', () => {
      this.frequencyInput.value = station.frequency;
      this.tune();
    });
    
    stationEl.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON') {
        this.frequencyInput.value = station.frequency;
        this.tune();
      }
    });
    
    if (this.stationsContainer.querySelector('.empty-state')) {
      this.stationsContainer.innerHTML = '';
    }
    
    this.stationsContainer.appendChild(stationEl);
  }

  updateStationInList(frequency, data) {
    if (!frequency) return;
    
    const station = this.foundStations.find(s => 
      Math.abs(s.frequency - frequency) < 0.15
    );
    
    if (station) {
      if (data.name) station.name = data.name;
      if (data.type) station.type = data.type;
      
      const stationEl = this.stationsContainer.querySelector(
        `.station-item[data-frequency="${frequency}"]`
      );
      
      if (stationEl) {
        const nameEl = stationEl.querySelector('.name');
        const typeEl = stationEl.querySelector('.type');
        if (nameEl && data.name) nameEl.textContent = data.name;
        if (typeEl && data.type) typeEl.textContent = data.type;
      }
    }
  }

  scanComplete(stations) {
    this.isScanning = false;
    this.scanProgressEl.style.display = 'none';
    this.updateScanButtons();
    
    if (stations.length === 0 && this.foundStations.length === 0) {
      this.stationsContainer.innerHTML = `
        <div class="empty-state">
          <p>未发现电台，请尝试调整扫描范围</p>
        </div>
      `;
    }
    
    this.setStatus('扫描完成', 'ready');
  }

  updateButtons() {
    this.playBtn.innerHTML = this.isPlaying 
      ? '<span class="play-icon">⏸</span><span class="play-text">暂停</span>'
      : '<span class="play-icon">▶</span><span class="play-text">播放</span>';
    
    this.stopBtn.disabled = !this.isPlaying;
    this.tuneBtn.disabled = this.isScanning;
  }

  updateScanButtons() {
    this.scanBtn.disabled = this.isScanning;
    this.stopScanBtn.disabled = !this.isScanning;
  }

  updateActiveFrequency(frequency) {
    document.querySelectorAll('.freq-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.textContent.includes(`${frequency}`)) {
        btn.classList.add('active');
      }
    });
    
    document.querySelectorAll('.station-item').forEach(el => {
      el.classList.remove('active');
      const freq = parseFloat(el.dataset.frequency);
      if (Math.abs(freq - frequency) < 0.1) {
        el.classList.add('active');
      }
    });
  }

  setStatus(text, state) {
    this.statusText.textContent = text;
    this.statusDot.className = 'status-dot';
    
    switch (state) {
      case 'playing':
        this.statusDot.classList.add('playing');
        break;
      case 'scanning':
        this.statusDot.classList.add('scanning');
        break;
      case 'error':
        this.statusDot.style.backgroundColor = '#ff4d4f';
        this.statusDot.style.boxShadow = '0 0 10px #ff4d4f';
        break;
      default:
        this.statusDot.style.backgroundColor = '#52c41a';
        this.statusDot.style.boxShadow = '0 0 10px #52c41a';
    }
  }

  async copyStreamUrl() {
    const url = this.streamUrlEl.textContent;
    try {
      await navigator.clipboard.writeText(url);
      const originalText = this.copyUrlBtn.textContent;
      this.copyUrlBtn.textContent = '已复制!';
      setTimeout(() => {
        this.copyUrlBtn.textContent = originalText;
      }, 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.radioApp = new RadioApp();
});
