const API_BASE = window.location.origin;

let statsData = [];
let alertsData = [];
let blockedData = [];
let logsData = [];
let selectedIP = null;
let totalRequestCount = 0;
let alertCount = 0;
let activeAlertCount = 0;
let blockedCount = 0;
let logsCount = 0;
let geoCache = {};

const countryFlags = {
    'CN': '🇨🇳', 'US': '🇺🇸', 'RU': '🇷🇺', 'JP': '🇯🇵', 'KR': '🇰🇷',
    'DE': '🇩🇪', 'FR': '🇫🇷', 'GB': '🇬🇧', 'BR': '🇧🇷', 'IN': '🇮🇳',
    'IR': '🇮🇷', 'IQ': '🇮🇶', 'SA': '🇸🇦', 'AE': '🇦🇪', 'TR': '🇹🇷',
    'NL': '🇳🇱', 'SE': '🇸🇪', 'NO': '🇳🇴', 'FI': '🇫🇮', 'PL': '🇵🇱',
    'IT': '🇮🇹', 'ES': '🇪🇸', 'PT': '🇵🇹', 'GR': '🇬🇷', 'AU': '🇦🇺',
    'CA': '🇨🇦', 'MX': '🇲🇽', 'AR': '🇦🇷', 'CL': '🇨🇱', 'SG': '🇸🇬',
    'HK': '🇭🇰', 'TW': '🇹🇼', 'VN': '🇻🇳', 'TH': '🇹🇭', 'MY': '🇲🇾',
    'ID': '🇮🇩', 'PH': '🇵🇭', 'PK': '🇵🇰', 'BD': '🇧🇩', 'NG': '🇳🇬',
    'EG': '🇪🇬', 'ZA': '🇿🇦', 'KE': '🇰🇪', 'IL': '🇮🇱', 'SY': '🇸🇾',
    'UA': '🇺🇦', 'BY': '🇧🇾', 'KZ': '🇰🇿', 'UZ': '🇺🇿', 'AZ': '🇦🇿',
    'GE': '🇬🇪', 'AM': '🇦🇲', 'MD': '🇲🇩', 'RO': '🇷🇴', 'BG': '🇧🇬',
    'HU': '🇭🇺', 'CZ': '🇨🇿', 'SK': '🇸🇰', 'AT': '🇦🇹', 'CH': '🇨🇭',
    'BE': '🇧🇪', 'LU': '🇱🇺', 'DK': '🇩🇰', 'IE': '🇮🇪', 'IS': '🇮🇸',
    'EE': '🇪🇪', 'LV': '🇱🇻', 'LT': '🇱🇹', 'SI': '🇸🇮', 'HR': '🇭🇷',
    'RS': '🇷🇸', 'BA': '🇧🇦', 'MK': '🇲🇰', 'AL': '🇦🇱', 'ME': '🇲🇪',
    'NZ': '🇳🇿', 'FJ': '🇫🇯', 'PG': '🇵🇬', 'VE': '🇻🇪', 'CO': '🇨🇴',
    'PE': '🇵🇪', 'EC': '🇪🇨', 'BO': '🇧🇴', 'PY': '🇵🇾', 'UY': '🇺🇾'
};

function getFlag(countryCode) {
    return countryFlags[countryCode] || '🌍';
}

function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatRate(rate) {
    return rate.toFixed(2);
}

function getRateClass(rate, threshold = 10) {
    if (rate > threshold * 3) return 'critical';
    if (rate > threshold) return 'warning';
    return 'normal';
}

function getFlagEmoji(countryCode) {
    if (!countryCode) return '🌍';
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char =>  127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
}

function updateConnectionStatus(connected) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    
    statusDot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
    statusText.textContent = connected ? '已连接' : '断开连接';
}

async function fetchStats() {
    try {
        const response = await fetch(`${API_BASE}/api/stats`);
        const data = await response.json();
        
        if (data.success) {
            statsData = data.data;
            updateStatsUI();
            updateConnectionStatus(true);
        }
    } catch (error) {
        console.error('Failed to fetch stats:', error);
        updateConnectionStatus(false);
    }
}

async function fetchAlerts() {
    try {
        const response = await fetch(`${API_BASE}/api/alerts?limit=50`);
        const data = await response.json();
        
        if (data.success) {
            alertsData = data.data;
            updateAlertsUI();
            updateConnectionStatus(true);
        }
    } catch (error) {
        console.error('Failed to fetch alerts:', error);
        updateConnectionStatus(false);
    }
}

function updateStatsUI() {
    const tbody = document.getElementById('statsTableBody');
    const monitoredIPs = document.getElementById('monitoredIPs');
    const totalRequests = document.getElementById('totalRequests');
    
    let newTotal = 0;
    activeAlertCount = 0;
    
    statsData.forEach(stat => {
        newTotal += stat.count;
        if (stat.is_alerting) activeAlertCount++;
    });
    
    if (newTotal > totalRequestCount) {
        totalRequestCount = newTotal;
    }
    
    monitoredIPs.textContent = statsData.length;
    totalRequests.textContent = totalRequestCount.toLocaleString();
    
    const sortedStats = [...statsData].sort((a, b) => (b.weighted_rate || b.rate) - (a.weighted_rate || a.rate));
    
    tbody.innerHTML = sortedStats.map(stat => {
        const weightedRate = stat.weighted_rate !== undefined ? stat.weighted_rate : stat.rate;
        const rateClass = getRateClass(weightedRate);
        const location = geoCache[stat.ip] ? 
            `${geoCache[stat.ip].city || ''}, ${geoCache[stat.ip].country || ''}`.trim() : 
            '查询中...';
        
        const initialCount = stat.initial_count || 0;
        const refreshCount = stat.refresh_count || 0;
        
        return `
            <tr class="${selectedIP === stat.ip ? 'selected' : ''}">
                <td class="ip-cell" onclick="showIPDetail('${stat.ip}')">${stat.ip}</td>
                <td class="location-cell" onclick="showIPDetail('${stat.ip}')">${location || '-'}</td>
                <td class="rate-cell rate-${getRateClass(stat.rate)}" onclick="showIPDetail('${stat.ip}')">${formatRate(stat.rate)}</td>
                <td class="rate-cell rate-${rateClass}" onclick="showIPDetail('${stat.ip}')"><strong>${formatRate(weightedRate)}</strong></td>
                <td class="rate-cell" onclick="showIPDetail('${stat.ip}')">
                    <span style="color: #2ed573;">${initialCount}</span>
                    <span style="color: rgba(255,255,255,0.5);">/</span>
                    <span style="color: #ffa502;">${refreshCount}</span>
                </td>
                <td>
                    <button class="action-btn block-btn" onclick="event.stopPropagation(); blockIP('${stat.ip}', '手动封禁')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                        </svg>
                        封禁
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    updateMapUI();
    updateGeoStats();
}

function updateAlertsUI() {
    const alertList = document.getElementById('alertList');
    const alertBadge = document.getElementById('alertBadge');
    const activeAlertsEl = document.getElementById('activeAlerts');
    const totalAlertsEl = document.getElementById('totalAlerts');
    
    if (alertsData.length > alertCount) {
        alertCount = alertsData.length;
    }
    
    alertBadge.textContent = alertsData.length;
    activeAlertsEl.textContent = activeAlertCount;
    totalAlertsEl.textContent = alertCount;
    
    if (alertsData.length === 0) {
        alertList.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p>暂无告警</p>
                <span>系统运行正常</span>
            </div>
        `;
        return;
    }
    
    alertList.innerHTML = alertsData.map(alert => {
        const weightedRate = alert.weighted_rate !== undefined ? alert.weighted_rate : alert.rate;
        const isCritical = weightedRate > alert.threshold * 3;
        const location = alert.geo_info ? 
            `${alert.geo_info.city || ''}, ${alert.geo_info.country || ''}`.trim() : 
            '位置未知';
        
        const initialCount = alert.initial_count || 0;
        const refreshCount = alert.refresh_count || 0;
        
        return `
            <div class="alert-item ${isCritical ? 'critical' : ''}" onclick="showAlertDetail('${alert.id}')">
                <div class="alert-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                </div>
                <div class="alert-content">
                    <div class="alert-ip">${alert.ip}</div>
                    <div class="alert-meta">
                        <span class="alert-rate">原始: ${formatRate(alert.rate)} | 加权: <strong>${formatRate(weightedRate)}</strong> 次/秒</span>
                        <span style="color: #2ed573;">初: ${initialCount}</span>
                        <span style="color: #ffa502;">重: ${refreshCount}</span>
                        <span class="alert-location">${location}</span>
                        <span class="alert-time">${formatTime(alert.timestamp)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    alertsData.forEach(alert => {
        if (alert.geo_info && !geoCache[alert.ip]) {
            geoCache[alert.ip] = alert.geo_info;
        }
    });
}

function updateMapUI() {
    const mapPoints = document.getElementById('mapPoints');
    const mapStatus = document.getElementById('mapStatus');
    const placeholder = document.querySelector('.map-placeholder');
    
    const alertIPs = statsData.filter(s => s.is_alerting || (s.weighted_rate || s.rate) > 10);
    
    if (alertIPs.length === 0) {
        mapStatus.textContent = '等待攻击数据...';
        placeholder.style.display = 'flex';
        mapPoints.innerHTML = '';
        return;
    }
    
    placeholder.style.display = 'none';
    
    mapPoints.innerHTML = alertIPs.map(stat => {
        const geo = geoCache[stat.ip];
        if (!geo || geo.latitude === 0) return '';
        
        const lat = geo.latitude;
        const lng = geo.longitude;
        
        const x = ((lng + 180) / 360) * 100;
        const y = ((90 - lat) / 180) * 100;
        
        const weightedRate = stat.weighted_rate !== undefined ? stat.weighted_rate : stat.rate;
        const isCritical = weightedRate > 30;
        const location = `${geo.city || ''}, ${geo.country || ''}`.trim();
        
        return `
            <div class="map-point ${isCritical ? 'critical' : ''}" 
                 style="left: ${x}%; top: ${y}%;"
                 onclick="showIPDetail('${stat.ip}')">
                <div class="map-point-dot"></div>
                <div class="map-point-tooltip">
                    <strong>${stat.ip}</strong><br>
                    ${location}<br>
                    加权: ${formatRate(weightedRate)} | 原始: ${formatRate(stat.rate)} 次/秒
                </div>
            </div>
        `;
    }).join('');
}

function updateGeoStats() {
    const geoStats = document.getElementById('geoStats');
    
    const countryCount = {};
    statsData.forEach(stat => {
        const geo = geoCache[stat.ip];
        if (geo && geo.country_code) {
            countryCount[geo.country_code] = (countryCount[geo.country_code] || 0) + 1;
        }
    });
    
    const sortedCountries = Object.entries(countryCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);
    
    if (sortedCountries.length === 0) {
        geoStats.innerHTML = '';
        return;
    }
    
    geoStats.innerHTML = sortedCountries.map(([code, count]) => {
        const geo = Object.values(geoCache).find(g => g.country_code === code);
        const countryName = geo ? geo.country : code;
        
        return `
            <div class="geo-stat-item">
                <span class="geo-stat-label">
                    <span class="geo-stat-flag">${getFlag(code)}</span>
                    ${countryName}
                </span>
                <span class="geo-stat-value">${count} 个IP</span>
            </div>
        `;
    }).join('');
}

async function showIPDetail(ip) {
    selectedIP = ip;
    const detailPanel = document.getElementById('detailPanel');
    const detailContent = document.getElementById('detailContent');
    
    detailPanel.style.display = 'block';
    
    const stat = statsData.find(s => s.ip === ip);
    const geo = geoCache[ip];
    const alerts = alertsData.filter(a => a.ip === ip);
    
    let html = '';
    
    if (stat) {
        const weightedRate = stat.weighted_rate !== undefined ? stat.weighted_rate : stat.rate;
        const weightedCount = stat.weighted_count !== undefined ? stat.weighted_count : stat.count;
        const initialCount = stat.initial_count || 0;
        const refreshCount = stat.refresh_count || 0;
        
        html += `
            <div class="detail-section">
                <h3>基本信息</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">IP 地址</div>
                        <div class="detail-value">${stat.ip}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">原始频率</div>
                        <div class="detail-value rate-${getRateClass(stat.rate)}">${formatRate(stat.rate)} 次/秒</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">加权频率</div>
                        <div class="detail-value rate-${getRateClass(weightedRate)}"><strong>${formatRate(weightedRate)}</strong> 次/秒</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">加权总数</div>
                        <div class="detail-value">${weightedCount.toFixed(1)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">请求总数</div>
                        <div class="detail-value">${stat.count}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">初次/重注册</div>
                        <div class="detail-value">
                            <span style="color: #2ed573;">${initialCount}</span>
                            <span style="color: rgba(255,255,255,0.5);"> / </span>
                            <span style="color: #ffa502;">${refreshCount}</span>
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">告警状态</div>
                        <div class="detail-value">
                            <span class="status-badge status-${stat.alert_level}">
                                ${stat.alert_level === 'normal' ? '正常' : stat.alert_level === 'warning' ? '警告' : '严重'}
                            </span>
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">首次出现</div>
                        <div class="detail-value">${formatTime(stat.first_seen)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">最近活动</div>
                        <div class="detail-value">${formatTime(stat.last_seen)}</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (geo) {
        html += `
            <div class="detail-section">
                <h3>地理位置</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">国家</div>
                        <div class="detail-value">${getFlag(geo.country_code)} ${geo.country || '-'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">城市</div>
                        <div class="detail-value">${geo.city || '-'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">经纬度</div>
                        <div class="detail-value">${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">时区</div>
                        <div class="detail-value">${geo.timezone || '-'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">ISP</div>
                        <div class="detail-value">${geo.isp || '-'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">ASN</div>
                        <div class="detail-value">${geo.asn || '-'}</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (alerts.length > 0) {
        const latestAlert = alerts[0];
        const maxRate = Math.max(...alerts.map(a => a.rate));
        const maxWeightedRate = Math.max(...alerts.map(a => a.weighted_rate || a.rate));
        const totalInitial = alerts.reduce((sum, a) => sum + (a.initial_count || 0), 0);
        const totalRefresh = alerts.reduce((sum, a) => sum + (a.refresh_count || 0), 0);
        
        html += `
            <div class="detail-section">
                <h3>告警信息</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">告警次数</div>
                        <div class="detail-value">${alerts.length}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">最新告警</div>
                        <div class="detail-value">${formatTime(latestAlert.timestamp)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">峰值原始频率</div>
                        <div class="detail-value rate-critical">${formatRate(maxRate)} 次/秒</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">峰值加权频率</div>
                        <div class="detail-value rate-critical"><strong>${formatRate(maxWeightedRate)}</strong> 次/秒</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">告警阈值</div>
                        <div class="detail-value">${latestAlert.threshold} 次/秒</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">初次/重注册总数</div>
                        <div class="detail-value">
                            <span style="color: #2ed573;">${totalInitial}</span>
                            <span style="color: rgba(255,255,255,0.5);"> / </span>
                            <span style="color: #ffa502;">${totalRefresh}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        if (latestAlert.user_agents && latestAlert.user_agents.length > 0) {
            html += `
                <div class="detail-section">
                    <h3>User Agent</h3>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${latestAlert.user_agents.map(ua => `
                            <div class="detail-item">
                                <div class="detail-value" style="font-size: 12px; font-family: monospace;">${ua}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        if (latestAlert.destinations && Object.keys(latestAlert.destinations).length > 0) {
            html += `
                <div class="detail-section">
                    <h3>攻击目标</h3>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${Object.entries(latestAlert.destinations).map(([dest, count]) => `
                            <div class="detail-item" style="display: flex; justify-content: space-between; align-items: center;">
                                <div class="detail-value" style="font-size: 12px; font-family: monospace;">${dest}</div>
                                <div class="detail-value" style="color: #ffa502;">${count} 次</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    }
    
    detailContent.innerHTML = html;
    updateStatsUI();
}

function showAlertDetail(alertId) {
    const alert = alertsData.find(a => a.id === alertId);
    if (alert) {
        showIPDetail(alert.ip);
    }
}

document.getElementById('closeDetail').addEventListener('click', () => {
    document.getElementById('detailPanel').style.display = 'none';
    selectedIP = null;
    updateStatsUI();
});

document.getElementById('refreshStats').addEventListener('click', () => {
    fetchStats();
    fetchAlerts();
});

function showToast(alert) {
    const container = document.getElementById('toastContainer');
    const location = alert.geo_info ? 
        `${alert.geo_info.city || ''}, ${alert.geo_info.country || ''}`.trim() : 
        '位置未知';
    
    const weightedRate = alert.weighted_rate !== undefined ? alert.weighted_rate : alert.rate;
    const initialCount = alert.initial_count || 0;
    const refreshCount = alert.refresh_count || 0;
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <div class="toast-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
        </div>
        <div class="toast-content">
            <div class="toast-title">SIP 洪水攻击告警</div>
            <div class="toast-message">${alert.ip} - 加权: ${formatRate(weightedRate)} | 原始: ${formatRate(alert.rate)} 次/秒<br>初: ${initialCount} / 重: ${refreshCount} - ${location}</div>
        </div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

function connectSSE() {
    const eventSource = new EventSource(`${API_BASE}/api/alerts/stream`);
    
    eventSource.onopen = () => {
        console.log('SSE connection opened');
        updateConnectionStatus(true);
    };
    
    eventSource.addEventListener('alert', (event) => {
        try {
            const alert = JSON.parse(event.data);
            console.log('New alert received:', alert);
            
            if (alert.geo_info) {
                geoCache[alert.ip] = alert.geo_info;
            }
            
            alertsData.unshift(alert);
            alertCount++;
            activeAlertCount++;
            
            showToast(alert);
            fetchStats();
            updateAlertsUI();
        } catch (error) {
            console.error('Failed to parse alert:', error);
        }
    });
    
    eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        updateConnectionStatus(false);
        
        setTimeout(() => {
            console.log('Attempting to reconnect SSE...');
            connectSSE();
        }, 5000);
    };
}

function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabId = tab.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(content => {
                content.style.display = 'none';
            });
            document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).style.display = 'block';
            
            if (tabId === 'blocked') {
                fetchBlocked();
            } else if (tabId === 'logs') {
                fetchLogs();
            }
        });
    });
}

async function fetchBlocked() {
    try {
        const response = await fetch(`${API_BASE}/api/blocked`);
        const data = await response.json();
        if (data.success) {
            blockedData = data.data;
            blockedCount = data.total;
            updateBlockedUI();
            updateStatsCards();
        }
    } catch (error) {
        console.error('Failed to fetch blocked IPs:', error);
    }
}

async function fetchLogs() {
    try {
        const response = await fetch(`${API_BASE}/api/logs?limit=100`);
        const data = await response.json();
        if (data.success) {
            logsData = data.data;
            logsCount = data.total;
            updateLogsUI();
            updateStatsCards();
        }
    } catch (error) {
        console.error('Failed to fetch logs:', error);
    }
}

function updateBlockedUI() {
    const list = document.getElementById('blockedList');
    
    if (blockedData.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                </svg>
                <p>暂无封禁IP</p>
                <span>自动封禁功能已启用</span>
            </div>
        `;
        return;
    }
    
    list.innerHTML = blockedData.map(blocked => {
        const location = blocked.geo_info ? 
            `${blocked.geo_info.city || ''}, ${blocked.geo_info.country || ''}`.trim() : 
            '位置未知';
        
        const expiresIn = blocked.is_permanent ? '永久' : 
            Math.max(0, Math.floor((new Date(blocked.expires_at) - Date.now()) / 1000)) + 's';
        
        return `
            <div class="blocked-item">
                <div class="blocked-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                    </svg>
                </div>
                <div class="blocked-content">
                    <div class="blocked-ip">${blocked.ip}</div>
                    <div class="blocked-meta">
                        <span class="blocked-reason">${blocked.reason}</span>
                        <span class="blocked-location">${location}</span>
                        <span class="blocked-expires">剩余: ${expiresIn}</span>
                        <span class="blocked-time">${formatTime(blocked.blocked_at)}</span>
                    </div>
                </div>
                <button class="unblock-btn" onclick="unblockIP('${blocked.ip}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                    解封
                </button>
            </div>
        `;
    }).join('');
}

function updateLogsUI() {
    const list = document.getElementById('logList');
    
    if (logsData.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p>暂无日志</p>
                <span>系统运行正常</span>
            </div>
        `;
        return;
    }
    
    list.innerHTML = logsData.map(log => {
        const typeClass = log.type;
        const typeLabels = {
            'alert': '告警',
            'block': '封禁',
            'unblock': '解封',
            'detect': '检测',
            'info': '信息'
        };
        
        return `
            <div class="log-item log-${typeClass}">
                <div class="log-type">${typeLabels[log.type] || log.type}</div>
                <div class="log-content">
                    <div class="log-message">${log.message}</div>
                    <div class="log-meta">
                        <span class="log-ip">${log.ip || '-'}</span>
                        <span class="log-time">${formatTime(log.timestamp)}</span>
                        ${log.weighted_rate > 0 ? `<span class="log-rate">${formatRate(log.weighted_rate)} 次/秒</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function blockIP(ip, reason = '手动封禁') {
    try {
        const response = await fetch(`${API_BASE}/api/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip, reason })
        });
        const data = await response.json();
        if (data.success) {
            await fetchBlocked();
            await fetchLogs();
        }
    } catch (error) {
        console.error('Failed to block IP:', error);
    }
}

async function unblockIP(ip) {
    try {
        const response = await fetch(`${API_BASE}/api/unblock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip })
        });
        const data = await response.json();
        if (data.success) {
            await fetchBlocked();
            await fetchLogs();
        }
    } catch (error) {
        console.error('Failed to unblock IP:', error);
    }
}

async function exportJSON() {
    try {
        const response = await fetch(`${API_BASE}/api/logs/export/json`);
        const data = await response.json();
        if (data.success) {
            window.location.href = `${API_BASE}/api/logs/download/${data.file_name}`;
        }
    } catch (error) {
        console.error('Failed to export JSON:', error);
    }
}

async function exportCSV() {
    try {
        const response = await fetch(`${API_BASE}/api/logs/export/csv`);
        const data = await response.json();
        if (data.success) {
            window.location.href = `${API_BASE}/api/logs/download/${data.file_name}`;
        }
    } catch (error) {
        console.error('Failed to export CSV:', error);
    }
}

async function clearLogs() {
    if (!confirm('确定要清空所有日志吗？')) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/logs/clear`, { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            await fetchLogs();
        }
    } catch (error) {
        console.error('Failed to clear logs:', error);
    }
}

function updateStatsCards() {
    document.getElementById('blockedIPs').textContent = blockedCount;
    document.getElementById('totalLogs').textContent = logsCount;
}

async function init() {
    try {
        const configResponse = await fetch(`${API_BASE}/api/config`);
        const configData = await configResponse.json();
        if (configData.success) {
            document.getElementById('thresholdValue').textContent = 
                configData.data.threshold + ' 次/秒';
        }
    } catch (error) {
        console.error('Failed to fetch config:', error);
    }
    
    initTabs();
    
    await fetchStats();
    await fetchAlerts();
    await fetchBlocked();
    await fetchLogs();
    
    connectSSE();
    
    setInterval(() => {
        fetchStats();
    }, 3000);
    
    setInterval(() => {
        fetchAlerts();
    }, 10000);
    
    setInterval(() => {
        fetchBlocked();
        fetchLogs();
    }, 5000);
    
    document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);
    document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
    document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);
}

init();
