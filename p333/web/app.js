const API_BASE = '/api';

let currentVTEPs = [];
let autoRefresh = null;

function log(message, type = 'info') {
    const logContent = document.getElementById('log-content');
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-${type}`;
    entry.innerHTML = `<span class="log-time">[${timeStr}]</span> ${message}`;
    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;
}

async function apiRequest(url, method = 'GET', data = null) {
    try {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        if (data) {
            options.body = JSON.stringify(data);
        }
        const response = await fetch(API_BASE + url, options);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('API Error:', error);
        log(`API 请求失败: ${error.message}`, 'error');
        throw error;
    }
}

async function loadVTEPs() {
    const vteps = await apiRequest('/vteps');
    currentVTEPs = vteps || [];
    renderVTEPTable();
    updateVTEPSelectors();
    log(`已加载 ${currentVTEPs.length} 个 VTEP`, 'info');
}

function renderVTEPTable() {
    const tbody = document.getElementById('vtep-tbody');

    if (currentVTEPs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty">暂无 VTEP 数据</td></tr>';
        return;
    }

    tbody.innerHTML = currentVTEPs.map(vtep => `
        <tr>
            <td>${vtep.id}</td>
            <td>${vtep.name}</td>
            <td>${vtep.ip}</td>
            <td>${vtep.loopback_ip}</td>
            <td><span class="vni-l2">${vtep.l2_vni}</span></td>
            <td><span class="vni-l3">${vtep.l3_vni}</span></td>
            <td>${vtep.mac}</td>
            <td><span class="status-${vtep.status === 'up' ? 'up' : 'down'}">${vtep.status}</span></td>
            <td><button class="action-btn" onclick="advertiseMACForVTEP('${vtep.id}')">通告MAC</button></td>
        </tr>
    `).join('');
}

function updateVTEPSelectors() {
    const select1 = document.getElementById('vtep-select');
    const select2 = document.getElementById('route-vtep-select');
    const select3 = document.getElementById('type3-vtep-select');

    const options = currentVTEPs.map(v => `<option value="${v.id}">${v.name} (${v.id})</option>`).join('');

    select1.innerHTML = '<option value="">-- 请选择 --</option>' + options;
    select2.innerHTML = '<option value="">-- 请选择 --</option>' + options;
    if (select3) {
        select3.innerHTML = '<option value="">-- 请选择 --</option>' + options;
    }
}

async function loadTunnels() {
    const tunnels = await apiRequest('/tunnels');
    renderTunnelTable(tunnels || []);
    log(`已加载 ${tunnels ? tunnels.length : 0} 个 VXLAN 隧道`, 'info');
}

function renderTunnelTable(tunnels) {
    const tbody = document.getElementById('tunnel-tbody');

    if (tunnels.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无隧道数据</td></tr>';
        return;
    }

    tbody.innerHTML = tunnels.map(tunnel => `
        <tr>
            <td>${tunnel.id}</td>
            <td>${tunnel.vni}</td>
            <td>${tunnel.source_vtep}</td>
            <td>${tunnel.dest_vtep}</td>
            <td><span class="status-${tunnel.status === 'established' ? 'up' : 'down'}">${tunnel.status}</span></td>
        </tr>
    `).join('');
}

async function loadMACTable() {
    const vtepId = document.getElementById('vtep-select').value;
    const tbody = document.getElementById('mac-tbody');

    if (!vtepId) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty">请选择一个 VTEP</td></tr>';
        return;
    }

    const entries = await apiRequest(`/vteps/${vtepId}/mac-table`);
    renderMACTable(entries || []);
}

function renderMACTable(entries) {
    const tbody = document.getElementById('mac-tbody');

    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty">暂无 MAC 地址条目</td></tr>';
        return;
    }

    tbody.innerHTML = entries.map(entry => `
        <tr>
            <td class="rd-cell">${entry.rd}</td>
            <td>${entry.mac}</td>
            <td>${entry.ip}</td>
            <td><span class="vni-l2">${entry.l2_vni}</span></td>
            <td><span class="vni-l3">${entry.l3_vni}</span></td>
            <td><span class="status-${entry.local ? 'local' : 'remote'}">${entry.local ? '本地' : '远程'}</span></td>
            <td>${entry.next_hop}</td>
            <td>${entry.vtep_id}</td>
            <td>${formatTime(entry.age)}</td>
        </tr>
    `).join('');
}

async function loadRoutes() {
    const vtepId = document.getElementById('route-vtep-select').value;
    const tbody = document.getElementById('route-tbody');

    if (!vtepId) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty">请选择一个 VTEP</td></tr>';
        return;
    }

    const routes = await apiRequest(`/vteps/${vtepId}/routes`);
    renderRoutes(routes || []);
}

function renderRoutes(routes) {
    const tbody = document.getElementById('route-tbody');

    if (routes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty">暂无 EVPN 路由</td></tr>';
        return;
    }

    tbody.innerHTML = routes.map(route => `
        <tr>
            <td>类型 ${route.route_type}</td>
            <td class="rd-cell">${route.rd}</td>
            <td>${route.esi}</td>
            <td>${route.mac_address}</td>
            <td>${route.ip_address}</td>
            <td><span class="vni-l2">${route.l2_vni}</span></td>
            <td><span class="vni-l3">${route.l3_vni}</span></td>
            <td>${route.next_hop}</td>
            <td>${route.origin_vtep}</td>
            <td>${formatTime(route.timestamp)}</td>
        </tr>
    `).join('');
}

async function loadTopology() {
    const topology = await apiRequest('/topology');
    if (topology && topology.stats) {
        document.getElementById('vtep-count').textContent = topology.stats.vtep_count;
        document.getElementById('tunnel-count').textContent = topology.stats.tunnel_count;
        document.getElementById('mac-count').textContent = topology.stats.mac_entry_count;
        const totalRoutes = (topology.stats.route_type2_count || 0) + (topology.stats.route_type3_count || 0);
        document.getElementById('route-count').textContent = totalRoutes;
    }
    return topology;
}

async function createDemoTopology() {
    log('正在创建演示拓扑...', 'info');

    const vtep1 = await apiRequest('/vteps', 'POST', {
        id: 'vtep-1',
        name: 'VTEP 1 (Leaf 1)',
        ip: '192.168.1.1',
        loopback_ip: '10.0.0.1',
        l2_vni: 10010,
        l3_vni: 50000
    });

    const vtep2 = await apiRequest('/vteps', 'POST', {
        id: 'vtep-2',
        name: 'VTEP 2 (Leaf 2)',
        ip: '192.168.1.2',
        loopback_ip: '10.0.0.2',
        l2_vni: 10010,
        l3_vni: 50000
    });

    const vtep3 = await apiRequest('/vteps', 'POST', {
        id: 'vtep-3',
        name: 'VTEP 3 (Leaf 3)',
        ip: '192.168.1.3',
        loopback_ip: '10.0.0.3',
        l2_vni: 10010,
        l3_vni: 50000
    });

    log('已创建 3 个 VTEP (L2VNI=10010, L3VNI=50000)', 'success');

    const tunnel1 = await apiRequest('/tunnels', 'POST', {
        source_vtep: 'vtep-1',
        dest_vtep: 'vtep-2',
        vni: 10010
    });

    const tunnel2 = await apiRequest('/tunnels', 'POST', {
        source_vtep: 'vtep-1',
        dest_vtep: 'vtep-3',
        vni: 10010
    });

    const tunnel3 = await apiRequest('/tunnels', 'POST', {
        source_vtep: 'vtep-2',
        dest_vtep: 'vtep-3',
        vni: 10010
    });

    log('已建立 3 条 VXLAN 隧道', 'success');

    await refreshAll();

    log('演示拓扑创建完成！', 'success');
}

async function advertiseRandomMAC() {
    if (currentVTEPs.length === 0) {
        log('请先创建 VTEP', 'error');
        return;
    }

    const randomVTEP = currentVTEPs[Math.floor(Math.random() * currentVTEPs.length)];

    log(`正在从 ${randomVTEP.id} 通告随机 MAC (L2VNI=${randomVTEP.l2_vni}, L3VNI=${randomVTEP.l3_vni})...`, 'info');

    const route = await apiRequest('/advertise', 'POST', {
        vtep_id: randomVTEP.id,
        l2_vni: randomVTEP.l2_vni,
        l3_vni: randomVTEP.l3_vni,
        random: true
    });

    if (route) {
        log(`成功通告 RD=${route.rd} MAC=${route.mac_address}, IP=${route.ip_address}, L2VNI=${route.l2_vni}, L3VNI=${route.l3_vni}`, 'success');
        await refreshAll();
    }
}

async function advertiseMACForVTEP(vtepId) {
    const vtep = currentVTEPs.find(v => v.id === vtepId);
    if (vtep) {
        log(`正在从 ${vtepId} 通告随机 MAC (L2VNI=${vtep.l2_vni}, L3VNI=${vtep.l3_vni})...`, 'info');
        const route = await apiRequest('/advertise', 'POST', {
            vtep_id: vtepId,
            l2_vni: vtep.l2_vni,
            l3_vni: vtep.l3_vni,
            random: true
        });
        if (route) {
            log(`成功通告 RD=${route.rd} MAC=${route.mac_address}, L2VNI=${route.l2_vni}, L3VNI=${route.l3_vni}`, 'success');
            await refreshAll();
        }
    }
}

async function startSimulation() {
    if (currentVTEPs.length === 0) {
        log('请先创建 VTEP', 'error');
        return;
    }

    log('开始模拟 MAC 地址通告...', 'info');

    const randomVTEP = currentVTEPs[Math.floor(Math.random() * currentVTEPs.length)];

    const result = await apiRequest('/simulate', 'POST', {
        vtep_id: randomVTEP.id,
        l2_vni: randomVTEP.l2_vni,
        l3_vni: randomVTEP.l3_vni,
        interval: '2s',
        count: 10
    });

    if (result) {
        log(`模拟已启动: ${result.count} 次通告, 间隔 ${result.interval}`, 'success');

        if (autoRefresh) {
            clearInterval(autoRefresh);
        }

        autoRefresh = setInterval(() => {
            refreshAll();
        }, 2000);

        setTimeout(() => {
            if (autoRefresh) {
                clearInterval(autoRefresh);
                autoRefresh = null;
                log('模拟完成', 'success');
            }
        }, 20000);
    }
}

async function refreshAll() {
    await Promise.all([
        loadVTEPs(),
        loadTunnels(),
        loadTopology()
    ]);

    const selectedVTEP = document.getElementById('vtep-select').value;
    if (selectedVTEP) {
        await loadMACTable();
    }

    const selectedRouteVTEP = document.getElementById('route-vtep-select').value;
    if (selectedRouteVTEP) {
        await loadRoutes();
    }

    const selectedType3VTEP = document.getElementById('type3-vtep-select').value;
    if (selectedType3VTEP) {
        await loadType3Routes();
    }
}

async function loadType3Routes() {
    const vtepId = document.getElementById('type3-vtep-select').value;
    const tbody = document.getElementById('type3-route-tbody');

    if (!vtepId) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty">请选择一个 VTEP</td></tr>';
        return;
    }

    const routes = await apiRequest(`/vteps/${vtepId}/routes/type3`);
    renderType3Routes(routes || []);
}

function getTunnelTypeName(type) {
    switch(type) {
        case 6: return 'Ingress Replication';
        case 1: return 'PIM-SM';
        case 2: return 'PIM-SSM';
        default: return `Unknown (${type})`;
    }
}

function renderType3Routes(routes) {
    const tbody = document.getElementById('type3-route-tbody');

    if (routes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty">暂无 Type 3 EVPN 路由</td></tr>';
        return;
    }

    tbody.innerHTML = routes.map(route => `
        <tr>
            <td>类型 ${route.route_type}</td>
            <td class="rd-cell">${route.rd}</td>
            <td>${route.eth_tag}</td>
            <td><span class="vni-l2">${route.l2_vni}</span></td>
            <td>${route.pmsi_tunnel ? getTunnelTypeName(route.pmsi_tunnel.tunnel_type) : '-'}</td>
            <td>${route.pmsi_tunnel ? route.pmsi_tunnel.tunnel_id : '-'}</td>
            <td>${route.multicast_group ? route.multicast_group.group_ip : '-'}</td>
            <td>${route.multicast_group ? route.multicast_group.source_ip : '-'}</td>
            <td>${route.next_hop}</td>
            <td>${route.origin_vtep}</td>
            <td>${formatTime(route.timestamp)}</td>
        </tr>
    `).join('');
}

async function advertiseRandomMulticast() {
    if (currentVTEPs.length === 0) {
        log('请先创建 VTEP', 'error');
        return;
    }

    const randomVTEP = currentVTEPs[Math.floor(Math.random() * currentVTEPs.length)];

    log(`正在从 ${randomVTEP.id} 通告随机组播组 (L2VNI=${randomVTEP.l2_vni})...`, 'info');

    const route = await apiRequest('/advertise-multicast', 'POST', {
        vtep_id: randomVTEP.id,
        l2_vni: randomVTEP.l2_vni,
        random: true
    });

    if (route) {
        log(`成功通告 Type 3 路由: RD=${route.rd}, 组播组=${route.multicast_group.group_ip}, 源IP=${route.multicast_group.source_ip}`, 'success');
        await refreshAll();
    }
}

function getSelectedVTEP() {
    const vtepId = document.getElementById('route-vtep-select').value || 
                  document.getElementById('type3-vtep-select').value ||
                  (currentVTEPs.length > 0 ? currentVTEPs[0].id : null);
    return vtepId;
}

async function exportRoutes() {
    const vtepId = getSelectedVTEP();
    if (!vtepId) {
        log('请先选择一个 VTEP', 'error');
        return;
    }

    log(`正在导出 ${vtepId} 的全部路由...`, 'info');
    const result = await apiRequest(`/vteps/${vtepId}/routes/export?format=download&type=`);
    
    if (result) {
        const dataStr = JSON.stringify(result, null, 2);
        const blob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `evpn-routes-${vtepId}-all.json`;
        a.click();
        URL.revokeObjectURL(url);
        log(`成功导出 ${result.count} 条路由`, 'success');
    }
}

async function exportType2Routes() {
    const vtepId = document.getElementById('route-vtep-select').value;
    if (!vtepId) {
        log('请先选择一个 VTEP', 'error');
        return;
    }

    log(`正在导出 ${vtepId} 的 Type 2 路由...`, 'info');
    const result = await apiRequest(`/vteps/${vtepId}/routes/export?format=download&type=2`);
    
    if (result) {
        const dataStr = JSON.stringify(result, null, 2);
        const blob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `evpn-routes-${vtepId}-type2.json`;
        a.click();
        URL.revokeObjectURL(url);
        log(`成功导出 ${result.count} 条 Type 2 路由`, 'success');
    }
}

async function exportType3Routes() {
    const vtepId = document.getElementById('type3-vtep-select').value;
    if (!vtepId) {
        log('请先选择一个 VTEP', 'error');
        return;
    }

    log(`正在导出 ${vtepId} 的 Type 3 路由...`, 'info');
    const result = await apiRequest(`/vteps/${vtepId}/routes/export?format=download&type=3`);
    
    if (result) {
        const dataStr = JSON.stringify(result, null, 2);
        const blob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `evpn-routes-${vtepId}-type3.json`;
        a.click();
        URL.revokeObjectURL(url);
        log(`成功导出 ${result.count} 条 Type 3 路由`, 'success');
    }
}

function formatTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString();
}

document.addEventListener('DOMContentLoaded', () => {
    log('BGP EVPN 模拟器已启动', 'success');
    log('MAC 地址表索引: RD + L2 VNI', 'info');
    log('L2 VNI 用于桥接 (同子网转发), L3 VNI 用于路由 (跨子网转发)', 'info');
    log('Type 3 路由用于 Inclusive Multicast (BUM 流量转发)', 'info');
    log('点击"创建演示拓扑"开始体验', 'info');

    setInterval(() => {
        loadTopology();
    }, 5000);
});
