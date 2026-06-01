const API_BASE = '/api';
let rules = [];
let rulesWithStats = [];

async function fetchRules() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();
        rulesWithStats = data.rules || [];
        rules = rulesWithStats.map(rws => ({
            ID: rws.id,
            Name: rws.name,
            Description: rws.description,
            MatchKey: rws.matchKey,
            MatchValue: rws.matchValue,
            MatchType: rws.matchType,
            TargetTopic: rws.targetTopic,
            Enabled: rws.enabled,
            CreatedAt: rws.createdAt,
            Stats: rws.stats
        }));
        renderRules();
        updateStats();
    } catch (error) {
        console.error('Failed to fetch rules:', error);
        showToast('加载规则失败', 'error');
    }
}

function renderRules() {
    const tbody = document.getElementById('rulesTableBody');

    if (rules.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9">
                    <div class="empty-state">
                        <div class="icon">📭</div>
                        <p>暂无路由规则</p>
                        <p style="font-size: 0.9rem;">点击"添加规则"创建第一个属性路由规则</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rulesWithStats.map(rws => `
        <tr>
            <td>
                <span class="status-badge ${rws.enabled ? 'status-active' : 'status-inactive'}">
                    ${rws.enabled ? '✓ 启用' : '✕ 禁用'}
                </span>
            </td>
            <td>
                <strong>${escapeHtml(rws.name)}</strong>
                ${rws.description ? `<br><small style="color: #718096;">${escapeHtml(rws.description)}</small>` : ''}
            </td>
            <td><code>${escapeHtml(rws.matchKey)}</code></td>
            <td><code>${escapeHtml(rws.matchValue)}</code></td>
            <td><span class="match-type-badge">${getMatchTypeName(rws.matchType)}</span></td>
            <td><code>${escapeHtml(rws.targetTopic)}</code></td>
            <td><strong style="color: ${rws.stats?.hitCount > 0 ? '#38a169' : '#a0aec0'};">${rws.stats?.hitCount || 0}</strong></td>
            <td><small style="color: #718096;">${formatTimestamp(rws.stats?.lastHitAt)}</small></td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn action-edit" onclick="editRule('${rws.id}')">
                        编辑
                    </button>
                    <button class="action-btn action-delete" onclick="deleteRule('${rws.id}')">
                        删除
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateStats() {
    document.getElementById('totalRules').textContent = rules.length;
    document.getElementById('enabledRules').textContent = rules.filter(r => r.Enabled).length;

    const totalHits = rulesWithStats.reduce((sum, r) => sum + (r.stats?.hitCount || 0), 0);
    document.getElementById('totalHits').textContent = totalHits;
}

function formatTimestamp(ts) {
    if (!ts) return '-';
    const date = new Date(ts * 1000);
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getMatchTypeName(type) {
    const names = {
        exact: '精确匹配',
        prefix: '前缀匹配',
        suffix: '后缀匹配',
        contains: '包含匹配',
        regex: '通配符'
    };
    return names[type] || type;
}

function openModal(ruleId = null) {
    const modal = document.getElementById('modal');
    const form = document.getElementById('ruleForm');
    const title = document.getElementById('modalTitle');

    form.reset();
    document.getElementById('ruleId').value = '';

    if (ruleId) {
        const rule = rules.find(r => r.ID === ruleId);
        if (rule) {
            title.textContent = '编辑路由规则';
            document.getElementById('ruleId').value = rule.ID;
            document.getElementById('ruleName').value = rule.Name;
            document.getElementById('ruleDescription').value = rule.Description || '';
            document.getElementById('matchKey').value = rule.MatchKey;
            document.getElementById('matchValue').value = rule.MatchValue;
            document.getElementById('matchType').value = rule.MatchType || 'exact';
            document.getElementById('targetTopic').value = rule.TargetTopic;
            document.getElementById('ruleEnabled').checked = rule.Enabled;
        }
    } else {
        title.textContent = '添加路由规则';
        document.getElementById('ruleEnabled').checked = true;
    }

    modal.classList.add('show');
}

function closeModal() {
    document.getElementById('modal').classList.remove('show');
}

function editRule(ruleId) {
    openModal(ruleId);
}

async function saveRule(event) {
    event.preventDefault();

    const ruleId = document.getElementById('ruleId').value;
    const rule = {
        ID: ruleId,
        Name: document.getElementById('ruleName').value,
        Description: document.getElementById('ruleDescription').value,
        MatchKey: document.getElementById('matchKey').value,
        MatchValue: document.getElementById('matchValue').value,
        MatchType: document.getElementById('matchType').value,
        TargetTopic: document.getElementById('targetTopic').value,
        Enabled: document.getElementById('ruleEnabled').checked
    };

    try {
        let response;
        if (ruleId) {
            response = await fetch(`${API_BASE}/rules/${ruleId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rule)
            });
        } else {
            response = await fetch(`${API_BASE}/rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rule)
            });
        }

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }

        showToast(ruleId ? '规则更新成功' : '规则创建成功', 'success');
        closeModal();
        fetchRules();
    } catch (error) {
        console.error('Failed to save rule:', error);
        showToast(error.message || '保存失败', 'error');
    }
}

async function deleteRule(ruleId) {
    if (!confirm('确定要删除这个规则吗？')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/rules/${ruleId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('删除失败');
        }

        showToast('规则删除成功', 'success');
        fetchRules();
    } catch (error) {
        console.error('Failed to delete rule:', error);
        showToast('删除失败', 'error');
    }
}

function addPropertyRow() {
    const container = document.getElementById('propertyInputs');
    const row = document.createElement('div');
    row.className = 'property-row';
    row.innerHTML = `
        <input type="text" placeholder="键 (key)" class="prop-key" value="">
        <input type="text" placeholder="值 (value)" class="prop-value" value="">
        <button class="btn btn-danger btn-sm" onclick="removePropertyRow(this)">✕</button>
    `;
    container.appendChild(row);
}

function removePropertyRow(btn) {
    const container = document.getElementById('propertyInputs');
    const rows = container.querySelectorAll('.property-row');
    if (rows.length > 1) {
        btn.parentElement.remove();
    } else {
        btn.parentElement.querySelectorAll('input').forEach(input => input.value = '');
    }
}

function buildPropertiesMap() {
    const keys = document.querySelectorAll('.prop-key');
    const values = document.querySelectorAll('.prop-value');
    const props = {};

    keys.forEach((keyInput, index) => {
        const key = keyInput.value.trim();
        const value = values[index].value.trim();
        if (key && value) {
            if (!props[key]) {
                props[key] = [];
            }
            props[key].push(value);
        }
    });

    return props;
}

function formatPropertiesDisplay(props) {
    const parts = [];
    for (const [key, values] of Object.entries(props)) {
        if (values.length === 1) {
            parts.push(`<code>${key}=${values[0]}</code>`);
        } else {
            parts.push(`<code>${key}=[${values.join(', ')}]</code>`);
        }
    }
    return parts.join(', ');
}

async function testRoute() {
    const properties = buildPropertiesMap();

    if (Object.keys(properties).length === 0) {
        showToast('请至少输入一个属性键值对', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/test-route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                topic: 'test/topic',
                properties: properties
            })
        });

        const result = await response.json();
        renderTestResult(result, properties);
        fetchRules();
    } catch (error) {
        console.error('Test route failed:', error);
        showToast('测试失败', 'error');
    }
}

function renderTestResult(result, inputProps) {
    const container = document.getElementById('testResult');
    const propsDisplay = formatPropertiesDisplay(inputProps);

    if (result.matchedRules && result.matchedRules.length > 0) {
        let html = `
            <div class="match">
                <strong>✅ 匹配成功！</strong>
                <p style="margin-top: 5px;">输入属性: ${propsDisplay}</p>
            </div>
            <p style="margin: 10px 0;"><strong>匹配到 ${result.matchedRules.length} 条规则：</strong></p>
        `;

        result.matchedRules.forEach(rule => {
            html += `
                <div style="background: #ebf8ff; padding: 10px; border-radius: 4px; margin-bottom: 8px; border-left: 4px solid #3182ce;">
                    <strong>${escapeHtml(rule.name)}</strong>
                    <br>
                    <small>匹配: <code>${escapeHtml(rule.matchKey)}</code> ${getMatchTypeName(rule.matchType)} <code>${escapeHtml(rule.matchValue)}</code></small>
                    <br>
                    <span class="target-topic">→ 路由到: ${escapeHtml(rule.targetTopic)}</span>
                </div>
            `;
        });

        if (result.targetTopics && result.targetTopics.length > 0) {
            html += `
                <p style="margin-top: 15px;"><strong>消息将被发布到以下主题：</strong></p>
                <ul style="margin-left: 20px;">
                    ${result.targetTopics.map(topic => `<li><code>${escapeHtml(topic)}</code></li>`).join('')}
                </ul>
            `;
        }

        if (result.properties) {
            html += `
                <p style="margin-top: 15px;"><strong>解析后的属性（单键多值）：</strong></p>
                <div style="background: #f0fff4; padding: 8px; border-radius: 4px;">
                    ${Object.entries(result.properties).map(([key, values]) => {
                        const vals = Array.isArray(values) ? values : [String(values)];
                        return `<div><code>${escapeHtml(key)}</code> → <code>${vals.map(v => escapeHtml(v)).join(', ')}</code></div>`;
                    }).join('')}
                </div>
            `;
        }

        container.innerHTML = html;
    } else {
        container.innerHTML = `
            <div class="no-match">
                <strong>❌ 未匹配到任何规则</strong>
                <p style="margin-top: 5px;">输入属性: ${propsDisplay}</p>
            </div>
            <p style="margin-top: 15px; color: #718096;">
                请检查属性值是否匹配已启用的路由规则，或添加新的规则。
            </p>
        `;
    }
}

function exportStats() {
    const format = prompt('导出格式：输入 json 或 csv', 'json');
    if (!format) return;

    window.location.href = `${API_BASE}/export/stats?format=${format.toLowerCase()}`;
    showToast('导出成功', 'success');
}

async function resetStats() {
    if (!confirm('确定要重置所有统计数据吗？')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/stats/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error('重置失败');
        }

        showToast('统计已重置', 'success');
        fetchRules();
    } catch (error) {
        console.error('Reset stats failed:', error);
        showToast('重置失败', 'error');
    }
}

async function refreshSubscriptions() {
    try {
        const response = await fetch(`${API_BASE}/subscriptions`);
        const data = await response.json();
        renderSubscriptions(data.subscriptions || []);
    } catch (error) {
        console.error('Failed to fetch subscriptions:', error);
    }
}

function renderSubscriptions(subs) {
    const tbody = document.getElementById('subscriptionsTableBody');
    document.getElementById('activeSubs').textContent = subs.length;

    if (subs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: #a0aec0; padding: 30px;">
                    暂无带属性过滤的订阅
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = subs.map(sub => `
        <tr>
            <td><code>${escapeHtml(sub.clientId)}</code></td>
            <td><code>${escapeHtml(sub.topicFilter)}</code></td>
            <td>
                ${Object.entries(sub.properties || {}).map(([k, vals]) => {
                    const values = Array.isArray(vals) ? vals : [String(vals)];
                    return `<div><code>${escapeHtml(k)}: ${values.map(v => escapeHtml(v)).join(', ')}</code></div>`;
                }).join('')}
            </td>
            <td><small>${formatTimestamp(sub.subscribedAt)}</small></td>
        </tr>
    `).join('');
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') {
        closeModal();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});

fetchRules();
refreshSubscriptions();

setInterval(() => {
    refreshSubscriptions();
}, 5000);
