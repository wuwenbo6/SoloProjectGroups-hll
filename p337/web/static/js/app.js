const API_BASE = '/api';
let autoRefresh = true;
let refreshInterval = null;

document.addEventListener('DOMContentLoaded', function() {
    setupTabs();
    updateTime();
    setInterval(updateTime, 1000);
    loadAllData();
    startAutoRefresh();
});

function setupTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`.nav-tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'sessions') refreshSessions();
    if (tabName === 'vlans') refreshVLANs();
    if (tabName === 'events') refreshEvents();
}

function updateTime() {
    const now = new Date();
    document.getElementById('current-time').textContent = now.toLocaleTimeString();
}

function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        if (autoRefresh) {
            loadStats();
            const activeTab = document.querySelector('.nav-tab.active').dataset.tab;
            if (activeTab === 'sessions') refreshSessions();
            if (activeTab === 'vlans') refreshVLANs();
            if (activeTab === 'events') refreshEvents();
        }
    }, 3000);
}

function autoRefreshToggle() {
    autoRefresh = !autoRefresh;
    const btn = document.getElementById('auto-refresh-btn');
    btn.textContent = autoRefresh ? '⏸ 自动刷新' : '▶ 自动刷新';
    showToast(autoRefresh ? '自动刷新已开启' : '自动刷新已关闭', 'info');
}

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    try {
        const response = await fetch(API_BASE + endpoint, options);
        return await response.json();
    } catch (e) {
        console.error('API error:', e);
        return { success: false, error: '网络错误' };
    }
}

async function loadAllData() {
    await Promise.all([
        loadStats(),
        refreshSessions(),
        refreshVLANs(),
        refreshEvents(),
    ]);
}

async function loadStats() {
    const result = await apiCall('/stats');
    if (result.success) {
        updateStats(result.data);
    }
}

function updateStats(data) {
    document.getElementById('stat-total').textContent = data.total_sessions;
    document.getElementById('stat-active').textContent = data.active_sessions;
    document.getElementById('stat-vlan-used').textContent = data.vlan_allocations;
    document.getElementById('stat-vlan-percent').textContent = data.vlan_usage_percent.toFixed(1) + '%';

    const poolGrid = document.getElementById('pool-grid');
    poolGrid.innerHTML = '';

    const poolRanges = {
        residential: '100-199',
        business: '200-299',
        management: '300-399',
        guest: '400-499',
    };

    for (const [name, stat] of Object.entries(data.pool_stats)) {
        const percent = stat.total > 0 ? (stat.used / stat.total) * 100 : 0;
        const card = document.createElement('div');
        card.className = 'pool-card';
        card.innerHTML = `
            <div class="pool-header">
                <span class="pool-name">${name}</span>
                <span class="pool-range">${poolRanges[name] || ''}</span>
            </div>
            <div class="pool-bar">
                <div class="pool-bar-fill ${name}" style="width: ${percent}%"></div>
            </div>
            <div class="pool-stats">
                <span><span class="used">${stat.used}</span> / ${stat.total}</span>
                <span>${percent.toFixed(1)}%</span>
                <span>可用: ${stat.available}</span>
            </div>
        `;
        poolGrid.appendChild(card);
    }
}

async function refreshSessions() {
    const result = await apiCall('/sessions');
    if (result.success) {
        renderSessions(result.data);
    }
}

function renderSessions(sessions) {
    const tbody = document.getElementById('sessions-body');
    if (!sessions || sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">暂无会话数据</td></tr>';
        return;
    }

    tbody.innerHTML = sessions.map(s => `
        <tr>
            <td><code>${s.session_id}</code></td>
            <td><code>${s.mac_address}</code></td>
            <td><strong>${escapeHtml(s.username || '-')}</strong></td>
            <td><span class="badge ${s.auth_method === 'CHAP' ? 'badge-vlan' : 'badge-auth'}">${s.auth_method || '-'}</span></td>
            <td>${getStateBadge(s.state)}</td>
            <td><code>${s.remote_ip || '-'}</code></td>
            <td>${s.assigned_vlan ? `<span class="vlan-badge vlan-${Math.floor(s.assigned_vlan / 100) * 100}">${s.assigned_vlan}</span>` : '-'}</td>
            <td>
                <div style="font-size: 12px;">
                    <div>↓ ${formatBytes(s.bytes_in)}</div>
                    <div>↑ ${formatBytes(s.bytes_out)}</div>
                </div>
            </td>
            <td>${s.connected_at ? formatTime(s.connected_at) : '-'}</td>
            <td>
                ${s.state === 'SESSION_UP' ? 
                    `<button class="btn btn-danger" onclick="disconnectSession('${s.session_id}')">断开</button>` : 
                    '<span style="color:#95a5a6;">-</span>'
                }
            </td>
        </tr>
    `).join('');
}

function getStateBadge(state) {
    const badges = {
        'SESSION_UP': 'badge-up',
        'SESSION_DOWN': 'badge-down',
        'TERMINATING': 'badge-down',
        'AUTHENTICATING': 'badge-auth',
        'LCP_NEGOTIATION': 'badge-connecting',
        'IPCP_NEGOTIATION': 'badge-connecting',
        'PADI_SENT': 'badge-connecting',
        'PADO_SENT': 'badge-connecting',
        'PADR_SENT': 'badge-connecting',
        'PADS_SENT': 'badge-connecting',
    };
    const badgeClass = badges[state] || 'badge-connecting';
    return `<span class="badge ${badgeClass}">${state.replace(/_/g, ' ')}</span>`;
}

async function disconnectSession(sessionId) {
    if (!confirm(`确定要断开会话 ${sessionId} 吗？`)) return;
    
    const result = await apiCall(`/disconnect/${sessionId}`, 'POST');
    if (result.success) {
        showToast(`会话 ${sessionId} 已断开`, 'success');
        refreshSessions();
        refreshVLANs();
        loadStats();
    } else {
        showToast(result.error || '断开失败', 'error');
    }
}

async function refreshVLANs() {
    const result = await apiCall('/vlans');
    if (result.success) {
        renderVLANs(result.data);
    }
}

function renderVLANs(allocations) {
    const tbody = document.getElementById('vlans-body');
    if (!allocations || allocations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无 VLAN 分配</td></tr>';
        return;
    }

    allocations.sort((a, b) => a.vlan_id - b.vlan_id);

    tbody.innerHTML = allocations.map(v => `
        <tr>
            <td><span class="vlan-badge vlan-${Math.floor(v.vlan_id / 100) * 100}">${v.vlan_id}</span></td>
            <td><code>${v.session_id}</code></td>
            <td><strong>${escapeHtml(v.username || '-')}</strong></td>
            <td>${escapeHtml(v.description || '-')}</td>
            <td>${formatTime(v.allocated_at)}</td>
        </tr>
    `).join('');
}

async function refreshEvents() {
    const result = await apiCall('/events');
    if (result.success) {
        renderEvents(result.data);
    }
}

function renderEvents(events) {
    const container = document.getElementById('events-container');
    if (!events || events.length === 0) {
        container.innerHTML = '<div class="event-item event-loading">暂无事件数据</div>';
        return;
    }

    const sorted = [...events].reverse();
    container.innerHTML = sorted.map(e => `
        <div class="event-item">
            <span class="event-timestamp">${formatTime(e.timestamp, true)}</span>
            <span class="event-level ${e.level}">${e.level}</span>
            <span class="event-category">${e.category}</span>
            <div class="event-message">
                ${escapeHtml(e.message)}
                ${e.session_id ? `<div class="event-session">${e.session_id}${e.username ? ' · ' + e.username : ''}${e.vlan_id ? ' · VLAN ' + e.vlan_id : ''}</div>` : ''}
            </div>
        </div>
    `).join('');
}

async function handleConnect(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const authMethod = document.getElementById('auth-method').value;
    const serviceName = document.getElementById('service-name').value;
    const macAddress = document.getElementById('mac-address').value;

    const resultDiv = document.getElementById('connect-result');
    const resultContent = document.getElementById('connect-result-content');
    resultDiv.style.display = 'block';
    resultContent.innerHTML = '<p>正在发起 PPPoE 连接...</p>';

    const result = await apiCall('/connect', 'POST', {
        username,
        password,
        auth_method: authMethod,
        service_name: serviceName,
        mac_address: macAddress,
    });

    if (result.success) {
        const data = result.data;
        resultContent.innerHTML = `
            <div class="result-success">
                <strong>✅ 连接成功!</strong> ${data.message}
            </div>
            <div class="result-info">
                <p><strong>会话 ID:</strong> <code>${data.session_id}</code></p>
                <p><strong>用户名:</strong> ${escapeHtml(data.username)}</p>
                <p><strong>IP 地址:</strong> <code>${data.remote_ip}</code></p>
                <p><strong>VLAN:</strong> <span class="vlan-badge vlan-${Math.floor(data.vlan_id / 100) * 100}">${data.vlan_id}</span></p>
                <p><strong>认证方式:</strong> ${data.auth_result ? data.auth_result.method : authMethod}</p>
                <p><strong>认证耗时:</strong> ${data.auth_result ? data.auth_result.duration : '-'}</p>
            </div>
        `;
        showToast('连接成功!', 'success');
        document.getElementById('connect-form').reset();
        document.getElementById('service-name').value = 'INTERNET';
        loadAllData();
        switchTab('sessions');
    } else {
        resultContent.innerHTML = `
            <div class="result-error">
                <strong>❌ 连接失败:</strong> ${result.error}
            </div>
            ${result.data ? `
            <div class="result-info">
                ${result.data.auth_result ? `<p><strong>认证结果:</strong> ${result.data.auth_result.message}</p>` : ''}
                ${result.data.events ? `<p><strong>事件数:</strong> ${result.data.events.length}</p>` : ''}
            </div>
            ` : ''}
        `;
        showToast(result.error || '连接失败', 'error');
    }
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTime(timestamp, withSeconds = false) {
    if (!timestamp) return '-';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '-';
    
    const now = new Date();
    const diff = now - d;
    
    if (diff < 60000) {
        return Math.floor(diff / 1000) + ' 秒前';
    } else if (diff < 3600000) {
        return Math.floor(diff / 60000) + ' 分钟前';
    } else if (diff < 86400000) {
        return Math.floor(diff / 3600000) + ' 小时前';
    }
    
    return d.toLocaleString();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.className = `toast toast-${type} show`;
    toast.textContent = message;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
