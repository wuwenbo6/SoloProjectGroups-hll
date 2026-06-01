const API_BASE = 'http://localhost:5000/api';

let currentSessionId = null;
let operationHistory = [];
let explicitHistory = [];
let examples = {};
let currentTags = [];

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initEventListeners();
    loadExamples();
});

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(tabId).classList.add('active');
        });
    });
}

function initEventListeners() {
    document.getElementById('connectBtn').addEventListener('click', connectPLC);
    document.getElementById('disconnectBtn').addEventListener('click', disconnectPLC);
    document.getElementById('readBtn').addEventListener('click', readTag);
    document.getElementById('writeBtn').addEventListener('click', writeTag);
    document.getElementById('parseBtn').addEventListener('click', parsePacket);
    document.getElementById('loadExampleBtn').addEventListener('click', loadExamplesIntoList);
    document.getElementById('clearParserBtn').addEventListener('click', clearParser);
    
    document.getElementById('refreshTagsBtn').addEventListener('click', loadTags);
    document.getElementById('exportJsonBtn').addEventListener('click', exportTagsJson);
    document.getElementById('exportCsvBtn').addEventListener('click', exportTagsCsv);
    document.getElementById('resetTagsBtn').addEventListener('click', resetTags);
    document.getElementById('addTagBtn').addEventListener('click', addTag);
    
    document.getElementById('sendExplicitBtn').addEventListener('click', sendExplicitMessage);
}

async function connectPLC() {
    const host = document.getElementById('host').value;
    const port = document.getElementById('port').value;
    
    try {
        const response = await fetch(`${API_BASE}/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port: parseInt(port) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentSessionId = data.session_id;
            updateConnectionStatus(true, data.session_handle);
            showToast('连接成功！', 'success');
        } else {
            showToast(`连接失败: ${data.error}`, 'error');
        }
    } catch (error) {
        showToast(`连接错误: ${error.message}`, 'error');
    }
}

async function disconnectPLC() {
    if (!currentSessionId) return;
    
    try {
        await fetch(`${API_BASE}/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: currentSessionId })
        });
        
        currentSessionId = null;
        updateConnectionStatus(false);
        showToast('已断开连接', 'success');
    } catch (error) {
        showToast(`断开连接错误: ${error.message}`, 'error');
    }
}

function updateConnectionStatus(connected, sessionHandle = null) {
    const indicator = document.querySelector('.status-indicator');
    const text = document.querySelector('.status-text');
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    
    if (connected) {
        indicator.className = 'status-indicator connected';
        text.textContent = `已连接 (Session: ${sessionHandle})`;
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
    } else {
        indicator.className = 'status-indicator disconnected';
        text.textContent = '未连接';
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
    }
}

async function readTag() {
    if (!currentSessionId) {
        showToast('请先连接PLC', 'error');
        return;
    }
    
    const tagName = document.getElementById('readTag').value;
    const dataType = document.getElementById('readDataType').value;
    
    if (!tagName) {
        showToast('请输入标签名称', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/read-tag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionId,
                tag_name: tagName,
                data_type: dataType
            })
        });
        
        const data = await response.json();
        displayReadResult(data);
        
        if (data.success) {
            addToHistory('read', tagName, data.value);
        }
    } catch (error) {
        showToast(`读取错误: ${error.message}`, 'error');
    }
}

async function writeTag() {
    if (!currentSessionId) {
        showToast('请先连接PLC', 'error');
        return;
    }
    
    const tagName = document.getElementById('writeTag').value;
    const dataType = document.getElementById('writeDataType').value;
    const value = document.getElementById('writeValue').value;
    
    if (!tagName) {
        showToast('请输入标签名称', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/write-tag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionId,
                tag_name: tagName,
                value: parseValue(value, dataType),
                data_type: dataType
            })
        });
        
        const data = await response.json();
        displayWriteResult(data);
        
        if (data.success) {
            addToHistory('write', tagName, value);
        }
    } catch (error) {
        showToast(`写入错误: ${error.message}`, 'error');
    }
}

function parseValue(value, dataType) {
    switch (dataType) {
        case 'INT':
        case 'DINT':
        case 'UINT':
        case 'UDINT':
            return parseInt(value) || 0;
        case 'REAL':
            return parseFloat(value) || 0.0;
        case 'BOOL':
            return value.toLowerCase() === 'true' || value === '1';
        default:
            return value;
    }
}

function displayReadResult(data) {
    const resultBox = document.getElementById('readResult');
    resultBox.className = 'result-box show';
    
    if (data.success) {
        resultBox.classList.add('success');
        resultBox.innerHTML = `
            <h4>读取成功</h4>
            <p>标签: <strong>${data.tag_name}</strong></p>
            <p>值: <span class="value-display">${data.value}</span></p>
            <h4>原始响应:</h4>
            <pre>${JSON.stringify(data.raw_response, null, 2)}</pre>
        `;
    } else {
        resultBox.classList.add('error');
        resultBox.innerHTML = `
            <h4>读取失败</h4>
            <p class="value-display error">${data.error}</p>
        `;
    }
}

function displayWriteResult(data) {
    const resultBox = document.getElementById('writeResult');
    resultBox.className = 'result-box show';
    
    if (data.success) {
        resultBox.classList.add('success');
        resultBox.innerHTML = `
            <h4>写入成功</h4>
            <p>标签: <strong>${data.tag_name}</strong></p>
            <p>写入值: <span class="value-display">${data.value_written}</span></p>
            <p>状态: ${data.status}</p>
            <h4>原始响应:</h4>
            <pre>${JSON.stringify(data.raw_response, null, 2)}</pre>
        `;
    } else {
        resultBox.classList.add('error');
        resultBox.innerHTML = `
            <h4>写入失败</h4>
            <p class="value-display error">${data.error}</p>
        `;
    }
}

async function parsePacket() {
    const hexInput = document.getElementById('hexInput').value.replace(/\s/g, '');
    
    if (!hexInput) {
        showToast('请输入十六进制数据', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hex_data: hexInput })
        });
        
        const data = await response.json();
        displayParseResult(data);
    } catch (error) {
        showToast(`解析错误: ${error.message}`, 'error');
    }
}

function displayParseResult(data) {
    const resultDiv = document.getElementById('parseResult');
    
    if (!data.success) {
        resultDiv.innerHTML = `
            <h4>解析失败</h4>
            <p class="value-display error">${data.error}</p>
            <h4>原始数据:</h4>
            <div class="raw-data">${data.raw_data_hex || 'N/A'}</div>
        `;
        return;
    }
    
    const packet = data.packet;
    const header = packet.header;
    const cip = packet.cip_message;
    
    let html = `
        <h4>封装头 (ENIP Header)</h4>
        <table>
            <tr><th>字段</th><th>值</th></tr>
            <tr><td>Command</td><td>${header.command_name} (0x${header.command.toString(16).toUpperCase()})</td></tr>
            <tr><td>Length</td><td>${header.length} bytes</td></tr>
            <tr><td>Session Handle</td><td>${header.session_handle}</td></tr>
            <tr><td>Status</td><td>${header.status}</td></tr>
            <tr><td>Sender Context</td><td>${header.sender_context}</td></tr>
            <tr><td>Options</td><td>${header.options}</td></tr>
        </table>
    `;
    
    if (cip) {
        html += `
            <h4>CIP 消息</h4>
            <table>
                <tr><th>字段</th><th>值</th></tr>
                <tr><td>Service</td><td>${cip.service_name} (0x${cip.service.toString(16).toUpperCase()})</td></tr>
                <tr><td>Type</td><td>${cip.is_response ? 'Response' : 'Request'}</td></tr>
                <tr><td>Status</td><td>${cip.status}</td></tr>
                <tr><td>Path Length</td><td>${cip.path_length} words</td></tr>
                <tr><td>Data Length</td><td>${cip.data_length} bytes</td></tr>
            </table>
            
            <h4>连接路径 (Connection Path)</h4>
        `;
        
        if (cip.path_segments.length > 0) {
            cip.path_segments.forEach((seg, index) => {
                html += `
                    <div class="path-segment">
                        <span class="path-type">[${index}] ${seg.segment_type}:</span>
                        <span>${seg.value}</span>
                    </div>
                `;
            });
        } else {
            html += '<p>无路径段</p>';
        }
        
        html += `
            <h4>数据 (Hex)</h4>
            <div class="raw-data">${cip.data_hex || '无数据'}</div>
        `;
    } else {
        html += '<p><em>未检测到 CIP 消息</em></p>';
    }
    
    html += `
        <h4>完整原始数据</h4>
        <div class="raw-data">${packet.raw_data_hex}</div>
    `;
    
    resultDiv.innerHTML = html;
}

async function loadExamples() {
    try {
        const response = await fetch(`${API_BASE}/generate-example`);
        const data = await response.json();
        if (data.success) {
            examples = data.examples;
        }
    } catch (error) {
        console.log('Could not load examples from API');
    }
}

function loadExamplesIntoList() {
    const examplesList = document.getElementById('examplesList');
    
    if (Object.keys(examples).length === 0) {
        examplesList.innerHTML = '<p>暂无示例数据</p>';
        return;
    }
    
    let html = '';
    const exampleNames = {
        'read_tag_request': '读取标签请求',
        'read_tag_response': '读取标签响应',
        'write_tag_request': '写入标签请求',
        'register_session': '注册会话'
    };
    
    Object.entries(examples).forEach(([key, value]) => {
        html += `
            <div class="example-item" onclick="loadExampleToInput('${value}')">
                <div class="example-name">${exampleNames[key] || key}</div>
                <div class="example-hex">${value.substring(0, 50)}...</div>
            </div>
        `;
    });
    
    examplesList.innerHTML = html;
}

function loadExampleToInput(hexData) {
    document.getElementById('hexInput').value = hexData;
    showToast('示例已加载', 'success');
}

function clearParser() {
    document.getElementById('hexInput').value = '';
    document.getElementById('parseResult').innerHTML = '';
}

function addToHistory(type, tagName, value) {
    const historyItem = {
        type,
        tagName,
        value,
        time: new Date().toLocaleTimeString()
    };
    
    operationHistory.unshift(historyItem);
    if (operationHistory.length > 50) {
        operationHistory.pop();
    }
    
    updateHistoryDisplay();
}

function updateHistoryDisplay() {
    const historyList = document.getElementById('historyList');
    
    if (operationHistory.length === 0) {
        historyList.innerHTML = '<p class="empty-history">暂无操作记录</p>';
        return;
    }
    
    let html = '';
    operationHistory.forEach(item => {
        html += `
            <div class="history-item">
                <span class="history-type ${item.type}">${item.type === 'read' ? '读取' : '写入'}</span>
                <div class="history-info">
                    <div class="history-tag">${item.tagName}</div>
                    <div class="history-value">值: ${item.value}</div>
                </div>
                <span class="history-time">${item.time}</span>
            </div>
        `;
    });
    
    historyList.innerHTML = html;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        ${type === 'success' ? 'background: #48bb78;' : ''}
        ${type === 'error' ? 'background: #f56565;' : ''}
        ${type === 'info' ? 'background: #667eea;' : ''}
    `;
    toast.textContent = message;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function parseHexOrDec(value) {
    if (!value) return 0;
    value = value.trim();
    if (value.startsWith('0x') || value.startsWith('0X')) {
        return parseInt(value, 16);
    }
    return parseInt(value, 10);
}

async function loadTags() {
    try {
        const response = await fetch(`${API_BASE}/tags`);
        const data = await response.json();
        
        if (data.success) {
            currentTags = data.tags;
            displayTags(data.tags);
            showToast(`加载成功，共 ${data.count} 个标签`, 'success');
        } else {
            showToast(`加载失败: ${data.error}`, 'error');
        }
    } catch (error) {
        showToast(`加载错误: ${error.message}`, 'error');
    }
}

function displayTags(tags) {
    const tagsList = document.getElementById('tagsList');
    
    if (!tags || tags.length === 0) {
        tagsList.innerHTML = '<p class="empty-history">暂无标签数据</p>';
        return;
    }
    
    let html = '';
    tags.forEach(tag => {
        html += `
            <div class="tag-item">
                <div class="tag-info">
                    <div class="tag-name">${tag.name}</div>
                    <div class="tag-meta">
                        <span class="tag-type ${tag.read_only ? 'readonly' : ''}">${tag.data_type_name}</span>
                        <span>Instance: ${tag.instance_id}</span>
                        ${tag.description ? `| ${tag.description}` : ''}
                    </div>
                </div>
                <span class="tag-value">${tag.current_value !== null ? tag.current_value : 'N/A'}</span>
                <div class="tag-actions">
                    <button class="tag-btn read" onclick="readTagFromDb('${tag.name}', '${tag.data_type_name}')">读取</button>
                    <button class="tag-btn delete" onclick="deleteTag('${tag.name}')">删除</button>
                </div>
            </div>
        `;
    });
    
    tagsList.innerHTML = html;
}

async function readTagFromDb(tagName, dataType) {
    if (!currentSessionId) {
        showToast('请先连接PLC', 'error');
        return;
    }
    
    document.getElementById('readTag').value = tagName;
    document.getElementById('readDataType').value = dataType;
    await readTag();
}

async function deleteTag(tagName) {
    if (!confirm(`确定要删除标签 "${tagName}" 吗？`)) return;
    
    try {
        const response = await fetch(`${API_BASE}/tags/${encodeURIComponent(tagName)}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('标签已删除', 'success');
            await loadTags();
        } else {
            showToast(`删除失败: ${data.error}`, 'error');
        }
    } catch (error) {
        showToast(`删除错误: ${error.message}`, 'error');
    }
}

async function addTag() {
    const name = document.getElementById('newTagName').value;
    const dataTypeStr = document.getElementById('newTagType').value;
    const instanceId = parseInt(document.getElementById('newTagInstanceId').value) || 0;
    const description = document.getElementById('newTagDesc').value;
    const readOnly = document.getElementById('newTagReadOnly').checked;
    
    if (!name) {
        showToast('请输入标签名称', 'error');
        return;
    }
    
    const dataType = parseHexOrDec(dataTypeStr);
    const dataTypeName = document.getElementById('newTagType').options[document.getElementById('newTagType').selectedIndex].text;
    
    try {
        const response = await fetch(`${API_BASE}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                data_type: dataType,
                data_type_name: dataTypeName,
                instance_id: instanceId,
                description,
                read_only: readOnly
            })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('标签添加成功', 'success');
            document.getElementById('newTagName').value = '';
            document.getElementById('newTagDesc').value = '';
            document.getElementById('newTagReadOnly').checked = false;
            await loadTags();
        } else {
            showToast(`添加失败: ${data.error}`, 'error');
        }
    } catch (error) {
        showToast(`添加错误: ${error.message}`, 'error');
    }
}

async function exportTagsJson() {
    try {
        const response = await fetch(`${API_BASE}/tags/export/json`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tag_database.json';
        a.click();
        window.URL.revokeObjectURL(url);
        showToast('JSON导出成功', 'success');
    } catch (error) {
        showToast(`导出错误: ${error.message}`, 'error');
    }
}

async function exportTagsCsv() {
    try {
        const response = await fetch(`${API_BASE}/tags/export/csv`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tag_database.csv';
        a.click();
        window.URL.revokeObjectURL(url);
        showToast('CSV导出成功', 'success');
    } catch (error) {
        showToast(`导出错误: ${error.message}`, 'error');
    }
}

async function resetTags() {
    if (!confirm('确定要重置为默认标签数据库吗？所有自定义标签将被删除。')) return;
    
    try {
        const response = await fetch(`${API_BASE}/tags/reset`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showToast(`已重置为默认标签 (${data.count} 个)`, 'success');
            await loadTags();
        } else {
            showToast(`重置失败: ${data.error}`, 'error');
        }
    } catch (error) {
        showToast(`重置错误: ${error.message}`, 'error');
    }
}

async function sendExplicitMessage() {
    if (!currentSessionId) {
        showToast('请先连接PLC', 'error');
        return;
    }
    
    const serviceCode = parseHexOrDec(document.getElementById('explicitService').value);
    const classId = parseHexOrDec(document.getElementById('explicitClass').value);
    const instanceId = parseHexOrDec(document.getElementById('explicitInstance').value);
    const attributeStr = document.getElementById('explicitAttribute').value;
    const hexData = document.getElementById('explicitData').value.replace(/\s/g, '');
    
    let attributeId = null;
    if (attributeStr && attributeStr.trim()) {
        attributeId = parseHexOrDec(attributeStr);
    }
    
    try {
        const response = await fetch(`${API_BASE}/send-explicit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionId,
                service_code: serviceCode,
                class_id: classId,
                instance_id: instanceId,
                attribute_id: attributeId,
                data: hexData
            })
        });
        
        const data = await response.json();
        displayExplicitResult(data, serviceCode, classId, instanceId, attributeId);
        
        if (data.success) {
            addToExplicitHistory(serviceCode, classId, instanceId, attributeId, true);
        } else {
            addToExplicitHistory(serviceCode, classId, instanceId, attributeId, false);
        }
    } catch (error) {
        showToast(`发送错误: ${error.message}`, 'error');
        addToExplicitHistory(serviceCode, classId, instanceId, attributeId, false);
    }
}

function displayExplicitResult(data, serviceCode, classId, instanceId, attributeId) {
    const resultBox = document.getElementById('explicitResult');
    resultBox.className = 'result-box show';
    
    if (data.success) {
        resultBox.classList.add('success');
        resultBox.innerHTML = `
            <h4>发送成功</h4>
            <p>服务码: <strong>0x${serviceCode.toString(16).toUpperCase()}</strong></p>
            <p>路径: Class=0x${classId.toString(16).toUpperCase()}, Instance=0x${instanceId.toString(16).toUpperCase()}${attributeId !== null ? `, Attribute=0x${attributeId.toString(16).toUpperCase()}` : ''}</p>
            <h4>请求数据:</h4>
            <div class="raw-data">${data.request_hex}</div>
            <h4>响应数据:</h4>
            <div class="raw-data">${data.response_hex}</div>
            <h4>解析结果:</h4>
            <pre>${JSON.stringify(data.parsed_response, null, 2)}</pre>
        `;
    } else {
        resultBox.classList.add('error');
        resultBox.innerHTML = `
            <h4>发送失败</h4>
            <p class="value-display error">${data.error}</p>
        `;
    }
}

function addToExplicitHistory(serviceCode, classId, instanceId, attributeId, success) {
    const historyItem = {
        serviceCode,
        classId,
        instanceId,
        attributeId,
        success,
        time: new Date().toLocaleTimeString()
    };
    
    explicitHistory.unshift(historyItem);
    if (explicitHistory.length > 50) {
        explicitHistory.pop();
    }
    
    updateExplicitHistoryDisplay();
}

function updateExplicitHistoryDisplay() {
    const historyList = document.getElementById('explicitHistory');
    
    if (explicitHistory.length === 0) {
        historyList.innerHTML = '<p class="empty-history">暂无消息记录</p>';
        return;
    }
    
    let html = '';
    explicitHistory.forEach(item => {
        html += `
            <div class="explicit-item">
                <div class="explicit-header">
                    <span class="explicit-service">0x${item.serviceCode.toString(16).toUpperCase()}</span>
                    <span class="explicit-time">${item.time}</span>
                </div>
                <div class="explicit-path">
                    Class=0x${item.classId.toString(16).toUpperCase()}, 
                    Instance=0x${item.instanceId.toString(16).toUpperCase()}
                    ${item.attributeId !== null && item.attributeId !== undefined ? `, Attribute=0x${item.attributeId.toString(16).toUpperCase()}` : ''}
                </div>
                <span class="explicit-status ${item.success ? 'success' : 'error'}">
                    ${item.success ? '成功' : '失败'}
                </span>
            </div>
        `;
    });
    
    historyList.innerHTML = html;
}
