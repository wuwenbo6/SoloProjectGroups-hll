const API_BASE = '/api';

let selectedFile = null;
let batchFiles = [];
let currentPage = 1;
let currentRecordingId = null;

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initSingleUpload();
    initBatchUpload();
    initMigration();
    initExport();
    loadHistory();
    loadStats();
});

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(tab).classList.add('active');

            if (tab === 'history') loadHistory();
            if (tab === 'stats') loadStats();
            if (tab === 'migration') loadMigrationTimeline();
        });
    });
}

function initSingleUpload() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const predictBtn = document.getElementById('predictBtn');

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            updateDropZone(dropZone, selectedFile);
            predictBtn.disabled = false;
        }
    });

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
        
        if (e.dataTransfer.files.length > 0) {
            selectedFile = e.dataTransfer.files[0];
            updateDropZone(dropZone, selectedFile);
            predictBtn.disabled = false;
        }
    });

    predictBtn.addEventListener('click', predict);
}

function initBatchUpload() {
    const dropZone = document.getElementById('batchDropZone');
    const fileInput = document.getElementById('batchFileInput');
    const predictBtn = document.getElementById('batchPredictBtn');

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            batchFiles = Array.from(e.target.files);
            updateFileList();
            predictBtn.disabled = false;
        }
    });

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
        
        if (e.dataTransfer.files.length > 0) {
            batchFiles = Array.from(e.dataTransfer.files);
            updateFileList();
            predictBtn.disabled = false;
        }
    });

    predictBtn.addEventListener('click', batchPredict);
}

function updateDropZone(dropZone, file) {
    const content = dropZone.querySelector('.drop-zone-content');
    content.innerHTML = `
        <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
        <p><strong>${file.name}</strong></p>
        <p class="hint">${formatFileSize(file.size)}</p>
    `;
}

function updateFileList() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = batchFiles.map((file, index) => `
        <div class="file-item">
            <span class="file-name">${file.name}</span>
            <span class="file-size">${formatFileSize(file.size)}</span>
        </div>
    `).join('');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function predict() {
    if (!selectedFile) return;

    const loading = document.getElementById('loading');
    const result = document.getElementById('result');
    
    loading.classList.remove('hidden');
    result.classList.add('hidden');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        const response = await fetch(`${API_BASE}/predict`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (data.success) {
            displayResult(data);
        } else {
            alert('识别失败: ' + (data.error || '未知错误'));
        }
    } catch (error) {
        alert('请求失败: ' + error.message);
    } finally {
        loading.classList.add('hidden');
    }
}

function displayResult(data) {
    const result = document.getElementById('result');
    const topSpecies = document.getElementById('topSpecies');
    const confidenceFill = document.getElementById('confidenceFill');
    const confidenceText = document.getElementById('confidenceText');
    const spectrogram = document.getElementById('spectrogram');
    const similarSpecies = document.getElementById('similarSpecies');
    const statsGrid = document.getElementById('statsGrid');
    const biodiversityScore = document.getElementById('biodiversityScore');
    const acousticIndicesGrid = document.getElementById('acousticIndicesGrid');
    const migrationAnalysis = document.getElementById('migrationAnalysis');

    currentRecordingId = data.recording_id;

    topSpecies.textContent = data.top_prediction.species;
    confidenceFill.style.width = data.top_prediction.confidence_percent + '%';
    confidenceText.textContent = data.top_prediction.confidence_percent + '%';
    spectrogram.src = data.spectrogram_url;

    const stats = data.processing_stats || {};
    const statsHtml = `
        <div class="stat-badge info">
            <div class="stat-badge-label">原始时长</div>
            <div class="stat-badge-value">${data.original_duration || data.duration}s</div>
        </div>
        <div class="stat-badge info">
            <div class="stat-badge-label">有效时长</div>
            <div class="stat-badge-value">${data.processed_duration || data.duration}s</div>
        </div>
        <div class="stat-badge ${stats.noise_reduced ? 'success' : ''}">
            <div class="stat-badge-label">噪声抑制</div>
            <div class="stat-badge-value">${stats.noise_reduced ? '已应用' : '未应用'}</div>
        </div>
        <div class="stat-badge ${stats.vad_applied ? 'success' : ''}">
            <div class="stat-badge-label">语音检测</div>
            <div class="stat-badge-value">${stats.vad_applied ? '已应用' : '未应用'}</div>
        </div>
    `;
    statsGrid.innerHTML = statsHtml;

    const otherPredictions = data.predictions.slice(1);
    similarSpecies.innerHTML = otherPredictions.map((pred, index) => `
        <div class="species-item">
            <div class="species-rank">${index + 2}</div>
            <div class="species-info">
                <div class="species-info-name">${pred.species}</div>
                <div class="species-conf-bar">
                    <div class="species-conf-fill" style="width: ${pred.confidence_percent}%"></div>
                </div>
            </div>
            <div>${pred.confidence_percent}%</div>
        </div>
    `).join('');

    if (data.acoustic_indices) {
        const indices = data.acoustic_indices;
        const bioScore = indices.biodiversity_score || 0;
        biodiversityScore.innerHTML = `
            <div class="biodiversity-label">生物多样性指数</div>
            <div class="biodiversity-value">${Math.round(bioScore * 100)}</div>
            <div class="biodiversity-bar">
                <div class="biodiversity-bar-fill" style="width: ${bioScore * 100}%"></div>
            </div>
        `;

        acousticIndicesGrid.innerHTML = `
            <div class="index-item"><div class="index-name">ACI (声学复杂度)</div><div class="index-value">${indices.aci}</div></div>
            <div class="index-item"><div class="index-name">ADI (声学多样性)</div><div class="index-value">${indices.adi}</div></div>
            <div class="index-item"><div class="index-name">BI (生物声学指数)</div><div class="index-value">${indices.bi}</div></div>
            <div class="index-item"><div class="index-name">H (频谱熵)</div><div class="index-value">${indices.h}</div></div>
            <div class="index-item"><div class="index-name">NSI (噪声指数)</div><div class="index-value">${indices.nsi}</div></div>
            <div class="index-item"><div class="index-name">SC (事件计数)</div><div class="index-value">${indices.sc}/s</div></div>
            <div class="index-item"><div class="index-name">时间熵</div><div class="index-value">${indices.temporal_entropy}</div></div>
            <div class="index-item"><div class="index-name">声学丰富度</div><div class="index-value">${Math.round(indices.acoustic_richness * 100)}%</div></div>
        `;
    }

    if (data.migration_analysis) {
        const ma = data.migration_analysis;
        const migrantsHtml = ma.detected_migrants.map(m => 
            `<span class="migrant-item">${m.species} (${m.confidence}%)</span>`
        ).join('');

        migrationAnalysis.innerHTML = `
            <div class="hotspot-level ${ma.hotspot_level}">
                迁徙热点: ${ma.hotspot_level.toUpperCase()}
            </div>
            <div class="migration-info">
                <p><span>季节:</span> ${getSeasonName(ma.season)}</p>
                <p><span>当前时段:</span> ${ma.is_peak_hour ? '高峰时段' : '非高峰时段'}</p>
                <p><span>高峰时段:</span> ${ma.peak_hours.join(':00, ')}:00</p>
                <p><span>热点得分:</span> ${Math.round(ma.hotspot_score * 100)}%</p>
            </div>
            ${ma.detected_migrants.length > 0 ? `
            <div class="migrants-list">
                <strong>检测到迁徙物种:</strong><br>
                ${migrantsHtml}
            </div>
            ` : ''}
        `;
    }

    result.classList.remove('hidden');
}

function getSeasonName(season) {
    const names = {
        'spring': '春季',
        'summer': '夏季',
        'fall': '秋季',
        'winter': '冬季'
    };
    return names[season] || season;
}

async function batchPredict() {
    if (batchFiles.length === 0) return;

    const loading = document.getElementById('batchLoading');
    const result = document.getElementById('batchResult');
    const progress = document.getElementById('batchProgress');
    
    loading.classList.remove('hidden');
    result.classList.add('hidden');
    progress.textContent = `0 / ${batchFiles.length}`;

    const formData = new FormData();
    batchFiles.forEach(file => {
        formData.append('files', file);
    });

    try {
        const response = await fetch(`${API_BASE}/batch-predict`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (data.success) {
            displayBatchResults(data.results);
        } else {
            alert('批量识别失败');
        }
    } catch (error) {
        alert('请求失败: ' + error.message);
    } finally {
        loading.classList.add('hidden');
    }
}

function displayBatchResults(results) {
    const result = document.getElementById('batchResult');
    const resultsList = document.getElementById('batchResultsList');

    resultsList.innerHTML = results.map((item, index) => {
        if (item.error) {
            return `
                <div class="batch-result-item error">
                    <div class="batch-filename">${item.filename}</div>
                    <div class="batch-error">错误: ${item.error}</div>
                </div>
            `;
        }
        return `
            <div class="batch-result-item success">
                <div class="batch-filename">${item.filename} (${item.duration}s)</div>
                <div class="batch-prediction">
                    ${item.top_prediction.species} - ${item.top_prediction.confidence_percent}%
                </div>
            </div>
        `;
    }).join('');

    result.classList.remove('hidden');
}

async function loadHistory(page = 1) {
    try {
        const response = await fetch(`${API_BASE}/recordings?page=${page}&per_page=10`);
        const data = await response.json();
        
        displayHistory(data.recordings);
        displayPagination(data.total, data.page, data.per_page);
    } catch (error) {
        console.error('加载历史记录失败:', error);
    }
}

function displayHistory(recordings) {
    const historyList = document.getElementById('historyList');
    
    if (recordings.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #888;">暂无记录</p>';
        return;
    }

    historyList.innerHTML = recordings.map(rec => `
        <div class="history-item" onclick="showRecordingDetail(${rec.id})">
            <div>
                <div class="history-filename">${rec.filename}</div>
                <div class="history-meta">${rec.duration}s · ${formatDate(rec.uploaded_at)}</div>
            </div>
            <div class="history-prediction">
                <div class="history-species">${rec.top_prediction?.species || '未知'}</div>
                <div class="history-meta">${rec.top_prediction?.confidence_percent || 0}%</div>
            </div>
        </div>
    `).join('');
}

function displayPagination(total, currentPage, perPage) {
    const pagination = document.getElementById('pagination');
    const totalPages = Math.ceil(total / perPage);
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="loadHistory(${i})">${i}</button>`;
    }
    pagination.innerHTML = html;
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN');
}

async function showRecordingDetail(id) {
    try {
        const response = await fetch(`${API_BASE}/recordings/${id}`);
        const data = await response.json();
        
        alert(`文件名: ${data.filename}\n时长: ${data.duration}s\n采样率: ${data.sample_rate}Hz\n\n预测结果:\n${data.predictions.map(p => `${p.species}: ${p.confidence_percent}%`).join('\n')}`);
    } catch (error) {
        console.error('获取详情失败:', error);
    }
}

async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();
        
        document.getElementById('totalRecordings').textContent = data.total_recordings;
        document.getElementById('totalPredictions').textContent = data.total_predictions;
        
        displaySpeciesDistribution(data.species_distribution);
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

function displaySpeciesDistribution(distribution) {
    const container = document.getElementById('speciesDistribution');
    const entries = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
    
    if (entries.length === 0) {
        container.innerHTML = '<p style="color: #888;">暂无数据</p>';
        return;
    }

    const maxCount = Math.max(...entries.map(e => e[1]));

    container.innerHTML = entries.map(([species, count]) => `
        <div class="species-dist-item">
            <div class="species-dist-name">${species}</div>
            <div class="species-dist-bar">
                <div class="species-dist-fill" style="width: ${(count / maxCount * 100).toFixed(1)}%"></div>
            </div>
            <div class="species-dist-count">${count}</div>
        </div>
    `).join('');
}

function initMigration() {
    document.getElementById('refreshTimeline').addEventListener('click', loadMigrationTimeline);
    document.getElementById('seasonFilter').addEventListener('change', loadMigrationTimeline);
}

async function loadMigrationTimeline() {
    const container = document.getElementById('timelineContainer');
    const seasonFilter = document.getElementById('seasonFilter').value;
    
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
    
    try {
        const response = await fetch(`${API_BASE}/migration-timeline`);
        const data = await response.json();
        
        let timeline = data.timeline || [];
        
        if (seasonFilter !== 'all') {
            timeline = timeline.filter(item => {
                const month = new Date(item.date).getMonth() + 1;
                return getSeasonFromMonth(month) === seasonFilter;
            });
        }
        
        if (timeline.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888;">暂无迁徙数据</p>';
            return;
        }
        
        container.innerHTML = timeline.map(item => `
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-date">${item.date}</div>
                <div class="timeline-content">
                    <div class="hotspot-level ${item.hotspot_level}" style="float: right; margin-top: -5px;">
                        ${item.hotspot_level.toUpperCase()}
                    </div>
                    <div class="timeline-stats">
                        <span>📹 ${item.recording_count} 录音</span>
                        <span>🐦 ${item.unique_species} 物种</span>
                        <span>📊 ${Math.round(item.hotspot_score * 100)}% 热点</span>
                    </div>
                    ${item.species_list.length > 0 ? `
                    <div class="timeline-species">
                        ${item.species_list.map(s => `<span class="timeline-species-tag">${s}</span>`).join('')}
                    </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        container.innerHTML = '<p style="text-align: center; color: #f44336;">加载失败</p>';
    }
}

function getSeasonFromMonth(month) {
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'fall';
    return 'winter';
}

function initExport() {
    document.getElementById('exportEbirdCsv').addEventListener('click', () => exportEbird('csv'));
    document.getElementById('exportEbirdXml').addEventListener('click', () => exportEbird('xml'));
}

function exportEbird(format) {
    if (!currentRecordingId) {
        alert('请先进行识别');
        return;
    }
    
    const location = prompt('请输入位置名称:', 'Unknown Location');
    if (location === null) return;
    
    const url = `${API_BASE}/export/ebird/${currentRecordingId}?format=${format}&location=${encodeURIComponent(location)}`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `ebird_checklist_${currentRecordingId}.${format}`;
    a.click();
}

