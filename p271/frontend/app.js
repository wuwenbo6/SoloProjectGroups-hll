const API_BASE = '';

let refreshInterval = null;
let measurementCache = [];

function startPolling() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(fetchStatus, 500);
    setInterval(fetchMeasurements, 1000);
}

async function fetchStatus() {
    try {
        const resp = await fetch(`${API_BASE}/api/status`);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        renderStatus(data);
    } catch (e) {
        console.error('Failed to fetch status:', e);
    }
}

async function fetchMeasurements() {
    try {
        const resp = await fetch(`${API_BASE}/api/measurements?count=200`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.length > 0) {
            measurementCache = data;
            drawChart(data);
            document.getElementById('chart-empty').style.display = 'none';
        }
    } catch (e) {
        console.error('Failed to fetch measurements:', e);
    }
}

function renderStatus(data) {
    renderState(data.currentState);
    renderLocalClock(data.localClock);
    renderGrandmaster(data.hasGrandmaster, data.grandmaster);
    renderForeignMasters(data.foreignMasters);
    renderHistory(data.stateHistory);
    renderBMCA(data.bmcaDescription);
    renderDelayMeasurement(data.measurement, data.currentState);
}

function renderState(state) {
    const indicator = document.getElementById('state-indicator');
    const text = document.getElementById('state-text');
    indicator.setAttribute('data-state', state);
    text.textContent = state;

    document.querySelectorAll('.state-node').forEach(node => {
        node.classList.toggle('active', node.dataset.state === state);
    });
}

function renderBMCA(desc) {
    document.getElementById('bmca-desc').textContent = desc || '—';
}

function renderLocalClock(lc) {
    if (!lc) return;
    document.getElementById('local-identity').textContent = lc.identity;
    document.getElementById('local-p1').textContent = lc.priority1;
    document.getElementById('local-p2').textContent = lc.priority2;
    document.getElementById('local-cc').textContent = lc.clockClass;
    document.getElementById('local-ca').textContent = `${lc.clockAccuracy} (${lc.clockAccuracyDesc})`;
    document.getElementById('local-domain').textContent = lc.domain;
}

function renderGrandmaster(hasGM, gm) {
    const noGM = document.getElementById('no-gm');
    const details = document.getElementById('gm-details');

    if (hasGM && gm) {
        noGM.style.display = 'none';
        details.style.display = 'block';
        document.getElementById('gm-identity').textContent = gm.identity;
        document.getElementById('gm-p1').textContent = gm.priority1;
        document.getElementById('gm-p2').textContent = gm.priority2;
        document.getElementById('gm-cc').textContent = gm.clockClass;
        document.getElementById('gm-ca').textContent = `${gm.clockAccuracy} (${gm.clockAccuracyDesc})`;
        document.getElementById('gm-steps').textContent = gm.stepsRemoved;
        document.getElementById('gm-ts').textContent = gm.timeSource;
        document.getElementById('gm-source').textContent = gm.sourcePort;
    } else {
        noGM.style.display = 'block';
        details.style.display = 'none';
    }
}

function renderDelayMeasurement(m, state) {
    const noDelay = document.getElementById('no-delay');
    const details = document.getElementById('delay-details');

    if (m && (state === 'SLAVE' || state === 'UNCALIBRATED')) {
        noDelay.style.display = 'none';
        details.style.display = 'block';
        document.getElementById('dm-seq').textContent = m.seq;
        document.getElementById('dm-offset').textContent = `${m.offsetUs.toFixed(3)} μs (${m.offsetNs} ns)`;
        document.getElementById('dm-delay').textContent = `${m.delayUs.toFixed(3)} μs (${m.delayNs} ns)`;
        document.getElementById('dm-t1').textContent = formatNs(m.t1);
        document.getElementById('dm-t2').textContent = formatNs(m.t2);
        document.getElementById('dm-t3').textContent = formatNs(m.t3);
        document.getElementById('dm-t4').textContent = formatNs(m.t4);
        document.getElementById('dm-count').textContent = measurementCache.length;
    } else {
        noDelay.style.display = 'block';
        details.style.display = 'none';
    }
}

function formatNs(ns) {
    if (!ns && ns !== 0) return '—';
    const us = ns / 1000;
    return `${us.toFixed(1)} μs`;
}

function renderForeignMasters(masters) {
    const container = document.getElementById('foreign-masters');
    if (!masters || masters.length === 0) {
        container.innerHTML = '<div class="empty-msg">暂无外部主时钟</div>';
        return;
    }
    container.innerHTML = masters.map(m =>
        `<div class="fm-item">${escapeHTML(m)}</div>`
    ).join('');
}

function renderHistory(history) {
    const container = document.getElementById('state-history');
    if (!history || history.length === 0) {
        container.innerHTML = '<div class="empty-msg">暂无状态变更记录</div>';
        return;
    }

    const reversed = [...history].reverse();
    container.innerHTML = reversed.map(h => {
        const desc = h.transition.replace(/(LISTENING|UNCALIBRATED|SLAVE|MASTER)/g,
            '<span class="state-highlight">$1</span>');
        return `<div class="history-item">
            <span class="history-time">${escapeHTML(h.timestamp)}</span>
            <span class="history-desc">${desc}</span>
        </div>`;
    }).join('');
}

function drawChart(data) {
    const canvas = document.getElementById('sync-chart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const pad = { top: 20, right: 20, bottom: 30, left: 60 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    if (data.length < 2) return;

    const offsets = data.map(d => d.offsetUs);
    const delays = data.map(d => d.delayUs);
    const allVals = [...offsets, ...delays];
    let minV = Math.min(...allVals);
    let maxV = Math.max(...allVals);
    const range = maxV - minV || 1;
    minV -= range * 0.1;
    maxV += range * 0.1;

    ctx.strokeStyle = '#2e3348';
    ctx.lineWidth = 0.5;
    const gridLines = 5;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#8b8fa3';
    ctx.textAlign = 'right';
    for (let i = 0; i <= gridLines; i++) {
        const y = pad.top + plotH - (i / gridLines) * plotH;
        const val = minV + (i / gridLines) * (maxV - minV);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
        ctx.fillText(val.toFixed(2), pad.left - 6, y + 3);
    }

    ctx.textAlign = 'center';
    const xLabelStep = Math.max(1, Math.floor(data.length / 10));
    for (let i = 0; i < data.length; i += xLabelStep) {
        const x = pad.left + (i / (data.length - 1)) * plotW;
        ctx.fillText('#' + data[i].seq, x, H - 5);
    }

    ctx.fillStyle = '#8b8fa3';
    ctx.save();
    ctx.translate(12, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('μs', 0, 0);
    ctx.restore();

    const zeroY = pad.top + plotH - ((0 - minV) / (maxV - minV)) * plotH;
    if (zeroY > pad.top && zeroY < pad.top + plotH) {
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.left, zeroY);
        ctx.lineTo(pad.left + plotW, zeroY);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function drawLine(values, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < values.length; i++) {
            const x = pad.left + (i / (values.length - 1)) * plotW;
            const y = pad.top + plotH - ((values[i] - minV) / (maxV - minV)) * plotH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    drawLine(offsets, '#6c8cff');
    drawLine(delays, '#4ade80');
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function injectAnnounce() {
    const gmId = document.getElementById('inject-gm-id').value.trim();
    const p1 = document.getElementById('inject-p1').value;
    const p2 = document.getElementById('inject-p2').value;
    const cc = document.getElementById('inject-cc').value;
    const caStr = document.getElementById('inject-ca').value.trim();
    const steps = document.getElementById('inject-steps').value;

    const ca = caStr.startsWith('0x') || caStr.startsWith('0X')
        ? parseInt(caStr, 16)
        : parseInt(caStr, 10);

    const params = new URLSearchParams({
        grandmasterIdentity: gmId,
        priority1: p1,
        priority2: p2,
        clockClass: cc,
        clockAccuracy: ca,
        stepsRemoved: steps
    });

    try {
        const resp = await fetch(`${API_BASE}/api/announce?${params}`, { method: 'POST' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        await fetchStatus();
    } catch (e) {
        console.error('Failed to inject announce:', e);
    }
}

function injectPreset(preset) {
    const presets = {
        gm1: {
            gmId: '0C29A7FFFEAAAA01',
            p1: 64, p2: 64, cc: 6, ca: '0x21', steps: 0
        },
        gm2: {
            gmId: '0C29A7FFFEBBBB02',
            p1: 128, p2: 128, cc: 187, ca: '0x25', steps: 1
        },
        gm3: {
            gmId: '0C29A7FFFECCCC03',
            p1: 200, p2: 200, cc: 248, ca: '0x31', steps: 3
        }
    };

    const p = presets[preset];
    if (!p) return;

    document.getElementById('inject-gm-id').value = p.gmId;
    document.getElementById('inject-p1').value = p.p1;
    document.getElementById('inject-p2').value = p.p2;
    document.getElementById('inject-cc').value = p.cc;
    document.getElementById('inject-ca').value = p.ca;
    document.getElementById('inject-steps').value = p.steps;

    injectAnnounce();
}

async function setLocalParam(param) {
    let value;
    let endpoint;

    switch (param) {
        case 'priority1':
            value = document.getElementById('cfg-p1').value;
            endpoint = '/api/priority1';
            break;
        case 'priority2':
            value = document.getElementById('cfg-p2').value;
            endpoint = '/api/priority2';
            break;
        case 'clock-class':
            value = document.getElementById('cfg-cc').value;
            endpoint = '/api/clock-class';
            break;
        case 'clock-accuracy':
            const caVal = document.getElementById('cfg-ca').value.trim();
            value = caVal.startsWith('0x') || caVal.startsWith('0X')
                ? parseInt(caVal, 16)
                : parseInt(caVal, 10);
            endpoint = '/api/clock-accuracy';
            break;
        default:
            return;
    }

    const params = new URLSearchParams({ value: value });

    try {
        const resp = await fetch(`${API_BASE}${endpoint}?${params}`, { method: 'POST' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        await fetchStatus();
    } catch (e) {
        console.error('Failed to set param:', e);
    }
}

async function setSimParam(param) {
    let value, endpoint;
    if (param === 'offset') {
        value = document.getElementById('sim-offset').value;
        endpoint = '/api/sim-offset';
    } else if (param === 'jitter') {
        value = document.getElementById('sim-jitter').value;
        endpoint = '/api/sim-jitter';
    } else return;

    const params = new URLSearchParams({ value: value });
    try {
        await fetch(`${API_BASE}${endpoint}?${params}`, { method: 'POST' });
    } catch (e) {
        console.error('Failed to set sim param:', e);
    }
}

function exportCSV() {
    window.open(`${API_BASE}/api/export-csv`, '_blank');
}

document.addEventListener('DOMContentLoaded', () => {
    fetchStatus();
    startPolling();
});
