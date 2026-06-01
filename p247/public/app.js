let selectedFile = null;
let activeTab = 'upload';
let charts = {};

const qualityLabels = {
    'excellent': '优秀',
    'good': '良好',
    'fair': '一般',
    'poor': '较差',
    'bad': '很差',
    'very_bad': '极差'
};

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initDragDrop();
    initFileInput();
});

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            activeTab = tab;

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(tab).classList.add('active');
        });
    });
}

function initDragDrop() {
    const dropZone = document.getElementById('dropZone');

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });
}

function initFileInput() {
    const fileInput = document.getElementById('fileInput');

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
}

function handleFileSelect(file) {
    if (!file.name.match(/\.(pcap|pcapng)$/i)) {
        alert('请选择PCAP文件');
        return;
    }

    selectedFile = file;
    document.getElementById('fileInfo').textContent = `已选择: ${file.name} (${formatFileSize(file.size)})`;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getOptions() {
    return {
        initialDelay: parseInt(document.getElementById('initialDelay').value),
        minDelay: parseInt(document.getElementById('minDelay').value),
        maxDelay: parseInt(document.getElementById('maxDelay').value),
        oneWayDelay: parseInt(document.getElementById('oneWayDelay').value),
        reorderWindowSize: parseInt(document.getElementById('reorderWindowSize').value),
        reorderTimeoutMs: parseInt(document.getElementById('reorderTimeoutMs').value),
        includeRTCP: document.getElementById('includeRTCP').value === 'true',
        driftPpm: parseFloat(document.getElementById('driftPpm').value),
        codec: document.getElementById('codec').value || null
    };
}

async function startAnalysis() {
    document.getElementById('loadingSection').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('avsyncSection').style.display = 'none';
    document.getElementById('rtcpSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'none';
    document.getElementById('analyzeBtn').disabled = true;

    try {
        let result;
        const options = getOptions();

        if (activeTab === 'upload') {
            if (!selectedFile) {
                throw new Error('请先选择PCAP文件');
            }
            result = await analyzePCAPFile(selectedFile, options);
            displayResults(result);
        } else if (activeTab === 'mock') {
            const mockOptions = {
                packetCount: parseInt(document.getElementById('packetCount').value),
                lossRate: parseFloat(document.getElementById('lossRate').value),
                reorderRate: parseFloat(document.getElementById('reorderRate').value),
                jitterMean: parseFloat(document.getElementById('jitterMean').value),
                jitterStd: parseFloat(document.getElementById('jitterStd').value),
                duration: parseInt(document.getElementById('duration').value),
                ...options
            };
            result = await analyzeMockData(mockOptions);
            displayResults(result);
        } else if (activeTab === 'avsync') {
            const avOptions = {
                audioPacketCount: parseInt(document.getElementById('audioPacketCount').value),
                videoPacketCount: parseInt(document.getElementById('videoPacketCount').value),
                syncOffsetMs: parseFloat(document.getElementById('syncOffsetMs').value),
                audioDriftPpm: parseFloat(document.getElementById('audioDriftPpm').value),
                videoDriftPpm: parseFloat(document.getElementById('videoDriftPpm').value),
                duration: parseInt(document.getElementById('avDuration').value),
                lossRate: parseFloat(document.getElementById('avLossRate').value),
                jitterMean: parseFloat(document.getElementById('avJitterMean').value),
                jitterStd: parseFloat(document.getElementById('jitterStd').value),
                ...options
            };
            result = await analyzeAVMockData(avOptions);
            displayAVResults(result);
        }
    } catch (error) {
        showError(error.message);
    } finally {
        document.getElementById('loadingSection').style.display = 'none';
        document.getElementById('analyzeBtn').disabled = false;
    }
}

async function analyzePCAPFile(file, options) {
    const formData = new FormData();
    formData.append('pcap', file);

    const params = new URLSearchParams({
        initialDelay: options.initialDelay,
        minDelay: options.minDelay,
        maxDelay: options.maxDelay,
        oneWayDelay: options.oneWayDelay
    });

    if (options.codec) {
        params.append('codec', options.codec);
    }

    const response = await fetch(`/api/analyze?${params.toString()}`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '分析失败');
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error);
    }

    if (data.streams && data.streams.length > 0) {
        return data.streams[0];
    }

    throw new Error('未找到RTP数据流');
}

async function analyzeMockData(options) {
    const response = await fetch('/api/analyze/mock', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(options)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '分析失败');
    }

    return await response.json();
}

function displayResults(data) {
    lastAnalysisResult = data;

    const mos = data.mos;
    const metrics = data.metrics;
    const jitterBuffer = data.jitterBuffer;

    document.getElementById('mosValue').textContent = mos.mosRounded.toFixed(2);
    document.getElementById('mosQuality').textContent = qualityLabels[mos.qualityLevel] || mos.qualityLevel;
    document.getElementById('mosRecommendation').textContent = mos.recommendation;

    document.getElementById('rValue').textContent = mos.R.toFixed(1);
    document.getElementById('lossRateValue').textContent = metrics.lossRate.toFixed(2) + '%';
    document.getElementById('lostPackets').textContent = `丢失 ${metrics.lostPackets} / ${metrics.expectedCount} 包`;
    document.getElementById('jitterValue').textContent = metrics.jitterMs.toFixed(2) + ' ms';
    document.getElementById('jitterMax').textContent = `最大 ${metrics.maxJitterMs.toFixed(2)} ms`;
    document.getElementById('bufferDelay').textContent = jitterBuffer.currentDelay + ' ms';
    document.getElementById('bufferAdjustments').textContent = `调整 ${jitterBuffer.adjustmentCount} 次`;
    document.getElementById('reorderedValue').textContent = metrics.reorderedPackets || 0;
    document.getElementById('reorderInfo').textContent = `迟到 ${metrics.latePackets || 0} | 窗口 ${metrics.reorderWindowSize || 16}`;
    document.getElementById('codecInfo').textContent = data.codec;
    document.getElementById('ssrcInfo').textContent = `SSRC: 0x${data.ssrc.toString(16).toUpperCase()}`;

    displayQualityScale(data.qualityThresholds, mos.mos);
    displaySuggestions(data.suggestions);
    displayDetailedMetrics(metrics, jitterBuffer, mos);
    renderCharts(metrics, jitterBuffer, mos);

    if (data.rtcpAnalysis && !data.rtcpAnalysis.error) {
        document.getElementById('rtcpSection').style.display = 'block';
        document.getElementById('srCount').textContent = data.rtcpAnalysis.srCount;
        document.getElementById('estimatedClockRate').textContent = data.rtcpAnalysis.estimatedClockRate + ' Hz';
        document.getElementById('clockDrift').textContent = data.rtcpAnalysis.clockDriftPpm.toFixed(2) + ' ppm';
        renderClockOffsetChart(data.rtcpAnalysis);
    } else {
        document.getElementById('rtcpSection').style.display = 'none';
    }

    document.getElementById('avsyncSection').style.display = 'none';

    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
}

function displayQualityScale(thresholds, currentMos) {
    const container = document.getElementById('qualityScale');
    container.innerHTML = '';

    const sortedThresholds = [...thresholds].sort((a, b) => b.minMos - a.minMos);

    let currentLevel = sortedThresholds[sortedThresholds.length - 1].level;
    for (const threshold of sortedThresholds) {
        if (currentMos >= threshold.minMos) {
            currentLevel = threshold.level;
            break;
        }
    }

    for (const threshold of sortedThresholds) {
        const item = document.createElement('div');
        item.className = 'quality-item' + (threshold.level === currentLevel ? ' current' : '');
        item.innerHTML = `
            <span class="quality-range">${threshold.minMos.toFixed(2)}+</span>
            <span class="quality-desc">${qualityLabels[threshold.level]} - ${threshold.description}</span>
        `;
        container.appendChild(item);
    }
}

function displaySuggestions(suggestions) {
    const container = document.getElementById('suggestionsList');
    container.innerHTML = '';

    if (suggestions.length === 0) {
        container.innerHTML = '<p style="color: #666;">语音质量良好，无需特别优化建议。</p>';
        return;
    }

    for (const suggestion of suggestions) {
        const item = document.createElement('div');
        item.className = `suggestion-item ${suggestion.severity}`;
        item.innerHTML = `
            <h4>${severityIcon(suggestion.severity)} ${suggestion.message}</h4>
            <p>${suggestion.action}</p>
        `;
        container.appendChild(item);
    }
}

function severityIcon(severity) {
    return severity === 'high' ? '🔴' : '🟡';
}

function displayDetailedMetrics(metrics, jitterBuffer, mos) {
    const container = document.getElementById('detailedMetrics');
    container.innerHTML = '';

    const items = [
        { name: '期望包数', value: metrics.expectedCount.toLocaleString() },
        { name: '实际接收', value: metrics.totalPackets.toLocaleString() },
        { name: '丢失包数', value: metrics.lostPackets.toLocaleString() },
        { name: '丢包率', value: metrics.lossRate.toFixed(3) + '%' },
        { name: '突发丢包次数', value: metrics.burstLossCount },
        { name: '平均突发长度', value: metrics.averageBurstLength.toFixed(2) },
        { name: '乱序包数', value: metrics.reorderedPackets || 0 },
        { name: '迟到包数', value: metrics.latePackets || 0 },
        { name: '确认丢失(超窗口)', value: metrics.confirmedLosses || 0 },
        { name: '乱序窗口大小', value: metrics.reorderWindowSize || 16 },
        { name: '抖动均值', value: metrics.avgJitterMs.toFixed(2) + ' ms' },
        { name: '抖动最大值', value: metrics.maxJitterMs.toFixed(2) + ' ms' },
        { name: '初始Buffer延迟', value: jitterBuffer.initialDelay + ' ms' },
        { name: '当前Buffer延迟', value: jitterBuffer.currentDelay + ' ms' },
        { name: 'Buffer下溢次数', value: jitterBuffer.underflowCount },
        { name: 'Buffer上溢次数', value: jitterBuffer.overflowCount },
        { name: 'Buffer丢包率', value: jitterBuffer.dropRate.toFixed(2) + '%' },
        { name: '平均Buffer水平', value: jitterBuffer.avgBufferLevel.toFixed(2) },
        { name: 'R值', value: mos.R.toFixed(2) },
        { name: '延迟损伤', value: mos.components.delayImpairment.toFixed(2) },
        { name: '丢包损伤', value: mos.components.packetLossImpairment.toFixed(2) },
        { name: '抖动损伤', value: mos.components.jitterImpairment.toFixed(2) }
    ];

    for (const item of items) {
        const div = document.createElement('div');
        div.className = 'metric-item';
        div.innerHTML = `
            <span class="metric-name">${item.name}</span>
            <span class="metric-value">${item.value}</span>
        `;
        container.appendChild(div);
    }
}

function renderCharts(metrics, jitterBuffer, mos) {
    Object.values(charts).forEach(chart => chart.destroy());
    charts = {};

    renderMOSComponentsChart(mos);
    renderLossTimelineChart(metrics.lossTimeline);
    renderJitterTimelineChart(metrics.jitterTimeline);
    renderDIChart(metrics.interarrivalJitter);
    renderBufferDelayChart(jitterBuffer.delayTimeline);
}

function renderMOSComponentsChart(mos) {
    const ctx = document.getElementById('mosComponentsChart').getContext('2d');
    const total = mos.components.totalImpairment;

    const data = {
        labels: ['延迟损伤', '丢包损伤', '抖动损伤'],
        datasets: [{
            data: [
                mos.components.delayImpairment,
                mos.components.packetLossImpairment,
                mos.components.jitterImpairment
            ],
            backgroundColor: [
                'rgba(255, 99, 132, 0.7)',
                'rgba(255, 206, 86, 0.7)',
                'rgba(54, 162, 235, 0.7)'
            ],
            borderColor: [
                'rgba(255, 99, 132, 1)',
                'rgba(255, 206, 86, 1)',
                'rgba(54, 162, 235, 1)'
            ],
            borderWidth: 2
        }]
    };

    charts.mosComponents = new Chart(ctx, {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed;
                            const percentage = total > 0 ? (value / total * 100).toFixed(1) : 0;
                            return `${context.label}: ${value.toFixed(2)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderLossTimelineChart(lossTimeline) {
    const ctx = document.getElementById('lossTimelineChart').getContext('2d');

    if (!lossTimeline || lossTimeline.length === 0) {
        ctx.fillText('数据不足', 150, 150);
        return;
    }

    const labels = lossTimeline.map((_, i) => `#${i + 1}`);
    const data = lossTimeline.map(l => l.lossRate);

    charts.lossTimeline = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '丢包率 (%)',
                data,
                borderColor: 'rgba(255, 99, 132, 1)',
                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: Math.max(5, Math.max(...data) * 1.2),
                    title: {
                        display: true,
                        text: '丢包率 (%)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '时间窗口'
                    }
                }
            }
        }
    });
}

function renderJitterTimelineChart(jitterTimeline) {
    const ctx = document.getElementById('jitterTimelineChart').getContext('2d');

    if (!jitterTimeline || jitterTimeline.length === 0) {
        ctx.fillText('数据不足', 150, 150);
        return;
    }

    const labels = jitterTimeline.map((_, i) => `#${i + 1}`);
    const data = jitterTimeline.map(j => j.jitterMs);

    charts.jitterTimeline = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '抖动 (ms)',
                data,
                borderColor: 'rgba(54, 162, 235, 1)',
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '抖动 (ms)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '数据包'
                    }
                }
            }
        }
    });
}

function renderBufferDelayChart(delayTimeline) {
    const ctx = document.getElementById('bufferDelayChart').getContext('2d');

    if (!delayTimeline || delayTimeline.length === 0) {
        ctx.fillText('数据不足', 150, 150);
        return;
    }

    const labels = delayTimeline.map((_, i) => `#${i + 1}`);
    const data = delayTimeline.map(d => d.delay);

    charts.bufferDelay = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Buffer延迟 (ms)',
                data,
                borderColor: 'rgba(102, 126, 234, 1)',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 2,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Buffer延迟 (ms)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '时间点'
                    }
                }
            }
        }
    });
}

function renderDIChart(interarrivalJitter) {
    const ctx = document.getElementById('diChart').getContext('2d');

    if (!interarrivalJitter || interarrivalJitter.length === 0) {
        ctx.fillText('数据不足', 150, 150);
        return;
    }

    const sampleRate = Math.max(1, Math.floor(interarrivalJitter.length / 100));
    const sampled = interarrivalJitter.filter((_, i) => i % sampleRate === 0);

    const labels = sampled.map((_, i) => `#${i + 1}`);
    const dValues = sampled.map(ij => ij.D);
    const absDValues = sampled.map(ij => ij.absD);
    const smoothedValues = sampled.map(ij => ij.smoothedJitter);

    charts.diChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'D(i) 差值',
                    data: dValues,
                    backgroundColor: dValues.map(d =>
                        d >= 0 ? 'rgba(54, 162, 235, 0.6)' : 'rgba(255, 99, 132, 0.6)'
                    ),
                    borderColor: dValues.map(d =>
                        d >= 0 ? 'rgba(54, 162, 235, 1)' : 'rgba(255, 99, 132, 1)'
                    ),
                    borderWidth: 1
                },
                {
                    label: '|D(i)| 绝对值',
                    data: absDValues,
                    type: 'line',
                    borderColor: 'rgba(255, 206, 86, 1)',
                    backgroundColor: 'rgba(255, 206, 86, 0.1)',
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    fill: false,
                    tension: 0.3
                },
                {
                    label: '平滑Jitter (RFC 3550)',
                    data: smoothedValues,
                    type: 'line',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    pointRadius: 0,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 10,
                        font: { size: 11 }
                    }
                }
            },
            scales: {
                y: {
                    title: {
                        display: true,
                        text: 'D(i) 值 (RTP时钟单位)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '数据包'
                    }
                }
            }
        }
    });
}

function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorSection').style.display = 'block';
}

function hideError() {
    document.getElementById('errorSection').style.display = 'none';
}

let lastAnalysisResult = null;

async function analyzeAVMockData(options) {
    const response = await fetch('/api/analyze/mock-av', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(options)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '分析失败');
    }

    return await response.json();
}

function displayAVResults(data) {
    lastAnalysisResult = data;

    const audio = data.audio;
    const video = data.video;
    const sync = data.syncAnalysis;

    document.getElementById('resultsSection').style.display = 'block';

    if (audio && audio.mos) {
        document.getElementById('mosValue').textContent = audio.mos.mosRounded.toFixed(2);
        document.getElementById('mosQuality').textContent = qualityLabels[audio.mos.qualityLevel] || audio.mos.qualityLevel;
        document.getElementById('mosRecommendation').textContent = '音频: ' + audio.mos.recommendation;
    }

    if (audio && audio.metrics) {
        document.getElementById('rValue').textContent = audio.mos.R.toFixed(1);
        document.getElementById('lossRateValue').textContent = audio.metrics.lossRate.toFixed(2) + '%';
        document.getElementById('lostPackets').textContent = `丢失 ${audio.metrics.lostPackets} / ${audio.metrics.expectedCount} 包`;
        document.getElementById('jitterValue').textContent = audio.metrics.jitterMs.toFixed(2) + ' ms';
        document.getElementById('jitterMax').textContent = `最大 ${audio.metrics.maxJitterMs.toFixed(2)} ms`;
        document.getElementById('bufferDelay').textContent = audio.jitterBuffer.currentDelay + ' ms';
        document.getElementById('bufferAdjustments').textContent = `调整 ${audio.jitterBuffer.adjustmentCount} 次`;
        document.getElementById('reorderedValue').textContent = audio.metrics.reorderedPackets || 0;
        document.getElementById('reorderInfo').textContent = `迟到 ${audio.metrics.latePackets || 0} | 窗口 ${audio.metrics.reorderWindowSize || 16}`;
        document.getElementById('codecInfo').textContent = audio.codec;
        document.getElementById('ssrcInfo').textContent = `SSRC: 0x${data.audioSSRC.toString(16).toUpperCase()}`;
    }

    if (sync && !sync.error) {
        document.getElementById('avsyncSection').style.display = 'block';
        document.getElementById('avgSyncOffset').textContent = sync.avgOffsetMs.toFixed(2) + ' ms';
        document.getElementById('medianSyncOffset').textContent = sync.medianOffsetMs.toFixed(2) + ' ms';
        document.getElementById('maxSyncOffset').textContent = sync.maxOffsetMs.toFixed(2) + ' ms';

        const qualityEl = document.getElementById('syncQuality');
        const qualityMap = {
            'excellent': '优秀',
            'good': '良好',
            'fair': '一般',
            'poor': '较差',
            'bad': '很差'
        };
        qualityEl.textContent = qualityMap[sync.syncQuality] || sync.syncQuality;
        qualityEl.className = 'stat-value sync-' + sync.syncQuality;

        renderSyncOffsetChart(sync);
    }

    if (audio && audio.rtcpAnalysis && !audio.rtcpAnalysis.error) {
        document.getElementById('rtcpSection').style.display = 'block';
        document.getElementById('srCount').textContent = audio.rtcpAnalysis.srCount;
        document.getElementById('estimatedClockRate').textContent = audio.rtcpAnalysis.estimatedClockRate + ' Hz';
        document.getElementById('clockDrift').textContent = audio.rtcpAnalysis.clockDriftPpm.toFixed(2) + ' ppm';

        renderClockOffsetChart(audio.rtcpAnalysis);
    }

    if (audio && audio.metrics) {
        displayQualityScale(audio.qualityThresholds, audio.mos.mos);
        displaySuggestions(audio.suggestions);
        displayDetailedMetrics(audio.metrics, audio.jitterBuffer, audio.mos);
        renderCharts(audio.metrics, audio.jitterBuffer, audio.mos);
    }

    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
}

function renderSyncOffsetChart(syncAnalysis) {
    const ctx = document.getElementById('syncOffsetChart').getContext('2d');

    if (charts.syncOffset) charts.syncOffset.destroy();

    if (!syncAnalysis.syncPoints || syncAnalysis.syncPoints.length === 0) {
        ctx.fillText('无同步数据', 150, 125);
        return;
    }

    const labels = syncAnalysis.syncPoints.map((_, i) => `SR#${i + 1}`);
    const offsetData = syncAnalysis.syncPoints.map(sp => sp.offsetMs);
    const avgLine = syncAnalysis.avgOffsetMs;

    charts.syncOffset = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '同步偏移 (ms)',
                    data: offsetData,
                    borderColor: 'rgba(102, 126, 234, 1)',
                    backgroundColor: 'rgba(102, 126, 234, 0.15)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: '平均偏移 (' + avgLine.toFixed(1) + ' ms)',
                    data: offsetData.map(() => avgLine),
                    borderColor: 'rgba(255, 99, 132, 0.7)',
                    borderDash: [8, 4],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: '±45ms 阈值',
                    data: offsetData.map(() => 45),
                    borderColor: 'rgba(255, 206, 86, 0.5)',
                    borderDash: [4, 4],
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: '',
                    data: offsetData.map(() => -45),
                    borderColor: 'rgba(255, 206, 86, 0.5)',
                    borderDash: [4, 4],
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 10, font: { size: 11 } }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: '偏移 (ms)' }
                },
                x: {
                    title: { display: true, text: 'RTCP SR 采样点' }
                }
            }
        }
    });
}

function renderClockOffsetChart(rtcpAnalysis) {
    const ctx = document.getElementById('clockOffsetChart').getContext('2d');

    if (charts.clockOffset) charts.clockOffset.destroy();

    if (!rtcpAnalysis.offsetHistory || rtcpAnalysis.offsetHistory.length === 0) {
        ctx.fillText('无时钟偏移数据', 150, 125);
        return;
    }

    const labels = rtcpAnalysis.offsetHistory.map((_, i) => `SR#${i + 1}`);
    const offsetData = rtcpAnalysis.offsetHistory.map(h => h.offsetMs);

    charts.clockOffset = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '时钟偏移 (ms)',
                data: offsetData,
                borderColor: 'rgba(17, 153, 142, 1)',
                backgroundColor: 'rgba(17, 153, 142, 0.15)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 10, font: { size: 11 } }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: '偏移 (ms)' }
                },
                x: {
                    title: { display: true, text: 'RTCP SR 采样点' }
                }
            }
        }
    });
}

function exportChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        alert('未找到图表');
        return;
    }

    const chartInstance = Chart.getChart(canvas);
    if (!chartInstance) {
        alert('图表未渲染');
        return;
    }

    const link = document.createElement('a');
    link.download = canvasId + '_' + Date.now() + '.png';
    link.href = chartInstance.toBase64Image('image/png', 1);
    link.click();
}

function exportAllCharts() {
    const chartIds = [
        'mosComponentsChart',
        'lossTimelineChart',
        'jitterTimelineChart',
        'diChart',
        'bufferDelayChart',
        'syncOffsetChart',
        'clockOffsetChart'
    ];

    let exported = 0;
    for (const id of chartIds) {
        const canvas = document.getElementById(id);
        if (!canvas) continue;
        const chartInstance = Chart.getChart(canvas);
        if (!chartInstance) continue;

        setTimeout(() => {
            const link = document.createElement('a');
            link.download = id + '_' + Date.now() + '.png';
            link.href = chartInstance.toBase64Image('image/png', 1);
            link.click();
        }, exported * 300);

        exported++;
    }

    if (exported === 0) {
        alert('没有可导出的图表');
    }
}

function exportJSON() {
    if (!lastAnalysisResult) {
        alert('请先运行分析');
        return;
    }

    const dataStr = JSON.stringify(lastAnalysisResult, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = 'rtp_analysis_' + Date.now() + '.json';
    link.href = url;
    link.click();

    URL.revokeObjectURL(url);
}
