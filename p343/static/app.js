let switch1Running = true;
let switch2Running = true;

async function fetchSwitches() {
    try {
        const response = await fetch('/api/switches');
        const data = await response.json();
        return data.switches;
    } catch (error) {
        console.error('Error fetching switches:', error);
        return null;
    }
}

async function fetchConsistency() {
    try {
        const response = await fetch('/api/consistency');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching consistency:', error);
        return null;
    }
}

function updateSwitchCard(switchNum, status) {
    const card = document.getElementById(`switch${switchNum}`);
    if (!card) return;

    const roleBadge = card.querySelector('.role-badge');
    const uptime = card.querySelector('.uptime');
    const peerStatus = card.querySelector('.peer-status');
    const peerRole = card.querySelector('.peer-role');
    const lastHb = card.querySelector('.last-hb');
    const failbackState = document.getElementById(`fb-state-${switchNum}`);
    const failbackRemaining = document.getElementById(`fb-remaining-${switchNum}`);
    const portsGrid = document.getElementById(`ports-${switchNum}`);
    const lacpList = document.getElementById(`lacp-${switchNum}`);
    const macTable = document.getElementById(`mac-table-${switchNum}`);
    const driftBadge = document.getElementById(`mac-drift-${switchNum}`);
    const blockedBadge = document.getElementById(`mac-blocked-${switchNum}`);

    card.classList.remove('master', 'backup', 'fault');

    if ((switchNum === 1 && !switch1Running) || (switchNum === 2 && !switch2Running)) {
        card.classList.add('fault');
        if (roleBadge) {
            roleBadge.textContent = 'FAULT';
            roleBadge.className = 'role-badge role-unknown';
        }
        return;
    }

    if (status.role === 'master') {
        card.classList.add('master');
        if (roleBadge) { roleBadge.textContent = 'MASTER'; roleBadge.className = 'role-badge role-master'; }
    } else if (status.role === 'backup') {
        card.classList.add('backup');
        if (roleBadge) { roleBadge.textContent = 'BACKUP'; roleBadge.className = 'role-badge role-backup'; }
    } else {
        if (roleBadge) { roleBadge.textContent = 'UNKNOWN'; roleBadge.className = 'role-badge role-unknown'; }
    }

    if (uptime) uptime.textContent = status.uptime;

    if (peerStatus) {
        if (status.peer_alive) {
            peerStatus.innerHTML = '<span class="status-dot alive"></span>在线';
        } else {
            peerStatus.innerHTML = '<span class="status-dot dead"></span>离线';
        }
    }

    if (peerRole) peerRole.textContent = (status.peer_role || 'unknown').toUpperCase();
    if (lastHb) lastHb.textContent = status.last_heartbeat;

    const fb = status.failback;
    if (failbackState && fb) {
        if (fb.state === 'waiting') {
            failbackState.textContent = '等待中';
            failbackState.className = 'value failback-active';
        } else if (fb.state === 'ready') {
            failbackState.textContent = '可回切';
            failbackState.className = 'value failback-ready';
        } else {
            failbackState.textContent = '无';
            failbackState.className = 'value';
        }
    }
    if (failbackRemaining && fb) {
        if (fb.state === 'waiting') {
            failbackRemaining.textContent = fb.remaining;
            failbackRemaining.className = 'value failback-active';
        } else if (fb.state === 'ready') {
            failbackRemaining.textContent = '0s';
            failbackRemaining.className = 'value failback-ready';
        } else {
            failbackRemaining.textContent = '-';
            failbackRemaining.className = 'value';
        }
    }

    if (portsGrid) {
        portsGrid.innerHTML = '';
        if (status.ports) {
            status.ports.forEach(port => {
                const portItem = document.createElement('div');
                portItem.className = 'port-item';
                portItem.innerHTML = `
                    <span class="port-name">${port.name}</span>
                    <span class="port-state ${port.state}">${port.state.toUpperCase()}</span>
                `;
                portsGrid.appendChild(portItem);
            });
        }
    }

    if (lacpList) {
        lacpList.innerHTML = '';
        if (status.lacp_states) {
            status.lacp_states.forEach(lacp => {
                const lacpItem = document.createElement('div');
                lacpItem.className = 'lacp-item';
                lacpItem.innerHTML = `
                    <div class="lacp-port">${lacp.port_id}</div>
                    <div class="lacp-details">
                        <span>状态: ${lacp.state}</span>
                        <span>Key: ${lacp.actor_key}</span>
                    </div>
                `;
                lacpList.appendChild(lacpItem);
            });
        }
    }

    if (driftBadge) driftBadge.textContent = `漂移: ${status.mac_drift_count || 0}`;
    if (blockedBadge) blockedBadge.textContent = `阻断: ${status.mac_blocked_count || 0}`;

    if (macTable) {
        macTable.innerHTML = '';
        if (status.mac_entries && status.mac_entries.length > 0) {
            status.mac_entries.forEach(entry => {
                const macItem = document.createElement('div');
                macItem.className = `mac-entry ${entry.state}`;
                macItem.innerHTML = `
                    <div>
                        <span class="mac-addr">${entry.mac_address}</span>
                        <span class="mac-encap">\u2192 ${entry.encap_mac}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="mac-port">${entry.port_id}</span>
                        <span class="mac-state ${entry.state}">${entry.state === 'normal' ? '正常' : entry.state === 'drift' ? '漂移' : '阻断'}</span>
                    </div>
                `;
                macTable.appendChild(macItem);
            });
        } else {
            macTable.innerHTML = '<div style="color:#555;font-size:0.8rem;padding:8px;">暂无MAC条目</div>';
        }
    }

    const hbCountEl = document.getElementById('hb-count');
    if (hbCountEl && status.heartbeat_count) {
        hbCountEl.textContent = `记录: ${status.heartbeat_count}`;
    }
}

function updateConsistencyPanel(data) {
    const overallEl = document.getElementById('consistency-overall');
    const timeEl = document.getElementById('consistency-time');
    const gridEl = document.getElementById('consistency-grid');

    if (!data || !data.sw1) {
        if (overallEl) {
            overallEl.textContent = '等待数据...';
            overallEl.className = 'consistency-status';
        }
        return;
    }

    const report = data.sw1;
    if (overallEl) {
        overallEl.textContent = report.overall_status === 'ok' ? '完全一致' : report.overall_status === 'mismatch' ? '发现差异' : '错误';
        overallEl.className = `consistency-status ${report.overall_status}`;
    }
    if (timeEl && report.checked_at) {
        const time = new Date(report.checked_at);
        timeEl.textContent = time.toLocaleTimeString();
    }

    if (gridEl && report.items) {
        gridEl.innerHTML = '';
        report.items.forEach(item => {
            const div = document.createElement('div');
            div.className = `consistency-item ${item.status}`;
            const localClass = item.status === 'mismatch' ? 'value-diff' : '';
            const peerClass = item.status === 'mismatch' ? 'value-diff' : '';
            div.innerHTML = `
                <div class="consistency-category">${item.category}</div>
                <div class="consistency-values">
                    <span>SW1: <span class="${localClass}">${item.local_value}</span></span>
                    <span>SW2: <span class="${peerClass}">${item.peer_value}</span></span>
                </div>
                <div class="consistency-desc">${item.description}</div>
            `;
            gridEl.appendChild(div);
        });
    }
}

function updateHeartbeatIndicator(switches) {
    const hbText = document.querySelector('.hb-text');
    const hbDot = document.querySelector('.hb-dot');
    if (!hbText || !hbDot) return;

    if (switches[0].peer_alive && switches[1].peer_alive) {
        hbText.textContent = '心跳正常';
        hbText.style.color = '#00ff88';
        hbDot.style.background = '#00ff88';
    } else {
        hbText.textContent = '心跳异常';
        hbText.style.color = '#ff4444';
        hbDot.style.background = '#ff4444';
    }
}

function exportHeartbeat(format, switchID) {
    const url = `/api/heartbeat/export/${format}/${switchID}`;
    window.open(url, '_blank');
}

async function updateUI() {
    const switches = await fetchSwitches();
    if (switches && switches.length >= 2) {
        updateSwitchCard(1, switches[0]);
        updateSwitchCard(2, switches[1]);
        updateHeartbeatIndicator(switches);
    }

    const consistency = await fetchConsistency();
    updateConsistencyPanel(consistency);
}

function simulateFault(switchNum) {
    if (switchNum === 1) {
        switch1Running = !switch1Running;
        const btn = document.getElementById('toggleSwitch1');
        if (switch1Running) {
            btn.textContent = '模拟 Switch-A 故障';
            btn.className = 'btn btn-danger';
        } else {
            btn.textContent = '恢复 Switch-A';
            btn.className = 'btn btn-success';
        }
    } else {
        switch2Running = !switch2Running;
        const btn = document.getElementById('toggleSwitch2');
        if (switch2Running) {
            btn.textContent = '模拟 Switch-B 故障';
            btn.className = 'btn btn-danger';
        } else {
            btn.textContent = '恢复 Switch-B';
            btn.className = 'btn btn-success';
        }
    }
}

function resetState() {
    switch1Running = true;
    switch2Running = true;

    document.getElementById('toggleSwitch1').textContent = '模拟 Switch-A 故障';
    document.getElementById('toggleSwitch1').className = 'btn btn-danger';
    document.getElementById('toggleSwitch2').textContent = '模拟 Switch-B 故障';
    document.getElementById('toggleSwitch2').className = 'btn btn-danger';
}

document.getElementById('toggleSwitch1').addEventListener('click', () => simulateFault(1));
document.getElementById('toggleSwitch2').addEventListener('click', () => simulateFault(2));
document.getElementById('resetBtn').addEventListener('click', resetState);

updateUI();
setInterval(updateUI, 1000);
