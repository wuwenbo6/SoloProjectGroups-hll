const API_BASE = '/api/v1';

let selectedFile = null;

document.addEventListener('DOMContentLoaded', () => {
    initUploadArea();
    loadHistory();
    initEventListeners();
});

function initEventListeners() {
    document.getElementById('recognizeBtn').addEventListener('click', recognizePlate);
    document.getElementById('refreshHistory').addEventListener('click', loadHistory);
    document.getElementById('showStats').addEventListener('click', showStats);
    document.getElementById('closeStats').addEventListener('click', closeStatsModal);
    
    document.getElementById('statsModal').addEventListener('click', (e) => {
        if (e.target.id === 'statsModal') {
            closeStatsModal();
        }
    });
}

function initUploadArea() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            handleFileSelect(files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
}

function handleFileSelect(file) {
    selectedFile = file;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const previewImg = document.createElement('img');
        previewImg.src = e.target.result;
        previewImg.style.maxWidth = '200px';
        previewImg.style.borderRadius = '10px';
        previewImg.style.marginTop = '10px';
        
        const uploadArea = document.getElementById('uploadArea');
        const existingImg = uploadArea.querySelector('img');
        if (existingImg) existingImg.remove();
        
        uploadArea.querySelector('.upload-icon').textContent = '✅';
        uploadArea.querySelector('.upload-text').textContent = `已选择: ${file.name}`;
        uploadArea.querySelector('.upload-hint').textContent = `大小: ${formatFileSize(file.size)}`;
        uploadArea.appendChild(previewImg);
        
        document.getElementById('recognizeBtn').disabled = false;
    };
    reader.readAsDataURL(file);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function recognizePlate() {
    if (!selectedFile) return;
    
    const enhance = document.getElementById('enhanceCheckbox').checked;
    
    showLoading(true);
    
    try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('enhance', enhance);
        
        const response = await fetch(`${API_BASE}/recognize?enhance=${enhance}`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            displayResults(result);
            loadHistory();
        } else {
            alert('识别失败: ' + (result.detail || '未知错误'));
        }
    } catch (error) {
        console.error('Recognition error:', error);
        alert('识别失败，请检查网络连接');
    } finally {
        showLoading(false);
    }
}

function displayResults(result) {
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.style.display = 'block';
    
    document.getElementById('plateNumber').textContent = result.plate_number || '未识别';
    document.getElementById('plateColor').innerHTML = getColorBadge(result.plate_color);
    document.getElementById('confidence').textContent = result.confidence 
        ? (result.confidence * 100).toFixed(2) + '%' 
        : '-';
    document.getElementById('processingTime').textContent = result.processing_time 
        ? result.processing_time.toFixed(3) + 's' 
        : '-';
    
    document.getElementById('originalImage').src = result.original_image;
    document.getElementById('enhancedImage').src = result.enhanced_image || result.original_image;
    
    if (result.bbox && result.bbox.length === 4) {
        drawDetectionBox(result.original_image, result.bbox);
    }
    
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getColorBadge(color) {
    const colorMap = {
        'blue': { class: 'badge-blue', text: '蓝牌' },
        'yellow': { class: 'badge-yellow', text: '黄牌' },
        'green': { class: 'badge-green', text: '绿牌' }
    };
    
    const badge = colorMap[color] || { class: 'badge-unknown', text: '未知' };
    return `<span class="badge ${badge.class}">${badge.text}</span>`;
}

function drawDetectionBox(imageSrc, bbox) {
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');
    const detectionBox = document.getElementById('detectionBox');
    
    const img = new Image();
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        
        ctx.drawImage(img, 0, 0);
        
        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = 3;
        ctx.strokeRect(bbox[0], bbox[1], bbox[2] - bbox[0], bbox[3] - bbox[1]);
        
        detectionBox.style.display = 'block';
    };
    img.src = imageSrc;
}

async function loadHistory() {
    try {
        const response = await fetch(`${API_BASE}/logs?limit=50`);
        const logs = await response.json();
        
        const tbody = document.getElementById('historyBody');
        
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="no-data">暂无数据</td></tr>';
            return;
        }
        
        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${log.id}</td>
                <td title="${log.filename}">${truncateText(log.filename, 20)}</td>
                <td>${log.plate_number || '-'}</td>
                <td>${getColorBadge(log.plate_color)}</td>
                <td>${(log.confidence * 100).toFixed(1)}%</td>
                <td>${formatDate(log.created_at)}</td>
                <td>
                    <button class="btn-delete" onclick="deleteLog(${log.id})">删除</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Load history error:', error);
    }
}

async function deleteLog(logId) {
    if (!confirm('确定要删除这条记录吗？')) return;
    
    try {
        const response = await fetch(`${API_BASE}/logs/${logId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadHistory();
        } else {
            alert('删除失败');
        }
    } catch (error) {
        console.error('Delete log error:', error);
        alert('删除失败');
    }
}

async function showStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const stats = await response.json();
        
        const statsBody = document.getElementById('statsBody');
        statsBody.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-item-label">总识别次数</div>
                    <div class="stat-item-value">${stats.total_records}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-label">成功识别</div>
                    <div class="stat-item-value">${stats.successful_recognitions}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-label">成功率</div>
                    <div class="stat-item-value">${stats.success_rate.toFixed(1)}%</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-label">平均置信度</div>
                    <div class="stat-item-value">${(stats.average_confidence * 100).toFixed(1)}%</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-label">平均处理时间</div>
                    <div class="stat-item-value">${stats.average_processing_time.toFixed(3)}s</div>
                </div>
            </div>
            
            <div class="color-stats">
                <h4>车牌颜色分布</h4>
                <div class="color-bar">
                    ${Object.entries(stats.color_distribution || {}).map(([color, count]) => {
                        const colors = { blue: '#4a90d9', yellow: '#f5a623', green: '#4cd964', unknown: '#8e8e93' };
                        const total = Object.values(stats.color_distribution).reduce((a, b) => a + b, 0);
                        const width = (count / total * 100);
                        return `<div class="color-bar-item" style="background: ${colors[color] || '#8e8e93'}; width: ${width}%">${count}</div>`;
                    }).join('')}
                </div>
            </div>
        `;
        
        document.getElementById('statsModal').style.display = 'flex';
    } catch (error) {
        console.error('Load stats error:', error);
        alert('加载统计信息失败');
    }
}

function closeStatsModal() {
    document.getElementById('statsModal').style.display = 'none';
}

function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}
