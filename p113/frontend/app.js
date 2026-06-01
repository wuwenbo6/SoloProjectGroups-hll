const API_BASE = 'http://localhost:8000/api';

let skyplotData = null;
let visibilityData = null;
let qualityMetrics = null;
let ionosphereData = null;
let displacementData = null;
let currentEpoch = 0;
let animationInterval = null;
let isAnimating = false;
let visibilityChart = null;
let snrChart = null;
let ionosphereChart = null;
let displacementChart = null;
let displacement3dChart = null;

const SATELLITE_COLORS = {
    'G': '#FF6B6B',
    'R': '#4ECDC4',
    'E': '#45B7D1',
    'C': '#96CEB4',
    'J': '#FFEAA7',
    'I': '#DDA0DD',
    'S': '#98D8C8'
};

function getSatelliteColor(sat) {
    const system = sat.charAt(0);
    return SATELLITE_COLORS[system] || '#888888';
}

function showAlert(message, type = 'error') {
    const container = document.getElementById('alertContainer');
    container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    setTimeout(() => {
        container.innerHTML = '';
    }, 5000);
}

function formatDate(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
}

function getQualityScoreClass(score) {
    if (score >= 80) return 'score-excellent';
    if (score >= 60) return 'score-good';
    if (score >= 40) return 'score-fair';
    return 'score-poor';
}

function getQualityScoreText(score) {
    if (score >= 80) return '优秀';
    if (score >= 60) return '良好';
    if (score >= 40) return '一般';
    return '较差';
}

function calculateQualityScore(metrics) {
    const mpScore = Math.max(0, 100 - (metrics.avg_multipath || 0) * 20);
    const snrScore = Math.min(100, (metrics.avg_snr || 0) * 2);
    const csScore = Math.max(0, 100 - (metrics.cycle_slips_count || 0) * 10);
    const availScore = (metrics.data_availability || 0) * 100;

    return 0.3 * mpScore + 0.3 * snrScore + 0.2 * csScore + 0.2 * availScore;
}

document.getElementById('obsFile').addEventListener('change', function(e) {
    const fileName = e.target.files[0]?.name || '选择观测文件...';
    document.getElementById('obsFileName').textContent = fileName;
    document.getElementById('obsFileLabel').classList.toggle('selected', e.target.files.length > 0);
});

document.getElementById('navFile').addEventListener('change', function(e) {
    const fileName = e.target.files[0]?.name || '选择导航文件 (可选)...';
    document.getElementById('navFileName').textContent = fileName;
    document.getElementById('navFileLabel').classList.toggle('selected', e.target.files.length > 0);
});

async function uploadFiles() {
    const obsFile = document.getElementById('obsFile').files[0];
    const navFile = document.getElementById('navFile').files[0];

    if (!obsFile) {
        showAlert('请选择观测文件', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('obs_file', obsFile);
    if (navFile) {
        formData.append('nav_file', navFile);
    }

    document.getElementById('uploadBtn').disabled = true;
    document.getElementById('uploadLoading').classList.add('show');

    try {
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || '上传失败');
        }

        showAlert('文件解析成功！', 'success');
        displayFileInfo(result.obs_info, result.nav_info);

        await Promise.all([
            loadQualityMetrics(),
            loadSkyplotData(),
            loadVisibilityData(),
            loadSnrElevationData(),
            loadIonosphereData(),
            loadDisplacementData(),
            loadReportPreview()
        ]);

        document.getElementById('resultsSection').classList.remove('hidden');

    } catch (error) {
        console.error('Upload error:', error);
        showAlert(error.message || '上传失败', 'error');
    } finally {
        document.getElementById('uploadBtn').disabled = false;
        document.getElementById('uploadLoading').classList.remove('show');
    }
}

function displayFileInfo(obsInfo, navInfo) {
    const fileInfo = document.getElementById('fileInfo');
    fileInfo.innerHTML = `
        <div class="info-item">
            <div class="label">测站名称</div>
            <div class="value">${obsInfo?.station_name || '未知'}</div>
        </div>
        <div class="info-item">
            <div class="label">观测者</div>
            <div class="value">${obsInfo?.observer || '未知'}</div>
        </div>
        <div class="info-item">
            <div class="label">开始时间</div>
            <div class="value">${formatDate(obsInfo?.start_time)}</div>
        </div>
        <div class="info-item">
            <div class="label">结束时间</div>
            <div class="value">${formatDate(obsInfo?.end_time)}</div>
        </div>
        <div class="info-item">
            <div class="label">历元数</div>
            <div class="value">${obsInfo?.num_epochs || 0}</div>
        </div>
        <div class="info-item">
            <div class="label">卫星数量</div>
            <div class="value">${obsInfo?.satellites?.length || 0}</div>
        </div>
        <div class="info-item">
            <div class="label">采样间隔</div>
            <div class="value">${obsInfo?.interval || 30}s</div>
        </div>
        <div class="info-item">
            <div class="label">观测类型</div>
            <div class="value">${obsInfo?.observation_types?.slice(0, 4).join(', ') || '-'}</div>
        </div>
    `;
}

async function loadQualityMetrics() {
    try {
        const response = await fetch(`${API_BASE}/quality-metrics`);
        const result = await response.json();
        qualityMetrics = result.metrics;
        displayMetricsTable();
    } catch (error) {
        console.error('Load quality metrics error:', error);
    }
}

function displayMetricsTable() {
    const tbody = document.getElementById('metricsTableBody');
    tbody.innerHTML = '';

    let elevationCorrected = false;

    for (const [sat, metrics] of Object.entries(qualityMetrics || {})) {
        const mp = metrics.multipath || {};
        const snr = metrics.snr || {};
        const cs = metrics.cycle_slips || {};

        if (mp.elevation_corrected) {
            elevationCorrected = true;
        }

        const rowMetrics = {
            avg_multipath: mp.avg_multipath || 0,
            max_multipath: mp.max_multipath || 0,
            avg_snr: snr.avg_snr || 0,
            min_snr: snr.min_snr || 0,
            cycle_slips_count: cs.cycle_slip_count || 0,
            data_availability: metrics.data_availability || 0
        };

        const score = calculateQualityScore(rowMetrics);

        const detectionMethods = cs.detection_methods || {};
        const csDetail = Object.entries(detectionMethods)
            .filter(([k, v]) => v > 0)
            .map(([k, v]) => `${k}:${v}`)
            .join(', ');

        tbody.innerHTML += `
            <tr>
                <td><span style="color: ${getSatelliteColor(sat)}; font-weight: 600;">${sat}</span></td>
                <td>${rowMetrics.avg_multipath.toFixed(3)}</td>
                <td>${rowMetrics.max_multipath.toFixed(3)}</td>
                <td>${rowMetrics.avg_snr.toFixed(1)}</td>
                <td>${rowMetrics.min_snr.toFixed(1)}</td>
                <td title="${csDetail}">${rowMetrics.cycle_slips_count}${csDetail ? ' <small>(' + csDetail + ')</small>' : ''}</td>
                <td>${(rowMetrics.data_availability * 100).toFixed(1)}%</td>
                <td><span class="quality-score ${getQualityScoreClass(score)}">${score.toFixed(0)} - ${getQualityScoreText(score)}</span></td>
            </tr>
        `;
    }

    if (elevationCorrected) {
        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = 'margin-top: 15px; padding: 10px; background: #e8f4fd; border-radius: 8px; font-size: 0.9em;';
        infoDiv.innerHTML = '<strong>ℹ️ 优化说明：</strong> 多路径误差已进行<strong>仰角校正</strong>（低仰角卫星不再误报）。周跳检测采用<strong>4种方法融合</strong>（GF组合 + 相位码 + 多普勒 + 多项式拟合），对小周跳更敏感。';
        tbody.parentElement.parentElement.appendChild(infoDiv);
    }
}

async function loadSkyplotData() {
    try {
        const response = await fetch(`${API_BASE}/skyplot`);
        const result = await response.json();
        skyplotData = result.data;
        initSkyplot();
    } catch (error) {
        console.error('Load skyplot data error:', error);
    }
}

function initSkyplot() {
    if (!skyplotData || !skyplotData.epochs?.length) return;

    const slider = document.getElementById('timeSlider');
    slider.max = skyplotData.epochs.length - 1;
    slider.value = 0;

    slider.addEventListener('input', function() {
        currentEpoch = parseInt(this.value);
        updateSkyplot();
    });

    drawSkyplotLegend();
    updateSkyplot();
}

function drawSkyplotLegend() {
    const legend = document.getElementById('skyplotLegend');
    const satellites = Object.keys(skyplotData.satellites || {});
    const systems = [...new Set(satellites.map(s => s.charAt(0)))];

    const systemNames = {
        'G': 'GPS',
        'R': 'GLONASS',
        'E': 'Galileo',
        'C': 'BeiDou',
        'J': 'QZSS',
        'I': 'IRNSS',
        'S': 'SBAS'
    };

    legend.innerHTML = systems.map(sys => `
        <div class="legend-item">
            <div class="legend-color" style="background: ${getSatelliteColor(sys + '01')}"></div>
            <span>${systemNames[sys] || sys}</span>
        </div>
    `).join('');
}

function updateSkyplot() {
    const canvas = document.getElementById('skyplotCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 30;

    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, '#0a192f');
    gradient.addColorStop(1, '#020c1b');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    for (let el = 90; el >= 0; el -= 15) {
        const r = radius * (1 - el / 90);
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
        ctx.stroke();

        if (el < 90) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${el}°`, centerX, centerY - r + 15);
        }
    }

    for (let az = 0; az < 360; az += 30) {
        const rad = (az - 90) * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + radius * Math.cos(rad), centerY + radius * Math.sin(rad));
        ctx.stroke();

        const labelR = radius + 20;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            `${az}°`,
            centerX + labelR * Math.cos(rad),
            centerY + labelR * Math.sin(rad)
        );
    }

    const labels = ['N', 'E', 'S', 'W'];
    const angles = [270, 0, 90, 180];
    labels.forEach((label, i) => {
        const rad = angles[i] * Math.PI / 180;
        const labelR = radius + 35;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            label,
            centerX + labelR * Math.cos(rad),
            centerY + labelR * Math.sin(rad)
        );
    });

    if (skyplotData.epochs && skyplotData.epochs[currentEpoch]) {
        const epoch = skyplotData.epochs[currentEpoch];
        document.getElementById('timeDisplay').textContent = `时间: ${epoch.time}`;

        epoch.satellites.forEach(sat => {
            const azRad = (sat.azimuth - 90) * Math.PI / 180;
            const r = radius * (1 - sat.elevation / 90);
            const x = centerX + r * Math.cos(azRad);
            const y = centerY + r * Math.sin(azRad);

            const color = getSatelliteColor(sat.satellite);

            ctx.beginPath();
            ctx.arc(x, y, 8, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = 'white';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(sat.satellite, x, y - 12);
        });

        const satCount = epoch.satellites.length;
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`可见卫星数: ${satCount}`, 20, 30);
    }
}

function toggleAnimation() {
    const btn = document.getElementById('animateBtn');

    if (isAnimating) {
        clearInterval(animationInterval);
        isAnimating = false;
        btn.innerHTML = '▶️ 播放动画';
    } else {
        isAnimating = true;
        btn.innerHTML = '⏸️ 暂停动画';

        animationInterval = setInterval(() => {
            currentEpoch++;
            if (currentEpoch >= skyplotData.epochs.length) {
                currentEpoch = 0;
            }
            document.getElementById('timeSlider').value = currentEpoch;
            updateSkyplot();
        }, 100);
    }
}

async function loadVisibilityData() {
    try {
        const response = await fetch(`${API_BASE}/visibility`);
        const result = await response.json();
        visibilityData = result.data;
        drawVisibilityChart();
    } catch (error) {
        console.error('Load visibility data error:', error);
    }
}

function drawVisibilityChart() {
    const ctx = document.getElementById('visibilityChart').getContext('2d');

    if (!visibilityData) return;

    const satellites = visibilityData.satellites || [];
    const times = visibilityData.times || [];
    const periods = visibilityData.visibility_periods || {};

    const datasets = satellites.slice(0, 15).map((sat, index) => {
        const satPeriods = periods[sat] || [];
        const data = [];

        satPeriods.forEach(p => {
            data.push({
                x: p.start,
                y: index
            });
            data.push({
                x: p.end,
                y: index
            });
            data.push({
                x: null,
                y: null
            });
        });

        return {
            label: sat,
            data: data,
            borderColor: getSatelliteColor(sat),
            backgroundColor: getSatelliteColor(sat),
            borderWidth: 8,
            pointRadius: 0,
            showLine: true
        };
    });

    if (visibilityChart) {
        visibilityChart.destroy();
    }

    visibilityChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        padding: 8
                    }
                },
                title: {
                    display: true,
                    text: '卫星可见性时间轴'
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        displayFormats: {
                            hour: 'HH:mm'
                        }
                    },
                    title: {
                        display: true,
                        text: '时间'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: '卫星'
                    },
                    ticks: {
                        callback: function(value) {
                            return satellites[value] || '';
                        }
                    },
                    min: -0.5,
                    max: Math.min(satellites.length, 15) - 0.5
                }
            }
        }
    });
}

async function loadSnrElevationData() {
    try {
        const response = await fetch(`${API_BASE}/snr-elevation`);
        const result = await response.json();
        drawSnrChart(result.data);
    } catch (error) {
        console.error('Load SNR elevation data error:', error);
    }
}

function drawSnrChart(data) {
    const ctx = document.getElementById('snrChart').getContext('2d');

    if (!data || !data.satellites) return;

    const datasets = Object.entries(data.satellites).map(([sat, values]) => ({
        label: sat,
        data: values.elevation.map((el, i) => ({
            x: el,
            y: values.snr[i]
        })),
        backgroundColor: getSatelliteColor(sat),
        pointRadius: 3,
        showLine: false
    }));

    if (snrChart) {
        snrChart.destroy();
    }

    snrChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        padding: 8
                    }
                },
                title: {
                    display: true,
                    text: 'SNR与仰角关系散点图'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '仰角 (°)'
                    },
                    min: 0,
                    max: 90
                },
                y: {
                    title: {
                        display: true,
                        text: 'SNR (dBHz)'
                    },
                    min: 0,
                    max: 60
                }
            }
        }
    });
}

function showTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(tabName).classList.add('active');

    if (tabName === 'visibility' && visibilityChart) {
        setTimeout(() => visibilityChart.resize(), 100);
    }
    if (tabName === 'snr' && snrChart) {
        setTimeout(() => snrChart.resize(), 100);
    }
    if (tabName === 'ionosphere' && ionosphereChart) {
        setTimeout(() => ionosphereChart.resize(), 100);
    }
    if (tabName === 'displacement' && displacementChart) {
        setTimeout(() => displacementChart.resize(), 100);
        setTimeout(() => displacement3dChart.resize(), 100);
    }
}

async function loadIonosphereData() {
    try {
        const response = await fetch(`${API_BASE}/ionosphere`);
        const result = await response.json();
        ionosphereData = result.data;
        displayIonosphereData();
    } catch (error) {
        console.error('Load ionosphere data error:', error);
    }
}

function displayIonosphereData() {
    if (!ionosphereData) return;

    const overall = ionosphereData.overall || {};
    const perSatellite = ionosphereData.per_satellite || {};

    const activityColors = {
        'normal': '#4CAF50',
        'medium': '#FF9800',
        'high': '#f44336'
    };

    const activityText = {
        'normal': '正常',
        'medium': '中等',
        'high': '强烈'
    };

    document.getElementById('ionosphereSummary').innerHTML = `
        <div class="info-item">
            <div class="label">平均STEC</div>
            <div class="value">${(overall.avg_stec || 0).toFixed(1)} TECU</div>
        </div>
        <div class="info-item">
            <div class="label">最大STEC</div>
            <div class="value">${(overall.max_stec || 0).toFixed(1)} TECU</div>
        </div>
        <div class="info-item">
            <div class="label">平均电离层延迟</div>
            <div class="value">${(overall.avg_delay || 0).toFixed(3)} m</div>
        </div>
        <div class="info-item">
            <div class="label">最大电离层延迟</div>
            <div class="value">${(overall.max_delay || 0).toFixed(3)} m</div>
        </div>
        <div class="info-item">
            <div class="label">电离层活动水平</div>
            <div class="value" style="color: ${activityColors[overall.activity_level] || '#333'}">
                ${activityText[overall.activity_level] || overall.activity_level}
            </div>
        </div>
    `;

    drawIonosphereChart();
    displayIonosphereTable();
}

function drawIonosphereChart() {
    const ctx = document.getElementById('ionosphereChart').getContext('2d');
    if (!ionosphereData || !ionosphereData.per_satellite) return;

    const perSat = ionosphereData.per_satellite;
    const datasets = [];
    let maxLength = 0;

    Object.entries(perSat).forEach(([sat, data]) => {
        const stec = data.stec?.stec_series || [];
        if (stec.length > maxLength) maxLength = stec.length;
        if (stec.length > 0) {
            datasets.push({
                label: sat,
                data: stec,
                borderColor: getSatelliteColor(sat),
                backgroundColor: getSatelliteColor(sat) + '20',
                borderWidth: 2,
                pointRadius: 0,
                showLine: true,
                tension: 0.1
            });
        }
    });

    if (ionosphereChart) {
        ionosphereChart.destroy();
    }

    ionosphereChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({ length: maxLength }, (_, i) => i),
            datasets: datasets.slice(0, 10)
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { boxWidth: 12, padding: 8 }
                },
                title: {
                    display: true,
                    text: 'STEC (斜向总电子含量) 时间序列'
                }
            },
            scales: {
                x: {
                    title: { display: true, text: '历元' }
                },
                y: {
                    title: { display: true, text: 'STEC (TECU)' }
                }
            }
        }
    });
}

function displayIonosphereTable() {
    const tbody = document.getElementById('ionosphereTableBody');
    if (!ionosphereData || !ionosphereData.per_satellite) return;

    const perSat = ionosphereData.per_satellite;
    const methodText = {
        'dual_frequency': '双频组合',
        'klobuchar': 'Klobuchar模型',
        'none': '无法计算'
    };

    tbody.innerHTML = '';
    Object.entries(perSat).forEach(([sat, data]) => {
        const iono = data.ionospheric_delay || {};
        const stec = data.stec || {};

        tbody.innerHTML += `
            <tr>
                <td><span style="color: ${getSatelliteColor(sat)}; font-weight: 600;">${sat}</span></td>
                <td>${(stec.avg_stec || 0).toFixed(1)}</td>
                <td>${(stec.max_stec || 0).toFixed(1)}</td>
                <td>${(iono.avg_delay || 0).toFixed(3)}</td>
                <td>${(iono.max_delay || 0).toFixed(3)}</td>
                <td>${methodText[iono.method] || iono.method || '-'}</td>
            </tr>
        `;
    });
}

async function loadDisplacementData() {
    try {
        const response = await fetch(`${API_BASE}/displacement`);
        const result = await response.json();
        displacementData = result.data;
        displayDisplacementData();
    } catch (error) {
        console.error('Load displacement data error:', error);
    }
}

function displayDisplacementData() {
    if (!displacementData) return;

    const stats = displacementData.stats || {};
    const refPos = displacementData.reference_position || {};

    const stabilityColors = {
        'excellent': '#4CAF50',
        'good': '#8BC34A',
        'moderate': '#FF9800',
        'poor': '#f44336',
        'unstable': '#9C27B0'
    };

    const stabilityText = {
        'excellent': '极好',
        'good': '良好',
        'moderate': '中等',
        'poor': '较差',
        'unstable': '不稳定'
    };

    document.getElementById('displacementSummary').innerHTML = `
        <div class="info-item">
            <div class="label">平均东向位移</div>
            <div class="value">${(stats.mean_east_m || 0).toFixed(4)} m</div>
        </div>
        <div class="info-item">
            <div class="label">平均北向位移</div>
            <div class="value">${(stats.mean_north_m || 0).toFixed(4)} m</div>
        </div>
        <div class="info-item">
            <div class="label">平均垂向位移</div>
            <div class="value">${(stats.mean_up_m || 0).toFixed(4)} m</div>
        </div>
        <div class="info-item">
            <div class="label">最大3D位移</div>
            <div class="value">${(stats.max_displacement_3d_m || 0).toFixed(4)} m</div>
        </div>
        <div class="info-item">
            <div class="label">站点稳定性</div>
            <div class="value" style="color: ${stabilityColors[stats.stability_classification] || '#333'}">
                ${stabilityText[stats.stability_classification] || stats.stability_classification}
            </div>
        </div>
        <div class="info-item">
            <div class="label">移动检测</div>
            <div class="value" style="color: ${stats.movement_detected ? '#f44336' : '#4CAF50'}">
                ${stats.movement_detected ? '检测到移动' : '无显著移动'}
            </div>
        </div>
    `;

    drawDisplacementChart();
    drawDisplacement3dChart();
    displayMovementEvents();
}

function drawDisplacementChart() {
    const ctx = document.getElementById('displacementChart').getContext('2d');
    if (!displacementData || !displacementData.time_series) return;

    const ts = displacementData.time_series;

    if (displacementChart) {
        displacementChart.destroy();
    }

    displacementChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ts.timestamps || [],
            datasets: [
                {
                    label: '东向 (E)',
                    data: ts.east_series || [],
                    borderColor: '#FF6B6B',
                    backgroundColor: '#FF6B6B20',
                    borderWidth: 2,
                    pointRadius: 0,
                    showLine: true
                },
                {
                    label: '北向 (N)',
                    data: ts.north_series || [],
                    borderColor: '#4ECDC4',
                    backgroundColor: '#4ECDC420',
                    borderWidth: 2,
                    pointRadius: 0,
                    showLine: true
                },
                {
                    label: '垂向 (U)',
                    data: ts.up_series || [],
                    borderColor: '#45B7D1',
                    backgroundColor: '#45B7D120',
                    borderWidth: 2,
                    pointRadius: 0,
                    showLine: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { boxWidth: 12, padding: 8 }
                },
                title: {
                    display: true,
                    text: 'ENU坐标位移时间序列'
                }
            },
            scales: {
                x: {
                    title: { display: true, text: '时间' },
                    ticks: { maxTicksLimit: 8 }
                },
                y: {
                    title: { display: true, text: '位移 (m)' }
                }
            }
        }
    });
}

function drawDisplacement3dChart() {
    const ctx = document.getElementById('displacement3dChart').getContext('2d');
    if (!displacementData || !displacementData.time_series) return;

    const ts = displacementData.time_series;

    if (displacement3dChart) {
        displacement3dChart.destroy();
    }

    displacement3dChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ts.timestamps || [],
            datasets: [
                {
                    label: '3D位移量',
                    data: ts.displacement_3d_series || [],
                    borderColor: '#9C27B0',
                    backgroundColor: '#9C27B020',
                    borderWidth: 2,
                    pointRadius: 0,
                    showLine: true,
                    fill: true
                },
                {
                    label: 'HDOP',
                    data: ts.hdop_series || [],
                    borderColor: '#FF9800',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    showLine: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { boxWidth: 12, padding: 8 }
                },
                title: {
                    display: true,
                    text: '3D位移量与HDOP变化'
                }
            },
            scales: {
                x: {
                    title: { display: true, text: '时间' },
                    ticks: { maxTicksLimit: 8 }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: '3D位移 (m)' }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'HDOP' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

function displayMovementEvents() {
    const eventsDiv = document.getElementById('eventsList');
    const events = displacementData?.movement_events || [];

    if (!events || events.length === 0) {
        eventsDiv.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666; background: #f5f5f5; border-radius: 8px;">
                未检测到显著移动事件
            </div>
        `;
        return;
    }

    const severityColors = {
        'minor': '#FF9800',
        'major': '#f44336',
        'critical': '#9C27B0'
    };

    const severityText = {
        'minor': '轻微',
        'major': '明显',
        'critical': '严重'
    };

    eventsDiv.innerHTML = events.map((event, i) => `
        <div style="padding: 12px; margin-bottom: 8px; background: #fff3cd; border-left: 4px solid ${severityColors[event.severity]}; border-radius: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>事件 #${i + 1}</strong> - ${event.time}
                </div>
                <span style="color: ${severityColors[event.severity]}; font-weight: 600;">
                    ${severityText[event.severity] || event.severity}
                </span>
            </div>
            <div style="margin-top: 5px; font-size: 0.9em; color: #666;">
                增量位移: ${event.incremental_displacement_m.toFixed(4)} m | 
                累计位移: ${event.cumulative_displacement_m.toFixed(4)} m
                <br>
                方向: E=${event.direction.east_m.toFixed(4)} m, N=${event.direction.north_m.toFixed(4)} m, U=${event.direction.up_m.toFixed(4)} m
            </div>
        </div>
    `).join('');
}

async function loadReportPreview() {
    try {
        const response = await fetch(`${API_BASE}/export/gfzrnx?format=gfzrnx`);
        const content = await response.text();
        document.getElementById('reportPreview').textContent = content;
    } catch (error) {
        console.error('Load report preview error:', error);
        document.getElementById('reportPreview').textContent = '报告预览加载失败';
    }
}

async function exportReport(format) {
    try {
        const response = await fetch(`${API_BASE}/export/gfzrnx?format=${format}`);
        const content = await response.text();
        const filename = `quality_report_${new Date().toISOString().slice(0, 10)}.${format === 'csv' ? 'csv' : 'txt'}`;

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showAlert(`报告已导出为 ${filename}`, 'success');
    } catch (error) {
        console.error('Export report error:', error);
        showAlert('导出失败: ' + error.message, 'error');
    }
}

async function saveReport() {
    const btn = document.getElementById('saveReportBtn');
    btn.disabled = true;
    btn.textContent = '保存中...';

    try {
        const response = await fetch(`${API_BASE}/save-report`, {
            method: 'POST'
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || '保存失败');
        }

        showAlert(`报告保存成功！质量评分: ${result.quality_score.toFixed(1)}`, 'success');
        loadReports();

    } catch (error) {
        console.error('Save report error:', error);
        showAlert(error.message || '保存失败', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '💾 保存质量报告';
    }
}

async function loadReports() {
    try {
        const response = await fetch(`${API_BASE}/reports`);
        const result = await response.json();

        document.getElementById('reportsLoading').classList.remove('show');
        displayReports(result.reports);
    } catch (error) {
        console.error('Load reports error:', error);
        document.getElementById('reportsLoading').classList.remove('show');
    }
}

function displayReports(reports) {
    const list = document.getElementById('reportList');

    if (!reports || reports.length === 0) {
        list.innerHTML = '<li style="padding: 20px; text-align: center; color: #999;">暂无历史报告</li>';
        return;
    }

    list.innerHTML = reports.map(report => `
        <li class="report-item">
            <div class="report-info">
                <h4>${report.station_name} - ${report.filename}</h4>
                <p>创建时间: ${formatDate(report.created_at)} | 卫星数: ${report.num_satellites}</p>
                <p>时间范围: ${formatDate(report.start_time)} - ${formatDate(report.end_time)}</p>
            </div>
            <div style="text-align: right;">
                <span class="quality-score ${getQualityScoreClass(report.overall_quality_score)}">
                    ${(report.overall_quality_score || 0).toFixed(0)} - ${getQualityScoreText(report.overall_quality_score || 0)}
                </span>
                <div style="margin-top: 10px;">
                    <button class="btn btn-primary" style="padding: 6px 15px; font-size: 14px;" 
                            onclick="viewReport(${report.id})">查看详情</button>
                    <button class="btn" style="padding: 6px 15px; font-size: 14px; background: #f44336; color: white;"
                            onclick="deleteReport(${report.id})">删除</button>
                </div>
            </div>
        </li>
    `).join('');
}

async function viewReport(reportId) {
    try {
        const response = await fetch(`${API_BASE}/reports/${reportId}`);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || '获取报告失败');
        }

        alert(`报告详情:\n测站: ${result.report.station_name}\n质量评分: ${result.report.overall_quality_score.toFixed(1)}\n卫星数: ${result.satellite_metrics.length}颗`);
    } catch (error) {
        console.error('View report error:', error);
        showAlert(error.message || '获取报告失败', 'error');
    }
}

async function deleteReport(reportId) {
    if (!confirm('确定要删除此报告吗？')) return;

    try {
        const response = await fetch(`${API_BASE}/reports/${reportId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || '删除失败');
        }

        showAlert('报告已删除', 'success');
        loadReports();
    } catch (error) {
        console.error('Delete report error:', error);
        showAlert(error.message || '删除失败', 'error');
    }
}

window.addEventListener('resize', () => {
    if (skyplotData) {
        updateSkyplot();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    loadReports();
});
