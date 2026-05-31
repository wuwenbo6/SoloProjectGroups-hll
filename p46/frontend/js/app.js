let currentWatershed = null;
let currentSimulation = null;
let chart = null;
let simulationParameters = [];

document.addEventListener('DOMContentLoaded', () => {
    loadWatersheds();
    initChart();
});

function initChart() {
    const chartDom = document.getElementById('chartContainer');
    chart = echarts.init(chartDom);
    
    window.addEventListener('resize', () => {
        chart.resize();
    });
}

async function loadWatersheds() {
    try {
        const watersheds = await WatershedAPI.getAll();
        const select = document.getElementById('watershedSelect');
        select.innerHTML = '<option value="">选择流域...</option>';
        
        watersheds.forEach(w => {
            select.innerHTML += `<option value="${w.id}">${w.name}</option>`;
        });
    } catch (error) {
        console.error('Failed to load watersheds:', error);
    }
}

async function selectWatershed() {
    const select = document.getElementById('watershedSelect');
    const watershedId = select.value;
    
    if (!watershedId) {
        currentWatershed = null;
        document.getElementById('simulationList').innerHTML = '<p class="text-muted">请先选择流域</p>';
        clearSubbasinLayers();
        return;
    }
    
    try {
        currentWatershed = await WatershedAPI.get(watershedId);
        const subbasins = await WatershedAPI.getSubbasins(watershedId);
        
        displaySubbasins(subbasins);
        loadSimulations(watershedId);
    } catch (error) {
        console.error('Failed to select watershed:', error);
    }
}

async function loadSimulations(watershedId) {
    try {
        const simulations = await SimulationAPI.getAll(watershedId);
        const listDiv = document.getElementById('simulationList');
        
        if (simulations.length === 0) {
            listDiv.innerHTML = '<p class="text-muted">暂无模拟，请创建新模拟</p>';
            return;
        }
        
        listDiv.innerHTML = '';
        simulations.forEach(sim => {
            const statusClass = `status-${sim.status}`;
            const item = document.createElement('a');
            item.className = 'list-group-item list-group-item-action';
            item.innerHTML = `
                <div class="d-flex w-100 justify-content-between">
                    <h6 class="mb-1">${sim.name}</h6>
                    <span class="status-badge ${statusClass}">${getStatusText(sim.status)}</span>
                </div>
                <small class="text-muted">${new Date(sim.created_at).toLocaleString()}</small>
            `;
            item.onclick = () => selectSimulation(sim.id);
            listDiv.appendChild(item);
        });
    } catch (error) {
        console.error('Failed to load simulations:', error);
    }
}

function getStatusText(status) {
    const statusMap = {
        'pending': '等待中',
        'running': '运行中',
        'completed': '已完成',
        'failed': '失败'
    };
    return statusMap[status] || status;
}

async function selectSimulation(simulationId) {
    try {
        currentSimulation = await SimulationAPI.get(simulationId);
        const params = await SimulationAPI.getParameters(simulationId);
        
        simulationParameters = params;
        displayParameterPanel(params);
        
        document.getElementById('runSimulationBtn').disabled = currentSimulation.status === 'running';
        
        document.querySelectorAll('#simulationList .list-group-item').forEach(item => {
            item.classList.remove('active');
        });
        event.currentTarget.classList.add('active');
        
        if (currentSimulation.status === 'completed') {
            updateTimeseries();
            loadSummary();
        }
        
        if (currentSimulation.status === 'running') {
            pollSimulationStatus(simulationId);
        }
    } catch (error) {
        console.error('Failed to select simulation:', error);
    }
}

function displayParameterPanel(params) {
    const panel = document.getElementById('parameterPanel');
    
    if (params.length === 0) {
        const defaultParams = [
            { name: 'CN2', description: 'SCS曲线数', default_value: 75, min_value: 35, max_value: 95, units: '' },
            { name: 'SOL_AWC', description: '土壤可利用水量', default_value: 0.2, min_value: 0.05, max_value: 0.5, units: 'mm/mm' }
        ];
        
        panel.innerHTML = defaultParams.map(param => createParameterInput(param)).join('');
    } else {
        panel.innerHTML = params.map(param => createParameterInput({
            name: param.parameter_name,
            description: param.parameter_name,
            default_value: param.parameter_value,
            min_value: param.parameter_value * 0.5,
            max_value: param.parameter_value * 1.5,
            units: ''
        })).join('');
    }
}

function createParameterInput(param) {
    const value = param.default_value;
    return `
        <div class="parameter-item">
            <label>${param.name}</label>
            <small class="text-muted d-block mb-2">${param.description}</small>
            <div class="d-flex align-items-center">
                <input type="range" 
                       class="form-range flex-grow-1 me-3" 
                       id="param_${param.name}"
                       min="${param.min_value}" 
                       max="${param.max_value}" 
                       step="${(param.max_value - param.min_value) / 100}"
                       value="${value}"
                       oninput="updateParameterValue('${param.name}', this.value)">
                <span class="parameter-value" id="value_${param.name}">${value.toFixed ? value.toFixed(3) : value}</span>
            </div>
            <small class="text-muted">
                范围: ${param.min_value} - ${param.max_value} ${param.units}
            </small>
        </div>
    `;
}

function updateParameterValue(paramName, value) {
    const valueSpan = document.getElementById(`value_${paramName}`);
    if (valueSpan) {
        valueSpan.textContent = parseFloat(value).toFixed(3);
    }
}

function showWatershedModal() {
    const modal = new bootstrap.Modal(document.getElementById('watershedModal'));
    modal.show();
}

async function createWatershed() {
    const name = document.getElementById('watershedName').value;
    const description = document.getElementById('watershedDesc').value;
    const projectPath = document.getElementById('projectPath').value;
    
    if (!name) {
        alert('请输入流域名称');
        return;
    }
    
    try {
        await WatershedAPI.create({
            name,
            description,
            project_path: projectPath
        });
        
        bootstrap.Modal.getInstance(document.getElementById('watershedModal')).hide();
        loadWatersheds();
        alert('流域创建成功！');
    } catch (error) {
        alert('流域创建失败: ' + error.message);
    }
}

function showSimulationModal() {
    if (!currentWatershed) {
        alert('请先选择流域');
        return;
    }
    const modal = new bootstrap.Modal(document.getElementById('simulationModal'));
    modal.show();
}

async function createSimulation() {
    const name = document.getElementById('simulationName').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const outputInterval = document.getElementById('outputInterval').value;
    
    if (!name) {
        alert('请输入模拟名称');
        return;
    }
    
    try {
        const cn2Value = parseFloat(document.getElementById('param_CN2')?.value || 75);
        const solAwcValue = parseFloat(document.getElementById('param_SOL_AWC')?.value || 0.2);
        
        await SimulationAPI.create({
            watershed_id: currentWatershed.id,
            name,
            start_date: startDate,
            end_date: endDate,
            output_interval: outputInterval,
            parameters: [
                { name: 'CN2', value: cn2Value, change_type: 'absolute' },
                { name: 'SOL_AWC', value: solAwcValue, change_type: 'absolute' }
            ]
        });
        
        bootstrap.Modal.getInstance(document.getElementById('simulationModal')).hide();
        loadSimulations(currentWatershed.id);
        alert('模拟创建成功！');
    } catch (error) {
        alert('模拟创建失败: ' + error.message);
    }
}

async function runSimulation() {
    if (!currentSimulation) {
        alert('请先选择模拟');
        return;
    }
    
    try {
        const params = collectParameters();
        
        await SimulationAPI.run(currentSimulation.id);
        
        document.getElementById('runSimulationBtn').disabled = true;
        document.getElementById('simulationStatus').innerHTML = `
            <div class="text-info">
                <span class="loader"></span>模拟运行中...
            </div>
        `;
        
        pollSimulationStatus(currentSimulation.id);
    } catch (error) {
        alert('启动模拟失败: ' + error.message);
    }
}

function collectParameters() {
    const params = [];
    const inputs = document.querySelectorAll('[id^="param_"]');
    inputs.forEach(input => {
        if (input.type === 'range') {
            const name = input.id.replace('param_', '');
            params.push({
                name,
                value: parseFloat(input.value),
                change_type: 'absolute'
            });
        }
    });
    return params;
}

function pollSimulationStatus(simulationId) {
    const interval = setInterval(async () => {
        try {
            const status = await SimulationAPI.getStatus(simulationId);
            
            const statusDiv = document.getElementById('simulationStatus');
            if (status.status === 'running') {
                statusDiv.innerHTML = `
                    <div class="text-info">
                        <span class="loader"></span>模拟运行中...
                    </div>
                `;
            } else if (status.status === 'completed') {
                statusDiv.innerHTML = '<div class="text-success">模拟完成！</div>';
                document.getElementById('runSimulationBtn').disabled = false;
                clearInterval(interval);
                loadSimulations(currentWatershed.id);
                updateTimeseries();
                loadSummary();
            } else if (status.status === 'failed') {
                statusDiv.innerHTML = `<div class="text-danger">模拟失败: ${status.error_message}</div>`;
                document.getElementById('runSimulationBtn').disabled = false;
                clearInterval(interval);
            }
        } catch (error) {
            console.error('Polling status failed:', error);
            clearInterval(interval);
        }
    }, 2000);
}

async function updateTimeseries() {
    if (!currentSimulation) return;
    
    const variable = document.getElementById('variableSelect').value;
    
    try {
        const data = await ResultsAPI.getTimeseries(currentSimulation.id, variable);
        
        const option = {
            title: {
                text: data.variable_name,
                left: 'center'
            },
            tooltip: {
                trigger: 'axis'
            },
            xAxis: {
                type: 'category',
                data: data.dates,
                axisLabel: {
                    rotate: 45
                }
            },
            yAxis: {
                type: 'value'
            },
            series: [{
                name: data.variable_name,
                type: 'line',
                data: data.values,
                smooth: true,
                lineStyle: {
                    width: 2
                },
                areaStyle: {
                    opacity: 0.3
                }
            }]
        };
        
        chart.setOption(option);
    } catch (error) {
        console.error('Failed to load timeseries:', error);
    }
}

async function loadSummary() {
    if (!currentSimulation) return;
    
    try {
        const summary = await ResultsAPI.getSummary(currentSimulation.id);
        const stats = await ResultsAPI.getStatistics(currentSimulation.id);
        
        const content = document.getElementById('summaryContent');
        content.innerHTML = `
            <h4>${summary.simulation_name} - 结果汇总</h4>
            <p class="text-muted">时间范围: ${summary.start_date} 至 ${summary.end_date} (${summary.n_days} 天)</p>
            
            <div class="row mt-4">
                <div class="col-md-4">
                    <div class="stat-card">
                        <h3>${summary.mean_streamflow.toFixed(2)}</h3>
                        <p>平均径流 (m³/s)</p>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="stat-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                        <h3>${summary.total_sediment.toFixed(2)}</h3>
                        <p>总泥沙产量 (t)</p>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="stat-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
                        <h3>${summary.total_nitrate.toFixed(2)}</h3>
                        <p>总硝氮负荷 (kg)</p>
                    </div>
                </div>
            </div>
            
            <div class="row mt-3">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h6>统计信息</h6>
                        </div>
                        <div class="card-body">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>指标</th>
                                        <th>最小值</th>
                                        <th>最大值</th>
                                        <th>平均值</th>
                                        <th>标准差</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>径流 (m³/s)</td>
                                        <td>${stats.statistics.streamflow.min.toFixed(2)}</td>
                                        <td>${stats.statistics.streamflow.max.toFixed(2)}</td>
                                        <td>${stats.statistics.streamflow.mean.toFixed(2)}</td>
                                        <td>${stats.statistics.streamflow.std.toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                        <td>泥沙 (t)</td>
                                        <td>${stats.statistics.sediment_yield.min.toFixed(2)}</td>
                                        <td>${stats.statistics.sediment_yield.max.toFixed(2)}</td>
                                        <td>${stats.statistics.sediment_yield.mean.toFixed(2)}</td>
                                        <td>${stats.statistics.sediment_yield.std.toFixed(2)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h6>养分负荷</h6>
                        </div>
                        <div class="card-body">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>指标</th>
                                        <th>总量 (kg)</th>
                                        <th>日平均 (kg)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>硝氮</td>
                                        <td>${summary.total_nitrate.toFixed(2)}</td>
                                        <td>${(summary.total_nitrate / summary.n_days).toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                        <td>磷</td>
                                        <td>${summary.total_phosphorus.toFixed(2)}</td>
                                        <td>${(summary.total_phosphorus / summary.n_days).toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                        <td>总氮</td>
                                        <td>${stats.statistics.total_nitrogen.sum.toFixed(2)}</td>
                                        <td>${stats.statistics.total_nitrogen.mean.toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                        <td>总磷</td>
                                        <td>${stats.statistics.total_phosphorus.sum.toFixed(2)}</td>
                                        <td>${stats.statistics.total_phosphorus.mean.toFixed(2)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Failed to load summary:', error);
    }
}

function showCalibrationModal() {
    if (!currentWatershed) {
        alert('请先选择流域');
        return;
    }
    const modal = new bootstrap.Modal(document.getElementById('calibrationModal'));
    modal.show();
}

async function startCalibration() {
    const name = document.getElementById('calibrationName').value;
    const objectiveFunc = document.getElementById('objectiveFunction').value;
    const iterations = parseInt(document.getElementById('totalIterations').value);
    const samples = parseInt(document.getElementById('nSamples').value);
    
    const parameters = [];
    
    if (document.getElementById('param_CN2').checked) {
        parameters.push({
            name: 'CN2',
            min_value: parseFloat(document.getElementById('CN2_min').value),
            max_value: parseFloat(document.getElementById('CN2_max').value),
            change_type: 'relative'
        });
    }
    
    if (document.getElementById('param_SOL_AWC').checked) {
        parameters.push({
            name: 'SOL_AWC',
            min_value: parseFloat(document.getElementById('SOL_AWC_min').value),
            max_value: parseFloat(document.getElementById('SOL_AWC_max').value),
            change_type: 'relative'
        });
    }
    
    if (parameters.length === 0) {
        alert('请至少选择一个待校准参数');
        return;
    }
    
    try {
        const calibration = await CalibrationAPI.create({
            watershed_id: currentWatershed.id,
            name,
            algorithm: 'SUFI2',
            objective_function: objectiveFunc,
            total_iterations: iterations,
            n_samples: samples,
            parameters
        });
        
        await CalibrationAPI.run(calibration.id);
        
        document.getElementById('startCalibrationBtn').disabled = true;
        document.getElementById('calibrationProgress').style.display = 'block';
        
        pollCalibrationStatus(calibration.id);
    } catch (error) {
        alert('启动校准失败: ' + error.message);
    }
}

function pollCalibrationStatus(calibrationId) {
    const interval = setInterval(async () => {
        try {
            const status = await CalibrationAPI.getStatus(calibrationId);
            
            const progress = (status.current_iteration / status.total_iterations) * 100;
            document.getElementById('calibProgressBar').style.width = `${progress}%`;
            document.getElementById('calibStatus').textContent = 
                `迭代 ${status.current_iteration}/${status.total_iterations}`;
            
            if (status.status === 'completed') {
                document.getElementById('calibStatus').textContent = '校准完成！';
                document.getElementById('startCalibrationBtn').disabled = false;
                clearInterval(interval);
                
                const best = await CalibrationAPI.getBest(calibrationId);
                alert(`校准完成！最佳目标函数值: ${best.objective_value.toFixed(4)}`);
            } else if (status.status === 'failed') {
                document.getElementById('calibStatus').textContent = 
                    `校准失败: ${status.error_message}`;
                document.getElementById('startCalibrationBtn').disabled = false;
                clearInterval(interval);
            }
        } catch (error) {
            console.error('Polling calibration status failed:', error);
            clearInterval(interval);
        }
    }, 2000);
}
