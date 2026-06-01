const API_BASE = '/api';

let currentAuthKey = null;
let savedKeys = {};
let lastResult = null;

async function apiRequest(endpoint, data = {}, method = 'POST') {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        },
        body: method === 'POST' ? JSON.stringify(data) : undefined,
    });

    const result = await response.json();
    if (!response.ok && result.error) {
        throw new Error(result.error);
    }
    return result;
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN');
}

function formatHex(hex, maxLength = 32) {
    if (!hex) return 'N/A';
    if (hex.length <= maxLength) return hex;
    return hex.substring(0, maxLength) + '...';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addAuthKey() {
    const name = document.getElementById('keyName').value.trim() || 'default';
    const key = document.getElementById('authKey').value.trim();

    if (!key) {
        showToast('请输入会话密钥', 'error');
        return;
    }

    if (key.length !== 512) {
        showToast('密钥必须是512个十六进制字符（256字节）', 'error');
        return;
    }

    if (!/^[0-9a-fA-F]+$/.test(key)) {
        showToast('密钥必须是有效的十六进制字符串', 'error');
        return;
    }

    apiRequest('/auth-key/add', { name, auth_key: key })
        .then(result => {
            savedKeys[name] = { auth_key_id: result.auth_key_id, auth_key: key };
            currentAuthKey = key;
            showToast(`密钥 "${name}" 添加成功`, 'success');
            updateKeyList();
        })
        .catch(error => {
            showToast(error.message, 'error');
        });
}

async function generateTestKey() {
    try {
        const result = await apiRequest('/encrypt-test', { message: 'test' });
        document.getElementById('authKey').value = result.auth_key_hex;
        currentAuthKey = result.auth_key_hex;
        showToast('已生成测试密钥', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function updateKeyList() {
    const container = document.getElementById('keyListContent');

    if (Object.keys(savedKeys).length === 0) {
        container.innerHTML = '<p class="empty">暂无密钥</p>';
        return;
    }

    let html = '';
    for (const [name, info] of Object.entries(savedKeys)) {
        html += `
            <div class="key-item">
                <div>
                    <div class="key-name">${escapeHtml(name)}</div>
                    <div class="key-id">ID: ${info.auth_key_id}</div>
                </div>
                <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="selectKey('${escapeHtml(name)}')">选择</button>
            </div>
        `;
    }
    container.innerHTML = html;
}

function selectKey(name) {
    const key = savedKeys[name];
    if (key) {
        currentAuthKey = key.auth_key;
        document.getElementById('keyName').value = name;
        document.getElementById('authKey').value = key.auth_key;
        showToast(`已选择密钥: ${name}`, 'success');
    }
}

async function loadKeyList() {
    try {
        const result = await apiRequest('/auth-key/list', {}, 'GET');
        for (const key of result.keys) {
            if (!savedKeys[key.name]) {
                savedKeys[key.name] = { auth_key_id: key.auth_key_id };
            }
        }
        updateKeyList();
    } catch (error) {
        console.error('Failed to load keys:', error);
    }
}

async function generateTestData() {
    const message = document.getElementById('testMessage').value || 'Hello, Telegram!';

    if (!currentAuthKey) {
        showToast('请先添加或生成会话密钥', 'error');
        return;
    }

    showLoading(true);
    try {
        const result = await apiRequest('/encrypt-test', {
            message: message,
            auth_key: currentAuthKey
        });

        document.getElementById('encryptedData').value = result.full_data_hex;
        showToast('测试数据已生成', 'success');

        console.log('Generated test data:', result);
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function decryptMessage() {
    const data = document.getElementById('encryptedData').value.trim();
    const authKey = document.getElementById('authKey').value.trim();
    const transportType = document.getElementById('transportType').value;
    const isClient = document.getElementById('isClient').value === 'true';

    if (!data) {
        showToast('请输入加密数据', 'error');
        return;
    }

    if (!authKey) {
        showToast('请输入会话密钥', 'error');
        return;
    }

    if (authKey.length !== 512) {
        showToast('密钥必须是512个十六进制字符（256字节）', 'error');
        return;
    }

    showLoading(true);
    try {
        const result = await apiRequest('/decrypt-full', {
            data: data,
            auth_key: authKey,
            is_client: isClient,
            transport_type: transportType || undefined
        });

        lastResult = result;
        displayResult(result);
    } catch (error) {
        displayError(error.message);
    } finally {
        showLoading(false);
    }
}

function displayResult(result) {
    document.getElementById('resultCard').style.display = 'block';
    document.getElementById('messagesCard').style.display = 'block';
    document.getElementById('debugCard').style.display = document.getElementById('showRaw').checked ? 'block' : 'none';

    const resultContent = document.getElementById('resultContent');
    const isValid = result.is_valid;

    let transportDesc = '';
    switch (result.transport_type) {
        case 'abridged': transportDesc = 'TCP Abridged'; break;
        case 'intermediate': transportDesc = 'TCP Intermediate'; break;
        case 'padded_intermediate': transportDesc = 'TCP Padded Intermediate'; break;
        case 'full': transportDesc = 'TCP Full'; break;
        case 'http': transportDesc = 'HTTP/WebSocket'; break;
        default: transportDesc = 'Unknown';
    }

    let replayHtml = '';
    if (result.replay_protection) {
        const rp = result.replay_protection;
        replayHtml = `
            <div class="info-item ${rp.passed ? 'success' : 'error'}">
                <div class="label">重放保护</div>
                <div class="value">${rp.passed ? '✅ 通过' : '❌ ' + escapeHtml(rp.reason)}</div>
            </div>
        `;
    }

    let usersChatsHtml = '';
    const users = result.users || {};
    const chats = result.chats || {};
    const userCount = Object.keys(users).length;
    const chatCount = Object.keys(chats).length;
    if (userCount > 0 || chatCount > 0) {
        usersChatsHtml = `
            <div class="info-item">
                <div class="label">用户/群组</div>
                <div class="value">${userCount} 用户, ${chatCount} 群组/频道</div>
            </div>
        `;
    }

    resultContent.innerHTML = `
        <div class="result-section">
            <h3>基本信息</h3>
            <div class="info-grid">
                <div class="info-item">
                    <div class="label">传输类型</div>
                    <div class="value">${transportDesc}</div>
                </div>
                <div class="info-item">
                    <div class="label">Auth Key ID</div>
                    <div class="value">${result.packet_auth_key_id}</div>
                </div>
                <div class="info-item">
                    <div class="label">Message ID</div>
                    <div class="value">${result.message_id}<br><small>${formatTimestamp(result.message_id >> 32)}</small></div>
                </div>
                <div class="info-item ${isValid ? 'success' : 'error'}">
                    <div class="label">完整性校验</div>
                    <div class="value">${isValid ? '✅ 有效' : '❌ 无效'}</div>
                </div>
                <div class="info-item">
                    <div class="label">序列号 (Seq)</div>
                    <div class="value">${result.seq_no}</div>
                </div>
                <div class="info-item">
                    <div class="label">消息长度</div>
                    <div class="value">${result.message_length} 字节</div>
                </div>
                ${replayHtml}
                ${usersChatsHtml}
            </div>
        </div>

        <div class="result-section">
            <h3>加密参数</h3>
            <div class="info-grid">
                <div class="info-item">
                    <div class="label">Message Key</div>
                    <div class="value">${formatHex(result.message_key_hex, 64)}</div>
                </div>
                <div class="info-item">
                    <div class="label">Salt</div>
                    <div class="value">${formatHex(result.salt_hex)}</div>
                </div>
                <div class="info-item">
                    <div class="label">Session ID</div>
                    <div class="value">${formatHex(result.session_id_hex)}</div>
                </div>
            </div>
        </div>
    `;

    displayMessages(result.messages, result.users, result.chats);

    if (document.getElementById('showRaw').checked) {
        displayDebugInfo(result);
    }
}

function displayMessages(messages, users, chats) {
    const container = document.getElementById('messagesContent');

    const countEl = document.getElementById('messageCount');
    if (countEl) countEl.textContent = `${(messages || []).length} 条`;

    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div class="empty" style="padding: 40px 0;">
                未提取到用户消息
            </div>
        `;
        return;
    }

    users = users || {};
    chats = chats || {};

    let html = '';
    for (const msg of messages) {
        const msgClass = msg.out ? 'outgoing' : (msg.post ? 'post' : '');
        const badges = [];

        if (msg.out) badges.push('<span class="badge badge-success">发送</span>');
        else badges.push('<span class="badge badge-primary">接收</span>');

        if (msg.post) badges.push('<span class="badge badge-warning">频道</span>');
        if (msg.pinned) badges.push('<span class="badge badge-info">置顶</span>');
        if (msg.silent) badges.push('<span class="badge badge-info">静音</span>');

        let chatInfo = '';
        if (msg.chat) {
            if (msg.chat.type === 'peer_user') {
                chatInfo = resolveName(msg.chat.user_id, users, 'User');
            } else if (msg.chat.type === 'peer_chat') {
                chatInfo = resolveName(msg.chat.chat_id, chats, 'Chat');
            } else if (msg.chat.type === 'peer_channel') {
                chatInfo = resolveName(msg.chat.channel_id, chats, 'Channel');
            } else {
                chatInfo = msg.chat.type;
            }
        }

        let senderInfo = '';
        if (msg.sender) {
            if (msg.sender.type === 'peer_user') {
                senderInfo = resolveName(msg.sender.user_id, users, 'User');
            } else if (msg.sender.type === 'peer_chat') {
                senderInfo = resolveName(msg.sender.chat_id, chats, 'Chat');
            } else if (msg.sender.type === 'peer_channel') {
                senderInfo = resolveName(msg.sender.channel_id, chats, 'Channel');
            }
        }

        let fwdHtml = '';
        if (msg.fwd_from && (msg.fwd_from.from || msg.fwd_from.channel_id)) {
            let fwdText = '转发';
            if (msg.fwd_from.from) {
                const f = msg.fwd_from.from;
                fwdText = `转发自 ${resolveName(f.user_id || f.chat_id || f.channel_id, f.type === 'peer_user' ? users : chats, f.type)}`;
            } else if (msg.fwd_from.channel_id) {
                fwdText = `转发自频道 ${resolveName(msg.fwd_from.channel_id, chats, 'Channel')}`;
            }
            if (msg.fwd_from.post_author) fwdText += ` (${escapeHtml(msg.fwd_from.post_author)})`;
            if (msg.fwd_from.date) fwdText += ` · ${formatTimestamp(msg.fwd_from.date)}`;
            fwdHtml = `<div class="fwd-info">↪ ${fwdText}</div>`;
        }

        let replyHtml = '';
        if (msg.reply_to && msg.reply_to.reply_to_msg_id) {
            replyHtml = `<div class="reply-info">↩ 回复 #${msg.reply_to.reply_to_msg_id}`;
            if (msg.reply_to.quote_text) replyHtml += `: "${escapeHtml(msg.reply_to.quote_text)}"`;
            replyHtml += '</div>';
        }

        let messageContent = '';
        if (msg.type === 'message') {
            messageContent = `<div class="message-text">${escapeHtml(msg.message || '(空消息)')}</div>`;

            if (msg.entities && msg.entities.length > 0) {
                let entitiesHtml = '<div class="message-entities">';
                for (const entity of msg.entities) {
                    const entityType = entity.type.replace('message_entity_', '');
                    let entityText = entityType;
                    if (entity.url) entityText += `: ${entity.url}`;
                    if (entity.user_id) entityText += `: ${entity.user_id}`;
                    entitiesHtml += `<span class="entity-tag">${entityText} [${entity.offset}:${entity.length}]</span>`;
                }
                entitiesHtml += '</div>';
                messageContent += entitiesHtml;
            }

            if (msg.media && msg.media.type !== 'none') {
                messageContent += `
                    <div class="media-info">
                        <h4>📎 附件: ${msg.media.type.replace('message_media_', '')}</h4>
                        ${formatMediaInfo(msg.media)}
                    </div>
                `;
            }
        } else if (msg.type === 'message_service') {
            const action = msg.action || {};
            let actionText = action.type || 'unknown';

            if (action.type === 'message_action_chat_create') {
                actionText = `创建群聊: ${action.title}`;
            } else if (action.type === 'message_action_chat_edit_title') {
                actionText = `修改群名: ${action.title}`;
            } else if (action.type === 'message_action_chat_add_user') {
                actionText = `添加用户`;
            } else if (action.type === 'message_action_chat_delete_user') {
                actionText = `移除用户 #${action.user_id}`;
            } else if (action.type === 'message_action_custom_action') {
                actionText = action.message || '自定义动作';
            }

            messageContent = `<div class="message-text" style="font-style: italic; color: #718096;">
                系统消息: ${actionText}
            </div>`;
        } else if (msg.type === 'message_empty') {
            messageContent = `<div class="message-text" style="color: #aaa;">(空消息)</div>`;
        }

        html += `
            <div class="message-item ${msgClass}">
                <div class="message-header">
                    <div class="message-meta">
                        ${badges.join('')}
                    </div>
                    <div class="message-id">
                        #${msg.id} · ${formatTimestamp(msg.date)}
                    </div>
                </div>
                ${fwdHtml}
                ${replyHtml}
                ${messageContent}
                <div class="message-info">
                    ${chatInfo ? `<div class="message-info-item"><span class="label">会话:</span>${escapeHtml(chatInfo)}</div>` : ''}
                    ${senderInfo ? `<div class="message-info-item"><span class="label">发送者:</span>${escapeHtml(senderInfo)}</div>` : ''}
                    ${msg.views !== undefined ? `<div class="message-info-item"><span class="label">浏览:</span>${msg.views}</div>` : ''}
                    ${msg.forwards !== undefined ? `<div class="message-info-item"><span class="label">转发:</span>${msg.forwards}</div>` : ''}
                    ${msg.edit_date ? `<div class="message-info-item"><span class="label">编辑:</span>${formatTimestamp(msg.edit_date)}</div>` : ''}
                    ${msg.post_author ? `<div class="message-info-item"><span class="label">作者:</span>${escapeHtml(msg.post_author)}</div>` : ''}
                    ${msg.ttl_period ? `<div class="message-info-item"><span class="label">TTL:</span>${msg.ttl_period}s</div>` : ''}
                    ${msg.grouped_id ? `<div class="message-info-item"><span class="label">分组:</span>${msg.grouped_id}</div>` : ''}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

function resolveName(id, dict, prefix) {
    if (!id) return `${prefix}`;
    if (dict && dict[id]) {
        const item = dict[id];
        if (item.title) return item.title;
        if (item.first_name) {
            let name = item.first_name;
            if (item.last_name) name += ' ' + item.last_name;
            if (item.username) name += ` (@${item.username})`;
            return name;
        }
        if (item.username) return `@${item.username}`;
    }
    return `${prefix} #${id}`;
}

function exportChat(format) {
    if (!lastResult || !lastResult.messages || lastResult.messages.length === 0) {
        showToast('没有可导出的消息', 'error');
        return;
    }

    const exportData = {
        messages: lastResult.messages,
        users: lastResult.users || {},
        chats: lastResult.chats || {},
        format: format,
        metadata: {
            transport_type: lastResult.transport_type,
            is_valid: lastResult.is_valid,
            exported_at: new Date().toISOString()
        }
    };

    fetch(`${API_BASE}/export-from-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportData)
    })
    .then(response => {
        if (!response.ok) return response.json().then(r => { throw new Error(r.error || 'Export failed'); });
        const mimeType = format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/html';
        const ext = format;
        return response.blob().then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat_export.${ext}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        });
    })
    .then(() => {
        showToast(`已导出为 ${format.toUpperCase()} 格式`, 'success');
    })
    .catch(error => {
        showToast(error.message, 'error');
    });
}

function formatMediaInfo(media) {
    let html = '';
    const items = [];

    if (media.photo_id) items.push(`<div>Photo ID: ${media.photo_id}</div>`);
    if (media.video_id) items.push(`<div>Video ID: ${media.video_id}</div>`);
    if (media.document_id) items.push(`<div>Document ID: ${media.document_id}</div>`);
    if (media.mime_type) items.push(`<div>MIME: ${media.mime_type}</div>`);
    if (media.size) items.push(`<div>大小: ${formatSize(media.size)}</div>`);
    if (media.duration) items.push(`<div>时长: ${media.duration}s</div>`);
    if (media.w && media.h) items.push(`<div>分辨率: ${media.w}x${media.h}</div>`);
    if (media.url) items.push(`<div>URL: <a href="${escapeHtml(media.url)}" target="_blank">${escapeHtml(media.display_url || media.url)}</a></div>`);
    if (media.title) items.push(`<div>标题: ${escapeHtml(media.title)}</div>`);
    if (media.description) items.push(`<div>描述: ${escapeHtml(media.description)}</div>`);
    if (media.phone_number) items.push(`<div>电话: ${escapeHtml(media.phone_number)}</div>`);
    if (media.first_name) items.push(`<div>姓名: ${escapeHtml(media.first_name)} ${escapeHtml(media.last_name || '')}</div>`);
    if (media.emoticon) items.push(`<div>表情: ${media.emoticon} = ${media.value}</div>`);
    if (media.question) items.push(`<div>问题: ${escapeHtml(media.question)}</div>`);

    html += items.join('');
    return html;
}

function formatSize(bytes) {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function displayDebugInfo(result) {
    document.getElementById('transportInfo').innerHTML = `
        <div class="info-grid">
            <div class="info-item">
                <div class="label">检测到的传输类型</div>
                <div class="value">${result.transport_type}</div>
            </div>
            <div class="info-item">
                <div class="label">原始数据长度</div>
                <div class="value">${result.message_data_hex ? result.message_data_hex.length / 2 : 0} 字节</div>
            </div>
            <div class="info-item">
                <div class="label">剩余未解析字节</div>
                <div class="value">${result.remaining_bytes} 字节</div>
            </div>
        </div>
    `;

    document.getElementById('cryptoInfo').innerHTML = `
        <div class="info-grid">
            <div class="info-item">
                <div class="label">Message Key</div>
                <div class="value" style="font-size: 0.7rem;">${result.message_key_hex}</div>
            </div>
            <div class="info-item">
                <div class="label">Salt</div>
                <div class="value" style="font-size: 0.7rem;">${result.salt_hex}</div>
            </div>
            <div class="info-item">
                <div class="label">Session ID</div>
                <div class="value" style="font-size: 0.7rem;">${result.session_id_hex}</div>
            </div>
            <div class="info-item">
                <div class="label">Message ID (hex)</div>
                <div class="value" style="font-size: 0.7rem;">${result.message_id_hex}</div>
            </div>
        </div>
    `;

    document.getElementById('tlStructure').textContent = JSON.stringify(result.tl_parsed, null, 2);
}

function displayError(errorMessage) {
    document.getElementById('resultCard').style.display = 'block';
    document.getElementById('messagesCard').style.display = 'none';
    document.getElementById('debugCard').style.display = 'none';

    document.getElementById('resultContent').innerHTML = `
        <div class="error-display">
            <h3>❌ 解析失败</h3>
            <p>${escapeHtml(errorMessage)}</p>
            <p style="margin-top: 12px; font-size: 0.9rem;">
                请检查:
                <ul style="margin-top: 8px; padding-left: 20px;">
                    <li>加密数据格式是否正确 (HEX或Base64)</li>
                    <li>会话密钥是否匹配</li>
                    <li>传输类型是否正确</li>
                    <li>消息方向是否正确 (客户端/服务端)</li>
                </ul>
            </p>
        </div>
    `;
}

function clearAll() {
    document.getElementById('encryptedData').value = '';
    document.getElementById('resultCard').style.display = 'none';
    document.getElementById('messagesCard').style.display = 'none';
    document.getElementById('debugCard').style.display = 'none';
    lastResult = null;
    showToast('已清空', 'info');
}

async function loadDemoData() {
    showLoading(true);
    try {
        const keyResult = await apiRequest('/encrypt-test', {
            message: '你好，这是一条从Telegram捕获的测试消息！Hello from MTProto!'
        });

        document.getElementById('authKey').value = keyResult.auth_key_hex;
        document.getElementById('encryptedData').value = keyResult.full_data_hex;
        currentAuthKey = keyResult.auth_key_hex;

        showToast('演示数据已加载，点击"解析并解密"查看效果', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

document.getElementById('showRaw').addEventListener('change', function() {
    const debugCard = document.getElementById('debugCard');
    debugCard.style.display = this.checked && lastResult ? 'block' : 'none';
    if (this.checked && lastResult) {
        displayDebugInfo(lastResult);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    loadKeyList();
});
