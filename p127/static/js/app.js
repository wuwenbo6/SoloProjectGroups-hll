const state = {
    pins: [],
    peripherals: [],
    clock: {
        hse_freq: 8000000,
        hsi_freq: 16000000,
        lse_freq: 32768,
        pll_m: 8,
        pll_n: 360,
        pll_p: 2,
        pll_q: 8,
        pll_r: 2,
        sysclk_src: 'PLL',
        ahb_prescaler: 1,
        apb1_prescaler: 4,
        apb2_prescaler: 2,
        hse_bypass: false,
    },
    freertos: {
        enable: false,
        kernel: 'CMSIS_V2',
        heap_size: 3072,
        min_stack_size: 128,
        max_priority: 32,
        tick_rate: 1000,
        use_preempt: 1,
        use_timeslice: 1,
        use_mutex: 1,
        use_counting: 1,
        use_timers: 0,
        use_tickless: 0,
        tasks: [],
    },
    lowpower: {
        mode: 'none',
        pvd_enable: 0,
        pvd_level: 'PWR_PVDLEVEL_2',
        wakeup_pin: '',
        rtc_wakeup: 0,
        rtc_wakeup_time: 0,
    },
    pinData: null,
    selectedPinIndex: null,
};

let pinDataCache = null;

async function init() {
    const response = await fetch('/api/pins');
    pinDataCache = await response.json();
    state.pinData = pinDataCache;
    renderPinTable();
    bindEvents();
    updateClockFreq();
}

function bindEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('export-btn').addEventListener('click', exportProject);

    document.getElementById('add-pin-btn').addEventListener('click', openPinModal);
    document.getElementById('pin-modal-close').addEventListener('click', closePinModal);
    document.getElementById('pin-modal-cancel').addEventListener('click', closePinModal);
    document.getElementById('pin-modal-confirm').addEventListener('click', confirmPinModal);

    document.getElementById('new-pin-name').addEventListener('change', updatePinAFOptions);

    document.querySelectorAll('.add-periph').forEach(btn => {
        btn.addEventListener('click', () => openPeriphModal(btn.dataset.type));
    });
    document.getElementById('periph-modal-close').addEventListener('click', closePeriphModal);
    document.getElementById('periph-modal-cancel').addEventListener('click', closePeriphModal);
    document.getElementById('periph-modal-confirm').addEventListener('click', confirmPeriphModal);

    document.getElementById('pin-filter-input').addEventListener('input', (e) => {
        renderPinTable(e.target.value);
    });

    document.querySelectorAll('#clock-hse, #clock-hsi, #clock-lse, #pll-m, #pll-n, #pll-q, #pll-r, #sysclk-src, #ahb-prescaler, #apb1-prescaler, #apb2-prescaler').forEach(el => {
        el.addEventListener('change', () => { readClockConfig(); updateClockFreq(); });
        el.addEventListener('input', () => { readClockConfig(); updateClockFreq(); });
    });
    document.getElementById('pll-p').addEventListener('change', () => { readClockConfig(); updateClockFreq(); });
    document.getElementById('clock-hse-bypass').addEventListener('change', readClockConfig);

    document.getElementById('freertos-enable').addEventListener('change', (e) => {
        state.freertos.enable = e.target.checked;
        const config = document.getElementById('freertos-config');
        if (e.target.checked) {
            config.style.opacity = '1';
            config.style.pointerEvents = 'auto';
        } else {
            config.style.opacity = '0.5';
            config.style.pointerEvents = 'none';
        }
    });

    document.querySelectorAll('#freertos-kernel, #freertos-heap, #freertos-min-stack, #freertos-max-prio, #freertos-tick-rate, #freertos-preempt, #freertos-timeslice, #freertos-mutex, #freertos-counting, #freertos-timers, #freertos-tickless').forEach(el => {
        el.addEventListener('change', readFreeRTOSConfig);
    });

    document.getElementById('add-task-btn').addEventListener('click', () => openTaskModal());
    document.getElementById('task-modal-close').addEventListener('click', closeTaskModal);
    document.getElementById('task-modal-cancel').addEventListener('click', closeTaskModal);
    document.getElementById('task-modal-confirm').addEventListener('click', confirmTaskModal);

    document.querySelectorAll('#lp-mode, #lp-pvd, #lp-pvd-level, #lp-wakeup-pin, #lp-rtc-wakeup, #lp-rtc-time').forEach(el => {
        el.addEventListener('change', readLowPowerConfig);
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
}

function renderPinTable(filter = '') {
    const tbody = document.getElementById('pin-table-body');
    tbody.innerHTML = '';

    const filtered = state.pins.filter(p =>
        p.name.toLowerCase().includes(filter.toLowerCase()) ||
        (p.af && p.af.toLowerCase().includes(filter.toLowerCase()))
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">暂无引脚配置</td></tr>';
        return;
    }

    const conflicts = detectPinConflicts();
    const conflictPins = new Set(conflicts.map(c => c.pin));

    filtered.forEach((pin, idx) => {
        const tr = document.createElement('tr');
        const actualIdx = state.pins.indexOf(pin);
        if (actualIdx === state.selectedPinIndex) {
            tr.classList.add('selected');
        }
        if (conflictPins.has(pin.name)) {
            tr.style.borderLeft = '3px solid var(--danger)';
            tr.style.background = 'rgba(248, 81, 73, 0.05)';
        }
        const periphType = getPeriphFromAF(pin.af || '');
        const periphBadge = periphType !== 'GPIO' ? 
            `<span style="margin-left:8px;padding:1px 6px;border-radius:8px;font-size:10px;background:var(--accent-light);color:var(--accent);">${periphType}</span>` : '';
        tr.innerHTML = `
            <td><span class="pin-name">${pin.name}</span>${conflictPins.has(pin.name) ? '<span title="引脚冲突" style="margin-left:6px;color:var(--danger);">⚠️</span>' : ''}</td>
            <td><span class="pin-af">${pin.af || 'GPIO_AF0_GPIO'}</span>${periphBadge}</td>
            <td><span class="pin-mode">${(pin.mode || 'GPIO_MODE_INPUT').replace('GPIO_MODE_', '')}</span></td>
            <td><span class="pin-pull">${(pin.pull || 'GPIO_NOPULL').replace('GPIO_', '')}</span></td>
            <td><span class="pin-speed">${(pin.speed || 'GPIO_SPEED_FREQ_LOW').replace('GPIO_SPEED_FREQ_', '')}</span></td>
            <td class="pin-actions">
                <button title="编辑" class="edit-btn" data-idx="${actualIdx}">✏️</button>
                <button title="删除" class="delete-btn" data-idx="${actualIdx}">🗑️</button>
            </td>
        `;
        tr.addEventListener('click', (e) => {
            if (e.target.closest('.delete-btn') || e.target.closest('.edit-btn')) return;
            state.selectedPinIndex = actualIdx;
            renderPinTable(filter);
            renderPinDetail(pin);
        });
        tr.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            state.pins.splice(actualIdx, 1);
            if (state.selectedPinIndex === actualIdx) {
                state.selectedPinIndex = null;
                document.getElementById('pin-detail').innerHTML = '<p class="hint">选择或添加一个引脚以查看详情</p>';
            } else if (state.selectedPinIndex !== null && state.selectedPinIndex > actualIdx) {
                state.selectedPinIndex--;
            }
            renderPinTable(filter);
        });
        tr.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openPinModal(actualIdx);
        });
        tbody.appendChild(tr);
    });

    const headerPanel = document.querySelector('#tab-pins .panel-header');
    const oldBadge = headerPanel.querySelector('.conflict-badge');
    if (oldBadge) oldBadge.remove();
    
    if (conflicts.length > 0) {
        const conflictBadge = document.createElement('span');
        conflictBadge.className = 'conflict-badge';
        conflictBadge.style.cssText = 'background:rgba(248,81,73,0.15);color:var(--danger);padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;';
        conflictBadge.textContent = `⚠️ ${conflicts.length} 个冲突`;
        headerPanel.appendChild(conflictBadge);
    }
}

function renderPinDetail(pin) {
    const detail = document.getElementById('pin-detail');
    const port = pin.name[1];
    const pinNum = pin.name.substring(2);
    detail.innerHTML = `
        <div class="pin-detail-content">
            <div class="detail-item">
                <div class="detail-label">引脚名称</div>
                <div class="detail-value">${pin.name}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">端口</div>
                <div class="detail-value">GPIO${port}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">引脚号</div>
                <div class="detail-value">Pin ${pinNum}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">复用功能</div>
                <div class="detail-value">${pin.af || 'GPIO_AF0_GPIO'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">模式</div>
                <div class="detail-value">${pin.mode || 'GPIO_MODE_INPUT'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">上拉/下拉</div>
                <div class="detail-value">${pin.pull || 'GPIO_NOPULL'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">速度</div>
                <div class="detail-value">${pin.speed || 'GPIO_SPEED_FREQ_LOW'}</div>
            </div>
        </div>
    `;
}

function openPinModal(editIdx = null) {
    const modal = document.getElementById('pin-modal-overlay');
    const nameSelect = document.getElementById('new-pin-name');
    const afSelect = document.getElementById('new-pin-af');
    const modeSelect = document.getElementById('new-pin-mode');
    const pullSelect = document.getElementById('new-pin-pull');
    const speedSelect = document.getElementById('new-pin-speed');

    nameSelect.innerHTML = '';
    const availablePins = Object.keys(state.pinData.pins).filter(p => {
        if (editIdx !== null) return true;
        return !state.pins.find(x => x.name === p);
    });
    availablePins.forEach(pin => {
        const opt = document.createElement('option');
        opt.value = pin;
        opt.textContent = pin;
        nameSelect.appendChild(opt);
    });

    modeSelect.innerHTML = '';
    state.pinData.gpio_modes.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.value;
        opt.textContent = m.label;
        modeSelect.appendChild(opt);
    });

    pullSelect.innerHTML = '';
    state.pinData.gpio_pulls.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.value;
        opt.textContent = p.label;
        pullSelect.appendChild(opt);
    });

    speedSelect.innerHTML = '';
    state.pinData.gpio_speeds.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.value;
        opt.textContent = s.label;
        speedSelect.appendChild(opt);
    });

    if (editIdx !== null) {
        const pin = state.pins[editIdx];
        nameSelect.value = pin.name;
        modeSelect.value = pin.mode || 'GPIO_MODE_INPUT';
        pullSelect.value = pin.pull || 'GPIO_NOPULL';
        speedSelect.value = pin.speed || 'GPIO_SPEED_FREQ_LOW';
        updatePinAFOptions();
        afSelect.value = pin.af || 'GPIO_AF0_GPIO';
        modal.dataset.editIdx = editIdx;
    } else {
        updatePinAFOptions();
        modal.dataset.editIdx = '';
    }

    modal.classList.add('active');
}

function updatePinAFOptions() {
    const nameSelect = document.getElementById('new-pin-name');
    const afSelect = document.getElementById('new-pin-af');
    const pinName = nameSelect.value;
    const afList = state.pinData.pins[pinName] || ['GPIO_AF0_GPIO'];

    afSelect.innerHTML = '';
    afList.forEach(af => {
        const opt = document.createElement('option');
        opt.value = af;
        opt.textContent = af;
        afSelect.appendChild(opt);
    });
}

function closePinModal() {
    document.getElementById('pin-modal-overlay').classList.remove('active');
}

function confirmPinModal() {
    const modal = document.getElementById('pin-modal-overlay');
    const editIdx = modal.dataset.editIdx;
    const name = document.getElementById('new-pin-name').value;
    const af = document.getElementById('new-pin-af').value;
    const mode = document.getElementById('new-pin-mode').value;
    const pull = document.getElementById('new-pin-pull').value;
    const speed = document.getElementById('new-pin-speed').value;

    const pinData = { name, af, mode, pull, speed };

    if (editIdx !== '') {
        const oldName = state.pins[parseInt(editIdx)].name;
        if (oldName !== name && state.pins.find(p => p.name === name)) {
            showToast('该引脚已存在', 'error');
            return;
        }
        state.pins[parseInt(editIdx)] = pinData;
    } else {
        if (state.pins.find(p => p.name === name)) {
            showToast('该引脚已存在', 'error');
            return;
        }
        state.pins.push(pinData);
    }

    closePinModal();
    renderPinTable();
    const conflicts = detectPinConflicts();
    if (conflicts.length > 0) {
        showToast(`检测到 ${conflicts.length} 个引脚冲突!`, 'error');
    } else {
        showToast('引脚已保存', 'success');
    }
}

function detectPinConflicts() {
    const conflicts = [];
    const pinMap = new Map();

    state.pins.forEach((pin, idx) => {
        if (pinMap.has(pin.name)) {
            conflicts.push({
                type: 'duplicate',
                pin: pin.name,
                indices: [pinMap.get(pin.name), idx],
                message: `引脚 ${pin.name} 被多次配置`,
            });
        } else {
            pinMap.set(pin.name, idx);
        }
    });

    return conflicts;
}

function getPeriphFromAF(af) {
    if (af.includes('USART') || af.includes('UART')) return 'USART';
    if (af.includes('I2C')) return 'I2C';
    if (af.includes('SPI') || af.includes('I2S')) return 'SPI';
    if (af.includes('TIM')) return 'TIM';
    if (af.includes('CAN')) return 'CAN';
    if (af.includes('ETH')) return 'ETH';
    if (af.includes('OTG') || af.includes('USB')) return 'USB';
    if (af.includes('SDIO') || af.includes('SDMMC')) return 'SDIO';
    return 'GPIO';
}

function openPeriphModal(type, editIdx = null) {
    const modal = document.getElementById('periph-modal-overlay');
    const body = document.getElementById('periph-modal-body');
    const title = document.getElementById('periph-modal-title');

    const preset = state.pinData.periph_presets[type];
    title.textContent = editIdx !== null ? `编辑 ${type}` : `添加 ${type}`;

    body.innerHTML = '';
    const fields = preset.config_fields;

    let existing = {};
    if (editIdx !== null) {
        existing = state.peripherals[editIdx].config;
        modal.dataset.editIdx = editIdx;
        modal.dataset.periphType = state.peripherals[editIdx].type;
    } else {
        modal.dataset.editIdx = '';
        modal.dataset.periphType = type;
    }

    const nameField = document.createElement('div');
    nameField.className = 'modal-field';
    nameField.innerHTML = `
        <label>名称</label>
        <input type="text" id="periph-name" value="${editIdx !== null ? state.peripherals[editIdx].name : `${type}${state.peripherals.filter(p => p.type === type).length + 1}`}">
    `;
    body.appendChild(nameField);

    fields.forEach(field => {
        const div = document.createElement('div');
        div.className = 'modal-field';
        const val = existing[field.key] !== undefined ? existing[field.key] : field.default;

        if (field.type === 'select') {
            div.innerHTML = `
                <label>${field.label}</label>
                <select data-field="${field.key}">
                    ${field.options.map(o => `<option value="${o.value}" ${val === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
                </select>
            `;
        } else if (field.type === 'number') {
            div.innerHTML = `
                <label>${field.label}</label>
                <input type="number" data-field="${field.key}" value="${val}">
            `;
        }
        body.appendChild(div);
    });

    modal.classList.add('active');
}

function closePeriphModal() {
    document.getElementById('periph-modal-overlay').classList.remove('active');
}

function confirmPeriphModal() {
    const modal = document.getElementById('periph-modal-overlay');
    const editIdx = modal.dataset.editIdx;
    const type = modal.dataset.periphType;
    const name = document.getElementById('periph-name').value.trim();

    if (!name) {
        showToast('请输入名称', 'error');
        return;
    }

    const config = {};
    modal.querySelectorAll('[data-field]').forEach(el => {
        const key = el.dataset.field;
        const val = el.value;
        config[key] = el.type === 'number' ? parseInt(val) : val;
    });

    const periphData = { name, type, config };

    if (editIdx !== '') {
        state.peripherals[parseInt(editIdx)] = periphData;
    } else {
        state.peripherals.push(periphData);
    }

    closePeriphModal();
    renderPeriphList();
    showToast('外设已保存', 'success');
}

function renderPeriphList() {
    const list = document.getElementById('periph-list');
    if (state.peripherals.length === 0) {
        list.innerHTML = '<p class="hint">点击上方按钮添加外设</p>';
        return;
    }

    list.innerHTML = '';
    state.peripherals.forEach((periph, idx) => {
        const card = document.createElement('div');
        card.className = 'periph-card';
        const preset = state.pinData.periph_presets[periph.type];
        const configHtml = preset.config_fields
            .filter(f => periph.config[f.key] !== undefined)
            .map(f => `
                <div class="periph-config-item">
                    <div class="periph-config-label">${f.label}</div>
                    <div class="periph-config-value">${periph.config[f.key]}</div>
                </div>
            `).join('');

        card.innerHTML = `
            <div class="periph-card-header">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span class="periph-type-badge ${periph.type}">${periph.type}</span>
                    <span class="periph-card-title">${periph.name}</span>
                </div>
                <div class="periph-card-actions">
                    <button class="edit" data-idx="${idx}" title="编辑">✏️</button>
                    <button class="delete" data-idx="${idx}" title="删除">🗑️</button>
                </div>
            </div>
            <div class="periph-config-grid">
                ${configHtml}
            </div>
        `;

        card.querySelector('.delete').addEventListener('click', () => {
            state.peripherals.splice(idx, 1);
            renderPeriphList();
            showToast('外设已删除', 'success');
        });
        card.querySelector('.edit').addEventListener('click', () => {
            openPeriphModal(periph.type, idx);
        });

        list.appendChild(card);
    });
}

function readClockConfig() {
    state.clock.hse_freq = parseInt(document.getElementById('clock-hse').value) || 8000000;
    state.clock.hsi_freq = parseInt(document.getElementById('clock-hsi').value) || 16000000;
    state.clock.lse_freq = parseInt(document.getElementById('clock-lse').value) || 32768;
    state.clock.hse_bypass = document.getElementById('clock-hse-bypass').checked;
    state.clock.pll_m = parseInt(document.getElementById('pll-m').value) || 8;
    state.clock.pll_n = parseInt(document.getElementById('pll-n').value) || 360;
    state.clock.pll_p = parseInt(document.getElementById('pll-p').value) || 2;
    state.clock.pll_q = parseInt(document.getElementById('pll-q').value) || 8;
    state.clock.pll_r = parseInt(document.getElementById('pll-r').value) || 2;
    state.clock.sysclk_src = document.getElementById('sysclk-src').value;
    state.clock.ahb_prescaler = parseInt(document.getElementById('ahb-prescaler').value) || 1;
    state.clock.apb1_prescaler = parseInt(document.getElementById('apb1-prescaler').value) || 1;
    state.clock.apb2_prescaler = parseInt(document.getElementById('apb2-prescaler').value) || 1;
}

function validatePLLConfig() {
    const c = state.clock;
    const warnings = [];
    
    const pllIn = c.hse_freq / c.pll_m;
    if (pllIn < 1000000 || pllIn > 2000000) {
        warnings.push(`PLL 输入频率 ${formatFreq(pllIn)} 超出推荐范围 (1-2 MHz)`);
    }
    
    const pllVco = pllIn * c.pll_n;
    if (pllVco < 100000000 || pllVco > 432000000) {
        warnings.push(`VCO 频率 ${formatFreq(pllVco)} 超出范围 (100-432 MHz)`);
    }
    
    const pllOut = pllVco / c.pll_p;
    if (pllOut > 180000000) {
        warnings.push(`PLL 输出频率 ${formatFreq(pllOut)} 超出最大限制 (180 MHz)`);
    }
    
    return warnings;
}

function updateClockFreq() {
    const c = state.clock;
    const pllVco = (c.hse_freq / c.pll_m) * c.pll_n;
    const pllOut = pllVco / c.pll_p;

    let sysclk;
    if (c.sysclk_src === 'PLL') sysclk = pllOut;
    else if (c.sysclk_src === 'HSE') sysclk = c.hse_freq;
    else sysclk = c.hsi_freq;

    const hclk = sysclk / c.ahb_prescaler;
    const apb1 = hclk / c.apb1_prescaler;
    const apb2 = hclk / c.apb2_prescaler;

    document.getElementById('freq-sysclk').textContent = formatFreq(sysclk);
    document.getElementById('freq-hclk').textContent = formatFreq(hclk);
    document.getElementById('freq-apb1').textContent = formatFreq(apb1);
    document.getElementById('freq-apb2').textContent = formatFreq(apb2);

    const warnings = validatePLLConfig();
    const outputPanel = document.querySelector('.clock-output');
    const oldWarning = outputPanel.querySelector('.pll-warning');
    if (oldWarning) oldWarning.remove();
    
    if (warnings.length > 0) {
        const warningDiv = document.createElement('div');
        warningDiv.className = 'pll-warning';
        warningDiv.style.cssText = 'margin-top:16px;padding:12px;background:rgba(210,153,34,0.15);border:1px solid var(--warning);border-radius:var(--radius-sm);color:var(--warning);font-size:12px;';
        warningDiv.innerHTML = `<strong>⚠️ PLL 警告:</strong><br>${warnings.join('<br>')}`;
        outputPanel.appendChild(warningDiv);
    }
}

function formatFreq(hz) {
    if (hz >= 1000000000) return (hz / 1000000000).toFixed(2) + ' GHz';
    if (hz >= 1000000) return (hz / 1000000).toFixed(1) + ' MHz';
    if (hz >= 1000) return (hz / 1000).toFixed(1) + ' kHz';
    return hz + ' Hz';
}

async function exportProject() {
    const pinConflicts = detectPinConflicts();
    const pllWarnings = validatePLLConfig();

    if (pinConflicts.length > 0) {
        if (!confirm(`检测到 ${pinConflicts.length} 个引脚冲突！\n${pinConflicts.map(c => c.message).join('\n')}\n\n是否继续导出？`)) {
            return;
        }
    }

    if (pllWarnings.length > 0) {
        if (!confirm(`检测到 ${pllWarnings.length} 个 PLL 警告！\n${pllWarnings.join('\n')}\n\n是否继续导出？`)) {
            return;
        }
    }

    const config = {
        family: document.getElementById('family-select').value,
        part_number: document.getElementById('part-number').value,
        ide: document.getElementById('ide-select').value,
        clock: state.clock,
        pins: state.pins,
        peripherals: state.peripherals,
        freertos: state.freertos,
        lowpower: state.lowpower,
    };

    showToast('正在生成工程文件...', 'success');

    try {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || '导出失败');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${config.part_number}_project.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showToast('工程导出成功', 'success');
    } catch (err) {
        showToast('导出失败: ' + err.message, 'error');
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

function readFreeRTOSConfig() {
    state.freertos.kernel = document.getElementById('freertos-kernel').value;
    state.freertos.heap_size = parseInt(document.getElementById('freertos-heap').value) || 3072;
    state.freertos.min_stack_size = parseInt(document.getElementById('freertos-min-stack').value) || 128;
    state.freertos.max_priority = parseInt(document.getElementById('freertos-max-prio').value) || 32;
    state.freertos.tick_rate = parseInt(document.getElementById('freertos-tick-rate').value) || 1000;
    state.freertos.use_preempt = parseInt(document.getElementById('freertos-preempt').value) || 1;
    state.freertos.use_timeslice = parseInt(document.getElementById('freertos-timeslice').value) || 1;
    state.freertos.use_mutex = parseInt(document.getElementById('freertos-mutex').value) || 1;
    state.freertos.use_counting = parseInt(document.getElementById('freertos-counting').value) || 1;
    state.freertos.use_timers = parseInt(document.getElementById('freertos-timers').value) || 0;
    state.freertos.use_tickless = parseInt(document.getElementById('freertos-tickless').value) || 0;
}

function readLowPowerConfig() {
    state.lowpower.mode = document.getElementById('lp-mode').value;
    state.lowpower.pvd_enable = parseInt(document.getElementById('lp-pvd').value) || 0;
    state.lowpower.pvd_level = document.getElementById('lp-pvd-level').value;
    state.lowpower.wakeup_pin = document.getElementById('lp-wakeup-pin').value;
    state.lowpower.rtc_wakeup = parseInt(document.getElementById('lp-rtc-wakeup').value) || 0;
    state.lowpower.rtc_wakeup_time = parseInt(document.getElementById('lp-rtc-time').value) || 0;
}

function openTaskModal(editIdx = null) {
    const modal = document.getElementById('task-modal-overlay');
    const title = document.getElementById('task-modal-title');

    if (editIdx !== null) {
        const task = state.freertos.tasks[editIdx];
        title.textContent = '编辑任务';
        document.getElementById('task-name').value = task.name;
        document.getElementById('task-stack').value = task.stack;
        document.getElementById('task-priority').value = task.priority;
        document.getElementById('task-type').value = task.type;
        document.getElementById('task-period').value = task.period || 1000;
        modal.dataset.editIdx = editIdx;
    } else {
        title.textContent = '添加任务';
        document.getElementById('task-name').value = 'Task' + (state.freertos.tasks.length + 1);
        document.getElementById('task-stack').value = 128;
        document.getElementById('task-priority').value = 1;
        document.getElementById('task-type').value = 'default';
        document.getElementById('task-period').value = 1000;
        modal.dataset.editIdx = '';
    }

    modal.classList.add('active');
}

function closeTaskModal() {
    document.getElementById('task-modal-overlay').classList.remove('active');
}

function confirmTaskModal() {
    const modal = document.getElementById('task-modal-overlay');
    const editIdx = modal.dataset.editIdx;

    const name = document.getElementById('task-name').value.trim();
    if (!name) {
        showToast('请输入任务名称', 'error');
        return;
    }

    const task = {
        name: name,
        stack: parseInt(document.getElementById('task-stack').value) || 128,
        priority: parseInt(document.getElementById('task-priority').value) || 1,
        type: document.getElementById('task-type').value,
        period: parseInt(document.getElementById('task-period').value) || 1000,
    };

    if (editIdx !== '') {
        state.freertos.tasks[parseInt(editIdx)] = task;
    } else {
        state.freertos.tasks.push(task);
    }

    closeTaskModal();
    renderTaskList();
    showToast('任务已保存', 'success');
}

function renderTaskList() {
    const list = document.getElementById('task-list');
    if (!state.freertos.enable || state.freertos.tasks.length === 0) {
        list.innerHTML = state.freertos.enable ? '<p class="hint">点击上方按钮添加任务</p>' : '<p class="hint">请先启用 FreeRTOS</p>';
        return;
    }

    list.innerHTML = '';
    state.freertos.tasks.forEach((task, idx) => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.innerHTML = `
            <div class="task-info">
                <span class="task-name">${task.name}</span>
                <div class="task-detail">
                    <span>栈: ${task.stack} words</span>
                    <span>优先级: ${task.priority}</span>
                    <span>类型: ${task.type}</span>
                    ${task.type === 'periodic' ? `<span>周期: ${task.period}ms</span>` : ''}
                </div>
            </div>
            <div class="task-actions">
                <button class="edit" data-idx="${idx}" title="编辑">✏️</button>
                <button class="delete" data-idx="${idx}" title="删除">🗑️</button>
            </div>
        `;
        card.querySelector('.delete').addEventListener('click', () => {
            state.freertos.tasks.splice(idx, 1);
            renderTaskList();
            showToast('任务已删除', 'success');
        });
        card.querySelector('.edit').addEventListener('click', () => {
            openTaskModal(idx);
        });
        list.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', init);
