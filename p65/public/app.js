const { startRegistration, startAuthentication } = SimpleWebAuthnBrowser;

let currentUser = null;

const tabs = document.querySelectorAll('.tab');
const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');
const authForm = document.getElementById('authForm');
const dashboard = document.getElementById('dashboard');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        if (tab.dataset.tab === 'register') {
            registerForm.style.display = 'block';
            loginForm.style.display = 'none';
        } else {
            registerForm.style.display = 'none';
            loginForm.style.display = 'block';
        }
        hideMessage();
    });
});

function showMessage(text, type = 'info') {
    const messageEl = document.getElementById('message');
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
}

function hideMessage() {
    const messageEl = document.getElementById('message');
    messageEl.className = 'message';
}

function setButtonLoading(button, loading) {
    if (loading) {
        button.disabled = true;
        const originalText = button.querySelector('span').textContent;
        button.dataset.originalText = originalText;
        button.innerHTML = '<div class="spinner"></div><span>处理中...</span>';
    } else {
        button.disabled = false;
        const originalText = button.dataset.originalText || '确认';
        button.innerHTML = `<span>${originalText}</span>`;
    }
}

async function registerUser() {
    const username = document.getElementById('registerUsername').value.trim();
    const registerBtn = document.getElementById('registerBtn');
    
    if (!username) {
        showMessage('请输入用户名', 'error');
        return;
    }
    
    try {
        setButtonLoading(registerBtn, true);
        hideMessage();
        
        showMessage('正在准备注册...', 'info');
        
        const startResponse = await fetch('/api/register/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        
        const startData = await startResponse.json();
        
        if (!startResponse.ok) {
            throw new Error(startData.error || '注册开始失败');
        }
        
        showMessage('请使用指纹、面容或安全密钥完成认证...', 'info');
        
        let attestationResponse;
        try {
            attestationResponse = await startRegistration(startData.options);
        } catch (err) {
            if (err.name === 'InvalidStateError') {
                throw new Error('该设备已注册，请使用其他设备或直接登录');
            }
            if (err.name === 'NotAllowedError') {
                throw new Error('认证被取消，请重试');
            }
            throw err;
        }
        
        showMessage('正在验证设备...', 'info');
        
        const finishResponse = await fetch('/api/register/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: startData.sessionId,
                response: attestationResponse
            })
        });
        
        const finishData = await finishResponse.json();
        
        if (!finishResponse.ok || !finishData.verified) {
            throw new Error(finishData.error || '注册验证失败');
        }
        
        currentUser = finishData.user;
        
        const deviceText = startData.isNewUser 
            ? `注册成功！已绑定 ${finishData.deviceCount} 个认证设备`
            : `设备绑定成功！当前已绑定 ${finishData.deviceCount} 个认证设备`;
        
        showMessage(deviceText, 'success');
        
        setTimeout(() => {
            showDashboard();
        }, 1500);
        
    } catch (error) {
        console.error('注册错误:', error);
        showMessage(error.message || '注册失败，请重试', 'error');
    } finally {
        setButtonLoading(registerBtn, false);
    }
}

async function loginUser() {
    const username = document.getElementById('loginUsername').value.trim();
    const loginBtn = document.getElementById('loginBtn');
    
    if (!username) {
        showMessage('请输入用户名', 'error');
        return;
    }
    
    try {
        setButtonLoading(loginBtn, true);
        hideMessage();
        
        showMessage('正在准备登录...', 'info');
        
        const startResponse = await fetch('/api/login/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        
        const startData = await startResponse.json();
        
        if (!startResponse.ok) {
            throw new Error(startData.error || '登录开始失败');
        }
        
        showMessage(`检测到 ${startData.deviceCount} 个认证设备，请完成认证...`, 'info');
        
        let assertionResponse;
        try {
            assertionResponse = await startAuthentication(startData.options);
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                throw new Error('认证被取消，请重试');
            }
            throw err;
        }
        
        showMessage('正在验证身份...', 'info');
        
        const finishResponse = await fetch('/api/login/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: startData.sessionId,
                response: assertionResponse
            })
        });
        
        const finishData = await finishResponse.json();
        
        if (!finishResponse.ok || !finishData.verified) {
            throw new Error(finishData.error || '登录验证失败');
        }
        
        currentUser = finishData.user;
        
        const riskData = {
            riskScore: finishData.riskScore || 0,
            riskDetails: finishData.riskDetails || []
        };
        
        showMessage(`登录成功！当前已绑定 ${finishData.deviceCount} 个认证设备`, 'success');
        
        setTimeout(() => {
            showDashboard(riskData);
        }, 1500);
        
    } catch (error) {
        console.error('登录错误:', error);
        showMessage(error.message || '登录失败，请重试', 'error');
    } finally {
        setButtonLoading(loginBtn, false);
    }
}

async function loadUserDevices() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`/api/user/devices?userId=${currentUser.id}`);
        const data = await response.json();
        
        if (response.ok) {
            renderDevices(data.devices);
        }
    } catch (error) {
        console.error('加载设备列表错误:', error);
    }
}

function renderDevices(devices) {
    const container = document.getElementById('devicesContainer');
    
    if (devices.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center;">暂无绑定的设备</p>';
        return;
    }
    
    container.innerHTML = devices.map((device, index) => `
        <div class="device-item" data-credential-id="${device.credentialId}">
            <div class="device-info">
                <div class="device-type">${getDeviceTypeName(device.deviceType)}</div>
                <div class="device-date">
                    绑定时间: ${formatDate(device.createdAt)}
                    ${device.lastUsedAt ? `<br>上次使用: ${formatDate(device.lastUsedAt)}` : ''}
                </div>
            </div>
            <div class="device-actions">
                ${device.backedUp ? '<span class="device-badge">已备份</span>' : ''}
                ${devices.length > 1 ? `
                    <button class="btn-delete" data-credential-id="${device.credentialId}" data-index="${index}">
                        解绑
                    </button>
                ` : '<span style="font-size: 12px; color: #999;">当前设备</span>'}
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const credentialId = e.target.dataset.credentialId;
            const index = parseInt(e.target.dataset.index);
            showDeleteConfirm(credentialId, index);
        });
    });
}

let pendingDelete = null;

function showDeleteConfirm(credentialId, index) {
    pendingDelete = { credentialId, index };
    const dialog = document.getElementById('confirmDialog');
    const message = document.getElementById('confirmMessage');
    const btn = document.querySelector(`.btn-delete[data-credential-id="${credentialId}"]`);
    
    message.textContent = '确定要解绑此认证设备吗？解绑后该设备将无法用于登录。';
    dialog.classList.remove('hidden');
}

function hideDeleteConfirm() {
    pendingDelete = null;
    const dialog = document.getElementById('confirmDialog');
    dialog.classList.add('hidden');
}

async function confirmDelete() {
    if (!pendingDelete) return;
    
    const { credentialId, index } = pendingDelete;
    const btn = document.querySelector(`.btn-delete[data-credential-id="${credentialId}"]`);
    
    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '解绑中...';
        }
        
        const response = await fetch(`/api/user/devices/${encodeURIComponent(credentialId)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || '解绑失败');
        }
        
        showMessage('设备已成功解绑', 'success');
        hideDeleteConfirm();
        await loadUserDevices();
        
    } catch (error) {
        console.error('删除设备错误:', error);
        showMessage(error.message || '设备解绑失败', 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = '解绑';
        }
        hideDeleteConfirm();
    }
}

function getDeviceTypeName(type) {
    const typeMap = {
        'single-device': '单设备认证',
        'multi-device': '多设备认证',
        'cross-platform': '跨平台认证器'
    };
    return typeMap[type] || type || '认证设备';
}

function formatDate(dateString) {
    if (!dateString) return '未知';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function addNewDevice() {
    if (!currentUser) return;
    
    try {
        const addDeviceBtn = document.getElementById('addDeviceBtn');
        setButtonLoading(addDeviceBtn, true);
        
        showMessage('正在准备绑定新设备...', 'info');
        
        const startResponse = await fetch('/api/register/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username })
        });
        
        const startData = await startResponse.json();
        
        if (!startResponse.ok) {
            throw new Error(startData.error || '准备失败');
        }
        
        showMessage('请使用新的认证设备完成注册...', 'info');
        
        let attestationResponse;
        try {
            attestationResponse = await startRegistration(startData.options);
        } catch (err) {
            if (err.name === 'InvalidStateError') {
                throw new Error('该设备已绑定，请使用其他设备');
            }
            if (err.name === 'NotAllowedError') {
                throw new Error('认证被取消');
            }
            throw err;
        }
        
        showMessage('正在验证新设备...', 'info');
        
        const finishResponse = await fetch('/api/register/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: startData.sessionId,
                response: attestationResponse
            })
        });
        
        const finishData = await finishResponse.json();
        
        if (!finishResponse.ok || !finishData.verified) {
            throw new Error(finishData.error || '设备绑定失败');
        }
        
        showMessage(`新设备绑定成功！当前已绑定 ${finishData.deviceCount} 个认证设备`, 'success');
        
        await loadUserDevices();
        
    } catch (error) {
        console.error('添加设备错误:', error);
        showMessage(error.message || '设备绑定失败', 'error');
    } finally {
        const addDeviceBtn = document.getElementById('addDeviceBtn');
        setButtonLoading(addDeviceBtn, false);
    }
}

function showDashboard(riskData = null) {
    authForm.classList.remove('active');
    dashboard.classList.add('active');
    
    document.getElementById('welcomeUser').textContent = currentUser.username;
    
    if (riskData && riskData.riskScore > 0) {
        showRiskAlert(riskData);
    }
    
    loadSecurityData();
    initSecurityTabs();
    hideMessage();
}

function showRiskAlert(riskData) {
    const alertEl = document.getElementById('riskAlert');
    let level = 'low';
    let icon = '✅';
    
    if (riskData.riskScore >= 50) {
        level = 'high';
        icon = '⚠️';
    } else if (riskData.riskScore >= 30) {
        level = 'medium';
        icon = '⚡';
    }
    
    const messages = riskData.riskDetails?.map(d => d.message).join('；') || '检测到安全风险';
    
    alertEl.innerHTML = `
        <span>${icon}</span>
        <span>${messages}</span>
    `;
    alertEl.className = `risk-alert ${level}`;
}

function initSecurityTabs() {
    const tabs = document.querySelectorAll('.security-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabName = tab.dataset.secTab;
            document.querySelectorAll('.security-section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(`section-${tabName}`).classList.add('active');
            
            if (tabName === 'recovery') {
                loadRecoveryCodes();
            } else if (tabName === 'logs') {
                loadAuditLogs();
            }
        });
    });
}

async function loadSecurityData() {
    try {
        const response = await fetch(`/api/user/security-summary?userId=${currentUser.id}`);
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('statDevices').textContent = data.devices;
            document.getElementById('statRecoveryCodes').textContent = data.recoveryCodes.unused;
            document.getElementById('statKnownIps').textContent = data.knownIps;
            document.getElementById('statLogs').textContent = data.recentActivity.length;
        }
    } catch (error) {
        console.error('加载安全数据错误:', error);
    }
    
    await loadUserDevices();
}

async function loadRecoveryCodes() {
    try {
        const response = await fetch(`/api/recovery-codes?userId=${currentUser.id}`);
        const data = await response.json();
        
        if (response.ok) {
            renderRecoveryCodes(data.codes);
        }
    } catch (error) {
        console.error('加载恢复码错误:', error);
    }
}

function renderRecoveryCodes(codes) {
    const container = document.getElementById('recoveryCodesList');
    const display = document.getElementById('recoveryCodesDisplay');
    
    display.innerHTML = '';
    
    if (codes.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">尚未生成恢复码</p>';
        return;
    }
    
    container.innerHTML = codes.map(code => `
        <div class="recovery-code ${code.used ? 'used' : ''}">
            <span class="recovery-code-prefix">${code.prefix}****</span>
            <span class="recovery-code-status ${code.used ? 'used' : 'unused'}">
                ${code.used ? '已使用' : '未使用'}
            </span>
        </div>
    `).join('');
}

async function generateRecoveryCodes() {
    const btn = document.getElementById('generateRecoveryCodesBtn');
    
    try {
        setButtonLoading(btn, true);
        
        const response = await fetch('/api/recovery-codes/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || '生成失败');
        }
        
        const display = document.getElementById('recoveryCodesDisplay');
        display.innerHTML = `
            <div class="recovery-codes-display">
                <h4>📋 请立即保存这些恢复码！</h4>
                <div class="recovery-codes-grid">
                    ${data.codes.map(code => `<div class="recovery-code-item">${code}</div>`).join('')}
                </div>
            </div>
        `;
        
        showMessage('恢复码已生成！请立即保存', 'success');
        await loadRecoveryCodes();
        await loadSecurityData();
        
    } catch (error) {
        console.error('生成恢复码错误:', error);
        showMessage(error.message || '生成失败', 'error');
    } finally {
        setButtonLoading(btn, false);
    }
}

async function loadAuditLogs() {
    try {
        const response = await fetch(`/api/audit-logs?userId=${currentUser.id}&limit=20`);
        const data = await response.json();
        
        if (response.ok) {
            renderAuditLogs(data.logs);
        }
    } catch (error) {
        console.error('加载审计日志错误:', error);
    }
}

function getEventTypeName(type) {
    const types = {
        'login_success': '登录成功',
        'device_registered': '设备注册',
        'device_removed': '设备移除',
        'recovery_code_used': '恢复码使用',
        'recovery_codes_generated': '恢复码生成',
        'recovery_code_failed': '恢复码验证失败',
        'audit_log_exported': '日志导出'
    };
    return types[type] || type;
}

function renderAuditLogs(logs) {
    const container = document.getElementById('auditLogsContainer');
    
    if (logs.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">暂无日志记录</p>';
        return;
    }
    
    container.innerHTML = logs.map(log => `
        <div class="audit-log-item">
            <div class="audit-log-header">
                <span class="audit-log-type">
                    <span class="event-badge ${log.event_type}">${getEventTypeName(log.event_type)}</span>
                </span>
                <span class="audit-log-time">${formatDate(log.created_at)}</span>
            </div>
            ${log.risk_score > 0 ? `<div class="audit-log-details">风险评分: ${log.risk_score}</div>` : ''}
            ${log.ip_address ? `<div class="audit-log-ip">IP: ${log.ip_address}</div>` : ''}
        </div>
    `).join('');
}

function exportAuditLogs() {
    window.open(`/api/audit-logs/export?userId=${currentUser.id}`, '_blank');
}

function logout() {
    currentUser = null;
    dashboard.classList.remove('active');
    authForm.classList.add('active');
    
    document.getElementById('registerUsername').value = '';
    document.getElementById('loginUsername').value = '';
    document.getElementById('riskAlert').innerHTML = '';
    document.getElementById('riskAlert').className = '';
    
    showMessage('已退出登录', 'info');
}

document.getElementById('registerBtn').addEventListener('click', registerUser);
document.getElementById('loginBtn').addEventListener('click', loginUser);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('addDeviceBtn').addEventListener('click', addNewDevice);
document.getElementById('generateRecoveryCodesBtn').addEventListener('click', generateRecoveryCodes);
document.getElementById('exportLogsBtn').addEventListener('click', exportAuditLogs);

document.getElementById('confirmCancel').addEventListener('click', hideDeleteConfirm);
document.getElementById('confirmOK').addEventListener('click', confirmDelete);

document.getElementById('registerUsername').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') registerUser();
});

document.getElementById('loginUsername').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginUser();
});
