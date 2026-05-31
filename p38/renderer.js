const { ipcRenderer } = require('electron');
const { jsPDF } = window.jspdf || require('jspdf');

const BK8540_VENDOR_ID = 0x0925;
const BK8540_PRODUCT_ID = 0x1234;

const USB_CONFIG = {
    MAX_RETRIES: 3,
    RETRY_DELAY: 50,
    READ_TIMEOUT: 500,
    BUFFER_SIZE: 256
};

const RAMP_CONFIG = {
    DEFAULT_STEP: 0.01,
    DEFAULT_INTERVAL: 20,
    MAX_STEP_VOLTAGE: 0.05,
    MAX_STEP_CURRENT: 0.05,
    RAMP_UP_DELAY: 10
};

const CHANNEL_COLORS = [
    { border: 'rgba(0, 212, 255, 1)', bg: 'rgba(0, 212, 255, 0.2)' },
    { border: 'rgba(0, 255, 136, 1)', bg: 'rgba(0, 255, 136, 0.2)' },
    { border: 'rgba(255, 170, 0, 1)', bg: 'rgba(255, 170, 0, 0.2)' },
    { border: 'rgba(123, 44, 191, 1)', bg: 'rgba(123, 44, 191, 0.2)' },
    { border: 'rgba(255, 100, 100, 1)', bg: 'rgba(255, 100, 100, 0.2)' }
];

class Channel {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.active = false;
        this.currentMode = 'CC';
        this.inputEnabled = false;
        this.dataPoints = [];
        this.lastValidData = null;
        this.settings = {
            cc: 1.0,
            cv: 12.0,
            cr: 10.0,
            cp: 50.0
        };
    }
}

const AppState = {
    device: null,
    interfaceNumber: null,
    endpointIn: null,
    endpointOut: null,
    connected: false,
    sampling: false,
    samplingInterval: null,
    sequenceRunning: false,
    sequenceTimeout: null,
    ramping: false,
    rampAbort: false,
    currentChannel: 0,
    channels: [new Channel(0, '通道 1')],
    batteryTest: {
        running: false,
        startTime: null,
        capacity: 0,
        energy: 0,
        lastTime: null,
        data: [],
        cutoffVoltage: 3.0,
        dischargeCurrent: 1.0,
        nominalCapacity: 10.0
    }
};

const Charts = {
    viChart: null,
    trendChart: null,
    batteryVoltageChart: null,
    batteryCapacityChart: null,
    sequenceChart: null,
    multiChannelChart: null
};

function log(level, message) {
    const timestamp = new Date().toLocaleTimeString();
    const logContainer = document.getElementById('log-container');
    if (logContainer) {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `
            <span class="timestamp">[${timestamp}]</span>
            <span class="level-${level}">[${level.toUpperCase()}]</span>
            <span class="message">${message}</span>
        `;
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    ipcRenderer.send('log', level, message);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateConnectionStatus(connected, deviceName = null) {
    const indicator = document.getElementById('connection-indicator');
    const text = document.getElementById('connection-text');
    const btn = document.getElementById('connect-btn');
    
    if (indicator) indicator.className = `indicator ${connected ? 'connected' : 'disconnected'}`;
    if (text) text.textContent = connected ? (deviceName || '已连接') : '未连接';
    if (btn) btn.textContent = connected ? '断开连接' : '连接设备';
    
    AppState.connected = connected;
}

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`tab-${tabId}`).classList.add('active');
            
            if (tabId === 'channels') {
                renderChannelsList();
                initMultiChannelChart();
            }
        });
    });
}

async function connectDevice() {
    if (AppState.connected) {
        await disconnectDevice();
        return;
    }
    
    try {
        const device = await navigator.usb.requestDevice({
            filters: [
                { vendorId: BK8540_VENDOR_ID, productId: BK8540_PRODUCT_ID },
                { classCode: 0xFF }
            ]
        });
        
        await device.open();
        
        if (device.configuration === null) {
            await device.selectConfiguration(1);
        }
        
        const interfaces = device.configuration.interfaces;
        let interfaceFound = false;
        
        for (const iface of interfaces) {
            for (const alt of iface.alternates) {
                if (alt.interfaceClass === 0xFF || alt.interfaceClass === 0x03) {
                    await device.claimInterface(iface.interfaceNumber);
                    AppState.interfaceNumber = iface.interfaceNumber;
                    
                    for (const endpoint of alt.endpoints) {
                        if (endpoint.direction === 'in') {
                            AppState.endpointIn = endpoint.endpointNumber;
                        } else if (endpoint.direction === 'out') {
                            AppState.endpointOut = endpoint.endpointNumber;
                        }
                    }
                    
                    interfaceFound = true;
                    break;
                }
            }
            if (interfaceFound) break;
        }
        
        if (!interfaceFound) {
            throw new Error('未找到合适的USB接口');
        }
        
        AppState.device = device;
        updateConnectionStatus(true, device.productName || '电子负载');
        log('info', `设备已连接: ${device.productName || '未知设备'}`);
        
        const idn = await sendCommandWithRetry('*IDN?');
        if (idn) {
            log('info', `设备识别: ${idn}`);
        }
        
    } catch (error) {
        log('error', `连接失败: ${error.message}`);
        updateConnectionStatus(false);
    }
}

async function disconnectDevice() {
    try {
        stopSampling();
        stopBatteryTest();
        if (AppState.sequenceRunning) stopSequence();
        if (AppState.ramping) AppState.rampAbort = true;
        
        if (AppState.device) {
            if (AppState.interfaceNumber !== null) {
                await AppState.device.releaseInterface(AppState.interfaceNumber);
            }
            await AppState.device.close();
        }
        
        AppState.device = null;
        AppState.interfaceNumber = null;
        AppState.endpointIn = null;
        AppState.endpointOut = null;
        
        updateConnectionStatus(false);
        log('info', '设备已断开连接');
    } catch (error) {
        log('error', `断开连接失败: ${error.message}`);
    }
}

async function sendCommandRaw(command) {
    if (!AppState.connected || !AppState.device) {
        throw new Error('设备未连接');
    }
    
    const encoder = new TextEncoder();
    const data = encoder.encode(command + '\n');
    
    await AppState.device.transferOut(AppState.endpointOut, data);
    
    if (command.includes('?')) {
        return await readResponseBuffered();
    }
    
    return null;
}

async function readResponseBuffered() {
    let fullResponse = '';
    const startTime = Date.now();
    
    while (Date.now() - startTime < USB_CONFIG.READ_TIMEOUT) {
        try {
            const result = await AppState.device.transferIn(AppState.endpointIn, USB_CONFIG.BUFFER_SIZE);
            
            if (result.data && result.data.byteLength > 0) {
                const decoder = new TextDecoder();
                const chunk = decoder.decode(result.data);
                fullResponse += chunk;
                
                if (chunk.includes('\n') || result.data.byteLength < USB_CONFIG.BUFFER_SIZE) {
                    break;
                }
            } else {
                await delay(10);
            }
        } catch (error) {
            if (error.name === 'TimeoutError') {
                break;
            }
            throw error;
        }
    }
    
    return fullResponse.trim();
}

async function sendCommandWithRetry(command, retries = USB_CONFIG.MAX_RETRIES) {
    for (let i = 0; i <= retries; i++) {
        try {
            const result = await sendCommandRaw(command);
            
            if (command.includes('?')) {
                if (result && result.length > 0 && (!isNaN(parseFloat(result)) || result.includes(','))) {
                    return result;
                }
                if (i < retries) {
                    await delay(USB_CONFIG.RETRY_DELAY * (i + 1));
                    continue;
                }
            }
            
            return result;
        } catch (error) {
            if (i < retries) {
                await delay(USB_CONFIG.RETRY_DELAY * (i + 1));
            }
        }
    }
    
    return null;
}

function isValidMeasurement(value) {
    if (value === null || value === undefined || isNaN(value)) return false;
    if (value < 0 || value > 1000) return false;
    return true;
}

async function rampToValue(targetValue, mode) {
    if (AppState.ramping) {
        AppState.rampAbort = true;
        while (AppState.ramping) await delay(10);
    }
    
    AppState.ramping = true;
    AppState.rampAbort = false;
    
    const channel = AppState.channels[AppState.currentChannel];
    const currentValue = channel.settings[mode.toLowerCase()];
    const step = mode === 'CV' ? RAMP_CONFIG.MAX_STEP_VOLTAGE : RAMP_CONFIG.MAX_STEP_CURRENT;
    const steps = Math.ceil(Math.abs(targetValue - currentValue) / step);
    
    if (steps <= 1 || isNaN(steps)) {
        await setValueDirect(targetValue, mode);
        AppState.ramping = false;
        return;
    }
    
    log('info', `缓启动: ${currentValue.toFixed(3)} -> ${targetValue.toFixed(3)}, ${steps}步`);
    
    for (let i = 1; i <= steps; i++) {
        if (AppState.rampAbort) {
            log('warn', '缓启动已中断');
            break;
        }
        
        const intermediateValue = currentValue + (targetValue - currentValue) * (i / steps);
        await setValueDirect(Math.round(intermediateValue * 10000) / 10000, mode);
        await delay(RAMP_CONFIG.RAMP_UP_DELAY);
    }
    
    await setValueDirect(targetValue, mode);
    AppState.ramping = false;
    log('info', `缓启动完成: ${targetValue.toFixed(3)}`);
}

async function setValueDirect(value, mode) {
    const channel = AppState.channels[AppState.currentChannel];
    channel.settings[mode.toLowerCase()] = value;
    
    let command;
    switch (mode) {
        case 'CC': command = `CURR ${value}`; break;
        case 'CV': command = `VOLT ${value}`; break;
        case 'CR': command = `RES ${value}`; break;
        case 'CP': command = `POW ${value}`; break;
    }
    
    if (AppState.connected) {
        await sendCommandWithRetry(command);
    }
}

async function safeModeSwitch(newMode) {
    const channel = AppState.channels[AppState.currentChannel];
    if (newMode === channel.currentMode) return;
    
    log('info', `安全切换模式: ${channel.currentMode} -> ${newMode}`);
    
    if (channel.inputEnabled) {
        log('info', '输入开启中，先缓降再切换模式');
        await rampToValue(0.001, channel.currentMode);
        await delay(100);
    }
    
    channel.currentMode = newMode;
    
    if (AppState.connected) {
        await sendCommandWithRetry(`FUNC ${newMode}`);
    }
    
    if (channel.inputEnabled) {
        const targetValue = channel.settings[newMode.toLowerCase()];
        if (targetValue > 0.001) {
            await delay(50);
            await rampToValue(targetValue, newMode);
        }
    }
    
    log('info', `模式切换完成: ${newMode}`);
}

function initCharts() {
    const viCtx = document.getElementById('vi-chart');
    if (viCtx) {
        Charts.viChart = new Chart(viCtx.getContext('2d'), {
            type: 'scatter',
            data: {
                datasets: [{
                    label: '伏安特性',
                    data: [],
                    backgroundColor: 'rgba(0, 212, 255, 0.6)',
                    borderColor: 'rgba(0, 212, 255, 1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    showLine: true,
                    tension: 0.2,
                    spanGaps: true
                }]
            },
            options: getChartOptions('电流 (A)', '电压 (V)')
        });
    }

    const trendCtx = document.getElementById('trend-chart');
    if (trendCtx) {
        Charts.trendChart = new Chart(trendCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: '电压 (V)',
                        data: [],
                        borderColor: 'rgba(0, 212, 255, 1)',
                        backgroundColor: 'rgba(0, 212, 255, 0.1)',
                        yAxisID: 'y',
                        tension: 0.2,
                        fill: true,
                        spanGaps: true
                    },
                    {
                        label: '电流 (A)',
                        data: [],
                        borderColor: 'rgba(0, 255, 136, 1)',
                        backgroundColor: 'rgba(0, 255, 136, 0.1)',
                        yAxisID: 'y1',
                        tension: 0.2,
                        fill: true,
                        spanGaps: true
                    }
                ]
            },
            options: getDualAxisChartOptions('时间', '电压 (V)', '电流 (A)')
        });
    }

    const batteryVoltageCtx = document.getElementById('battery-voltage-chart');
    if (batteryVoltageCtx) {
        Charts.batteryVoltageChart = new Chart(batteryVoltageCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: '电压 (V)',
                    data: [],
                    borderColor: 'rgba(255, 100, 100, 1)',
                    backgroundColor: 'rgba(255, 100, 100, 0.1)',
                    tension: 0.2,
                    fill: true,
                    pointRadius: 2
                }]
            },
            options: getChartOptions('时间', '电压 (V)')
        });
    }

    const batteryCapacityCtx = document.getElementById('battery-capacity-chart');
    if (batteryCapacityCtx) {
        Charts.batteryCapacityChart = new Chart(batteryCapacityCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: '容量 (Ah)',
                    data: [],
                    borderColor: 'rgba(0, 255, 136, 1)',
                    backgroundColor: 'rgba(0, 255, 136, 0.1)',
                    tension: 0.2,
                    fill: true,
                    pointRadius: 2
                }]
            },
            options: getChartOptions('时间', '容量 (Ah)')
        });
    }

    const sequenceCtx = document.getElementById('sequence-chart');
    if (sequenceCtx) {
        Charts.sequenceChart = new Chart(sequenceCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: '电压 (V)',
                        data: [],
                        borderColor: 'rgba(0, 212, 255, 1)',
                        backgroundColor: 'rgba(0, 212, 255, 0.1)',
                        yAxisID: 'y',
                        tension: 0.2,
                        fill: true
                    },
                    {
                        label: '电流 (A)',
                        data: [],
                        borderColor: 'rgba(0, 255, 136, 1)',
                        backgroundColor: 'rgba(0, 255, 136, 0.1)',
                        yAxisID: 'y1',
                        tension: 0.2,
                        fill: true
                    }
                ]
            },
            options: getDualAxisChartOptions('时间', '电压 (V)', '电流 (A)')
        });
    }
}

function initMultiChannelChart() {
    const ctx = document.getElementById('multi-channel-chart');
    if (!ctx || Charts.multiChannelChart) return;
    
    const datasets = AppState.channels.map((channel, index) => {
        const color = CHANNEL_COLORS[index % CHANNEL_COLORS.length];
        return {
            label: channel.name,
            data: channel.dataPoints.slice(-100).map(d => ({ x: d.current, y: d.voltage })),
            borderColor: color.border,
            backgroundColor: color.bg,
            borderWidth: 2,
            pointRadius: 3,
            showLine: true,
            tension: 0.2
        };
    });
    
    Charts.multiChannelChart = new Chart(ctx.getContext('2d'), {
        type: 'scatter',
        data: { datasets },
        options: getChartOptions('电流 (A)', '电压 (V)')
    });
}

function getChartOptions(xLabel, yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: '#e0e0e0' }
            }
        },
        scales: {
            x: {
                title: { display: true, text: xLabel, color: '#e0e0e0' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#e0e0e0' }
            },
            y: {
                title: { display: true, text: yLabel, color: '#e0e0e0' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#e0e0e0' }
            }
        }
    };
}

function getDualAxisChartOptions(xLabel, y1Label, y2Label) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: '#e0e0e0' }
            }
        },
        scales: {
            x: {
                title: { display: true, text: xLabel, color: '#e0e0e0' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#e0e0e0', maxTicksLimit: 10 }
            },
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                title: { display: true, text: y1Label, color: '#00d4ff' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#00d4ff' }
            },
            y1: {
                type: 'linear',
                display: true,
                position: 'right',
                title: { display: true, text: y2Label, color: '#00ff88' },
                grid: { drawOnChartArea: false },
                ticks: { color: '#00ff88' }
            }
        }
    };
}

async function readMeasurements(channelIndex = AppState.currentChannel) {
    if (!AppState.connected) return null;
    
    try {
        const voltageStr = await sendCommandWithRetry('MEAS:VOLT?');
        const currentStr = await sendCommandWithRetry('MEAS:CURR?');
        
        const voltage = parseFloat(voltageStr);
        const current = parseFloat(currentStr);
        
        if (!isValidMeasurement(voltage) || !isValidMeasurement(current)) {
            const channel = AppState.channels[channelIndex];
            if (channel.lastValidData) {
                return { ...channel.lastValidData };
            }
            return null;
        }
        
        const power = voltage * current;
        const data = { voltage, current, power };
        
        AppState.channels[channelIndex].lastValidData = data;
        return data;
    } catch (error) {
        const channel = AppState.channels[channelIndex];
        return channel.lastValidData ? { ...channel.lastValidData } : null;
    }
}

function simulateMeasurements(channelIndex = AppState.currentChannel) {
    const channel = AppState.channels[channelIndex];
    const baseVoltage = 12.0;
    const current = channel.settings.cc;
    const voltage = baseVoltage - (current * 0.1) + (Math.random() - 0.5) * 0.02;
    const noise = (Math.random() - 0.5) * 0.01;
    
    return {
        voltage: Math.max(0, voltage),
        current: Math.max(0, current + noise),
        power: Math.max(0, voltage * (current + noise))
    };
}

function updateDataDisplay(data, channelIndex = AppState.currentChannel) {
    const channel = AppState.channels[channelIndex];
    
    document.getElementById('voltage-display').textContent = data.voltage.toFixed(4);
    document.getElementById('current-display').textContent = data.current.toFixed(4);
    document.getElementById('power-display').textContent = data.power.toFixed(4);
    document.getElementById('mode-display').textContent = channel.currentMode;
}

function addDataPoint(data, channelIndex = AppState.currentChannel) {
    const channel = AppState.channels[channelIndex];
    const timestamp = new Date().toISOString();
    const point = {
        timestamp,
        voltage: data.voltage,
        current: data.current,
        power: data.power,
        mode: channel.currentMode
    };
    
    channel.dataPoints.push(point);
    
    if (channelIndex === AppState.currentChannel) {
        document.getElementById('data-count').textContent = channel.dataPoints.length;
        
        if (Charts.viChart) {
            Charts.viChart.data.datasets[0].data.push({ x: data.current, y: data.voltage });
            if (Charts.viChart.data.datasets[0].data.length > 1000) {
                Charts.viChart.data.datasets[0].data.shift();
            }
            Charts.viChart.update('none');
        }
        
        if (Charts.trendChart) {
            const timeLabel = new Date().toLocaleTimeString();
            Charts.trendChart.data.labels.push(timeLabel);
            Charts.trendChart.data.datasets[0].data.push(data.voltage);
            Charts.trendChart.data.datasets[1].data.push(data.current);
            
            if (Charts.trendChart.data.labels.length > 100) {
                Charts.trendChart.data.labels.shift();
                Charts.trendChart.data.datasets[0].data.shift();
                Charts.trendChart.data.datasets[1].data.shift();
            }
            Charts.trendChart.update('none');
        }
    }
    
    if (Charts.multiChannelChart) {
        const color = CHANNEL_COLORS[channelIndex % CHANNEL_COLORS.length];
        if (!Charts.multiChannelChart.data.datasets[channelIndex]) {
            Charts.multiChannelChart.data.datasets[channelIndex] = {
                label: channel.name,
                data: [],
                borderColor: color.border,
                backgroundColor: color.bg,
                borderWidth: 2,
                pointRadius: 3,
                showLine: true,
                tension: 0.2
            };
        }
        Charts.multiChannelChart.data.datasets[channelIndex].data.push({ x: data.current, y: data.voltage });
        if (Charts.multiChannelChart.data.datasets[channelIndex].data.length > 100) {
            Charts.multiChannelChart.data.datasets[channelIndex].data.shift();
        }
        Charts.multiChannelChart.update('none');
    }
}

async function samplingLoop() {
    const syncSampling = document.getElementById('sync-sampling')?.checked;
    const channels = syncSampling ? AppState.channels.filter(c => c.active) : [AppState.channels[AppState.currentChannel]];
    
    for (const channel of channels) {
        let data;
        
        if (AppState.connected && AppState.device) {
            data = await readMeasurements(channel.id);
        }
        
        if (!data) {
            data = simulateMeasurements(channel.id);
        }
        
        if (channel.id === AppState.currentChannel) {
            updateDataDisplay(data, channel.id);
        }
        
        if (AppState.sampling) {
            addDataPoint(data, channel.id);
        }
        
        if (AppState.batteryTest.running && channel.id === AppState.currentChannel) {
            updateBatteryTest(data);
        }
    }
}

function startSampling() {
    if (AppState.sampling) return;
    
    AppState.sampling = true;
    const interval = parseInt(document.getElementById('sampling-interval').value);
    AppState.samplingInterval = setInterval(samplingLoop, interval);
    
    log('info', `开始数据采集，间隔: ${interval}ms`);
}

function stopSampling() {
    if (!AppState.sampling) return;
    
    AppState.sampling = false;
    if (AppState.samplingInterval) {
        clearInterval(AppState.samplingInterval);
        AppState.samplingInterval = null;
    }
    
    log('info', '数据采集已停止');
}

function clearData() {
    AppState.channels.forEach(channel => {
        channel.dataPoints = [];
        channel.lastValidData = null;
    });
    
    if (Charts.viChart) {
        Charts.viChart.data.datasets[0].data = [];
        Charts.viChart.update();
    }
    if (Charts.trendChart) {
        Charts.trendChart.data.labels = [];
        Charts.trendChart.data.datasets[0].data = [];
        Charts.trendChart.data.datasets[1].data = [];
        Charts.trendChart.update();
    }
    
    document.getElementById('data-count').textContent = '0';
    log('info', '数据已清空');
}

async function setMode(mode) {
    const channel = AppState.channels[AppState.currentChannel];
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
    
    document.querySelectorAll('.control-group').forEach(group => {
        group.classList.add('hidden');
    });
    document.getElementById(`${mode.toLowerCase()}-controls`).classList.remove('hidden');
    
    if (mode !== channel.currentMode) {
        await safeModeSwitch(mode);
    }
    
    document.getElementById('mode-display').textContent = mode;
}

async function applySetting() {
    const channel = AppState.channels[AppState.currentChannel];
    const mode = channel.currentMode;
    let value;
    
    switch (mode) {
        case 'CC':
            value = parseFloat(document.getElementById('cc-current').value);
            break;
        case 'CV':
            value = parseFloat(document.getElementById('cv-voltage').value);
            break;
        case 'CR':
            value = parseFloat(document.getElementById('cr-resistance').value);
            break;
        case 'CP':
            value = parseFloat(document.getElementById('cp-power').value);
            break;
    }
    
    if (channel.inputEnabled && AppState.connected) {
        await rampToValue(value, mode);
    } else if (AppState.connected) {
        await setValueDirect(value, mode);
        log('info', `设置已应用: ${mode} = ${value}`);
    } else {
        channel.settings[mode.toLowerCase()] = value;
        log('info', `模拟设置: ${mode} = ${value}`);
    }
}

async function setInput(enabled) {
    const channel = AppState.channels[AppState.currentChannel];
    
    if (enabled && !channel.inputEnabled) {
        const mode = channel.currentMode;
        const targetValue = channel.settings[mode.toLowerCase()];
        
        if (targetValue > 0.01 && AppState.connected) {
            log('info', '开启输入前先设为最小值...');
            await setValueDirect(0.001, mode);
            await delay(50);
        }
        
        if (AppState.connected) {
            await sendCommandWithRetry('INP ON');
        }
        channel.inputEnabled = true;
        log('info', '输入已开启');
        
        if (targetValue > 0.01 && AppState.connected) {
            await rampToValue(targetValue, mode);
        }
    } else if (!enabled && channel.inputEnabled) {
        if (AppState.connected) {
            const mode = channel.currentMode;
            log('info', '关闭输入前缓降到最小值...');
            await rampToValue(0.001, mode);
            await delay(50);
            await sendCommandWithRetry('INP OFF');
        }
        channel.inputEnabled = false;
        log('info', '输入已关闭');
    }
}

async function runSequenceStep(index, values, mode) {
    if (!AppState.sequenceRunning || index >= values.length) {
        stopSequence();
        return;
    }
    
    const value = values[index];
    const progress = ((index + 1) / values.length) * 100;
    
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `${progress.toFixed(1)}% (${index + 1}/${values.length})`;
    
    if (mode !== AppState.channels[AppState.currentChannel].currentMode) {
        await safeModeSwitch(mode);
    }
    
    if (AppState.connected) {
        await rampToValue(value, mode);
    } else {
        AppState.channels[AppState.currentChannel].settings[mode.toLowerCase()] = value;
    }
    
    log('info', `序列步骤 ${index + 1}/${values.length}: ${mode} = ${value}`);
    
    const dwell = parseInt(document.getElementById('seq-dwell').value) * 1000;
    AppState.sequenceTimeout = setTimeout(() => {
        runSequenceStep(index + 1, values, mode);
    }, dwell);
}

function startSequence() {
    if (AppState.sequenceRunning) return;
    
    const start = parseFloat(document.getElementById('seq-start').value);
    const end = parseFloat(document.getElementById('seq-end').value);
    const step = parseFloat(document.getElementById('seq-step').value);
    const mode = document.getElementById('seq-mode').value;
    
    if (step <= 0) {
        log('error', '步进值必须大于0');
        return;
    }
    
    const values = [];
    if (end > start) {
        for (let v = start; v <= end; v += step) {
            values.push(Math.round(v * 1000) / 1000);
        }
    } else {
        for (let v = start; v >= end; v -= step) {
            values.push(Math.round(v * 1000) / 1000);
        }
    }
    
    if (values.length === 0) {
        log('error', '无法生成序列步骤');
        return;
    }
    
    AppState.sequenceRunning = true;
    
    log('info', `开始序列测试: ${start} -> ${end}, 步进: ${step}, 共${values.length}步`);
    
    if (!AppState.sampling) {
        startSampling();
    }
    
    runSequenceStep(0, values, mode);
}

function stopSequence() {
    AppState.sequenceRunning = false;
    
    if (AppState.sequenceTimeout) {
        clearTimeout(AppState.sequenceTimeout);
        AppState.sequenceTimeout = null;
    }
    
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('progress-text').textContent = '0%';
    
    log('info', '序列测试已停止');
}

function updateBatteryEstTime() {
    const nominalCapacity = parseFloat(document.getElementById('battery-nominal-capacity').value);
    const dischargeCurrent = parseFloat(document.getElementById('battery-discharge-current').value);
    
    if (dischargeCurrent > 0) {
        const hours = nominalCapacity / dischargeCurrent;
        const seconds = hours * 3600;
        document.getElementById('battery-est-time').textContent = formatTime(seconds);
        document.getElementById('battery-c-rate').textContent = `${(dischargeCurrent / nominalCapacity).toFixed(2)}C`;
    }
}

function startBatteryTest() {
    if (AppState.batteryTest.running) return;
    
    const nominalCapacity = parseFloat(document.getElementById('battery-nominal-capacity').value);
    const dischargeCurrent = parseFloat(document.getElementById('battery-discharge-current').value);
    const cutoffVoltage = parseFloat(document.getElementById('battery-cutoff-voltage').value);
    
    AppState.batteryTest = {
        running: true,
        startTime: Date.now(),
        lastTime: Date.now(),
        capacity: 0,
        energy: 0,
        data: [],
        nominalCapacity,
        dischargeCurrent,
        cutoffVoltage
    };
    
    if (Charts.batteryVoltageChart) {
        Charts.batteryVoltageChart.data.labels = [];
        Charts.batteryVoltageChart.data.datasets[0].data = [];
        Charts.batteryVoltageChart.update();
    }
    if (Charts.batteryCapacityChart) {
        Charts.batteryCapacityChart.data.labels = [];
        Charts.batteryCapacityChart.data.datasets[0].data = [];
        Charts.batteryCapacityChart.update();
    }
    
    log('info', `开始电池放电测试: ${dischargeCurrent}A, 截止电压: ${cutoffVoltage}V`);
    
    if (!AppState.sampling) {
        startSampling();
    }
}

function updateBatteryTest(data) {
    if (!AppState.batteryTest.running) return;
    
    const now = Date.now();
    const dt = (now - AppState.batteryTest.lastTime) / 1000 / 3600;
    
    AppState.batteryTest.capacity += data.current * dt;
    AppState.batteryTest.energy += data.power * dt;
    AppState.batteryTest.lastTime = now;
    
    const elapsed = (now - AppState.batteryTest.startTime) / 1000;
    const remaining = 100 - (AppState.batteryTest.capacity / AppState.batteryTest.nominalCapacity * 100);
    
    document.getElementById('battery-capacity').textContent = `${AppState.batteryTest.capacity.toFixed(3)} Ah`;
    document.getElementById('battery-energy').textContent = `${AppState.batteryTest.energy.toFixed(3)} Wh`;
    document.getElementById('battery-elapsed').textContent = formatTime(elapsed);
    document.getElementById('battery-remaining').textContent = `${Math.max(0, remaining).toFixed(1)}%`;
    document.getElementById('battery-progress-fill').style.width = `${Math.min(100, AppState.batteryTest.capacity / AppState.batteryTest.nominalCapacity * 100)}%`;
    
    const timeLabel = formatTime(elapsed);
    AppState.batteryTest.data.push({
        time: elapsed,
        voltage: data.voltage,
        capacity: AppState.batteryTest.capacity
    });
    
    if (Charts.batteryVoltageChart) {
        Charts.batteryVoltageChart.data.labels.push(timeLabel);
        Charts.batteryVoltageChart.data.datasets[0].data.push(data.voltage);
        if (Charts.batteryVoltageChart.data.labels.length > 200) {
            Charts.batteryVoltageChart.data.labels.shift();
            Charts.batteryVoltageChart.data.datasets[0].data.shift();
        }
        Charts.batteryVoltageChart.update('none');
    }
    
    if (Charts.batteryCapacityChart) {
        Charts.batteryCapacityChart.data.labels.push(timeLabel);
        Charts.batteryCapacityChart.data.datasets[0].data.push(AppState.batteryTest.capacity);
        if (Charts.batteryCapacityChart.data.labels.length > 200) {
            Charts.batteryCapacityChart.data.labels.shift();
            Charts.batteryCapacityChart.data.datasets[0].data.shift();
        }
        Charts.batteryCapacityChart.update('none');
    }
    
    if (data.voltage <= AppState.batteryTest.cutoffVoltage) {
        stopBatteryTest();
        log('info', '电池放电测试完成（达到截止电压）');
    }
}

function stopBatteryTest() {
    if (!AppState.batteryTest.running) return;
    
    AppState.batteryTest.running = false;
    log('info', '电池放电测试已停止');
    log('info', `测试结果: ${AppState.batteryTest.capacity.toFixed(3)}Ah / ${AppState.batteryTest.energy.toFixed(3)}Wh`);
}

function addChannel() {
    const id = AppState.channels.length;
    const channel = new Channel(id, `通道 ${id + 1}`);
    AppState.channels.push(channel);
    
    updateChannelSelectors();
    renderChannelsList();
    log('info', `已添加通道: ${channel.name}`);
}

function removeSelectedChannels() {
    const selectedCheckboxes = document.querySelectorAll('.channel-item input:checked');
    const selectedIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.channelId));
    
    if (selectedIds.length === 0) {
        log('warn', '请先选择要删除的通道');
        return;
    }
    
    if (AppState.channels.length - selectedIds.length < 1) {
        log('warn', '至少保留一个通道');
        return;
    }
    
    AppState.channels = AppState.channels.filter(c => !selectedIds.includes(c.id));
    AppState.channels.forEach((c, i) => { c.id = i; c.name = `通道 ${i + 1}`; });
    
    if (AppState.currentChannel >= AppState.channels.length) {
        AppState.currentChannel = 0;
    }
    
    updateChannelSelectors();
    renderChannelsList();
    log('info', `已删除 ${selectedIds.length} 个通道`);
}

function updateChannelSelectors() {
    const selects = ['channel-select', 'seq-channel'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = AppState.channels.map(c => 
                `<option value="${c.id}">${c.name}</option>`
            ).join('');
            select.value = AppState.currentChannel;
        }
    });
    
    document.getElementById('current-channel-name').textContent = AppState.channels[AppState.currentChannel].name;
}

function renderChannelsList() {
    const container = document.getElementById('channels-list');
    if (!container) return;
    
    container.innerHTML = AppState.channels.map(channel => `
        <div class="channel-item ${channel.id === AppState.currentChannel ? 'selected' : ''}" data-channel-id="${channel.id}">
            <input type="checkbox" data-channel-id="${channel.id}" ${channel.active ? 'checked' : ''}>
            <span class="channel-name">${channel.name}</span>
            <span class="channel-status ${channel.active ? 'active' : ''}"></span>
        </div>
    `).join('');
    
    container.querySelectorAll('.channel-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                const channelId = parseInt(item.dataset.channelId);
                AppState.currentChannel = channelId;
                updateChannelSelectors();
                renderChannelsList();
            }
        });
        
        const checkbox = item.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            const channelId = parseInt(e.target.dataset.channelId);
            AppState.channels[channelId].active = e.target.checked;
            renderChannelsList();
        });
    });
}

function syncStartSampling() {
    const syncMode = document.getElementById('sync-mode').value;
    const activeChannels = AppState.channels.filter(c => c.active);
    
    if (activeChannels.length === 0) {
        log('warn', '请先激活至少一个通道');
        return;
    }
    
    log('info', `同步开始采集 (${syncMode === 'parallel' ? '并行' : '顺序'}模式)`);
    startSampling();
}

function syncStopSampling() {
    log('info', '同步停止采集');
    stopSampling();
}

async function generatePDFReport() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
        log('error', 'PDF库未加载');
        return;
    }
    
    const channel = AppState.channels[AppState.currentChannel];
    if (channel.dataPoints.length === 0 && AppState.batteryTest.data.length === 0) {
        log('warn', '没有数据可生成报告');
        return;
    }
    
    try {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        
        doc.setFontSize(20);
        doc.setTextColor(0, 100, 150);
        doc.text(document.getElementById('report-title').value || '电子负载测试报告', pageWidth / 2, 25, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`生成时间: ${new Date().toLocaleString()}`, pageWidth / 2, 35, { align: 'center' });
        
        let yPos = 50;
        
        if (document.getElementById('report-include-summary').checked) {
            doc.setFontSize(14);
            doc.setTextColor(0, 100, 150);
            doc.text('测试摘要', 20, yPos);
            yPos += 10;
            
            doc.setFontSize(10);
            doc.setTextColor(50);
            
            const operator = document.getElementById('report-operator').value || '未填写';
            const device = document.getElementById('report-device').value || '未填写';
            const notes = document.getElementById('report-notes').value || '无';
            
            doc.text(`测试人员: ${operator}`, 20, yPos);
            yPos += 7;
            doc.text(`被测设备: ${device}`, 20, yPos);
            yPos += 7;
            doc.text(`测试模式: ${channel.currentMode}`, 20, yPos);
            yPos += 7;
            doc.text(`数据点数: ${channel.dataPoints.length}`, 20, yPos);
            yPos += 10;
            doc.text(`备注: ${notes}`, 20, yPos);
            yPos += 15;
        }
        
        if (document.getElementById('report-include-stats').checked && channel.dataPoints.length > 0) {
            doc.setFontSize(14);
            doc.setTextColor(0, 100, 150);
            doc.text('统计信息', 20, yPos);
            yPos += 10;
            
            const voltages = channel.dataPoints.map(d => d.voltage);
            const currents = channel.dataPoints.map(d => d.current);
            const powers = channel.dataPoints.map(d => d.power);
            
            doc.setFontSize(10);
            doc.setTextColor(50);
            doc.text('            最小值    最大值    平均值', 20, yPos);
            yPos += 7;
            doc.text(`电压(V):   ${Math.min(...voltages).toFixed(4)}   ${Math.max(...voltages).toFixed(4)}   ${(voltages.reduce((a, b) => a + b) / voltages.length).toFixed(4)}`, 20, yPos);
            yPos += 7;
            doc.text(`电流(A):   ${Math.min(...currents).toFixed(4)}   ${Math.max(...currents).toFixed(4)}   ${(currents.reduce((a, b) => a + b) / currents.length).toFixed(4)}`, 20, yPos);
            yPos += 7;
            doc.text(`功率(W):   ${Math.min(...powers).toFixed(4)}   ${Math.max(...powers).toFixed(4)}   ${(powers.reduce((a, b) => a + b) / powers.length).toFixed(4)}`, 20, yPos);
            yPos += 15;
        }
        
        if (AppState.batteryTest.data.length > 0) {
            doc.setFontSize(14);
            doc.setTextColor(0, 100, 150);
            doc.text('电池测试结果', 20, yPos);
            yPos += 10;
            
            doc.setFontSize(10);
            doc.setTextColor(50);
            doc.text(`标称容量: ${AppState.batteryTest.nominalCapacity.toFixed(2)} Ah`, 20, yPos);
            yPos += 7;
            doc.text(`放电电流: ${AppState.batteryTest.dischargeCurrent.toFixed(2)} A`, 20, yPos);
            yPos += 7;
            doc.text(`实际容量: ${AppState.batteryTest.capacity.toFixed(3)} Ah`, 20, yPos);
            yPos += 7;
            doc.text(`实际能量: ${AppState.batteryTest.energy.toFixed(3)} Wh`, 20, yPos);
            yPos += 15;
        }
        
        if (document.getElementById('report-include-data').checked && channel.dataPoints.length > 0) {
            if (yPos > 200) {
                doc.addPage();
                yPos = 30;
            }
            
            doc.setFontSize(14);
            doc.setTextColor(0, 100, 150);
            doc.text('数据记录 (前10条)', 20, yPos);
            yPos += 10;
            
            doc.setFontSize(8);
            doc.setTextColor(50);
            doc.text('时间', 20, yPos);
            doc.text('电压(V)', 60, yPos);
            doc.text('电流(A)', 100, yPos);
            doc.text('功率(W)', 140, yPos);
            doc.text('模式', 180, yPos);
            yPos += 6;
            
            channel.dataPoints.slice(0, 10).forEach(point => {
                doc.text(point.timestamp.slice(11, 19), 20, yPos);
                doc.text(point.voltage.toFixed(4), 60, yPos);
                doc.text(point.current.toFixed(4), 100, yPos);
                doc.text(point.power.toFixed(4), 140, yPos);
                doc.text(point.mode, 180, yPos);
                yPos += 5;
            });
        }
        
        const fileName = `test_report_${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(fileName);
        
        log('info', `PDF报告已生成: ${fileName}`);
    } catch (error) {
        log('error', `PDF生成失败: ${error.message}`);
    }
}

function previewReport() {
    const preview = document.getElementById('report-preview-content');
    const channel = AppState.channels[AppState.currentChannel];
    
    let html = '<div style="font-family: Arial, sans-serif;">';
    html += `<h2 style="color: #006496; text-align: center;">${document.getElementById('report-title').value}</h2>`;
    html += `<p style="text-align: center; color: #666; font-size: 12px;">生成时间: ${new Date().toLocaleString()}</p>`;
    html += '<hr>';
    
    if (document.getElementById('report-include-summary').checked) {
        html += '<h3 style="color: #006496;">测试摘要</h3>';
        html += `<p><strong>测试人员:</strong> ${document.getElementById('report-operator').value || '未填写'}</p>`;
        html += `<p><strong>被测设备:</strong> ${document.getElementById('report-device').value || '未填写'}</p>`;
        html += `<p><strong>测试模式:</strong> ${channel.currentMode}</p>`;
        html += `<p><strong>数据点数:</strong> ${channel.dataPoints.length}</p>`;
        html += `<p><strong>备注:</strong> ${document.getElementById('report-notes').value || '无'}</p>`;
    }
    
    if (document.getElementById('report-include-stats').checked && channel.dataPoints.length > 0) {
        const voltages = channel.dataPoints.map(d => d.voltage);
        const currents = channel.dataPoints.map(d => d.current);
        const powers = channel.dataPoints.map(d => d.power);
        
        html += '<h3 style="color: #006496;">统计信息</h3>';
        html += '<table style="width: 100%; border-collapse: collapse; margin: 10px 0;">';
        html += '<tr><th></th><th>最小值</th><th>最大值</th><th>平均值</th></tr>';
        html += `<tr><td>电压(V)</td><td>${Math.min(...voltages).toFixed(4)}</td><td>${Math.max(...voltages).toFixed(4)}</td><td>${(voltages.reduce((a, b) => a + b) / voltages.length).toFixed(4)}</td></tr>`;
        html += `<tr><td>电流(A)</td><td>${Math.min(...currents).toFixed(4)}</td><td>${Math.max(...currents).toFixed(4)}</td><td>${(currents.reduce((a, b) => a + b) / currents.length).toFixed(4)}</td></tr>`;
        html += `<tr><td>功率(W)</td><td>${Math.min(...powers).toFixed(4)}</td><td>${Math.max(...powers).toFixed(4)}</td><td>${(powers.reduce((a, b) => a + b) / powers.length).toFixed(4)}</td></tr>`;
        html += '</table>';
    }
    
    if (AppState.batteryTest.data.length > 0) {
        html += '<h3 style="color: #006496;">电池测试结果</h3>';
        html += `<p><strong>标称容量:</strong> ${AppState.batteryTest.nominalCapacity.toFixed(2)} Ah</p>`;
        html += `<p><strong>放电电流:</strong> ${AppState.batteryTest.dischargeCurrent.toFixed(2)} A</p>`;
        html += `<p><strong>实际容量:</strong> ${AppState.batteryTest.capacity.toFixed(3)} Ah</p>`;
        html += `<p><strong>实际能量:</strong> ${AppState.batteryTest.energy.toFixed(3)} Wh</p>`;
    }
    
    html += '</div>';
    
    preview.innerHTML = html;
}

async function exportCSV() {
    const channel = AppState.channels[AppState.currentChannel];
    if (channel.dataPoints.length === 0) {
        log('warn', '没有数据可导出');
        return;
    }
    
    try {
        const result = await ipcRenderer.invoke('export-csv', channel.dataPoints);
        
        if (result.success) {
            log('info', `CSV已导出到: ${result.path}`);
        } else if (!result.canceled) {
            log('error', `导出失败: ${result.error}`);
        }
    } catch (error) {
        log('error', `导出失败: ${error.message}`);
    }
}

function initEventListeners() {
    document.getElementById('connect-btn')?.addEventListener('click', connectDevice);
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    
    document.getElementById('input-on')?.addEventListener('click', () => setInput(true));
    document.getElementById('input-off')?.addEventListener('click', () => setInput(false));
    document.getElementById('apply-setting')?.addEventListener('click', applySetting);
    
    document.getElementById('start-sampling')?.addEventListener('click', startSampling);
    document.getElementById('stop-sampling')?.addEventListener('click', stopSampling);
    document.getElementById('clear-data')?.addEventListener('click', clearData);
    
    document.getElementById('start-sequence')?.addEventListener('click', startSequence);
    document.getElementById('stop-sequence')?.addEventListener('click', stopSequence);
    
    document.getElementById('export-csv')?.addEventListener('click', exportCSV);
    
    document.getElementById('sampling-interval')?.addEventListener('change', () => {
        if (AppState.sampling) {
            stopSampling();
            startSampling();
        }
    });
    
    document.getElementById('channel-select')?.addEventListener('change', (e) => {
        AppState.currentChannel = parseInt(e.target.value);
        updateChannelSelectors();
        renderChannelsList();
    });
    
    document.getElementById('add-channel')?.addEventListener('click', addChannel);
    document.getElementById('add-channel-btn')?.addEventListener('click', addChannel);
    document.getElementById('remove-channel-btn')?.addEventListener('click', removeSelectedChannels);
    document.getElementById('sync-start')?.addEventListener('click', syncStartSampling);
    document.getElementById('sync-stop')?.addEventListener('click', syncStopSampling);
    
    document.getElementById('battery-nominal-capacity')?.addEventListener('input', updateBatteryEstTime);
    document.getElementById('battery-discharge-current')?.addEventListener('input', updateBatteryEstTime);
    document.getElementById('start-battery-test')?.addEventListener('click', startBatteryTest);
    document.getElementById('stop-battery-test')?.addEventListener('click', stopBatteryTest);
    
    document.getElementById('generate-pdf')?.addEventListener('click', generatePDFReport);
    document.getElementById('preview-report')?.addEventListener('click', previewReport);
    
    ['cc-current', 'cv-voltage', 'cr-resistance', 'cp-power'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            const channel = AppState.channels[AppState.currentChannel];
            const mode = id.split('-')[0].toUpperCase();
            channel.settings[mode.toLowerCase()] = parseFloat(e.target.value);
        });
    });
}

function init() {
    initTabs();
    initCharts();
    initEventListeners();
    updateChannelSelectors();
    updateBatteryEstTime();
    
    log('info', '电子负载控制器已启动');
    log('info', '已启用: USB重传机制 + 缓启动保护 + 多通道同步');
    
    setInterval(samplingLoop, 500);
}

document.addEventListener('DOMContentLoaded', init);
