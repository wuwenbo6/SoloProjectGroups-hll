class USBGuardian {
    constructor() {
        this.devices = [];
        this.alerts = [];
        this.currentPage = 1;
        this.pageSize = 20;
        this.logType = '';
        this.initialize();
    }

    async initialize() {
        this.bindEvents();
        this.loadInitialData();
        this.setupEventListeners();
    }

    bindEvents() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });

        document.getElementById('refreshDevicesBtn').addEventListener('click', () => {
            this.loadDevices();
        });

        document.getElementById('logTypeFilter').addEventListener('change', (e) => {
            this.logType = e.target.value;
            this.currentPage = 1;
            this.loadLogs();
        });

        document.getElementById('exportLogsBtn').addEventListener('click', () => {
            this.exportLogs();
        });

        document.getElementById('clearLogsBtn').addEventListener('click', () => {
            this.clearLogs();
        });

        document.getElementById('prevPageBtn').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadLogs();
            }
        });

        document.getElementById('nextPageBtn').addEventListener('click', () => {
            this.currentPage++;
            this.loadLogs();
        });

        document.querySelectorAll('input[name="policyMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.updatePolicyMode(e.target.value);
            });
        });

        document.getElementById('clearAlertsBtn').addEventListener('click', () => {
            this.clearAlerts();
        });

        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openSettings();
        });

        document.getElementById('closeSettingsBtn').addEventListener('click', () => {
            this.closeSettings();
        });

        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.saveSettings();
        });

        document.querySelector('.modal-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.closeSettings();
            }
        });
    }

    async loadInitialData() {
        await this.loadDevices();
        await this.loadLogs();
        await this.loadPolicies();
        await this.loadSettings();
    }

    setupEventListeners() {
        window.api.onInitialDevices((devices) => {
            this.devices = devices;
            this.updateDeviceList();
            this.updateDeviceStats();
        });

        window.api.onDeviceInserted((data) => {
            const { device, policy } = data;
            this.devices.push({ ...device, policy });
            this.updateDeviceList();
            this.updateDeviceStats();
            this.showNotification('success', '设备已连接', `${device.deviceName} 已连接`);
        });

        window.api.onDeviceRemoved((data) => {
            const { device } = data;
            this.devices = this.devices.filter(d => d.id !== device.id);
            this.updateDeviceList();
            this.updateDeviceStats();
        });

        window.api.onDeviceBlocked((data) => {
            this.addAlert('blocked', '设备已被阻止', data);
        });

        window.api.onDeviceAllowed((data) => {
            const { device } = data;
            this.addAlert('allowed', '设备已被允许', { device, message: `${device.deviceName} 已被允许访问` });
        });

        window.api.onFileOperation((data) => {
            this.loadLogs();
        });

        window.api.onUsbAlert((data) => {
            this.addAlert(data.type, data.title, { message: data.message });
        });

        window.api.onPoliciesReevaluated((data) => {
            this.devices = data.devices;
            this.updateDeviceList();
            this.updateDeviceStats();
            this.showNotification('success', '策略已更新', '已根据新策略重新评估设备');
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        });

        if (tabName === 'logs') {
            this.loadLogs();
        } else if (tabName === 'alerts') {
            this.updateAlertBadge();
        }
    }

    async loadDevices() {
        try {
            this.devices = await window.api.getDevices();
            this.updateDeviceList();
            this.updateDeviceStats();
        } catch (error) {
            console.error('Failed to load devices:', error);
        }
    }

    updateDeviceList() {
        const container = document.getElementById('deviceList');

        if (this.devices.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                        <line x1="12" y1="18" x2="12.01" y2="18"/>
                    </svg>
                    <p>暂无USB设备连接</p>
                    <small>插入USB设备后将自动显示在这里</small>
                </div>
            `;
            return;
        }

        container.innerHTML = this.devices.map(device => {
            const status = device.policy?.action || 'monitor';
            const statusClass = status === 'block' ? 'blocked' : status === 'allow' ? 'allowed' : 'monitoring';
            const statusText = status === 'block' ? '已阻止' : status === 'allow' ? '已允许' : '监控中';

            return `
                <div class="device-card ${statusClass}">
                    <div class="device-header">
                        <div class="device-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                                <line x1="12" y1="18" x2="12.01" y2="18"/>
                            </svg>
                        </div>
                        <div class="device-info">
                            <div class="device-name">${device.deviceName || '未知设备'}</div>
                            <div class="device-id">${device.id}</div>
                        </div>
                        <span class="device-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="device-details">
                        <div class="device-detail-row">
                            <span>厂商ID (VID)</span>
                            <span>${device.vendorId || 'N/A'}</span>
                        </div>
                        <div class="device-detail-row">
                            <span>产品ID (PID)</span>
                            <span>${device.productId || 'N/A'}</span>
                        </div>
                        ${device.serialNumber ? `
                        <div class="device-detail-row">
                            <span>序列号</span>
                            <span>${device.serialNumber}</span>
                        </div>
                        ` : ''}
                        ${device.manufacturer ? `
                        <div class="device-detail-row">
                            <span>制造商</span>
                            <span>${device.manufacturer}</span>
                        </div>
                        ` : ''}
                        ${device.mountPoint ? `
                        <div class="device-detail-row">
                            <span>挂载点</span>
                            <span>${device.mountPoint}</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="device-actions">
                        ${status === 'block' ? `
                            <button class="btn btn-sm" onclick="guardian.allowDevice('${device.id}')">
                                允许设备
                            </button>
                        ` : `
                            <button class="btn btn-sm btn-danger" onclick="guardian.blockDevice('${device.id}')">
                                阻止设备
                            </button>
                        `}
                        <button class="btn btn-sm" onclick="guardian.addToWhitelist('${device.id}', '${device.deviceName || '未知设备'}')">
                            加入白名单
                        </button>
                        <button class="btn btn-sm" onclick="guardian.addToBlacklist('${device.id}', '${device.deviceName || '未知设备'}')">
                            加入黑名单
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateDeviceStats() {
        const connected = this.devices.length;
        const allowed = this.devices.filter(d => d.policy?.action === 'allow').length;
        const blocked = this.devices.filter(d => d.policy?.action === 'block').length;

        document.getElementById('connectedCount').textContent = connected;
        document.getElementById('allowedCount').textContent = allowed;
        document.getElementById('blockedCount').textContent = blocked;
    }

    async loadLogs() {
        try {
            const result = await window.api.getLogs(this.pageSize, (this.currentPage - 1) * this.pageSize, this.logType);
            this.renderLogs(result);
        } catch (error) {
            console.error('Failed to load logs:', error);
        }
    }

    renderLogs(result) {
        const tbody = document.getElementById('logTableBody');
        const { logs, total } = result;

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">暂无日志记录</td></tr>';
        } else {
            tbody.innerHTML = logs.map(log => {
                const data = log.data || {};
                const deviceName = data.deviceName || data.device || '';
                const details = this.formatLogDetails(log.type, data);

                return `
                    <tr>
                        <td>${new Date(log.timestamp).toLocaleString('zh-CN')}</td>
                        <td><span class="log-type ${log.type}">${this.getLogTypeName(log.type)}</span></td>
                        <td>${deviceName || '-'}</td>
                        <td class="log-details" title="${details}">${details}</td>
                    </tr>
                `;
            }).join('');
        }

        const totalPages = Math.ceil(total / this.pageSize) || 1;
        document.getElementById('pageInfo').textContent = `第 ${this.currentPage} 页 / 共 ${totalPages} 页`;
        document.getElementById('prevPageBtn').disabled = this.currentPage <= 1;
        document.getElementById('nextPageBtn').disabled = this.currentPage >= totalPages;
    }

    getLogTypeName(type) {
        const names = {
            device_inserted: '设备插入',
            device_removed: '设备移除',
            device_blocked: '设备阻止',
            device_allowed: '设备允许',
            file_operation: '文件操作',
            system_started: '系统启动',
            system_stopped: '系统停止'
        };
        return names[type] || type;
    }

    formatLogDetails(type, data) {
        switch (type) {
            case 'device_inserted':
            case 'device_removed':
            case 'device_blocked':
            case 'device_allowed':
                return data.reason || `${data.deviceName || data.device || '设备'} 操作记录`;
            case 'file_operation':
                return `${data.type}: ${data.filePath || ''}`;
            case 'system_started':
            case 'system_stopped':
                return `主机: ${data.hostname || ''}, 平台: ${data.platform || ''}`;
            default:
                return JSON.stringify(data).substring(0, 100);
        }
    }

    async exportLogs() {
        try {
            const result = await window.api.exportLogs('json', null);
            const blob = new Blob([result.content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.filename;
            a.click();
            URL.revokeObjectURL(url);
            this.showNotification('success', '导出成功', '日志已导出为 JSON 格式');
        } catch (error) {
            console.error('Failed to export logs:', error);
            this.showNotification('danger', '导出失败', error.message);
        }
    }

    async clearLogs() {
        if (confirm('确定要清除所有日志吗？此操作不可撤销。')) {
            try {
                await window.api.clearLogs();
                this.loadLogs();
                this.showNotification('success', '清除成功', '日志已清除');
            } catch (error) {
                console.error('Failed to clear logs:', error);
                this.showNotification('danger', '清除失败', error.message);
            }
        }
    }

    async loadPolicies() {
        try {
            const policies = await window.api.getPolicies();
            
            document.querySelector(`input[name="policyMode"][value="${policies.mode}"]`).checked = true;
            
            this.renderPolicyList('whitelist', policies.whitelist);
            this.renderPolicyList('blacklist', policies.blacklist);
            
            document.getElementById('whitelistCount').textContent = policies.whitelist.length;
            document.getElementById('blacklistCount').textContent = policies.blacklist.length;
        } catch (error) {
            console.error('Failed to load policies:', error);
        }
    }

    renderPolicyList(type, items) {
        const container = document.getElementById(`${type}Container`);

        if (items.length === 0) {
            container.innerHTML = '<div class="empty-list">暂无记录</div>';
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="policy-item">
                <div class="policy-item-info">
                    <div class="policy-item-name">${item.deviceName || '未知设备'}</div>
                    <div class="policy-item-id">${item.id}${item.vendorId ? ` (VID: ${item.vendorId})` : ''}</div>
                </div>
                <button class="btn btn-sm" onclick="guardian.removeFrom${type.charAt(0).toUpperCase() + type.slice(1)}('${item.id}')">
                    移除
                </button>
            </div>
        `).join('');
    }

    async updatePolicyMode(mode) {
        try {
            const policies = await window.api.getPolicies();
            policies.mode = mode;
            await window.api.updatePolicies(policies);
            this.showNotification('success', '策略已更新', `已切换到${mode === 'whitelist' ? '白名单' : '黑名单'}模式`);
        } catch (error) {
            console.error('Failed to update policy mode:', error);
        }
    }

    async addToWhitelist(deviceId, deviceName) {
        try {
            const result = await window.api.addWhitelist({ id: deviceId, deviceName });
            if (result.success) {
                this.showNotification('success', '添加成功', result.message);
                this.loadPolicies();
            } else {
                this.showNotification('warning', '提示', result.message);
            }
        } catch (error) {
            console.error('Failed to add to whitelist:', error);
        }
    }

    async addToBlacklist(deviceId, deviceName) {
        try {
            const result = await window.api.addBlacklist({ id: deviceId, deviceName });
            if (result.success) {
                this.showNotification('success', '添加成功', result.message);
                this.loadPolicies();
                this.loadDevices();
            } else {
                this.showNotification('warning', '提示', result.message);
            }
        } catch (error) {
            console.error('Failed to add to blacklist:', error);
        }
    }

    async removeFromWhitelist(itemId) {
        try {
            const result = await window.api.removeWhitelist(itemId);
            if (result.success) {
                this.showNotification('success', '移除成功', result.message);
                this.loadPolicies();
            } else {
                this.showNotification('warning', '提示', result.message);
            }
        } catch (error) {
            console.error('Failed to remove from whitelist:', error);
        }
    }

    async removeFromBlacklist(itemId) {
        try {
            const result = await window.api.removeBlacklist(itemId);
            if (result.success) {
                this.showNotification('success', '移除成功', result.message);
                this.loadPolicies();
            } else {
                this.showNotification('warning', '提示', result.message);
            }
        } catch (error) {
            console.error('Failed to remove from blacklist:', error);
        }
    }

    async blockDevice(deviceId) {
        try {
            await window.api.blockDevice(deviceId);
            this.showNotification('warning', '设备已阻止', '设备已被阻止访问');
            this.loadDevices();
        } catch (error) {
            console.error('Failed to block device:', error);
        }
    }

    async allowDevice(deviceId) {
        try {
            await window.api.allowDevice(deviceId);
            this.showNotification('success', '设备已允许', '设备已被允许访问');
            this.loadDevices();
        } catch (error) {
            console.error('Failed to allow device:', error);
        }
    }

    addAlert(type, title, data) {
        const alert = {
            id: Date.now(),
            type,
            title,
            message: data.message || data.reason || '',
            device: data.device || null,
            timestamp: new Date().toISOString()
        };

        this.alerts.unshift(alert);
        this.renderAlerts();
        this.updateAlertBadge();
    }

    renderAlerts() {
        const container = document.getElementById('alertsContainer');

        if (this.alerts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <p>暂无报警信息</p>
                    <small>当有设备被阻止时将显示报警</small>
                </div>
            `;
            return;
        }

        container.innerHTML = this.alerts.slice(0, 50).map(alert => {
            const iconType = alert.type === 'blocked' ? 'blocked' : alert.type === 'allowed' ? 'allowed' : 'warning';
            
            return `
                <div class="alert-card ${iconType}">
                    <div class="alert-icon">
                        ${alert.type === 'blocked' ? 
                            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>' :
                            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
                        }
                    </div>
                    <div class="alert-content">
                        <div class="alert-title">${alert.title}</div>
                        <div class="alert-message">${alert.message}</div>
                        <div class="alert-time">${new Date(alert.timestamp).toLocaleString('zh-CN')}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateAlertBadge() {
        const badge = document.getElementById('alertBadge');
        const blockedCount = this.alerts.filter(a => a.type === 'blocked').length;
        
        if (blockedCount > 0) {
            badge.style.display = 'inline-flex';
            badge.textContent = blockedCount;
        } else {
            badge.style.display = 'none';
        }
    }

    clearAlerts() {
        this.alerts = [];
        this.renderAlerts();
        this.updateAlertBadge();
    }

    async loadSettings() {
        try {
            const settings = await window.api.getSettings();
            document.getElementById('autoBlockUnknown').checked = settings.autoBlockUnknown;
            document.getElementById('logFileOperations').checked = settings.logFileOperations;
            document.getElementById('showNotifications').checked = settings.showNotifications;
            document.getElementById('blockMode').value = settings.blockMode;
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    openSettings() {
        document.getElementById('settingsModal').classList.add('active');
    }

    closeSettings() {
        document.getElementById('settingsModal').classList.remove('active');
    }

    async saveSettings() {
        const settings = {
            autoBlockUnknown: document.getElementById('autoBlockUnknown').checked,
            logFileOperations: document.getElementById('logFileOperations').checked,
            showNotifications: document.getElementById('showNotifications').checked,
            blockMode: document.getElementById('blockMode').value
        };

        try {
            await window.api.updateSettings(settings);
            this.closeSettings();
            this.showNotification('success', '保存成功', '设置已保存');
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showNotification('danger', '保存失败', error.message);
        }
    }

    showNotification(type, title, message) {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-icon">
                ${type === 'success' ? 
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' :
                    type === 'danger' ?
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' :
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
                }
            </div>
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
            </div>
        `;

        container.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

const guardian = new USBGuardian();
