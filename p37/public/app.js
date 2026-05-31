class MPCABR {
    constructor(options = {}) {
        this.horizon = options.horizon || 5;
        this.bufferMin = options.bufferMin || 5;
        this.bufferMax = options.bufferMax || 30;
        this.lookbackWindow = options.lookbackWindow || 10;
        this.throughputHistory = [];
        this.bufferHistory = [];
        this.segmentDuration = options.segmentDuration || 2;
        this.lastThroughput = 0;
        this.currentBitrate = 0;
        this.bitrates = [];
    }

    setBitrates(bitrates) {
        this.bitrates = bitrates.sort((a, b) => a - b);
    }

    updateThroughput(throughputBps, segmentDuration = 2) {
        this.throughputHistory.push({
            throughput: throughputBps,
            timestamp: Date.now(),
            duration: segmentDuration
        });

        if (this.throughputHistory.length > this.lookbackWindow) {
            this.throughputHistory.shift();
        }

        this.lastThroughput = this.getHarmonicMeanThroughput();
    }

    getHarmonicMeanThroughput() {
        if (this.throughputHistory.length === 0) return 1000000;

        let sum = 0;
        for (const entry of this.throughputHistory) {
            sum += 1 / entry.throughput;
        }

        return this.throughputHistory.length / sum;
    }

    getPredictedThroughput() {
        if (this.throughputHistory.length < 2) {
            return this.lastThroughput || 1000000;
        }

        const recent = this.throughputHistory.slice(-5);
        const x = recent.map((_, i) => i);
        const y = recent.map(e => e.throughput);

        const n = x.length;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
        const sumX2 = x.reduce((a, b) => a + b * b, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const prediction = Math.max(
            this.bitrates[0] * 1.5,
            intercept + slope * (n + this.horizon / 2)
        );

        return Math.min(prediction, this.lastThroughput * 1.5);
    }

    predictBufferLevel(startBuffer, bitrate, throughput, segmentDuration) {
        const downloadTime = (bitrate * segmentDuration) / (8 * throughput);
        return Math.max(0, startBuffer - downloadTime + segmentDuration);
    }

    calculateRebufferProbability(buffer, bitrate, throughput) {
        const downloadTime = (bitrate * this.segmentDuration) / (8 * throughput);
        if (buffer < downloadTime) {
            return 1 - (buffer / downloadTime);
        }
        return 0;
    }

    calculateQualityScore(bitrate) {
        const index = this.bitrates.indexOf(bitrate);
        if (index === -1) return 0;
        return index / (this.bitrates.length - 1);
    }

    calculateSwitchCost(currentBitrate, nextBitrate) {
        if (currentBitrate === 0) return 0;
        const diff = Math.abs(nextBitrate - currentBitrate);
        const maxDiff = this.bitrates[this.bitrates.length - 1] - this.bitrates[0];
        return 0.3 * (diff / maxDiff);
    }

    calculateBufferPenalty(buffer) {
        if (buffer < this.bufferMin) {
            return 0.5 * Math.pow(1 - buffer / this.bufferMin, 2);
        }
        if (buffer > this.bufferMax) {
            return 0.1;
        }
        return 0;
    }

    selectOptimalBitrate(currentBuffer, currentBitrate = null) {
        if (this.bitrates.length === 0) {
            return null;
        }

        const predictedThroughput = this.getPredictedThroughput();
        const currentBr = currentBitrate || this.bitrates[0];

        let bestBitrate = this.bitrates[0];
        let bestScore = -Infinity;

        for (const bitrate of this.bitrates) {
            const totalScore = this.evaluateBitrateTrajectory(
                bitrate,
                currentBuffer,
                currentBr,
                predictedThroughput
            );

            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestBitrate = bitrate;
            }
        }

        this.currentBitrate = bestBitrate;
        return bestBitrate;
    }

    evaluateBitrateTrajectory(initialBitrate, initialBuffer, currentBitrate, throughput) {
        let totalScore = 0;
        let currentBuffer = initialBuffer;
        let prevBitrate = currentBitrate;
        const alpha = 0.8;
        const beta = 0.15;
        const gamma = 0.05;

        for (let t = 0; t < this.horizon; t++) {
            const bitrate = initialBitrate;

            const qualityScore = this.calculateQualityScore(bitrate);
            const switchCost = t === 0 ? this.calculateSwitchCost(prevBitrate, bitrate) : 0;
            const rebufferProb = this.calculateRebufferProbability(currentBuffer, bitrate, throughput);
            const bufferPenalty = this.calculateBufferPenalty(currentBuffer);

            const stepScore = alpha * qualityScore - beta * switchCost - gamma * (rebufferProb + bufferPenalty);
            totalScore += stepScore * Math.pow(0.95, t);

            currentBuffer = this.predictBufferLevel(currentBuffer, bitrate, throughput, this.segmentDuration);
            prevBitrate = bitrate;

            if (currentBuffer <= 0) {
                totalScore -= 5;
                break;
            }
        }

        return totalScore;
    }

    updateBuffer(bufferLevel) {
        this.bufferHistory.push({
            buffer: bufferLevel,
            timestamp: Date.now()
        });

        if (this.bufferHistory.length > this.lookbackWindow) {
            this.bufferHistory.shift();
        }
    }

    getNextBitrate(bufferLevel, currentBitrate = null) {
        this.updateBuffer(bufferLevel);
        return this.selectOptimalBitrate(bufferLevel, currentBitrate);
    }

    getState() {
        return {
            bitrates: this.bitrates,
            lastThroughput: this.lastThroughput,
            predictedThroughput: this.getPredictedThroughput(),
            throughputHistory: this.throughputHistory,
            bufferHistory: this.bufferHistory,
            horizon: this.horizon,
            bufferMin: this.bufferMin,
            bufferMax: this.bufferMax,
            currentBitrate: this.currentBitrate
        };
    }

    reset() {
        this.throughputHistory = [];
        this.bufferHistory = [];
        this.lastThroughput = 0;
        this.currentBitrate = 0;
    }
}

class HLSParser {
    parse(content) {
        const lines = content.split('\n').map(l => l.trim()).filter(l => l);
        const result = {
            segments: [],
            targetDuration: 0,
            version: 3,
            isMaster: false,
            playlists: []
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('#EXT-X-STREAM-INF')) {
                result.isMaster = true;
                const attrs = this.parseAttributes(line);
                const uri = lines[++i];
                result.playlists.push({
                    ...attrs,
                    uri: uri
                });
            } else if (line.startsWith('#EXT-X-TARGETDURATION')) {
                result.targetDuration = parseInt(line.split(':')[1]);
            } else if (line.startsWith('#EXT-X-VERSION')) {
                result.version = parseInt(line.split(':')[1]);
            } else if (line.startsWith('#EXTINF')) {
                const duration = parseFloat(line.split(':')[1].split(',')[0]);
                const uri = lines[++i];
                result.segments.push({
                    duration: duration,
                    uri: uri
                });
            }
        }

        return result;
    }

    parseAttributes(line) {
        const attrs = {};
        const match = line.match(/:BANDWIDTH=(\d+),RESOLUTION=(\d+x\d+)/);
        if (match) {
            attrs.bandwidth = parseInt(match[1]);
            attrs.resolution = match[2];
        }
        return attrs;
    }
}

class HLSPlayer {
    constructor(videoElement) {
        this.video = videoElement;
        this.mediaSource = null;
        this.sourceBuffer = null;
        this.parser = new HLSParser();
        this.abr = new MPCABR({ segmentDuration: 2 });
        
        this.currentVideoId = null;
        this.layers = [];
        this.currentLayerIndex = 0;
        this.currentSegmentIndex = 0;
        this.isPlaying = false;
        this.autoSwitch = true;
        this.segmentQueue = [];
        this.isLoading = false;
        
        this.masterPlaylist = null;
        this.mediaPlaylists = {};
        this.baseUrl = '';
        
        this.init();
    }

    init() {
        if ('MediaSource' in window) {
            this.setupMediaSource();
        } else {
            this.showStatus('错误: 您的浏览器不支持 MediaSource Extensions', 'error');
        }

        this.video.addEventListener('progress', () => this.onProgress());
        this.video.addEventListener('playing', () => { this.isPlaying = true; });
        this.video.addEventListener('pause', () => { this.isPlaying = false; });
        this.video.addEventListener('waiting', () => this.showStatus('缓冲中...', 'info'));
    }

    setupMediaSource() {
        this.mediaSource = new MediaSource();
        this.video.src = URL.createObjectURL(this.mediaSource);
        
        this.mediaSource.addEventListener('sourceopen', () => {
            this.showStatus('MediaSource 已打开', 'info');
        });
    }

    async loadVideo(videoId, layers) {
        this.currentVideoId = videoId;
        this.layers = layers;
        this.currentSegmentIndex = 0;
        
        const bitrates = layers.map(l => l.bitrate * 1000);
        this.abr.setBitrates(bitrates);
        
        this.baseUrl = `/api/videos/${videoId}/hls`;
        
        try {
            const response = await fetch(`${this.baseUrl}/master.m3u8`);
            const content = await response.text();
            this.masterPlaylist = this.parser.parse(content);
            
            await this.loadMediaPlaylists();
            await this.startStreaming();
            
        } catch (e) {
            console.error('加载 HLS 失败:', e);
            this.showStatus('加载失败: ' + e.message, 'error');
        }
    }

    async loadMediaPlaylists() {
        for (let i = 0; i < this.layers.length; i++) {
            try {
                const response = await fetch(`${this.baseUrl}/layer_${i}/playlist.m3u8`);
                const content = await response.text();
                const playlist = this.parser.parse(content);
                this.mediaPlaylists[i] = playlist;
            } catch (e) {
                console.error(`加载层级 ${i} 播放列表失败:`, e);
            }
        }
    }

    async startStreaming() {
        if (this.mediaSource.readyState !== 'open') {
            await new Promise(resolve => {
                this.mediaSource.addEventListener('sourceopen', resolve, { once: true });
            });
        }

        if (!this.sourceBuffer) {
            const mimeCodec = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
            if (MediaSource.isTypeSupported(mimeCodec)) {
                this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeCodec);
                this.sourceBuffer.addEventListener('updateend', () => this.onBufferUpdateEnd());
                this.sourceBuffer.addEventListener('error', (e) => {
                    console.error('SourceBuffer 错误:', e);
                });
            } else {
                this.showStatus('不支持的编码格式', 'error');
                return;
            }
        }

        this.showStatus('开始 HLS 流播放 (MPC-ABR)', 'success');
        this.scheduleNextSegment();
    }

    scheduleNextSegment() {
        if (this.isLoading) return;

        const bufferLevel = this.getBufferLevel();
        if (bufferLevel > 30) {
            setTimeout(() => this.scheduleNextSegment(), 1000);
            return;
        }

        this.isLoading = true;
        this.loadNextSegment();
    }

    async loadNextSegment() {
        if (!this.mediaPlaylists[this.currentLayerIndex]) {
            this.isLoading = false;
            return;
        }

        const segments = this.mediaPlaylists[this.currentLayerIndex].segments;
        
        if (this.currentSegmentIndex >= segments.length) {
            this.isLoading = false;
            if (this.mediaSource.readyState === 'open') {
                this.mediaSource.endOfStream();
                this.showStatus('播放结束', 'info');
            }
            return;
        }

        if (this.autoSwitch) {
            const bufferLevel = this.getBufferLevel();
            const currentBitrate = this.layers[this.currentLayerIndex].bitrate * 1000;
            const optimalBitrate = this.abr.getNextBitrate(bufferLevel, currentBitrate);
            const newLayerIndex = this.layers.findIndex(l => l.bitrate * 1000 === optimalBitrate);
            
            if (newLayerIndex !== -1 && newLayerIndex !== this.currentLayerIndex) {
                this.currentLayerIndex = newLayerIndex;
                this.updateLayerUI();
                this.showABRStatus();
            }
        }

        const segment = segments[this.currentSegmentIndex];
        const segmentName = segment.uri.split('/').pop().replace('.ts', '').replace('segment_', '');
        
        const startTime = performance.now();
        
        try {
            const response = await fetch(
                `${this.baseUrl}/layer_${this.currentLayerIndex}/segment_${segmentName}.ts`
            );
            const arrayBuffer = await response.arrayBuffer();
            
            const downloadTime = (performance.now() - startTime) / 1000;
            const throughput = (arrayBuffer.byteLength * 8) / downloadTime;
            this.abr.updateThroughput(throughput, segment.duration);

            if (this.sourceBuffer && !this.sourceBuffer.updating) {
                this.sourceBuffer.appendBuffer(arrayBuffer);
            } else {
                this.segmentQueue.push(arrayBuffer);
            }

            this.currentSegmentIndex++;
            this.showABRStatus();

        } catch (e) {
            console.error('加载分片失败:', e);
            this.isLoading = false;
        }
    }

    onBufferUpdateEnd() {
        this.isLoading = false;
        
        if (this.segmentQueue.length > 0 && this.sourceBuffer && !this.sourceBuffer.updating) {
            const data = this.segmentQueue.shift();
            this.sourceBuffer.appendBuffer(data);
        } else {
            setTimeout(() => this.scheduleNextSegment(), 100);
        }
    }

    onProgress() {
    }

    getBufferLevel() {
        if (this.video.buffered.length > 0) {
            const currentTime = this.video.currentTime;
            const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
            return Math.max(0, bufferedEnd - currentTime);
        }
        return 0;
    }

    switchLayer(layerIndex) {
        if (layerIndex >= 0 && layerIndex < this.layers.length) {
            this.currentLayerIndex = layerIndex;
            this.updateLayerUI();
            this.showStatus(`手动切换到层级 ${layerIndex}`, 'info');
        }
    }

    updateLayerUI() {
        const layer = this.layers[this.currentLayerIndex];
        document.getElementById('currentLayer').textContent = 
            `${layer ? (layer.layer_type === 'base' ? '基础层' : '增强层') : '未知'} (${this.currentLayerIndex})`;
        document.getElementById('layerSelect').value = this.currentLayerIndex;
    }

    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('mseStatus');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `mse-status status status-${type}`;
        }
    }

    showABRStatus() {
        const statusEl = document.getElementById('abrStatus');
        const state = this.abr.getState();
        const layer = this.layers[this.currentLayerIndex];
        
        if (statusEl && layer) {
            const throughput = (state.lastThroughput / 1000000).toFixed(2);
            const predicted = (state.predictedThroughput / 1000000).toFixed(2);
            const buffer = this.getBufferLevel().toFixed(1);
            
            statusEl.textContent = 
                `MPC-ABR | 当前: ${layer.bitrate}kbps (${layer.width}x${layer.height}) | ` +
                `实测: ${throughput}Mbps | 预测: ${predicted}Mbps | 缓冲: ${buffer}s | ` +
                `分片: ${this.currentSegmentIndex}`;
        }
    }

    destroy() {
        this.isPlaying = false;
        this.video.pause();
        this.abr.reset();
    }
}

class SVCPlayer {
    constructor() {
        this.videoElement = document.getElementById('videoPlayer');
        this.mediaSource = null;
        this.sourceBuffer = null;
        this.currentVideoId = null;
        this.currentLayer = 0;
        this.layers = [];
        this.autoSwitch = true;
        this.isPlaying = false;
        this.switchInProgress = false;
        this.pendingLayerSwitch = null;
        this.init();
    }

    init() {
        if ('MediaSource' in window) {
            this.setupMediaSource();
        } else {
            this.showMSEStatus('错误: 您的浏览器不支持 MediaSource Extensions', 'error');
        }

        this.videoElement.addEventListener('waiting', () => {
            this.showMSEStatus('缓冲中...', 'info');
        });

        this.videoElement.addEventListener('playing', () => {
            this.showMSEStatus(`正在播放 - 层级 ${this.currentLayer}`, 'success');
        });
    }

    setupMediaSource() {
        this.mediaSource = new MediaSource();
        this.videoElement.src = URL.createObjectURL(this.mediaSource);
        
        this.mediaSource.addEventListener('sourceopen', () => {
            this.showMSEStatus('MediaSource 已打开，等待视频...', 'info');
        });

        this.mediaSource.addEventListener('sourceended', () => {
            this.showMSEStatus('播放结束', 'info');
        });
    }

    async loadVideo(videoId) {
        this.currentVideoId = videoId;
        
        try {
            const response = await fetch(`/api/videos/${videoId}`);
            const data = await response.json();
            this.layers = data.layers;
            
            this.updateLayerInfo();
            this.currentLayer = 0;
            await this.switchLayer(this.currentLayer, true);
            
        } catch (e) {
            console.error('加载视频失败:', e);
            this.showMSEStatus('加载视频失败: ' + e.message, 'error');
        }
    }

    async switchLayer(layerIndex, initialLoad = false) {
        if (!this.currentVideoId || layerIndex >= this.layers.length) return;
        if (this.switchInProgress && !initialLoad) {
            this.pendingLayerSwitch = layerIndex;
            return;
        }

        this.switchInProgress = true;
        const targetLayer = layerIndex;

        this.currentLayer = targetLayer;
        this.updateLayerUI();

        this.showMSEStatus(`正在切换到 ${this.layers[targetLayer].layer_type} 层...`, 'info');

        const currentTime = this.videoElement.currentTime;
        const wasPlaying = !this.videoElement.paused;

        try {
            await this.loadLayerWithSeamlessSwitch(targetLayer, currentTime, wasPlaying, initialLoad);
        } catch (e) {
            console.error('切换层失败:', e);
            this.showMSEStatus('切换失败: ' + e.message, 'error');
        } finally {
            this.switchInProgress = false;
            
            if (this.pendingLayerSwitch !== null) {
                const nextSwitch = this.pendingLayerSwitch;
                this.pendingLayerSwitch = null;
                this.switchLayer(nextSwitch);
            }
        }
    }

    async loadLayerWithSeamlessSwitch(layerIndex, seekTime, wasPlaying, initialLoad) {
        const layer = this.layers[layerIndex];

        if (this.sourceBuffer) {
            try {
                if (this.mediaSource.readyState === 'open') {
                    if (!this.sourceBuffer.updating) {
                        this.sourceBuffer.abort();
                    }
                    this.mediaSource.removeSourceBuffer(this.sourceBuffer);
                }
            } catch (e) {
                console.log('清理旧 SourceBuffer:', e.message);
            }
            this.sourceBuffer = null;
        }

        const response = await fetch(`/api/videos/${this.currentVideoId}/layers/${layerIndex}/stream`);
        const arrayBuffer = await response.arrayBuffer();

        if (this.mediaSource.readyState !== 'open') {
            return new Promise((resolve) => {
                this.mediaSource.addEventListener('sourceopen', () => {
                    this.appendNewSourceBuffer(arrayBuffer, layer, seekTime, wasPlaying, initialLoad).then(resolve);
                }, { once: true });
            });
        }

        return this.appendNewSourceBuffer(arrayBuffer, layer, seekTime, wasPlaying, initialLoad);
    }

    appendNewSourceBuffer(arrayBuffer, layer, seekTime, wasPlaying, initialLoad) {
        return new Promise((resolve, reject) => {
            try {
                const mimeCodec = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
                
                if (!MediaSource.isTypeSupported(mimeCodec)) {
                    reject(new Error('不支持的视频编码格式'));
                    return;
                }

                this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeCodec);
                
                this.sourceBuffer.addEventListener('updateend', () => {
                    if (!this.sourceBuffer.updating) {
                        if (this.mediaSource.readyState === 'open') {
                            try {
                                this.mediaSource.endOfStream();
                            } catch (e) {
                                console.log('endOfStream:', e.message);
                            }
                        }
                        
                        if (!initialLoad) {
                            this.videoElement.currentTime = seekTime;
                        }
                        
                        if (wasPlaying || initialLoad) {
                            this.videoElement.play().catch(e => {
                                console.log('自动播放被阻止:', e.message);
                            });
                        }
                        
                        this.showMSEStatus(`已切换到 ${layer.layer_type} 层 (${layer.width}x${layer.height})`, 'success');
                        resolve();
                    }
                });

                this.sourceBuffer.addEventListener('error', (e) => {
                    console.error('SourceBuffer 错误:', e);
                    reject(new Error('加载视频时出错'));
                });

                this.sourceBuffer.appendBuffer(arrayBuffer);

            } catch (e) {
                reject(e);
            }
        });
    }

    updateLayerUI() {
        const layer = this.layers[this.currentLayer];
        document.getElementById('currentLayer').textContent = 
            `${layer ? (layer.layer_type === 'base' ? '基础层' : '增强层') : '未知'} (${this.currentLayer})`;
        document.getElementById('layerSelect').value = this.currentLayer;
        this.updateActiveLayerUI();
    }

    updateLayerInfo() {
        const container = document.getElementById('layerInfo');
        container.innerHTML = this.layers.map((layer, idx) => `
            <div class="layer-item ${idx === this.currentLayer ? 'active' : ''}" data-layer="${idx}">
                <span class="type">${layer.layer_type === 'base' ? '📶 基础层' : '⬆️ 增强层'} #${layer.layer_index}</span>
                <span class="bitrate">${layer.bitrate} kbps</span>
                <span class="resolution">${layer.width}x${layer.height} @ ${layer.fps}fps</span>
                <span class="codec">${layer.codec}</span>
            </div>
        `).join('');
    }

    updateActiveLayerUI() {
        document.querySelectorAll('.layer-item').forEach((el, idx) => {
            el.classList.toggle('active', idx === this.currentLayer);
        });
    }

    showMSEStatus(message, type = 'info') {
        const statusEl = document.getElementById('mseStatus');
        statusEl.textContent = message;
        statusEl.className = `mse-status status status-${type}`;
    }

    destroy() {
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.src = '';
        }
    }
}

class BandwidthProbe {
    constructor(onBandwidthUpdate) {
        this.ws = null;
        this.sessionId = null;
        this.isProbing = false;
        this.onBandwidthUpdate = onBandwidthUpdate;
        this.bandwidthHistory = [];
        this.maxHistory = 50;
        this.smoothingWindow = 5;
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/bandwidth`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.updateStatus('已连接', 'connected');
        };

        this.ws.onmessage = (event) => {
            this.handleMessage(event.data);
        };

        this.ws.onclose = () => {
            this.updateStatus('未连接', 'disconnected');
            this.isProbing = false;
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket 错误:', error);
            this.updateStatus('连接错误', 'disconnected');
        };
    }

    handleMessage(data) {
        const message = JSON.parse(data);
        
        switch (message.type) {
            case 'session':
                this.sessionId = message.sessionId;
                break;
            case 'probe-ack':
                this.sendProbeData();
                break;
            case 'bandwidth-update':
            case 'current-bandwidth':
                this.handleBandwidthUpdate(message.bandwidth);
                break;
            case 'probe-result':
                this.handleBandwidthUpdate(message.bandwidth);
                if (this.isProbing) {
                    setTimeout(() => this.startProbeCycle(), 500);
                }
                break;
        }
    }

    startProbe() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.connect();
            setTimeout(() => this.startProbe(), 1000);
            return;
        }

        this.isProbing = true;
        this.startProbeCycle();
    }

    startProbeCycle() {
        if (!this.isProbing) return;
        
        this.ws.send(JSON.stringify({
            type: 'probe-start',
            timestamp: Date.now()
        }));

        this.sendProbeData();
    }

    sendProbeData() {
        if (!this.isProbing || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        for (let i = 0; i < 10; i++) {
            this.ws.send(JSON.stringify({
                type: 'probe-data',
                size: 4096,
                seq: i,
                timestamp: Date.now()
            }));
        }

        setTimeout(() => {
            if (this.isProbing && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'probe-end' }));
            }
        }, 200);
    }

    stopProbe() {
        this.isProbing = false;
    }

    handleBandwidthUpdate(bandwidth) {
        this.bandwidthHistory.push({
            time: Date.now(),
            bandwidth: bandwidth
        });

        if (this.bandwidthHistory.length > this.maxHistory) {
            this.bandwidthHistory.shift();
        }

        const smoothedBandwidth = this.getSmoothedBandwidth();
        const mbps = (smoothedBandwidth / 1000000).toFixed(2);
        document.getElementById('currentBandwidth').textContent = `${mbps} Mbps`;

        this.drawChart();

        if (this.onBandwidthUpdate) {
            this.onBandwidthUpdate(smoothedBandwidth);
        }
    }

    getSmoothedBandwidth() {
        if (this.bandwidthHistory.length === 0) return 0;
        
        const recent = this.bandwidthHistory.slice(-this.smoothingWindow);
        const sum = recent.reduce((acc, item) => acc + item.bandwidth, 0);
        return sum / recent.length;
    }

    updateStatus(text, state) {
        const statusEl = document.getElementById('wsStatus');
        statusEl.textContent = text;
        statusEl.className = `value status-${state}`;
    }

    drawChart() {
        const canvas = document.getElementById('bandwidthChart');
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        if (this.bandwidthHistory.length < 2) return;

        const maxBandwidth = Math.max(...this.bandwidthHistory.map(b => b.bandwidth)) * 1.2;
        const minBandwidth = 0;

        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;

        this.bandwidthHistory.forEach((point, idx) => {
            const x = (idx / (this.maxHistory - 1)) * width;
            const normalizedBandwidth = (point.bandwidth - minBandwidth) / (maxBandwidth - minBandwidth || 1);
            const y = height - (normalizedBandwidth * height * 0.9) - 10;
            
            if (idx === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        ctx.beginPath();
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = 'rgba(102, 126, 234, 0.1)';
        ctx.fill();
    }

    disconnect() {
        this.isProbing = false;
        if (this.ws) {
            this.ws.close();
        }
    }
}

class App {
    constructor() {
        this.svcPlayer = null;
        this.hlsPlayer = null;
        this.currentPlayer = null;
        this.bandwidthProbe = null;
        this.videos = [];
        this.lastBandwidth = 0;
        this.bandwidthHysteresis = 0.3;
        this.minSwitchInterval = 3000;
        this.lastSwitchTime = 0;
        this.playerMode = 'hls';
        this.init();
    }

    init() {
        this.svcPlayer = new SVCPlayer();
        this.hlsPlayer = new HLSPlayer(document.getElementById('videoPlayer'));
        this.currentPlayer = this.hlsPlayer;
        this.bandwidthProbe = new BandwidthProbe((bandwidth) => this.handleBandwidthUpdate(bandwidth));
        
        this.bindEvents();
        this.loadVideos();
    }

    bindEvents() {
        document.getElementById('uploadBtn').addEventListener('click', () => this.uploadVideo());
        document.getElementById('startProbeBtn').addEventListener('click', () => this.startBandwidthProbe());
        document.getElementById('stopProbeBtn').addEventListener('click', () => this.stopBandwidthProbe());
        document.getElementById('layerSelect').addEventListener('change', (e) => {
            if (this.currentPlayer) {
                this.currentPlayer.switchLayer(parseInt(e.target.value));
            }
        });
        document.getElementById('autoSwitch').addEventListener('change', (e) => {
            if (this.currentPlayer) {
                this.currentPlayer.autoSwitch = e.target.checked;
            }
        });

        document.querySelectorAll('input[name="playerMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.switchPlayerMode(e.target.value);
            });
        });
    }

    switchPlayerMode(mode) {
        this.playerMode = mode;
        
        if (this.currentPlayer) {
            this.currentPlayer.destroy();
        }

        const videoElement = document.getElementById('videoPlayer');
        videoElement.pause();
        videoElement.src = '';

        document.getElementById('abrStatus').style.display = mode === 'hls' ? 'block' : 'none';

        if (mode === 'hls') {
            this.currentPlayer = this.hlsPlayer;
        } else {
            this.currentPlayer = this.svcPlayer;
        }

        console.log(`切换到 ${mode === 'hls' ? 'HLS + MPC-ABR' : 'MSE'} 模式`);
    }

    async loadVideos() {
        try {
            const response = await fetch('/api/videos');
            this.videos = await response.json();
            this.renderVideoList();
        } catch (e) {
            console.error('加载视频列表失败:', e);
        }
    }

    renderVideoList() {
        const container = document.getElementById('videoList');
        
        if (this.videos.length === 0) {
            container.innerHTML = '<p class="empty-text">暂无视频，请先上传</p>';
            return;
        }

        container.innerHTML = this.videos.map(video => `
            <div class="video-item" data-id="${video.id}">
                <div>
                    <div class="name">${video.original_name}</div>
                    <div class="meta">${video.duration ? `${video.duration.toFixed(1)}秒` : ''} ${video.width ? `• ${video.width}x${video.height}` : ''}</div>
                </div>
                <button class="btn btn-primary" onclick="app.selectVideo(${video.id})">播放</button>
            </div>
        `).join('');
    }

    async selectVideo(videoId) {
        document.getElementById('layerSelect').disabled = false;
        
        const response = await fetch(`/api/videos/${videoId}`);
        const data = await response.json();
        
        if (this.playerMode === 'hls') {
            await this.hlsPlayer.loadVideo(videoId, data.layers);
        } else {
            await this.svcPlayer.loadVideo(videoId);
        }

        this.updateLayerInfo(data.layers);
    }

    updateLayerInfo(layers) {
        const container = document.getElementById('layerInfo');
        container.innerHTML = layers.map((layer, idx) => `
            <div class="layer-item" data-layer="${idx}">
                <span class="type">${layer.layer_type === 'base' ? '📶 基础层' : '⬆️ 增强层'} #${layer.layer_index}</span>
                <span class="bitrate">${layer.bitrate} kbps</span>
                <span class="resolution">${layer.width}x${layer.height} @ ${layer.fps}fps</span>
                <span class="codec">${layer.codec || 'h264'}</span>
            </div>
        `).join('');
    }

    async uploadVideo() {
        const input = document.getElementById('videoInput');
        const file = input.files[0];
        
        if (!file) {
            this.showUploadStatus('请先选择视频文件', 'error');
            return;
        }

        this.showUploadStatus('正在上传和 HLS 编码 (关键帧对齐中)...', 'info');
        document.getElementById('uploadBtn').disabled = true;

        const formData = new FormData();
        formData.append('video', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (result.success) {
                this.showUploadStatus(`上传成功! 视频ID: ${result.videoId}, 已生成 HLS 流`, 'success');
                this.loadVideos();
            } else {
                this.showUploadStatus('上传失败: ' + (result.error || '未知错误'), 'error');
            }
        } catch (e) {
            this.showUploadStatus('上传失败: ' + e.message, 'error');
        }

        document.getElementById('uploadBtn').disabled = false;
    }

    startBandwidthProbe() {
        document.getElementById('startProbeBtn').disabled = true;
        document.getElementById('stopProbeBtn').disabled = false;
        this.bandwidthProbe.startProbe();
    }

    stopBandwidthProbe() {
        document.getElementById('startProbeBtn').disabled = false;
        document.getElementById('stopProbeBtn').disabled = true;
        this.bandwidthProbe.stopProbe();
    }

    handleBandwidthUpdate(bandwidth) {
        if (this.playerMode !== 'hls' && this.currentPlayer && this.currentPlayer.autoSwitch && this.currentPlayer.layers?.length) {
            const now = Date.now();
            if (now - this.lastSwitchTime < this.minSwitchInterval) return;

            const mbps = bandwidth / 1000000;
            const lastMbps = this.lastBandwidth / 1000000;
            
            let targetLayer = this.currentPlayer.currentLayer;

            if (mbps > 2.5 + this.bandwidthHysteresis) {
                targetLayer = 2;
            } else if (mbps > 1.2 + this.bandwidthHysteresis && mbps <= 2.5) {
                targetLayer = 1;
            } else if (mbps < 1.2 - this.bandwidthHysteresis) {
                targetLayer = 0;
            }

            if (targetLayer !== this.currentPlayer.currentLayer && 
                Math.abs(mbps - lastMbps) > this.bandwidthHysteresis) {
                console.log(`带宽变化: ${mbps.toFixed(2)} Mbps, 切换到层级 ${targetLayer}`);
                this.lastSwitchTime = now;
                this.lastBandwidth = bandwidth;
                this.currentPlayer.switchLayer(targetLayer);
            }
        }

        this.lastBandwidth = bandwidth;
    }

    showUploadStatus(message, type) {
        const statusEl = document.getElementById('uploadStatus');
        statusEl.textContent = message;
        statusEl.className = `status status-${type}`;
    }
}

const app = new App();
