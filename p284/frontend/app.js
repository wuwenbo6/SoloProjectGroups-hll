const API_BASE = 'http://localhost:9999/api';

let currentData = null;
let constants = null;

async function fetchAPI(endpoint, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...defaultOptions,
            ...options,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        addLog(`请求失败: ${error.message}`, 'error');
        throw error;
    }
}

function addLog(message, type = 'info') {
    const logContent = document.getElementById('log-content');
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<span class="timestamp">[${timestamp}]</span>${message}`;
    logContent.prepend(entry);

    while (logContent.children.length > 100) {
        logContent.removeChild(logContent.lastChild);
    }
}

function getSyncStatusClass(status) {
    switch (status) {
        case 'locked':
            return 'status-locked';
        case 'acquiring':
            return 'status-acquiring';
        default:
            return 'status-searching';
    }
}

function getSyncLabel(status) {
    switch (status) {
        case 'locked':
            return '已锁定';
        case 'acquiring':
            return '同步中';
        default:
            return '搜索中';
    }
}

function getLqiQualityClass(quality) {
    switch (quality) {
        case 'excellent': return 'lqi-excellent';
        case 'good': return 'lqi-good';
        case 'fair': return 'lqi-fair';
        case 'poor': return 'lqi-poor';
        case 'bad': return 'lqi-bad';
        default: return '';
    }
}

function getLqiQualityLabel(quality) {
    switch (quality) {
        case 'excellent': return '优秀';
        case 'good': return '良好';
        case 'fair': return '一般';
        case 'poor': return '较差';
        case 'bad': return '很差';
        default: return '未知';
    }
}

function getErrorTypeClass(errorType) {
    const classes = {
        'bch_corrected': 'error-type-bch_corrected',
        'bch_uncorrectable': 'error-type-bch_uncorrectable',
        'bch_header_corrected': 'error-type-bch_header_corrected',
        'bch_header_uncorrectable': 'error-type-bch_header_uncorrectable',
        'sync_lost': 'error-type-sync_lost'
    };
    return classes[errorType] || '';
}

function getErrorTypeLabel(errorType) {
    const labels = {
        'bch_corrected': 'BCH可纠正',
        'bch_uncorrectable': 'BCH不可纠正',
        'bch_header_corrected': 'BCH头可纠正',
        'bch_header_uncorrectable': 'BCH头不可纠正',
        'sync_lost': '同步丢失'
    };
    return labels[errorType] || errorType;
}

function updateStatusBar(data) {
    if (!data || !data.sync_status) return;

    const syncStatusEl = document.getElementById('sync-status');
    const superframeNumberEl = document.getElementById('superframe-number');
    const syncRateEl = document.getElementById('sync-rate');
    const occupancyRateEl = document.getElementById('occupancy-rate');
    const flwRateEl = document.getElementById('flw-rate');
    const softGainEl = document.getElementById('soft-gain');
    const lqiValueEl = document.getElementById('lqi-value');
    const lqiQualityEl = document.getElementById('lqi-quality');

    const status = data.sync_status.superframe_status || 'searching';
    syncStatusEl.textContent = getSyncLabel(status);
    syncStatusEl.className = `value ${getSyncStatusClass(status)}`;

    superframeNumberEl.textContent = data.sync_status.superframe_number ?? '-';

    if (data.statistics) {
        syncRateEl.textContent = `${(data.statistics.sync_rate * 100).toFixed(1)}%`;
        occupancyRateEl.textContent = `${(data.statistics.occupancy_rate * 100).toFixed(1)}%`;

        if (data.statistics.flw_statistics) {
            flwRateEl.textContent = `${(data.statistics.flw_statistics.detection_rate * 100).toFixed(1)}%`;
        }
        if (data.statistics.soft_decision) {
            softGainEl.textContent = `${data.statistics.soft_decision.soft_gain_pct}%`;
        }
    }

    if (data.lqi) {
        lqiValueEl.textContent = data.lqi.lqi_value;
        lqiValueEl.className = `value ${getLqiQualityClass(data.lqi.lqi_quality)}`;
        lqiQualityEl.textContent = getLqiQualityLabel(data.lqi.lqi_quality);
        lqiQualityEl.className = `value ${getLqiQualityClass(data.lqi.lqi_quality)}`;
    }
}

function updateMultiframeSelect(multiframeCount) {
    const select = document.getElementById('multiframe-select');
    select.innerHTML = '<option value="all">全部</option>';

    for (let i = 0; i < multiframeCount; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `复帧 ${i}`;
        select.appendChild(option);
    }
}

function getSlotColorClass(slot) {
    if (slot.bch_soft_valid && !slot.bch_valid) {
        return 'soft-corrected';
    }
    if (slot.bch_errors > 0 && !slot.bch_valid && !slot.bch_soft_valid) {
        return 'bch-error';
    }
    if (!slot.bch_valid && slot.bch_soft_valid) {
        return 'soft-corrected';
    }
    switch (slot.type) {
        case 'signaling':
            return 'signaling';
        case 'traffic':
            return slot.occupied ? 'traffic' : 'idle';
        case 'guard':
            return 'guard';
        case 'idle':
            return 'idle';
        case 'empty':
            return 'empty';
        default:
            return 'idle';
    }
}

function renderOccupancyGrid(data) {
    const grid = document.getElementById('occupancy-grid');
    grid.innerHTML = '';

    const selectedMultiframe = document.getElementById('multiframe-select').value;
    const showLabels = document.getElementById('show-labels').checked;

    if (!data || !data.superframe || !data.superframe.multiframes) {
        grid.innerHTML = '<p style="color: #64748b;">暂无数据，请先生成或解析帧数据</p>';
        return;
    }

    const multiframes = data.superframe.multiframes;
    const timeslotCount = constants?.basic_frame_timeslots || 24;

    if (showLabels) {
        const labelRow = document.createElement('div');
        labelRow.className = 'timeslot-labels';
        for (let i = 0; i < timeslotCount; i++) {
            const label = document.createElement('div');
            label.className = 'timeslot-label';
            label.textContent = i;
            labelRow.appendChild(label);
        }
        grid.appendChild(labelRow);
    }

    const mfToRender = selectedMultiframe === 'all'
        ? multiframes
        : [multiframes[parseInt(selectedMultiframe)]];

    mfToRender.forEach((mf, mfIdx) => {
        const section = document.createElement('div');
        section.className = 'multiframe-section';

        const header = document.createElement('div');
        header.className = 'multiframe-header';
        header.innerHTML = `
            <span class="multiframe-title">复帧 ${mf.index}</span>
            <span class="multiframe-sync sync-${mf.sync_status}">${getSyncLabel(mf.sync_status)}</span>
        `;
        section.appendChild(header);

        mf.basic_frames.forEach((bf) => {
            const row = document.createElement('div');
            row.className = 'basic-frame-row';

            const indexLabel = document.createElement('div');
            indexLabel.className = 'frame-index';
            indexLabel.textContent = `帧 ${bf.index}`;
            row.appendChild(indexLabel);

            const slotsContainer = document.createElement('div');
            slotsContainer.className = 'timeslots-container';

            bf.timeslots.forEach((slot) => {
                const cell = document.createElement('div');
                cell.className = `timeslot-cell ${getSlotColorClass(slot)}`;

                const tooltip = document.createElement('div');
                tooltip.className = 'tooltip';
                tooltip.innerHTML = `
                    复帧: ${mf.index}<br>
                    基本帧: ${bf.index}<br>
                    时隙: ${slot.index}<br>
                    类型: ${slot.type}<br>
                    占用: ${slot.occupied ? '是' : '否'}<br>
                    硬判决: ${slot.bch_valid ? '有效' : '无效'} (错误: ${slot.bch_errors >= 0 ? slot.bch_errors : 'N/A'})<br>
                    软判决: ${slot.bch_soft_valid ? '有效' : '无效'}${slot.bch_soft_euclidean >= 0 ? ' (距离: ' + slot.bch_soft_euclidean + ')' : ''}
                `;
                cell.appendChild(tooltip);

                slotsContainer.appendChild(cell);
            });

            row.appendChild(slotsContainer);
            section.appendChild(row);
        });

        grid.appendChild(section);
    });
}

function getFlwCellClass(normalized) {
    if (normalized >= 0.9) return 'strong';
    if (normalized >= 0.75) return 'medium';
    if (normalized >= 0.5) return 'weak';
    return 'none';
}

function renderFlwView(data) {
    const heatmap = document.getElementById('flw-heatmap');
    const detail = document.getElementById('flw-detail');
    heatmap.innerHTML = '';
    detail.innerHTML = '';

    if (!data || !data.flw_correlations || data.flw_correlations.length === 0) {
        heatmap.innerHTML = '<p style="color: #64748b;">暂无FLW数据，请先生成或解析帧数据</p>';
        return;
    }

    const selectedMf = document.getElementById('multiframe-select').value;
    let flwData = data.flw_correlations;
    if (selectedMf !== 'all') {
        flwData = flwData.filter(d => d.multiframe === parseInt(selectedMf));
    }

    const mfGroups = {};
    flwData.forEach(d => {
        if (!mfGroups[d.multiframe]) mfGroups[d.multiframe] = [];
        mfGroups[d.multiframe].push(d);
    });

    Object.keys(mfGroups).sort((a, b) => a - b).forEach(mfIdx => {
        const frames = mfGroups[mfIdx];
        const section = document.createElement('div');
        section.className = 'multiframe-section';

        const header = document.createElement('div');
        header.className = 'multiframe-header';
        header.innerHTML = `<span class="multiframe-title">复帧 ${mfIdx}</span>`;
        section.appendChild(header);

        frames.forEach(frame => {
            const row = document.createElement('div');
            row.className = 'flw-heatmap-row';

            const label = document.createElement('div');
            label.className = 'flw-heatmap-label';
            label.textContent = `帧${frame.basic_frame}`;
            row.appendChild(label);

            const cell = document.createElement('div');
            cell.className = `flw-cell ${getFlwCellClass(frame.flw_normalized)}`;

            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.innerHTML = `
                基本帧: ${frame.basic_frame}<br>
                同步: ${frame.sync_detected ? '是' : '否'}<br>
                FLW检测: ${frame.flw_found ? '是' : '否'}<br>
                相关峰值: ${frame.correlation_peak}<br>
                归一化: ${frame.correlation_normalized}<br>
                FLW位置: ${frame.flw_position}
            `;
            cell.appendChild(tooltip);
            row.appendChild(cell);

            const barContainer = document.createElement('div');
            barContainer.style.cssText = 'display: flex; gap: 1px; flex: 1; align-items: center;';

            const bar = document.createElement('div');
            const pct = Math.min(frame.flw_normalized * 100, 100);
            const colorClass = getFlwCellClass(frame.flw_normalized);
            const colors = { strong: '#10b981', medium: '#f59e0b', weak: '#f97316', none: '#374151' };
            bar.style.cssText = `height: 12px; width: ${pct}%; background: ${colors[colorClass]}; border-radius: 2px; min-width: 2px;`;
            barContainer.appendChild(bar);

            const pctLabel = document.createElement('span');
            pctLabel.style.cssText = 'font-size: 0.65rem; color: #94a3b8; margin-left: 4px;';
            pctLabel.textContent = `${(frame.flw_normalized * 100).toFixed(0)}%`;
            barContainer.appendChild(pctLabel);

            row.appendChild(barContainer);
            section.appendChild(row);
        });

        heatmap.appendChild(section);
    });

    let totalDetected = 0;
    let totalFrames = 0;
    let peakSum = 0;
    let normSum = 0;
    flwData.forEach(d => {
        totalFrames++;
        if (d.flw_found) totalDetected++;
        peakSum += d.correlation_peak;
        normSum += d.correlation_normalized;
    });

    detail.innerHTML = `
        <h3>FLW相关器统计</h3>
        <div class="flw-detail-item">
            <span class="label">检测帧数</span>
            <span class="value">${totalDetected} / ${totalFrames}</span>
        </div>
        <div class="flw-detail-item">
            <span class="label">检测率</span>
            <span class="value">${totalFrames > 0 ? (totalDetected / totalFrames * 100).toFixed(1) : 0}%</span>
        </div>
        <div class="flw-detail-item">
            <span class="label">平均相关峰值</span>
            <span class="value">${totalFrames > 0 ? (peakSum / totalFrames).toFixed(2) : 0}</span>
        </div>
        <div class="flw-detail-item">
            <span class="label">平均归一化相关</span>
            <span class="value">${totalFrames > 0 ? (normSum / totalFrames).toFixed(4) : 0}</span>
        </div>
        <div class="flw-detail-item">
            <span class="label">算法</span>
            <span class="value">相关器匹配</span>
        </div>
        <div class="flw-detail-item">
            <span class="label">阈值</span>
            <span class="value">0.75</span>
        </div>
        <div class="flw-detail-item">
            <span class="label">同步字长度</span>
            <span class="value">${constants?.sync_word?.length || 16} bits</span>
        </div>
    `;
}

function renderBCHTable(data) {
    const tbody = document.getElementById('bch-table-body');
    tbody.innerHTML = '';

    if (!data || !data.bch_codes || data.bch_codes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #64748b;">暂无BCH码数据</td></tr>';
        return;
    }

    data.bch_codes.forEach((bch) => {
        const tr = document.createElement('tr');
        const softStatus = bch.soft_valid === true ? '有效' : bch.soft_valid === false ? '无效' : '-';
        const softClass = bch.soft_valid === true ? 'valid' : bch.soft_valid === false ? 'invalid' : '';

        const softImproved = bch.soft_improvement ? ' <span style="color: #06b6d4; font-weight: 600;">▲纠正</span>' : '';

        tr.innerHTML = `
            <td>${bch.multiframe}</td>
            <td>${bch.basic_frame}</td>
            <td>${bch.bch_index}</td>
            <td class="mono">${bch.data.substring(0, 20)}...</td>
            <td class="mono">${bch.decoded ? bch.decoded.substring(0, 20) + '...' : '-'}</td>
            <td class="${bch.valid ? 'valid' : 'invalid'}">${bch.valid ? '有效' : '无效'}${bch.errors >= 0 ? '(' + bch.errors + ')' : ''}</td>
            <td class="mono">${bch.soft_decoded ? bch.soft_decoded.substring(0, 20) + '...' : '-'}</td>
            <td>${bch.soft_euclidean !== null && bch.soft_euclidean !== undefined ? bch.soft_euclidean : '-'}</td>
            <td class="${softClass}">${softStatus}${softImproved}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderSoftView(data) {
    const content = document.getElementById('soft-content');
    content.innerHTML = '';

    if (!data || !data.soft_stats || Object.keys(data.soft_stats).length === 0) {
        content.innerHTML = '<p style="color: #64748b;">暂无软判决数据，请先生成或解析帧数据</p>';
        return;
    }

    const stats = data.soft_stats;

    const gainCard = document.createElement('div');
    gainCard.className = 'soft-card';
    const gainPct = stats.soft_gain_pct || 0;
    gainCard.innerHTML = `
        <h3>软判决增益</h3>
        <div class="soft-value ${gainPct > 0 ? 'positive' : 'neutral'}">${gainPct}%</div>
        <div class="soft-detail">软判决额外纠正了 ${stats.soft_improved || 0} 个硬判决无法解码的码字</div>
    `;
    content.appendChild(gainCard);

    const compCard = document.createElement('div');
    compCard.className = 'soft-card';
    compCard.innerHTML = `
        <h3>硬判决 vs 软判决</h3>
        <div class="comparison-grid">
            <div class="comparison-item hard">
                <div class="comp-label">硬判决有效</div>
                <div class="comp-value">${stats.hard_valid || 0}</div>
            </div>
            <div class="comparison-item soft">
                <div class="comp-label">软判决有效</div>
                <div class="comp-value">${stats.soft_valid || 0}</div>
            </div>
            <div class="comparison-item hard">
                <div class="comp-label">硬判决无效</div>
                <div class="comp-value">${stats.hard_invalid || 0}</div>
            </div>
            <div class="comparison-item soft">
                <div class="comp-label">软判决无效</div>
                <div class="comp-value">${stats.soft_invalid || 0}</div>
            </div>
        </div>
    `;
    content.appendChild(compCard);

    const distCard = document.createElement('div');
    distCard.className = 'soft-card';
    distCard.innerHTML = `
        <h3>欧几里得距离统计</h3>
        <div class="soft-value neutral">${stats.soft_euclidean_avg || 0}</div>
        <div class="soft-detail">平均欧几里得距离（越小越可靠）</div>
    `;
    content.appendChild(distCard);

    const algoCard = document.createElement('div');
    algoCard.className = 'soft-card';
    algoCard.innerHTML = `
        <h3>算法参数</h3>
        <div class="flw-detail-item">
            <span class="label">解码算法</span>
            <span class="value">Chase算法</span>
        </div>
        <div class="flw-detail-item">
            <span class="label">距离度量</span>
            <span class="value">欧几里得距离</span>
        </div>
        <div class="flw-detail-item">
            <span class="label">BCH参数</span>
            <span class="value">BCH(63,51,2)</span>
        </div>
        <div class="flw-detail-item">
            <span class="label">Chase深度</span>
            <span class="value">4</span>
        </div>
        <div class="flw-detail-item">
            <span class="label">软判决映射</span>
            <span class="value">1→+1, 0→-1</span>
        </div>
    `;
    content.appendChild(algoCard);

    const barCard = document.createElement('div');
    barCard.className = 'soft-card';
    barCard.style.gridColumn = '1 / -1';
    const total = (stats.hard_valid || 0) + (stats.hard_invalid || 0);
    const hardPct = total > 0 ? (stats.hard_valid / total * 100) : 0;
    const softPct = total > 0 ? (stats.soft_valid / total * 100) : 0;
    barCard.innerHTML = `
        <h3>有效率对比</h3>
        <div class="soft-bar-chart">
            <div class="soft-bar hard" style="height: ${hardPct}%;">
                <div class="soft-bar-label">硬判决</div>
            </div>
            <div class="soft-bar soft" style="height: ${softPct}%;">
                <div class="soft-bar-label">软判决</div>
            </div>
        </div>
        <div style="margin-top: 25px; display: flex; justify-content: space-around;">
            <div style="text-align: center;">
                <div style="font-size: 1.2rem; font-weight: 600; color: #94a3b8;">${hardPct.toFixed(1)}%</div>
                <div style="font-size: 0.75rem; color: #64748b;">硬判决有效率</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 1.2rem; font-weight: 600; color: #06b6d4;">${softPct.toFixed(1)}%</div>
                <div style="font-size: 0.75rem; color: #64748b;">软判决有效率</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 1.2rem; font-weight: 600; color: #10b981;">+${(softPct - hardPct).toFixed(1)}%</div>
                <div style="font-size: 0.75rem; color: #64748b;">增益</div>
            </div>
        </div>
    `;
    content.appendChild(barCard);
}

function renderLQIView(data) {
    const content = document.getElementById('lqi-content');
    content.innerHTML = '';

    if (!data || !data.lqi) {
        content.innerHTML = '<p style="color: #64748b;">暂无LQI数据，请先生成或解析帧数据</p>';
        return;
    }

    const lqi = data.lqi;
    const lqiStats = data.lqi_statistics || {};

    const gaugeCard = document.createElement('div');
    gaugeCard.className = 'soft-card';
    gaugeCard.style.gridColumn = '1 / -1';
    const rotation = (lqi.lqi_value / 100) * 180 - 90;
    gaugeCard.innerHTML = `
        <div style="text-align: center;">
            <div class="lqi-gauge">
                <div class="lqi-gauge-bg"></div>
                <div class="lqi-gauge-needle" style="transform: translateX(-50%) rotate(${rotation}deg);"></div>
                <div class="lqi-gauge-center"></div>
                <div class="lqi-gauge-value ${getLqiQualityClass(lqi.lqi_quality)}">${lqi.lqi_value}</div>
                <div class="lqi-gauge-label">${getLqiQualityLabel(lqi.lqi_quality)}</div>
            </div>
            <div style="margin-top: 50px; display: flex; justify-content: space-around; font-size: 0.8rem; color: #64748b;">
                <span>0<br>很差</span>
                <span>20<br>较差</span>
                <span>40<br>一般</span>
                <span>60<br>良好</span>
                <span>80<br>优秀</span>
                <span>100</span>
            </div>
        </div>
    `;
    content.appendChild(gaugeCard);

    const snrCard = document.createElement('div');
    snrCard.className = 'soft-card';
    const snrClass = lqi.snr_db >= 15 ? 'positive' : lqi.snr_db >= 5 ? 'neutral' : 'negative';
    snrCard.innerHTML = `
        <h3>信噪比 (SNR)</h3>
        <div class="soft-value ${snrClass}">${lqi.snr_db.toFixed(1)} dB</div>
        <div class="soft-detail">${lqi.snr_db >= 20 ? '信号极强' : lqi.snr_db >= 15 ? '信号强' : lqi.snr_db >= 10 ? '信号良好' : lqi.snr_db >= 5 ? '信号一般' : lqi.snr_db >= 0 ? '信号弱' : '信号极差'}</div>
    `;
    content.appendChild(snrCard);

    const corrCard = document.createElement('div');
    corrCard.className = 'soft-card';
    const corrClass = lqi.correlation_normalized >= 0.85 ? 'positive' : lqi.correlation_normalized >= 0.6 ? 'neutral' : 'negative';
    corrCard.innerHTML = `
        <h3>同步相关性</h3>
        <div class="soft-value ${corrClass}">${(lqi.correlation_normalized * 100).toFixed(1)}%</div>
        <div class="soft-detail">归一化相关峰值</div>
    `;
    content.appendChild(corrCard);

    const evmCard = document.createElement('div');
    evmCard.className = 'soft-card';
    const evmClass = lqi.evm <= 15 ? 'positive' : lqi.evm <= 30 ? 'neutral' : 'negative';
    evmCard.innerHTML = `
        <h3>误差向量幅度 (EVM)</h3>
        <div class="soft-value ${evmClass}">${lqi.evm.toFixed(2)}%</div>
        <div class="soft-detail">EVM越小越好</div>
    `;
    content.appendChild(evmCard);

    const berCard = document.createElement('div');
    berCard.className = 'soft-card';
    const berClass = lqi.ber_estimate <= 1e-4 ? 'positive' : lqi.ber_estimate <= 1e-2 ? 'neutral' : 'negative';
    const berFormatted = lqi.ber_estimate < 0.01 ? lqi.ber_estimate.toExponential(2) : (lqi.ber_estimate * 100).toFixed(2) + '%';
    berCard.innerHTML = `
        <h3>误码率 (BER) 估计</h3>
        <div class="soft-value ${berClass}">${berFormatted}</div>
        <div class="soft-detail">基于SNR和BCH错误估计</div>
    `;
    content.appendChild(berCard);

    const bchCard = document.createElement('div');
    bchCard.className = 'soft-card';
    const bchClass = lqi.bch_error_rate <= 0.05 ? 'positive' : lqi.bch_error_rate <= 0.15 ? 'neutral' : 'negative';
    bchCard.innerHTML = `
        <h3>BCH错误率</h3>
        <div class="soft-value ${bchClass}">${(lqi.bch_error_rate * 100).toFixed(2)}%</div>
        <div class="soft-detail">可纠正: ${lqi.bch_corrected_count} | 不可纠正: ${lqi.bch_uncorrectable_count}</div>
    `;
    content.appendChild(bchCard);

    if (lqiStats && Object.keys(lqiStats).length > 0) {
        const histCard = document.createElement('div');
        histCard.className = 'soft-card';
        histCard.style.gridColumn = '1 / -1';
        histCard.innerHTML = `
            <h3>LQI历史统计 (样本数: ${lqiStats.sample_count})</h3>
            <div class="comparison-grid">
                <div class="comparison-item soft">
                    <div class="comp-label">LQI 平均</div>
                    <div class="comp-value">${lqiStats.lqi_avg}</div>
                </div>
                <div class="comparison-item soft">
                    <div class="comp-label">LQI 范围</div>
                    <div class="comp-value" style="font-size: 1.2rem;">${lqiStats.lqi_min} - ${lqiStats.lqi_max}</div>
                </div>
                <div class="comparison-item hard">
                    <div class="comp-label">LQI 标准差</div>
                    <div class="comp-value">${lqiStats.lqi_std}</div>
                </div>
                <div class="comparison-item hard">
                    <div class="comp-label">平均 EVM</div>
                    <div class="comp-value">${lqiStats.evm_avg}%</div>
                </div>
            </div>
        `;
        content.appendChild(histCard);
    }
}

function renderErrorStats(data) {
    const summaryEl = document.getElementById('error-summary');
    const distEl = document.getElementById('error-distribution');
    const tableEl = document.getElementById('error-table-body');

    summaryEl.innerHTML = '';
    distEl.innerHTML = '';
    tableEl.innerHTML = '';

    if (!data || !data.error_summary) {
        summaryEl.innerHTML = '<p style="color: #64748b;">暂无误码统计数据</p>';
        return;
    }

    const summary = data.error_summary;
    const dist = data.error_distribution || {};
    const entries = data.error_entries || [];

    const totalCard = document.createElement('div');
    totalCard.className = 'soft-card';
    totalCard.innerHTML = `
        <h3>总帧数</h3>
        <div class="soft-value neutral">${summary.total_frames}</div>
        <div class="soft-detail">错误帧: ${summary.frame_errors}</div>
    `;
    summaryEl.appendChild(totalCard);

    const ferCard = document.createElement('div');
    ferCard.className = 'soft-card';
    const ferClass = summary.frame_error_rate <= 0.01 ? 'positive' : summary.frame_error_rate <= 0.1 ? 'neutral' : 'negative';
    ferCard.innerHTML = `
        <h3>帧错误率 (FER)</h3>
        <div class="soft-value ${ferClass}">${(summary.frame_error_rate * 100).toFixed(2)}%</div>
        <div class="soft-detail">错误帧 / 总帧</div>
    `;
    summaryEl.appendChild(ferCard);

    const berCard = document.createElement('div');
    berCard.className = 'soft-card';
    const berClass2 = summary.bit_error_rate <= 1e-4 ? 'positive' : summary.bit_error_rate <= 1e-2 ? 'neutral' : 'negative';
    const berFormatted2 = summary.bit_error_rate < 0.01 ? summary.bit_error_rate.toExponential(2) : (summary.bit_error_rate * 100).toFixed(2) + '%';
    berCard.innerHTML = `
        <h3>比特错误率 (BER)</h3>
        <div class="soft-value ${berClass2}">${berFormatted2}</div>
        <div class="soft-detail">${summary.total_bit_errors} 错误比特 / ${summary.total_bits_processed} 总比特</div>
    `;
    summaryEl.appendChild(berCard);

    const typeCard = document.createElement('div');
    typeCard.className = 'soft-card';
    typeCard.style.gridColumn = '1 / -1';
    const typeDist = summary.error_type_distribution || {};
    const typeItems = Object.entries(typeDist)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `
            <div class="flw-detail-item">
                <span class="label">${getErrorTypeLabel(type)}</span>
                <span class="value ${getErrorTypeClass(type)}">${count}</span>
            </div>
        `).join('');
    typeCard.innerHTML = `
        <h3>错误类型分布 (总计: ${summary.total_entries})</h3>
        ${typeItems || '<div style="color: #64748b;">暂无错误</div>'}
    `;
    summaryEl.appendChild(typeCard);

    if (dist.by_multiframe) {
        const mfDistCard = document.createElement('div');
        mfDistCard.className = 'soft-card';
        mfDistCard.innerHTML = `
            <h3>按复帧分布</h3>
            <div style="max-height: 150px; overflow-y: auto;">
                ${Object.entries(dist.by_multiframe).map(([mf, count]) => `
                    <div class="flw-detail-item">
                        <span class="label">复帧 ${mf}</span>
                        <span class="value">${count}</span>
                    </div>
                `).join('')}
            </div>
        `;
        distEl.appendChild(mfDistCard);
    }

    if (dist.by_timeslot) {
        const tsDistCard = document.createElement('div');
        tsDistCard.className = 'soft-card';
        tsDistCard.innerHTML = `
            <h3>按时隙分布</h3>
            <div style="max-height: 150px; overflow-y: auto;">
                ${Object.entries(dist.by_timeslot).map(([ts, count]) => `
                    <div class="flw-detail-item">
                        <span class="label">时隙 ${ts}</span>
                        <span class="value">${count}</span>
                    </div>
                `).join('')}
            </div>
        `;
        distEl.appendChild(tsDistCard);
    }

    if (entries.length > 0) {
        entries.forEach((entry) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${entry.multiframe}</td>
                <td>${entry.basic_frame}</td>
                <td>${entry.timeslot !== null ? entry.timeslot : '-'}</td>
                <td>${entry.bch_index !== null ? entry.bch_index : '-'}</td>
                <td class="${getErrorTypeClass(entry.error_type)}">${getErrorTypeLabel(entry.error_type)}</td>
                <td>${entry.bit_errors}</td>
                <td>${(entry.error_rate * 100).toFixed(4)}%</td>
                <td style="font-size: 0.75rem; color: #64748b;">${new Date(entry.timestamp).toLocaleTimeString()}</td>
            `;
            tableEl.appendChild(tr);
        });
    } else {
        tableEl.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #64748b;">暂无错误记录</td></tr>';
    }
}

function renderTrafficTable(data) {
    const tbody = document.getElementById('traffic-table-body');
    tbody.innerHTML = '';

    if (!data || !data.traffic_timeslots || data.traffic_timeslots.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #64748b;">暂无业务时隙数据</td></tr>';
        return;
    }

    data.traffic_timeslots.forEach((slot) => {
        const tr = document.createElement('tr');
        const dataPreview = slot.data.length > 30
            ? slot.data.substring(0, 30) + '...'
            : slot.data;

        tr.innerHTML = `
            <td>${slot.multiframe}</td>
            <td>${slot.basic_frame}</td>
            <td>${slot.timeslot}</td>
            <td class="mono" title="${slot.data}">${dataPreview}</td>
            <td class="${slot.bch_valid ? 'valid' : 'invalid'}">${slot.bch_valid ? '有效' : '无效'}</td>
            <td class="${slot.bch_soft_valid ? 'valid' : 'invalid'}">${slot.bch_soft_valid ? '有效' : '无效'}</td>
            <td>${slot.bch_soft_euclidean >= 0 ? slot.bch_soft_euclidean : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderStatistics(data) {
    const content = document.getElementById('statistics-content');
    content.innerHTML = '';

    if (!data || !data.statistics) {
        content.innerHTML = '<p style="color: #64748b;">暂无统计数据</p>';
        return;
    }

    const stats = data.statistics;

    const cards = [
        {
            title: '超帧信息',
            value: `#${stats.superframe_number}`,
            detail: `同步状态: ${getSyncLabel(stats.sync_status)}`,
        },
        {
            title: '基本帧统计',
            value: stats.total_basic_frames,
            detail: `已同步: ${stats.synced_basic_frames} (${(stats.sync_rate * 100).toFixed(1)}%)`,
        },
        {
            title: '时隙统计',
            value: stats.total_timeslots,
            detail: `已占用: ${stats.occupied_timeslots} (${(stats.occupancy_rate * 100).toFixed(1)}%)`,
        },
        {
            title: 'BCH码统计',
            value: stats.bch_statistics.total,
            detail: `有效: ${stats.bch_statistics.valid} (错误率: ${(stats.bch_statistics.error_rate * 100).toFixed(2)}%)`,
        },
    ];

    if (stats.flw_statistics) {
        cards.push({
            title: 'FLW相关器统计',
            value: `${(stats.flw_statistics.detection_rate * 100).toFixed(1)}%`,
            detail: `检测: ${stats.flw_statistics.detected}/${stats.flw_statistics.total} | 平均相关: ${stats.flw_statistics.avg_correlation_normalized}`,
        });
    }

    if (stats.soft_decision && Object.keys(stats.soft_decision).length > 0) {
        cards.push({
            title: 'BCH软判决增益',
            value: `${stats.soft_decision.soft_gain_pct}%`,
            detail: `额外纠正: ${stats.soft_decision.soft_improved} 个码字 | 平均欧氏距离: ${stats.soft_decision.soft_euclidean_avg}`,
        });
    }

    cards.forEach((card) => {
        const div = document.createElement('div');
        div.className = 'stat-card';
        div.innerHTML = `
            <h3>${card.title}</h3>
            <div class="stat-value">${card.value}</div>
            <div class="stat-detail">${card.detail}</div>
        `;
        content.appendChild(div);
    });

    const slotDistDiv = document.createElement('div');
    slotDistDiv.className = 'stat-card';
    slotDistDiv.innerHTML = `
        <h3>时隙分布</h3>
        <ul class="stat-list">
            <li><span>信令时隙</span><span>${stats.slot_distribution.signaling}</span></li>
            <li><span>业务时隙</span><span>${stats.slot_distribution.traffic}</span></li>
            <li><span>空闲时隙</span><span>${stats.slot_distribution.idle}</span></li>
            <li><span>保护时隙</span><span>${stats.slot_distribution.guard}</span></li>
        </ul>
    `;
    content.appendChild(slotDistDiv);

    if (data.sync_status && data.sync_status.multiframe_statuses) {
        const mfStatusDiv = document.createElement('div');
        mfStatusDiv.className = 'stat-card';
        mfStatusDiv.innerHTML = `
            <h3>复帧同步状态</h3>
            <ul class="stat-list">
                ${data.sync_status.multiframe_statuses.map((mf) => `
                    <li>
                        <span>复帧 ${mf.index}</span>
                        <span class="${getSyncStatusClass(mf.status)}">${getSyncLabel(mf.status)} (${mf.synced_basic_frames})</span>
                    </li>
                `).join('')}
            </ul>
        `;
        content.appendChild(mfStatusDiv);
    }

    if (stats.soft_decision && Object.keys(stats.soft_decision).length > 0) {
        const softDiv = document.createElement('div');
        softDiv.className = 'stat-card';
        softDiv.innerHTML = `
            <h3>软判决详细对比</h3>
            <ul class="stat-list">
                <li><span>硬判决有效</span><span>${stats.soft_decision.hard_valid}</span></li>
                <li><span>硬判决无效</span><span>${stats.soft_decision.hard_invalid}</span></li>
                <li><span>软判决有效</span><span>${stats.soft_decision.soft_valid}</span></li>
                <li><span>软判决无效</span><span>${stats.soft_decision.soft_invalid}</span></li>
                <li><span>软判决纠正</span><span style="color: #06b6d4;">${stats.soft_decision.soft_improved}</span></li>
                <li><span>平均欧氏距离</span><span>${stats.soft_decision.soft_euclidean_avg}</span></li>
            </ul>
        `;
        content.appendChild(softDiv);
    }
}

function updateAllViews(data) {
    currentData = data;
    updateStatusBar(data);
    updateMultiframeSelect(data.superframe?.multiframes?.length || 0);
    renderOccupancyGrid(data);
    renderFlwView(data);
    renderBCHTable(data);
    renderSoftView(data);
    renderLQIView(data);
    renderErrorStats(data);
    renderTrafficTable(data);
    renderStatistics(data);
}

async function loadConstants() {
    try {
        const data = await fetchAPI('/constants');
        constants = data;
        addLog('已加载GMR常量配置', 'info');
    } catch (error) {
        addLog('加载常量失败，请确保后端服务已启动', 'warning');
    }
}

async function generateAndParse() {
    const occupancyRate = parseFloat(document.getElementById('occupancy-rate-input').value);
    const errorRate = parseFloat(document.getElementById('error-rate-input').value);
    const useFlw = document.getElementById('use-flw').checked;
    const useSoft = document.getElementById('use-soft').checked;

    addLog(`生成测试数据 - 占用率: ${occupancyRate}, 误码率: ${errorRate}, FLW: ${useFlw ? '开' : '关'}, 软判决: ${useSoft ? '开' : '关'}`, 'info');

    try {
        const data = await fetchAPI('/test/parse', {
            method: 'POST',
            body: JSON.stringify({
                occupancy_rate: occupancyRate,
                error_rate: errorRate,
                use_flw: useFlw,
                use_soft: useSoft
            }),
        });

        const stats = await fetchAPI('/statistics');
    data.statistics = stats;

    const errEntries = await fetchAPI('/errors/entries?limit=100').catch(() => ({ entries: [] }));
    data.error_entries = errEntries.entries || [];

    addLog(`解析完成 - 超帧 #${data.superframe_number || 0}, 同步状态: ${getSyncLabel(data.sync_status.superframe_status)}`, 'success');

    updateAllViews(data);
    } catch (error) {
        addLog(`解析失败: ${error.message}`, 'error');
    }
}

async function parseHex() {
    const hexData = document.getElementById('hex-input').value.trim();

    if (!hexData) {
        addLog('请输入十六进制数据', 'warning');
        return;
    }

    const useFlw = document.getElementById('use-flw').checked;
    const useSoft = document.getElementById('use-soft').checked;

    addLog('正在解析十六进制数据...', 'info');

    try {
        const data = await fetchAPI('/parse/hex', {
            method: 'POST',
            body: JSON.stringify({
                hex_data: hexData,
                use_flw: useFlw,
                use_soft: useSoft
            }),
        });

        const stats = await fetchAPI('/statistics');
        data.statistics = stats;

        addLog('解析成功', 'success');
        updateAllViews(data);
    } catch (error) {
        addLog(`解析失败: ${error.message}`, 'error');
    }
}

async function parseFile() {
    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];

    if (!file) {
        addLog('请选择要上传的文件', 'warning');
        return;
    }

    addLog(`正在解析文件: ${file.name} (${file.size} 字节)`, 'info');

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE}/parse/binary`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const stats = await fetchAPI('/statistics');
        data.statistics = stats;

        addLog('文件解析成功', 'success');
        updateAllViews(data);
    } catch (error) {
        addLog(`文件解析失败: ${error.message}`, 'error');
    }
}

function setupEventListeners() {
    document.getElementById('generate-btn').addEventListener('click', generateAndParse);
    document.getElementById('parse-hex-btn').addEventListener('click', parseHex);
    document.getElementById('parse-file-btn').addEventListener('click', parseFile);

    document.getElementById('occupancy-rate-input').addEventListener('input', (e) => {
        document.getElementById('occupancy-value').textContent = e.target.value;
    });

    document.getElementById('error-rate-input').addEventListener('input', (e) => {
        document.getElementById('error-value').textContent = e.target.value;
    });

    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            const viewId = btn.dataset.view;
            document.querySelectorAll('.view').forEach((view) => {
                view.classList.remove('active');
            });
            document.getElementById(`${viewId}-view`).classList.add('active');
        });
    });

    document.getElementById('multiframe-select').addEventListener('change', () => {
        renderOccupancyGrid(currentData);
        renderFlwView(currentData);
    });

    document.getElementById('show-labels').addEventListener('change', () => {
        renderOccupancyGrid(currentData);
    });

    document.getElementById('hex-input').addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            parseHex();
        }
    });

    document.getElementById('clear-stats-btn').addEventListener('click', async () => {
        if (confirm('确定要清除所有统计数据吗？')) {
            try {
                await fetchAPI('/errors/clear', { method: 'POST' });
                addLog('统计数据已清除', 'success');
                currentData = null;
                updateAllViews({});
            } catch (error) {
                addLog(`清除失败: ${error.message}`, 'error');
            }
        }
    });

    document.getElementById('export-csv-btn').addEventListener('click', () => {
        window.open(`${API_BASE}/errors/export/csv?limit=1000`, '_blank');
        addLog('导出CSV文件', 'info');
    });

    document.getElementById('export-json-btn').addEventListener('click', () => {
        window.open(`${API_BASE}/errors/export/json?limit=1000`, '_blank');
        addLog('导出JSON文件', 'info');
    });
}

async function init() {
    addLog('GMR帧解析系统已启动（含BCH软判决 + FLW相关器 + LQI + 误码统计）', 'info');

    await loadConstants();
    setupEventListeners();

    try {
        await fetchAPI('/health');
        addLog('已连接到后端服务', 'success');
    } catch (error) {
        addLog('无法连接到后端服务，请确保服务在端口9999上运行', 'warning');
    }
}

document.addEventListener('DOMContentLoaded', init);
