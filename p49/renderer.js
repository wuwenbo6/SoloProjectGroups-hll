const { ipcRenderer } = require('electron');

let isCapturing = false;
let isConnected = false;
let voltageChart = null;
let currentChart = null;
let voltageData = [];
let currentData = [];
let messageCount = 0;
let currentPort = '';

function initCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                display: true,
                grid: {
                    color: '#21262d'
                },
                ticks: {
                    color: '#8b949e'
                }
            },
            y: {
                display: true,
                grid: {
                    color: '#21262d'
                },
                ticks: {
                    color: '#8b949e'
                }
            }
        },
        plugins: {
            legend: {
                display: false
            }
        },
        animation: false
    };

    const voltageCtx = document.getElementById('voltageChart').getContext('2d');
    voltageChart = new Chart(voltageCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '电压',
                data: [],
                borderColor: '#58a6ff',
                backgroundColor: 'rgba(88, 166, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            ...chartOptions,
            scales: {
                ...chartOptions.scales,
                y: {
                    ...chartOptions.scales.y,
                    min: 0,
                    max: 25,
                    title: {
                        display: true,
                        text: 'V',
                        color: '#8b949e'
                    }
                }
            }
        }
    });

    const currentCtx = document.getElementById('currentChart').getContext('2d');
    currentChart = new Chart(currentCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '电流',
                data: [],
                borderColor: '#3fb950',
                backgroundColor: 'rgba(63, 185, 80, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            ...chartOptions,
            scales: {
                ...chartOptions.scales,
                y: {
                    ...chartOptions.scales.y,
                    min: 0,
                    max: 5,
                    title: {
                        display: true,
                        text: 'A',
                        color: '#8b949e'
                    }
                }
            }
        }
    });
}

function updateCharts(voltage, current, timestamp) {
    const timeStr = new Date(timestamp).toLocaleTimeString();
    
    voltageData.push(voltage);
    currentData.push(current);
    
    if (voltageData.length > 100) {
        voltageData.shift();
        currentData.shift();
        voltageChart.data.labels.shift();
        currentChart.data.labels.shift();
    }
    
    voltageChart.data.labels.push(timeStr);
    currentChart.data.labels.push(timeStr);
    
    voltageChart.data.datasets[0].data = [...voltageData];
    currentChart.data.datasets[0].data = [...currentData];
    
    voltageChart.update('none');
    currentChart.update('none');
    
    document.getElementById('voltageDisplay').textContent = `电压: ${voltage.toFixed(2)} V`;
    document.getElementById('currentDisplay').textContent = `电流: ${current.toFixed(2)} A`;
    document.getElementById('powerDisplay').textContent = `功率: ${(voltage * current).toFixed(2)} W`;
}

function addProtocolMessage(timestamp, direction, messageType, message, crcValid = true) {
    const messagesBody = document.getElementById('messagesBody');
    const timeStr = new Date(timestamp).toLocaleTimeString();
    
    const row = document.createElement('tr');
    const directionClass = direction.includes('Host') ? 'msg-type-source' : 'msg-type-sink';
    const crcClass = crcValid ? '' : 'style="background-color: rgba(248, 81, 73, 0.1)"';
    const crcIndicator = crcValid ? '' : ' <span style="color: #f85149; font-weight: bold;">[CRC ERROR]</span>';
    
    row.innerHTML = `
        <td ${crcClass}>${timeStr}</td>
        <td class="${directionClass}" ${crcClass}>${direction}</td>
        <td ${crcClass}>${messageType}</td>
        <td ${crcClass}>${message}${crcIndicator}</td>
    `;
    
    messagesBody.insertBefore(row, messagesBody.firstChild);
    messageCount++;
    document.getElementById('messageCount').textContent = `${messageCount} 条消息`;
    
    while (messagesBody.children.length > 100) {
        messagesBody.removeChild(messagesBody.lastChild);
    }
}

function updatePPSAnalysis(analysis) {
    const complianceStatus = document.getElementById('complianceStatus');
    const statusIcon = complianceStatus.querySelector('.status-icon');
    const statusText = complianceStatus.querySelector('div > div:first-child');
    const statusSubtext = complianceStatus.querySelector('div > div:last-child');
    
    if (analysis.compliant) {
        complianceStatus.className = 'compliance-status status-compliant';
        statusIcon.textContent = '✓';
        statusText.textContent = '合规';
        statusSubtext.textContent = '所有测试项通过';
    } else {
        complianceStatus.className = 'compliance-status status-fail';
        statusIcon.textContent = '✗';
        statusText.textContent = '不合规';
        statusSubtext.textContent = `发现 ${analysis.issues?.length || 0} 个问题`;
    }
    
    const voltageAccuracy = document.getElementById('voltageAccuracy');
    voltageAccuracy.textContent = `${analysis.voltage_accuracy}%`;
    voltageAccuracy.className = `value ${analysis.voltage_pass ? 'value-pass' : 'value-fail'}`;
    
    const currentAccuracy = document.getElementById('currentAccuracy');
    currentAccuracy.textContent = `${analysis.current_accuracy}%`;
    currentAccuracy.className = `value ${analysis.current_pass ? 'value-pass' : 'value-fail'}`;
    
    const rippleNoise = document.getElementById('rippleNoise');
    rippleNoise.textContent = `${analysis.ripple_noise} mV`;
    rippleNoise.className = `value ${analysis.ripple_pass ? 'value-pass' : 'value-fail'}`;
    
    const responseTime = document.getElementById('responseTime');
    responseTime.textContent = `${analysis.response_time} ms`;
    responseTime.className = `value ${analysis.response_pass ? 'value-pass' : 'value-fail'}`;
    
    const ppsSupport = document.getElementById('ppsSupport');
    ppsSupport.textContent = analysis.pps_supported ? '支持' : '不支持';
    ppsSupport.className = `value ${analysis.pps_supported ? 'value-pass' : 'value-fail'}`;
    
    const crcErrorCount = document.getElementById('crcErrorCount');
    const crcErrors = analysis.crc_error_count || 0;
    crcErrorCount.textContent = crcErrors;
    crcErrorCount.className = `value ${crcErrors === 0 ? 'value-pass' : 'value-fail'}`;
    
    const packetLossCount = document.getElementById('packetLossCount');
    const packetLoss = analysis.packet_loss_count || 0;
    packetLossCount.textContent = packetLoss;
    packetLossCount.className = `value ${packetLoss === 0 ? 'value-pass' : 'value-fail'}`;
    
    const filterStatus = document.getElementById('filterStatus');
    filterStatus.textContent = '滑动平均 (5点)';
    filterStatus.className = 'value value-pass';
}

function updateProgress(percent, message) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
        progressBar.setAttribute('aria-valuenow', percent);
    }
    if (progressText) {
        progressText.textContent = message || `${percent}%`;
    }
}

function displayTestResults(results) {
    const testSummary = document.getElementById('testSummary');
    const testResultsContainer = document.getElementById('testResultsContainer');
    
    if (testSummary) {
        const passed = results.passed || 0;
        const total = results.total || 0;
        const failed = total - passed;
        testSummary.innerHTML = `
            <div class="test-summary">
                <div class="summary-item">
                    <span class="summary-label">总测试项:</span>
                    <span class="summary-value">${total}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">通过:</span>
                    <span class="summary-value value-pass">${passed}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">失败:</span>
                    <span class="summary-value value-fail">${failed}</span>
                </div>
            </div>
        `;
    }
}

function addTestResultItem(testName, passed, details) {
    const testResultsContainer = document.getElementById('testResultsContainer');
    if (!testResultsContainer) return;
    
    const resultItem = document.createElement('div');
    resultItem.className = `test-result-item ${passed ? 'result-pass' : 'result-fail'}`;
    resultItem.innerHTML = `
        <div class="result-header">
            <span class="result-icon">${passed ? '✓' : '✗'}</span>
            <span class="result-name">${testName}</span>
        </div>
        ${details ? `<div class="result-details">${details}</div>` : ''}
    `;
    testResultsContainer.appendChild(resultItem);
}

async function handleConnect() {
    try {
        const result = await ipcRenderer.invoke('connect-device');
        if (result.success) {
            console.log('Device connected');
        }
    } catch (error) {
        console.error('Connect error:', error);
    }
}

async function handleCaptureToggle() {
    const captureBtn = document.getElementById('captureBtn');
    
    if (!isCapturing) {
        try {
            const result = await ipcRenderer.invoke('start-capture');
            if (result.success) {
                isCapturing = true;
                captureBtn.textContent = '停止捕获';
                captureBtn.className = 'btn btn-danger';
                document.getElementById('captureStatus').textContent = '捕获中';
            }
        } catch (error) {
            console.error('Start capture error:', error);
        }
    } else {
        try {
            const result = await ipcRenderer.invoke('stop-capture');
            if (result.success) {
                isCapturing = false;
                captureBtn.textContent = '开始捕获';
                captureBtn.className = 'btn btn-secondary';
                document.getElementById('captureStatus').textContent = '已停止';
            }
        } catch (error) {
            console.error('Stop capture error:', error);
        }
    }
}

async function handleSetVoltage() {
    const voltage = parseFloat(document.getElementById('voltageSlider').value);
    try {
        const result = await ipcRenderer.invoke('set-voltage', voltage);
        if (result.success) {
            console.log('Voltage set to:', voltage);
        }
    } catch (error) {
        console.error('Set voltage error:', error);
    }
}

async function handleExportPdf() {
    try {
        const result = await ipcRenderer.invoke('export-report', 'pdf');
        if (result.success) {
            alert(`PDF 报告已导出到: ${result.path}`);
        }
    } catch (error) {
        console.error('Export PDF error:', error);
    }
}

async function handleExportCsv() {
    try {
        const result = await ipcRenderer.invoke('export-report', 'csv');
        if (result.success) {
            alert(`CSV 数据已导出到: ${result.path}`);
        }
    } catch (error) {
        console.error('Export CSV error:', error);
    }
}

function updateControlsState() {
    const connectBtn = document.getElementById('connectBtn');
    const captureBtn = document.getElementById('captureBtn');
    const setVoltageBtn = document.getElementById('setVoltageBtn');
    const voltageSlider = document.getElementById('voltageSlider');
    const currentLimit = document.getElementById('currentLimit');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const statusDot = document.getElementById('statusDot');
    const connectionStatus = document.getElementById('connectionStatus');
    const portSelect = document.getElementById('portSelect');
    const pollingToggle = document.getElementById('pollingToggle');
    const pollingInterval = document.getElementById('pollingInterval');
    const startTestBtn = document.getElementById('startTestBtn');
    const stopTestBtn = document.getElementById('stopTestBtn');
    const exportWaveformBtn = document.getElementById('exportWaveformBtn');
    const currentPortDisplay = document.getElementById('currentPortDisplay');
    
    if (isConnected) {
        connectBtn.textContent = '已连接';
        connectBtn.disabled = true;
        captureBtn.disabled = false;
        setVoltageBtn.disabled = false;
        voltageSlider.disabled = false;
        currentLimit.disabled = false;
        exportPdfBtn.disabled = false;
        exportCsvBtn.disabled = false;
        statusDot.className = 'status-dot status-connected';
        connectionStatus.textContent = '已连接';
        
        if (portSelect) portSelect.disabled = false;
        if (pollingToggle) pollingToggle.disabled = false;
        if (pollingInterval) pollingInterval.disabled = false;
        if (startTestBtn) startTestBtn.disabled = false;
        if (stopTestBtn) stopTestBtn.disabled = false;
        if (exportWaveformBtn) exportWaveformBtn.disabled = false;
    } else {
        connectBtn.textContent = '连接设备';
        connectBtn.disabled = false;
        captureBtn.disabled = true;
        setVoltageBtn.disabled = true;
        voltageSlider.disabled = true;
        currentLimit.disabled = true;
        exportPdfBtn.disabled = true;
        exportCsvBtn.disabled = true;
        statusDot.className = 'status-dot status-disconnected';
        connectionStatus.textContent = '未连接';
        
        if (portSelect) portSelect.disabled = true;
        if (pollingToggle) pollingToggle.disabled = true;
        if (pollingInterval) pollingInterval.disabled = true;
        if (startTestBtn) startTestBtn.disabled = true;
        if (stopTestBtn) stopTestBtn.disabled = true;
        if (exportWaveformBtn) exportWaveformBtn.disabled = true;
    }
    
    if (currentPortDisplay) {
        currentPortDisplay.textContent = currentPort || '未选择';
    }
    
    if (isCapturing) {
        statusDot.className = 'status-dot status-capturing';
    }
}

ipcRenderer.on('pd_data', (event, data) => {
    if (data.voltage !== undefined && data.current !== undefined) {
        updateCharts(data.voltage, data.current, data.timestamp);
    }
    
    if (data.message_type && data.direction) {
        addProtocolMessage(
            data.timestamp,
            data.direction,
            data.message_type,
            data.message || '',
            data.crc_valid !== false
        );
    }
});

ipcRenderer.on('pps_analysis', (event, analysis) => {
    updatePPSAnalysis(analysis);
});

ipcRenderer.on('device_status', (event, status) => {
    if (status.connected !== undefined) {
        isConnected = status.connected;
    }
    if (status.status === 'Capturing') {
        isCapturing = true;
        document.getElementById('captureBtn').textContent = '停止捕获';
        document.getElementById('captureBtn').className = 'btn btn-danger';
        document.getElementById('captureStatus').textContent = '捕获中';
    } else if (status.status === 'Stopped') {
        isCapturing = false;
        document.getElementById('captureBtn').textContent = '开始捕获';
        document.getElementById('captureBtn').className = 'btn btn-secondary';
        document.getElementById('captureStatus').textContent = '已停止';
    }
    updateControlsState();
});

ipcRenderer.on('port_changed', (event, portName) => {
    currentPort = portName;
    const portSelect = document.getElementById('portSelect');
    if (portSelect) {
        portSelect.value = portName;
    }
    updateControlsState();
});

ipcRenderer.on('test_progress', (event, data) => {
    updateProgress(data.percent, data.message);
    if (data.test_result) {
        addTestResultItem(
            data.test_result.name,
            data.test_result.passed,
            data.test_result.details
        );
    }
});

ipcRenderer.on('test_complete', (event, results) => {
    updateProgress(100, '测试完成');
    displayTestResults(results);
});

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    
    document.getElementById('connectBtn').addEventListener('click', handleConnect);
    document.getElementById('captureBtn').addEventListener('click', handleCaptureToggle);
    document.getElementById('setVoltageBtn').addEventListener('click', handleSetVoltage);
    document.getElementById('exportPdfBtn').addEventListener('click', handleExportPdf);
    document.getElementById('exportCsvBtn').addEventListener('click', handleExportCsv);
    
    document.getElementById('voltageSlider').addEventListener('input', (e) => {
        document.getElementById('voltageValue').textContent = `${parseFloat(e.target.value).toFixed(1)} V`;
    });
    
    const portSelect = document.getElementById('portSelect');
    if (portSelect) {
        portSelect.addEventListener('change', async (e) => {
            try {
                await ipcRenderer.invoke('select-port', e.target.value);
            } catch (error) {
                console.error('Select port error:', error);
            }
        });
    }
    
    const pollingToggle = document.getElementById('pollingToggle');
    if (pollingToggle) {
        pollingToggle.addEventListener('change', async (e) => {
            try {
                await ipcRenderer.invoke('set-polling', e.target.checked);
            } catch (error) {
                console.error('Set polling error:', error);
            }
        });
    }
    
    const pollingInterval = document.getElementById('pollingInterval');
    if (pollingInterval) {
        pollingInterval.addEventListener('change', async (e) => {
            try {
                await ipcRenderer.invoke('set-polling-interval', parseInt(e.target.value));
            } catch (error) {
                console.error('Set polling interval error:', error);
            }
        });
    }
    
    const startTestBtn = document.getElementById('startTestBtn');
    if (startTestBtn) {
        startTestBtn.addEventListener('click', async () => {
            try {
                await ipcRenderer.invoke('start-compliance-test');
            } catch (error) {
                console.error('Start compliance test error:', error);
            }
        });
    }
    
    const stopTestBtn = document.getElementById('stopTestBtn');
    if (stopTestBtn) {
        stopTestBtn.addEventListener('click', async () => {
            try {
                await ipcRenderer.invoke('stop-compliance-test');
            } catch (error) {
                console.error('Stop compliance test error:', error);
            }
        });
    }
    
    const exportWaveformBtn = document.getElementById('exportWaveformBtn');
    if (exportWaveformBtn) {
        exportWaveformBtn.addEventListener('click', async () => {
            try {
                const result = await ipcRenderer.invoke('export-waveform-csv');
                if (result.success) {
                    alert(`波形数据已导出到: ${result.path}`);
                }
            } catch (error) {
                console.error('Export waveform CSV error:', error);
            }
        });
    }
    
    updateControlsState();
});
