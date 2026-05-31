const API_BASE = 'http://localhost:5000/api';

const PILE_COLORS = [
    0xff4444, 0x44ff44, 0x4444ff,
    0xffff44, 0xff44ff, 0x44ffff,
    0xff8800, 0x8800ff, 0x00ff88
];

let scene, camera, renderer, controls;
let groundPoints = null;
let pilePointClouds = [];
let axesHelper = null;
let currentMeasurement = null;
let realtimeInterval = null;
let frameCount = 0;
let lastVolume = 0;
let lastFlowRate = 0;
let currentAlertTab = 'unread';

function initViewer() {
    const container = document.getElementById('viewer');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    
    camera = new THREE.PerspectiveCamera(
        60,
        container.clientWidth / container.clientHeight,
        0.01,
        1000
    );
    camera.position.set(3, 3, 3);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);
    
    axesHelper = new THREE.AxesHelper(2);
    scene.add(axesHelper);
    
    const gridHelper = new THREE.GridHelper(5, 50, 0x444444, 0x333333);
    scene.add(gridHelper);
    
    window.addEventListener('resize', onWindowResize);
    animate();
}

function onWindowResize() {
    const container = document.getElementById('viewer');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function createPointCloud(points, color, size = 0.02) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);
    
    for (let i = 0; i < points.length; i++) {
        positions[i * 3] = points[i][0];
        positions[i * 3 + 1] = points[i][1];
        positions[i * 3 + 2] = points[i][2];
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: color,
        size: size,
        sizeAttenuation: true
    });
    
    return new THREE.Points(geometry, material);
}

function clearPointClouds() {
    if (groundPoints) {
        scene.remove(groundPoints);
        groundPoints.geometry.dispose();
        groundPoints.material.dispose();
        groundPoints = null;
    }
    
    pilePointClouds.forEach(pc => {
        scene.remove(pc);
        pc.geometry.dispose();
        pc.material.dispose();
    });
    pilePointClouds = [];
}

function displayResults(result) {
    clearPointClouds();
    
    currentMeasurement = result;
    
    const volumeChange = result.total_volume - lastVolume;
    const changePercent = lastVolume > 0 ? (volumeChange / lastVolume * 100) : 0;
    
    document.getElementById('totalVolume').textContent = result.total_volume.toFixed(4);
    document.getElementById('totalWeight').textContent = 
        (result.total_weight || result.total_volume * 1.6).toFixed(2);
    document.getElementById('pileCount').textContent = result.total_piles;
    
    const changeEl = document.getElementById('volumeChange');
    if (Math.abs(changePercent) < 2) {
        changeEl.textContent = '稳定';
        changeEl.className = 'stats-change stable';
    } else if (volumeChange > 0) {
        changeEl.textContent = `↑${changePercent.toFixed(1)}%`;
        changeEl.className = 'stats-change up';
    } else {
        changeEl.textContent = `↓${Math.abs(changePercent).toFixed(1)}%`;
        changeEl.className = 'stats-change down';
    }
    
    lastVolume = result.total_volume;
    
    const flowRate = result.flow_rate || 0;
    document.getElementById('flowRate').textContent = flowRate.toFixed(2);
    
    const flowEl = document.getElementById('flowTrend');
    if (flowRate > lastFlowRate * 1.1) {
        flowEl.textContent = '↑上升';
        flowEl.className = 'stats-change up';
    } else if (flowRate < lastFlowRate * 0.9) {
        flowEl.textContent = '↓下降';
        flowEl.className = 'stats-change down';
    } else {
        flowEl.textContent = '稳定';
        flowEl.className = 'stats-change stable';
    }
    lastFlowRate = flowRate;
    
    if (result.ground_points && result.ground_points.length > 0) {
        groundPoints = createPointCloud(result.ground_points, 0x888888, 0.015);
        scene.add(groundPoints);
    }
    
    renderPiles(result);
    
    if (result.piles && result.piles.length > 0) {
        const allPoints = result.piles.flatMap(p => p.points || []);
        if (allPoints.length > 0) {
            fitViewToPoints(allPoints);
        }
    }
    
    if (!realtimeInterval) {
        showStatus('处理完成！', 'success');
    }
    
    loadStatistics();
    loadAlerts();
}

function renderPiles(result) {
    if (!result) result = currentMeasurement;
    if (!result) return;
    
    pilePointClouds.forEach(pc => {
        scene.remove(pc);
        pc.geometry.dispose();
        pc.material.dispose();
    });
    pilePointClouds = [];
    
    const showRaw = document.getElementById('showRawVolume').checked;
    
    const pileList = document.getElementById('pileList');
    pileList.innerHTML = '';
    
    result.piles.forEach((pile, index) => {
        const trackId = pile.track_id !== undefined ? pile.track_id : pile.id;
        const color = PILE_COLORS[trackId % PILE_COLORS.length];
        
        if (pile.points && pile.points.length > 0) {
            const pc = createPointCloud(pile.points, color, 0.02);
            pilePointClouds.push(pc);
            scene.add(pc);
        }
        
        const rawVolumeHtml = showRaw && pile.raw_volume ? 
            `<span class="pile-raw-volume">(${pile.raw_volume.toFixed(4)})</span>` : '';
        
        const pileItem = document.createElement('div');
        pileItem.className = 'pile-item';
        pileItem.style.borderLeftColor = '#' + color.toString(16).padStart(6, '0');
        pileItem.innerHTML = `
            <div class="pile-header">
                <span class="pile-name">
                    <span class="pile-color" style="background-color: #${color.toString(16).padStart(6, '0')}"></span>
                    料堆 #${trackId + 1}
                </span>
                <span class="pile-volume">${pile.volume.toFixed(4)} m³</span>
            </div>
            ${rawVolumeHtml}
            <div class="pile-coords">
                质心: (${pile.centroid_x.toFixed(3)}, ${pile.centroid_y.toFixed(3)}, ${pile.centroid_z.toFixed(3)})
            </div>
            <div class="pile-stats">
                <span class="pile-stat">点数: ${pile.points ? pile.points.length : 0}</span>
                <span class="pile-stat">重量: ${(pile.volume * (result.material_density || 1.6)).toFixed(2)}吨</span>
                ${pile.history_count ? `<span class="pile-stat">跟踪: ${pile.history_count}帧</span>` : ''}
            </div>
        `;
        pileList.appendChild(pileItem);
    });
}

function fitViewToPoints(points) {
    if (!points || points.length === 0) return;
    
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    points.forEach(p => {
        minX = Math.min(minX, p[0]);
        minY = Math.min(minY, p[1]);
        minZ = Math.min(minZ, p[2]);
        maxX = Math.max(maxX, p[0]);
        maxY = Math.max(maxY, p[1]);
        maxZ = Math.max(maxZ, p[2]);
    });
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    
    camera.position.set(centerX + size * 1.5, centerY + size, centerZ + size * 1.5);
    controls.target.set(centerX, centerY, centerZ);
    controls.update();
}

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status ' + type;
    if (type !== 'info') {
        setTimeout(() => {
            status.className = 'status';
        }, 3000);
    }
}

function setLoading(isLoading) {
    const loading = document.getElementById('loading');
    loading.className = isLoading ? 'loading active' : 'loading';
}

async function generateTestData() {
    if (!realtimeInterval) {
        setLoading(true);
    }
    try {
        const response = await fetch(`${API_BASE}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        displayResults(result);
        
        if (!realtimeInterval) {
            loadHistory();
        }
    } catch (error) {
        showStatus('错误: ' + error.message, 'error');
    } finally {
        if (!realtimeInterval) {
            setLoading(false);
        }
    }
}

function startRealtime() {
    if (realtimeInterval) return;
    
    frameCount = 0;
    document.getElementById('pulseIndicator').style.display = 'inline-block';
    document.getElementById('realtimeStatus').textContent = '实时处理中...';
    showStatus('开始实时处理...', 'info');
    
    realtimeInterval = setInterval(async () => {
        frameCount++;
        document.getElementById('frameCounter').textContent = `帧 #${frameCount}`;
        
        try {
            const response = await fetch(`${API_BASE}/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();
            
            if (!result.error) {
                displayResults(result);
            }
        } catch (error) {
            console.error('Realtime error:', error);
        }
    }, 200);
}

function stopRealtime() {
    if (realtimeInterval) {
        clearInterval(realtimeInterval);
        realtimeInterval = null;
    }
    
    document.getElementById('pulseIndicator').style.display = 'none';
    document.getElementById('realtimeStatus').textContent = '已停止';
    showStatus(`处理完成，共 ${frameCount} 帧`, 'success');
    loadHistory();
}

async function resetTracking() {
    try {
        await fetch(`${API_BASE}/reset-tracking`, { method: 'POST' });
        frameCount = 0;
        lastVolume = 0;
        lastFlowRate = 0;
        document.getElementById('frameCounter').textContent = '';
        document.getElementById('flowRate').textContent = '0.00';
        showStatus('跟踪已重置', 'success');
        loadStatistics();
    } catch (error) {
        showStatus('重置失败: ' + error.message, 'error');
    }
}

async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    stopRealtime();
    setLoading(true);
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${API_BASE}/process`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        displayResults(result);
        loadHistory();
    } catch (error) {
        showStatus('错误: ' + error.message, 'error');
    } finally {
        setLoading(false);
        fileInput.value = '';
    }
}

async function updateConfig() {
    const config = {
        processor: {
            enable_smoothing: document.getElementById('enableSmoothing').checked,
            enable_tracking: document.getElementById('enableTracking').checked,
            smoothing_method: document.getElementById('smoothingMethod').value,
            smoothing_window: parseInt(document.getElementById('smoothingWindow').value),
            ground_distance_threshold: parseFloat(document.getElementById('groundThreshold').value),
            max_inclination_angle: parseInt(document.getElementById('maxAngle').value),
            cluster_eps: parseFloat(document.getElementById('clusterEps').value)
        },
        system: {
            material_density: parseFloat(document.getElementById('materialDensity').value),
            volume_change_threshold: parseFloat(document.getElementById('volumeAlertThreshold').value)
        }
    };
    
    const smoothingIndicator = document.getElementById('smoothingIndicator');
    if (config.processor.enable_smoothing) {
        smoothingIndicator.textContent = `平滑: 开启 (${config.processor.smoothing_method})`;
        smoothingIndicator.className = 'smoothing-indicator enabled';
    } else {
        smoothingIndicator.textContent = '平滑: 关闭';
        smoothingIndicator.className = 'smoothing-indicator disabled';
    }
    
    const trackingStatus = document.getElementById('trackingStatus');
    if (config.processor.enable_tracking) {
        trackingStatus.innerHTML = '<span class="status-dot"></span>跟踪: 开启';
        trackingStatus.className = 'status-badge active';
    } else {
        trackingStatus.innerHTML = '<span class="status-dot"></span>跟踪: 关闭';
        trackingStatus.className = 'status-badge inactive';
    }
    
    try {
        await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
    } catch (error) {
        console.error('Config update failed:', error);
    }
}

async function loadStatistics() {
    try {
        const response = await fetch(`${API_BASE}/statistics/summary?days=7`);
        const stats = await response.json();
        
        document.getElementById('weekVolume').textContent = stats.total_weight.toFixed(1);
        document.getElementById('peakFlow').textContent = stats.peak_flow_rate.toFixed(1);
        
        const today = new Date().toISOString().split('T')[0];
        const flowResponse = await fetch(`${API_BASE}/flow-stats?start_date=${today}&end_date=${today}`);
        const flowStats = await flowResponse.json();
        
        if (flowStats.length > 0) {
            const todayVolume = flowStats.reduce((sum, s) => sum + s.total_volume, 0);
            const todayWeight = flowStats.reduce((sum, s) => sum + s.total_weight, 0);
            document.getElementById('todayVolume').textContent = todayVolume.toFixed(2);
            document.getElementById('todayWeight').textContent = todayWeight.toFixed(1);
        }
    } catch (error) {
        console.error('Load statistics failed:', error);
    }
}

async function loadAlerts() {
    try {
        const response = await fetch(`${API_BASE}/alerts?limit=50`);
        const alerts = await response.json();
        
        const unacknowledged = alerts.filter(a => !a.acknowledged);
        const alertCount = document.getElementById('alertCount');
        
        if (unacknowledged.length > 0) {
            alertCount.style.display = 'inline-block';
            alertCount.textContent = unacknowledged.length;
            alertCount.className = unacknowledged.some(a => a.severity === 'critical') 
                ? 'alert-count' : 'alert-count warning';
            
            const alertStatus = document.getElementById('alertStatus');
            if (unacknowledged.some(a => a.severity === 'critical')) {
                alertStatus.innerHTML = '<span class="status-dot"></span>报警: 严重';
                alertStatus.className = 'status-badge critical';
            } else {
                alertStatus.innerHTML = '<span class="status-dot"></span>报警: 警告';
                alertStatus.className = 'status-badge warning';
            }
        } else {
            alertCount.style.display = 'none';
            const alertStatus = document.getElementById('alertStatus');
            alertStatus.innerHTML = '<span class="status-dot"></span>报警: 正常';
            alertStatus.className = 'status-badge inactive';
        }
        
        renderAlerts(alerts);
    } catch (error) {
        console.error('Load alerts failed:', error);
    }
}

function renderAlerts(alerts) {
    const alertList = document.getElementById('alertList');
    
    let filteredAlerts = alerts;
    if (currentAlertTab === 'unread') {
        filteredAlerts = alerts.filter(a => !a.acknowledged);
    }
    
    if (filteredAlerts.length === 0) {
        alertList.innerHTML = `
            <div style="color: rgba(255,255,255,0.5); text-align: center; padding: 20px; font-size: 12px;">
                暂无报警
            </div>
        `;
        return;
    }
    
    alertList.innerHTML = '';
    filteredAlerts.slice(0, 20).forEach(alert => {
        const time = new Date(alert.timestamp).toLocaleTimeString('zh-CN');
        const item = document.createElement('div');
        item.className = `alert-item ${alert.severity} ${alert.acknowledged ? 'acknowledged' : ''}`;
        item.onclick = () => acknowledgeAlert(alert.id);
        item.innerHTML = `
            <div class="alert-header">
                <span class="alert-type">${getAlertTypeName(alert.alert_type)}</span>
                <span class="alert-time">${time}</span>
            </div>
            <div class="alert-message">${alert.message}</div>
        `;
        alertList.appendChild(item);
    });
}

function getAlertTypeName(type) {
    const names = {
        'volume_change': '体积变化',
        'flow_rate': '流量异常',
        'pile_count': '数量变化'
    };
    return names[type] || type;
}

function switchAlertTab(tab) {
    currentAlertTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.className = btn.dataset.tab === tab ? 'tab-btn active' : 'tab-btn';
    });
    loadAlerts();
}

async function acknowledgeAlert(alertId) {
    try {
        await fetch(`${API_BASE}/alerts/${alertId}/acknowledge`, { method: 'POST' });
        loadAlerts();
    } catch (error) {
        console.error('Acknowledge alert failed:', error);
    }
}

async function acknowledgeAllAlerts() {
    try {
        await fetch(`${API_BASE}/alerts/acknowledge-all`, { method: 'POST' });
        loadAlerts();
        showStatus('已确认所有报警', 'success');
    } catch (error) {
        showStatus('确认失败: ' + error.message, 'error');
    }
}

async function exportReport() {
    try {
        const date = new Date().toISOString().split('T')[0];
        const response = await fetch(`${API_BASE}/reports/daily/export?date=${date}&format=csv`);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `report_${date}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            showStatus('日报导出成功', 'success');
        } else {
            throw new Error('导出失败');
        }
    } catch (error) {
        showStatus('导出失败: ' + error.message, 'error');
    }
}

async function loadHistory() {
    try {
        const response = await fetch(`${API_BASE}/measurements?limit=15`);
        const measurements = await response.json();
        
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';
        
        if (measurements.length === 0) {
            historyList.innerHTML = `
                <div style="color: rgba(255,255,255,0.5); text-align: center; padding: 15px; font-size: 12px;">
                    暂无历史记录
                </div>
            `;
            return;
        }
        
        measurements.forEach(m => {
            const time = new Date(m.timestamp).toLocaleString('zh-CN');
            const item = document.createElement('div');
            item.className = 'history-item';
            item.onclick = () => loadMeasurement(m.id);
            item.innerHTML = `
                <div class="history-time">${time}</div>
                <div class="history-stats">
                    <span>📦 ${m.pile_count} 个料堆</span>
                    <span>📏 ${m.total_volume.toFixed(3)} m³</span>
                </div>
            `;
            historyList.appendChild(item);
        });
    } catch (error) {
        console.error('加载历史失败:', error);
    }
}

async function loadMeasurement(id) {
    stopRealtime();
    setLoading(true);
    try {
        const measRes = await fetch(`${API_BASE}/measurements/${id}`);
        const measurement = await measRes.json();
        
        const result = {
            piles: measurement.pile_volumes.map((p, i) => ({
                ...p,
                points: []
            })),
            total_piles: measurement.pile_count,
            total_volume: measurement.total_volume,
            total_weight: measurement.total_weight,
            flow_rate: measurement.flow_rate,
            ground_points: []
        };
        
        displayResults(result);
    } catch (error) {
        showStatus('加载失败: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
}

function toggleGround() {
    const show = document.getElementById('showGround').checked;
    if (groundPoints) {
        groundPoints.visible = show;
    }
}

function toggleAxes() {
    const show = document.getElementById('showAxes').checked;
    if (axesHelper) {
        axesHelper.visible = show;
    }
}

function toggleAutoRotate() {
    controls.autoRotate = document.getElementById('autoRotate').checked;
    controls.autoRotateSpeed = 1.0;
}

function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    const title = section.previousElementSibling;
    
    section.classList.toggle('collapsed');
    title.classList.toggle('collapsed');
}

document.addEventListener('DOMContentLoaded', () => {
    initViewer();
    loadHistory();
    loadAlerts();
    loadStatistics();
    updateConfig();
    
    setInterval(() => {
        if (realtimeInterval) {
            loadAlerts();
        }
    }, 5000);
});
