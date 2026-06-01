package web

const indexHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Modbus Slave Simulator</title>
    <link rel="stylesheet" href="/static/style.css">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
</head>
<body>
    <header>
        <h1>🔐 Modbus Slave Simulator</h1>
        <div class="status-bar">
            <div class="status-item">
                <span class="status-label">PLC 状态:</span>
                <span id="slave-status" class="status-value">加载中...</span>
            </div>
            <div class="status-item">
                <span class="status-label">请求总数:</span>
                <span id="total-requests" class="status-value">0</span>
            </div>
            <div class="status-item">
                <span class="status-label">陷阱触发:</span>
                <span id="traps-triggered" class="status-value">0</span>
            </div>
        </div>
    </header>

    <div class="container">
        <div class="tabs">
            <button class="tab-btn active" data-tab="logs">📋 访问日志</button>
            <button class="tab-btn" data-tab="map">🗺️ 攻击地图</button>
            <button class="tab-btn" data-tab="traps">🎯 陷阱配置</button>
        </div>

        <div id="logs" class="tab-content active">
            <div class="panel">
                <div class="panel-header">
                    <h2>访问请求日志</h2>
                    <button class="btn btn-danger" id="clear-logs">清空日志</button>
                </div>
                <div class="table-container">
                    <table class="logs-table">
                        <thead>
                            <tr>
                                <th>时间</th>
                                <th>源IP</th>
                                <th>从站</th>
                                <th>功能码</th>
                                <th>功能名称</th>
                                <th>状态</th>
                            </tr>
                        </thead>
                        <tbody id="logs-body">
                            <tr><td colspan="6" class="loading">加载中...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <div id="map" class="tab-content">
            <div class="panel">
                <div class="panel-header">
                    <h2>攻击来源地图</h2>
                </div>
                <div id="attack-map"></div>
                <div class="map-legend">
                    <div class="legend-item"><span class="dot dot-normal"></span> 正常请求</div>
                    <div class="legend-item"><span class="dot dot-trap"></span> 触发陷阱</div>
                </div>
            </div>
        </div>

        <div id="traps" class="tab-content">
            <div class="panel">
                <div class="panel-header">
                    <h2>自定义陷阱配置</h2>
                    <button class="btn btn-primary" id="add-trap-btn">+ 添加陷阱</button>
                </div>
                <div id="trap-form" class="trap-form hidden">
                    <h3>新建陷阱</h3>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>名称</label>
                            <input type="text" id="trap-name" placeholder="例如：拒绝非法读取">
                        </div>
                        <div class="form-group">
                            <label>目标从站 (0=全部)</label>
                            <input type="number" id="trap-slave" min="0" max="255" value="0">
                        </div>
                        <div class="form-group">
                            <label>功能码 (0=全部)</label>
                            <input type="number" id="trap-func" min="0" max="255" value="0">
                        </div>
                        <div class="form-group">
                            <label>陷阱类型</label>
                            <select id="trap-type">
                                <option value="exception">返回异常响应</option>
                                <option value="wrong_data">返回错误数据</option>
                                <option value="garbage">返回垃圾数据</option>
                                <option value="slow">慢速响应 (挂起)</option>
                            </select>
                        </div>
                        <div class="form-group full-width">
                            <label>描述</label>
                            <input type="text" id="trap-desc" placeholder="陷阱描述信息">
                        </div>
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="trap-enabled" checked>
                                启用此陷阱
                            </label>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button class="btn btn-primary" id="save-trap">保存</button>
                        <button class="btn btn-secondary" id="cancel-trap">取消</button>
                    </div>
                </div>
                <div id="traps-list">
                    <div class="loading">加载中...</div>
                </div>
            </div>
        </div>
    </div>

    <div id="toast" class="toast hidden"></div>

    <script src="/static/app.js"></script>
</body>
</html>`

const styleCSS = `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    color: #e4e4e7;
    min-height: 100vh;
}

header {
    background: rgba(0, 0, 0, 0.3);
    padding: 1.5rem 2rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
}

header h1 {
    font-size: 1.8rem;
    margin-bottom: 1rem;
    background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.status-bar {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
}

.status-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.status-label {
    color: #9ca3af;
    font-size: 0.9rem;
}

.status-value {
    font-weight: 600;
    color: #4ade80;
    font-size: 0.95rem;
}

.container {
    max-width: 1400px;
    margin: 2rem auto;
    padding: 0 2rem;
}

.tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 2px solid rgba(255, 255, 255, 0.1);
}

.tab-btn {
    background: transparent;
    border: none;
    color: #9ca3af;
    padding: 1rem 1.5rem;
    font-size: 1rem;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: all 0.3s ease;
}

.tab-btn:hover {
    color: #e4e4e7;
    background: rgba(255, 255, 255, 0.05);
}

.tab-btn.active {
    color: #4facfe;
    border-bottom-color: #4facfe;
}

.tab-content {
    display: none;
}

.tab-content.active {
    display: block;
    animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.panel {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    overflow: hidden;
}

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.2);
}

.panel-header h2 {
    font-size: 1.2rem;
    font-weight: 600;
}

.btn {
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
}

.btn-primary {
    background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    color: #0f172a;
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(79, 172, 254, 0.4);
}

.btn-danger {
    background: #ef4444;
    color: white;
}

.btn-danger:hover {
    background: #dc2626;
    transform: translateY(-2px);
}

.btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: #e4e4e7;
}

.btn-secondary:hover {
    background: rgba(255, 255, 255, 0.2);
}

.btn-small {
    padding: 0.3rem 0.8rem;
    font-size: 0.8rem;
}

.table-container {
    max-height: 600px;
    overflow-y: auto;
}

.logs-table {
    width: 100%;
    border-collapse: collapse;
}

.logs-table th {
    position: sticky;
    top: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
    padding: 1rem;
    text-align: left;
    font-size: 0.85rem;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    z-index: 10;
}

.logs-table td {
    padding: 0.9rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    font-size: 0.9rem;
}

.logs-table tbody tr:hover {
    background: rgba(79, 172, 254, 0.1);
}

.logs-table tbody tr.trap-row {
    background: rgba(239, 68, 68, 0.1);
}

.logs-table tbody tr.trap-row:hover {
    background: rgba(239, 68, 68, 0.2);
}

.loading {
    text-align: center;
    padding: 2rem;
    color: #9ca3af;
}

.badge {
    display: inline-block;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
}

.badge-success {
    background: rgba(74, 222, 128, 0.2);
    color: #4ade80;
}

.badge-danger {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
}

.badge-info {
    background: rgba(79, 172, 254, 0.2);
    color: #4facfe;
}

.badge-warning {
    background: rgba(251, 191, 36, 0.2);
    color: #fbbf24;
}

#attack-map {
    height: 500px;
    border-radius: 8px;
    overflow: hidden;
}

.map-legend {
    display: flex;
    gap: 2rem;
    padding: 1rem 1.5rem;
    justify-content: center;
    background: rgba(0, 0, 0, 0.2);
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
}

.dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
}

.dot-normal {
    background: #4ade80;
}

.dot-trap {
    background: #ef4444;
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.2); opacity: 0.7; }
}

.trap-form {
    padding: 1.5rem;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.trap-form h3 {
    margin-bottom: 1rem;
    font-size: 1.1rem;
}

.hidden {
    display: none !important;
}

.form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.form-group.full-width {
    grid-column: 1 / -1;
}

.form-group label {
    font-size: 0.85rem;
    color: #9ca3af;
}

.form-group input,
.form-group select {
    padding: 0.6rem 0.8rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    color: #e4e4e7;
    font-size: 0.9rem;
    transition: all 0.2s ease;
}

.form-group input:focus,
.form-group select:focus {
    outline: none;
    border-color: #4facfe;
    box-shadow: 0 0 0 3px rgba(79, 172, 254, 0.2);
}

.checkbox-label {
    flex-direction: row !important;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
}

.checkbox-label input {
    width: auto;
}

.form-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
}

.trap-card {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: background 0.2s ease;
}

.trap-card:hover {
    background: rgba(255, 255, 255, 0.03);
}

.trap-info {
    flex: 1;
}

.trap-info h4 {
    font-size: 1rem;
    margin-bottom: 0.25rem;
}

.trap-info p {
    font-size: 0.85rem;
    color: #9ca3af;
}

.trap-meta {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
}

.trap-actions {
    display: flex;
    gap: 0.5rem;
}

.toast {
    position: fixed;
    top: 2rem;
    right: 2rem;
    padding: 1rem 1.5rem;
    background: #1f2937;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    animation: slideIn 0.3s ease;
}

.toast.success {
    border-left: 4px solid #4ade80;
}

.toast.error {
    border-left: 4px solid #ef4444;
}

@keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}

::-webkit-scrollbar {
    width: 8px;
}

::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
}

::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
`

const appJS = \`let logs = [];
let traps = [];
let map = null;
let markers = [];
let ipCache = {};
let lastLogID = 0;
let totalRequestCount = 0;
let isInitialLoad = true;
let mapUpdatePending = false;
let logRenderPending = false;
let pendingNewLogs = [];

const MAX_DISPLAY_LOGS = 200;
const FETCH_LIMIT = 500;

const mockGeoData = {
    '127.0.0.1': { lat: 39.9042, lng: 116.4074, city: '北京' },
    '192.168.1.1': { lat: 31.2304, lng: 121.4737, city: '上海' },
    '192.168.1.100': { lat: 30.5728, lng: 104.0668, city: '成都' },
    '10.0.0.50': { lat: 22.5431, lng: 114.0579, city: '深圳' },
    '172.16.0.10': { lat: 34.3416, lng: 108.9398, city: '西安' },
    '203.0.113.42': { lat: 37.7749, lng: -122.4194, city: '旧金山' },
    '198.51.100.23': { lat: 51.5074, lng: -0.1278, city: '伦敦' },
    '192.0.2.156': { lat: 35.6762, lng: 139.6503, city: '东京' },
};

function initMap() {
    map = L.map('attack-map').setView([35, 105], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
}

function getIPLocation(ip) {
    if (ipCache[ip]) {
        return ipCache[ip];
    }
    if (mockGeoData[ip]) {
        ipCache[ip] = mockGeoData[ip];
        return mockGeoData[ip];
    }
    const lat = 25 + Math.random() * 45;
    const lng = 80 + Math.random() * 60;
    const location = { lat, lng, city: '未知-' + ip };
    ipCache[ip] = location;
    return location;
}

function throttledUpdateMap() {
    if (mapUpdatePending) return;
    mapUpdatePending = true;
    requestAnimationFrame(() => {
        updateMap();
        mapUpdatePending = false;
    });
}

function updateMap() {
    if (!map) return;
    
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    
    const ipStats = {};
    logs.forEach(log => {
        if (!ipStats[log.source_ip]) {
            ipStats[log.source_ip] = { count: 0, traps: 0 };
        }
        ipStats[log.source_ip].count++;
        if (log.trap_triggered) {
            ipStats[log.source_ip].traps++;
        }
    });
    
    Object.entries(ipStats).forEach(([ip, stats]) => {
        const loc = getIPLocation(ip);
        const hasTrap = stats.traps > 0;
        const color = hasTrap ? '#ef4444' : '#4ade80';
        const size = Math.min(15 + stats.count * 2, 40);
        
        const marker = L.circleMarker([loc.lat, loc.lng], {
            radius: size,
            fillColor: color,
            color: color,
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.5,
            className: hasTrap ? 'trap-marker' : ''
        }).addTo(map);
        
        marker.bindPopup(\\`
            <strong>IP: \\${ip}</strong><br/>
            位置: \\${loc.city}<br/>
            请求次数: \\${stats.count}<br/>
            触发陷阱: \\${stats.traps}
        \\`);
        
        if (hasTrap) {
            const icon = L.divIcon({
                className: 'custom-div-icon',
                html: '<div style="animation: pulse 2s infinite; width: ' + (size * 2) + 'px; height: ' + (size * 2) + 'px; border-radius: 50%; background: rgba(239,68,68,0.3); position: absolute; top: -' + (size/2) + 'px; left: -' + (size/2) + 'px;"></div>',
                iconSize: [0, 0]
            });
            L.marker([loc.lat, loc.lng], { icon }).addTo(map);
        }
        
        markers.push(marker);
    });
}

async function fetchLogs() {
    try {
        const url = lastLogID > 0 
            ? \\`/api/logs?since=\\${lastLogID}&limit=\\${FETCH_LIMIT}\\`
            : \\`/api/logs?limit=\\${MAX_DISPLAY_LOGS}\\`;
        
        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
            const newLogs = data.data;
            
            if (newLogs.length > 0) {
                if (isInitialLoad) {
                    logs = newLogs;
                    isInitialLoad = false;
                } else {
                    logs = [...newLogs, ...logs].slice(0, MAX_DISPLAY_LOGS);
                }
                
                if (data.next_log_id > lastLogID) {
                    lastLogID = data.next_log_id - 1;
                }
                
                totalRequestCount = Math.max(totalRequestCount, logs.length > 0 ? logs[0].log_id : 0);
                
                scheduleLogRender();
                updateStats();
                throttledUpdateMap();
            }
        }
    } catch (e) {
        console.error('Fetch logs error:', e);
    }
}

function scheduleLogRender() {
    if (logRenderPending) return;
    logRenderPending = true;
    requestAnimationFrame(() => {
        renderLogs();
        logRenderPending = false;
    });
}

async function fetchSlaves() {
    try {
        const res = await fetch('/api/slaves');
        const data = await res.json();
        if (data.success) {
            document.getElementById('slave-status').innerHTML = 
                data.data.map(s => \\`
                    <span class="badge \\${s.running ? 'badge-success' : 'badge-danger'}">
                        \\${s.name}:\\${s.port}
                    </span>
                \\`).join(' ');
        }
    } catch (e) {
        console.error('Fetch slaves error:', e);
    }
}

async function fetchTraps() {
    try {
        const res = await fetch('/api/traps');
        const data = await res.json();
        if (data.success) {
            traps = data.data;
            renderTraps();
        }
    } catch (e) {
        console.error('Fetch traps error:', e);
    }
}

function createLogRow(log) {
    const tr = document.createElement('tr');
    if (log.trap_triggered) {
        tr.className = 'trap-row';
    }
    
    const time = new Date(log.timestamp).toLocaleString('zh-CN');
    const statusBadge = log.trap_triggered 
        ? \\`<span class="badge badge-danger">陷阱: \\${log.trap_name}</span>\\`
        : \\`<span class="badge badge-success">正常响应</span>\\`;
    
    tr.innerHTML = \\`
        <td>\\${time}</td>
        <td><code>\\${log.source_ip}</code></td>
        <td><span class="badge badge-info">\\${log.slave_name}</span></td>
        <td><code>0x\\${log.function_code.toString(16).toUpperCase().padStart(2, '0')}</code></td>
        <td>\\${log.function_name}</td>
        <td>\\${statusBadge}</td>
    \\`;
    
    return tr;
}

function renderLogs() {
    const tbody = document.getElementById('logs-body');
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">暂无请求记录</td></tr>';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    const displayLogs = logs.slice(0, MAX_DISPLAY_LOGS);
    
    for (const log of displayLogs) {
        fragment.appendChild(createLogRow(log));
    }
    
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

function renderTraps() {
    const container = document.getElementById('traps-list');
    if (traps.length === 0) {
        container.innerHTML = '<div class="loading">暂无陷阱配置，点击上方按钮添加</div>';
        return;
    }
    
    const typeNames = {
        'exception': '异常响应',
        'wrong_data': '错误数据',
        'garbage': '垃圾数据',
        'slow': '慢速响应'
    };
    
    container.innerHTML = traps.map(trap => \\`
        <div class="trap-card">
            <div class="trap-info">
                <h4>
                    \\${trap.name}
                    <span class="badge \\${trap.enabled ? 'badge-success' : 'badge-warning'}">
                        \\${trap.enabled ? '已启用' : '已禁用'}
                    </span>
                </h4>
                <p>\\${trap.description}</p>
                <div class="trap-meta">
                    <span class="badge badge-info">从站: \\${trap.slave_id || '全部'}</span>
                    <span class="badge badge-info">功能码: \\${trap.function_code || '全部'}</span>
                    <span class="badge badge-warning">类型: \\${typeNames[trap.type] || trap.type}</span>
                </div>
            </div>
            <div class="trap-actions">
                <button class="btn btn-secondary btn-small" onclick="toggleTrap('\\${trap.id}')">
                    \\${trap.enabled ? '禁用' : '启用'}
                </button>
                <button class="btn btn-danger btn-small" onclick="deleteTrap('\\${trap.id}')">删除</button>
            </div>
        </div>
    \\`).join('');
}

function updateStats() {
    document.getElementById('total-requests').textContent = totalRequestCount.toLocaleString();
    const trapCount = logs.filter(l => l.trap_triggered).length;
    document.getElementById('traps-triggered').textContent = trapCount;
}

async function saveTrap() {
    const trap = {
        name: document.getElementById('trap-name').value,
        slave_id: parseInt(document.getElementById('trap-slave').value),
        function_code: parseInt(document.getElementById('trap-func').value),
        type: document.getElementById('trap-type').value,
        description: document.getElementById('trap-desc').value,
        enabled: document.getElementById('trap-enabled').checked
    };
    
    if (!trap.name) {
        showToast('请输入陷阱名称', 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/traps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(trap)
        });
        const data = await res.json();
        if (data.success) {
            showToast('陷阱创建成功', 'success');
            hideTrapForm();
            resetTrapForm();
            fetchTraps();
        } else {
            showToast(data.error || '创建失败', 'error');
        }
    } catch (e) {
        showToast('网络错误', 'error');
    }
}

async function toggleTrap(id) {
    const trap = traps.find(t => t.id === id);
    if (!trap) return;
    
    trap.enabled = !trap.enabled;
    try {
        const res = await fetch('/api/traps/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(trap)
        });
        const data = await res.json();
        if (data.success) {
            showToast(trap.enabled ? '陷阱已启用' : '陷阱已禁用', 'success');
            fetchTraps();
        }
    } catch (e) {
        showToast('操作失败', 'error');
    }
}

async function deleteTrap(id) {
    if (!confirm('确定要删除这个陷阱吗？')) return;
    
    try {
        const res = await fetch('/api/traps/' + id, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
            showToast('陷阱已删除', 'success');
            fetchTraps();
        }
    } catch (e) {
        showToast('删除失败', 'error');
    }
}

async function clearLogs() {
    if (!confirm('确定要清空所有日志吗？')) return;
    
    try {
        const res = await fetch('/api/logs/clear', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            logs = [];
            lastLogID = 0;
            totalRequestCount = 0;
            isInitialLoad = true;
            renderLogs();
            updateStats();
            updateMap();
            showToast('日志已清空', 'success');
        }
    } catch (e) {
        showToast('清空失败', 'error');
    }
}

function showTrapForm() {
    document.getElementById('trap-form').classList.remove('hidden');
}

function hideTrapForm() {
    document.getElementById('trap-form').classList.add('hidden');
}

function resetTrapForm() {
    document.getElementById('trap-name').value = '';
    document.getElementById('trap-slave').value = '0';
    document.getElementById('trap-func').value = '0';
    document.getElementById('trap-type').value = 'exception';
    document.getElementById('trap-desc').value = '';
    document.getElementById('trap-enabled').checked = true;
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type;
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            
            if (tabId === 'map' && !map) {
                setTimeout(initMap, 100);
            }
        });
    });
}

function init() {
    initTabs();
    
    document.getElementById('add-trap-btn').addEventListener('click', showTrapForm);
    document.getElementById('save-trap').addEventListener('click', saveTrap);
    document.getElementById('cancel-trap').addEventListener('click', hideTrapForm);
    document.getElementById('clear-logs').addEventListener('click', clearLogs);
    
    fetchLogs();
    fetchSlaves();
    fetchTraps();
    
    setInterval(fetchLogs, 2000);
    setInterval(fetchSlaves, 5000);
}

window.toggleTrap = toggleTrap;
window.deleteTrap = deleteTrap;

document.addEventListener('DOMContentLoaded', init);
\`
