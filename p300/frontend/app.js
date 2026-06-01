let currentCert = null;
let callId = null;

function showTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('[id$="-tab"]').forEach(el => el.classList.add('hidden'));
    
    event.target.classList.add('active');
    document.getElementById(tab + '-tab').classList.remove('hidden');
}

async function generateCertificate() {
    const username = document.getElementById('cert-username').value.trim();
    const domain = document.getElementById('cert-domain').value.trim();
    if (!username) {
        showStatus('cert-status', '请输入用户名', 'error');
        return;
    }

    try {
        showStatus('cert-status', '正在生成证书...', 'info');
        
        const response = await fetch('/api/generate-cert', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, domain })
        });

        const data = await response.json();

        if (data.success) {
            currentCert = data;
            document.getElementById('ca-cert-display').textContent = data.CAPEM;
            document.getElementById('client-cert-display').textContent = data.CertPEM;
            document.getElementById('client-key-display').textContent = data.KeyPEM;
            document.getElementById('cert-result').classList.remove('hidden');
            showStatus('cert-status', '证书生成成功！证书已保存到 certs/clients/' + username + '/ 目录', 'success');
            
            document.getElementById('sip-username').value = username;
        } else {
            showStatus('cert-status', '证书生成失败: ' + data.message, 'error');
        }
    } catch (error) {
        showStatus('cert-status', '请求失败: ' + error.message, 'error');
    }
}

function downloadCertificates() {
    if (!currentCert) return;

    downloadFile('ca.crt', currentCert.CAPEM);
    downloadFile('client.crt', currentCert.CertPEM);
    downloadFile('client.key', currentCert.KeyPEM);
}

function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function connectSIP() {
    showStatus('register-status', 
        '由于浏览器安全限制，无法直接使用客户端证书建立TLS TCP连接。\n' +
        '请使用以下方式测试：\n' +
        '1. 运行: go run cmd/sipclient/main.go -username alice\n' +
        '2. 或使用支持TLS客户端证书的SIP客户端（如Zoiper）', 
        'info');
    addLog('info', '浏览器环境限制提示：请使用Go测试客户端进行SIP连接测试');
}

function disconnectSIP() {
    updateConnectionStatus(false);
    showStatus('register-status', '已断开', 'info');
    addLog('info', '连接已断开');
}

function updateConnectionStatus(connected) {
    const status = document.getElementById('conn-status');
    status.className = 'connection-status ' + (connected ? 'connected' : 'disconnected');
}

async function refreshOnlineUsers() {
    try {
        const response = await fetch('/api/registrations');
        const data = await response.json();
        
        const list = document.getElementById('online-users-list');
        list.innerHTML = '';
        
        if (Object.keys(data).length === 0) {
            list.innerHTML = '<p style="color: #888;">暂无在线用户</p>';
            return;
        }

        for (const [user, info] of Object.entries(data)) {
            const item = document.createElement('div');
            item.className = 'user-item';
            item.innerHTML = `
                <span class="username">${user}</span>
                <button class="call-btn" onclick="selectUser('${user}')">呼叫</button>
            `;
            list.appendChild(item);
        }
    } catch (error) {
        console.error('Failed to fetch registrations:', error);
    }
}

function selectUser(username) {
    document.getElementById('call-target').value = username;
}

function initiateCall() {
    const target = document.getElementById('call-target').value.trim();
    if (!target) {
        showStatus('call-status', '请输入呼叫目标', 'error');
        return;
    }

    callId = generateCallId();
    showStatus('call-status', `正在呼叫 ${target}... (Call-ID: ${callId})`, 'info');
    addLog('sent', `INVITE sip:${target}@localhost SIP/2.0`);
    addLog('received', 'SIP/2.0 100 Trying');
}

function endCall() {
    if (callId) {
        showStatus('call-status', '呼叫已结束', 'info');
        addLog('sent', 'BYE');
        addLog('received', 'SIP/2.0 200 OK');
        callId = null;
    }
}

function showStatus(elementId, message, type) {
    const statusEl = document.getElementById(elementId);
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    statusEl.classList.remove('hidden');
}

function addLog(type, message) {
    const logs = document.getElementById('sip-logs');
    const entry = document.createElement('div');
    entry.className = 'log-entry ' + type;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logs.appendChild(entry);
    logs.scrollTop = logs.scrollHeight;
}

function generateCallId() {
    return Math.random().toString(36).substring(2, 15) + '@localhost';
}

document.addEventListener('DOMContentLoaded', () => {
    refreshOnlineUsers();
    setInterval(refreshOnlineUsers, 5000);
});
