const socket = io();

let state = {
    isCapturing: false,
    isCracking: false,
    isInjecting: false,
    totalIVs: 0,
    weakIVs: 0,
    crackProgress: 0,
    keyFound: false,
    crackedKey: null,
    activeAlgorithm: 'ptw',
    ivFilter: 'all',
    ivPage: 1,
    ivPerPage: 20,
    ivTotalPages: 1,
    ivTotal: 0,
    injectPackets: 0
};

const elements = {
    totalIVs: document.getElementById('total-ivs'),
    weakIVs: document.getElementById('weak-ivs'),
    crackProgress: document.getElementById('crack-progress'),
    progressBar: document.getElementById('progress-bar'),
    ivRatio: document.getElementById('iv-ratio'),
    startCapture: document.getElementById('start-capture'),
    stopCapture: document.getElementById('stop-capture'),
    startCrack: document.getElementById('start-crack'),
    stopCrack: document.getElementById('stop-crack'),
    reset: document.getElementById('reset'),
    captureStatus: document.getElementById('capture-status'),
    captureStatusText: document.getElementById('capture-status-text'),
    crackedKey: document.getElementById('cracked-key'),
    crackedKeyHex: document.getElementById('cracked-key-hex'),
    keyStatus: document.getElementById('key-status'),
    interface: document.getElementById('interface'),
    bssid: document.getElementById('bssid'),
    keyLength: document.getElementById('key-length'),
    algorithm: document.getElementById('algorithm'),
    algorithmInfo: document.getElementById('algorithm-info'),
    ivTableBody: document.getElementById('iv-table-body'),
    ivCountBadge: document.getElementById('iv-count-badge'),
    pageInfoText: document.getElementById('page-info-text'),
    pageFirst: document.getElementById('page-first'),
    pagePrev: document.getElementById('page-prev'),
    pageNext: document.getElementById('page-next'),
    pageLast: document.getElementById('page-last'),
    pageNumbers: document.getElementById('page-numbers'),
    perPage: document.getElementById('per-page'),
    injectRate: document.getElementById('inject-rate'),
    startInject: document.getElementById('start-inject'),
    stopInject: document.getElementById('stop-inject'),
    injectStatus: document.getElementById('inject-status'),
    injectStatusText: document.getElementById('inject-status-text'),
    injectCount: document.getElementById('inject-count'),
    exportButtons: document.getElementById('export-buttons'),
    copyKey: document.getElementById('copy-key'),
    downloadKey: document.getElementById('download-key')
};

function updateStats() {
    elements.totalIVs.textContent = state.totalIVs.toLocaleString();
    elements.weakIVs.textContent = state.weakIVs.toLocaleString();
    elements.crackProgress.textContent = Math.round(state.crackProgress) + '%';
    elements.progressBar.style.width = state.crackProgress + '%';
    elements.injectCount.textContent = state.injectPackets.toLocaleString();

    const ratio = state.totalIVs > 0 ? ((state.weakIVs / state.totalIVs) * 100).toFixed(2) : 0;
    elements.ivRatio.textContent = ratio + '%';

    if (state.isCapturing) {
        elements.captureStatus.classList.add('active');
        elements.captureStatusText.textContent = '正在捕获...';
        elements.startCapture.disabled = true;
        elements.stopCapture.disabled = false;
    } else {
        elements.captureStatus.classList.remove('active');
        elements.captureStatusText.textContent = '未捕获';
        elements.startCapture.disabled = false;
        elements.stopCapture.disabled = true;
    }

    if (state.isInjecting) {
        elements.injectStatus.classList.add('active');
        elements.injectStatusText.textContent = '正在注入...';
        elements.startInject.disabled = true;
        elements.stopInject.disabled = false;
    } else {
        elements.injectStatus.classList.remove('active');
        elements.injectStatusText.textContent = '未注入';
        elements.startInject.disabled = false;
        elements.stopInject.disabled = true;
    }

    if (state.isCracking) {
        elements.startCrack.disabled = true;
        elements.stopCrack.disabled = false;
    } else {
        elements.startCrack.disabled = false;
        elements.stopCrack.disabled = true;
    }

    if (state.keyFound && state.crackedKey) {
        elements.crackedKey.innerHTML = formatKey(state.crackedKey);
        elements.crackedKeyHex.textContent = 'HEX: ' + state.crackedKey;
        elements.keyStatus.innerHTML = '<span class="status-badge success">破解成功!</span>';
        elements.exportButtons.style.display = 'flex';
    } else if (state.isCracking) {
        const algoName = state.activeAlgorithm === 'ptw' ? 'PTW' : 'FMS';
        elements.keyStatus.innerHTML = '<span class="status-badge cracking">' + algoName + ' 破解中...</span>';
        elements.exportButtons.style.display = 'none';
    } else {
        elements.keyStatus.innerHTML = '<span class="status-badge pending">准备中</span>';
        elements.exportButtons.style.display = 'none';
        if (!state.crackedKey) {
            elements.crackedKey.innerHTML = '<span class="placeholder">等待破解...</span>';
            elements.crackedKeyHex.textContent = '';
        }
    }
}

function formatKey(key) {
    const bytes = key.match(/.{2}/g) || [];
    return bytes.map(b => b.toUpperCase()).join(':');
}

async function startCapture() {
    const iface = elements.interface.value;
    const bssid = elements.bssid.value.trim() || null;

    try {
        const response = await fetch('/api/start_capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interface: iface, bssid })
        });
        const data = await response.json();
        if (data.status === 'started') {
            state.isCapturing = true;
            updateStats();
            startIVRefresh();
        }
    } catch (error) {
        console.error('Error starting capture:', error);
    }
}

async function stopCapture() {
    try {
        const response = await fetch('/api/stop_capture', { method: 'POST' });
        const data = await response.json();
        if (data.status === 'stopped') {
            state.isCapturing = false;
            updateStats();
        }
    } catch (error) {
        console.error('Error stopping capture:', error);
    }
}

async function startCrack() {
    const keyLength = parseInt(elements.keyLength.value);
    const algorithm = elements.algorithm.value;

    try {
        const response = await fetch('/api/start_crack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key_length: keyLength, algorithm })
        });
        const data = await response.json();
        if (data.status === 'started') {
            state.isCracking = true;
            state.activeAlgorithm = algorithm;
            updateStats();
        }
    } catch (error) {
        console.error('Error starting crack:', error);
    }
}

async function stopCrack() {
    try {
        const response = await fetch('/api/stop_crack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ algorithm: 'all' })
        });
        const data = await response.json();
        if (data.status === 'stopped') {
            state.isCracking = false;
            updateStats();
        }
    } catch (error) {
        console.error('Error stopping crack:', error);
    }
}

async function startInject() {
    const iface = elements.interface.value;
    const bssid = elements.bssid.value.trim() || null;
    const rate = parseInt(elements.injectRate.value);

    try {
        const response = await fetch('/api/start_inject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interface: iface, bssid, rate })
        });
        const data = await response.json();
        if (data.status === 'started') {
            state.isInjecting = true;
            updateStats();
            startIVRefresh();
        }
    } catch (error) {
        console.error('Error starting inject:', error);
    }
}

async function stopInject() {
    try {
        const response = await fetch('/api/stop_inject', { method: 'POST' });
        const data = await response.json();
        if (data.status === 'stopped') {
            state.isInjecting = false;
            updateStats();
        }
    } catch (error) {
        console.error('Error stopping inject:', error);
    }
}

async function copyKey() {
    if (!state.crackedKey) return;

    try {
        const response = await fetch('/api/export_key?format=text&algorithm=' + state.activeAlgorithm);
        const data = await response.json();

        if (navigator.clipboard) {
            await navigator.clipboard.writeText(data.key_colon);
            showToast('密钥已复制到剪贴板: ' + data.key_colon);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = data.key_colon;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('密钥已复制到剪贴板: ' + data.key_colon);
        }
    } catch (error) {
        console.error('Error copying key:', error);
        showToast('复制失败');
    }
}

function downloadKey() {
    if (!state.crackedKey) return;
    window.open('/api/export_key?format=download&algorithm=' + state.activeAlgorithm, '_blank');
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

async function resetAll() {
    try {
        const response = await fetch('/api/reset', { method: 'POST' });
        const data = await response.json();
        if (data.status === 'reset') {
            state.isCapturing = false;
            state.isCracking = false;
            state.isInjecting = false;
            state.totalIVs = 0;
            state.weakIVs = 0;
            state.crackProgress = 0;
            state.keyFound = false;
            state.crackedKey = null;
            state.ivPage = 1;
            state.ivTotal = 0;
            state.ivTotalPages = 1;
            state.injectPackets = 0;
            updateStats();
            renderIVTable([]);
        }
    } catch (error) {
        console.error('Error resetting:', error);
    }
}

async function fetchIVs() {
    try {
        const url = `/api/ivs?page=${state.ivPage}&per_page=${state.ivPerPage}&filter=${state.ivFilter}`;
        const response = await fetch(url);
        const data = await response.json();

        state.ivTotal = data.total;
        state.ivTotalPages = data.total_pages;
        state.ivPage = data.page;

        elements.ivCountBadge.textContent = data.total.toLocaleString();
        elements.pageInfoText.textContent = `第 ${data.page} 页 / 共 ${data.total_pages} 页`;

        elements.pageFirst.disabled = data.page <= 1;
        elements.pagePrev.disabled = data.page <= 1;
        elements.pageNext.disabled = data.page >= data.total_pages;
        elements.pageLast.disabled = data.page >= data.total_pages;

        renderPageNumbers(data.page, data.total_pages);
        renderIVTable(data.items);
    } catch (error) {
        console.error('Error fetching IVs:', error);
    }
}

function renderIVTable(items) {
    if (!items || items.length === 0) {
        elements.ivTableBody.innerHTML = '<tr class="empty-row"><td colspan="7">暂无数据，请开始捕获</td></tr>';
        return;
    }

    const startIndex = (state.ivPage - 1) * state.ivPerPage;
    elements.ivTableBody.innerHTML = items.map((item, idx) => {
        const rowNum = startIndex + idx + 1;
        const typeClass = item.is_weak ? 'type-weak' : 'type-normal';
        const typeLabel = item.is_weak ? '弱 IV' : '普通';
        return `<tr class="${typeClass}">
            <td>${rowNum}</td>
            <td class="mono">${item.iv}</td>
            <td class="mono">${item.iv_dec}</td>
            <td>${item.keyid}</td>
            <td><span class="type-badge ${item.is_weak ? 'weak' : 'normal'}">${typeLabel}</span></td>
            <td class="mono encrypted">${item.encrypted_preview}</td>
            <td>${item.timestamp}</td>
        </tr>`;
    }).join('');
}

function renderPageNumbers(current, total) {
    const maxVisible = 5;
    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    let end = Math.min(total, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);

    let html = '';
    for (let i = start; i <= end; i++) {
        html += `<button class="page-num ${i === current ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    elements.pageNumbers.innerHTML = html;

    elements.pageNumbers.querySelectorAll('.page-num').forEach(btn => {
        btn.addEventListener('click', () => {
            state.ivPage = parseInt(btn.dataset.page);
            fetchIVs();
        });
    });
}

let ivRefreshTimer = null;
function startIVRefresh() {
    if (ivRefreshTimer) clearInterval(ivRefreshTimer);
    ivRefreshTimer = setInterval(() => {
        if (state.isCapturing) {
            fetchIVs();
        }
    }, 2000);
}

elements.algorithm.addEventListener('change', function() {
    const algo = this.value;
    if (algo === 'ptw') {
        elements.algorithmInfo.innerHTML = '<p>PTW 攻击通常需要约 35,000-40,000 个 IV，比 FMS 攻击效率更高，支持并行 IV 处理。</p>';
    } else {
        elements.algorithmInfo.innerHTML = '<p>FMS 攻击仅利用弱 IV，需要约 50,000-200,000 个总 IV 才能收集足够的弱 IV。</p>';
    }
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        state.ivFilter = this.dataset.filter;
        state.ivPage = 1;
        fetchIVs();
    });
});

elements.pageFirst.addEventListener('click', () => { state.ivPage = 1; fetchIVs(); });
elements.pagePrev.addEventListener('click', () => { state.ivPage = Math.max(1, state.ivPage - 1); fetchIVs(); });
elements.pageNext.addEventListener('click', () => { state.ivPage = Math.min(state.ivTotalPages, state.ivPage + 1); fetchIVs(); });
elements.pageLast.addEventListener('click', () => { state.ivPage = state.ivTotalPages; fetchIVs(); });

elements.perPage.addEventListener('change', function() {
    state.ivPerPage = parseInt(this.value);
    state.ivPage = 1;
    fetchIVs();
});

socket.on('connect', function() {
    console.log('Connected to server');
    socket.emit('request_status');
});

socket.on('status_update', function(data) {
    state.totalIVs = data.capture.total_ivs || 0;
    state.weakIVs = data.capture.weak_ivs || 0;

    if (data.inject) {
        state.isInjecting = data.inject.is_injecting || false;
        state.injectPackets = data.inject.packets_sent || 0;
    }

    const fms = data.fms || {};
    const ptw = data.ptw || {};

    const activeCrack = ptw.is_cracking ? ptw : (fms.is_cracking ? fms : (ptw.progress > fms.progress ? ptw : fms));
    state.crackProgress = activeCrack.progress || 0;
    state.isCracking = fms.is_cracking || ptw.is_cracking || false;

    if (ptw.key_found && ptw.cracked_key) {
        state.keyFound = true;
        state.crackedKey = ptw.cracked_key;
        state.activeAlgorithm = 'ptw';
    } else if (fms.key_found && fms.cracked_key) {
        state.keyFound = true;
        state.crackedKey = fms.cracked_key;
        state.activeAlgorithm = 'fms';
    }

    updateStats();
});

socket.on('inject_update', function(data) {
    state.injectPackets = data.packets_sent || 0;
    updateStats();
});

socket.on('iv_update', function(data) {
    state.totalIVs = data.total_ivs || 0;
    state.weakIVs = data.weak_ivs || 0;
    updateStats();
});

socket.on('crack_progress', function(data) {
    const algo = data.algorithm || 'ptw';
    state.activeAlgorithm = algo;
    state.crackProgress = data.progress || 0;
    if (data.key) {
        state.keyFound = true;
        state.crackedKey = data.key;
        state.isCracking = false;
    }
    updateStats();
});

socket.on('disconnect', function() {
    console.log('Disconnected from server');
});

elements.startCapture.addEventListener('click', startCapture);
elements.stopCapture.addEventListener('click', stopCapture);
elements.startCrack.addEventListener('click', startCrack);
elements.stopCrack.addEventListener('click', stopCrack);
elements.reset.addEventListener('click', resetAll);
elements.startInject.addEventListener('click', startInject);
elements.stopInject.addEventListener('click', stopInject);
elements.copyKey.addEventListener('click', copyKey);
elements.downloadKey.addEventListener('click', downloadKey);

async function loadInterfaces() {
    try {
        const response = await fetch('/api/interfaces');
        const data = await response.json();
        elements.interface.innerHTML = '';
        data.interfaces.forEach(iface => {
            const option = document.createElement('option');
            option.value = iface;
            option.textContent = iface;
            elements.interface.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading interfaces:', error);
    }
}

loadInterfaces();
updateStats();
fetchIVs();
