const API_BASE = '/api/v1/video';

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadStreams();
    loadWatchlist();
    loadAlerts();
    loadSpeedConfig();
    initEventListeners();
});

function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');
        });
    });
}

function initEventListeners() {
    document.getElementById('addStreamBtn').addEventListener('click', () => {
        openModal('streamModal');
    });
    
    document.getElementById('addWatchlistBtn').addEventListener('click', () => {
        openModal('watchlistModal');
    });
    
    document.getElementById('refreshAlerts').addEventListener('click', loadAlerts);
    
    document.getElementById('saveConfig').addEventListener('click', saveSpeedConfig);
    
    document.getElementById('streamForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await addStream();
    });
    
    document.getElementById('watchlistForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await addWatchlistItem();
    });
    
    document.querySelectorAll('.close-btn, .close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(btn.closest('.modal').id);
        });
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
}

async function loadStreams() {
    try {
        const [streamsRes, statusRes] = await Promise.all([
            fetch(`${API_BASE}/streams`),
            fetch(`${API_BASE}/status`)
        ]);
        
        const streams = await streamsRes.json();
        const status = await statusRes.json();
        
        const grid = document.getElementById('streamsGrid');
        
        if (streams.length === 0) {
            grid.innerHTML = '<div class="no-data">暂无视频流，点击上方按钮添加</div>';
            return;
        }
        
        grid.innerHTML = streams.map(stream => {
            const streamStatus = status.streams[stream.stream_id] || { is_running: false, active_tracks: 0, total_alerts: 0, frame_count: 0 };
            
            return `
                <div class="stream-card">
                    <div class="stream-name">${stream.name}</div>
                    <div class="stream-info">ID: ${stream.stream_id}</div>
                    <div class="stream-info">${stream.rtsp_url}</div>
                    <div class="stream-status">
                        <div class="status-indicator ${streamStatus.is_running ? 'active' : 'inactive'}"></div>
                        <span>${streamStatus.is_running ? '运行中' : '已停止'}</span>
                    </div>
                    <div class="stream-stats">
                        <div class="stream-stat">
                            <div class="stream-stat-label">活动车辆</div>
                            <div class="stream-stat-value">${streamStatus.active_tracks}</div>
                        </div>
                        <div class="stream-stat">
                            <div class="stream-stat-label">报警次数</div>
                            <div class="stream-stat-value">${streamStatus.total_alerts}</div>
                        </div>
                        <div class="stream-stat">
                            <div class="stream-stat-label">限速</div>
                            <div class="stream-stat-value">${stream.speed_limit} km/h</div>
                        </div>
                        <div class="stream-stat">
                            <div class="stream-stat-label">处理帧</div>
                            <div class="stream-stat-value">${streamStatus.frame_count}</div>
                        </div>
                    </div>
                    <div class="stream-actions">
                        <button class="btn-primary" onclick="toggleStream('${stream.stream_id}', ${!streamStatus.is_running})">
                            ${streamStatus.is_running ? '停止' : '启动'}
                        </button>
                        <button class="btn-danger" onclick="deleteStream('${stream.stream_id}')">删除</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Load streams error:', error);
        showToast('加载视频流失败', 'error');
    }
}

async function addStream() {
    const streamId = document.getElementById('streamId').value;
    const name = document.getElementById('streamName').value;
    const rtspUrl = document.getElementById('rtspUrl').value;
    const speedLimit = parseInt(document.getElementById('speedLimit').value);
    
    try {
        const response = await fetch(`${API_BASE}/streams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stream_id: streamId, name, rtsp_url: rtspUrl, speed_limit: speedLimit })
        });
        
        if (response.ok) {
            closeModal('streamModal');
            loadStreams();
            showToast('视频流添加成功', 'success');
            document.getElementById('streamForm').reset();
        } else {
            const result = await response.json();
            showToast(result.detail || '添加失败', 'error');
        }
    } catch (error) {
        console.error('Add stream error:', error);
        showToast('添加失败', 'error');
    }
}

async function toggleStream(streamId, shouldStart) {
    try {
        const response = await fetch(`${API_BASE}/streams/${streamId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: shouldStart })
        });
        
        if (response.ok) {
            loadStreams();
            showToast(shouldStart ? '视频流已启动' : '视频流已停止', 'success');
        } else {
            showToast('操作失败', 'error');
        }
    } catch (error) {
        console.error('Toggle stream error:', error);
        showToast('操作失败', 'error');
    }
}

async function deleteStream(streamId) {
    if (!confirm('确定要删除这个视频流吗？')) return;
    
    try {
        const response = await fetch(`${API_BASE}/streams/${streamId}`, { method: 'DELETE' });
        
        if (response.ok) {
            loadStreams();
            showToast('视频流已删除', 'success');
        } else {
            showToast('删除失败', 'error');
        }
    } catch (error) {
        console.error('Delete stream error:', error);
        showToast('删除失败', 'error');
    }
}

async function loadWatchlist() {
    try {
        const response = await fetch(`${API_BASE}/watchlist`);
        const watchlist = await response.json();
        
        const tbody = document.getElementById('watchlistBody');
        
        if (watchlist.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">暂无布控车辆</td></tr>';
            return;
        }
        
        tbody.innerHTML = watchlist.map(item => `
            <tr>
                <td><strong>${item.plate_number}</strong></td>
                <td>${item.description || '-'}</td>
                <td>${getAlertTypeLabel(item.alert_type)}</td>
                <td><span class="badge ${item.is_active ? 'badge-active' : 'badge-inactive'}">${item.is_active ? '启用' : '禁用'}</span></td>
                <td>${formatDate(item.created_at)}</td>
                <td>
                    <button class="btn-secondary" onclick="toggleWatchlistItem(${item.id}, ${!item.is_active})">
                        ${item.is_active ? '禁用' : '启用'}
                    </button>
                    <button class="btn-danger" onclick="deleteWatchlistItem(${item.id})">删除</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Load watchlist error:', error);
    }
}

async function addWatchlistItem() {
    const plateNumber = document.getElementById('plateNumber').value;
    const description = document.getElementById('plateDescription').value;
    const alertType = document.getElementById('alertType').value;
    
    try {
        const response = await fetch(`${API_BASE}/watchlist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plate_number: plateNumber, description, alert_type: alertType })
        });
        
        if (response.ok) {
            closeModal('watchlistModal');
            loadWatchlist();
            showToast('车辆添加成功', 'success');
            document.getElementById('watchlistForm').reset();
        } else {
            const result = await response.json();
            showToast(result.detail || '添加失败', 'error');
        }
    } catch (error) {
        console.error('Add watchlist error:', error);
        showToast('添加失败', 'error');
    }
}

async function toggleWatchlistItem(itemId, isActive) {
    try {
        const response = await fetch(`${API_BASE}/watchlist/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: isActive })
        });
        
        if (response.ok) {
            loadWatchlist();
            showToast('状态已更新', 'success');
        }
    } catch (error) {
        console.error('Toggle watchlist error:', error);
    }
}

async function deleteWatchlistItem(itemId) {
    if (!confirm('确定要从布控名单中移除吗？')) return;
    
    try {
        const response = await fetch(`${API_BASE}/watchlist/${itemId}`, { method: 'DELETE' });
        
        if (response.ok) {
            loadWatchlist();
            showToast('已移除', 'success');
        }
    } catch (error) {
        console.error('Delete watchlist error:', error);
    }
}

async function loadAlerts() {
    try {
        const response = await fetch(`${API_BASE}/alerts`);
        const alerts = await response.json();
        
        const tbody = document.getElementById('alertsBody');
        
        if (alerts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="no-data">暂无报警记录</td></tr>';
            return;
        }
        
        tbody.innerHTML = alerts.map(alert => `
            <tr>
                <td><strong>${alert.plate_number}</strong></td>
                <td><span class="badge badge-alert">${getAlertTypeLabel(alert.alert_type)}</span></td>
                <td>${alert.speed.toFixed(1)} km/h</td>
                <td>${(alert.confidence * 100).toFixed(1)}%</td>
                <td>
                    <span class="badge ${alert.is_acknowledged ? 'badge-acknowledged' : 'badge-alert'}">
                        ${alert.is_acknowledged ? '已确认' : '待处理'}
                    </span>
                </td>
                <td>${formatDate(alert.created_at)}</td>
                <td>
                    ${!alert.is_acknowledged ? `
                        <button class="btn-success" onclick="acknowledgeAlert(${alert.id})">确认</button>
                    ` : '-'}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Load alerts error:', error);
    }
}

async function acknowledgeAlert(alertId) {
    try {
        const response = await fetch(`${API_BASE}/alerts/${alertId}/acknowledge`, { method: 'POST' });
        
        if (response.ok) {
            loadAlerts();
            showToast('已确认报警', 'success');
        }
    } catch (error) {
        console.error('Acknowledge alert error:', error);
    }
}

async function loadSpeedConfig() {
    try {
        const response = await fetch(`${API_BASE}/speed-config`);
        const configs = await response.json();
        
        if (configs.length > 0) {
            const config = configs[0];
            document.getElementById('pixelsPerMeter').value = config.pixels_per_meter;
            document.getElementById('calibrationDistance').value = config.calibration_distance;
        }
    } catch (error) {
        console.error('Load speed config error:', error);
    }
}

async function saveSpeedConfig() {
    const pixelsPerMeter = parseFloat(document.getElementById('pixelsPerMeter').value);
    const calibrationDistance = parseFloat(document.getElementById('calibrationDistance').value);
    
    try {
        const getRes = await fetch(`${API_BASE}/speed-config`);
        const configs = await getRes.json();
        
        let response;
        if (configs.length > 0) {
            response = await fetch(`${API_BASE}/speed-config/${configs[0].id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pixels_per_meter: pixelsPerMeter, calibration_distance: calibrationDistance })
            });
        } else {
            response = await fetch(`${API_BASE}/speed-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pixels_per_meter: pixelsPerMeter, calibration_distance: calibrationDistance })
            });
        }
        
        if (response.ok) {
            showToast('配置已保存', 'success');
        } else {
            showToast('保存失败', 'error');
        }
    } catch (error) {
        console.error('Save config error:', error);
        showToast('保存失败', 'error');
    }
}

function getAlertTypeLabel(type) {
    const labels = {
        'watchlist': '布控报警',
        'speeding': '超速报警',
        'stolen': '被盗车辆',
        'suspicious': '可疑车辆',
        'other': '其他'
    };
    return labels[type] || type;
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

function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

setInterval(() => {
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.dataset.tab === 'streams') {
        loadStreams();
    }
}, 5000);
