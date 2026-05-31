class NFCManager {
    constructor() {
        this.reader = null;
        this.writer = null;
        this.currentTagData = null;
        this.encryptedData = null;
        this.templates = [];
        this.history = [];
        this.rules = [];
        this.isReading = false;
        this.init();
    }

    init() {
        this.checkNFCSupport();
        this.bindEvents();
        this.loadTemplates();
        this.loadHistory();
        this.loadRules();
        this.renderWriteFields();
    }

    checkNFCSupport() {
        const statusEl = document.getElementById('nfcStatus');
        if ('NDEFReader' in window) {
            statusEl.textContent = 'NFC 已就绪';
            statusEl.classList.add('active');
        } else {
            statusEl.textContent = 'NFC 不支持';
            this.showToast('您的浏览器不支持 Web NFC');
        }
    }

    bindEvents() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        document.getElementById('startReadBtn').addEventListener('click', () => this.startReading());
        document.getElementById('stopReadBtn').addEventListener('click', () => this.stopReading());
        document.getElementById('saveTagBtn').addEventListener('click', () => this.saveCurrentTag());
        document.getElementById('writeType').addEventListener('change', () => this.renderWriteFields());
        document.getElementById('startWriteBtn').addEventListener('click', () => this.prepareWrite());
        document.getElementById('cancelWriteBtn').addEventListener('click', () => this.cancelWrite());
        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());
        document.getElementById('generateBatchBtn').addEventListener('click', () => this.generateBatchQRCodes());
        
        document.getElementById('encryptToggle').addEventListener('change', (e) => {
            document.getElementById('encryptFields').style.display = e.target.checked ? 'block' : 'none';
        });
        
        document.getElementById('decryptBtn').addEventListener('click', () => this.decryptTagData());
        document.getElementById('exportCsvBtn').addEventListener('click', () => this.exportCsv());
        
        document.getElementById('addRuleBtn').addEventListener('click', () => this.showAddRuleForm());
        document.getElementById('saveRuleBtn').addEventListener('click', () => this.saveRule());
        document.getElementById('cancelRuleBtn').addEventListener('click', () => this.hideAddRuleForm());
    }

    switchTab(tabName) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
        
        if (tabName === 'history') {
            this.loadHistory();
        }
        if (tabName === 'template') {
            this.loadTemplates();
        }
        if (tabName === 'rules') {
            this.loadRules();
        }
    }

    async startReading() {
        try {
            this.reader = new NDEFReader();
            await this.reader.scan();
            
            this.isReading = true;
            document.getElementById('startReadBtn').style.display = 'none';
            document.getElementById('stopReadBtn').style.display = 'block';
            
            const statusEl = document.getElementById('nfcStatus');
            statusEl.textContent = '扫描中...';
            statusEl.classList.remove('active');
            statusEl.classList.add('scanning');

            this.reader.addEventListener('reading', ({ message, serialNumber }) => {
                this.handleTagRead(message, serialNumber);
            });

            this.reader.addEventListener('readingerror', () => {
                this.showToast('读取标签失败，请重试');
            });

            this.showToast('请将 NFC 标签靠近设备');
        } catch (error) {
            this.showToast(`启动扫描失败: ${error.message}`);
        }
    }

    stopReading() {
        if (this.reader) {
            this.reader = null;
        }
        this.isReading = false;
        document.getElementById('startReadBtn').style.display = 'block';
        document.getElementById('stopReadBtn').style.display = 'none';
        
        const statusEl = document.getElementById('nfcStatus');
        statusEl.textContent = 'NFC 已就绪';
        statusEl.classList.remove('scanning');
        statusEl.classList.add('active');
    }

    decodeTextRecord(record) {
        const data = new Uint8Array(record.data);
        if (data.length === 0) return '';
        
        const languageCodeLength = data[0] & 0x3F;
        const isUtf16 = (data[0] & 0x80) !== 0;
        const encoding = isUtf16 ? 'utf-16be' : 'utf-8';
        
        const textDecoder = new TextDecoder(encoding);
        return textDecoder.decode(data.slice(1 + languageCodeLength));
    }

    handleTagRead(message, serialNumber) {
        const records = message.records;
        let content = '';
        let dataType = 'unknown';
        let data = '';
        let isEncrypted = false;

        for (const record of records) {
            const recordType = record.recordType;
            
            if (recordType === 'text') {
                const decoded = this.decodeTextRecord(record);
                content += `文本: ${decoded}\n`;
                dataType = 'text';
                data = decoded;
                
                try {
                    const parsed = JSON.parse(decoded);
                    if (parsed.type === 'encrypted' && parsed.encrypted && parsed.iv && parsed.authTag) {
                        isEncrypted = true;
                        this.encryptedData = parsed;
                        content = `🔒 检测到加密数据\n\n加密数据摘要: ${parsed.encrypted.substring(0, 30)}...`;
                    }
                } catch (e) {
                }
            } else if (recordType === 'url') {
                const decoded = this.decodeUrlRecord(record);
                content += `URL: ${decoded}\n`;
                dataType = 'url';
                data = decoded;
            } else if (recordType === 'mime') {
                const textDecoder = new TextDecoder('utf-8');
                const decoded = textDecoder.decode(record.data);
                content += `数据 (${record.mediaType}): ${decoded}\n`;
                data = decoded;
            } else {
                content += `记录类型: ${recordType}\n`;
            }
        }

        this.currentTagData = {
            serialNumber,
            content,
            dataType,
            data,
            records: records.length,
            isEncrypted
        };

        document.getElementById('tagContent').innerHTML = `
            <p><strong>序列号:</strong> ${serialNumber || '未知'}</p>
            <p><strong>记录数:</strong> ${records.length}</p>
            <p><strong>内容:</strong></p>
            <pre>${content}</pre>
        `;
        
        document.getElementById('decryptSection').style.display = isEncrypted ? 'block' : 'none';
        document.getElementById('decryptResult').innerHTML = '';
        document.getElementById('decryptPassword').value = '';
        
        document.getElementById('readResult').style.display = 'block';
        this.showToast('标签读取成功！');
    }

    decodeUrlRecord(record) {
        const data = new Uint8Array(record.data);
        if (data.length === 0) return '';
        
        const prefixCode = data[0];
        const prefixes = [
            '', 'http://www.', 'https://www.', 'http://', 'https://',
            'tel:', 'mailto:', 'ftp://anonymous:anonymous@', 'ftp://ftp.',
            'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://', 'dav://',
            'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:',
            'sip:', 'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://',
            'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:', 'urn:epc:tag:',
            'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:'
        ];
        
        const prefix = prefixes[prefixCode] || '';
        const textDecoder = new TextDecoder('utf-8');
        return prefix + textDecoder.decode(data.slice(1));
    }

    async decryptTagData() {
        const password = document.getElementById('decryptPassword').value;
        if (!password) {
            this.showToast('请输入密码');
            return;
        }

        try {
            const response = await fetch('/api/decrypt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    encryptedData: this.encryptedData,
                    password
                })
            });

            const result = await response.json();
            const resultEl = document.getElementById('decryptResult');
            
            if (result.success) {
                resultEl.innerHTML = `
                    <div style="padding:10px;background:#d4edda;color:#155724;border-radius:5px;">
                        <strong>✅ 解密成功！</strong><br>
                        原始数据: ${result.data}
                    </div>
                `;
                this.currentTagData.decryptedData = result.data;
            } else {
                resultEl.innerHTML = `
                    <div style="padding:10px;background:#f8d7da;color:#721c24;border-radius:5px;">
                        <strong>❌ 解密失败</strong><br>
                        ${result.error}
                    </div>
                `;
            }
        } catch (error) {
            this.showToast(`解密错误: ${error.message}`);
        }
    }

    async saveCurrentTag() {
        if (!this.currentTagData) {
            this.showToast('没有可保存的标签数据');
            return;
        }

        try {
            const response = await fetch('/api/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.currentTagData)
            });
            
            if (response.ok) {
                this.showToast('已保存到历史记录');
                this.loadHistory();
            } else {
                this.showToast('保存失败');
            }
        } catch (error) {
            this.showToast(`保存错误: ${error.message}`);
        }
    }

    renderWriteFields() {
        const type = document.getElementById('writeType').value;
        const container = document.getElementById('writeFields');
        
        const fieldConfigs = {
            url: [
                { name: 'url', label: '网址', type: 'url', placeholder: 'https://example.com' }
            ],
            text: [
                { name: 'text', label: '文本内容', type: 'text', placeholder: '输入要写入的文本' }
            ],
            bluetooth: [
                { name: 'mac', label: 'MAC地址', type: 'text', placeholder: 'AA:BB:CC:DD:EE:FF' }
            ],
            wifi: [
                { name: 'ssid', label: '网络名称', type: 'text', placeholder: 'WiFi名称' },
                { name: 'password', label: '密码', type: 'text', placeholder: 'WiFi密码' },
                { name: 'type', label: '加密类型', type: 'select', options: ['WPA', 'WEP', 'nopass'] }
            ],
            vcard: [
                { name: 'name', label: '姓名', type: 'text', placeholder: '张三' },
                { name: 'phone', label: '电话', type: 'tel', placeholder: '13800138000' },
                { name: 'email', label: '邮箱', type: 'email', placeholder: 'example@email.com' },
                { name: 'company', label: '公司', type: 'text', placeholder: '公司名称' }
            ]
        };

        const fields = fieldConfigs[type] || [];
        let html = '';
        
        fields.forEach(field => {
            html += `<div class="form-group"><label>${field.label}</label>`;
            
            if (field.type === 'select') {
                html += `<select id="field_${field.name}">`;
                field.options.forEach(opt => {
                    html += `<option value="${opt}">${opt}</option>`;
                });
                html += `</select>`;
            } else {
                html += `<input type="${field.type}" id="field_${field.name}" placeholder="${field.placeholder || ''}">`;
            }
            
            html += '</div>';
        });

        container.innerHTML = html;
    }

    getWriteData() {
        const type = document.getElementById('writeType').value;
        
        switch (type) {
            case 'url':
                return document.getElementById('field_url').value;
            case 'text':
                return document.getElementById('field_text').value;
            case 'bluetooth':
                return `BT:${document.getElementById('field_mac').value}`;
            case 'wifi':
                const ssid = document.getElementById('field_ssid').value;
                const password = document.getElementById('field_password').value;
                const auth = document.getElementById('field_type').value;
                return `WIFI:T:${auth};S:${ssid};P:${password};;`;
            case 'vcard':
                const name = document.getElementById('field_name').value;
                const phone = document.getElementById('field_phone').value;
                const email = document.getElementById('field_email').value;
                const company = document.getElementById('field_company').value;
                return `BEGIN:VCARD\nVERSION:3.0\nN:${name}\nTEL:${phone}\nEMAIL:${email}\nORG:${company}\nEND:VCARD`;
            default:
                return '';
        }
    }

    createTextRecord(text, language = 'zh') {
        const encoder = new TextEncoder();
        const languageCode = encoder.encode(language);
        const textBytes = encoder.encode(text);
        
        const recordBytes = new Uint8Array(1 + languageCode.length + textBytes.length);
        recordBytes[0] = languageCode.length & 0x3F;
        recordBytes.set(languageCode, 1);
        recordBytes.set(textBytes, 1 + languageCode.length);
        
        return { recordType: 'text', data: recordBytes.buffer };
    }

    createUrlRecord(url) {
        const prefixes = [
            { prefix: 'http://www.', code: 0x01 },
            { prefix: 'https://www.', code: 0x02 },
            { prefix: 'http://', code: 0x03 },
            { prefix: 'https://', code: 0x04 },
            { prefix: 'tel:', code: 0x05 },
            { prefix: 'mailto:', code: 0x06 },
            { prefix: 'ftp://anonymous:anonymous@', code: 0x07 },
            { prefix: 'ftp://ftp.', code: 0x08 },
            { prefix: 'ftps://', code: 0x09 },
            { prefix: 'sftp://', code: 0x0A },
            { prefix: 'smb://', code: 0x0B },
            { prefix: 'nfs://', code: 0x0C },
            { prefix: 'ftp://', code: 0x0D },
            { prefix: 'dav://', code: 0x0E },
            { prefix: 'news:', code: 0x0F },
            { prefix: 'telnet://', code: 0x10 },
            { prefix: 'imap:', code: 0x11 },
            { prefix: 'rtsp://', code: 0x12 },
            { prefix: 'urn:', code: 0x13 },
            { prefix: 'pop:', code: 0x14 },
            { prefix: 'sip:', code: 0x15 },
            { prefix: 'sips://', code: 0x16 },
            { prefix: 'tftp://', code: 0x17 },
            { prefix: 'btspp://', code: 0x18 },
            { prefix: 'btl2cap://', code: 0x19 },
            { prefix: 'btgoep://', code: 0x1A },
            { prefix: 'tcpobex://', code: 0x1B },
            { prefix: 'irdaobex://', code: 0x1C },
            { prefix: 'file://', code: 0x1D },
            { prefix: 'urn:epc:id:', code: 0x1E },
            { prefix: 'urn:epc:tag:', code: 0x1F },
            { prefix: 'urn:epc:pat:', code: 0x20 },
            { prefix: 'urn:epc:raw:', code: 0x21 },
            { prefix: 'urn:epc:', code: 0x22 },
            { prefix: 'urn:nfc:', code: 0x23 }
        ];
        
        let prefixCode = 0x00;
        let urlSuffix = url;
        
        for (const { prefix, code } of prefixes) {
            if (url.startsWith(prefix)) {
                prefixCode = code;
                urlSuffix = url.slice(prefix.length);
                break;
            }
        }
        
        const encoder = new TextEncoder();
        const urlBytes = encoder.encode(urlSuffix);
        const recordBytes = new Uint8Array(1 + urlBytes.length);
        recordBytes[0] = prefixCode;
        recordBytes.set(urlBytes, 1);
        
        return { recordType: 'url', data: recordBytes.buffer };
    }

    createMimeRecord(mimeType, data) {
        const encoder = new TextEncoder();
        return { recordType: 'mime', mediaType: mimeType, data: encoder.encode(data).buffer };
    }

    async prepareWrite() {
        let data = this.getWriteData();
        if (!data) {
            this.showToast('请填写完整数据');
            return;
        }

        const encryptEnabled = document.getElementById('encryptToggle').checked;
        const password = document.getElementById('encryptPassword').value;
        
        if (encryptEnabled && !password) {
            this.showToast('请输入加密密码');
            return;
        }

        if (encryptEnabled) {
            try {
                const response = await fetch('/api/encrypt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data, password })
                });
                const encrypted = await response.json();
                data = JSON.stringify(encrypted);
            } catch (error) {
                this.showToast(`加密失败: ${error.message}`);
                return;
            }
        }

        try {
            this.writer = new NDEFWriter();
            
            document.getElementById('startWriteBtn').style.display = 'none';
            document.getElementById('cancelWriteBtn').style.display = 'block';
            
            const statusEl = document.getElementById('writeStatus');
            statusEl.style.display = 'block';
            statusEl.className = 'status-message info';
            statusEl.textContent = '请将 NFC 标签靠近设备...';

            const writeType = document.getElementById('writeType').value;
            let records;
            
            if (writeType === 'url' && !encryptEnabled) {
                records = [this.createUrlRecord(data)];
            } else {
                records = [this.createTextRecord(data)];
            }

            await this.writer.write({ records });
            
            statusEl.className = 'status-message success';
            statusEl.textContent = encryptEnabled ? '加密写入成功！' : '写入成功！';
            this.showToast(encryptEnabled ? 'NFC标签加密写入成功！' : 'NFC标签写入成功！');
            
            const response = await fetch('/api/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'write',
                    dataType: writeType,
                    data: data,
                    isEncrypted: encryptEnabled
                })
            });
            
            this.cancelWrite();
            this.loadHistory();
        } catch (error) {
            const statusEl = document.getElementById('writeStatus');
            statusEl.className = 'status-message error';
            statusEl.textContent = `写入失败: ${error.message}`;
            this.showToast(`写入失败: ${error.message}`);
            this.cancelWrite();
        }
    }

    cancelWrite() {
        this.writer = null;
        document.getElementById('startWriteBtn').style.display = 'block';
        document.getElementById('cancelWriteBtn').style.display = 'none';
        document.getElementById('writeStatus').className = 'status-message';
        document.getElementById('writeStatus').style.display = 'none';
    }

    async loadTemplates() {
        try {
            const response = await fetch('/api/templates');
            this.templates = await response.json();
            this.renderTemplates();
        } catch (error) {
            console.error('加载模板失败:', error);
        }
    }

    renderTemplates() {
        const container = document.getElementById('templateList');
        
        if (this.templates.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>暂无模板</p></div>';
            return;
        }

        let html = '';
        this.templates.forEach(template => {
            html += `
                <div class="template-item" data-type="${template.type}">
                    <div class="template-info">
                        <div class="template-name">${template.icon} ${template.name}</div>
                        <div class="template-type">类型: ${template.type}</div>
                    </div>
                    <button class="btn btn-primary" style="width:auto;padding:8px 16px;font-size:14px;margin:0;" 
                            onclick="nfcManager.useTemplate('${template.type}')">使用</button>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    useTemplate(type) {
        this.switchTab('write');
        document.getElementById('writeType').value = type;
        this.renderWriteFields();
        this.showToast('已选择模板，请填写数据');
    }

    async loadHistory() {
        try {
            const response = await fetch('/api/tags');
            this.history = await response.json();
            this.renderHistory();
        } catch (error) {
            console.error('加载历史失败:', error);
        }
    }

    renderHistory() {
        const container = document.getElementById('historyList');
        
        if (this.history.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📜</div><p>暂无历史记录</p></div>';
            return;
        }

        let html = '';
        this.history.forEach(item => {
            const date = new Date(item.createdAt).toLocaleString('zh-CN');
            const encryptedBadge = item.isEncrypted ? '<span style="background:#ffc107;color:#000;padding:2px 6px;border-radius:4px;font-size:12px;margin-left:5px;">🔒加密</span>' : '';
            html += `
                <div class="history-item">
                    <div class="history-info">
                        <div class="template-name">${this.getTypeIcon(item.dataType)} ${this.getTypeName(item.dataType)}${encryptedBadge}</div>
                        <div class="history-type">SN: ${item.serialNumber || '未知'}</div>
                        <div class="history-time">${date}</div>
                        <div class="history-data">${this.truncateText(item.data || item.content, 100)}</div>
                    </div>
                    <button class="delete-btn" onclick="nfcManager.deleteHistory('${item._id}')">删除</button>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    getTypeIcon(type) {
        const icons = { url: '🔗', text: '📝', bluetooth: '📶', wifi: '📡', vcard: '👤' };
        return icons[type] || '📄';
    }

    getTypeName(type) {
        const names = { url: 'URL链接', text: '纯文本', bluetooth: '蓝牙', wifi: 'WiFi', vcard: '电子名片' };
        return names[type] || type;
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    async deleteHistory(id) {
        try {
            const response = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
            if (response.ok) {
                this.showToast('已删除');
                this.loadHistory();
            }
        } catch (error) {
            this.showToast('删除失败');
        }
    }

    async clearHistory() {
        if (!confirm('确定要清空所有历史记录吗？')) return;
        
        for (const item of this.history) {
            await fetch(`/api/tags/${item._id}`, { method: 'DELETE' });
        }
        this.showToast('历史记录已清空');
        this.loadHistory();
    }

    async exportCsv() {
        try {
            const response = await fetch('/api/export/csv');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nfc_tags_history_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            this.showToast('CSV导出成功');
        } catch (error) {
            this.showToast(`导出失败: ${error.message}`);
        }
    }

    async loadRules() {
        try {
            const response = await fetch('/api/rules');
            this.rules = await response.json();
            this.renderRules();
        } catch (error) {
            console.error('加载规则失败:', error);
        }
    }

    showAddRuleForm() {
        document.getElementById('addRuleForm').style.display = 'block';
        document.getElementById('addRuleBtn').style.display = 'none';
    }

    hideAddRuleForm() {
        document.getElementById('addRuleForm').style.display = 'none';
        document.getElementById('addRuleBtn').style.display = 'block';
        document.getElementById('ruleName').value = '';
        document.getElementById('ruleDescription').value = '';
    }

    async saveRule() {
        const name = document.getElementById('ruleName').value;
        const type = document.getElementById('ruleType').value;
        const action = document.getElementById('ruleAction').value;
        const icon = document.getElementById('ruleIcon').value;
        const description = document.getElementById('ruleDescription').value;

        if (!name) {
            this.showToast('请输入规则名称');
            return;
        }

        try {
            const response = await fetch('/api/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type, action, icon, description })
            });

            if (response.ok) {
                this.showToast('规则创建成功');
                this.hideAddRuleForm();
                this.loadRules();
            } else {
                this.showToast('创建失败');
            }
        } catch (error) {
            this.showToast(`创建失败: ${error.message}`);
        }
    }

    renderRules() {
        const container = document.getElementById('rulesList');
        
        if (this.rules.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚙️</div><p>暂无自动化规则</p></div>';
            return;
        }

        let html = '';
        this.rules.forEach(rule => {
            html += `
                <div class="rule-item">
                    <div class="rule-info">
                        <div class="rule-name">${rule.icon || '⚙️'} ${rule.name}</div>
                        <div class="rule-type">类型: ${this.getRuleTypeName(rule.type)}</div>
                        <div class="rule-description">${rule.description || '暂无描述'}</div>
                    </div>
                    <div class="rule-actions">
                        <button class="btn btn-success" style="padding:5px 10px;font-size:12px;margin-right:5px;" 
                                onclick="nfcManager.executeRule('${rule._id}')">执行</button>
                        <button class="delete-btn" onclick="nfcManager.deleteRule('${rule._id}')">删除</button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    getRuleTypeName(type) {
        const names = { device: '设备控制', app: '应用启动', communication: '通讯', network: '网络' };
        return names[type] || type;
    }

    async executeRule(ruleId) {
        try {
            const response = await fetch('/api/rules/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ruleId })
            });
            const result = await response.json();
            if (result.success) {
                this.showToast(result.message);
            } else {
                this.showToast('执行失败');
            }
        } catch (error) {
            this.showToast(`执行失败: ${error.message}`);
        }
    }

    async deleteRule(id) {
        if (!confirm('确定要删除此规则吗？')) return;
        
        try {
            const response = await fetch(`/api/rules/${id}`, { method: 'DELETE' });
            if (response.ok) {
                this.showToast('已删除');
                this.loadRules();
            }
        } catch (error) {
            this.showToast('删除失败');
        }
    }

    async generateBatchQRCodes() {
        const textarea = document.getElementById('batchData');
        const size = document.getElementById('qrSize').value;
        const lines = textarea.value.trim().split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            this.showToast('请输入数据');
            return;
        }

        const items = lines.map((line, index) => ({
            id: index,
            label: line,
            data: line
        }));

        try {
            this.showToast('正在生成二维码...');
            const response = await fetch('/api/batch-qrcodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items, options: { width: parseInt(size) } })
            });
            
            const result = await response.json();
            this.renderBatchResults(result.qrCodes);
            this.showToast(`已生成 ${result.qrCodes.length} 个二维码`);
        } catch (error) {
            this.showToast(`生成失败: ${error.message}`);
        }
    }

    renderBatchResults(qrCodes) {
        const container = document.getElementById('batchResults');
        let html = '';
        
        qrCodes.forEach(item => {
            html += `
                <div class="qr-item">
                    <img src="${item.qrCode}" alt="QR Code">
                    <div class="qr-label">${this.truncateText(item.label, 30)}</div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

const nfcManager = new NFCManager();
