const { ipcRenderer } = require('electron');

let currentProjectId = null;
let selectedCanId = null;
let editingSignalId = null;
let allMessages = [];
let allSignals = {};
let signalChart = null;
let triggers = [];

document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadProjects();
    initializeChart();
});

function initializeEventListeners() {
    document.getElementById('new-project-btn').addEventListener('click', () => {
        openModal('project-modal');
    });

    document.getElementById('delete-project-btn').addEventListener('click', async () => {
        if (currentProjectId && confirm('确定要删除此项目吗？')) {
            await ipcRenderer.invoke('delete-project', { project_id: currentProjectId });
            currentProjectId = null;
            selectedCanId = null;
            loadProjects();
            updateUI();
        }
    });

    document.getElementById('project-select').addEventListener('change', async (e) => {
        const projectId = parseInt(e.target.value);
        if (projectId) {
            currentProjectId = projectId;
            await ipcRenderer.invoke('select-project', { project_id: projectId });
            await loadMessages();
            await loadSignals();
            updateUI();
        } else {
            currentProjectId = null;
            selectedCanId = null;
            updateUI();
        }
    });

    document.getElementById('start-capture-btn').addEventListener('click', async () => {
        if (!currentProjectId) {
            alert('请先选择或创建一个项目');
            return;
        }
        
        const useVirtual = document.getElementById('use-virtual').checked;
        const channel = document.getElementById('pcan-channel').value;
        
        await ipcRenderer.invoke('start-capture', { use_virtual: useVirtual, channel });
        
        document.getElementById('start-capture-btn').disabled = true;
        document.getElementById('stop-capture-btn').disabled = false;
        document.getElementById('capture-status').textContent = '状态: 采集中...';
        document.getElementById('capture-status').style.color = '#e74c3c';
    });

    document.getElementById('stop-capture-btn').addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('stop-capture');
        
        document.getElementById('start-capture-btn').disabled = false;
        document.getElementById('stop-capture-btn').disabled = true;
        document.getElementById('capture-status').textContent = `状态: 已停止 (${result.message_count} 条报文)`;
        document.getElementById('capture-status').style.color = '#2ecc71';
        
        await loadMessages();
    });

    document.getElementById('analyze-btn').addEventListener('click', async () => {
        if (!currentProjectId) return;
        
        document.getElementById('analyze-btn').disabled = true;
        document.getElementById('analyze-btn').textContent = '分析中...';
        
        try {
            const result = await ipcRenderer.invoke('analyze-signals', { can_id: selectedCanId });
            if (result.success) {
                allSignals = result.signals;
                renderSignals();
                updateSignalSelect();
                document.getElementById('generate-dbc-btn').disabled = false;
            }
        } catch (e) {
            alert('分析失败: ' + e.message);
        }
        
        document.getElementById('analyze-btn').disabled = false;
        document.getElementById('analyze-btn').textContent = '分析信号';
    });

    document.getElementById('generate-dbc-btn').addEventListener('click', async () => {
        if (!currentProjectId) return;
        
        try {
            const result = await ipcRenderer.invoke('save-file-dialog', {
                title: '保存DBC文件',
                defaultPath: 'generated.dbc',
                filters: [{ name: 'DBC Files', extensions: ['dbc'] }]
            });
            
            if (!result.canceled && result.filePath) {
                const dbcResult = await ipcRenderer.invoke('generate-dbc', {
                    name: 'generated.dbc',
                    output_path: result.filePath
                });
                
                if (dbcResult.success) {
                    alert('DBC文件生成成功!');
                }
            }
        } catch (e) {
            alert('生成DBC失败: ' + e.message);
        }
    });

    document.getElementById('message-filter').addEventListener('input', (e) => {
        renderMessages(e.target.value);
    });

    document.getElementById('add-signal-btn').addEventListener('click', () => {
        if (!selectedCanId) return;
        editingSignalId = null;
        clearSignalForm();
        openModal('signal-modal');
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });

    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            closeModal(modal.id);
        });
    });

    document.getElementById('cancel-project-btn').addEventListener('click', () => {
        closeModal('project-modal');
    });

    document.getElementById('confirm-project-btn').addEventListener('click', async () => {
        const name = document.getElementById('project-name').value.trim();
        const description = document.getElementById('project-desc').value.trim();
        
        if (!name) {
            alert('请输入项目名称');
            return;
        }
        
        try {
            const result = await ipcRenderer.invoke('create-project', { name, description });
            if (result.success) {
                closeModal('project-modal');
                document.getElementById('project-name').value = '';
                document.getElementById('project-desc').value = '';
                loadProjects();
            }
        } catch (e) {
            alert('创建项目失败: ' + e.message);
        }
    });

    document.getElementById('cancel-signal-btn').addEventListener('click', () => {
        closeModal('signal-modal');
    });

    document.getElementById('confirm-signal-btn').addEventListener('click', async () => {
        const signalData = {
            name: document.getElementById('signal-name').value.trim(),
            start_bit: parseInt(document.getElementById('signal-start').value),
            bit_length: parseInt(document.getElementById('signal-length').value),
            is_signed: document.getElementById('signal-signed').checked,
            is_big_endian: document.getElementById('signal-big-endian').checked,
            scale: parseFloat(document.getElementById('signal-scale').value),
            offset: parseFloat(document.getElementById('signal-offset').value),
            unit: document.getElementById('signal-unit').value.trim()
        };
        
        if (!signalData.name) {
            alert('请输入信号名称');
            return;
        }
        
        try {
            if (editingSignalId) {
                await ipcRenderer.invoke('update-signal', {
                    signal_id: editingSignalId,
                    signal: signalData
                });
            } else {
                await ipcRenderer.invoke('add-manual-signal', {
                    can_id: selectedCanId,
                    signal: signalData
                });
            }
            
            closeModal('signal-modal');
            await loadSignals();
        } catch (e) {
            alert('保存信号失败: ' + e.message);
        }
    });

    document.getElementById('signal-select').addEventListener('change', async (e) => {
        const signalId = parseInt(e.target.value);
        if (signalId) {
            await loadSignalChart(signalId);
        }
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    document.getElementById('export-excel-btn').addEventListener('click', async () => {
        if (!currentProjectId) return;
        
        try {
            const result = await ipcRenderer.invoke('save-file-dialog', {
                title: '导出Excel',
                defaultPath: 'dbc_export.xlsx',
                filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
            });
            
            if (!result.canceled && result.filePath) {
                const excelResult = await ipcRenderer.invoke('export-excel', {
                    output_path: result.filePath
                });
                
                if (excelResult.success) {
                    alert('Excel导出成功!');
                }
            }
        } catch (e) {
            alert('导出Excel失败: ' + e.message);
        }
    });

    document.getElementById('connect-canoe-btn').addEventListener('click', async () => {
        const interfaceType = document.getElementById('canoe-interface').value;
        
        try {
            const result = await ipcRenderer.invoke('connect-canoe', {
                interface_type: interfaceType
            });
            
            if (result.success) {
                document.getElementById('connect-canoe-btn').disabled = true;
                document.getElementById('disconnect-canoe-btn').disabled = false;
                document.getElementById('start-canoe-btn').disabled = false;
                document.getElementById('canoe-status').textContent = '状态: 已连接';
                document.getElementById('canoe-status').style.color = '#2ecc71';
            }
        } catch (e) {
            alert('连接CANoe失败: ' + e.message);
        }
    });

    document.getElementById('disconnect-canoe-btn').addEventListener('click', async () => {
        await ipcRenderer.invoke('disconnect-canoe');
        
        document.getElementById('connect-canoe-btn').disabled = false;
        document.getElementById('disconnect-canoe-btn').disabled = true;
        document.getElementById('start-canoe-btn').disabled = true;
        document.getElementById('stop-canoe-btn').disabled = true;
        document.getElementById('canoe-status').textContent = '状态: 未连接';
        document.getElementById('canoe-status').style.color = '#95a5a6';
    });

    document.getElementById('start-canoe-btn').addEventListener('click', async () => {
        try {
            await ipcRenderer.invoke('start-canoe', {});
            
            document.getElementById('start-canoe-btn').disabled = true;
            document.getElementById('stop-canoe-btn').disabled = false;
            document.getElementById('canoe-status').textContent = '状态: 测量中...';
            document.getElementById('canoe-status').style.color = '#e74c3c';
        } catch (e) {
            alert('启动测量失败: ' + e.message);
        }
    });

    document.getElementById('stop-canoe-btn').addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('stop-canoe');
        
        document.getElementById('start-canoe-btn').disabled = false;
        document.getElementById('stop-canoe-btn').disabled = true;
        document.getElementById('canoe-status').textContent = `状态: 已停止 (${result.message_count} 条)`;
        document.getElementById('canoe-status').style.color = '#2ecc71';
        
        await loadMessages();
    });

    document.getElementById('add-trigger-btn').addEventListener('click', () => {
        clearTriggerForm();
        openModal('trigger-modal');
    });

    document.getElementById('cancel-trigger-btn').addEventListener('click', () => {
        closeModal('trigger-modal');
    });

    document.getElementById('confirm-trigger-btn').addEventListener('click', async () => {
        const triggerType = document.getElementById('trigger-type').value;
        const canIdStr = document.getElementById('trigger-can-id').value.trim();
        const canId = canIdStr ? parseInt(canIdStr, 16) : null;
        
        const triggerData = {
            trigger_type: triggerType,
            can_id: canId,
            byte_offset: parseInt(document.getElementById('trigger-byte-offset').value),
            bit_offset: parseInt(document.getElementById('trigger-bit-offset').value),
            bit_length: parseInt(document.getElementById('trigger-bit-length').value),
            condition: document.getElementById('trigger-condition').value,
            value: document.getElementById('trigger-value').value,
            pre_trigger_samples: parseInt(document.getElementById('trigger-pre').value),
            post_trigger_samples: parseInt(document.getElementById('trigger-post').value),
            description: document.getElementById('trigger-desc').value.trim()
        };
        
        try {
            const result = await ipcRenderer.invoke('add-trigger', triggerData);
            if (result.success) {
                closeModal('trigger-modal');
                await loadTriggers();
                updateTriggerUI();
            }
        } catch (e) {
            alert('添加触发器失败: ' + e.message);
        }
    });

    document.getElementById('start-trigger-btn').addEventListener('click', async () => {
        if (triggers.length === 0) {
            alert('请先添加触发器');
            return;
        }
        
        try {
            await ipcRenderer.invoke('start-trigger-recording');
            
            document.getElementById('start-trigger-btn').disabled = true;
            document.getElementById('stop-trigger-btn').disabled = false;
            document.getElementById('add-trigger-btn').disabled = true;
        } catch (e) {
            alert('启动触发录制失败: ' + e.message);
        }
    });

    document.getElementById('stop-trigger-btn').addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('stop-trigger-recording');
        
        document.getElementById('start-trigger-btn').disabled = false;
        document.getElementById('stop-trigger-btn').disabled = true;
        document.getElementById('add-trigger-btn').disabled = false;
        
        if (result.message_count > 0) {
            alert(`触发录制完成，捕获 ${result.message_count} 条报文`);
            await loadMessages();
        }
    });
}

function initializeChart() {
    const ctx = document.getElementById('signal-chart').getContext('2d');
    signalChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '信号值',
                data: [],
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '时间 (s)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: '值'
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

async function loadProjects() {
    try {
        const result = await ipcRenderer.invoke('get-projects');
        if (result.success) {
            const select = document.getElementById('project-select');
            select.innerHTML = '<option value="">-- 选择项目 --</option>';
            
            result.projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                select.appendChild(option);
            });
            
            if (currentProjectId) {
                select.value = currentProjectId;
            }
        }
    } catch (e) {
        console.error('Failed to load projects:', e);
    }
}

async function loadMessages() {
    if (!currentProjectId) return;
    
    try {
        const result = await ipcRenderer.invoke('get-messages', { limit: 10000 });
        if (result.success) {
            allMessages = result.messages;
            renderMessages();
            renderCanIdList(result.can_ids);
        }
    } catch (e) {
        console.error('Failed to load messages:', e);
    }
}

function renderMessages(filter = '') {
    const tbody = document.getElementById('messages-tbody');
    const countSpan = document.getElementById('message-count');
    
    let filtered = allMessages;
    if (filter) {
        const filterHex = parseInt(filter, 16);
        if (!isNaN(filterHex)) {
            filtered = allMessages.filter(msg => msg.can_id === filterHex);
        }
    }
    
    tbody.innerHTML = '';
    
    filtered.slice(0, 1000).forEach(msg => {
        const tr = document.createElement('tr');
        
        const timestampTd = document.createElement('td');
        timestampTd.textContent = msg.timestamp.toFixed(4);
        tr.appendChild(timestampTd);
        
        const canIdTd = document.createElement('td');
        canIdTd.innerHTML = `<span style="font-family: monospace; color: #667eea;">0x${msg.can_id.toString(16).toUpperCase().padStart(3, '0')}</span>`;
        tr.appendChild(canIdTd);
        
        const dlcTd = document.createElement('td');
        dlcTd.textContent = msg.dlc;
        tr.appendChild(dlcTd);
        
        const dataTd = document.createElement('td');
        dataTd.className = 'data-bytes';
        dataTd.textContent = msg.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        tr.appendChild(dataTd);
        
        tbody.appendChild(tr);
    });
    
    countSpan.textContent = `共 ${filtered.length} 条报文`;
}

function renderCanIdList(canIds) {
    const list = document.getElementById('can-id-list');
    
    if (!canIds || canIds.length === 0) {
        list.innerHTML = '<div class="empty-message">暂无数据</div>';
        return;
    }
    
    const counts = {};
    allMessages.forEach(msg => {
        counts[msg.can_id] = (counts[msg.can_id] || 0) + 1;
    });
    
    list.innerHTML = '';
    canIds.forEach(canId => {
        const item = document.createElement('div');
        item.className = 'can-id-item' + (selectedCanId === canId ? ' active' : '');
        item.innerHTML = `
            <span class="can-id-hex">0x${canId.toString(16).toUpperCase().padStart(3, '0')}</span>
            <span class="can-id-count">${counts[canId] || 0}</span>
        `;
        item.addEventListener('click', () => {
            selectedCanId = canId;
            renderCanIdList(canIds);
            renderSignals();
            document.getElementById('selected-can-id-title').textContent = 
                `CAN ID: 0x${canId.toString(16).toUpperCase().padStart(3, '0')}`;
            document.getElementById('add-signal-btn').disabled = false;
        });
        list.appendChild(item);
    });
}

async function loadSignals() {
    if (!currentProjectId) return;
    
    try {
        const result = await ipcRenderer.invoke('get-signals', { can_id: selectedCanId });
        if (result.success) {
            allSignals = result.signals;
            renderSignals();
            updateSignalSelect();
        }
    } catch (e) {
        console.error('Failed to load signals:', e);
    }
}

function renderSignals() {
    const list = document.getElementById('signals-list');
    const signals = selectedCanId ? (allSignals[selectedCanId] || []) : [];
    
    if (signals.length === 0) {
        list.innerHTML = '<div class="empty-message">请先分析信号或手动添加信号</div>';
        return;
    }
    
    list.innerHTML = '';
    signals.forEach(signal => {
        const card = document.createElement('div');
        card.className = 'signal-card';
        
        const confidence = signal.confidence || 0;
        const confidencePercent = (confidence * 100).toFixed(0);
        
        card.innerHTML = `
            <div class="signal-card-header">
                <span class="signal-name">${signal.name}</span>
                <div class="signal-actions">
                    <button class="btn btn-secondary edit-signal" data-id="${signal.id}">编辑</button>
                    <button class="btn btn-danger delete-signal" data-id="${signal.id}">删除</button>
                </div>
            </div>
            <div class="signal-details">
                <div class="signal-detail">起始位: <span>${signal.start_bit}</span></div>
                <div class="signal-detail">位长度: <span>${signal.bit_length}</span></div>
                <div class="signal-detail">有符号: <span>${signal.is_signed ? '是' : '否'}</span></div>
                <div class="signal-detail">大端序: <span>${signal.is_big_endian ? '是' : '否'}</span></div>
                <div class="signal-detail">比例: <span>${signal.scale}</span></div>
                <div class="signal-detail">偏移: <span>${signal.offset}</span></div>
                <div class="signal-detail">单位: <span>${signal.unit || '-'}</span></div>
                ${!signal.is_manual ? `<div class="signal-detail">置信度: <span>${confidencePercent}%</span></div>` : ''}
            </div>
            ${!signal.is_manual ? `
                <div class="confidence-bar">
                    <div class="confidence-fill" style="width: ${confidencePercent}%"></div>
                </div>
            ` : ''}
        `;
        
        card.querySelector('.edit-signal').addEventListener('click', () => {
            editingSignalId = signal.id;
            populateSignalForm(signal);
            openModal('signal-modal');
        });
        
        card.querySelector('.delete-signal').addEventListener('click', async () => {
            if (confirm('确定要删除此信号吗？')) {
                await ipcRenderer.invoke('delete-signal', { signal_id: signal.id });
                await loadSignals();
            }
        });
        
        list.appendChild(card);
    });
}

function updateSignalSelect() {
    const select = document.getElementById('signal-select');
    select.innerHTML = '<option value="">-- 选择信号 --</option>';
    
    let hasSignals = false;
    Object.keys(allSignals).forEach(canId => {
        const signals = allSignals[canId] || [];
        if (signals.length > 0) {
            hasSignals = true;
            const group = document.createElement('optgroup');
            group.label = `0x${parseInt(canId).toString(16).toUpperCase().padStart(3, '0')}`;
            
            signals.forEach(signal => {
                const option = document.createElement('option');
                option.value = signal.id;
                option.textContent = signal.name;
                group.appendChild(option);
            });
            
            select.appendChild(group);
        }
    });
    
    select.disabled = !hasSignals;
}

async function loadSignalChart(signalId) {
    try {
        const result = await ipcRenderer.invoke('get-signal-values', { signal_id: signalId, limit: 1000 });
        if (result.success) {
            signalChart.data.labels = result.timestamps.map(t => t.toFixed(2));
            signalChart.data.datasets[0].data = result.values;
            signalChart.data.datasets[0].label = result.signal_name;
            signalChart.update();
        }
    } catch (e) {
        console.error('Failed to load signal values:', e);
    }
}

function populateSignalForm(signal) {
    document.getElementById('signal-name').value = signal.name;
    document.getElementById('signal-start').value = signal.start_bit;
    document.getElementById('signal-length').value = signal.bit_length;
    document.getElementById('signal-signed').checked = signal.is_signed;
    document.getElementById('signal-big-endian').checked = signal.is_big_endian;
    document.getElementById('signal-scale').value = signal.scale;
    document.getElementById('signal-offset').value = signal.offset;
    document.getElementById('signal-unit').value = signal.unit || '';
}

function clearSignalForm() {
    document.getElementById('signal-name').value = '';
    document.getElementById('signal-start').value = 0;
    document.getElementById('signal-length').value = 8;
    document.getElementById('signal-signed').checked = false;
    document.getElementById('signal-big-endian').checked = false;
    document.getElementById('signal-scale').value = 1;
    document.getElementById('signal-offset').value = 0;
    document.getElementById('signal-unit').value = '';
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `${tab}-tab`);
    });
    
    if (tab === 'chart' && signalChart) {
        setTimeout(() => {
            signalChart.resize();
        }, 100);
    }
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function updateUI() {
    const hasProject = !!currentProjectId;
    
    document.getElementById('delete-project-btn').disabled = !hasProject;
    document.getElementById('start-capture-btn').disabled = !hasProject;
    document.getElementById('analyze-btn').disabled = !hasProject;
    document.getElementById('generate-dbc-btn').disabled = !hasProject || Object.keys(allSignals).length === 0;
    document.getElementById('add-signal-btn').disabled = !hasProject || !selectedCanId;
    document.getElementById('export-excel-btn').disabled = !hasProject || Object.keys(allSignals).length === 0;
    
    if (!hasProject) {
        document.getElementById('can-id-list').innerHTML = '<div class="empty-message">暂无数据</div>';
        document.getElementById('messages-tbody').innerHTML = '';
        document.getElementById('signals-list').innerHTML = '<div class="empty-message">请先分析信号</div>';
        document.getElementById('selected-can-id-title').textContent = '选择CAN ID查看信号';
    }
}

async function loadTriggers() {
    try {
        const result = await ipcRenderer.invoke('get-triggers');
        if (result.success) {
            triggers = result.triggers;
            renderTriggers();
        }
    } catch (e) {
        console.error('Failed to load triggers:', e);
    }
}

function renderTriggers() {
    const list = document.getElementById('trigger-list');
    
    if (triggers.length === 0) {
        list.innerHTML = '<div class="empty-message">暂无触发器</div>';
        return;
    }
    
    list.innerHTML = '';
    triggers.forEach((trigger, index) => {
        const item = document.createElement('div');
        item.className = 'trigger-item';
        
        const typeLabels = {
            'can_id': 'CAN ID',
            'data_pattern': '数据模式',
            'signal_value': '信号值',
            'change': '值变化'
        };
        
        item.innerHTML = `
            <div class="trigger-item-header">
                <span class="trigger-item-name">${trigger.description || `触发器 ${index + 1}`}</span>
                <span class="trigger-item-type">${typeLabels[trigger.trigger_type] || trigger.trigger_type}</span>
            </div>
            <div class="trigger-item-desc">
                ${trigger.can_id !== null ? `CAN ID: 0x${trigger.can_id.toString(16).toUpperCase()}` : ''}
                ${trigger.value !== '' && trigger.value !== null ? ` | 值: ${trigger.value}` : ''}
                ${trigger.condition ? ` | 条件: ${trigger.condition}` : ''}
            </div>
            <div class="trigger-item-actions">
                <button class="btn btn-danger remove-trigger" data-index="${index}">删除</button>
            </div>
        `;
        
        item.querySelector('.remove-trigger').addEventListener('click', async () => {
            if (confirm('确定要删除此触发器吗？')) {
                await ipcRenderer.invoke('remove-trigger', { index });
                await loadTriggers();
                updateTriggerUI();
            }
        });
        
        list.appendChild(item);
    });
}

function clearTriggerForm() {
    document.getElementById('trigger-type').value = 'can_id';
    document.getElementById('trigger-can-id').value = '';
    document.getElementById('trigger-byte-offset').value = 0;
    document.getElementById('trigger-bit-offset').value = 0;
    document.getElementById('trigger-bit-length').value = 8;
    document.getElementById('trigger-condition').value = '==';
    document.getElementById('trigger-value').value = '';
    document.getElementById('trigger-pre').value = 100;
    document.getElementById('trigger-post').value = 100;
    document.getElementById('trigger-desc').value = '';
}

function updateTriggerUI() {
    document.getElementById('start-trigger-btn').disabled = triggers.length === 0;
}
