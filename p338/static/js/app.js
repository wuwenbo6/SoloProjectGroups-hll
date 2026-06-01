class ClickHouseSimulator {
    constructor() {
        this.currentTab = 'all';
        this.replicaData = {};
        this.zkData = null;
        this.isPaused = false;
        this.highlightedReplica = null;
        this.allConflicts = [];
        this.allDedup = [];
        this.latencyReport = null;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.startPolling();
        this.initialLoad();
    }
    
    async initialLoad() {
        await Promise.all([
            this.fetchStatus(),
            this.fetchZKStatus()
        ]);
    }
    
    bindEvents() {
        document.getElementById('insert-btn').addEventListener('click', () => this.handleInsert());
        document.getElementById('pause-btn').addEventListener('click', () => this.handlePause());
        document.getElementById('resume-btn').addEventListener('click', () => this.handleResume());
        document.getElementById('reset-btn').addEventListener('click', () => this.handleReset());
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleTabChange(e.target.dataset.tab));
        });
        
        document.querySelectorAll('.quick-insert').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.getElementById('data-content').value = e.target.dataset.content;
            });
        });
        
        document.getElementById('data-content').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                this.handleInsert();
            }
        });
        
        document.getElementById('export-report-btn').addEventListener('click', () => this.handleExportReport());
    }
    
    startPolling() {
        setInterval(() => this.fetchStatus(), 500);
        setInterval(() => this.fetchZKStatus(), 1000);
        setInterval(() => this.fetchLatencyReport(), 2000);
    }
    
    async fetchStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            this.isPaused = data.isPaused;
            this.allConflicts = data.conflicts || [];
            this.updateHeaderStats(data);
            this.updateReplicaCards(data.replicas);
            this.updateDataTable(data.replicas);
            this.updateSimulationStatus();
            this.fetchDedupRecords();
        } catch (error) {
            console.error('Failed to fetch status:', error);
        }
    }
    
    async fetchZKStatus() {
        try {
            const response = await fetch('/api/zk/status');
            const data = await response.json();
            
            this.zkData = data;
            this.updateZKTree(data.tree);
            this.updatePartLog(data.partLog);
            this.updateConflictLog(data.conflictLog);
            this.updateReplicationLog(data.replicationLog);
        } catch (error) {
            console.error('Failed to fetch ZK status:', error);
        }
    }
    
    async fetchLatencyReport() {
        try {
            const response = await fetch('/api/latency-report');
            const data = await response.json();
            this.latencyReport = data;
            this.updateLatencyStats(data);
        } catch (error) {
            console.error('Failed to fetch latency report:', error);
        }
    }
    
    async fetchDedupRecords() {
        try {
            const response = await fetch('/api/dedup');
            const data = await response.json();
            this.allDedup = data.dedupRecords || [];
            this.updateDedupLog(this.allDedup);
        } catch (error) {
            console.error('Failed to fetch dedup records:', error);
        }
    }
    
    updateHeaderStats(data) {
        document.getElementById('total-blocks').textContent = data.totalDataBlocks;
        document.getElementById('total-conflicts').textContent = data.conflictCount || 0;
        document.getElementById('total-dedup').textContent = data.dedupCount || 0;
        document.getElementById('leader-replica').textContent = data.leader ? 
            this.getReplicaName(data.leader) : '-';
        
        let totalParts = 0;
        let totalLatency = 0;
        let latencyCount = 0;
        data.replicas.forEach(r => {
            totalParts += r.partLogCount || 0;
            if (r.latencyStats) {
                totalLatency += r.latencyStats.avg_ms * r.latencyStats.count;
                latencyCount += r.latencyStats.count;
            }
        });
        document.getElementById('total-parts').textContent = totalParts;
        
        const avgLatencyEl = document.getElementById('avg-latency');
        if (latencyCount > 0) {
            const avgLatency = (totalLatency / latencyCount).toFixed(1);
            avgLatencyEl.textContent = `${avgLatency} ms`;
        } else {
            avgLatencyEl.textContent = '-';
        }
        
        const hasSyncing = data.replicas.some(r => r.status === 'syncing');
        const hasConflicts = (data.conflictCount || 0) > 0;
        const clusterStatus = document.getElementById('cluster-status');
        if (hasConflicts) {
            clusterStatus.textContent = '存在冲突';
            clusterStatus.parentElement.classList.remove('status-online');
            clusterStatus.parentElement.style.color = 'var(--danger)';
        } else if (hasSyncing) {
            clusterStatus.textContent = '同步中';
            clusterStatus.parentElement.classList.add('status-online');
            clusterStatus.parentElement.style.color = '';
        } else {
            clusterStatus.textContent = '健康';
            clusterStatus.parentElement.classList.add('status-online');
            clusterStatus.parentElement.style.color = '';
        }
    }
    
    getReplicaName(replicaId) {
        const names = {
            'replica-1': '副本1',
            'replica-2': '副本2',
            'replica-3': '副本3'
        };
        return names[replicaId] || replicaId;
    }
    
    updateReplicaCards(replicas) {
        const grid = document.getElementById('replicas-grid');
        
        if (grid.children.length === 0) {
            replicas.forEach((replica, index) => {
                this.populateReplicaSelect(replica);
            });
        }
        
        grid.innerHTML = replicas.map(replica => this.renderReplicaCard(replica)).join('');
        
        replicas.forEach(replica => {
            this.replicaData[replica.id] = replica;
        });
    }
    
    populateReplicaSelect(replica) {
        const select = document.getElementById('target-replica');
        const option = document.createElement('option');
        option.value = replica.id;
        option.textContent = `${replica.name} (${replica.host}:${replica.port})`;
        if (replica.isLeader) {
            option.textContent += ' - Leader';
        }
        select.appendChild(option);
    }
    
    renderReplicaCard(replica) {
        const cardClass = [
            'replica-card',
            replica.isLeader ? 'leader' : '',
            replica.status === 'syncing' ? 'syncing' : '',
            this.highlightedReplica === replica.id ? 'highlight' : ''
        ].filter(Boolean).join(' ');
        
        const syncQueueHtml = replica.syncQueue.length > 0 
            ? replica.syncQueue.map(item => this.renderSyncItem(item)).join('')
            : '<div class="sync-empty">暂无同步任务</div>';
        
        const conflictCount = replica.conflictCount || 0;
        const partCount = replica.partLogCount || 0;
        const dedupCount = replica.dedupCount || 0;
        const latencyStats = replica.latencyStats || {};
        
        return `
            <div class="${cardClass}" id="card-${replica.id}">
                <div class="replica-header">
                    <div class="replica-info">
                        <h3>
                            ${replica.name}
                            ${replica.isLeader ? '<span class="leader-badge">Leader</span>' : ''}
                        </h3>
                        <div class="replica-host">${replica.host}:${replica.port}</div>
                    </div>
                    <div class="replica-status ${replica.status}">
                        <span class="status-indicator"></span>
                        ${replica.status === 'online' ? '在线' : '同步中'}
                    </div>
                </div>
                
                <div class="replica-stats four-col">
                    <div class="replica-stat">
                        <div class="replica-stat-label">数据块</div>
                        <div class="replica-stat-value accent">${replica.dataCount}</div>
                    </div>
                    <div class="replica-stat">
                        <div class="replica-stat-label">Part数</div>
                        <div class="replica-stat-value" style="color: #3b82f6;">${partCount}</div>
                    </div>
                    <div class="replica-stat">
                        <div class="replica-stat-label">冲突</div>
                        <div class="replica-stat-value" style="color: ${conflictCount > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${conflictCount}</div>
                    </div>
                    <div class="replica-stat">
                        <div class="replica-stat-label">去重</div>
                        <div class="replica-stat-value" style="color: ${dedupCount > 0 ? '#f59e0b' : 'var(--text-muted)'};">${dedupCount}</div>
                    </div>
                </div>
                ${latencyStats && latencyStats.count > 0 ? `
                <div class="replica-latency">
                    <span class="latency-mini-label">延迟:</span>
                    <span class="latency-mini-value">avg ${latencyStats.avg_ms}ms</span>
                    <span class="latency-mini-value">P95 ${latencyStats.p95_ms}ms</span>
                </div>
                ` : ''}
                
                <div class="sync-section">
                    <div class="sync-title">同步队列 (${replica.syncQueue.length})</div>
                    ${syncQueueHtml}
                </div>
            </div>
        `;
    }
    
    renderSyncItem(item) {
        const statusText = {
            'pending': '等待中',
            'downloading': '下载中',
            'applying': '应用中',
            'completed': '已完成'
        };
        
        return `
            <div class="sync-item">
                <div class="sync-item-header">
                    <span class="sync-block-id">${item.block_id.substring(0, 12)}...</span>
                    <span class="sync-status ${item.status}">${statusText[item.status] || item.status}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${item.progress}%"></div>
                </div>
            </div>
        `;
    }
    
    updateZKTree(tree) {
        const container = document.getElementById('zk-tree');
        container.innerHTML = this.renderTreeNode(tree, true);
    }
    
    renderTreeNode(node, isRoot = false, expandedPaths = new Set(['/', '/clickhouse'])) {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedPaths.has(node.path) || isRoot;
        
        const valueStr = node.value ? JSON.stringify(node.value).substring(0, 50) : '';
        
        let html = `
            <div class="tree-node ${node.ephemeral ? 'ephemeral' : ''}" data-path="${node.path}">
                <div class="tree-node-content">
                    <span class="tree-toggle">${hasChildren ? (isExpanded ? '▼' : '▶') : '•'}</span>
                    <span class="tree-icon">${hasChildren ? '📁' : '📄'}</span>
                    <span class="tree-path">${this.getNodeName(node.path)}</span>
                </div>
                ${valueStr ? `<div class="tree-value">${valueStr}${valueStr.length >= 50 ? '...' : ''}</div>` : ''}
            </div>
        `;
        
        if (hasChildren && isExpanded) {
            html += `<div class="tree-children">`;
            for (const child of node.children) {
                html += this.renderTreeNode(child, false, expandedPaths);
            }
            html += `</div>`;
        }
        
        return html;
    }
    
    getNodeName(path) {
        if (path === '/') return '/';
        const parts = path.split('/');
        return parts[parts.length - 1];
    }
    
    updatePartLog(logs) {
        const container = document.getElementById('part-log-list');
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<div class="part-entry" style="text-align: center; color: var(--text-muted);">暂无增量日志</div>';
            return;
        }
        
        const recentLogs = logs.slice(-8).reverse();
        
        container.innerHTML = recentLogs.map(log => {
            const time = new Date(log.timestamp * 1000).toLocaleTimeString();
            const opText = {
                'INSERT': '插入',
                'REPLICATE': '复制',
                'CONFLICT_REJECTED': '冲突拒绝'
            };
            
            return `
                <div class="part-entry">
                    <div class="log-entry-header">
                        <span class="log-entry-id">${log.part_id}</span>
                        <span class="part-operation ${log.operation}">${opText[log.operation] || log.operation}</span>
                    </div>
                    <div class="log-entry-content">
                        分区 <strong>${log.partition_key}</strong> v${log.prev_version}→v${log.version}
                    </div>
                    <div class="log-entry-time" style="margin-top: 2px;">${time} · ${this.getReplicaName(log.source_replica)}</div>
                </div>
            `;
        }).join('');
    }
    
    updateConflictLog(logs) {
        const container = document.getElementById('conflict-log-list');
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<div class="conflict-entry" style="text-align: center; color: var(--text-muted);">暂无冲突</div>';
            return;
        }
        
        const recentLogs = logs.slice(-6).reverse();
        
        container.innerHTML = recentLogs.map(log => {
            const time = new Date(log.resolved_at * 1000).toLocaleTimeString();
            const resText = {
                'version_wins': '版本优先',
                'timestamp_wins': '时间戳优先',
                'id_tiebreak': 'ID决胜'
            };
            
            return `
                <div class="conflict-entry">
                    <div class="log-entry-header">
                        <span class="log-entry-id">${log.conflict_id}</span>
                        <span class="log-entry-time">${time}</span>
                    </div>
                    <div class="log-entry-content">
                        分区 <strong>${log.partition_key}</strong> 
                        v${log.local_version}(本地) vs v${log.remote_version}(远程)
                    </div>
                    <div class="conflict-resolution">
                        <span class="conflict-resolution-tag ${log.resolution}">${resText[log.resolution] || log.resolution}</span>
                        <span class="winner-tag">→ ${this.getReplicaName(log.winner_source)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    updateDedupLog(logs) {
        const container = document.getElementById('dedup-log-list');
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<div class="dedup-entry" style="text-align: center; color: var(--text-muted);">暂无去重记录</div>';
            return;
        }
        
        const recentLogs = logs.slice(-6);
        
        container.innerHTML = recentLogs.map(log => {
            const time = new Date(log.detected_at * 1000).toLocaleTimeString();
            
            return `
                <div class="dedup-entry">
                    <div class="log-entry-header">
                        <span class="log-entry-id">${log.content_hash.substring(0, 12)}...</span>
                        <span class="log-entry-time">${time}</span>
                    </div>
                    <div class="log-entry-content">
                        分区 <strong>${log.partition_key || '-'}</strong> 
                        <br>
                        <span style="font-size: 11px; color: var(--text-muted);">
                            检测: ${this.getReplicaName(log.detected_by)}
                        </span>
                    </div>
                    <div class="dedup-info">
                        <span class="dedup-tag">已去重</span>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    updateLatencyStats(report) {
        if (!report || !report.overall) return;
        
        const overall = report.overall;
        
        document.getElementById('latency-avg').textContent = overall.count > 0 ? `${overall.avg_ms} ms` : '- ms';
        document.getElementById('latency-p50').textContent = overall.count > 0 ? `${overall.p50_ms} ms` : '- ms';
        document.getElementById('latency-p95').textContent = overall.count > 0 ? `${overall.p95_ms} ms` : '- ms';
        document.getElementById('latency-p99').textContent = overall.count > 0 ? `${overall.p99_ms} ms` : '- ms';
        document.getElementById('latency-min').textContent = overall.count > 0 ? `${overall.min_ms} ms` : '- ms';
        document.getElementById('latency-max').textContent = overall.count > 0 ? `${overall.max_ms} ms` : '- ms';
        document.getElementById('latency-count').textContent = overall.count;
    }
    
    async handleExportReport() {
        try {
            const response = await fetch('/api/latency-report/export');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'latency_report.txt';
            if (contentDisposition) {
                const matches = contentDisposition.match(/filename="?(.+?)"?$/);
                if (matches) {
                    filename = matches[1];
                }
            }
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.showToast('延迟报告已导出', 'success');
        } catch (error) {
            console.error('Failed to export report:', error);
            this.showToast('导出失败，请重试', 'error');
        }
    }
    
    updateReplicationLog(logs) {
        const container = document.getElementById('replication-log');
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<div class="log-entry" style="text-align: center; color: var(--text-muted);">暂无复制日志</div>';
            return;
        }
        
        const recentLogs = logs.slice(-6).reverse();
        
        container.innerHTML = recentLogs.map(log => {
            const isCompleted = log.completed_replicas.length === log.replicas_to_sync.length;
            const time = new Date(log.timestamp * 1000).toLocaleTimeString();
            
            const badges = log.replicas_to_sync.map(rid => {
                const isDone = log.completed_replicas.includes(rid);
                return `<span class="replica-badge ${isDone ? 'completed' : ''}">${this.getReplicaName(rid)}</span>`;
            }).join('');
            
            return `
                <div class="log-entry ${isCompleted ? 'completed' : ''}">
                    <div class="log-entry-header">
                        <span class="log-entry-id">${log.id}</span>
                        <span class="log-entry-time">${time}</span>
                    </div>
                    <div class="log-entry-content">
                        块 ${log.block_id.substring(0, 12)}... 来自 ${this.getReplicaName(log.source_replica)}
                        ${log.partition_key ? ` · 分区 ${log.partition_key} v${log.version}` : ''}
                    </div>
                    <div class="log-entry-progress">
                        ${badges}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    updateDataTable(replicas) {
        const tbody = document.getElementById('data-table-body');
        
        const leaderReplica = replicas.find(r => r.isLeader);
        const allData = [];
        const conflictPartitionKeys = new Set();
        
        (this.allConflicts || []).forEach(c => {
            conflictPartitionKeys.add(c.partition_key);
        });
        
        replicas.forEach(replica => {
            replica.data.forEach(block => {
                const existing = allData.find(d => d.id === block.id);
                if (!existing) {
                    allData.push({
                        ...block,
                        syncedReplicas: [replica.id]
                    });
                } else {
                    existing.syncedReplicas.push(replica.id);
                }
            });
            
            replica.syncQueue.forEach(item => {
                const existing = allData.find(d => d.id === item.block_id);
                if (!existing) {
                    allData.push({
                        id: item.block_id,
                        block_number: '?',
                        content: '同步中...',
                        source_replica: item.source_replica,
                        timestamp: item.start_time,
                        syncedReplicas: replicas
                            .filter(r => r.id !== item.source_replica)
                            .filter(r => r.data.some(d => d.id === item.block_id))
                            .map(r => r.id),
                        syncing: true,
                        syncProgress: item.progress,
                        syncStatus: item.status,
                        version: 0,
                        partition_key: ''
                    });
                }
            });
        });
        
        let filteredData;
        if (this.currentTab === 'conflicts') {
            filteredData = allData.filter(d => d.partition_key && conflictPartitionKeys.has(d.partition_key));
        } else if (this.currentTab === 'syncing') {
            filteredData = allData.filter(d => d.syncing || d.syncedReplicas.length < replicas.length);
        } else {
            filteredData = allData;
        }
        
        filteredData.sort((a, b) => b.timestamp - a.timestamp);
        
        if (filteredData.length === 0) {
            const colCount = 7;
            tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty">${this.currentTab === 'conflicts' ? '暂无冲突数据' : '暂无数据'}</td></tr>`;
            return;
        }
        
        tbody.innerHTML = filteredData.map(block => {
            const syncCount = block.syncedReplicas.length;
            const totalReplicas = replicas.length;
            const syncPercent = Math.round((syncCount / totalReplicas) * 100);
            const isConflict = block.partition_key && conflictPartitionKeys.has(block.partition_key);
            
            let syncHtml = '';
            if (block.syncing) {
                const statusText = {
                    'pending': '等待中',
                    'downloading': '下载中',
                    'applying': '应用中'
                };
                syncHtml = `
                    <div class="sync-status-cell">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${block.syncProgress}%"></div>
                        </div>
                        <span class="sync-status-text">${statusText[block.syncStatus] || block.syncStatus}</span>
                    </div>
                `;
            } else {
                syncHtml = `
                    <div class="sync-status-cell">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${syncPercent}%; background: linear-gradient(90deg, var(--success) 0%, #059669 100%);"></div>
                        </div>
                        <span class="sync-status-text">${syncCount}/${totalReplicas} 副本</span>
                    </div>
                `;
            }
            
            const isSourceLeader = leaderReplica && block.source_replica === leaderReplica.id;
            
            return `
                <tr class="${isConflict ? 'conflict-row' : ''}">
                    <td><span class="block-number">#${block.block_number}</span></td>
                    <td><span class="partition-key">${block.partition_key || '-'}</span></td>
                    <td><span class="version-badge">v${block.version || '?'}</span></td>
                    <td><span class="data-content">${block.content}</span></td>
                    <td><span class="source-replica ${isSourceLeader ? 'leader' : ''}">${this.getReplicaName(block.source_replica)}</span></td>
                    <td><span class="timestamp">${new Date(block.timestamp * 1000).toLocaleString()}</span></td>
                    <td>${syncHtml}</td>
                </tr>
            `;
        }).join('');
    }
    
    updateSimulationStatus() {
        const statusEl = document.getElementById('simulation-status');
        const pauseBtn = document.getElementById('pause-btn');
        const resumeBtn = document.getElementById('resume-btn');
        
        if (this.isPaused) {
            statusEl.innerHTML = '<span class="status-indicator paused"></span>同步已暂停';
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = 'flex';
        } else {
            statusEl.innerHTML = '<span class="status-indicator running"></span>同步正常运行中';
            pauseBtn.style.display = 'flex';
            resumeBtn.style.display = 'none';
        }
    }
    
    handleTabChange(tab) {
        this.currentTab = tab;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        
        if (Object.keys(this.replicaData).length > 0) {
            this.updateDataTable(Object.values(this.replicaData));
        }
    }
    
    async handleInsert() {
        const replicaId = document.getElementById('target-replica').value;
        const content = document.getElementById('data-content').value.trim();
        
        if (!content) {
            this.showToast('请输入SQL语句', 'warning');
            return;
        }
        
        try {
            const response = await fetch('/api/insert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ replicaId, content })
            });
            
            const data = await response.json();
            
            if (data.success) {
                if (data.is_duplicate) {
                    const duplicateOf = data.duplicate_of ? ` (重复块: ${data.duplicate_of.substring(0, 12)}...)` : '';
                    this.showToast(`检测到重复数据，已跳过插入${duplicateOf}`, 'warning');
                    document.getElementById('data-content').value = '';
                } else {
                    const versionInfo = data.version ? ` v${data.version}` : '';
                    const partInfo = data.part_id ? ` [${data.part_id.substring(0, 12)}...]` : '';
                    const hashInfo = data.content_hash ? ` [hash: ${data.content_hash.substring(0, 8)}...]` : '';
                    this.showToast(`数据已插入到 ${this.getReplicaName(replicaId)}${versionInfo}${partInfo}${hashInfo}`, 'success');
                    document.getElementById('data-content').value = '';
                    
                    this.highlightedReplica = replicaId;
                    setTimeout(() => {
                        this.highlightedReplica = null;
                    }, 1000);
                }
            } else {
                this.showToast(data.message || '插入失败', 'error');
            }
        } catch (error) {
            this.showToast('网络错误，请重试', 'error');
        }
    }
    
    async handlePause() {
        try {
            const response = await fetch('/api/control/pause', { method: 'POST' });
            const data = await response.json();
            
            if (data.success) {
                this.showToast('同步已暂停', 'warning');
            }
        } catch (error) {
            this.showToast('操作失败', 'error');
        }
    }
    
    async handleResume() {
        try {
            const response = await fetch('/api/control/resume', { method: 'POST' });
            const data = await response.json();
            
            if (data.success) {
                this.showToast('同步已恢复', 'success');
            }
        } catch (error) {
            this.showToast('操作失败', 'error');
        }
    }
    
    async handleReset() {
        if (!confirm('确定要重置整个集群吗？所有数据将被清除。')) {
            return;
        }
        
        try {
            const response = await fetch('/api/control/reset', { method: 'POST' });
            const data = await response.json();
            
            if (data.success) {
                this.showToast('集群已重置', 'info');
            }
        } catch (error) {
            this.showToast('操作失败', 'error');
        }
    }
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        
        toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.simulator = new ClickHouseSimulator();
});
