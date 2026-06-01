const axios = require('axios');
const { parseString } = require('xml2js');

const API_BASE = 'http://localhost:8080/api';
let currentFormat = 'hex';
let parsedMessage = null;

const fieldDescriptions = {
    2: '主账号 (PAN)',
    3: '处理码',
    4: '交易金额',
    7: '传输日期时间',
    11: '系统跟踪号',
    12: '受卡方所在地时间',
    13: '受卡方所在地日期',
    14: '卡有效期',
    15: '清算日期',
    18: '商户类型',
    22: '服务点输入方式码',
    23: '卡序列号',
    25: '服务点条件码',
    26: '服务点PIN获取码',
    28: '交易费',
    32: '受理方标识码',
    33: '发送方标识码',
    35: '磁条2数据',
    36: '磁条3数据',
    37: '检索参考号',
    38: '授权标识应答码',
    39: '应答码',
    41: '受卡机终端标识码',
    42: '受卡方标识码',
    43: '商户名称地址',
    44: '附加响应数据',
    48: '附加数据',
    49: '交易货币代码',
    50: '结算货币代码',
    52: 'PIN数据',
    53: '安全控制信息',
    54: '附加金额',
    55: 'IC卡数据',
    59: '自定义域',
    60: '自定义域',
    61: '自定义域',
    62: '自定义域',
    63: '自定义域',
    64: 'MAC'
};

const sampleHexMessage = '0200723C048108C010363030303030303030303130303030303732353132333030303132333435363132333030303037323531323335393132333435363738393031323334353630383430313233343536313233343536373839303132333435365348414E474841492054455354204D45524348414E54202020205348414E4748414920434E313536';

function setFormat(format) {
    currentFormat = format;
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === format);
    });
}

async function parseMessage() {
    const input = document.getElementById('messageInput').value.trim();
    if (!input) {
        alert('请输入报文内容');
        return;
    }

    try {
        const response = await axios.post(`${API_BASE}/parse`, {
            data: input,
            format: currentFormat
        });

        parsedMessage = response.data;
        displayParseResult(parsedMessage);
        updateLastUpdate();
    } catch (error) {
        console.error('解析失败:', error);
        alert('解析失败: ' + (error.response?.data?.error || error.message));
    }
}

function displayParseResult(result) {
    document.getElementById('messageInfo').style.display = 'grid';
    document.getElementById('mtiValue').textContent = result.mti || '-';
    document.getElementById('bitmapType').textContent = result.hasSecondaryBitmap ? '双位图' : '单位图';

    if (result.cardScheme && result.cardScheme.scheme !== '未知') {
        document.getElementById('cardSchemeItem').style.display = 'block';
        const schemeText = result.cardScheme.scheme + (result.cardScheme.isValid ? '' : ' (长度异常)');
        document.getElementById('cardSchemeValue').textContent = schemeText;
        document.getElementById('cardSchemeValue').style.color = result.cardScheme.scheme.includes('银联') ? '#e60012' : 
            result.cardScheme.scheme.includes('Visa') ? '#1a1f71' : '#eaeaea';
    } else {
        document.getElementById('cardSchemeItem').style.display = 'none';
    }

    if (result.macVerification) {
        document.getElementById('macItem').style.display = 'block';
        const macEl = document.getElementById('macValue');
        macEl.textContent = result.macVerification.valid ? '✓ 通过' : '✗ 失败';
        macEl.style.color = result.macVerification.valid ? '#10b981' : '#ef4444';
        macEl.title = `接收: ${result.macVerification.received}\n计算: ${result.macVerification.calculated}`;
    } else {
        document.getElementById('macItem').style.display = 'none';
    }

    displayBitmap(result.bitmap, 1);
    
    if (result.hasSecondaryBitmap && result.secondaryBitmap) {
        document.getElementById('secondaryBitmapDisplay').style.display = 'block';
        displayBitmap(result.secondaryBitmap, 65);
        document.getElementById('secondaryBitmapHex').textContent = result.secondaryBitmapHex || '-';
    } else {
        document.getElementById('secondaryBitmapDisplay').style.display = 'none';
    }

    document.getElementById('bitmapHex').textContent = result.bitmapHex || '-';
    document.getElementById('bitmapDisplay').style.display = 'block';

    displayFields(result.fields);
}

function displayBitmap(bitmapArray, startBit) {
    const gridId = startBit === 1 ? 'bitmapGrid' : 'secondaryBitmapGrid';
    const grid = document.getElementById(gridId);
    grid.innerHTML = '';

    bitmapArray.forEach((bitSet, index) => {
        const bitNum = startBit + index;
        const bitEl = document.createElement('div');
        bitEl.className = `bitmap-bit ${bitSet ? 'on' : 'off'}`;
        bitEl.textContent = bitNum;
        bitEl.title = fieldDescriptions[bitNum] || `字段 ${bitNum}`;
        grid.appendChild(bitEl);
    });
}

function displayFields(fields) {
    const container = document.getElementById('fieldsContainer');
    container.innerHTML = '';

    const sortedFieldNumbers = Object.keys(fields)
        .map(Number)
        .sort((a, b) => a - b);

    if (sortedFieldNumbers.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #6b7280; padding: 40px;">无字段数据</div>';
        return;
    }

    sortedFieldNumbers.forEach(fieldNum => {
        const fieldValue = fields[fieldNum];
        const description = fieldDescriptions[fieldNum] || `字段 ${fieldNum}`;
        
        const fieldEl = document.createElement('div');
        fieldEl.className = 'field-item';
        fieldEl.innerHTML = `
            <div class="field-header">
                <span class="field-number">F${fieldNum}</span>
                <span class="field-name">${description}</span>
            </div>
            <div class="field-value" ondblclick="editField(${fieldNum}, this)">${escapeHtml(fieldValue)}</div>
        `;
        container.appendChild(fieldEl);
    });
}

function editField(fieldNum, element) {
    const currentValue = parsedMessage.fields[fieldNum] || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'field-edit';
    input.value = currentValue;
    
    element.replaceWith(input);
    input.focus();
    
    const saveEdit = () => {
        const newValue = input.value;
        parsedMessage.fields[fieldNum] = newValue;
        const div = document.createElement('div');
        div.className = 'field-value';
        div.setAttribute('ondblclick', `editField(${fieldNum}, this)`);
        div.textContent = newValue;
        input.replaceWith(div);
    };
    
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        }
    });
}

async function sendMessage() {
    if (!parsedMessage) {
        alert('请先解析报文');
        return;
    }

    try {
        const response = await axios.post(`${API_BASE}/send`, {
            message: parsedMessage
        });

        const result = response.data;
        const idempotentNote = result.isIdempotent ? `\n⚠️ 幂等返回 (重复报文)\n原始时间: ${result.originalTime}` : '';
        alert(`交易完成!\n响应码: ${result.responseCode}\n响应消息: ${result.responseMessage}\n检索参考号: ${result.rrn}${idempotentNote}`);
        
        if (result.parsedResponse) {
            parsedMessage = result.parsedResponse;
            displayParseResult(parsedMessage);
        }
        
        loadTransactions();
    } catch (error) {
        console.error('发送失败:', error);
        alert('发送失败: ' + (error.response?.data?.error || error.message));
    }
}

async function loadTransactions() {
    try {
        const response = await axios.get(`${API_BASE}/transactions`);
        displayTransactions(response.data.transactions || []);
    } catch (error) {
        console.error('加载交易记录失败:', error);
    }
}

function displayTransactions(transactions) {
    const tbody = document.getElementById('transactionsBody');
    
    if (transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: #6b7280; padding: 20px;">暂无交易记录</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = transactions.map(tx => {
        const scheme = detectCardSchemeLocal(tx.card_number);
        return `
        <tr>
            <td>${formatDate(tx.created_at)}</td>
            <td>${tx.mti || '-'}</td>
            <td>${maskCardNumber(tx.card_number)}</td>
            <td>${scheme}</td>
            <td>${formatAmount(tx.amount)}</td>
            <td>${tx.rrn || '-'}</td>
            <td>
                <span class="response-badge ${tx.response_code === '00' ? 'response-00' : 'response-other'}">
                    ${tx.response_code || '-'}
                </span>
            </td>
            <td>${tx.status || '-'}</td>
        </tr>
    `}).join('');
}

function detectCardSchemeLocal(cardNumber) {
    if (!cardNumber) return '-';
    const pan = cardNumber.replace(/\D/g, '');
    if (pan.startsWith('62') || pan.startsWith('60')) return '银联';
    if (pan.startsWith('4')) return 'Visa';
    if (pan.startsWith('5') || pan.startsWith('2')) return 'Mastercard';
    if (pan.startsWith('34') || pan.startsWith('37')) return 'Amex';
    if (pan.startsWith('35')) return 'JCB';
    return '其他';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
}

function maskCardNumber(card) {
    if (!card) return '-';
    if (card.length <= 10) return card;
    return card.substring(0, 6) + '****' + card.substring(card.length - 4);
}

function formatAmount(amount) {
    if (!amount) return '-';
    const num = parseInt(amount);
    if (isNaN(num)) return amount;
    return (num / 100).toFixed(2);
}

function clearAll() {
    document.getElementById('messageInput').value = '';
    document.getElementById('messageInfo').style.display = 'none';
    document.getElementById('bitmapDisplay').style.display = 'none';
    document.getElementById('secondaryBitmapDisplay').style.display = 'none';
    document.getElementById('fieldsContainer').innerHTML = `
        <div style="text-align: center; color: #6b7280; padding: 40px;">
            请输入报文并点击"解析报文"
        </div>
    `;
    parsedMessage = null;
}

function loadSample() {
    if (currentFormat === 'hex') {
        document.getElementById('messageInput').value = sampleHexMessage;
    } else {
        const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<iso8583>
    <mti>0200</mti>
    <field id="2">6222777788889999</field>
    <field id="3">000000</field>
    <field id="4">000000010000</field>
    <field id="7">0725123000</field>
    <field id="11">123456</field>
    <field id="12">123000</field>
    <field id="13">0725</field>
    <field id="14">1235</field>
    <field id="18">5912</field>
    <field id="22">051</field>
    <field id="37">123456789012</field>
    <field id="41">12345678</field>
    <field id="42">123456789012345</field>
    <field id="43">SHANGHAI TEST MERCHANT    SHANGHAI CN</field>
    <field id="49">156</field>
</iso8583>`;
        document.getElementById('messageInput').value = sampleXml;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function exportTransactions() {
    try {
        const response = await axios.get(`${API_BASE}/transactions/export`, {
            responseType: 'blob'
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `transactions_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('导出失败:', error);
        alert('导出失败: ' + (error.response?.data?.error || error.message));
    }
}

function updateLastUpdate() {
    const now = new Date();
    document.getElementById('lastUpdate').textContent = '最后更新: ' + now.toLocaleTimeString('zh-CN');
}

async function checkServerStatus() {
    try {
        await axios.get(`${API_BASE}/health`);
        document.getElementById('serverStatus').className = 'status-dot';
        document.getElementById('serverStatusText').textContent = '服务已连接';
        return true;
    } catch (error) {
        document.getElementById('serverStatus').className = 'status-dot error';
        document.getElementById('serverStatusText').textContent = '服务未连接';
        return false;
    }
}

setInterval(checkServerStatus, 5000);
checkServerStatus();
loadTransactions();
