class RIPv2Simulator {
    constructor() {
        this.ws = null;
        this.routingTables = new Map();
        this.updateLogs = [];
        this.interfaceLogs = [];
        this.authLogs = [];
        this.filterRouter = 'all';
        this.zebraPreviewRouterId = null;
        this.init();
    }

    init() {
        this.connectWebSocket();
        this.setupEventListeners();
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.updateConnectionStatus(true);
        };

        this.ws.onclose = () => {
            this.updateConnectionStatus(false);
            setTimeout(() => this.connectWebSocket(), 3000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        };
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connectionStatus');
        if (connected) {
            statusEl.textContent = '已连接';
            statusEl.className = 'status-connected';
        } else {
            statusEl.textContent = '未连接';
            statusEl.className = 'status-disconnected';
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'routingTables':
                this.handleRoutingTables(message.data);
                break;
            case 'updateLogs':
                this.handleInitialLogs(message.data);
                break;
            case 'interfaceLogs':
                this.handleInitialInterfaceLogs(message.data);
                break;
            case 'authLogs':
                this.handleInitialAuthLogs(message.data);
                break;
            case 'updateSent':
            case 'updateReceived':
                this.handleUpdateLog(message.data, message.type);
                break;
            case 'interfaceChanged':
                this.handleInterfaceLog(message.data);
                break;
            case 'authEvent':
                this.handleAuthLog(message.data);
                break;
            case 'routeChanged':
                break;
        }
    }

    handleRoutingTables(data) {
        this.routingTables.clear();
        data.forEach(router => {
            this.routingTables.set(router.routerId, router);
        });
        this.renderRoutingTables();
        this.renderAuthStatus();
        this.renderZebraExport();
        this.updateRouterFilter();
    }

    handleInitialLogs(data) {
        this.updateLogs = data;
        this.renderLogs();
    }

    handleInitialInterfaceLogs(data) {
        this.interfaceLogs = data;
        this.renderInterfaceLogs();
    }

    handleInitialAuthLogs(data) {
        this.authLogs = data;
        this.renderAuthLogs();
    }

    handleUpdateLog(log, type) {
        log.type = type;
        this.updateLogs.unshift(log);
        if (this.updateLogs.length > 100) {
            this.updateLogs.pop();
        }
        this.renderLogs();
    }

    handleInterfaceLog(log) {
        this.interfaceLogs.unshift(log);
        if (this.interfaceLogs.length > 100) {
            this.interfaceLogs.pop();
        }
        this.renderInterfaceLogs();
    }

    handleAuthLog(log) {
        this.authLogs.unshift(log);
        if (this.authLogs.length > 100) {
            this.authLogs.pop();
        }
        this.renderAuthLogs();
    }

    updateRouterFilter() {
        const select = document.getElementById('filterRouter');
        const currentValue = select.value;
        const existingOptions = Array.from(select.options).map(opt => opt.value);
        this.routingTables.forEach((_, routerId) => {
            if (!existingOptions.includes(routerId)) {
                const option = document.createElement('option');
                option.value = routerId;
                option.textContent = routerId;
                select.appendChild(option);
            }
        });
        if (existingOptions.includes(currentValue)) {
            select.value = currentValue;
        }
    }

    getRouterClass(routerId) {
        const routerClasses = {
            'Router-A': 'router-a',
            'Router-B': 'router-b',
            'Router-C': 'router-c',
            'Router-D': 'router-d'
        };
        return routerClasses[routerId] || '';
    }

    getMetricClass(metric) {
        if (metric >= 16) return 'metric-bad';
        if (metric >= 10) return 'metric-medium';
        return 'metric-good';
    }

    setInterfaceStatus(routerId, interfaceName, status) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'setInterfaceStatus',
                routerId,
                interfaceName,
                status
            }));
        }
    }

    setAuthKey(routerId, keyId) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'setAuthKey',
                routerId,
                keyId
            }));
        }
    }

    renderRoutingTables() {
        const container = document.getElementById('routingTables');
        container.innerHTML = '';

        this.routingTables.forEach(router => {
            const card = document.createElement('div');
            card.className = 'router-table-card';
            const routerClass = this.getRouterClass(router.routerId);
            const interfacesHtml = router.interfaces && router.interfaces.length > 0 
                ? this.renderInterfaces(router) : '';
            const authBadge = router.authentication && router.authentication.enabled 
                ? '<span class="auth-badge">MD5认证</span>' : '';
            
            card.innerHTML = `
                <div class="router-table-header ${routerClass}">
                    <span class="router-name">${router.routerId} ${authBadge}</span>
                    <span class="router-neighbors">邻居: ${router.neighbors.join(', ') || '无'}</span>
                </div>
                ${interfacesHtml}
                <table class="router-table">
                    <thead>
                        <tr>
                            <th>目标网络</th>
                            <th>下一跳</th>
                            <th>度量值</th>
                            <th>接口</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${router.routingTable.map(route => this.renderRouteRow(route)).join('')}
                    </tbody>
                </table>
            `;
            container.appendChild(card);
        });
    }

    renderInterfaces(router) {
        return `
            <div class="router-interfaces">
                <div class="interfaces-label">接口状态控制：</div>
                <div class="interface-controls">
                    ${router.interfaces.map(iface => this.renderInterfaceControl(router.routerId, iface)).join('')}
                </div>
            </div>
        `;
    }

    renderInterfaceControl(routerId, iface) {
        const isUp = iface.status === 'up';
        const statusClass = isUp ? 'interface-up' : 'interface-down';
        const buttonText = isUp ? '关闭接口' : '开启接口';
        const newStatus = isUp ? 'down' : 'up';
        const statusText = isUp ? '运行中' : '已关闭';
        return `
            <div class="interface-control">
                <span class="interface-name">${iface.name}</span>
                <span class="interface-network">(${iface.network})</span>
                <span class="interface-status ${statusClass}">${statusText}</span>
                <button class="btn btn-small interface-btn" 
                        data-router="${routerId}" 
                        data-interface="${iface.name}" 
                        data-status="${newStatus}">
                    ${buttonText}
                </button>
            </div>
        `;
    }

    renderRouteRow(route) {
        const metricClass = this.getMetricClass(route.metric);
        const badges = [];
        if (route.isDirect) badges.push('<span class="direct-badge">直连</span>');
        if (route.garbageCollect) badges.push('<span class="garbage-badge">待删除</span>');
        if (route.interfaceName && !route.interfaceUp) badges.push('<span class="interface-down-badge">接口关闭</span>');
        const interfaceDisplay = route.interfaceName 
            ? `<span class="interface-tag">${route.interfaceName}</span>` : '-';
        return `
            <tr>
                <td><code>${route.network}</code></td>
                <td>${route.nextHop}</td>
                <td class="${metricClass}">${route.metric}</td>
                <td>${interfaceDisplay}</td>
                <td>${badges.join(' ')}</td>
            </tr>
        `;
    }

    renderAuthStatus() {
        const container = document.getElementById('authStatus');
        if (!container) return;

        const cards = [];
        this.routingTables.forEach(router => {
            if (!router.authentication || !router.authentication.enabled) return;
            const routerClass = this.getRouterClass(router.routerId);
            const keysHtml = router.authentication.keys.map(key => {
                const activeClass = key.isActive ? 'auth-key-active' : 'auth-key-inactive';
                const activeText = key.isActive ? '(活跃)' : '';
                return `
                    <div class="auth-key-item ${activeClass}">
                        <span class="auth-key-id">Key ${key.keyId}</span>
                        <span class="auth-key-value">${key.key}</span>
                        <span class="auth-key-status">${activeText}</span>
                        ${!key.isActive ? `<button class="btn btn-small auth-key-btn" data-router="${router.routerId}" data-key-id="${key.keyId}">切换</button>` : ''}
                    </div>
                `;
            }).join('');
            cards.push(`
                <div class="auth-card">
                    <div class="auth-card-header ${routerClass}">
                        <span>${router.routerId}</span>
                        <span class="auth-mode">MD5 认证 · 活跃密钥: Key ${router.authentication.activeKeyId}</span>
                    </div>
                    <div class="auth-key-chain">${keysHtml}</div>
                </div>
            `);
        });

        container.innerHTML = cards.length > 0 ? cards.join('') : '<div class="empty-state">未启用认证</div>';
    }

    renderZebraExport() {
        const container = document.getElementById('zebraExport');
        if (!container) return;

        const buttons = [];
        this.routingTables.forEach(router => {
            const routerClass = this.getRouterClass(router.routerId);
            buttons.push(`
                <div class="zebra-export-item">
                    <span class="zebra-router-name ${routerClass}">${router.routerId}</span>
                    <button class="btn btn-small zebra-preview-btn" data-router="${router.routerId}">预览</button>
                    <a href="/api/export/zebra/${router.routerId}" class="btn btn-small btn-download" download>下载</a>
                </div>
            `);
        });
        container.innerHTML = buttons.join('');
    }

    async previewZebraConfig(routerId) {
        this.zebraPreviewRouterId = routerId;
        try {
            const response = await fetch(`/api/export/zebra/${routerId}`);
            const config = await response.text();
            document.getElementById('zebraPreviewTitle').textContent = `${routerId} - Zebra 配置`;
            document.getElementById('zebraPreviewContent').textContent = config;
            document.getElementById('zebraPreview').style.display = 'block';
        } catch (e) {
            console.error('Error fetching Zebra config:', e);
        }
    }

    renderLogs() {
        const container = document.getElementById('updateLogs');
        const filteredLogs = this.filterRouter === 'all' 
            ? this.updateLogs 
            : this.updateLogs.filter(log => 
                log.fromRouter === this.filterRouter || log.toRouter === this.filterRouter
              );
        if (filteredLogs.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无更新报文...</div>';
            return;
        }
        container.innerHTML = filteredLogs.map(log => this.renderLogEntry(log)).join('');
    }

    renderLogEntry(log) {
        const isSent = log.type === 'updateSent' || log.fromRouter;
        const directionClass = isSent ? 'sent' : 'received';
        const directionText = isSent ? '发送更新' : '接收更新';
        const fromClass = this.getRouterClass(log.fromRouter);
        const toClass = this.getRouterClass(log.toRouter);
        const triggeredBadge = log.isTriggered 
            ? '<span class="triggered-badge">触发更新</span>' 
            : '<span class="periodic-badge">周期更新</span>';
        const authBadge = log.authenticated 
            ? `<span class="auth-log-badge">Key ${log.authKeyId}</span>` 
            : '';
        return `
            <div class="log-entry ${directionClass}">
                <div class="log-header">
                    <span class="log-direction ${directionClass}">${directionText}</span>
                    ${triggeredBadge}
                    ${authBadge}
                    <span class="log-routers">
                        <strong class="${fromClass}">${log.fromRouter}</strong> 
                        → 
                        <strong class="${toClass}">${log.toRouter}</strong>
                    </span>
                    <span class="log-time">${this.formatTime(log.timestamp)}</span>
                </div>
                <div class="log-routes">
                    ${log.routes.map(route => this.renderRouteTag(route)).join('')}
                </div>
            </div>
        `;
    }

    renderRouteTag(route) {
        const poisonedClass = route.poisoned ? 'poisoned' : '';
        const metricClass = route.metric >= 16 ? 'poisoned' : '';
        return `
            <span class="route-tag ${poisonedClass}">
                <span class="route-network">${route.network}</span>
                <span class="route-metric ${metricClass}">
                    metric: ${route.metric}
                    ${route.poisoned ? '<span class="poison-badge">(毒性反转)</span>' : ''}
                </span>
            </span>
        `;
    }

    renderInterfaceLogs() {
        const container = document.getElementById('interfaceLogs');
        if (this.interfaceLogs.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无接口状态变化...</div>';
            return;
        }
        container.innerHTML = this.interfaceLogs.map(log => this.renderInterfaceLogEntry(log)).join('');
    }

    renderInterfaceLogEntry(log) {
        const routerClass = this.getRouterClass(log.routerId);
        const statusClass = log.newStatus === 'up' ? 'status-up' : 'status-down';
        const statusIcon = log.newStatus === 'up' ? '↑' : '↓';
        return `
            <div class="log-entry interface-log">
                <div class="log-header">
                    <span class="log-direction interface-change">接口状态变化</span>
                    <span class="log-routers">
                        <strong class="${routerClass}">${log.routerId}</strong>
                    </span>
                    <span class="log-time">${this.formatTime(log.timestamp)}</span>
                </div>
                <div class="interface-change-details">
                    <span class="interface-name-log">${log.interfaceName}</span>
                    <span class="status-old">${log.oldStatus}</span>
                    <span class="status-arrow">→</span>
                    <span class="status-new ${statusClass}">${statusIcon} ${log.newStatus}</span>
                </div>
            </div>
        `;
    }

    renderAuthLogs() {
        const container = document.getElementById('authLogs');
        if (this.authLogs.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无认证事件...</div>';
            return;
        }
        container.innerHTML = this.authLogs.map(log => this.renderAuthLogEntry(log)).join('');
    }

    renderAuthLogEntry(log) {
        const routerClass = this.getRouterClass(log.routerId);
        const isSuccess = log.event === 'auth_success';
        const isFailed = log.event === 'auth_failed';
        const isKeySwitch = log.event === 'key_switch';
        let eventClass = '';
        let eventText = '';
        let details = '';

        if (isSuccess) {
            eventClass = 'auth-success';
            eventText = '认证成功';
            details = `来自 ${log.fromRouter}, Key ${log.keyId}`;
        } else if (isFailed) {
            eventClass = 'auth-failed';
            eventText = '认证失败';
            details = `来自 ${log.fromRouter || '未知'}, ${log.reason}`;
        } else if (isKeySwitch) {
            eventClass = log.success ? 'auth-success' : 'auth-failed';
            eventText = '密钥切换';
            details = `切换到 Key ${log.keyId}${log.success ? '' : ' (' + log.reason + ')'}`;
        }

        return `
            <div class="log-entry auth-log-entry ${eventClass}">
                <div class="log-header">
                    <span class="log-direction ${eventClass}">${eventText}</span>
                    <span class="log-routers">
                        <strong class="${routerClass}">${log.routerId}</strong>
                    </span>
                    <span class="log-time">${this.formatTime(log.timestamp)}</span>
                </div>
                <div class="auth-log-details">${details}</div>
            </div>
        `;
    }

    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: false 
        });
    }

    setupEventListeners() {
        document.getElementById('clearLogs').addEventListener('click', () => {
            this.updateLogs = [];
            this.renderLogs();
        });

        document.getElementById('clearInterfaceLogs').addEventListener('click', () => {
            this.interfaceLogs = [];
            this.renderInterfaceLogs();
        });

        document.getElementById('clearAuthLogs').addEventListener('click', () => {
            this.authLogs = [];
            this.renderAuthLogs();
        });

        document.getElementById('filterRouter').addEventListener('change', (e) => {
            this.filterRouter = e.target.value;
            this.renderLogs();
        });

        document.getElementById('routingTables').addEventListener('click', (e) => {
            const btn = e.target.closest('.interface-btn');
            if (btn) {
                this.setInterfaceStatus(btn.dataset.router, btn.dataset.interface, btn.dataset.status);
            }
        });

        document.getElementById('authStatus').addEventListener('click', (e) => {
            const btn = e.target.closest('.auth-key-btn');
            if (btn) {
                this.setAuthKey(btn.dataset.router, parseInt(btn.dataset.keyId));
            }
        });

        document.getElementById('zebraExport').addEventListener('click', (e) => {
            const btn = e.target.closest('.zebra-preview-btn');
            if (btn) {
                this.previewZebraConfig(btn.dataset.router);
            }
        });

        document.getElementById('zebraCloseBtn').addEventListener('click', () => {
            document.getElementById('zebraPreview').style.display = 'none';
        });

        document.getElementById('zebraCopyBtn').addEventListener('click', () => {
            const content = document.getElementById('zebraPreviewContent').textContent;
            navigator.clipboard.writeText(content).then(() => {
                const btn = document.getElementById('zebraCopyBtn');
                btn.textContent = '已复制';
                setTimeout(() => { btn.textContent = '复制'; }, 2000);
            });
        });

        document.getElementById('zebraDownloadBtn').addEventListener('click', () => {
            if (this.zebraPreviewRouterId) {
                const hostname = this.zebraPreviewRouterId.toLowerCase().replace(/[^a-z0-9]/g, '-');
                const content = document.getElementById('zebraPreviewContent').textContent;
                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${hostname}-zebra.conf`;
                a.click();
                URL.revokeObjectURL(url);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new RIPv2Simulator();
});
