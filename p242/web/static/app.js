let currentData = null;
let logs = [];
let selectedReplica = null;
let modalAction = null;

function addLog(type, message) {
    const time = new Date().toLocaleTimeString();
    logs.unshift({ time, type, message });
    if (logs.length > 50) logs.pop();
    renderLogs();
}

function renderLogs() {
    const container = document.getElementById('logsContainer');
    container.innerHTML = logs.map(log => `
        <div class="log-entry">
            <span class="log-time">${log.time}</span>
            <span class="log-type ${log.type}">[${log.type}]</span>
            <span class="log-message">${log.message}</span>
        </div>
    `).join('');
}

function fetchStatus() {
    Promise.all([
        fetch('/api/status').then(r => r.json()),
        fetch('http://127.0.0.1:8084/api/listener/stats').then(r => r.json()),
        fetch('http://127.0.0.1:8084/api/replicas/readonly').then(r => r.json()),
        fetch('/api/failover/history').then(r => r.json())
    ])
    .then(([statusData, statsData, readonlyData, historyData]) => {
        currentData = statusData;
        updateUI(statusData, statsData, readonlyData);
        updateSyncStatus(statusData);
        updateFailoverHistory(historyData);
        document.getElementById('lastUpdate').textContent = new Date().toLocaleString();
    })
    .catch(err => {
        console.error('Failed to fetch status:', err);
        fetch('/api/status')
            .then(res => res.json())
            .then(data => {
                currentData = data;
                updateUI(data, null, null);
                updateSyncStatus(data);
                document.getElementById('lastUpdate').textContent = new Date().toLocaleString();
            })
            .catch(e => {
                addLog('ERROR', '获取状态失败: ' + e.message);
            });
    });
}

function updateSyncStatus(data) {
    const syncStatusEl = document.getElementById('syncStatus');
    const suspendBtn = document.getElementById('suspendBtn');
    const resumeBtn = document.getElementById('resumeBtn');

    if (data.sync_suspended) {
        syncStatusEl.innerHTML = '同步状态: <span class="badge badge-warning">已暂停</span>';
        suspendBtn.disabled = true;
        suspendBtn.style.opacity = '0.5';
        resumeBtn.disabled = false;
        resumeBtn.style.opacity = '1';
    } else {
        syncStatusEl.innerHTML = '同步状态: <span class="badge badge-success">运行中</span>';
        suspendBtn.disabled = false;
        suspendBtn.style.opacity = '1';
        resumeBtn.disabled = true;
        resumeBtn.style.opacity = '0.5';
    }
}

function updateFailoverHistory(historyData) {
    const container = document.getElementById('historyContainer');
    if (!historyData || !historyData.success || !historyData.data || historyData.data.length === 0) {
        container.innerHTML = '<div class="history-empty">暂无故障转移记录</div>';
        return;
    }

    container.innerHTML = historyData.data.map(record => {
        const time = new Date(record.timestamp).toLocaleString();
        const manualClass = record.manual ? 'manual' : '';
        return `
            <div class="history-item ${manualClass}">
                <div class="history-header">
                    <span class="history-id">#${record.id} ${record.manual ? '(手动)' : '(自动)'}</span>
                    <span class="history-time">${time}</span>
                </div>
                <div class="history-detail">
                    ${record.old_primary || '无' } → ${record.new_primary}
                    <span class="history-reason">${record.reason}</span>
                </div>
            </div>
        `;
    }).join('');
}

function updateUI(data, statsData, readonlyData) {
    document.getElementById('healthText').textContent = data.overall_health;
    const healthDot = document.getElementById('healthDot');
    healthDot.className = 'health-dot ' + data.overall_health.toLowerCase();

    document.getElementById('currentPrimary').textContent = data.primary_replica;
    document.getElementById('failoverCount').textContent = data.failover_count;

    if (readonlyData && readonlyData.success && readonlyData.data) {
        document.getElementById('readOnlyReplica').textContent = readonlyData.data.name;
    }

    if (statsData && statsData.success && statsData.data) {
        const stats = statsData.data;
        document.getElementById('connStats').textContent = `RW: ${stats.readwrite_connections}, RO: ${stats.readonly_connections}`;
        document.getElementById('ttlValue').textContent = `${stats.ttl_seconds}s`;
    }

    renderReplicas(data);
    detectChanges(data);
}

function renderReplicas(data) {
    const grid = document.getElementById('replicasGrid');
    const maxLSN = Math.max(...data.replicas.map(r => r.lsn), 1);

    grid.innerHTML = data.replicas.map(replica => {
        const isPrimary = replica.role === 'PRIMARY';
        const isFailed = !replica.is_connected;
        const lsnPercent = (replica.lsn / maxLSN) * 100;
        const syncStateClass = replica.sync_state.toLowerCase().replace(/_/g, '_');

        return `
            <div class="replica-card ${isPrimary ? 'primary' : ''} ${isFailed ? 'failed' : ''}">
                <div class="replica-header">
                    <span class="replica-name">${replica.name}</span>
                    <span class="role-badge ${isPrimary ? 'primary' : 'secondary'}">${replica.role}</span>
                </div>
                <div class="replica-info">
                    <div class="info-row">
                        <span class="info-label">地址</span>
                        <span class="info-value">${replica.host}:${replica.port}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">可用模式</span>
                        <span class="mode-badge">${replica.availability_mode}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">同步状态</span>
                        <span class="sync-state ${syncStateClass}">${replica.sync_state}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">健康状态</span>
                        <span class="sync-health ${replica.sync_health}">${replica.sync_health}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">连接状态</span>
                        <span class="connection-status">
                            <span class="connection-dot ${replica.is_connected ? 'connected' : 'disconnected'}"></span>
                            <span>${replica.is_connected ? '已连接' : '已断开'}</span>
                        </span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">LSN</span>
                        <span class="info-value">${replica.lsn}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">同步进度</span>
                        <span class="info-value">${lsnPercent.toFixed(1)}%</span>
                    </div>
                    <div class="lsn-bar">
                        <div class="lsn-progress" style="width: ${lsnPercent}%"></div>
                    </div>
                    <div class="info-row">
                        <span class="info-label">最后同步</span>
                        <span class="info-value" style="font-size: 0.8rem;">${new Date(replica.last_sync_time).toLocaleTimeString()}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function detectChanges(data) {
    if (!currentData) return;

    if (currentData.primary_replica !== data.primary_replica) {
        addLog('FAILOVER', `故障转移: ${currentData.primary_replica} -> ${data.primary_replica}`);
    }

    data.replicas.forEach(replica => {
        const oldReplica = currentData.replicas.find(r => r.name === replica.name);
        if (oldReplica) {
            if (oldReplica.is_connected !== replica.is_connected) {
                addLog('INFO', `副本 ${replica.name} 连接状态: ${oldReplica.is_connected} -> ${replica.is_connected}`);
            }
            if (oldReplica.sync_state !== replica.sync_state) {
                addLog('SYNC', `副本 ${replica.name} 同步状态: ${oldReplica.sync_state} -> ${replica.sync_state}`);
            }
        }
    });
}

function testListener() {
    addLog('INFO', '开始测试读写监听器转发...');
    fetch('http://127.0.0.1:8080/')
        .then(res => {
            const headers = {};
            res.headers.forEach((v, k) => headers[k] = v);
            return res.json().then(data => ({ data, headers, status: res.status }));
        })
        .then(result => {
            const testDiv = document.getElementById('listenerTest');
            const resultDiv = document.getElementById('listenerResult');
            testDiv.style.display = 'block';
            resultDiv.textContent = JSON.stringify({
                type: 'READWRITE (Default)',
                status: result.status,
                headers: result.headers,
                body: result.data
            }, null, 2);
            const target = result.headers['x-target-replica'] || result.headers['x-primary-replica'] || 'unknown';
            addLog('ROUTING', `读写请求转发到: ${target}`);
        })
        .catch(err => {
            addLog('ERROR', '监听器测试失败: ' + err.message);
            const testDiv = document.getElementById('listenerTest');
            const resultDiv = document.getElementById('listenerResult');
            testDiv.style.display = 'block';
            resultDiv.textContent = 'Error: ' + err.message;
        });
}

function testReadOnlyListener() {
    addLog('INFO', '开始测试只读监听器转发...');
    fetch('http://127.0.0.1:8080/?application_intent=ReadOnly')
        .then(res => {
            const headers = {};
            res.headers.forEach((v, k) => headers[k] = v);
            return res.json().then(data => ({ data, headers, status: res.status }));
        })
        .then(result => {
            const testDiv = document.getElementById('listenerTest');
            const resultDiv = document.getElementById('listenerResult');
            testDiv.style.display = 'block';
            resultDiv.textContent = JSON.stringify({
                type: 'READONLY (ApplicationIntent=ReadOnly)',
                status: result.status,
                headers: result.headers,
                body: result.data
            }, null, 2);
            const target = result.headers['x-target-replica'] || result.headers['x-primary-replica'] || 'unknown';
            addLog('ROUTING', `只读请求转发到: ${target}`);
        })
        .catch(err => {
            addLog('ERROR', '只读监听器测试失败: ' + err.message);
            const testDiv = document.getElementById('listenerTest');
            const resultDiv = document.getElementById('listenerResult');
            testDiv.style.display = 'block';
            resultDiv.textContent = 'Error: ' + err.message;
        });
}

function showModal(title, action) {
    modalAction = action;
    selectedReplica = null;
    document.getElementById('modalTitle').textContent = title;

    const body = document.getElementById('modalBody');
    const secondaryReplicas = currentData.replicas.filter(r =>
        action === 'failover' ? r.role === 'SECONDARY' && r.is_connected : true
    );

    body.innerHTML = `
        <div class="replica-select">
            ${secondaryReplicas.map(r => `
                <div class="replica-option" data-name="${r.name}" onclick="selectReplica(this, '${r.name}')">
                    <strong>${r.name}</strong> (${r.host}:${r.port}) - ${r.role}
                </div>
            `).join('')}
        </div>
    `;

    document.getElementById('modal').style.display = 'flex';
    document.getElementById('modalConfirm').onclick = executeAction;
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
    selectedReplica = null;
    modalAction = null;
}

function selectReplica(el, name) {
    document.querySelectorAll('.replica-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    selectedReplica = name;
}

function executeAction() {
    if (!selectedReplica) {
        alert('请选择一个副本');
        return;
    }

    let url = '';
    let method = 'POST';

    switch (modalAction) {
        case 'failover':
            url = `http://127.0.0.1:8084/api/failover/${selectedReplica}`;
            addLog('INFO', `执行手动故障转移到 ${selectedReplica}...`);
            break;
        case 'failure':
            url = `http://127.0.0.1:8084/api/replica/${selectedReplica}/fail`;
            addLog('INFO', `模拟副本 ${selectedReplica} 故障...`);
            break;
        case 'recovery':
            url = `http://127.0.0.1:8084/api/replica/${selectedReplica}/recover`;
            addLog('INFO', `模拟副本 ${selectedReplica} 恢复...`);
            break;
    }

    fetch(url, { method })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                addLog('INFO', data.message);
            } else {
                addLog('ERROR', data.error);
            }
            closeModal();
            setTimeout(fetchStatus, 500);
        })
        .catch(err => {
            addLog('ERROR', '操作失败: ' + err.message);
            closeModal();
        });
}

function manualFailover() {
    if (!currentData) return;
    showModal('选择故障转移目标副本', 'failover');
}

function simulateFailure() {
    if (!currentData) return;
    showModal('选择要模拟故障的副本', 'failure');
}

function simulateRecovery() {
    if (!currentData) return;
    showModal('选择要模拟恢复的副本', 'recovery');
}

function suspendSync() {
    const reason = prompt('请输入暂停原因（可选）：', '维护操作');
    if (reason === null) return;

    fetch('/api/sync/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'manual' })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                addLog('INFO', '数据同步已暂停');
            } else {
                addLog('ERROR', data.error);
            }
            setTimeout(fetchStatus, 500);
        })
        .catch(err => {
            addLog('ERROR', '暂停同步失败: ' + err.message);
        });
}

function resumeSync() {
    fetch('/api/sync/resume', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                addLog('INFO', '数据同步已恢复');
            } else {
                addLog('ERROR', data.error);
            }
            setTimeout(fetchStatus, 500);
        })
        .catch(err => {
            addLog('ERROR', '恢复同步失败: ' + err.message);
        });
}

function exportHistory(format) {
    const url = `/api/failover/history/export?format=${format}`;
    window.open(url, '_blank');
    addLog('INFO', `正在导出故障转移历史 (${format.toUpperCase()}格式)`);
}

document.addEventListener('DOMContentLoaded', () => {
    addLog('INFO', 'AG 模拟器控制面板已启动');
    fetchStatus();
    setInterval(fetchStatus, 2000);
});
