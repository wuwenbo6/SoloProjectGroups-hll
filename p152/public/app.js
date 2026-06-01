class ZooKeeperMonitor {
    constructor() {
        this.customNodes = JSON.parse(localStorage.getItem('zkNodes') || '[]');
        this.ws = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.init();
    }

    init() {
        this.bindEvents();
        this.connectWebSocket();
    }

    bindEvents() {
        document.getElementById('refreshBtn').addEventListener('click', () => this.manualRefresh());
        document.getElementById('addNodeBtn').addEventListener('click', () => this.showAddModal());
        document.getElementById('confirmAddNode').addEventListener('click', () => this.addNode());
        document.querySelector('.close').addEventListener('click', () => this.hideAddModal());
        document.getElementById('pushInterval').addEventListener('change', () => this.setPushInterval());

        document.getElementById('addNodeModal').addEventListener('click', (e) => {
            if (e.target.id === 'addNodeModal') {
                this.hideAddModal();
            }
        });
    }

    connectWebSocket() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}/ws`;

        this.setWsStatus('connecting');

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.reconnectAttempts = 0;
            this.setWsStatus('connected');
            this.syncCustomNodes();
            this.setPushInterval();
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleMessage(msg);
            } catch (err) {
                console.error('WebSocket 消息解析失败:', err);
            }
        };

        this.ws.onclose = () => {
            this.setWsStatus('disconnected');
            this.attemptReconnect();
        };

        this.ws.onerror = (err) => {
            console.error('WebSocket 错误:', err);
        };
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            document.getElementById('nodesContainer').innerHTML =
                '<div class="error-message">WebSocket 连接已断开，且无法重新连接。请刷新页面重试。</div>';
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;

        this.reconnectTimer = setTimeout(() => {
            this.setWsStatus('connecting');
            this.connectWebSocket();
        }, delay);
    }

    handleMessage(msg) {
        switch (msg.type) {
            case 'connected':
                console.log('WebSocket 已连接，客户端ID:', msg.clientId);
                break;
            case 'initial':
            case 'update':
                this.handleStatusUpdate(msg);
                break;
            case 'nodeAdded':
                console.log('节点已添加:', msg.host, msg.port);
                break;
            case 'nodeRemoved':
                console.log('节点已移除:', msg.host, msg.port);
                break;
            case 'intervalUpdated':
                console.log('推送间隔已更新:', msg.interval, 'ms');
                break;
            case 'error':
                console.error('服务端错误:', msg.message);
                break;
        }
    }

    handleStatusUpdate(data) {
        const container = document.getElementById('nodesContainer');

        if (!data.success || !data.data || data.data.length === 0) {
            container.innerHTML = '<div class="loading">暂无节点数据</div>';
            return;
        }

        this.renderNodes(data.data);
        document.getElementById('updateTime').textContent =
            new Date(data.timestamp).toLocaleString('zh-CN');
    }

    setWsStatus(status) {
        const dot = document.getElementById('wsDot');
        const label = document.getElementById('wsLabel');

        dot.className = 'ws-dot';

        switch (status) {
            case 'connected':
                dot.classList.add('connected');
                label.textContent = '已连接';
                break;
            case 'connecting':
                label.textContent = `连接中${this.reconnectAttempts > 0 ? `（重试 ${this.reconnectAttempts}）` : '...'}`;
                break;
            case 'disconnected':
                dot.classList.add('disconnected');
                label.textContent = '已断开';
                break;
        }
    }

    syncCustomNodes() {
        for (const node of this.customNodes) {
            const [host, port] = node.id.split(':');
            this.ws.send(JSON.stringify({
                type: 'addNode',
                host,
                port: parseInt(port)
            }));
        }
    }

    setPushInterval() {
        const interval = parseInt(document.getElementById('pushInterval').value);
        if (this.ws && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify({
                type: 'setPushInterval',
                interval
            }));
        }
    }

    manualRefresh() {
        if (this.ws && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify({ type: 'refresh' }));
        } else {
            this.connectWebSocket();
        }
    }

    renderNodes(nodes) {
        const container = document.getElementById('nodesContainer');
        container.innerHTML = nodes.map(node => this.renderNodeCard(node)).join('');

        document.querySelectorAll('.remove-node-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const nodeId = e.target.dataset.id;
                this.removeNode(nodeId);
            });
        });
    }

    renderNodeCard(node) {
        const isOnline = node.ruok;
        const hasError = node.error || !node.stat || !node.mntr;
        const hasSuggestion = node.suggestion;
        const hasAlerts = node.alerts && node.alerts.length > 0;

        const modeClass = node.stat?.mode === 'leader' ? 'mode-leader' :
            node.stat?.mode === 'follower' ? 'mode-follower' : 'mode-standalone';

        const latency = node.stat?.latency || { min: 0, avg: 0, max: 0 };
        const outstanding = node.stat?.outstanding ?? 0;
        const outstandingClass = outstanding > 100 ? 'danger' : outstanding > 10 ? 'warning' : '';

        const nodeId = `${node.host}:${node.port}`;
        const isCustom = this.customNodes.some(n => n.id === nodeId);

        const highestAlertLevel = hasAlerts
            ? node.alerts.some(a => a.level === 'error') ? 'error' : 'warning'
            : null;

        return `
            <div class="node-card ${hasError && !hasSuggestion ? 'error' : ''}">
                <div class="node-header">
                    <div class="node-title">
                        <h3>${node.host}:${node.port}</h3>
                        <span class="status-badge ${isOnline ? 'status-online' : 'status-offline'}">
                            ${isOnline ? '在线' : '离线'}
                        </span>
                        ${node.stat?.mode ? `<span class="mode-badge ${modeClass}">${node.stat.mode}</span>` : ''}
                        ${hasAlerts ? `<span class="alert-badge ${highestAlertLevel}">${node.alerts.length} 告警</span>` : ''}
                    </div>
                    ${isCustom ? `<button class="btn btn-danger remove-node-btn" data-id="${nodeId}">移除</button>` : ''}
                </div>
                <div class="node-body">
                    ${hasAlerts ? this.renderAlerts(node.alerts) : ''}
                    ${hasError && !hasSuggestion ? this.renderError(node) : ''}
                    ${!hasError || hasSuggestion ? this.renderStats(node, latency, outstanding, outstandingClass) : ''}
                    ${node.baselines && !hasError ? this.renderBaselines(node.baselines) : ''}
                    ${node.recentTrend && !hasError ? this.renderTrendChart(node.recentTrend) : ''}
                    ${hasSuggestion ? this.renderSuggestion(node.suggestion) : ''}
                </div>
            </div>
        `;
    }

    renderAlerts(alerts) {
        return alerts.map(alert => `
            <div class="alert-banner ${alert.level}">
                <span class="alert-icon">${alert.level === 'error' ? '🚨' : '⚠️'}</span>
                <div class="alert-content">
                    <div class="alert-title">${alert.title}</div>
                    <div class="alert-message">${alert.message}</div>
                </div>
            </div>
        `).join('');
    }

    renderBaselines(baselines) {
        return `
            <div class="baseline-info">
                <div class="baseline-item">
                    <span class="baseline-label">延迟基线</span>
                    <span class="baseline-value">${baselines.latencyAvg || '--'} ms</span>
                </div>
                <div class="baseline-item">
                    <span class="baseline-label">延迟标准差</span>
                    <span class="baseline-value">${baselines.latencyStd || '--'} ms</span>
                </div>
                <div class="baseline-item">
                    <span class="baseline-label">延迟峰值</span>
                    <span class="baseline-value">${baselines.latencyMax || '--'} ms</span>
                </div>
                <div class="baseline-item">
                    <span class="baseline-label">请求基线</span>
                    <span class="baseline-value">${baselines.outstandingAvg || '--'}</span>
                </div>
            </div>
        `;
    }

    renderTrendChart(trend) {
        if (!trend.latency || trend.latency.length < 2) return '';

        const data = trend.latency.slice(-20);
        const values = data.map(d => d.v);
        const maxVal = Math.max(...values, 1);
        const minVal = Math.min(...values, 0);
        const range = maxVal - minVal || 1;

        const width = 300;
        const height = 40;
        const padding = 2;

        const points = data.map((d, i) => {
            const x = padding + (i / (data.length - 1)) * (width - padding * 2);
            const y = height - padding - ((d.v - minVal) / range) * (height - padding * 2);
            return `${x},${y}`;
        }).join(' ');

        const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;

        return `
            <div class="trend-chart">
                <div class="trend-title">延迟趋势 (最近 ${data.length} 个采样点)</div>
                <svg class="trend-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="trendGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style="stop-color:#667eea;stop-opacity:0.4" />
                            <stop offset="100%" style="stop-color:#667eea;stop-opacity:0.05" />
                        </linearGradient>
                    </defs>
                    <polygon class="trend-area" points="${areaPoints}" />
                    <polyline class="trend-line" points="${points}" />
                </svg>
            </div>
        `;
    }

    renderError(node) {
        return `<div class="error-message">连接失败: ${node.error || '无法获取数据'}</div>`;
    }

    renderStats(node, latency, outstanding, outstandingClass) {
        const stat = node.stat;
        const mntr = node.mntr;

        if (!stat && !mntr) return '';

        return `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-label">节点数量</div>
                    <div class="stat-value">${stat?.nodeCount?.toLocaleString() || '--'}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">连接数</div>
                    <div class="stat-value">${stat?.connections?.toLocaleString() || '--'}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">接收请求</div>
                    <div class="stat-value">${stat?.received?.toLocaleString() || '--'}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">发送响应</div>
                    <div class="stat-value">${stat?.sent?.toLocaleString() || '--'}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">未处理请求</div>
                    <div class="stat-value ${outstandingClass}">${outstanding.toLocaleString()}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Zxid</div>
                    <div class="stat-value" style="font-size: 12px;">${stat?.zxid || '--'}</div>
                </div>
                ${latency && (latency.min || latency.avg || latency.max) ? `
                <div class="stat-item full">
                    <div class="stat-label">延迟 (ms)</div>
                    <div class="latency-bar">
                        <div class="latency-item">
                            <div class="label">最小</div>
                            <div class="value">${latency.min}</div>
                        </div>
                        <div class="latency-item">
                            <div class="label">平均</div>
                            <div class="value">${latency.avg}</div>
                        </div>
                        <div class="latency-item">
                            <div class="label">最大</div>
                            <div class="value">${latency.max}</div>
                        </div>
                    </div>
                </div>
                ` : ''}
            </div>

            ${this.renderMntrStats(mntr)}
        `;
    }

    renderMntrStats(mntr) {
        if (!mntr || Object.keys(mntr).length === 0) return '';

        const importantMetrics = [
            { key: 'zk_avg_latency', label: '平均延迟' },
            { key: 'zk_max_latency', label: '最大延迟' },
            { key: 'zk_min_latency', label: '最小延迟' },
            { key: 'zk_packets_received', label: '接收包数' },
            { key: 'zk_packets_sent', label: '发送包数' },
            { key: 'zk_num_alive_connections', label: '活跃连接' },
            { key: 'zk_outstanding_requests', label: '未处理请求' },
            { key: 'zk_znode_count', label: 'ZNode 数量' },
            { key: 'zk_watch_count', label: 'Watch 数量' },
            { key: 'zk_ephemerals_count', label: '临时节点' },
            { key: 'zk_approximate_data_size', label: '数据大小' },
            { key: 'zk_open_file_descriptor_count', label: '打开文件数' }
        ];

        const availableMetrics = importantMetrics.filter(m => mntr[m.key] !== undefined);

        if (availableMetrics.length === 0) return '';

        return `
            <div class="section-title">详细指标</div>
            <div class="mntr-grid">
                ${availableMetrics.map(m => `
                    <div class="mntr-item">
                        <span class="mntr-key">${m.label}</span>
                        <span class="mntr-value">${this.formatValue(mntr[m.key])}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderSuggestion(suggestion) {
        const type = suggestion.type === 'error' ? 'error' : 'warning';
        const icon = suggestion.type === 'error' ? '🔴' : '⚠️';

        return `
            <div class="suggestion-panel ${type}">
                <div class="suggestion-title">
                    <span>${icon}</span>
                    <span>${suggestion.title}</span>
                </div>
                ${suggestion.description ? `<div class="suggestion-description">${suggestion.description}</div>` : ''}
                ${suggestion.steps && suggestion.steps.length > 0 ? `
                    <ol class="suggestion-steps">
                        ${suggestion.steps.map(step => `
                            <li>
                                <strong>${step.title}</strong>
                                <code>${this.escapeHtml(step.content)}</code>
                            </li>
                        `).join('')}
                    </ol>
                ` : ''}
                ${suggestion.reference ? `
                    <div class="suggestion-reference">
                        参考: <a href="${suggestion.reference}" target="_blank" rel="noopener">${suggestion.reference}</a>
                    </div>
                ` : ''}
            </div>
        `;
    }

    formatValue(value) {
        if (typeof value === 'number') {
            return value.toLocaleString();
        }
        return value;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showAddModal() {
        document.getElementById('addNodeModal').classList.add('show');
    }

    hideAddModal() {
        document.getElementById('addNodeModal').classList.remove('show');
        document.getElementById('nodeHost').value = 'localhost';
        document.getElementById('nodePort').value = '2181';
    }

    addNode() {
        const host = document.getElementById('nodeHost').value.trim();
        const port = parseInt(document.getElementById('nodePort').value);

        if (!host || !port) {
            alert('请填写完整的主机和端口');
            return;
        }

        const nodeId = `${host}:${port}`;
        if (this.customNodes.some(n => n.id === nodeId)) {
            alert('该节点已存在');
            return;
        }

        this.customNodes.push({ id: nodeId, host, port });
        localStorage.setItem('zkNodes', JSON.stringify(this.customNodes));

        if (this.ws && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify({
                type: 'addNode',
                host,
                port
            }));
        }

        this.hideAddModal();
    }

    removeNode(nodeId) {
        if (confirm('确定要移除此节点吗？')) {
            this.customNodes = this.customNodes.filter(n => n.id !== nodeId);
            localStorage.setItem('zkNodes', JSON.stringify(this.customNodes));

            if (this.ws && this.ws.readyState === 1) {
                const [host, port] = nodeId.split(':');
                this.ws.send(JSON.stringify({
                    type: 'removeNode',
                    host,
                    port: parseInt(port)
                }));
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ZooKeeperMonitor();
});
