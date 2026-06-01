const socket = io();
let rateChart, remarkChart, dropChart, distChart;
let previousRate = 0;
let previousDropRate = 0;
let previousRemarkRate = 0;
const maxDataPoints = 60;

let currentMeterChain = window.meterChain || [];
const dscpMap = window.dscpMap || {};

function initCharts() {
    const rateCtx = document.getElementById('rateChart').getContext('2d');
    const remarkCtx = document.getElementById('remarkChart').getContext('2d');
    const dropCtx = document.getElementById('dropChart').getContext('2d');
    const distCtx = document.getElementById('distChart').getContext('2d');

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { intersect: false, mode: 'index' },
        plugins: {
            legend: {
                display: true,
                labels: { color: '#9ca3af', font: { size: 12 } }
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleColor: '#e4e4e7',
                bodyColor: '#e4e4e7',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1
            }
        },
        scales: {
            x: {
                display: true,
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#6b7280', maxTicksLimit: 6 }
            },
            y: {
                display: true,
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#6b7280' }
            }
        }
    };

    const thresholdDatasets = [];
    currentMeterChain.forEach((meterCfg, i) => {
        meterCfg.bands.forEach((bandCfg, j) => {
            const isDrop = bandCfg.type === 'drop';
            thresholdDatasets.push({
                label: `M${meterCfg.meter_id} ${bandCfg.type.toUpperCase()} (${bandCfg.rate} kbps)`,
                data: [],
                borderColor: isDrop ? '#ef4444' : getChainColor(i),
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [5, 5],
                fill: false,
                tension: 0,
                pointRadius: 0
            });
        });
    });

    rateChart = new Chart(rateCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: '流量速率 (Mbps)',
                    data: [],
                    borderColor: '#60a5fa',
                    backgroundColor: 'rgba(96, 165, 250, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4
                },
                ...thresholdDatasets
            ]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    ...commonOptions.scales.y,
                    title: { display: true, text: '速率 (Mbps)', color: '#9ca3af' },
                    beginAtZero: true
                }
            }
        }
    });

    remarkChart = new Chart(remarkCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'DSCP降级速率 (pkts/s)',
                    data: [],
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: '累计降级包数',
                    data: [],
                    type: 'line',
                    borderColor: '#a78bfa',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    ...commonOptions.scales.y,
                    title: { display: true, text: '降级速率 (pkts/s)', color: '#9ca3af' },
                    beginAtZero: true
                },
                y1: {
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#a78bfa' },
                    title: { display: true, text: '累计降级', color: '#a78bfa' },
                    beginAtZero: true
                }
            }
        }
    });

    dropChart = new Chart(dropCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    label: '丢包速率 (pkts/s)',
                    data: [],
                    backgroundColor: 'rgba(239, 68, 68, 0.6)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: '累计丢包数',
                    data: [],
                    type: 'line',
                    borderColor: '#a78bfa',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: {
                    ...commonOptions.scales.y,
                    title: { display: true, text: '丢包速率 (pkts/s)', color: '#9ca3af' },
                    beginAtZero: true
                },
                y1: {
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#a78bfa' },
                    title: { display: true, text: '累计丢包', color: '#a78bfa' },
                    beginAtZero: true
                }
            }
        }
    });

    distChart = new Chart(distCtx, {
        type: 'doughnut',
        data: {
            labels: ['正常转发', 'DSCP降级', '被丢弃'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(239, 68, 68, 0.7)'
                ],
                borderColor: ['#10b981', '#3b82f6', '#ef4444'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: '#9ca3af', font: { size: 12 }, padding: 15 }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#e4e4e7',
                    bodyColor: '#e4e4e7',
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                            return `${context.label}: ${formatNumber(context.raw)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function getChainColor(index) {
    const colors = ['#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
    return colors[index % colors.length];
}

function formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
    return num.toString();
}

function addLog(message, type = 'info') {
    const logsDiv = document.getElementById('logs');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    const time = new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    entry.innerHTML = `<span class="log-time">[${time}]</span><span>${message}</span>`;
    logsDiv.appendChild(entry);
    logsDiv.scrollTop = logsDiv.scrollHeight;
}

function renderMeterChainVisual(chain, meterStats) {
    const visual = document.getElementById('meter-chain-visual');
    const direction = document.querySelector('.chain-direction');
    visual.innerHTML = '';

    const tableIds = [];
    chain.forEach(m => {
        tableIds.push(m.table_id);
        if (m.goto_table !== null && m.goto_table !== undefined) {
            tableIds.push(m.goto_table);
        }
    });
    const uniqueTables = [...new Set(tableIds)].sort();
    direction.textContent = uniqueTables.map(t => `Table ${t}`).join(' → ') + ' → OUTPUT';

    chain.forEach((meterCfg, i) => {
        const ms = meterStats ? meterStats[meterCfg.meter_id] : null;
        const isActive = ms && ms.remarked_packets > 0;
        const isDropActive = ms && ms.dropped_packets > 0;

        const meterDiv = document.createElement('div');
        meterDiv.className = 'chain-meter' + (isDropActive ? ' drop-active' : isActive ? ' active' : '');

        let bandsHtml = '';
        meterCfg.bands.forEach(band => {
            const typeClass = band.type === 'drop' ? 'drop' : 'remark';
            const detail = band.type === 'remark' ? `DSCP→${dscpMap[band.prec_level] || band.prec_level || 0}` : '';
            bandsHtml += `
                <div class="chain-band">
                    <span class="chain-band-type ${typeClass}">${band.type.toUpperCase()}</span>
                    <span class="chain-band-rate">${band.rate} kbps</span>
                    ${detail ? `<span class="chain-band-detail">${detail}</span>` : ''}
                </div>`;
        });

        let statsHtml = '';
        if (ms) {
            statsHtml = `
                <div class="chain-meter-stats">
                    <div class="chain-stat">
                        <span class="chain-stat-label">降级</span>
                        <span class="chain-stat-value">${formatNumber(ms.remarked_packets || 0)}</span>
                    </div>
                    <div class="chain-stat">
                        <span class="chain-stat-label">丢包</span>
                        <span class="chain-stat-value">${formatNumber(ms.dropped_packets || 0)}</span>
                    </div>
                </div>`;
        }

        meterDiv.innerHTML = `
            <div class="chain-meter-header">
                <span class="chain-meter-name">${meterCfg.name || 'Meter ' + meterCfg.meter_id}</span>
                <span class="chain-meter-id">ID: ${meterCfg.meter_id} | T:${meterCfg.table_id}</span>
            </div>
            <div class="chain-meter-bands">${bandsHtml}</div>
            ${statsHtml}
        `;
        visual.appendChild(meterDiv);

        if (meterCfg.goto_table !== null && meterCfg.goto_table !== undefined) {
            const arrow = document.createElement('div');
            arrow.className = 'chain-arrow';
            arrow.textContent = '→';
            visual.appendChild(arrow);
        }
    });

    const outputDiv = document.createElement('div');
    outputDiv.className = 'chain-output';
    outputDiv.textContent = 'OUTPUT';
    visual.appendChild(outputDiv);
}

function renderChainEditor(chain) {
    const editor = document.getElementById('meter-chain-editor');
    editor.innerHTML = '';

    chain.forEach((meterCfg, i) => {
        const row = document.createElement('div');
        row.className = 'chain-editor-row';
        row.dataset.index = i;

        let bandsHtml = '';
        meterCfg.bands.forEach((band, j) => {
            const dscpOptions = Object.entries(dscpMap).map(([val, name]) =>
                `<option value="${val}" ${band.prec_level == val ? 'selected' : ''}>${val} - ${name}</option>`
            ).join('');

            bandsHtml += `
                <select class="band-type-select" data-meter="${i}" data-band="${j}">
                    <option value="remark" ${band.type === 'remark' ? 'selected' : ''}>Remark</option>
                    <option value="drop" ${band.type === 'drop' ? 'selected' : ''}>Drop</option>
                </select>
                <input type="number" class="band-rate-input" data-meter="${i}" data-band="${j}"
                    value="${band.rate}" min="1" placeholder="速率(kbps)" style="min-width:100px;">
                <select class="band-dscp-select" data-meter="${i}" data-band="${j}"
                    style="${band.type === 'drop' ? 'display:none' : ''}">
                    ${dscpOptions}
                </select>
            `;
        });

        row.innerHTML = `
            <span class="row-label">Level ${i + 1}</span>
            <input type="number" class="meter-id-input" value="${meterCfg.meter_id}" min="1"
                style="min-width:60px;" placeholder="ID">
            <input type="text" class="meter-name-input" value="${meterCfg.name || ''}"
                style="min-width:100px;" placeholder="名称">
            ${bandsHtml}
            <button class="btn-remove" onclick="removeMeterLevel(${i})">删除</button>
        `;
        editor.appendChild(row);
    });

    editor.querySelectorAll('.band-type-select').forEach(sel => {
        sel.addEventListener('change', function() {
            const meterIdx = parseInt(this.dataset.meter);
            const bandIdx = parseInt(this.dataset.band);
            const dscpSelect = editor.querySelector(
                `.band-dscp-select[data-meter="${meterIdx}"][data-band="${bandIdx}"]`
            );
            if (this.value === 'drop') {
                dscpSelect.style.display = 'none';
            } else {
                dscpSelect.style.display = '';
            }
        });
    });
}

function addMeterLevel() {
    const maxId = currentMeterChain.reduce((max, m) => Math.max(max, m.meter_id), 0);
    const maxTable = currentMeterChain.reduce((max, m) => Math.max(max, m.table_id), 0);
    const lastMeter = currentMeterChain[currentMeterChain.length - 1];

    if (lastMeter) {
        lastMeter.goto_table = maxTable + 1;
    }

    currentMeterChain.push({
        meter_id: maxId + 1,
        table_id: maxTable + 1,
        name: `Level-${currentMeterChain.length + 1}`,
        bands: [
            { type: 'drop', rate: 2000000, burst_size: 200000 }
        ],
        goto_table: null
    });

    renderChainEditor(currentMeterChain);
    addLog(`添加Meter级别: Level-${currentMeterChain.length}`, 'info');
}

function removeMeterLevel(index) {
    if (currentMeterChain.length <= 1) {
        showChainMessage('至少需要保留一个Meter级别', 'error');
        return;
    }
    currentMeterChain.splice(index, 1);
    currentMeterChain.forEach((m, i) => {
        m.meter_id = i + 1;
        m.table_id = i;
        m.name = m.name || `Level-${i + 1}`;
        if (i < currentMeterChain.length - 1) {
            m.goto_table = i + 1;
        } else {
            m.goto_table = null;
        }
    });
    renderChainEditor(currentMeterChain);
    addLog(`删除Meter级别, 剩余 ${currentMeterChain.length} 级`, 'warning');
}

function updateMeterChain() {
    const editor = document.getElementById('meter-chain-editor');
    const rows = editor.querySelectorAll('.chain-editor-row');
    const newChain = [];

    rows.forEach((row, i) => {
        const meterId = parseInt(row.querySelector('.meter-id-input').value) || (i + 1);
        const name = row.querySelector('.meter-name-input').value || `Level-${i + 1}`;
        const typeSelects = row.querySelectorAll('.band-type-select');
        const rateInputs = row.querySelectorAll('.band-rate-input');
        const dscpSelects = row.querySelectorAll('.band-dscp-select');

        const bands = [];
        typeSelects.forEach((sel, j) => {
            const band = {
                type: sel.value,
                rate: parseInt(rateInputs[j].value) || 1000000,
            };
            if (sel.value === 'remark') {
                band.prec_level = parseInt(dscpSelects[j].value) || 0;
                band.burst_size = 100000;
            } else {
                band.burst_size = 200000;
            }
            bands.push(band);
        });

        newChain.push({
            meter_id: meterId,
            table_id: i,
            name: name,
            bands: bands,
            goto_table: i < rows.length - 1 ? i + 1 : null
        });
    });

    socket.emit('update_meter_chain', { meter_chain: newChain });
    addLog(`正在更新Meter链: ${newChain.length} 级...`, 'info');
}

function showChainMessage(text, type) {
    const msgDiv = document.getElementById('chain-message');
    msgDiv.textContent = text;
    msgDiv.className = `message ${type}`;
    setTimeout(() => { msgDiv.className = 'message'; }, 3000);
}

function showMessage(text, type) {
    const msgDiv = document.getElementById('chain-message');
    msgDiv.textContent = text;
    msgDiv.className = `message ${type}`;
    setTimeout(() => { msgDiv.className = 'message'; }, 3000);
}

function updateStats(data) {
    const rate = data.current_rate_mbps || 0;
    const dropRate = data.current_drop_rate || 0;
    const remarkRate = data.current_remark_rate || 0;

    document.getElementById('current-rate').textContent = rate.toFixed(2);
    document.getElementById('remark-rate').textContent = remarkRate.toFixed(2);
    document.getElementById('drop-rate').textContent = dropRate.toFixed(2);
    document.getElementById('total-packets').textContent = formatNumber(data.total_packets || 0);
    document.getElementById('total-bytes').textContent = formatBytes(data.total_bytes || 0) + ' bytes';
    document.getElementById('total-remarked').textContent = formatNumber(data.total_remarked_packets || 0);
    document.getElementById('remark-percentage').textContent = (data.packet_remark_percentage || 0).toFixed(2) + '%';
    document.getElementById('total-dropped').textContent = formatNumber(data.total_dropped_packets || 0);
    document.getElementById('loss-percentage').textContent = (data.packet_loss_percentage || 0).toFixed(2) + '%';
    document.getElementById('exceed-count').textContent = data.threshold_exceeded_count || 0;
    document.getElementById('burst-exceed-count').textContent = data.burst_exceeded_count || 0;

    if (data.last_threshold_exceeded_time) {
        document.getElementById('last-exceed').textContent = formatTime(data.last_threshold_exceeded_time);
    }
    if (data.last_burst_exceeded_time) {
        document.getElementById('last-burst-exceed').textContent = formatTime(data.last_burst_exceeded_time);
    }

    if (data.threshold_mbps) {
        document.getElementById('first-threshold').textContent = (data.threshold_mbps * 1000).toFixed(0) + ' kbps';
    }
    if (data.burst_tolerance_threshold_mbps) {
        document.getElementById('last-threshold').textContent = (data.burst_tolerance_threshold_mbps * 1000).toFixed(0) + ' kbps';
    }

    const rateTrend = document.getElementById('rate-trend');
    if (rate > previousRate && previousRate > 0) {
        rateTrend.textContent = '↑ ' + ((rate - previousRate) / previousRate * 100).toFixed(1) + '%';
        rateTrend.className = 'stat-trend up';
    } else if (rate < previousRate && previousRate > 0) {
        rateTrend.textContent = '↓ ' + ((previousRate - rate) / previousRate * 100).toFixed(1) + '%';
        rateTrend.className = 'stat-trend down';
    } else {
        rateTrend.textContent = '-';
        rateTrend.className = 'stat-trend';
    }
    previousRate = rate;

    const remarkTrend = document.getElementById('remark-trend');
    if (remarkRate > previousRemarkRate && previousRemarkRate > 0) {
        remarkTrend.textContent = '↑ ' + ((remarkRate - previousRemarkRate) / previousRemarkRate * 100).toFixed(1) + '%';
        remarkTrend.className = 'stat-trend up';
    } else if (remarkRate < previousRemarkRate && previousRemarkRate > 0) {
        remarkTrend.textContent = '↓ ' + ((previousRemarkRate - remarkRate) / previousRemarkRate * 100).toFixed(1) + '%';
        remarkTrend.className = 'stat-trend down';
    } else {
        remarkTrend.textContent = '-';
        remarkTrend.className = 'stat-trend';
    }
    previousRemarkRate = remarkRate;

    const dropTrend = document.getElementById('drop-trend');
    if (dropRate > previousDropRate && previousDropRate > 0) {
        dropTrend.textContent = '↑ ' + ((dropRate - previousDropRate) / previousDropRate * 100).toFixed(1) + '%';
        dropTrend.className = 'stat-trend up';
    } else if (dropRate < previousDropRate && previousDropRate > 0) {
        dropTrend.textContent = '↓ ' + ((previousDropRate - dropRate) / previousDropRate * 100).toFixed(1) + '%';
        dropTrend.className = 'stat-trend down';
    } else {
        dropTrend.textContent = '-';
        dropTrend.className = 'stat-trend';
    }
    previousDropRate = dropRate;

    const thresholdAlert = document.getElementById('threshold-alert');
    const burstAlert = document.getElementById('burst-alert');
    const remarkCard = document.querySelector('.remark-icon').closest('.stat-card');
    const dropCard = document.querySelector('.drop-icon').closest('.stat-card');

    if (data.threshold_exceeded) {
        thresholdAlert.classList.remove('hidden');
        remarkCard.classList.add('remark-active');
    } else {
        thresholdAlert.classList.add('hidden');
        remarkCard.classList.remove('remark-active');
    }

    if (data.burst_exceeded) {
        burstAlert.classList.remove('hidden');
        dropCard.classList.add('drop-active');
    } else {
        burstAlert.classList.add('hidden');
        dropCard.classList.remove('drop-active');
    }

    if (data.meter_chain) {
        currentMeterChain = data.meter_chain;
        document.getElementById('chain-levels').textContent = currentMeterChain.length;
        renderMeterChainVisual(currentMeterChain, data.meter_stats);
    }

    const timeLabel = formatTime(data.timestamp);

    if (rateChart.data.labels.length >= maxDataPoints) {
        rateChart.data.labels.shift();
        rateChart.data.datasets.forEach(ds => ds.data.shift());
    }
    rateChart.data.labels.push(timeLabel);
    rateChart.data.datasets[0].data.push(rate);
    for (let i = 1; i < rateChart.data.datasets.length; i++) {
        const thresholdMbps = (currentMeterChain[i-1] ? currentMeterChain[i-1].bands[0].rate / 1000 : 0);
        rateChart.data.datasets[i].data.push(thresholdMbps);
    }
    rateChart.update('none');

    if (remarkChart.data.labels.length >= maxDataPoints) {
        remarkChart.data.labels.shift();
        remarkChart.data.datasets[0].data.shift();
        remarkChart.data.datasets[1].data.shift();
    }
    remarkChart.data.labels.push(timeLabel);
    remarkChart.data.datasets[0].data.push(remarkRate);
    remarkChart.data.datasets[1].data.push(data.total_remarked_packets || 0);
    remarkChart.update('none');

    if (dropChart.data.labels.length >= maxDataPoints) {
        dropChart.data.labels.shift();
        dropChart.data.datasets[0].data.shift();
        dropChart.data.datasets[1].data.shift();
    }
    dropChart.data.labels.push(timeLabel);
    dropChart.data.datasets[0].data.push(dropRate);
    dropChart.data.datasets[1].data.push(data.total_dropped_packets || 0);
    dropChart.update('none');

    distChart.data.datasets[0].data = [
        data.total_packets || 0,
        data.total_remarked_packets || 0,
        data.total_dropped_packets || 0
    ];
    distChart.update('none');
}

function exportJSON() {
    socket.emit('export_json');
    addLog('已请求JSON导出', 'info');
}

function downloadJSON() {
    window.location.href = '/api/stats/json';
    addLog('正在下载JSON文件...', 'info');
}

function resetStats() {
    if (confirm('确定要重置所有统计数据吗？')) {
        socket.emit('reset_stats');
        addLog('已请求重置统计数据', 'info');
    }
}

function requestHistory() {
    socket.emit('request_history');
    addLog('已请求历史数据', 'info');
}

function clearRateChart() {
    rateChart.data.labels = [];
    rateChart.data.datasets.forEach(ds => ds.data = []);
    rateChart.update();
    addLog('速率图表已清除', 'info');
}

function clearRemarkChart() {
    remarkChart.data.labels = [];
    remarkChart.data.datasets[0].data = [];
    remarkChart.data.datasets[1].data = [];
    remarkChart.update();
    addLog('DSCP降级图表已清除', 'info');
}

function clearDropChart() {
    dropChart.data.labels = [];
    dropChart.data.datasets[0].data = [];
    dropChart.data.datasets[1].data = [];
    dropChart.update();
    addLog('丢包图表已清除', 'info');
}

function clearDistChart() {
    distChart.data.datasets[0].data = [0, 0, 0];
    distChart.update();
    addLog('分布图表已清除', 'info');
}

function clearLogs() {
    document.getElementById('logs').innerHTML = '<div class="log-entry log-info">日志已清除</div>';
}

socket.on('connect', () => {
    document.getElementById('controller-status').textContent = '已连接';
    document.getElementById('controller-status').className = 'status-value connected';
    addLog('WebSocket 连接成功', 'success');
});

socket.on('disconnect', () => {
    document.getElementById('controller-status').textContent = '未连接';
    document.getElementById('controller-status').className = 'status-value disconnected';
    addLog('WebSocket 连接断开', 'error');
});

socket.on('init_data', (data) => {
    addLog('收到初始数据', 'success');
    if (data.meter_chain) {
        currentMeterChain = data.meter_chain;
        renderChainEditor(currentMeterChain);
        renderMeterChainVisual(currentMeterChain, data.meter_stats);
    }
});

socket.on('flow_data', (data) => {
    updateStats(data);
});

socket.on('meter_chain_updated', (data) => {
    if (data.success) {
        if (data.meter_chain) {
            currentMeterChain = data.meter_chain;
            renderChainEditor(currentMeterChain);
            renderMeterChainVisual(currentMeterChain, null);
        }
        showChainMessage(data.message, 'success');
        addLog(data.message, 'success');
    } else {
        showChainMessage(data.message, 'error');
        addLog(data.message, 'error');
    }
});

socket.on('json_exported', (data) => {
    const jsonStr = JSON.stringify(data.data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename || 'flow_stats.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`JSON已导出: ${data.filename}`, 'success');
});

socket.on('stats_reset', (data) => {
    if (data.success) {
        clearRateChart();
        clearRemarkChart();
        clearDropChart();
        clearDistChart();
        showChainMessage('统计数据已重置', 'success');
        addLog('统计数据已重置', 'success');
    }
});

socket.on('history_data', (data) => {
    if (data.rate_history && data.rate_history.length > 0) {
        rateChart.data.labels = [];
        rateChart.data.datasets.forEach(ds => ds.data = []);

        data.rate_history.forEach(item => {
            rateChart.data.labels.push(formatTime(item.timestamp));
            rateChart.data.datasets[0].data.push(item.rate / 1000000);
            for (let i = 1; i < rateChart.data.datasets.length; i++) {
                const thresholdMbps = (currentMeterChain[i-1] ? currentMeterChain[i-1].bands[0].rate / 1000 : 0);
                rateChart.data.datasets[i].data.push(thresholdMbps);
            }
        });
        rateChart.update();
    }

    if (data.remark_history && data.remark_history.length > 0) {
        remarkChart.data.labels = [];
        remarkChart.data.datasets[0].data = [];
        remarkChart.data.datasets[1].data = [];
        data.remark_history.forEach(item => {
            remarkChart.data.labels.push(formatTime(item.timestamp));
            remarkChart.data.datasets[0].data.push(item.remark_rate);
            remarkChart.data.datasets[1].data.push(item.total_remarked);
        });
        remarkChart.update();
    }

    if (data.drop_history && data.drop_history.length > 0) {
        dropChart.data.labels = [];
        dropChart.data.datasets[0].data = [];
        dropChart.data.datasets[1].data = [];
        data.drop_history.forEach(item => {
            dropChart.data.labels.push(formatTime(item.timestamp));
            dropChart.data.datasets[0].data.push(item.drop_rate);
            dropChart.data.datasets[1].data.push(item.total_dropped);
        });
        dropChart.update();
    }

    addLog(`已加载 ${data.rate_history?.length || 0} 条历史记录`, 'success');
});

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    renderChainEditor(currentMeterChain);
    renderMeterChainVisual(currentMeterChain, null);
    addLog('监控面板初始化完成', 'success');
});
