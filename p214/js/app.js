class G711DemoApp {
    constructor() {
        this.audioCapture = null;
        this.originalVisualizer = null;
        this.compressedVisualizer = null;
        this.isRecording = false;
        this.statsUpdateInterval = null;
        this.currentCodec = 'ulaw';

        this.init();
    }

    init() {
        this.initVisualizers();
        this.bindEvents();
        this.drawIdleWaveforms();
    }

    initVisualizers() {
        try {
            this.originalVisualizer = new WaveformVisualizer('originalWaveform', {
                strokeStyle: '#10B981',
                fillStyle: 'rgba(16, 185, 129, 0.1)',
                bufferSize: 4096
            });

            this.compressedVisualizer = new WaveformVisualizer('compressedWaveform', {
                strokeStyle: '#F59E0B',
                fillStyle: 'rgba(245, 158, 11, 0.1)',
                bufferSize: 4096
            });
        } catch (error) {
            console.error('Failed to initialize visualizers:', error);
        }
    }

    drawIdleWaveforms() {
        if (this.originalVisualizer) {
            this.originalVisualizer.draw();
        }
        if (this.compressedVisualizer) {
            this.compressedVisualizer.draw();
        }
    }

    bindEvents() {
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.toggleRecording());
        }

        const volumeSlider = document.getElementById('volumeSlider');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                const value = e.target.value;
                document.getElementById('volumeValue').textContent = `${value}%`;
                if (this.audioCapture) {
                    this.audioCapture.setVolume(value / 100);
                }
            });
        }

        const ulawRadio = document.getElementById('ulawRadio');
        const alawRadio = document.getElementById('alawRadio');
        
        if (ulawRadio) {
            ulawRadio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.setCodecType('ulaw');
                }
            });
        }
        
        if (alawRadio) {
            alawRadio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.setCodecType('alaw');
                }
            });
        }

        const downloadBtn = document.getElementById('downloadBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                this.downloadRecordedData();
            });
        }

        const aecToggle = document.getElementById('aecToggle');
        if (aecToggle) {
            aecToggle.addEventListener('change', (e) => {
                if (this.audioCapture) {
                    this.audioCapture.setEchoCancellationEnabled(e.target.checked);
                }
            });
        }

        const stepSizeSlider = document.getElementById('stepSizeSlider');
        if (stepSizeSlider) {
            stepSizeSlider.addEventListener('input', (e) => {
                const value = e.target.value / 100;
                document.getElementById('stepSizeValue').textContent = value.toFixed(2);
                if (this.audioCapture) {
                    this.audioCapture.setNLMSParams(value);
                }
            });
        }

        const filterLengthSlider = document.getElementById('filterLengthSlider');
        if (filterLengthSlider) {
            filterLengthSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                document.getElementById('filterLengthValue').textContent = value;
                if (this.audioCapture) {
                    this.audioCapture.setNLMSParams(undefined, value);
                }
            });
        }

        const delaySlider = document.getElementById('delaySlider');
        if (delaySlider) {
            delaySlider.addEventListener('input', (e) => {
                const value = e.target.value;
                document.getElementById('delayValue').textContent = `${value}ms`;
                if (this.audioCapture) {
                    this.audioCapture.setEchoCancellationParams(value / 1000);
                }
            });
        }

        const decaySlider = document.getElementById('decaySlider');
        if (decaySlider) {
            decaySlider.addEventListener('input', (e) => {
                const value = e.target.value / 100;
                document.getElementById('decayValue').textContent = value.toFixed(2);
                if (this.audioCapture) {
                    this.audioCapture.setEchoCancellationParams(undefined, value);
                }
            });
        }

        const resetFilterBtn = document.getElementById('resetFilterBtn');
        if (resetFilterBtn) {
            resetFilterBtn.addEventListener('click', () => {
                if (this.audioCapture) {
                    this.audioCapture.resetEchoCanceller();
                    this.showNotification('滤波器已重置');
                }
            });
        }
    }

    setCodecType(codecType) {
        this.currentCodec = codecType;
        
        if (this.audioCapture) {
            this.audioCapture.setCodecType(codecType);
        }
        
        this.updateCodecDisplay();
        
        const codecInfo = G711Codec.getCodecInfo(codecType);
        this.showNotification(`已切换到 ${codecInfo.name}`);
    }

    updateCodecDisplay() {
        const codecDisplay = document.getElementById('codecTypeDisplay');
        const codecMetaLabel = document.getElementById('codecMetaLabel');
        
        if (codecDisplay) {
            codecDisplay.textContent = this.currentCodec === 'alaw' ? 'A-law' : 'μ-law';
        }
        
        if (codecMetaLabel) {
            codecMetaLabel.textContent = this.currentCodec === 'alaw' ? 'A-law 8-bit' : 'μ-law 8-bit';
        }
    }

    formatBytes(bytes) {
        if (bytes < 1024) {
            return `${bytes} B`;
        } else if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        } else {
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }
    }

    downloadRecordedData() {
        if (!this.audioCapture) {
            this.showNotification('请先开始采集');
            return;
        }

        const recordedData = this.audioCapture.getRecordedData();
        
        if (recordedData.length === 0) {
            this.showNotification('没有可下载的录音数据');
            return;
        }

        const duration = this.audioCapture.getRecordedDuration();
        const codecType = this.audioCapture.getCodecType();
        
        const blob = new Blob([recordedData], { type: 'application/octet-stream' });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const now = new Date();
        const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
        
        const codecExt = codecType === 'alaw' ? 'alaw' : 'ulaw';
        const codecName = codecType === 'alaw' ? 'A-law' : 'u-law';
        
        a.href = url;
        a.download = `g711_${codecExt}_${timestamp}.g711`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification(`已下载 ${this.formatBytes(recordedData.length)} (${duration.toFixed(1)}s, ${codecName})`);
    }

    showNotification(message) {
        const statusText = document.getElementById('statusText');
        if (statusText) {
            const originalText = statusText.textContent;
            statusText.textContent = message;
            setTimeout(() => {
                if (this.isRecording) {
                    statusText.textContent = '采集中...';
                } else {
                    statusText.textContent = originalText;
                }
            }, 2000);
        }
    }

    updateAECTypeLabel() {
        const aecTypeLabel = document.getElementById('aecTypeLabel');
        if (aecTypeLabel && this.audioCapture) {
            const type = this.audioCapture.getEchoCancellerType();
            if (type === 'nlms') {
                aecTypeLabel.textContent = 'AudioWorklet NLMS自适应滤波';
            } else {
                aecTypeLabel.textContent = '模拟AEC (Worklet不可用)';
            }
        }
    }

    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            this.updateStatus('initializing', '初始化中...');

            if (!this.audioCapture) {
                this.audioCapture = new AudioCapture({
                    sampleRate: 48000,
                    bufferSize: 2048,
                    codecType: this.currentCodec,
                    onAudioProcess: (originalData, processedData) => {
                        this.handleAudioData(originalData, processedData);
                    },
                    onDecodedData: (decodedData) => {
                        if (this.compressedVisualizer) {
                            this.compressedVisualizer.pushData(decodedData);
                        }
                    }
                });
                
                await this.audioCapture.init();
                this.updateAECTypeLabel();
            } else {
                this.audioCapture.setCodecType(this.currentCodec);
            }

            const volumeSlider = document.getElementById('volumeSlider');
            if (volumeSlider) {
                this.audioCapture.setVolume(volumeSlider.value / 100);
            }

            const aecToggle = document.getElementById('aecToggle');
            if (aecToggle && aecToggle.checked) {
                this.audioCapture.setEchoCancellationEnabled(true);
            }

            const stepSizeSlider = document.getElementById('stepSizeSlider');
            const filterLengthSlider = document.getElementById('filterLengthSlider');
            const delaySlider = document.getElementById('delaySlider');
            const decaySlider = document.getElementById('decaySlider');
            
            this.audioCapture.setNLMSParams(
                stepSizeSlider.value / 100,
                parseInt(filterLengthSlider.value)
            );
            
            this.audioCapture.setEchoCancellationParams(
                delaySlider.value / 1000,
                decaySlider.value / 100,
                stepSizeSlider.value / 100
            );

            await this.audioCapture.start();

            this.isRecording = true;
            this.updateUIState(true);
            this.startStatsUpdate();

            if (this.originalVisualizer) {
                this.originalVisualizer.start();
            }
            if (this.compressedVisualizer) {
                this.compressedVisualizer.start();
            }

            this.updateStatus('recording', '采集中...');

        } catch (error) {
            console.error('Failed to start recording:', error);
            this.updateStatus('error', '启动失败: ' + error.message);
            alert('无法访问麦克风，请确保已授权麦克风权限。\n\n错误详情: ' + error.message);
        }
    }

    async stopRecording() {
        try {
            if (this.audioCapture) {
                await this.audioCapture.stop();
            }

            this.isRecording = false;
            this.stopStatsUpdate();
            this.updateUIState(false);

            if (this.originalVisualizer) {
                this.originalVisualizer.stop();
            }
            if (this.compressedVisualizer) {
                this.compressedVisualizer.stop();
            }

            this.updateStatus('idle', '已停止');

        } catch (error) {
            console.error('Failed to stop recording:', error);
        }
    }

    handleAudioData(originalData, processedData) {
        if (this.originalVisualizer) {
            this.originalVisualizer.pushData(originalData);
        }
    }

    updateUIState(isRecording) {
        const startBtn = document.getElementById('startBtn');
        const startBtnIcon = document.getElementById('startBtnIcon');
        const startBtnText = document.getElementById('startBtnText');

        if (isRecording) {
            startBtn.classList.add('recording');
            startBtnIcon.textContent = '⏹️';
            startBtnText.textContent = '停止采集';
        } else {
            startBtn.classList.remove('recording');
            startBtnIcon.textContent = '🎤';
            startBtnText.textContent = '开始采集';
        }
    }

    updateStatus(state, text) {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');

        statusDot.className = 'status-dot';
        
        switch (state) {
            case 'recording':
                statusDot.classList.add('recording');
                break;
            case 'initializing':
                statusDot.style.background = '#F59E0B';
                statusDot.style.boxShadow = '0 0 10px #F59E0B';
                break;
            case 'error':
                statusDot.style.background = '#EF4444';
                statusDot.style.boxShadow = '0 0 10px #EF4444';
                break;
            default:
                statusDot.style.background = '';
                statusDot.style.boxShadow = '';
        }

        statusText.textContent = text;
    }

    startStatsUpdate() {
        this.statsUpdateInterval = setInterval(() => {
            this.updateStats();
        }, 100);
    }

    stopStatsUpdate() {
        if (this.statsUpdateInterval) {
            clearInterval(this.statsUpdateInterval);
            this.statsUpdateInterval = null;
        }
    }

    updateStats() {
        if (!this.audioCapture) return;

        const stats = this.audioCapture.getStats();

        const sampleRateEl = document.getElementById('sampleRate');
        const codecTypeEl = document.getElementById('codecTypeDisplay');
        const origBitrateEl = document.getElementById('origBitrate');
        const compBitrateEl = document.getElementById('compBitrate');
        const compRatioEl = document.getElementById('compRatio');
        const recordedSizeEl = document.getElementById('recordedSize');
        const recordedSizeLabelEl = document.getElementById('recordedSizeLabel');
        const recordedDurationLabelEl = document.getElementById('recordedDurationLabel');

        if (sampleRateEl) {
            sampleRateEl.textContent = stats.sampleRate || '--';
        }
        
        if (codecTypeEl) {
            codecTypeEl.textContent = stats.codecType === 'alaw' ? 'A-law' : 'μ-law';
        }
        
        if (origBitrateEl) {
            origBitrateEl.textContent = stats.originalBitRate || '--';
        }
        if (compBitrateEl) {
            compBitrateEl.textContent = stats.encodedBitRate || '--';
        }
        if (compRatioEl) {
            compRatioEl.textContent = stats.compressionRatio || '--';
        }
        if (recordedSizeEl) {
            recordedSizeEl.textContent = this.formatBytes(stats.recordedBytes || 0);
        }
        if (recordedSizeLabelEl) {
            recordedSizeLabelEl.textContent = `已录制: ${this.formatBytes(stats.recordedBytes || 0)}`;
        }
        if (recordedDurationLabelEl && this.audioCapture) {
            const duration = this.audioCapture.getRecordedDuration();
            recordedDurationLabelEl.textContent = `时长: ${duration.toFixed(1)}s`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.g711DemoApp = new G711DemoApp();
});

window.addEventListener('beforeunload', async () => {
    if (window.g711DemoApp && window.g711DemoApp.audioCapture) {
        await window.g711DemoApp.audioCapture.close();
    }
});
