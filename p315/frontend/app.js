const API_BASE = 'http://localhost:5001/api';

let currentCallFlow = null;
let decodedMessages = {};

const messageBadgeMap = {
    'SETUP': 'badge-setup',
    'CONNECT': 'badge-connect',
    'RELEASE': 'badge-release',
    'ALERTING': 'badge-alerting',
    'CALL PROCEEDING': 'badge-proceeding',
    'DISCONNECT': 'badge-disconnect',
    'RELEASE COMPLETE': 'badge-complete',
    'CONNECT ACKNOWLEDGE': 'badge-complete'
};

async function fetchCallFlows() {
    try {
        const response = await fetch(`${API_BASE}/call-flows`);
        const data = await response.json();
        if (data.success) {
            renderCallFlowList(data.call_flows);
            if (data.call_flows.length > 0) {
                selectCallFlow(data.call_flows[0]);
            }
        }
    } catch (error) {
        console.error('Failed to fetch call flows:', error);
    }
}

function renderCallFlowList(callFlows) {
    const container = document.getElementById('call-flow-list');
    container.innerHTML = '';
    
    callFlows.forEach(flow => {
        const item = document.createElement('div');
        item.className = 'call-flow-item';
        item.dataset.id = flow.id;
        item.innerHTML = `
            <div class="call-flow-name">${flow.name}</div>
            <div class="call-flow-info">${flow.calling_party} → ${flow.called_party}</div>
            <div class="call-flow-info">${flow.start_time} · ${flow.messages.length} 条消息</div>
        `;
        item.addEventListener('click', () => selectCallFlow(flow));
        container.appendChild(item);
    });
}

function selectCallFlow(flow) {
    currentCallFlow = flow;
    decodedMessages = {};
    
    document.querySelectorAll('.call-flow-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === flow.id);
    });
    
    document.getElementById('current-flow-title').textContent = flow.name;
    renderCallSummary(flow);
    renderMessageFlow(flow);
}

function renderCallSummary(flow) {
    const container = document.getElementById('call-summary');
    container.innerHTML = `
        <div class="summary-item">
            <span class="summary-label">主叫号码</span>
            <span class="summary-value">${flow.calling_party}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">被叫号码</span>
            <span class="summary-value">${flow.called_party}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">开始时间</span>
            <span class="summary-value">${flow.start_time}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">消息数量</span>
            <span class="summary-value">${flow.messages.length} 条</span>
        </div>
    `;
}

function getMessageBadge(messageName) {
    const badgeClass = messageBadgeMap[messageName] || 'badge-complete';
    return `<span class="message-badge ${badgeClass}">${messageName}</span>`;
}

function renderMessageFlow(flow) {
    const container = document.getElementById('message-flow');
    container.innerHTML = `
        <div class="flow-labels">
            <span class="flow-label">UE (用户终端)</span>
            <span class="flow-label">Network (网络)</span>
        </div>
    `;
    
    flow.messages.forEach((msg, index) => {
        const isUeToNetwork = msg.direction === 'UE -> Network';
        const item = document.createElement('div');
        item.className = `message-item ${isUeToNetwork ? 'ue-to-network' : 'network-to-ue'}`;
        item.dataset.index = index;
        
        const decoded = decodedMessages[index];
        const messageType = decoded ? decoded.message.message_name : '解码中...';
        const badge = decoded ? getMessageBadge(messageType) : '';
        
        let extractedHtml = '';
        if (decoded && decoded.success) {
            const msgData = decoded.message;
            if (msgData.called_party_number || msgData.bearer_capability || msgData.cause_value) {
                extractedHtml = '<div class="message-extracted">';
                if (msgData.called_party_number) {
                    extractedHtml += `
                        <div class="extracted-field">
                            <span class="extracted-label">被叫号码</span>
                            <span class="extracted-value">${msgData.called_party_number}</span>
                        </div>
                    `;
                }
                if (msgData.bearer_capability) {
                    extractedHtml += `
                        <div class="extracted-field">
                            <span class="extracted-label">承载能力</span>
                            <span class="extracted-value">${msgData.bearer_capability.information_transfer_capability}</span>
                        </div>
                    `;
                }
                if (msgData.cause_value) {
                    extractedHtml += `
                        <div class="extracted-field">
                            <span class="extracted-label">原因值</span>
                            <span class="extracted-value">${msgData.cause_value.cause_value} - ${msgData.cause_value.cause_description}</span>
                        </div>
                    `;
                }
                extractedHtml += '</div>';
            }
            item.classList.add('decoded');
        }
        
        item.innerHTML = `
            <div class="message-bubble" data-index="${index}">
                <div class="message-type">${badge}</div>
                <div class="message-time">${msg.timestamp} · ${msg.direction}</div>
                ${extractedHtml}
            </div>
            <div class="message-arrow">${isUeToNetwork ? '→' : '←'}</div>
        `;
        
        item.querySelector('.message-bubble').addEventListener('click', () => {
            if (decodedMessages[index]) {
                showMessageDetail(decodedMessages[index], msg);
            } else {
                decodeSingleMessage(index, msg);
            }
        });
        
        container.appendChild(item);
    });
}

async function decodeSingleMessage(index, msgData) {
    try {
        const response = await fetch(`${API_BASE}/decode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hex_data: msgData.hex_data })
        });
        const data = await response.json();
        decodedMessages[index] = data;
        renderMessageFlow(currentCallFlow);
        if (data.success) {
            showMessageDetail(data, msgData);
        }
    } catch (error) {
        console.error('Failed to decode message:', error);
    }
}

async function decodeAllMessages() {
    if (!currentCallFlow) return;
    
    try {
        const response = await fetch(`${API_BASE}/decode-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: currentCallFlow.messages })
        });
        const data = await response.json();
        if (data.success) {
            data.results.forEach((result, index) => {
                decodedMessages[index] = result;
            });
            renderMessageFlow(currentCallFlow);
        }
    } catch (error) {
        console.error('Failed to decode batch:', error);
    }
}

function formatValue(value) {
    if (value === null || value === undefined) {
        return '<span class="detail-value">-</span>';
    }
    if (typeof value === 'object') {
        let html = '<div class="nested-object">';
        for (const [key, val] of Object.entries(value)) {
            html += `
                <div class="detail-row">
                    <span class="detail-label">${key}</span>
                    ${formatValue(val)}
                </div>
            `;
        }
        html += '</div>';
        return html;
    }
    return `<span class="detail-value highlight">${value}</span>`;
}

function showMessageDetail(decoded, rawMsg) {
    const panel = document.getElementById('detail-panel');
    const container = document.getElementById('message-detail');
    
    if (!decoded.success) {
        container.innerHTML = `
            <div class="error-message">
                <strong>解码失败:</strong> ${decoded.error}
            </div>
            <div class="detail-section">
                <h3>原始数据</h3>
                <div class="raw-hex">${decoded.raw_hex}</div>
            </div>
        `;
    } else {
        const msg = decoded.message;
        let html = `
            <div class="detail-section">
                <h3>基本信息</h3>
                <div class="detail-row">
                    <span class="detail-label">时间戳</span>
                    <span class="detail-value">${rawMsg.timestamp}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">方向</span>
                    <span class="detail-value">${rawMsg.direction}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">消息类型</span>
                    <span class="detail-value highlight">${msg.message_name} (${msg.message_type})</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">呼叫参考值</span>
                    <span class="detail-value">0x${msg.call_reference_value.toString(16).toUpperCase()}</span>
                </div>
            </div>
        `;
        
        if (msg.called_party_number || msg.bearer_capability || msg.cause_value) {
            html += '<div class="detail-section"><h3>提取的关键字段</h3>';
            if (msg.called_party_number) {
                html += `
                    <div class="detail-row">
                        <span class="detail-label">被叫号码</span>
                        <span class="detail-value highlight">${msg.called_party_number}</span>
                    </div>
                `;
            }
            if (msg.bearer_capability) {
                html += `
                    <div class="detail-row">
                        <span class="detail-label">承载能力</span>
                        ${formatValue(msg.bearer_capability)}
                    </div>
                `;
            }
            if (msg.cause_value) {
                html += `
                    <div class="detail-row">
                        <span class="detail-label">原因值</span>
                        ${formatValue(msg.cause_value)}
                    </div>
                `;
            }
            html += '</div>';
        }
        
        html += '<div class="detail-section"><h3>信息元素 (IE)</h3><div class="ie-list">';
        msg.information_elements.forEach(ie => {
            html += `
                <div class="ie-item">
                    <h4>${ie.ie_name} (${ie.ie_type})</h4>
                    <div class="detail-row">
                        <span class="detail-label">长度</span>
                        <span class="detail-value">${ie.length} 字节</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">数据</span>
                        <span class="detail-value">${ie.data_hex}</span>
                    </div>
                    ${Object.keys(ie.decoded_data).length > 0 ? `
                        <div class="detail-row">
                            <span class="detail-label">解码内容</span>
                            ${formatValue(ie.decoded_data)}
                        </div>
                    ` : ''}
                </div>
            `;
        });
        html += '</div></div>';
        
        html += `
            <div class="detail-section">
                <h3>原始十六进制数据</h3>
                <div class="raw-hex">${msg.raw_hex}</div>
            </div>
        `;
        
        container.innerHTML = html;
    }
    
    panel.classList.remove('hidden');
}

async function decodeSingleInput() {
    const hexInput = document.getElementById('hex-input').value.trim();
    const resultContainer = document.getElementById('decode-result');
    
    if (!hexInput) {
        resultContainer.innerHTML = '<div class="error-message">请输入十六进制消息数据</div>';
        return;
    }
    
    resultContainer.innerHTML = '<div class="loading"><span class="spinner"></span>解码中...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/decode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hex_data: hexInput })
        });
        const data = await response.json();
        
        if (data.success) {
            const msg = data.message;
            let html = '<div class="success-message">解码成功!</div>';
            
            html += '<div class="detail-section"><h3>消息概要</h3>';
            html += `
                <div class="detail-row">
                    <span class="detail-label">消息类型</span>
                    <span class="detail-value highlight">${msg.message_name} (${msg.message_type})</span>
                </div>
            `;
            if (msg.called_party_number) {
                html += `
                    <div class="detail-row">
                        <span class="detail-label">被叫号码</span>
                        <span class="detail-value highlight">${msg.called_party_number}</span>
                    </div>
                `;
            }
            if (msg.bearer_capability) {
                html += `
                    <div class="detail-row">
                        <span class="detail-label">承载能力</span>
                        <span class="detail-value highlight">${msg.bearer_capability.information_transfer_capability}</span>
                    </div>
                `;
            }
            if (msg.cause_value) {
                html += `
                    <div class="detail-row">
                        <span class="detail-label">原因值</span>
                        <span class="detail-value highlight">${msg.cause_value.cause_value} - ${msg.cause_value.cause_description}</span>
                    </div>
                `;
            }
            html += '</div>';
            
            html += '<div class="detail-section"><h3>信息元素</h3><div class="ie-list">';
            msg.information_elements.forEach(ie => {
                html += `
                    <div class="ie-item">
                        <h4>${ie.ie_name} (${ie.ie_type})</h4>
                        ${Object.keys(ie.decoded_data).length > 0 ? formatValue(ie.decoded_data) : `<div class="detail-row"><span class="detail-label">数据</span><span class="detail-value">${ie.data_hex}</span></div>`}
                    </div>
                `;
            });
            html += '</div></div>';
            
            resultContainer.innerHTML = html;
        } else {
            resultContainer.innerHTML = `<div class="error-message"><strong>解码失败:</strong> ${data.error}</div>`;
        }
    } catch (error) {
        resultContainer.innerHTML = `<div class="error-message"><strong>请求失败:</strong> ${error.message}</div>`;
    }
}

async function generateCDR() {
    if (!currentCallFlow) return;
    
    const cdrPanel = document.getElementById('cdr-panel');
    const cdrDetail = document.getElementById('cdr-detail');
    
    cdrDetail.innerHTML = '<div class="loading"><span class="spinner"></span>生成CDR中...</div>';
    cdrPanel.classList.remove('hidden');
    
    try {
        const response = await fetch(`${API_BASE}/cdr/${currentCallFlow.id}`);
        const data = await response.json();
        
        if (data.success) {
            renderCDR(data.cdr, data.summary);
        } else {
            cdrDetail.innerHTML = `<div class="error-message"><strong>生成失败:</strong> ${data.error}</div>`;
        }
    } catch (error) {
        cdrDetail.innerHTML = `<div class="error-message"><strong>请求失败:</strong> ${error.message}</div>`;
    }
}

async function exportCDR(format) {
    if (!currentCallFlow) return;
    
    try {
        const url = `${API_BASE}/cdr/${currentCallFlow.id}/export?format=${format}`;
        window.open(url, '_blank');
        document.getElementById('export-menu').classList.add('hidden');
    } catch (error) {
        alert(`导出失败: ${error.message}`);
    }
}

function renderCDR(cdr, summary) {
    const container = document.getElementById('cdr-detail');
    
    let html = '<div class="success-message">CDR生成成功!</div>';
    
    html += '<div class="detail-section"><h3>基本信息</h3>';
    html += `
        <div class="detail-row">
            <span class="detail-label">CDR ID</span>
            <span class="detail-value highlight">${cdr.cdr_id}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">呼叫ID</span>
            <span class="detail-value">${cdr.call_id}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">呼叫状态</span>
            <span class="detail-value highlight">${cdr.call_status || 'N/A'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">消息数量</span>
            <span class="detail-value">${cdr.message_count || 0}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">生成时间</span>
            <span class="detail-value">${cdr.generated_at || 'N/A'}</span>
        </div>
    `;
    html += '</div>';
    
    html += '<div class="detail-section"><h3>呼叫双方</h3>';
    html += `
        <div class="detail-row">
            <span class="detail-label">主叫号码</span>
            <span class="detail-value highlight">${cdr.calling_party || 'N/A'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">被叫号码</span>
            <span class="detail-value highlight">${cdr.called_party || 'N/A'}</span>
        </div>
    `;
    if (cdr.calling_party_display) {
        html += `
            <div class="detail-row">
                <span class="detail-label">主叫显示</span>
                <span class="detail-value">${cdr.calling_party_display}</span>
            </div>
        `;
    }
    if (cdr.called_party_display) {
        html += `
            <div class="detail-row">
                <span class="detail-label">被叫显示</span>
                <span class="detail-value">${cdr.called_party_display}</span>
            </div>
        `;
    }
    html += '</div>';
    
    html += '<div class="detail-section"><h3>时间信息</h3>';
    html += `
        <div class="detail-row">
            <span class="detail-label">开始时间</span>
            <span class="detail-value">${cdr.start_time || 'N/A'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Setup时间</span>
            <span class="detail-value">${cdr.setup_time || 'N/A'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Alerting时间</span>
            <span class="detail-value">${cdr.alerting_time || 'N/A'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Connect时间</span>
            <span class="detail-value">${cdr.connect_time || 'N/A'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Disconnect时间</span>
            <span class="detail-value">${cdr.disconnect_time || 'N/A'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Release时间</span>
            <span class="detail-value">${cdr.release_time || 'N/A'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">结束时间</span>
            <span class="detail-value">${cdr.end_time || 'N/A'}</span>
        </div>
    `;
    html += '</div>';
    
    html += '<div class="detail-section"><h3>呼叫时长</h3>';
    html += `
        <div class="detail-row">
            <span class="detail-label">呼叫持续</span>
            <span class="detail-value highlight">${cdr.call_duration_seconds !== null ? cdr.call_duration_seconds + ' 秒' : 'N/A'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Setup时长</span>
            <span class="detail-value">${cdr.setup_duration_seconds !== null ? cdr.setup_duration_seconds + ' 秒' : 'N/A'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">振铃时长</span>
            <span class="detail-value">${cdr.alerting_duration_seconds !== null ? cdr.alerting_duration_seconds + ' 秒' : 'N/A'}</span>
        </div>
    `;
    html += '</div>';
    
    if (cdr.bearer_capability) {
        html += '<div class="detail-section"><h3>承载能力</h3>';
        html += `
            <div class="detail-row">
                <span class="detail-label">传输能力</span>
                <span class="detail-value highlight">${cdr.bearer_capability.information_transfer_capability || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">传输模式</span>
                <span class="detail-value">${cdr.bearer_capability.transfer_mode || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">传输速率</span>
                <span class="detail-value">${cdr.bearer_capability.transfer_rate || 'N/A'}</span>
            </div>
        `;
        html += '</div>';
    }
    
    if (cdr.cause_value !== null) {
        html += '<div class="detail-section"><h3>释放原因</h3>';
        html += `
            <div class="detail-row">
                <span class="detail-label">原因值</span>
                <span class="detail-value error">${cdr.cause_value}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">原因描述</span>
                <span class="detail-value error">${cdr.cause_description || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">位置</span>
                <span class="detail-value">${cdr.cause_location || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">编码标准</span>
                <span class="detail-value">${cdr.cause_coding_standard || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">终止原因</span>
                <span class="detail-value highlight">${cdr.termination_reason || 'N/A'}</span>
            </div>
        `;
        html += '</div>';
    }
    
    if (cdr.diversion_info && cdr.diversion_info.length > 0) {
        html += '<div class="detail-section"><h3>转移信息</h3>';
        cdr.diversion_info.forEach((div, i) => {
            html += `
                <div class="detail-row">
                    <span class="detail-label">转移 ${i + 1}</span>
                    <span class="detail-value">${div.reason || 'N/A'} -> ${div.diverted_to || 'N/A'}</span>
                </div>
            `;
        });
        html += '</div>';
    }
    
    if (cdr.forwarding_info && cdr.forwarding_info.length > 0) {
        html += '<div class="detail-section"><h3>前转信息</h3>';
        cdr.forwarding_info.forEach((fwd, i) => {
            fwd.entries.forEach((entry, j) => {
                html += `
                    <div class="detail-row">
                        <span class="detail-label">前转 ${i + 1}-${j + 1}</span>
                        <span class="detail-value">${entry.type || 'N/A'}: ${entry.forwarded_number || 'N/A'}</span>
                    </div>
                `;
            });
        });
        html += '</div>';
    }
    
    if (cdr.supplementary_services && cdr.supplementary_services.length > 0) {
        html += '<div class="detail-section"><h3>补充业务</h3>';
        cdr.supplementary_services.forEach((ss, i) => {
            html += `
                <div class="detail-row">
                    <span class="detail-label">${ss.timestamp || ''}</span>
                    <span class="detail-value highlight">${ss.service || 'N/A'}</span>
                </div>
            `;
        });
        html += '</div>';
    }
    
    if (cdr.display_texts && cdr.display_texts.length > 0) {
        html += '<div class="detail-section"><h3>显示文本</h3>';
        cdr.display_texts.forEach((text, i) => {
            html += `
                <div class="detail-row">
                    <span class="detail-label">文本 ${i + 1}</span>
                    <span class="detail-value">${text}</span>
                </div>
            `;
        });
        html += '</div>';
    }
    
    if (cdr.additional_info) {
        html += '<div class="detail-section"><h3>统计信息</h3>';
        for (const [key, value] of Object.entries(cdr.additional_info)) {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            html += `
                <div class="detail-row">
                    <span class="detail-label">${label}</span>
                    <span class="detail-value">${value}</span>
                </div>
            `;
        }
        html += '</div>';
    }
    
    html += '<div class="detail-section"><h3>导出选项</h3>';
    html += `
        <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button class="btn btn-export" onclick="exportCDR('json')">导出 JSON</button>
            <button class="btn btn-export" onclick="exportCDR('csv')">导出 CSV</button>
            <button class="btn btn-export" onclick="exportCDR('text')">导出 Text</button>
        </div>
    `;
    html += '</div>';
    
    container.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
    fetchCallFlows();
    
    document.getElementById('decode-btn').addEventListener('click', decodeSingleInput);
    document.getElementById('decode-flow-btn').addEventListener('click', decodeAllMessages);
    document.getElementById('close-detail').addEventListener('click', () => {
        document.getElementById('detail-panel').classList.add('hidden');
    });
    document.getElementById('close-cdr').addEventListener('click', () => {
        document.getElementById('cdr-panel').classList.add('hidden');
    });
    
    document.getElementById('generate-cdr-btn').addEventListener('click', generateCDR);
    
    const exportBtn = document.getElementById('export-btn');
    const exportMenu = document.getElementById('export-menu');
    
    exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportMenu.classList.toggle('hidden');
    });
    
    document.addEventListener('click', () => {
        exportMenu.classList.add('hidden');
    });
    
    document.querySelectorAll('.export-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const format = item.dataset.format;
            exportCDR(format);
        });
    });
    
    document.getElementById('hex-input').addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            decodeSingleInput();
        }
    });
});
