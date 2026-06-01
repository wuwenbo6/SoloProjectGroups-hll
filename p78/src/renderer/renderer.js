const { ipcRenderer } = require('electron');
const remote = require('@electron/remote');
const { dialog } = remote;
const fs = require('fs');
const path = require('path');

class FFT {
    constructor(size) {
        this.size = size;
        this.log2Size = Math.log2(size);
        this.real = new Float32Array(size);
        this.imag = new Float32Array(size);
        this.reverseTable = this.buildReverseTable();
    }

    buildReverseTable() {
        const table = new Uint32Array(this.size);
        for (let i = 0; i < this.size; i++) {
            let res = 0;
            for (let j = 0; j < this.log2Size; j++) {
                if (i & (1 << j)) {
                    res |= 1 << (this.log2Size - 1 - j);
                }
            }
            table[i] = res;
        }
        return table;
    }

    transform(input) {
        const n = this.size;
        
        for (let i = 0; i < n; i++) {
            const idx = this.reverseTable[i];
            this.real[i] = input[idx] || 0;
            this.imag[i] = 0;
        }

        for (let s = 1; s <= this.log2Size; s++) {
            const m = 1 << s;
            const m2 = m >> 1;
            const wRe = Math.cos(-Math.PI / m2);
            const wIm = Math.sin(-Math.PI / m2);

            for (let k = 0; k < n; k += m) {
                let re = 1;
                let im = 0;

                for (let j = 0; j < m2; j++) {
                    const tRe = re * this.real[k + j + m2] - im * this.imag[k + j + m2];
                    const tIm = re * this.imag[k + j + m2] + im * this.real[k + j + m2];
                    
                    this.real[k + j + m2] = this.real[k + j] - tRe;
                    this.imag[k + j + m2] = this.imag[k + j] - tIm;
                    this.real[k + j] += tRe;
                    this.imag[k + j] += tIm;

                    const newRe = re * wRe - im * wIm;
                    im = re * wIm + im * wRe;
                    re = newRe;
                }
            }
        }

        const magnitude = new Float32Array(n / 2);
        for (let i = 0; i < n / 2; i++) {
            magnitude[i] = Math.sqrt(this.real[i] * this.real[i] + this.imag[i] * this.imag[i]);
        }
        return magnitude;
    }
}

class WindowFunction {
    static rectangular(n, N) {
        return 1;
    }

    static hann(n, N) {
        return 0.5 * (1 - Math.cos(2 * Math.PI * n / (N - 1)));
    }

    static hamming(n, N) {
        return 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (N - 1));
    }

    static blackman(n, N) {
        const a0 = 0.42;
        const a1 = 0.5;
        const a2 = 0.08;
        return a0 - a1 * Math.cos(2 * Math.PI * n / (N - 1)) + a2 * Math.cos(4 * Math.PI * n / (N - 1));
    }

    static apply(data, type) {
        const N = data.length;
        const result = new Float32Array(N);
        const func = this[type] || this.hann;
        
        for (let i = 0; i < N; i++) {
            result[i] = data[i] * func(i, N);
        }
        return result;
    }
}

class OscilloscopeRenderer {
    constructor() {
        this.canvas = document.getElementById('waveformCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.fftCanvas = document.getElementById('fftCanvas');
        this.fftCtx = this.fftCanvas.getContext('2d', { alpha: false });
        
        this.isConnected = false;
        this.isCapturing = false;
        
        this.channels = {
            ch1: { data: new Int16Array(8192), length: 0, enabled: true },
            ch2: { data: new Int16Array(8192), length: 0, enabled: false },
            math: { data: new Float32Array(8192), length: 0, enabled: false }
        };
        
        this.maxDataPoints = 4096;
        this.animationFrameId = null;
        this.isDrawing = false;
        this.sampleCount = 0;
        this.lastSampleTime = Date.now();
        
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { alpha: false });
        this.gridDirty = true;

        const fftSize = 1024;
        this.fft = new FFT(fftSize);
        this.fftData = new Float32Array(fftSize / 2);
        this.fftPeakFreq = 0;

        this.settings = {
            ch1VoltageScale: 5,
            ch2VoltageScale: 5,
            timeScale: 5,
            scrollSpeed: 5,
            ch1Color: '#00ff88',
            ch2Color: '#00d4ff',
            mathColor: '#ffaa00',
            showGrid: true,
            showMeasurements: true,
            showFFT: false,
            triggerMode: 'auto',
            triggerLevel: 0,
            triggerEdge: 'rising',
            triggerHysteresis: 500,
            noiseFilterSize: 5,
            triggerDebounce: 100,
            ch1Offset: 0,
            ch2Offset: 50,
            mathOperation: 'add',
            mathGain: 10,
            fftWindow: 'hann',
            exportChannel: 'both'
        };
        
        this.triggerState = {
            armed: true,
            lastTriggerTime: 0,
            aboveLevel: false
        };

        this.measurements = {
            vpp: 0,
            vmax: 0,
            vmin: 0,
            freq: 0,
            period: 0
        };

        this.init();
    }

    init() {
        this.resizeCanvas();
        this.setupEventListeners();
        this.setupDataChannel();
        this.drawGrid();
        this.updateTimeMarkers();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const wrapper = this.canvas.parentElement;
        const rect = wrapper.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.ctx.scale(dpr, dpr);
        
        this.offscreenCanvas.width = rect.width * dpr;
        this.offscreenCanvas.height = rect.height * dpr;
        this.offscreenCtx.scale(dpr, dpr);
        
        this.width = rect.width;
        this.height = rect.height;
        this.gridDirty = true;
        
        this.draw();
    }

    setupEventListeners() {
        document.getElementById('btnConnect').addEventListener('click', () => this.connect());
        document.getElementById('btnDisconnect').addEventListener('click', () => this.disconnect());
        document.getElementById('btnStart').addEventListener('click', () => this.startCapture());
        document.getElementById('btnStop').addEventListener('click', () => this.stopCapture());
        document.getElementById('btnExportCSV').addEventListener('click', () => this.exportCSV());
        document.getElementById('btnCapture').addEventListener('click', () => this.captureScreenshot());

        document.getElementById('ch1Enabled').addEventListener('change', (e) => {
            this.channels.ch1.enabled = e.target.checked;
            this.draw();
        });

        document.getElementById('ch2Enabled').addEventListener('change', (e) => {
            this.channels.ch2.enabled = e.target.checked;
            this.draw();
        });

        document.getElementById('mathEnabled').addEventListener('change', (e) => {
            this.channels.math.enabled = e.target.checked;
            this.draw();
        });

        document.getElementById('voltageScale').addEventListener('change', (e) => {
            this.settings.ch1VoltageScale = parseInt(e.target.value);
            this.setVoltageScale(this.settings.ch1VoltageScale);
            this.draw();
        });

        document.getElementById('ch2VoltageScale').addEventListener('change', (e) => {
            this.settings.ch2VoltageScale = parseInt(e.target.value);
            this.draw();
        });

        document.getElementById('timeScale').addEventListener('change', (e) => {
            this.settings.timeScale = parseInt(e.target.value);
            this.setTimeScale(this.settings.timeScale);
            this.updateTimeMarkers();
            this.draw();
        });

        document.getElementById('scrollSpeed').addEventListener('input', (e) => {
            this.settings.scrollSpeed = parseInt(e.target.value);
            document.getElementById('scrollSpeedValue').textContent = this.settings.scrollSpeed;
        });

        document.getElementById('ch1Offset').addEventListener('input', (e) => {
            this.settings.ch1Offset = parseInt(e.target.value);
            document.getElementById('ch1OffsetValue').textContent = this.settings.ch1Offset;
            this.draw();
        });

        document.getElementById('ch2Offset').addEventListener('input', (e) => {
            this.settings.ch2Offset = parseInt(e.target.value);
            document.getElementById('ch2OffsetValue').textContent = this.settings.ch2Offset;
            this.draw();
        });

        document.getElementById('triggerMode').addEventListener('change', (e) => {
            this.settings.triggerMode = e.target.value;
        });

        document.getElementById('triggerLevel').addEventListener('input', (e) => {
            this.settings.triggerLevel = parseInt(e.target.value);
            document.getElementById('triggerLevelValue').textContent = this.settings.triggerLevel;
            this.setTrigger(this.settings.triggerLevel, this.settings.triggerEdge === 'rising');
            this.draw();
        });

        document.getElementById('triggerEdge').addEventListener('change', (e) => {
            this.settings.triggerEdge = e.target.value;
            this.setTrigger(this.settings.triggerLevel, this.settings.triggerEdge === 'rising');
        });

        document.getElementById('triggerHysteresis').addEventListener('input', (e) => {
            this.settings.triggerHysteresis = parseInt(e.target.value);
            document.getElementById('triggerHysteresisValue').textContent = this.settings.triggerHysteresis;
        });

        document.getElementById('triggerDebounce').addEventListener('input', (e) => {
            this.settings.triggerDebounce = parseInt(e.target.value);
            document.getElementById('triggerDebounceValue').textContent = this.settings.triggerDebounce;
        });

        document.getElementById('noiseFilterSize').addEventListener('change', (e) => {
            this.settings.noiseFilterSize = parseInt(e.target.value);
        });

        document.getElementById('mathOperation').addEventListener('change', (e) => {
            this.settings.mathOperation = e.target.value;
        });

        document.getElementById('mathGain').addEventListener('input', (e) => {
            this.settings.mathGain = parseInt(e.target.value);
            document.getElementById('mathGainValue').textContent = (this.settings.mathGain / 10).toFixed(1) + 'x';
        });

        document.getElementById('fftWindow').addEventListener('change', (e) => {
            this.settings.fftWindow = e.target.value;
        });

        document.getElementById('ch1Color').addEventListener('input', (e) => {
            this.settings.ch1Color = e.target.value;
            this.draw();
        });

        document.getElementById('ch2Color').addEventListener('input', (e) => {
            this.settings.ch2Color = e.target.value;
            this.draw();
        });

        document.getElementById('mathColor').addEventListener('input', (e) => {
            this.settings.mathColor = e.target.value;
            this.draw();
        });

        document.getElementById('showGrid').addEventListener('change', (e) => {
            this.settings.showGrid = e.target.checked;
            this.gridDirty = true;
            this.draw();
        });

        document.getElementById('showMeasurements').addEventListener('change', (e) => {
            this.settings.showMeasurements = e.target.checked;
            document.getElementById('measurementsOverlay').style.display = 
                e.target.checked ? 'block' : 'none';
        });

        document.getElementById('showFFT').addEventListener('change', (e) => {
            this.settings.showFFT = e.target.checked;
            document.getElementById('fftContainer').style.display = e.target.checked ? 'block' : 'none';
            document.getElementById('fftInfo').textContent = e.target.checked ? 'ON' : 'OFF';
            if (e.target.checked) {
                this.resizeFFTCanvas();
                this.updateFFTMarkers();
            }
            this.draw();
        });

        document.getElementById('exportChannel').addEventListener('change', (e) => {
            this.settings.exportChannel = e.target.value;
        });
    }

    setupDataChannel() {
        ipcRenderer.on('datachannel:data', (event, data) => {
            if (this.isCapturing) {
                this.processData(data);
            }
        });
    }

    async connect() {
        try {
            const success = await ipcRenderer.invoke('oscilloscope:open');
            if (success) {
                this.isConnected = true;
                this.updateConnectionStatus();
                this.enableControls(true);
            }
        } catch (err) {
            console.error('Connection error:', err);
        }
    }

    async disconnect() {
        try {
            await this.stopCapture();
            await ipcRenderer.invoke('oscilloscope:close');
            this.isConnected = false;
            this.isCapturing = false;
            this.waveformData = [];
            this.updateConnectionStatus();
            this.enableControls(false);
            this.draw();
        } catch (err) {
            console.error('Disconnect error:', err);
        }
    }

    async startCapture() {
        if (!this.isConnected) return;
        
        try {
            const success = await ipcRenderer.invoke('oscilloscope:startCapture');
            if (success) {
                this.isCapturing = true;
                this.channels.ch1.length = 0;
                this.channels.ch2.length = 0;
                this.channels.math.length = 0;
                this.triggerState.armed = true;
                await ipcRenderer.invoke('datachannel:start', 16);
                this.updateCaptureStatus();
            }
        } catch (err) {
            console.error('Start capture error:', err);
        }
    }

    async exportCSV() {
        try {
            const result = await dialog.showSaveDialog({
                title: '导出波形数据',
                defaultPath: `oscilloscope_${new Date().toISOString().slice(0, 10)}.csv`,
                filters: [
                    { name: 'CSV 文件', extensions: ['csv'] },
                    { name: '所有文件', extensions: ['*'] }
                ]
            });

            if (result.canceled || !result.filePath) return;

            const csvContent = this.generateCSVContent();
            fs.writeFileSync(result.filePath, csvContent, 'utf8');
            
            alert(`数据已导出到:\n${result.filePath}`);
        } catch (err) {
            console.error('Export CSV error:', err);
            alert('导出失败: ' + err.message);
        }
    }

    generateCSVContent() {
        const vRange = 32768;
        const rows = [];
        
        const headers = ['Sample'];
        const channels = [];
        
        if (this.settings.exportChannel === 'ch1' || this.settings.exportChannel === 'both' || this.settings.exportChannel === 'all') {
            headers.push('CH1 (V)');
            channels.push({ data: this.channels.ch1, scale: this.settings.ch1VoltageScale });
        }
        if (this.settings.exportChannel === 'ch2' || this.settings.exportChannel === 'both' || this.settings.exportChannel === 'all') {
            headers.push('CH2 (V)');
            channels.push({ data: this.channels.ch2, scale: this.settings.ch2VoltageScale });
        }
        if (this.settings.exportChannel === 'all' && this.channels.math.enabled) {
            headers.push('MATH');
            channels.push({ data: this.channels.math, scale: this.settings.ch1VoltageScale });
        }
        
        rows.push(headers.join(','));
        
        const maxLen = Math.min(...channels.map(c => c.data.length), this.maxDataPoints);
        
        for (let i = 0; i < maxLen; i++) {
            const row = [i];
            for (const ch of channels) {
                const voltage = (ch.data.data[i] / vRange) * (ch.scale * 10);
                row.push(voltage.toFixed(6));
            }
            rows.push(row.join(','));
        }
        
        return rows.join('\n');
    }

    async captureScreenshot() {
        try {
            const result = await dialog.showSaveDialog({
                title: '保存截屏',
                defaultPath: `screenshot_${new Date().toISOString().slice(0, 10)}.png`,
                filters: [
                    { name: 'PNG 图片', extensions: ['png'] },
                    { name: '所有文件', extensions: ['*'] }
                ]
            });

            if (result.canceled || !result.filePath) return;

            const dataURL = this.canvas.toDataURL('image/png');
            const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
            const binaryData = Buffer.from(base64Data, 'base64');
            
            fs.writeFileSync(result.filePath, binaryData);
            
            alert(`截屏已保存到:\n${result.filePath}`);
        } catch (err) {
            console.error('Screenshot error:', err);
            alert('截屏失败: ' + err.message);
        }
    }

    async stopCapture() {
        try {
            await ipcRenderer.invoke('datachannel:stop');
            await ipcRenderer.invoke('oscilloscope:stopCapture');
            this.isCapturing = false;
            this.updateCaptureStatus();
        } catch (err) {
            console.error('Stop capture error:', err);
        }
    }

    async setVoltageScale(scale) {
        try {
            await ipcRenderer.invoke('oscilloscope:setVoltageScale', scale);
        } catch (err) {
            console.error('Set voltage scale error:', err);
        }
    }

    async setTimeScale(scale) {
        try {
            await ipcRenderer.invoke('oscilloscope:setTimeScale', scale);
        } catch (err) {
            console.error('Set time scale error:', err);
        }
    }

    async setTrigger(level, edge) {
        try {
            await ipcRenderer.invoke('oscilloscope:setTrigger', level, edge);
        } catch (err) {
            console.error('Set trigger error:', err);
        }
    }

    processData(data) {
        if (!data || data.length === 0) return;

        const triggeredData = this.applyTrigger(data);
        
        if (triggeredData.length > 0) {
            this.addChannelData('ch1', triggeredData);
            this.generateCH2Data(triggeredData);
            
            if (this.channels.math.enabled) {
                this.calculateMath();
            }
        }

        this.sampleCount += data.length;
        const now = Date.now();
        if (now - this.lastSampleTime >= 1000) {
            const rate = Math.round(this.sampleCount / ((now - this.lastSampleTime) / 1000));
            document.getElementById('sampleRate').textContent = `采样率: ${rate.toLocaleString()}`;
            this.sampleCount = 0;
            this.lastSampleTime = now;
        }

        if (this.settings.showFFT && this.channels.ch1.length > 512) {
            this.calculateFFT();
        }

        this.calculateMeasurements();
        this.scheduleDraw();
    }

    addChannelData(channel, data) {
        const ch = this.channels[channel];
        const step = this.settings.scrollSpeed;
        const newPoints = Math.floor(data.length / step);
        const availableSlots = this.maxDataPoints - ch.length;
        
        if (newPoints > availableSlots) {
            const overflow = newPoints - availableSlots;
            ch.data.copyWithin(0, overflow * 2);
            ch.length -= overflow;
        }
        
        for (let i = 0, j = 0; i < data.length && j < newPoints; i += step, j++) {
            ch.data[ch.length + j] = data[i];
        }
        ch.length += Math.min(newPoints, availableSlots);
    }

    generateCH2Data(ch1Data) {
        if (!this.channels.ch2.enabled) return;
        
        const ch2Data = new Array(ch1Data.length);
        for (let i = 0; i < ch1Data.length; i++) {
            const phase = i * 0.05 + Date.now() * 0.001;
            ch2Data[i] = Math.sin(phase) * 10000 + (Math.random() - 0.5) * 1000;
        }
        this.addChannelData('ch2', ch2Data);
    }

    calculateMath() {
        const ch1 = this.channels.ch1;
        const ch2 = this.channels.ch2;
        const math = this.channels.math;
        const gain = this.settings.mathGain / 10;
        const len = Math.min(ch1.length, ch2.length);
        
        math.length = len;
        
        for (let i = 0; i < len; i++) {
            switch (this.settings.mathOperation) {
                case 'add':
                    math.data[i] = (ch1.data[i] + ch2.data[i]) * gain;
                    break;
                case 'subtract':
                    math.data[i] = (ch1.data[i] - ch2.data[i]) * gain;
                    break;
                case 'multiply':
                    math.data[i] = (ch1.data[i] * ch2.data[i] / 32768) * gain;
                    break;
                default:
                    math.data[i] = ch1.data[i] * gain;
            }
        }
    }

    calculateFFT() {
        const ch1 = this.channels.ch1;
        if (ch1.length < 1024) return;
        
        const input = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) {
            input[i] = ch1.data[ch1.length - 1024 + i] || 0;
        }
        
        const windowed = WindowFunction.apply(input, this.settings.fftWindow);
        this.fftData = this.fft.transform(windowed);
        
        let peakIdx = 0;
        let peakVal = 0;
        for (let i = 1; i < this.fftData.length; i++) {
            if (this.fftData[i] > peakVal) {
                peakVal = this.fftData[i];
                peakIdx = i;
            }
        }
        
        const sampleRate = 100000;
        this.fftPeakFreq = (peakIdx * sampleRate) / 1024;
        document.getElementById('fftPeakValue').textContent = this.fftPeakFreq.toFixed(1) + ' Hz';
    }

    resizeFFTCanvas() {
        const container = document.getElementById('fftContainer');
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.fftCanvas.width = rect.width * dpr;
        this.fftCanvas.height = rect.height * dpr;
        this.fftCanvas.style.width = rect.width + 'px';
        this.fftCanvas.style.height = rect.height + 'px';
        this.fftCtx.scale(dpr, dpr);
        
        this.fftWidth = rect.width;
        this.fftHeight = rect.height;
    }

    updateFFTMarkers() {
        const markers = document.getElementById('fftMarkers');
        markers.innerHTML = '';
        const sampleRate = 100000;
        
        for (let i = 0; i <= 5; i++) {
            const freq = (i / 5) * (sampleRate / 2);
            const span = document.createElement('span');
            span.textContent = freq >= 1000 ? (freq / 1000).toFixed(1) + 'k' : freq.toFixed(0);
            markers.appendChild(span);
        }
    }

    scheduleDraw() {
        if (this.isDrawing) return;
        this.isDrawing = true;
        
        this.animationFrameId = requestAnimationFrame(() => {
            this.draw();
            this.isDrawing = false;
        });
    }

    applyNoiseFilter(data) {
        const filterSize = this.settings.noiseFilterSize;
        if (filterSize <= 1 || data.length < filterSize) {
            return data;
        }

        const filtered = new Array(data.length);
        const halfFilter = Math.floor(filterSize / 2);

        for (let i = 0; i < data.length; i++) {
            let sum = 0;
            let count = 0;
            for (let j = -halfFilter; j <= halfFilter; j++) {
                const idx = i + j;
                if (idx >= 0 && idx < data.length) {
                    sum += data[idx];
                    count++;
                }
            }
            filtered[i] = Math.round(sum / count);
        }

        return filtered;
    }

    applyTrigger(data) {
        if (this.settings.triggerMode === 'auto') {
            return this.applyNoiseFilter(data);
        }

        const filteredData = this.applyNoiseFilter(data);
        const level = this.settings.triggerLevel;
        const hysteresis = this.settings.triggerHysteresis;
        const isRising = this.settings.triggerEdge === 'rising';
        const now = Date.now();

        if (now - this.triggerState.lastTriggerTime < this.settings.triggerDebounce) {
            return this.settings.triggerMode === 'normal' ? [] : filteredData;
        }

        const highThreshold = level + hysteresis;
        const lowThreshold = level - hysteresis;
        let triggerIndex = -1;

        for (let i = 1; i < filteredData.length; i++) {
            const prev = filteredData[i - 1];
            const curr = filteredData[i];

            if (isRising) {
                if (prev < lowThreshold) {
                    this.triggerState.armed = true;
                    this.triggerState.aboveLevel = false;
                }
                if (this.triggerState.armed && curr >= highThreshold) {
                    triggerIndex = i;
                    this.triggerState.armed = false;
                    this.triggerState.lastTriggerTime = now;
                    this.triggerState.aboveLevel = true;
                    break;
                }
            } else {
                if (prev > highThreshold) {
                    this.triggerState.armed = true;
                    this.triggerState.aboveLevel = true;
                }
                if (this.triggerState.armed && curr <= lowThreshold) {
                    triggerIndex = i;
                    this.triggerState.armed = false;
                    this.triggerState.lastTriggerTime = now;
                    this.triggerState.aboveLevel = false;
                    break;
                }
            }
        }

        if (triggerIndex >= 0) {
            if (this.settings.triggerMode === 'single') {
            }
            return filteredData.slice(triggerIndex);
        } else if (this.settings.triggerMode === 'normal') {
            return [];
        }

        return filteredData;
    }

    updateMeasurementsDisplay() {
        document.getElementById('vppValue').textContent = `${this.measurements.vpp.toFixed(2)} V`;
        document.getElementById('vmaxValue').textContent = `${this.measurements.vmax.toFixed(2)} V`;
        document.getElementById('vminValue').textContent = `${this.measurements.vmin.toFixed(2)} V`;
        document.getElementById('freqValue').textContent = `${this.measurements.freq.toFixed(2)} Hz`;
        document.getElementById('periodValue').textContent = `${this.measurements.period.toFixed(2)} ms`;
    }

    updateTimeMarkers() {
        const markers = document.getElementById('timeMarkers');
        const divisions = 10;
        markers.innerHTML = '';
        
        for (let i = 0; i <= divisions; i++) {
            const time = (i - divisions / 2) * this.settings.timeScale;
            const span = document.createElement('span');
            span.textContent = `${time}ms`;
            markers.appendChild(span);
        }
    }

    draw() {
        if (this.settings.showGrid && this.gridDirty) {
            this.renderGridToOffscreen();
            this.gridDirty = false;
        }

        if (this.settings.showGrid) {
            this.ctx.drawImage(this.offscreenCanvas, 0, 0);
        } else {
            this.ctx.fillStyle = '#0a0a1a';
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        this.drawWaveform();
        this.drawTriggerLine();
    }

    renderGridToOffscreen() {
        this.offscreenCtx.fillStyle = '#0a0a1a';
        this.offscreenCtx.fillRect(0, 0, this.width, this.height);

        const gridColor = 'rgba(0, 212, 255, 0.1)';
        const majorGridColor = 'rgba(0, 212, 255, 0.2)';
        
        this.offscreenCtx.strokeStyle = gridColor;
        this.offscreenCtx.lineWidth = 1;

        const hDivisions = 10;
        const vDivisions = 8;

        for (let i = 0; i <= hDivisions; i++) {
            const x = (i / hDivisions) * this.width;
            this.offscreenCtx.beginPath();
            this.offscreenCtx.moveTo(x, 0);
            this.offscreenCtx.lineTo(x, this.height);
            this.offscreenCtx.stroke();
        }

        for (let i = 0; i <= vDivisions; i++) {
            const y = (i / vDivisions) * this.height;
            this.offscreenCtx.strokeStyle = i === vDivisions / 2 ? majorGridColor : gridColor;
            this.offscreenCtx.beginPath();
            this.offscreenCtx.moveTo(0, y);
            this.offscreenCtx.lineTo(this.width, y);
            this.offscreenCtx.stroke();
        }

        this.offscreenCtx.strokeStyle = majorGridColor;
        this.offscreenCtx.lineWidth = 2;
        this.offscreenCtx.beginPath();
        this.offscreenCtx.moveTo(0, this.height / 2);
        this.offscreenCtx.lineTo(this.width, this.height / 2);
        this.offscreenCtx.stroke();
    }

    drawWaveform() {
        if (this.channels.ch1.enabled && this.channels.ch1.length >= 2) {
            this.drawChannel('ch1', this.settings.ch1Color, this.settings.ch1VoltageScale, this.settings.ch1Offset);
        }

        if (this.channels.ch2.enabled && this.channels.ch2.length >= 2) {
            this.drawChannel('ch2', this.settings.ch2Color, this.settings.ch2VoltageScale, this.settings.ch2Offset);
        }

        if (this.channels.math.enabled && this.channels.math.length >= 2) {
            this.drawMathChannel();
        }

        if (this.settings.showFFT) {
            this.drawFFT();
        }
    }

    drawChannel(channelName, color, voltageScale, offset) {
        const ch = this.channels[channelName];
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 6;

        const vRange = 32768;
        const centerY = this.height / 2 + offset;
        const amplitude = (this.height / 2) * (voltageScale / 10);
        const xScale = this.width / this.maxDataPoints;

        this.ctx.beginPath();

        const data = ch.data;
        const len = ch.length;
        
        let x = 0;
        let y = centerY - (data[0] / vRange) * amplitude;
        this.ctx.moveTo(x, y);

        for (let i = 1; i < len; i++) {
            x = i * xScale;
            y = centerY - (data[i] / vRange) * amplitude;
            this.ctx.lineTo(x, y);
        }

        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    drawMathChannel() {
        const math = this.channels.math;
        this.ctx.strokeStyle = this.settings.mathColor;
        this.ctx.lineWidth = 2;
        this.ctx.shadowColor = this.settings.mathColor;
        this.ctx.shadowBlur = 6;

        const vRange = 32768;
        const centerY = this.height / 2;
        const amplitude = (this.height / 2) * (this.settings.ch1VoltageScale / 10);
        const xScale = this.width / this.maxDataPoints;

        this.ctx.beginPath();

        const data = math.data;
        const len = math.length;
        
        let x = 0;
        let y = centerY - (data[0] / vRange) * amplitude;
        this.ctx.moveTo(x, y);

        for (let i = 1; i < len; i++) {
            x = i * xScale;
            y = centerY - (data[i] / vRange) * amplitude;
            this.ctx.lineTo(x, y);
        }

        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    drawFFT() {
        if (!this.fftData || this.fftData.length === 0) return;

        this.fftCtx.fillStyle = '#0a0a1a';
        this.fftCtx.fillRect(0, 0, this.fftWidth, this.fftHeight);

        const barWidth = this.fftWidth / (this.fftData.length / 2);
        const maxMag = Math.max(...this.fftData.slice(1));
        
        this.fftCtx.fillStyle = this.settings.mathColor;
        this.fftCtx.shadowColor = this.settings.mathColor;
        this.fftCtx.shadowBlur = 4;

        for (let i = 1; i < this.fftData.length / 2; i++) {
            const x = i * barWidth * 2;
            const height = (this.fftData[i] / maxMag) * (this.fftHeight - 20);
            this.fftCtx.fillRect(x, this.fftHeight - height - 20, barWidth, height);
        }

        this.fftCtx.shadowBlur = 0;

        this.fftCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.fftCtx.lineWidth = 1;
        for (let i = 1; i <= 4; i++) {
            const y = (i / 5) * (this.fftHeight - 20);
            this.fftCtx.beginPath();
            this.fftCtx.moveTo(0, y);
            this.fftCtx.lineTo(this.fftWidth, y);
            this.fftCtx.stroke();
        }
    }

    drawTriggerLine() {
        if (this.settings.triggerMode === 'auto') return;

        const vRange = 32768;
        const centerY = this.height / 2 + this.settings.ch1Offset;
        const amplitude = (this.height / 2) * (this.settings.voltageScale / 10);
        const y = centerY - (this.settings.triggerLevel / vRange) * amplitude;

        this.ctx.strokeStyle = '#ffaa00';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.width, y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        this.ctx.fillStyle = '#ffaa00';
        this.ctx.font = '12px monospace';
        this.ctx.fillText('T', 5, y - 5);
    }

    updateConnectionStatus() {
        const status = document.getElementById('connectionStatus');
        if (this.isConnected) {
            status.textContent = '已连接';
            status.className = 'status connected';
        } else {
            status.textContent = '未连接';
            status.className = 'status disconnected';
        }
    }

    updateCaptureStatus() {
        const status = document.getElementById('captureStatus');
        if (this.isCapturing) {
            status.textContent = '采集中';
            status.className = 'status capturing';
        } else {
            status.textContent = '已停止';
            status.className = 'status stopped';
        }
    }

    enableControls(enabled) {
        document.getElementById('btnConnect').disabled = enabled;
        document.getElementById('btnDisconnect').disabled = !enabled;
        document.getElementById('btnStart').disabled = !enabled;
        document.getElementById('btnStop').disabled = !enabled || !this.isCapturing;
        document.getElementById('btnExportCSV').disabled = !enabled;
        document.getElementById('btnCapture').disabled = !enabled;

        const controls = [
            'ch1Enabled', 'ch2Enabled', 'mathEnabled',
            'voltageScale', 'ch2VoltageScale', 'timeScale', 'scrollSpeed', 
            'ch1Offset', 'ch2Offset',
            'triggerMode', 'triggerLevel', 'triggerEdge',
            'triggerHysteresis', 'triggerDebounce', 'noiseFilterSize',
            'mathOperation', 'mathGain', 'fftWindow',
            'ch1Color', 'ch2Color', 'mathColor',
            'showGrid', 'showMeasurements', 'showFFT',
            'exportChannel'
        ];

        controls.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !enabled;
        });
    }

    calculateMeasurements() {
        if (this.channels.ch1.length < 2) return;

        let max = -32768;
        let min = 32767;

        const data = this.channels.ch1.data;
        const len = this.channels.ch1.length;
        
        for (let i = 0; i < len; i++) {
            const val = data[i];
            if (val > max) max = val;
            if (val < min) min = val;
        }

        const vRange = 32768;
        const voltageMultiplier = (this.settings.ch1VoltageScale * 10) / vRange;
        
        this.measurements.vpp = (max - min) * voltageMultiplier;
        this.measurements.vmax = max * voltageMultiplier;
        this.measurements.vmin = min * voltageMultiplier;

        this.measurements.freq = this.calculateFrequency();
        this.measurements.period = this.measurements.freq > 0 ? 1000 / this.measurements.freq : 0;

        this.updateMeasurementsDisplay();
    }

    calculateFrequency() {
        if (this.channels.ch1.length < 100) return 0;

        const data = this.channels.ch1.data;
        const len = this.channels.ch1.length;
        
        let sum = 0;
        for (let i = 0; i < len; i++) {
            sum += data[i];
        }
        const avg = sum / len;
        
        let crossings = 0;
        let lastCrossingIndex = -1;
        let periods = 0;

        for (let i = 1; i < len; i++) {
            const prev = data[i - 1];
            const curr = data[i];
            
            if (prev < avg && curr >= avg) {
                crossings++;
                if (lastCrossingIndex >= 0) {
                    periods += i - lastCrossingIndex;
                }
                lastCrossingIndex = i;
            }
        }

        if (crossings < 2) return 0;

        const avgPeriod = periods / (crossings - 1);
        const samplesPerMs = 32;
        const freq = 1000 / (avgPeriod / samplesPerMs);
        
        return Math.round(freq * 100) / 100;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new OscilloscopeRenderer();
});
