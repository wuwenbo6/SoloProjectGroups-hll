let ports = {};
let links = [];
let vfidTable = {};
let sessions = {};
let selectedLink = null;
let selectedSession = null;
let ws = null;
const DEFAULT_VFID_TTL = 30;
let vfidRefreshInterval = null;

function init() {
    refreshPorts();
    refreshVLANS();
    refreshLinks();
    refreshVFID();
    refreshSessions();
    refreshEvents();
    connectWebSocket();
    startVFIDPolling();
}

function startVFIDPolling() {
    vfidRefreshInterval = setInterval(() => {
        refreshVFID();
        refreshPorts();
        refreshLinks();
        refreshSessions();
    }, 1000);
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        addEvent(data);
        refreshPorts();
        refreshLinks();
        refreshVFID();
        if (data.Type === 'SESSION_CREATED' || data.Type === 'VFID_EXPIRED') {
            refreshSessions();
        }
    };

    ws.onclose = function() {
        setTimeout(connectWebSocket, 3000);
    };
}

async function refreshPorts() {
    try {
        const response = await fetch('/api/ports');
        ports = await response.json();
        renderPorts();
        updatePortSelects();
    } catch (error) {
        console.error('Failed to fetch ports:', error);
    }
}

async function refreshVLANS() {
    try {
        const response = await fetch('/api/vlans');
        const vlans = await response.json();
        renderVLANS(vlans);
        updateVLANSelect(vlans);
    } catch (error) {
        console.error('Failed to fetch vlans:', error);
    }
}

async function refreshLinks() {
    try {
        const response = await fetch('/api/links');
        links = await response.json();
        renderLinks();
    } catch (error) {
        console.error('Failed to fetch links:', error);
    }
}

async function refreshVFID() {
    try {
        const response = await fetch('/api/vfid');
        vfidTable = await response.json();
        renderVFID();
    } catch (error) {
        console.error('Failed to fetch VFID:', error);
    }
}

async function refreshSessions() {
    try {
        const response = await fetch('/api/sessions');
        sessions = await response.json();
        renderSessions();
    } catch (error) {
        console.error('Failed to fetch sessions:', error);
    }
}

async function refreshEvents() {
    try {
        const response = await fetch('/api/events');
        const events = await response.json();
        const eventLog = document.getElementById('event-log');
        eventLog.innerHTML = '';
        events.forEach(event => addEvent(event, false));
    } catch (error) {
        console.error('Failed to fetch events:', error);
    }
}

function renderPorts() {
    const container = document.getElementById('ports-list');
    container.innerHTML = '';

    const primaryId = findPrimaryPort();

    Object.values(ports).forEach(port => {
        const portEl = document.createElement('div');
        const isPrimary = port.ID === primaryId;
        const isExpired = port.State === 'VFID_EXPIRED';
        
        let classes = 'port-item';
        if (isPrimary) classes += ' primary';
        if (isExpired) classes += ' expired';
        portEl.className = classes;

        const vlanTags = port.VLANs && port.VLANs.length > 0 
            ? port.VLANs.map(v => `<span class="vlan-tag">VLAN ${v}</span>`).join('')
            : '<span style="color:#666;font-size:0.85rem;">未发现VLAN</span>';

        const crown = isPrimary ? '<span class="primary-crown">★ PRIMARY</span>' : '';

        portEl.innerHTML = `
            <div class="port-name">${port.Name} ${crown}</div>
            <div class="port-mac">MAC: ${port.MAC}</div>
            <div class="port-fpma">FPMA: ${port.FPMA}</div>
            <div class="port-mac">WWPN: ${port.WWPN}</div>
            <span class="port-priority">Priority: ${port.Priority}</span>
            <span class="port-state state-${port.State}">${port.State}</span>
            <div class="port-vlans">${vlanTags}</div>
        `;
        container.appendChild(portEl);
    });

    updatePrimaryBadge();
}

function findPrimaryPort() {
    for (const port of Object.values(ports)) {
        if (port.IsPrimary) return port.ID;
    }
    return null;
}

function updatePrimaryBadge() {
    const badge = document.getElementById('primary-badge');
    const primaryPort = Object.values(ports).find(p => p.IsPrimary);
    if (primaryPort) {
        badge.textContent = `★ 主端口: ${primaryPort.Name} (Priority ${primaryPort.Priority})`;
        badge.style.display = 'inline-block';
        badge.style.background = 'rgba(255, 193, 7, 0.15)';
        badge.style.color = '#ffc107';
        badge.style.borderColor = 'rgba(255, 193, 7, 0.3)';
    } else {
        badge.textContent = '无主端口';
        badge.style.display = 'inline-block';
        badge.style.background = 'rgba(220, 53, 69, 0.15)';
        badge.style.color = '#dc3545';
        badge.style.borderColor = 'rgba(220, 53, 69, 0.3)';
    }
}

function renderVFID() {
    const container = document.getElementById('vfid-list');
    container.innerHTML = '';

    const entries = Object.values(vfidTable);
    if (entries.length === 0) {
        container.innerHTML = '<p class="text-muted">暂无 VFID 条目</p>';
        return;
    }

    entries.forEach(entry => {
        const el = document.createElement('div');
        const ttlPercent = entry.Alive ? (entry.TTL / DEFAULT_VFID_TTL) * 100 : 0;
        let statusClass = entry.Alive ? 'alive' : 'expired';
        let itemClass = entry.Alive ? 'alive' : 'expired';
        if (entry.Alive && entry.TTL <= DEFAULT_VFID_TTL * 0.3) {
            itemClass = 'warning';
        }

        let fillClass = 'high';
        if (ttlPercent <= 30) fillClass = 'low';
        else if (ttlPercent <= 60) fillClass = 'medium';

        el.className = `vfid-item ${itemClass}`;
        el.innerHTML = `
            <div class="vfid-header">
                <span class="vfid-id">VFID ${entry.VFID}</span>
                <span class="vfid-status ${statusClass}">${entry.Alive ? 'ALIVE' : 'EXPIRED'}</span>
            </div>
            <div class="vfid-port">端口: ${entry.PortName} (${entry.PortID})</div>
            ${entry.Alive ? `
                <div class="vfid-ttl-bar">
                    <div class="vfid-ttl-fill ${fillClass}" style="width: ${ttlPercent}%"></div>
                </div>
                <div class="vfid-ttl-text">
                    <span>TTL: ${entry.TTL}s</span>
                    <span>过期: ${new Date(entry.ExpiresAt).toLocaleTimeString()}</span>
                </div>
            ` : `
                <div class="vfid-ttl-text">
                    <span style="color:#dc3545;">已过期</span>
                    <span>过期于: ${new Date(entry.ExpiresAt).toLocaleTimeString()}</span>
                </div>
            `}
        `;
        container.appendChild(el);
    });
}

function renderSessions() {
    const container = document.getElementById('sessions-list');
    container.innerHTML = '';

    const sessionList = Object.values(sessions);
    if (sessionList.length === 0) {
        container.innerHTML = '<p class="text-muted">暂无会话</p>';
        return;
    }

    sessionList.forEach(session => {
        const el = document.createElement('div');
        const isSelected = selectedSession === session.ID;
        const isTerminated = session.State === 'TERMINATED';
        
        let classes = 'session-item';
        if (isSelected) classes += ' selected';
        if (isTerminated) classes += ' terminated';
        el.className = classes;
        
        if (!isTerminated) {
            el.onclick = () => selectSession(session);
        }

        el.innerHTML = `
            <div class="session-header">
                <span class="session-id">${session.ID}</span>
                <span class="session-state ${session.State}">${session.State}</span>
            </div>
            <div class="session-ports">${session.SourceName} ↔ ${session.DestName}</div>
            <div class="session-fpma">${session.SourceFPMA} ↔ ${session.DestFPMA}</div>
            <span class="session-vlan">VLAN ${session.VLANID}</span>
        `;
        container.appendChild(el);
    });
}

function selectSession(session) {
    selectedSession = session.ID;
    renderSessions();
    showSessionStats(session);
}

function showSessionStats(session) {
    const container = document.getElementById('session-stats');
    if (!session) {
        container.innerHTML = '<p class="text-muted">选择会话查看流量统计</p>';
        return;
    }

    container.innerHTML = `
        <table>
            <tr>
                <td>TX Frames</td>
                <td>${session.TrafficStats.TXFrames.toLocaleString()}</td>
            </tr>
            <tr>
                <td>RX Frames</td>
                <td>${session.TrafficStats.RXFrames.toLocaleString()}</td>
            </tr>
            <tr>
                <td>TX Bytes</td>
                <td>${formatBytes(session.TrafficStats.TXBytes)}</td>
            </tr>
            <tr>
                <td>RX Bytes</td>
                <td>${formatBytes(session.TrafficStats.RXBytes)}</td>
            </tr>
            <tr>
                <td>Created At</td>
                <td>${new Date(session.CreatedAt).toLocaleString()}</td>
            </tr>
            <tr>
                <td>Expires At</td>
                <td>${new Date(session.ExpiresAt).toLocaleString()}</td>
            </tr>
        </table>
    `;
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function renderVLANS(vlans) {
    const container = document.getElementById('vlans-list');
    container.innerHTML = '';

    vlans.forEach(vlan => {
        const vlanEl = document.createElement('span');
        vlanEl.className = 'vlan-item';
        vlanEl.textContent = `VLAN ${vlan}`;
        container.appendChild(vlanEl);
    });
}

function renderLinks() {
    const container = document.getElementById('links-list');
    container.innerHTML = '';

    if (links.length === 0) {
        container.innerHTML = '<p class="text-muted">暂无虚链路</p>';
        return;
    }

    links.forEach(link => {
        const sourcePort = ports[link.SourceID];
        const destPort = ports[link.DestID];
        const isDown = link.State === 'DOWN';
        
        const linkEl = document.createElement('div');
        linkEl.className = `link-item${selectedLink === link.ID ? ' selected' : ''}${isDown ? ' down' : ''}`;
        if (!isDown) linkEl.onclick = () => selectLink(link);

        linkEl.innerHTML = `
            <div class="link-info">
                <span class="link-vlan">VLAN ${link.VLANID}</span>
                <span class="port-state state-${isDown ? 'VFID_EXPIRED' : 'LINK_ESTABLISHED'}">${link.State}</span>
            </div>
            <div class="link-ports">${sourcePort?.Name || link.SourceID} ↔ ${destPort?.Name || link.DestID}</div>
        `;
        container.appendChild(linkEl);
    });
}

function selectLink(link) {
    selectedLink = link.ID;
    renderLinks();
    showNegotiationDetails(link);
}

function showNegotiationDetails(link) {
    const container = document.getElementById('negotiation-details');
    const params = link.Params;

    if (!params) {
        container.innerHTML = '<p class="text-muted">参数信息不可用</p>';
        return;
    }

    container.innerHTML = `
        <table>
            <tr>
                <td>FC4 Types</td>
                <td>${params.FC4Types?.join(', ') || '-'}</td>
            </tr>
            <tr>
                <td>Max RX Size</td>
                <td>${params.MaxRXSize} bytes</td>
            </tr>
            <tr>
                <td>Max TX Size</td>
                <td>${params.MaxTXSize} bytes</td>
            </tr>
            <tr>
                <td>ED_TOV</td>
                <td>${params.ED_TOV / 1000000000} s</td>
            </tr>
            <tr>
                <td>RA_TOV</td>
                <td>${params.RA_TOV / 1000000000} s</td>
            </tr>
            <tr>
                <td>FSPF Enabled</td>
                <td>${params.FSPFEnabled ? 'Yes' : 'No'}</td>
            </tr>
            <tr>
                <td>BB Credit</td>
                <td>${params.BB_Credit}</td>
            </tr>
        </table>
    `;
}

function updatePortSelects() {
    const discoverySelect = document.getElementById('discovery-port');
    const sourceSelect = document.getElementById('source-port');
    const targetSelect = document.getElementById('target-port');
    const refreshVfidSelect = document.getElementById('refresh-vfid-port');

    const alivePorts = Object.values(ports).filter(p => p.State !== 'VFID_EXPIRED');
    const allOptions = Object.values(ports).map(port => 
        `<option value="${port.ID}">${port.Name} (Priority ${port.Priority})</option>`
    ).join('');
    const aliveOptions = alivePorts.map(port => 
        `<option value="${port.ID}">${port.Name} (Priority ${port.Priority})</option>`
    ).join('');

    discoverySelect.innerHTML = aliveOptions;
    sourceSelect.innerHTML = aliveOptions;
    targetSelect.innerHTML = aliveOptions;
    refreshVfidSelect.innerHTML = allOptions;
}

function updateVLANSelect(vlans) {
    const select = document.getElementById('exchange-vlan');
    select.innerHTML = vlans.map(v => `<option value="${v}">VLAN ${v}</option>`).join('');
}

async function startVLANDiscovery() {
    const portId = document.getElementById('discovery-port').value;
    if (!portId) return;

    try {
        await fetch('/api/vlan-discovery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ portId })
        });
    } catch (error) {
        console.error('Failed to start VLAN discovery:', error);
    }
}

async function startParamExchange() {
    const portId = document.getElementById('source-port').value;
    const peerId = document.getElementById('target-port').value;
    const vlanId = parseInt(document.getElementById('exchange-vlan').value);

    if (!portId || !peerId || portId === peerId) {
        alert('请选择不同的源端口和目标端口');
        return;
    }

    try {
        await fetch('/api/param-exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ portId, peerId, vlanId })
        });
    } catch (error) {
        console.error('Failed to start parameter exchange:', error);
    }
}

async function refreshVFIDByPort() {
    const portId = document.getElementById('refresh-vfid-port').value;
    if (!portId) return;

    try {
        const response = await fetch('/api/vfid/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ portId })
        });
        const result = await response.json();
        if (response.ok) {
            refreshVFID();
            refreshPorts();
        } else {
            alert('刷新失败: 端口VFID已过期');
        }
    } catch (error) {
        console.error('Failed to refresh VFID:', error);
    }
}

async function triggerElection() {
    try {
        await fetch('/api/election', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        refreshPorts();
        refreshVFID();
    } catch (error) {
        console.error('Failed to trigger election:', error);
    }
}

function exportJSON() {
    window.location.href = '/api/sessions/export/json';
}

function exportCSV() {
    window.location.href = '/api/sessions/export/csv';
}

function addEvent(event, scroll = true) {
    const eventLog = document.getElementById('event-log');
    const eventEl = document.createElement('div');
    eventEl.className = `event-item ${event.Type}`;

    const time = new Date(event.Timestamp).toLocaleTimeString();
    
    eventEl.innerHTML = `
        <span class="event-time">[${time}]</span>
        <span class="event-type">${event.Type}</span>
        <span class="event-message">${event.Message}</span>
    `;

    eventLog.appendChild(eventEl);
    
    if (scroll) {
        eventLog.scrollTop = eventLog.scrollHeight;
    }
}

function clearEvents() {
    document.getElementById('event-log').innerHTML = '';
}

window.onload = init;
