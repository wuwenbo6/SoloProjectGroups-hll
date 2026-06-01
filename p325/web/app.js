let ws = null;
let currentStatus = null;
let lastEventCount = 0;
let lastBufferEventCount = 0;

const statusText = document.getElementById('statusText');
const statusBadge = document.getElementById('statusBadge');
const endpointAIps = document.getElementById('endpointAIps');
const endpointBIps = document.getElementById('endpointBIps');
const pathsContainer = document.getElementById('pathsContainer');
const pathsStatus = document.getElementById('pathsStatus');
const eventsTableBody = document.getElementById('eventsTableBody');
const eventCount = document.getElementById('eventCount');
const lastSwitchTime = document.getElementById('lastSwitchTime');
const avgSwitchTime = document.getElementById('avgSwitchTime');
const heartbeatInterval = document.getElementById('heartbeatInterval');
const maxMissed = document.getElementById('maxMissed');
const simSourceIP = document.getElementById('simSourceIP');
const simDestIP = document.getElementById('simDestIP');
const simEndpoint = document.getElementById('simEndpoint');
const pathVerifiedStatus = document.getElementById('pathVerifiedStatus');
const bufferQueueSize = document.getElementById('bufferQueueSize');
const bufferEventsTableBody = document.getElementById('bufferEventsTableBody');
const bufferEventCount = document.getElementById('bufferEventCount');
const sendEndpoint = document.getElementById('sendEndpoint');
const dataContent = document.getElementById('dataContent');
const priorityEndpoint = document.getElementById('priorityEndpoint');
const prioritySourceIP = document.getElementById('prioritySourceIP');
const priorityDestIP = document.getElementById('priorityDestIP');
const priorityValue = document.getElementById('priorityValue');
const totalSwitches = document.getElementById('totalSwitches');
const avgSwitchTimeMs = document.getElementById('avgSwitchTimeMs');
const medianSwitchTime = document.getElementById('medianSwitchTime');
const p95SwitchTime = document.getElementById('p95SwitchTime');
const p99SwitchTime = document.getElementById('p99SwitchTime');
const minSwitchTime = document.getElementById('minSwitchTime');
const maxSwitchTime = document.getElementById('maxSwitchTime');
const failureReasons = document.getElementById('failureReasons');

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        updateUI(data);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, retrying...');
        setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function updateUI(status) {
    currentStatus = status;
    
    updateStatusBadge(status.is_running);
    
    heartbeatInterval.textContent = formatDuration(status.endpoint_a.heartbeat_interval);
    maxMissed.textContent = status.endpoint_a.max_missed_heartbeats;
    
    updateEndpointIPs(endpointAIps, status.endpoint_a);
    updateEndpointIPs(endpointBIps, status.endpoint_b);
    
    updateIPSelectors(status);
    
    updateTopology(status.endpoint_a);
    updatePathsStatus(status.endpoint_a);
    updateEvents(status.all_events);
    updateBufferStatus(status.endpoint_a);
    updateBufferEvents(status.endpoint_a.buffer_events);
    
    refreshStats();
}

function updateBufferStatus(endpoint) {
    const isVerified = endpoint.is_path_verified;
    if (isVerified) {
        pathVerifiedStatus.innerHTML = '<span class="verified-badge verified">已验证 ✓</span>';
    } else {
        pathVerifiedStatus.innerHTML = '<span class="verified-badge pending">等待验证...</span>';
    }
    bufferQueueSize.textContent = endpoint.buffer_queue_size;
}

function updateBufferEvents(events) {
    bufferEventCount.textContent = events.length;
    
    const isNewEvent = events.length > lastBufferEventCount;
    lastBufferEventCount = events.length;
    
    const eventTypeNames = {
        'send': '发送',
        'buffer': '缓存',
        'flush': '发送缓存',
        'path_switch': '路径切换',
        'path_verified': '路径验证',
        'flush_complete': '缓存发送完成',
        'ack': 'ACK确认',
        'buffer_overflow': '缓存溢出'
    };
    
    bufferEventsTableBody.innerHTML = events.slice().reverse().map((event, idx) => {
        const time = new Date(event.timestamp);
        const timeStr = time.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + 
                        String(time.getMilliseconds()).padStart(3, '0');
        
        const isNew = isNewEvent && idx === 0;
        const typeName = eventTypeNames[event.type] || event.type;
        
        return `
            <tr class="${isNew ? 'new-row' : ''}">
                <td><strong>#${event.id}</strong></td>
                <td class="time-cell">${timeStr}</td>
                <td><span class="event-type-badge event-type-${event.type}">${typeName}</span></td>
                <td>${event.data_seq_num > 0 ? '#' + event.data_seq_num : '-'}</td>
                <td class="path-cell" style="font-size: 11px;">${event.path_id || '-'}</td>
                <td class="reason-cell">${event.message}</td>
            </tr>
        `;
    }).join('');
}

function updateStatusBadge(isRunning) {
    if (isRunning) {
        statusBadge.className = 'status-badge running';
        statusText.textContent = '运行中';
    } else {
        statusBadge.className = 'status-badge stopped';
        statusText.textContent = '已停止';
    }
}

function formatDuration(ms) {
    if (ms >= 1000) {
        return (ms / 1000).toFixed(1) + 's';
    }
    return ms + 'ms';
}

function updateEndpointIPs(container, endpoint) {
    const ips = [...new Set(endpoint.paths.map(p => p.source_ip))];
    container.innerHTML = ips.map(ip => 
        `<div class="ip-item">${ip}</div>`
    ).join('');
}

function updateIPSelectors(status) {
    const simEndpt = simEndpoint.value === 'A' ? status.endpoint_a : status.endpoint_b;
    const priEndpt = priorityEndpoint.value === 'A' ? status.endpoint_a : status.endpoint_b;
    
    const simSourceIPs = [...new Set(simEndpt.paths.map(p => p.source_ip))];
    const simDestIPs = [...new Set(simEndpt.paths.map(p => p.dest_ip))];
    const priSourceIPs = [...new Set(priEndpt.paths.map(p => p.source_ip))];
    const priDestIPs = [...new Set(priEndpt.paths.map(p => p.dest_ip))];
    
    const currentSimSource = simSourceIP.value;
    const currentSimDest = simDestIP.value;
    const currentPriSource = prioritySourceIP.value;
    const currentPriDest = priorityDestIP.value;
    
    simSourceIP.innerHTML = simSourceIPs.map(ip => 
        `<option value="${ip}">${ip}</option>`
    ).join('');
    
    simDestIP.innerHTML = simDestIPs.map(ip => 
        `<option value="${ip}">${ip}</option>`
    ).join('');
    
    prioritySourceIP.innerHTML = priSourceIPs.map(ip => 
        `<option value="${ip}">${ip}</option>`
    ).join('');
    
    priorityDestIP.innerHTML = priDestIPs.map(ip => 
        `<option value="${ip}">${ip}</option>`
    ).join('');
    
    if (currentSimSource) simSourceIP.value = currentSimSource;
    if (currentSimDest) simDestIP.value = currentSimDest;
    if (currentPriSource) prioritySourceIP.value = currentPriSource;
    if (currentPriDest) priorityDestIP.value = currentPriDest;
}

function updateTopology(endpoint) {
    pathsContainer.innerHTML = '';
    
    const pathCount = endpoint.paths.length;
    const spacing = 200 / (pathCount + 1);
    
    endpoint.paths.forEach((path, index) => {
        const yPos = spacing * (index + 1);
        
        const line = document.createElement('div');
        line.className = `path-line ${path.status}`;
        line.style.top = `${yPos}px`;
        
        const label = document.createElement('div');
        label.className = `path-label ${path.status}`;
        label.style.top = `${yPos - 25}px`;
        
        let labelText = `${path.source_ip} → ${path.dest_ip}`;
        if (path.is_primary) {
            labelText += '<span class="primary-badge">主路径</span>';
        }
        if (path.id === endpoint.active_path_id) {
            labelText += ' <strong>✓ 当前</strong>';
        }
        label.innerHTML = labelText;
        
        pathsContainer.appendChild(line);
        pathsContainer.appendChild(label);
    });
}

function updatePathsStatus(endpoint) {
    pathsStatus.innerHTML = endpoint.paths.map(path => {
        const isActive = path.id === endpoint.active_path_id;
        const statusText = {
            'active': '活跃',
            'standby': '备用',
            'failed': '故障'
        }[path.status] || path.status;
        
        const lastHeartbeat = new Date(path.last_heartbeat);
        const timeAgo = getTimeAgo(lastHeartbeat);
        
        return `
            <div class="path-card ${path.status} ${isActive ? 'active' : ''}">
                <div class="path-card-header">
                    <span class="path-card-title">${path.source_ip} → ${path.dest_ip}</span>
                    <span class="path-card-priority" title="优先级">#${path.priority}</span>
                </div>
                <span class="path-card-status ${path.status}">
                    ${isActive ? '● ' : ''}${statusText}
                    ${path.is_primary ? ' (主)' : ''}
                </span>
                <div class="path-card-stats">
                    <div><span>RTT</span><strong>${path.rtt_ms} ms</strong></div>
                    <div><span>错过心跳</span><strong>${path.heartbeat_missed}</strong></div>
                    <div><span>最后心跳</span><strong>${timeAgo}</strong></div>
                    <div><span>状态</span><strong>${isActive ? '当前路径' : '-'}</strong></div>
                </div>
                <div class="path-card-actions">
                    <button class="path-card-btn path-card-btn-primary" 
                            onclick="setPrimaryPath('${endpointId}', '${path.source_ip}', '${path.dest_ip}')">
                        设为主路径
                    </button>
                    <button class="path-card-btn path-card-btn-warning"
                            onclick="promptSetPriority('${endpointId}', '${path.source_ip}', '${path.dest_ip}', ${path.priority})">
                        修改优先级
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 1) return '刚刚';
    if (seconds < 60) return `${seconds}秒前`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
    return `${Math.floor(seconds / 3600)}小时前`;
}

function updateEvents(events) {
    eventCount.textContent = events.length;
    
    if (events.length > 0) {
        const lastEvent = events[events.length - 1];
        lastSwitchTime.textContent = `${lastEvent.switch_time_ms} ms`;
        
        const avgTime = events.reduce((sum, e) => sum + e.switch_time_ms, 0) / events.length;
        avgSwitchTime.textContent = `${avgTime.toFixed(1)} ms`;
    } else {
        lastSwitchTime.textContent = '-- ms';
        avgSwitchTime.textContent = '-- ms';
    }
    
    const isNewEvent = events.length > lastEventCount;
    lastEventCount = events.length;
    
    eventsTableBody.innerHTML = events.slice().reverse().map((event, idx) => {
        const time = new Date(event.timestamp);
        const timeStr = time.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + 
                        String(time.getMilliseconds()).padStart(3, '0');
        
        const isNew = isNewEvent && idx === 0;
        
        return `
            <tr class="${isNew ? 'new-row' : ''}">
                <td><strong>#${event.id}</strong></td>
                <td class="time-cell">${timeStr}</td>
                <td class="path-cell">${event.from_source_ip}<br>↓<br>${event.from_dest_ip}</td>
                <td class="path-cell">${event.to_source_ip}<br>↓<br>${event.to_dest_ip}</td>
                <td class="duration-cell">${event.switch_time_ms} ms</td>
                <td class="reason-cell">${event.reason}</td>
            </tr>
        `;
    }).join('');
}

async function apiCall(url, method, body) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    return response.json();
}

document.getElementById('startBtn').addEventListener('click', async () => {
    await apiCall('/api/start', 'POST');
});

document.getElementById('stopBtn').addEventListener('click', async () => {
    await apiCall('/api/stop', 'POST');
});

document.getElementById('resetBtn').addEventListener('click', async () => {
    if (confirm('确定要重置模拟器吗？所有历史记录将被清除。')) {
        await apiCall('/api/reset', 'POST');
        lastEventCount = 0;
        lastBufferEventCount = 0;
    }
});

document.getElementById('simFailureBtn').addEventListener('click', async () => {
    await apiCall('/api/simulate/failure', 'POST', {
        endpoint_id: simEndpoint.value,
        source_ip: simSourceIP.value,
        dest_ip: simDestIP.value
    });
});

document.getElementById('simRecoveryBtn').addEventListener('click', async () => {
    await apiCall('/api/simulate/recovery', 'POST', {
        endpoint_id: simEndpoint.value,
        source_ip: simSourceIP.value,
        dest_ip: simDestIP.value
    });
});

document.getElementById('sendDataBtn').addEventListener('click', async () => {
    const content = dataContent.value.trim();
    if (!content) {
        alert('请输入要发送的数据');
        return;
    }
    await apiCall('/api/data/send', 'POST', {
        endpoint_id: sendEndpoint.value,
        content: content
    });
});

document.getElementById('sendMultiBtn').addEventListener('click', async () => {
    const content = dataContent.value.trim() || '批量测试数据';
    for (let i = 1; i <= 5; i++) {
        await apiCall('/api/data/send', 'POST', {
            endpoint_id: sendEndpoint.value,
            content: `${content} #${i}`
        });
        await new Promise(resolve => setTimeout(resolve, 100));
    }
});

simEndpoint.addEventListener('change', () => {
    if (currentStatus) {
        updateIPSelectors(currentStatus);
    }
});

priorityEndpoint.addEventListener('change', () => {
    if (currentStatus) {
        updateIPSelectors(currentStatus);
    }
});

document.getElementById('setPrimaryBtn').addEventListener('click', async () => {
    const success = await apiCall('/api/path/primary', 'POST', {
        endpoint_id: priorityEndpoint.value,
        source_ip: prioritySourceIP.value,
        dest_ip: priorityDestIP.value
    });
    if (success && success.success) {
        alert('已设置为主路径');
    } else {
        alert('设置失败，请检查路径是否可用');
    }
});

document.getElementById('setPriorityBtn').addEventListener('click', async () => {
    const priority = parseInt(priorityValue.value);
    if (isNaN(priority) || priority < 1) {
        alert('请输入有效的优先级（>= 1）');
        return;
    }
    const success = await apiCall('/api/path/priority', 'POST', {
        endpoint_id: priorityEndpoint.value,
        source_ip: prioritySourceIP.value,
        dest_ip: priorityDestIP.value,
        priority: priority
    });
    if (success && success.success) {
        alert('优先级已更新');
    } else {
        alert('设置失败');
    }
});

document.getElementById('refreshStatsBtn').addEventListener('click', refreshStats);

document.getElementById('exportStatsBtn').addEventListener('click', () => {
    window.location.href = '/api/stats/export';
});

document.getElementById('exportEventsBtn').addEventListener('click', () => {
    window.location.href = '/api/events/export';
});

async function refreshStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        updateStatsDisplay(stats);
    } catch (error) {
        console.error('获取统计数据失败:', error);
    }
}

function updateStatsDisplay(stats) {
    const combined = stats.combined;
    if (combined.total_switches > 0) {
        totalSwitches.textContent = combined.total_switches;
        avgSwitchTimeMs.textContent = combined.avg_switch_time_ms.toFixed(2);
        medianSwitchTime.textContent = combined.median_switch_time_ms.toFixed(2);
        p95SwitchTime.textContent = combined.p95_switch_time_ms.toFixed(2);
        p99SwitchTime.textContent = combined.p99_switch_time_ms.toFixed(2);
        minSwitchTime.textContent = combined.min_switch_time_ms;
        maxSwitchTime.textContent = combined.max_switch_time_ms;

        const reasonsHtml = Object.entries(combined.failures_by_reason || {})
            .map(([reason, count]) => `
                <div class="failure-reason-item">
                    <span class="failure-reason-name">${reason}</span>
                    <span class="failure-reason-count">${count}</span>
                </div>
            `).join('');
        failureReasons.innerHTML = reasonsHtml || '<div style="color: #9ca3af; grid-column: 1/-1;">暂无数据</div>';
    } else {
        totalSwitches.textContent = '0';
        avgSwitchTimeMs.textContent = '--';
        medianSwitchTime.textContent = '--';
        p95SwitchTime.textContent = '--';
        p99SwitchTime.textContent = '--';
        minSwitchTime.textContent = '--';
        maxSwitchTime.textContent = '--';
        failureReasons.innerHTML = '<div style="color: #9ca3af; grid-column: 1/-1;">暂无数据</div>';
    }
}

async function setPrimaryPath(endpointId, sourceIp, destIp) {
    const success = await apiCall('/api/path/primary', 'POST', {
        endpoint_id: endpointId,
        source_ip: sourceIp,
        dest_ip: destIp
    });
    if (!success || !success.success) {
        alert('设置失败，请检查路径是否可用');
    }
}

function promptSetPriority(endpointId, sourceIp, destIp, currentPriority) {
    const newPriority = prompt(`请输入新的优先级（当前: ${currentPriority}）:`, currentPriority);
    if (newPriority === null) return;
    
    const priority = parseInt(newPriority);
    if (isNaN(priority) || priority < 1) {
        alert('请输入有效的优先级（>= 1）');
        return;
    }
    
    apiCall('/api/path/priority', 'POST', {
        endpoint_id: endpointId,
        source_ip: sourceIp,
        dest_ip: destIp,
        priority: priority
    });
}

connectWebSocket();
setInterval(refreshStats, 5000);
