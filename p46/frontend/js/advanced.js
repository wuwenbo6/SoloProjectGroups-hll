const ScenarioAPI = {
    getPresets: () => apiRequest('/api/scenario/presets'),
    getAll: (watershedId) => apiRequest(`/api/scenario/?watershed_id=${watershedId || ''}`),
    create: (data) => apiRequest('/api/scenario/', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    run: (id, data) => apiRequest(`/api/scenario/${id}/run`, {
        method: 'POST',
        body: JSON.stringify(data || {})
    }),
    compare: (scenarioIds) => apiRequest('/api/scenario/compare', {
        method: 'POST',
        body: JSON.stringify({ scenario_ids: scenarioIds })
    }),
    delete: (id) => apiRequest(`/api/scenario/${id}`, { method: 'DELETE' }),
    exportReport: (scenarioIds, format) => {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/api/scenario/report';
        form.target = '_blank';
        const input1 = document.createElement('input');
        input1.type = 'hidden';
        input1.name = 'scenario_ids';
        input1.value = JSON.stringify(scenarioIds);
        form.appendChild(input1);
        const input2 = document.createElement('input');
        input2.type = 'hidden';
        input2.name = 'format';
        input2.value = format;
        form.appendChild(input2);
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
    }
};

const SensitivityAPI = {
    getDefaults: () => apiRequest('/api/sensitivity/defaults'),
    getAll: (watershedId) => apiRequest(`/api/sensitivity/?watershed_id=${watershedId || ''}`),
    create: (data) => apiRequest('/api/sensitivity/', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    run: (id) => apiRequest(`/api/sensitivity/${id}/run`, { method: 'POST' }),
    getStatus: (id) => apiRequest(`/api/sensitivity/${id}/status`),
    getResults: (id) => apiRequest(`/api/sensitivity/${id}/results`),
    exportReport: (id, format) => {
        window.location.href = `/api/sensitivity/${id}/report?format=${format}`;
    }
};

const ReportAPI = {
    getTypes: () => apiRequest('/api/report/types'),
    exportSimulation: (id, format) => {
        window.location.href = `/api/report/simulation/${id}?format=${format}`;
    },
    exportCalibration: (id, format) => {
        window.location.href = `/api/report/calibration/${id}?format=${format}`;
    }
};

let selectedScenarios = [];
let scenarioParamCount = 0;
let sensitivityChart = null;

function showScenarioModal() {
    if (!currentWatershed) {
        alert('请先选择流域');
        return;
    }
    
    loadPresetScenarios();
    scenarioParamCount = 0;
    document.getElementById('scenarioParamList').innerHTML = '';
    addScenarioParam();
    
    const modal = new bootstrap.Modal(document.getElementById('scenarioModal'));
    modal.show();
}

async function loadPresetScenarios() {
    try {
        const presets = await ScenarioAPI.getPresets();
        const container = document.getElementById('presetScenarioList');
        
        container.innerHTML = presets.map(p => `
            <div class="list-group-item">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1">${p.name}</h6>
                        <small class="text-muted">${p.description}</small>
                    </div>
                    <button class="btn btn-sm btn-outline-primary" onclick="applyPresetScenario('${p.id}')">
                        应用
                    </button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Failed to load presets:', e);
    }
}

function addScenarioParam() {
    scenarioParamCount++;
    const container = document.getElementById('scenarioParamList');
    const div = document.createElement('div');
    div.className = 'row mb-2 scenario-param-row';
    div.id = `sp_row_${scenarioParamCount}`;
    div.innerHTML = `
        <div class="col-4">
            <select class="form-select form-select-sm" id="sp_name_${scenarioParamCount}">
                <option value="CN2">CN2</option>
                <option value="SOL_AWC">SOL_AWC</option>
                <option value="ESCO">ESCO</option>
                <option value="GWQMN">GWQMN</option>
                <option value="ALPHA_BF">ALPHA_BF</option>
            </select>
        </div>
        <div class="col-3">
            <input type="number" class="form-control form-control-sm" id="sp_value_${scenarioParamCount}" step="any">
        </div>
        <div class="col-3">
            <select class="form-select form-select-sm" id="sp_type_${scenarioParamCount}">
                <option value="absolute">绝对值</option>
                <option value="relative">相对值(%)</option>
            </select>
        </div>
        <div class="col-2">
            <button class="btn btn-sm btn-outline-danger" onclick="removeScenarioParam(${scenarioParamCount})">
                -
            </button>
        </div>
    `;
    container.appendChild(div);
}

function removeScenarioParam(id) {
    const row = document.getElementById(`sp_row_${id}`);
    if (row) {
        row.remove();
    }
}

async function createScenario() {
    const name = document.getElementById('scenarioName').value;
    if (!name) {
        alert('请输入情景名称');
        return;
    }
    
    const parameters = [];
    document.querySelectorAll('.scenario-param-row').forEach(row => {
        const id = row.id.split('_')[2];
        const p = {
            name: document.getElementById(`sp_name_${id}`).value,
            value: parseFloat(document.getElementById(`sp_value_${id}`).value) || 0,
            change_type: document.getElementById(`sp_type_${id}`).value
        };
        parameters.push(p);
    });
    
    try {
        await ScenarioAPI.create({
            watershed_id: currentWatershed.id,
            name,
            description: document.getElementById('scenarioDescription').value,
            is_baseline: document.getElementById('isBaseline').checked,
            parameters
        });
        
        bootstrap.Modal.getInstance(document.getElementById('scenarioModal')).hide();
        loadScenarios();
        alert('情景创建成功！');
    } catch (e) {
        alert('创建失败: ' + e.message);
    }
}

async function loadScenarios() {
    if (!currentWatershed) return;
    
    try {
        const scenarios = await ScenarioAPI.getAll(currentWatershed.id);
        const container = document.getElementById('scenarioList');
        
        if (scenarios.length === 0) {
            container.innerHTML = '<p class="text-muted">暂无情景，点击"情景管理"创建</p>';
            return;
        }
        
        container.innerHTML = `
            <h6>已创建情景（点击选择用于对比）</h6>
            <div class="list-group">
                ${scenarios.map(s => `
                    <label class="list-group-item scenario-item" data-id="${s.id}">
                        <input class="form-check-input me-2 scenario-checkbox" type="checkbox" 
                               value="${s.id}" onchange="updateScenarioSelection()">
                        <strong>${s.name}</strong>
                        ${s.is_baseline ? '<span class="badge bg-success ms-2">基准</span>' : ''}
                        <small class="d-block text-muted">${s.description || '无描述'}</small>
                    </label>
                `).join('')}
            </div>
            <button class="btn btn-primary mt-3" onclick="compareSelectedScenarios()">
                对比选中情景
            </button>
        `;
    } catch (e) {
        console.error('Failed to load scenarios:', e);
    }
}

function updateScenarioSelection() {
    selectedScenarios = Array.from(document.querySelectorAll('.scenario-checkbox:checked'))
        .map(cb => parseInt(cb.value));
}

async function compareSelectedScenarios() {
    if (selectedScenarios.length < 2) {
        alert('请至少选择2个情景进行对比');
        return;
    }
    
    try {
        const result = await ScenarioAPI.compare(selectedScenarios);
        displayScenarioComparison(result);
    } catch (e) {
        alert('对比失败: ' + e.message);
    }
}

function displayScenarioComparison(result) {
    const container = document.getElementById('scenarioComparison');
    const comparison = result.comparison;
    
    container.innerHTML = `
        <h6>情景对比结果</h6>
        <table class="table table-striped">
            <thead>
                <tr>
                    <th>情景</th>
                    <th>平均径流 (m³/s)</th>
                    <th>泥沙总量 (t)</th>
                    <th>总氮 (kg)</th>
                    <th>总磷 (kg)</th>
                </tr>
            </thead>
            <tbody>
                ${comparison.map(s => `
                    <tr>
                        <td>
                            <strong>${s.scenario_name}</strong>
                            ${s.is_baseline ? '<span class="badge bg-success ms-2">基准</span>' : ''}
                        </td>
                        <td>${s.mean_streamflow.toFixed(2)}</td>
                        <td>${s.total_sediment.toFixed(1)}</td>
                        <td>${s.total_nitrogen.toFixed(1)}</td>
                        <td>${s.total_phosphorus.toFixed(1)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <button class="btn btn-outline-primary" onclick="exportScenarioReport()">
            导出对比报告
        </button>
    `;
    
    document.getElementById('exportScenarioReportBtn').disabled = false;
}

function showSensitivityModal() {
    if (!currentWatershed) {
        alert('请先选择流域');
        return;
    }
    
    loadSensitivityDefaults();
    loadSensitivityAnalyses();
    
    const modal = new bootstrap.Modal(document.getElementById('sensitivityModal'));
    modal.show();
}

async function loadSensitivityDefaults() {
    try {
        const params = await SensitivityAPI.getDefaults();
        const container = document.getElementById('sensitivityParams');
        
        container.innerHTML = params.map((p, i) => `
            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" 
                       id="sens_param_${i}" checked>
                <label class="form-check-label" for="sens_param_${i}">
                    ${p.name}
                </label>
                <div class="row mt-1 ms-3">
                    <div class="col">
                        <input type="number" class="form-control form-control-sm" 
                               id="sens_min_${i}" value="${p.min_value}" step="any"
                               placeholder="最小值">
                    </div>
                    <div class="col">
                        <input type="number" class="form-control form-control-sm" 
                               id="sens_max_${i}" value="${p.max_value}" step="any"
                               placeholder="最大值">
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Failed to load defaults:', e);
    }
}

async function loadSensitivityAnalyses() {
    if (!currentWatershed) return;
    
    try {
        const analyses = await SensitivityAPI.getAll(currentWatershed.id);
        const container = document.getElementById('sensitivityList');
        
        if (analyses.length === 0) {
            container.innerHTML = '<p class="text-muted">暂无敏感度分析，点击上方按钮创建</p>';
            return;
        }
        
        container.innerHTML = `
            <div class="list-group">
                ${analyses.map(a => `
                    <div class="list-group-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-1">${a.name}</h6>
                                <small class="text-muted">
                                    方法: ${a.method} | 变量: ${a.target_variable}
                                </small>
                            </div>
                            <span class="badge bg-${getStatusBadgeColor(a.status)}">
                                ${a.status}
                            </span>
                        </div>
                        ${a.status === 'completed' ? `
                            <button class="btn btn-sm btn-outline-primary mt-2" 
                                    onclick="viewSensitivityResults(${a.id})">
                                查看结果
                            </button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    } catch (e) {
        console.error('Failed to load analyses:', e);
    }
}

function getStatusBadgeColor(status) {
    const colors = {
        'pending': 'secondary',
        'running': 'info',
        'completed': 'success',
        'failed': 'danger'
    };
    return colors[status] || 'secondary';
}

async function startSensitivityAnalysis() {
    const name = document.getElementById('sensitivityName').value;
    const target = document.getElementById('sensitivityTarget').value;
    const nSamples = parseInt(document.getElementById('sensitivitySamples').value);
    const nLevels = parseInt(document.getElementById('sensitivityLevels').value);
    
    const parameters = [];
    const defaults = await SensitivityAPI.getDefaults();
    
    defaults.forEach((p, i) => {
        const checkbox = document.getElementById(`sens_param_${i}`);
        if (checkbox && checkbox.checked) {
            parameters.push({
                name: p.name,
                min_value: parseFloat(document.getElementById(`sens_min_${i}`).value),
                max_value: parseFloat(document.getElementById(`sens_max_${i}`).value)
            });
        }
    });
    
    if (parameters.length === 0) {
        alert('请至少选择一个参数');
        return;
    }
    
    try {
        const analysis = await SensitivityAPI.create({
            watershed_id: currentWatershed.id,
            name,
            method: 'morris',
            target_variable: target,
            n_samples: nSamples,
            n_levels: nLevels,
            parameters
        });
        
        await SensitivityAPI.run(analysis.id);
        
        document.getElementById('startSensitivityBtn').disabled = true;
        document.getElementById('sensitivityProgress').style.display = 'block';
        
        pollSensitivityStatus(analysis.id);
    } catch (e) {
        alert('启动失败: ' + e.message);
    }
}

function pollSensitivityStatus(analysisId) {
    const interval = setInterval(async () => {
        try {
            const status = await SensitivityAPI.getStatus(analysisId);
            
            if (status.status === 'completed') {
                document.getElementById('sensStatus').textContent = '分析完成！';
                document.getElementById('startSensitivityBtn').disabled = false;
                document.getElementById('sensitivityProgress').style.display = 'none';
                clearInterval(interval);
                
                viewSensitivityResults(analysisId);
            } else if (status.status === 'running') {
                document.getElementById('sensStatus').textContent = '分析进行中...';
            } else if (status.status === 'failed') {
                document.getElementById('sensStatus').textContent = `失败: ${status.error_message}`;
                document.getElementById('startSensitivityBtn').disabled = false;
                clearInterval(interval);
            }
        } catch (e) {
            clearInterval(interval);
        }
    }, 2000);
}

async function viewSensitivityResults(analysisId) {
    try {
        const result = await SensitivityAPI.getResults(analysisId);
        displaySensitivityChart(result);
    } catch (e) {
        alert('加载结果失败: ' + e.message);
    }
}

function displaySensitivityChart(result) {
    const chartDom = document.getElementById('sensitivityChart');
    chartDom.style.display = 'block';
    
    if (!sensitivityChart) {
        sensitivityChart = echarts.init(chartDom);
    }
    
    const results = result.results.sort((a, b) => b.mu_star - a.mu_star);
    
    const option = {
        title: {
            text: 'Morris敏感度分析 - μ* vs σ',
            left: 'center'
        },
        tooltip: {
            trigger: 'item',
            formatter: (params) => {
                const r = results[params.dataIndex];
                return `<strong>${r.parameter_name}</strong><br/>
                        μ*: ${r.mu_star.toFixed(4)}<br/>
                        σ: ${r.sigma.toFixed(4)}<br/>
                        排名: ${r.rank}`;
            }
        },
        xAxis: {
            name: 'μ* (总体敏感度)',
            nameLocation: 'middle',
            nameGap: 30
        },
        yAxis: {
            name: 'σ (非线性/交互)',
            nameLocation: 'middle',
            nameGap: 40
        },
        series: [{
            type: 'scatter',
            data: results.map(r => [r.mu_star, r.sigma]),
            symbolSize: 15,
            label: {
                show: true,
                formatter: (params) => results[params.dataIndex].parameter_name,
                position: 'top'
            }
        }]
    };
    
    sensitivityChart.setOption(option);
}

function exportSimulationReport() {
    if (!currentSimulation) {
        alert('请先选择模拟');
        return;
    }
    ReportAPI.exportSimulation(currentSimulation.id, 'html');
}

function exportScenarioReport() {
    if (selectedScenarios.length < 2) {
        alert('请至少选择2个情景');
        return;
    }
    ScenarioAPI.exportReport(selectedScenarios, 'html');
}

function exportCalibrationReport() {
    alert('请在参数校准完成后导出报告');
}

function applyPresetScenario(presetId) {
    const presets = {
        'reforestation': { name: '退耕还林情景', params: [{ name: 'CN2', value: -10, type: 'relative' }] },
        'contour_farming': { name: '等高耕作情景', params: [{ name: 'CN2', value: -5, type: 'relative' }] },
        'fertilizer_reduction': { name: '减肥增效情景', params: [] },
        'irrigation_optimization': { name: '节水灌溉情景', params: [] },
        'baseline': { name: '基准情景', params: [] }
    };
    
    const preset = presets[presetId];
    if (preset) {
        document.getElementById('scenarioName').value = preset.name;
        document.getElementById('scenarioDescription').value = `预设情景: ${preset.name}`;
        document.getElementById('isBaseline').checked = presetId === 'baseline';
        
        document.getElementById('scenarioParamList').innerHTML = '';
        scenarioParamCount = 0;
        
        preset.params.forEach(p => {
            addScenarioParam();
            document.getElementById(`sp_name_${scenarioParamCount}`).value = p.name;
            document.getElementById(`sp_value_${scenarioParamCount}`).value = p.value;
            document.getElementById(`sp_type_${scenarioParamCount}`).value = p.type || 'absolute';
        });
        
        bootstrap.Tab.getInstance(document.getElementById('create-scenario-tab')).show();
    }
}
