const API_BASE = '/api';

let powerChart, prChart;

document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initCharts();
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    fetchData();
    setInterval(fetchData, 5000);
    
    fetchInverters();
    setInterval(fetchInverters, 5000);
    
    fetchAlarms();
    setInterval(fetchAlarms, 10000);
    
    initReportGenerator();
    
    updateConnectionStatus(true);
});

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

function initCharts() {
    const powerCtx = document.getElementById('powerChart').getContext('2d');
    const prCtx = document.getElementById('prChart').getContext('2d');

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            x: {
                grid: {
                    display: false
                }
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(0, 0, 0, 0.05)'
                }
            }
        },
        animation: {
            duration: 500
        }
    };

    powerChart = new Chart(powerCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '功率 (kW)',
                data: [],
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: chartOptions
    });

    prChart = new Chart(prCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'PR值 (%)',
                data: [],
                borderColor: '#764ba2',
                backgroundColor: 'rgba(118, 75, 162, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: {
            ...chartOptions,
            scales: {
                ...chartOptions.scales,
                y: {
                    ...chartOptions.scales.y,
                    max: 100
                }
            }
        }
    });
}

function updateCurrentTime() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleString('zh-CN');
}

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    statusEl.textContent = connected ? '已连接' : '已断开';
    statusEl.className = 'status-badge ' + (connected ? 'connected' : 'disconnected');
}

async function fetchData() {
    try {
        const response = await fetch(`${API_BASE}/plant/summary`);
        if (response.ok) {
            const data = await response.json();
            updateDashboard(data);
            updateConnectionStatus(true);
        } else {
            updateConnectionStatus(false);
        }
    } catch (error) {
        console.error('Failed to fetch data:', error);
        updateConnectionStatus(false);
    }

    try {
        const historyResponse = await fetch(`${API_BASE}/plant/history?hours=6`);
        if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            updateCharts(historyData);
        }
    } catch (error) {
        console.error('Failed to fetch history:', error);
    }
}

function updateDashboard(data) {
    if (!data) return;

    document.getElementById('totalPower').textContent = (data.total_power / 1000).toFixed(2);
    document.getElementById('totalEnergy').textContent = data.total_energy.toFixed(2);
    document.getElementById('prValue').textContent = (data.pr_value * 100).toFixed(1);
    document.getElementById('inverterCount').textContent = data.inverter_count || 0;

    const prPercent = Math.min(100, data.pr_value * 100);
    document.getElementById('prProgress').style.width = prPercent + '%';
}

function updateCharts(historyData) {
    if (!historyData || historyData.length === 0) return;

    const labels = historyData.map(d => {
        const date = new Date(d.timestamp);
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    });

    const powerData = historyData.map(d => (d.total_power / 1000).toFixed(2));
    const prData = historyData.map(d => (d.pr_value * 100).toFixed(1));

    powerChart.data.labels = labels;
    powerChart.data.datasets[0].data = powerData;
    powerChart.update('none');

    prChart.data.labels = labels;
    prChart.data.datasets[0].data = prData;
    prChart.update('none');
}

async function fetchInverters() {
    try {
        const response = await fetch(`${API_BASE}/plant/inverters`);
        if (response.ok) {
            const data = await response.json();
            updateInverters(data);
        }
    } catch (error) {
        console.error('Failed to fetch inverters:', error);
    }
}

function updateInverters(inverters) {
    const grid = document.getElementById('invertersGrid');
    grid.innerHTML = '';

    inverters.forEach(inv => {
        const card = document.createElement('div');
        card.className = 'inverter-card';
        card.innerHTML = `
            <div class="inverter-header">
                <div class="inverter-name">${inv.inverter_id}</div>
                <div class="inverter-status status-online">运行中</div>
            </div>
            <div class="inverter-stats">
                <div class="stat-item">
                    <div class="stat-label">功率</div>
                    <div class="stat-value">${(inv.power / 1000).toFixed(2)}<span class="stat-unit">kW</span></div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">电压</div>
                    <div class="stat-value">${inv.voltage.toFixed(1)}<span class="stat-unit">V</span></div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">电流</div>
                    <div class="stat-value">${inv.current.toFixed(2)}<span class="stat-unit">A</span></div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">温度</div>
                    <div class="stat-value">${inv.temperature.toFixed(1)}<span class="stat-unit">°C</span></div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">发电量</div>
                    <div class="stat-value">${inv.energy.toFixed(2)}<span class="stat-unit">kWh</span></div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">效率</div>
                    <div class="stat-value">${inv.efficiency.toFixed(1)}<span class="stat-unit">%</span></div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function fetchAlarms() {
    try {
        const response = await fetch(`${API_BASE}/alarms`);
        if (response.ok) {
            const alarms = await response.json();
            updateAlarms(alarms);
        }
    } catch (error) {
        console.error('Failed to fetch alarms:', error);
    }
}

function updateAlarms(alarms) {
    const list = document.getElementById('alarmsList');
    const countEl = document.getElementById('alarmCount');
    
    countEl.textContent = alarms.length;

    if (alarms.length === 0) {
        list.innerHTML = '<div class="no-alarms">✅ 暂无活动告警</div>';
        return;
    }

    list.innerHTML = '';
    alarms.forEach(alarm => {
        const item = document.createElement('div');
        item.className = 'alarm-item';
        const time = new Date(alarm.timestamp).toLocaleString('zh-CN');
        item.innerHTML = `
            <div class="alarm-info">
                <div class="alarm-type">⚠️ ${alarm.type}</div>
                <div class="alarm-message">${alarm.message}</div>
                <div class="alarm-time">${time} | 当前值: ${alarm.value.toFixed(1)}% | 阈值: ${alarm.threshold}%</div>
            </div>
            <div class="alarm-actions">
                <button class="btn-ack" onclick="acknowledgeAlarm('${alarm.id}')">确认</button>
            </div>
        `;
        list.appendChild(item);
    });
}

async function acknowledgeAlarm(alarmId) {
    try {
        const response = await fetch(`${API_BASE}/alarms/${alarmId}/acknowledge`, {
            method: 'PUT'
        });
        if (response.ok) {
            fetchAlarms();
        }
    } catch (error) {
        console.error('Failed to acknowledge alarm:', error);
    }
}

function initReportGenerator() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('reportDate').value = today;

    document.getElementById('generateReport').addEventListener('click', generateReport);
}

async function generateReport() {
    const type = document.getElementById('reportType').value;
    const dateValue = document.getElementById('reportDate').value;
    const date = new Date(dateValue);

    let url = `${API_BASE}/reports/`;
    
    switch(type) {
        case 'daily':
            url += `daily?date=${dateValue}`;
            break;
        case 'monthly':
            url += `monthly?year=${date.getFullYear()}&month=${date.getMonth() + 1}`;
            break;
        case 'yearly':
            url += `yearly?year=${date.getFullYear()}`;
            break;
    }

    try {
        const response = await fetch(url);
        if (response.ok) {
            const report = await response.json();
            displayReport(report);
        }
    } catch (error) {
        console.error('Failed to generate report:', error);
    }
}

function displayReport(report) {
    if (!report) return;

    document.getElementById('reportEnergy').textContent = report.total_energy ? report.total_energy.toFixed(2) : '--';
    document.getElementById('reportMaxPower').textContent = report.max_power ? (report.max_power / 1000).toFixed(2) : '--';
    document.getElementById('reportAvgPR').textContent = report.avg_pr ? (report.avg_pr * 100).toFixed(1) : '--';
    document.getElementById('reportPeakHours').textContent = report.peak_hours ? report.peak_hours.toFixed(1) : '--';
}
