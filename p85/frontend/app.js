const API_BASE = '/api';
let selectedFile = null;
let selectedPcapId = null;
let packets = [];
let selectedPacketIndex = -1;
let currentAnalysis = null;

const uploadArea = document.getElementById('uploadArea');
const pcapFileInput = document.getElementById('pcapFile');
const uploadBtn = document.getElementById('uploadBtn');
const pcapListEl = document.getElementById('pcapList');
const templateListEl = document.getElementById('templateList');
const packetListEl = document.getElementById('packetList');
const fieldTreeEl = document.getElementById('fieldTree');
const initTemplateBtn = document.getElementById('initTemplateBtn');
const currentFileNameEl = document.getElementById('currentFileName');
const statsEl = document.getElementById('stats');
const packetCountEl = document.getElementById('packetCount');
const protocolNameEl = document.getElementById('protocolName');
const analyzeBtn = document.getElementById('analyzeBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportHtmlBtn = document.getElementById('exportHtmlBtn');
const analysisContentEl = document.getElementById('analysisContent');
const alertsContentEl = document.getElementById('alertsContent');
const transactionsContentEl = document.getElementById('transactionsContent');

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
    });
});

uploadArea.addEventListener('click', () => pcapFileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        pcapFileInput.files = files;
        updateUploadArea(files[0].name);
    }
});

pcapFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        updateUploadArea(e.target.files[0].name);
    }
});

function updateUploadArea(filename) {
    uploadArea.querySelector('p').textContent = `已选择: ${filename}`;
    uploadArea.querySelector('.upload-icon').textContent = '📁';
}

uploadBtn.addEventListener('click', async () => {
    if (!pcapFileInput.files || pcapFileInput.files.length === 0) {
        showToast('请先选择一个 PCAP 文件', 'error');
        return;
    }

    const file = pcapFileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="loading"></span> 上传中...';

    try {
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            showToast('文件上传成功，开始解析...', 'success');
            await parsePcap(data.id);
            await loadPcapList();
        } else {
            showToast(data.error || '上传失败', 'error');
        }
    } catch (error) {
        showToast('上传失败: ' + error.message, 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '上传并解析';
    }
});

async function parsePcap(pcapId) {
    try {
        const response = await fetch(`${API_BASE}/parse/${pcapId}`);
        const data = await response.json();

        if (response.ok) {
            showToast(`解析完成，共 ${data.packet_count} 个数据包`, 'success');
            await selectPcap(pcapId);
        } else {
            showToast(data.error || '解析失败', 'error');
        }
    } catch (error) {
        showToast('解析失败: ' + error.message, 'error');
    }
}

analyzeBtn.addEventListener('click', async () => {
    if (!selectedPcapId) {
        showToast('请先选择一个 PCAP 文件', 'error');
        return;
    }
    await runAnalysis();
});

async function runAnalysis() {
    try {
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<span class="loading"></span> 分析中...';

        const response = await fetch(`${API_BASE}/analyze/${selectedPcapId}`);
        currentAnalysis = await response.json();

        if (response.ok) {
            showToast('分析完成', 'success');
            renderAnalysis();
            renderAlerts();
            renderTransactions();
        } else {
            showToast(currentAnalysis.error || '分析失败', 'error');
        }
    } catch (error) {
        showToast('分析失败: ' + error.message, 'error');
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = '📊 分析';
    }
}

function renderAnalysis() {
    if (!currentAnalysis) {
        analysisContentEl.innerHTML = '<div class="empty-state">请先运行分析</div>';
        return;
    }

    const summary = currentAnalysis.summary || {};
    const latency = currentAnalysis.latency || {};

    let html = `
        <div class="analysis-grid">
            <div class="analysis-card">
                <div class="value">${summary.total_packets || 0}</div>
                <div class="label">总数据包</div>
            </div>
            <div class="analysis-card">
                <div class="value">${summary.modbus_packets || 0}</div>
                <div class="label">Modbus 包</div>
            </div>
            <div class="analysis-card">
                <div class="value">${summary.completed_transactions || 0}</div>
                <div class="label">完成事务</div>
            </div>
            <div class="analysis-card">
                <div class="value">${summary.alert_count || 0}</div>
                <div class="label">告警数量</div>
            </div>
        </div>

        <div class="analysis-section">
            <h3>⏱️ 响应延迟统计</h3>
            <table class="stats-table">
                <tr><th>指标</th><th>值 (ms)</th></tr>
                <tr><td>样本数</td><td>${latency.count || 0}</td></tr>
                <tr><td>最小值</td><td>${latency.min || 0}</td></tr>
                <tr><td>最大值</td><td>${latency.max || 0}</td></tr>
                <tr><td>平均值</td><td>${latency.avg || 0}</td></tr>
                <tr><td>中位数</td><td>${latency.median || 0}</td></tr>
                <tr><td>P95</td><td>${latency.p95 || 0}</td></tr>
                <tr><td>P99</td><td>${latency.p99 || 0}</td></tr>
            </table>
        </div>

        <div class="analysis-section">
            <h3>📋 功能码分布</h3>
            <div class="chart-container">
    `;

    const distribution = summary.function_distribution || {};
    const maxCount = Math.max(...Object.values(distribution), 1);

    for (const [fcName, count] of Object.entries(distribution)) {
        const percentage = (count / maxCount) * 100;
        html += `
            <div class="distribution-bar">
                <span class="distribution-label">${fcName}</span>
                <div class="distribution-track">
                    <div class="distribution-fill" style="width: ${percentage}%"></div>
                </div>
                <span class="distribution-value">${count}</span>
            </div>
        `;
    }

    html += `
            </div>
        </div>
    `;

    analysisContentEl.innerHTML = html;
}

function renderAlerts() {
    if (!currentAnalysis || !currentAnalysis.alerts || currentAnalysis.alerts.length === 0) {
        alertsContentEl.innerHTML = '<div class="empty-state" style="color: #38a169;">✅ 无告警信息</div>';
        return;
    }

    let html = '';
    for (const alert of currentAnalysis.alerts) {
        const alertClass = alert.level === 'error' ? 'error' : 'warning';
        html += `
            <div class="alert-item ${alertClass}">
                <div class="alert-type">${alert.type.toUpperCase()}</div>
                <div class="alert-message">${alert.message}</div>
                <div class="alert-details">
                    详情: ${JSON.stringify(alert.details || {}).substring(0, 200)}
                </div>
            </div>
        `;
    }

    alertsContentEl.innerHTML = html;
}

function renderTransactions() {
    if (!currentAnalysis || !currentAnalysis.transactions || currentAnalysis.transactions.length === 0) {
        transactionsContentEl.innerHTML = '<div class="empty-state">暂无事务数据</div>';
        return;
    }

    let html = `
        <table class="transaction-table">
            <tr>
                <th>事务ID</th>
                <th>功能码</th>
                <th>请求包</th>
                <th>响应包</th>
                <th>延迟 (ms)</th>
                <th>状态</th>
            </tr>
    `;

    for (const trans of currentAnalysis.transactions) {
        let statusClass = 'status-pending';
        let statusText = '待响应';

        if (trans.has_error) {
            statusClass = 'status-error';
            statusText = '异常';
        } else if (trans.status === 'completed') {
            statusClass = 'status-completed';
            statusText = '已完成';
        }

        html += `
            <tr>
                <td>${trans.transaction_id}</td>
                <td>0x${(trans.function_code || 0).toString(16).padStart(2, '0')}</td>
                <td>${trans.request_packet || '-'}</td>
                <td>${trans.response_packet || '-'}</td>
                <td>${trans.latency_ms !== null ? trans.latency_ms : '-'}</td>
                <td class="${statusClass}">${statusText}</td>
            </tr>
        `;
    }

    html += '</table>';
    transactionsContentEl.innerHTML = html;
}

exportJsonBtn.addEventListener('click', () => exportReport('json'));
exportHtmlBtn.addEventListener('click', () => exportReport('html'));

async function exportReport(format) {
    if (!selectedPcapId) {
        showToast('请先选择一个 PCAP 文件', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/export/${selectedPcapId}/${format}`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pcap_${selectedPcapId}_report.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showToast(`报告导出成功 (${format.toUpperCase()})`, 'success');
    } catch (error) {
        showToast('导出失败: ' + error.message, 'error');
    }
}

async function loadPcapList() {
    try {
        const response = await fetch(`${API_BASE}/pcaps`);
        const data = await response.json();

        if (data.length === 0) {
            pcapListEl.innerHTML = '<div class="empty-state">暂无文件</div>';
            return;
        }

        pcapListEl.innerHTML = data.map(pcap => `
            <div class="pcap-item ${pcap.id === selectedPcapId ? 'active' : ''}" data-id="${pcap.id}">
                <div class="pcap-item-info" onclick="selectPcap(${pcap.id})">
                    <div class="pcap-item-name">${pcap.filename}</div>
                    <div class="pcap-item-meta">
                        ${pcap.packet_count} 包 · ${pcap.protocol || '未知协议'}
                    </div>
                </div>
                <button class="btn btn-danger" onclick="deletePcap(${pcap.id}, event)">×</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载 PCAP 列表失败:', error);
    }
}

async function selectPcap(pcapId) {
    selectedPcapId = pcapId;
    currentAnalysis = null;

    try {
        const response = await fetch(`${API_BASE}/pcap/${pcapId}/packets`);
        packets = await response.json();

        const pcapInfo = packets.length > 0 ? packets[0] : {};
        currentFileNameEl.textContent = `数据包列表`;
        statsEl.style.display = 'flex';
        packetCountEl.textContent = packets.length;
        protocolNameEl.textContent = pcapInfo.protocol || '-';

        analyzeBtn.style.display = 'inline-block';
        exportJsonBtn.style.display = 'inline-block';
        exportHtmlBtn.style.display = 'inline-block';

        renderPacketList();
        await loadPcapList();

        if (packets.length > 0) {
            selectPacket(0);
        }
    } catch (error) {
        showToast('加载数据包失败: ' + error.message, 'error');
    }
}

async function deletePcap(pcapId, event) {
    event.stopPropagation();

    if (!confirm('确定要删除这个文件吗？')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/pcaps/${pcapId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('删除成功', 'success');
            if (selectedPcapId === pcapId) {
                selectedPcapId = null;
                currentAnalysis = null;
                packets = [];
                currentFileNameEl.textContent = '请选择一个 PCAP 文件';
                statsEl.style.display = 'none';
                analyzeBtn.style.display = 'none';
                exportJsonBtn.style.display = 'none';
                exportHtmlBtn.style.display = 'none';
                packetListEl.innerHTML = '<div class="empty-state">上传 PCAP 后显示数据包列表</div>';
                fieldTreeEl.innerHTML = '<div class="empty-state">选择一个数据包查看字段详情</div>';
                analysisContentEl.innerHTML = '<div class="empty-state">选择并分析 PCAP 文件后显示统计信息</div>';
                alertsContentEl.innerHTML = '<div class="empty-state">暂无告警信息</div>';
                transactionsContentEl.innerHTML = '<div class="empty-state">选择并分析 PCAP 文件后显示事务列表</div>';
            }
            await loadPcapList();
        } else {
            showToast('删除失败', 'error');
        }
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
}

function renderPacketList() {
    if (packets.length === 0) {
        packetListEl.innerHTML = '<div class="empty-state">暂无数据包</div>';
        return;
    }

    packetListEl.innerHTML = packets.map((pkt, index) => `
        <div class="packet-row ${index === selectedPacketIndex ? 'active' : ''}" 
             onclick="selectPacket(${index})">
            <span class="col-num">${pkt.packet_number}</span>
            <span class="col-time">${pkt.timestamp ? pkt.timestamp.split(' ')[1]?.split('.')[0] || '-' : '-'}</span>
            <span class="col-src">${pkt.src_ip || '-'}</span>
            <span class="col-dst">${pkt.dst_ip || '-'}</span>
            <span class="col-proto">${pkt.protocol || '-'}</span>
            <span class="col-len">${pkt.length || '-'}</span>
        </div>
    `).join('');
}

function selectPacket(index) {
    selectedPacketIndex = index;
    renderPacketList();
    renderFieldTree(packets[index]);
}

function renderFieldTree(packet) {
    if (!packet || !packet.layers) {
        fieldTreeEl.innerHTML = '<div class="empty-state">无字段数据</div>';
        return;
    }

    const layerIcons = {
        'eth': '🌐',
        'ip': '🔗',
        'ipv6': '🔗',
        'tcp': '📡',
        'udp': '📡',
        'modbus': '🔌',
        'modbus_ext': '🔌',
        'data': '📦'
    };

    let html = '';

    packet.layers.forEach((layer, layerIndex) => {
        const icon = layerIcons[layer.name?.toLowerCase()] || '📄';
        const hasFields = layer.fields && layer.fields.length > 0;

        html += `
            <div class="tree-node">
                <div class="tree-node-header" onclick="toggleTreeNode(this)">
                    <span class="tree-toggle ${hasFields ? 'expanded' : ''}"></span>
                    <span class="tree-icon">${icon}</span>
                    <span class="tree-label">${layer.name || 'Unknown Layer'}</span>
                    ${!hasFields ? '<span class="tree-value">无字段</span>' : ''}
                </div>
                ${hasFields ? `
                    <div class="tree-children">
                        ${layer.fields.map(field => `
                            <div class="field-row">
                                <span class="field-name">${field.name}</span>
                                <span class="field-display">${field.display_name || field.name}</span>
                                <span class="field-value">${field.value || '-'}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    });

    fieldTreeEl.innerHTML = html;
}

function toggleTreeNode(header) {
    const children = header.nextElementSibling;
    const toggle = header.querySelector('.tree-toggle');

    if (children) {
        children.style.display = children.style.display === 'none' ? 'block' : 'none';
        toggle.classList.toggle('collapsed');
        toggle.classList.toggle('expanded');
    }
}

initTemplateBtn.addEventListener('click', async () => {
    try {
        const response = await fetch(`${API_BASE}/init-template`, {
            method: 'POST'
        });
        const data = await response.json();

        if (response.ok) {
            showToast('默认模板初始化成功', 'success');
            await loadTemplateList();
        } else {
            showToast(data.message || '初始化失败', 'info');
        }
    } catch (error) {
        showToast('初始化失败: ' + error.message, 'error');
    }
});

async function loadTemplateList() {
    try {
        const response = await fetch(`${API_BASE}/templates`);
        const data = await response.json();

        if (data.length === 0) {
            templateListEl.innerHTML = '<div class="empty-state">暂无模板</div>';
            return;
        }

        templateListEl.innerHTML = data.map(template => `
            <div class="template-item">
                <div class="template-item-info">
                    <div class="template-item-name">${template.name}</div>
                    <div class="pcap-item-meta">
                        ${template.description?.substring(0, 50) || '无描述'}...
                    </div>
                </div>
                <button class="btn btn-danger" onclick="deleteTemplate(${template.id}, event)">×</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载模板列表失败:', error);
    }
}

async function deleteTemplate(templateId, event) {
    event.stopPropagation();

    if (!confirm('确定要删除这个模板吗？')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/templates/${templateId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('删除成功', 'success');
            await loadTemplateList();
        } else {
            showToast('删除失败', 'error');
        }
    } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
    }
}

async function init() {
    await loadPcapList();
    await loadTemplateList();
}

init();
